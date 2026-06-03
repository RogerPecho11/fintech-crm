import { Router, Response } from 'express';
import { query, queryOne } from '../database/connection';
import { authenticate, authorize } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { AuthenticatedRequest } from '../types';
import { triggerWebhooks } from '../services/webhookService';
import { calculateMerchantScore } from '../services/scoringService';
import { isFinalized } from '../lib/finalized';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(authenticate);

// GET /api/v1/documents/merchant/:merchantId
router.get('/merchant/:merchantId', async (req: AuthenticatedRequest, res: Response) => {
  const docs = await query(
    `SELECT d.*, u.first_name || ' ' || u.last_name as uploaded_by_name,
            vb.first_name || ' ' || vb.last_name as verified_by_name
     FROM documents d
     JOIN users u ON d.uploaded_by = u.id
     LEFT JOIN users vb ON d.verified_by = vb.id
     WHERE d.merchant_id = $1
     ORDER BY d.created_at DESC`,
    [req.params.merchantId]
  );
  res.json(docs);
});

// POST /api/v1/documents/upload
router.post('/upload', upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const user = req.user!;

  const { merchant_id, document_type = 'other', description, name } = req.body;

  if (!merchant_id) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'merchant_id is required' });
  }

  const merchant = await queryOne<any>('SELECT id, status FROM merchants WHERE id = $1', [merchant_id]);
  if (!merchant) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Merchant not found' });
  }

  // ── Regla: comercio finalizado — no se permiten nuevos documentos ─────────
  if (isFinalized(merchant.status)) {
    fs.unlinkSync(req.file.path);
    return res.status(403).json({
      error: 'Este comercio está finalizado. No se pueden subir documentos.',
      code: 'MERCHANT_FINALIZED',
    });
  }

  const [doc] = await query(
    `INSERT INTO documents (merchant_id, uploaded_by, name, original_name, file_path, file_size, mime_type, document_type, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      merchant_id, user.id,
      name || req.file.originalname,
      req.file.originalname,
      req.file.filename,
      req.file.size,
      req.file.mimetype,
      document_type,
      description,
    ]
  );

  await query('UPDATE merchants SET last_activity_at = NOW() WHERE id = $1', [merchant_id]);
  await calculateMerchantScore(merchant_id);
  await triggerWebhooks('document.uploaded', { merchantId: merchant_id, document: doc });

  if (req.io) {
    req.io.to(`merchant:${merchant_id}`).emit('document:uploaded', doc);
  }

  res.status(201).json(doc);
});

// POST /api/v1/documents/generate-cert-pdf — Genera PDF de certificación desde HTML
router.post('/generate-cert-pdf', async (req: AuthenticatedRequest, res: Response) => {
  const { html, merchant_name, env, review_date } = req.body;

  if (!html) return res.status(400).json({ error: 'HTML requerido' });

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=certificacion_${(merchant_name || 'comercio').replace(/\s+/g, '_')}_${env || 'sandbox'}.pdf`);
  doc.pipe(res);

  // Parsear el HTML básico y renderizar como PDF
  // Header
  doc.rect(0, 0, 595, 60).fill('#FC2B5F');
  doc.fontSize(18).fillColor('#FFFFFF').text('Certificación de Integraciones', 40, 18, { align: 'center' });
  doc.fontSize(9).fillColor('#FFFFFF').text('ProntoPaga — Sistema avanzado de certificación digital para APIs', 40, 40, { align: 'center' });
  doc.y = 75;

  // Badge de ambiente
  const envLabel = env === 'sandbox' ? 'Ambiente Sandbox' : 'Ambiente Productivo';
  const envColor = env === 'sandbox' ? '#F59E0B' : '#10B981';
  doc.fontSize(9).fillColor(envColor).text(envLabel, 40, doc.y);
  doc.moveDown(1);

  // Info básica
  doc.fontSize(12).fillColor('#111111').text(merchant_name || 'Sin nombre');
  doc.fontSize(9).fillColor('#6B7280').text(`Fecha de revisión: ${review_date || new Date().toISOString().slice(0, 10)}`);
  doc.moveDown(1);

  // Extraer contenido del HTML y renderizar
  // Parseo simple: extraer los campos del HTML
  const extractFields = (htmlStr: string): { label: string; value: string }[] => {
    const fields: { label: string; value: string }[] = [];
    const regex = /<span class="label">(.*?)<\/span><span class="value">(.*?)<\/span>/g;
    let match;
    while ((match = regex.exec(htmlStr)) !== null) {
      fields.push({ label: match[1], value: match[2] });
    }
    // También extraer checks
    const checkRegex = /<span class="label">(.*?)<\/span><span class="(check|uncheck)">(.*?)<\/span>/g;
    while ((match = checkRegex.exec(htmlStr)) !== null) {
      fields.push({ label: match[1], value: match[3] });
    }
    return fields;
  };

  const fields = extractFields(html);

  // Extraer secciones h2
  const sections = html.split('<h2>').slice(1).map((s: string) => {
    const titleEnd = s.indexOf('</h2>');
    const title = s.slice(0, titleEnd).replace(/<[^>]+>/g, '');
    return title;
  });

  // Renderizar campos
  let currentY = doc.y;
  const startX = 40;

  // Sección separadora
  const drawSection = (title: string) => {
    if (currentY > 720) { doc.addPage(); currentY = 50; }
    doc.moveDown(0.5);
    doc.rect(startX, doc.y, 515, 18).fill('#F9FAFB');
    doc.fontSize(10).fillColor('#374151').text('  ' + title, startX, doc.y + 4);
    doc.y += 24;
    currentY = doc.y;
  };

  // Renderizar los campos
  drawSection('Información Básica');
  fields.forEach(f => {
    if (doc.y > 740) { doc.addPage(); }
    doc.fontSize(8).fillColor('#6B7280').text(f.label, startX, doc.y, { continued: true, width: 200 });
    doc.fillColor('#111827').text('  ' + f.value, { width: 300 });
    doc.moveDown(0.2);
  });

  // Extraer tabla de transacciones
  const txRegex = /<tr>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<\/tr>/g;
  const txMatches: string[][] = [];
  let txMatch;
  while ((txMatch = txRegex.exec(html)) !== null) {
    txMatches.push([txMatch[1], txMatch[2], txMatch[3], txMatch[4], txMatch[5]]);
  }

  if (txMatches.length > 0) {
    drawSection('Transacciones (' + txMatches.length + ')');
    // Header de tabla
    doc.fontSize(7).fillColor('#6B7280');
    doc.text('Tipo', startX, doc.y, { width: 80, continued: true });
    doc.text('Método', { width: 100, continued: true });
    doc.text('Estado', { width: 80, continued: true });
    doc.text('Order ID', { width: 120, continued: true });
    doc.text('UID', { width: 120 });
    doc.moveDown(0.3);

    doc.fontSize(7).fillColor('#111827');
    txMatches.forEach(row => {
      if (doc.y > 740) { doc.addPage(); }
      doc.text(row[0], startX, doc.y, { width: 80, continued: true, lineBreak: false });
      doc.text(row[1], { width: 100, continued: true, lineBreak: false });
      doc.text(row[2], { width: 80, continued: true, lineBreak: false });
      doc.text(row[3], { width: 120, continued: true, lineBreak: false });
      doc.text(row[4], { width: 120, lineBreak: false });
      doc.moveDown(0.8);
    });
  }

  // Extraer comentarios generales
  const commentsMatch = html.match(/<h2>.*?[Cc]omentarios.*?<\/h2>\s*<p>(.*?)<\/p>/);
  if (commentsMatch) {
    drawSection('Comentarios Generales');
    doc.fontSize(9).fillColor('#374151').text(commentsMatch[1] || '—');
  }

  const recsMatch = html.match(/<h2>.*?[Rr]ecomendaciones.*?<\/h2>\s*<p>(.*?)<\/p>/);
  if (recsMatch) {
    drawSection('Recomendaciones');
    doc.fontSize(9).fillColor('#374151').text(recsMatch[1] || '—');
  }

  // Footer
  doc.moveDown(2);
  doc.fontSize(7).fillColor('#9CA3AF').text(
    `Generado por ProntoPaga CRM — ${new Date().toLocaleString('es-PE')}`,
    { align: 'center' }
  );

  doc.end();
});

// PATCH /api/v1/documents/:id/verify
router.patch('/:id/verify', authorize('admin', 'onboarding'), async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const doc = await queryOne('SELECT * FROM documents WHERE id = $1', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const [updated] = await query(
    `UPDATE documents SET is_verified = true, verified_by = $1, verified_at = NOW()
     WHERE id = $2 RETURNING *`,
    [user.id, req.params.id]
  );
  res.json(updated);
});

// DELETE /api/v1/documents/:id
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const doc = await queryOne<any>('SELECT * FROM documents WHERE id = $1', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  if (doc.uploaded_by !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot delete this document' });
  }

  const filePath = path.join(process.env.UPLOAD_DIR || 'uploads', doc.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await query('DELETE FROM documents WHERE id = $1', [req.params.id]);
  res.json({ message: 'Document deleted' });
});

export default router;
