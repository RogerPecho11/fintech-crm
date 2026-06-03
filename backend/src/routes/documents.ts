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

// POST /api/v1/documents/generate-cert-pdf — Genera PDF y lo guarda directamente
router.post('/generate-cert-pdf', async (req: AuthenticatedRequest, res: Response) => {
  const { html, merchant_id, merchant_name, env, review_date } = req.body;
  const user = req.user!;

  if (!html || !merchant_id) return res.status(400).json({ error: 'html y merchant_id requeridos' });

  const PDFDocument = require('pdfkit');
  const { v4: uuidv4 } = require('uuid');

  const fileName = `${uuidv4()}.pdf`;
  const uploadDir = process.env.UPLOAD_DIR || 'uploads';
  const filePath = path.join(uploadDir, fileName);

  // Generar PDF y guardarlo en disco
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Header
    doc.rect(0, 0, 595, 60).fill('#FC2B5F');
    doc.fontSize(18).fillColor('#FFFFFF').text('Certificación de Integraciones', 40, 18, { align: 'center' });
    doc.fontSize(9).fillColor('#FFFFFF').text('ProntoPaga — Sistema avanzado de certificación digital', 40, 40, { align: 'center' });
    doc.y = 75;

    // Badge
    const envLabel = env === 'sandbox' ? 'Ambiente Sandbox' : 'Ambiente Productivo';
    const envColor = env === 'sandbox' ? '#F59E0B' : '#10B981';
    doc.fontSize(9).fillColor(envColor).text(envLabel, 40, doc.y);
    doc.moveDown(1);

    // Info
    doc.fontSize(12).fillColor('#111111').text(merchant_name || 'Sin nombre');
    doc.fontSize(9).fillColor('#6B7280').text(`Fecha de revisión: ${review_date || new Date().toISOString().slice(0, 10)}`);
    doc.moveDown(1);

    // Parsear campos
    const fields: { label: string; value: string }[] = [];
    const regex1 = /<span class="label">(.*?)<\/span><span class="value">(.*?)<\/span>/g;
    let m;
    while ((m = regex1.exec(html)) !== null) fields.push({ label: m[1], value: m[2] });
    const regex2 = /<span class="label">(.*?)<\/span><span class="(check|uncheck)">(.*?)<\/span>/g;
    while ((m = regex2.exec(html)) !== null) fields.push({ label: m[1], value: m[3] });

    const startX = 40;
    const drawSection = (title: string) => {
      if (doc.y > 720) doc.addPage();
      doc.moveDown(0.5);
      doc.rect(startX, doc.y, 515, 18).fill('#F9FAFB');
      doc.fontSize(10).fillColor('#374151').text('  ' + title, startX, doc.y + 4);
      doc.y += 24;
    };

    drawSection('Información Básica');
    fields.forEach(f => {
      if (doc.y > 740) doc.addPage();
      doc.fontSize(8).fillColor('#6B7280').text(f.label + ': ', startX, doc.y, { continued: true });
      doc.fillColor('#111827').text(f.value);
      doc.moveDown(0.1);
    });

    // Transacciones
    const txRegex = /<tr>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<\/tr>/g;
    const txRows: string[][] = [];
    let txM;
    while ((txM = txRegex.exec(html)) !== null) txRows.push([txM[1], txM[2], txM[3], txM[4], txM[5]]);

    if (txRows.length > 0) {
      drawSection(`Transacciones (${txRows.length})`);
      doc.fontSize(7).fillColor('#6B7280');
      doc.text('Tipo          Método          Estado          Order ID          UID', startX, doc.y);
      doc.moveDown(0.3);
      doc.fillColor('#111827');
      txRows.forEach(row => {
        if (doc.y > 740) doc.addPage();
        doc.fontSize(7).text(`${row[0]}    ${row[1]}    ${row[2]}    ${row[3]}    ${row[4]}`, startX, doc.y);
        doc.moveDown(0.5);
      });
    }

    // Comentarios
    const commentsMatch = html.match(/<h2>[^<]*[Cc]omentarios[^<]*<\/h2>\s*<p>(.*?)<\/p>/);
    if (commentsMatch && commentsMatch[1] && commentsMatch[1] !== '—') {
      drawSection('Comentarios Generales');
      doc.fontSize(9).fillColor('#374151').text(commentsMatch[1]);
    }
    const recsMatch = html.match(/<h2>[^<]*[Rr]ecomendaciones[^<]*<\/h2>\s*<p>(.*?)<\/p>/);
    if (recsMatch && recsMatch[1]) {
      drawSection('Recomendaciones');
      doc.fontSize(9).fillColor('#374151').text(recsMatch[1]);
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(7).fillColor('#9CA3AF').text(`Generado por ProntoPaga CRM — ${new Date().toLocaleString('es-PE')}`, { align: 'center' });

    doc.end();
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  // Registrar en la base de datos
  const fileStats = fs.statSync(filePath);
  const docName = `Certificación ${env === 'sandbox' ? 'Sandbox' : 'Productivo'} - ${merchant_name}`;

  const [savedDoc] = await query(
    `INSERT INTO documents (merchant_id, uploaded_by, name, original_name, file_path, file_size, mime_type, document_type, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      merchant_id, user.id, docName,
      `certificacion_${(merchant_name || '').replace(/\s+/g, '_')}_${env}.pdf`,
      fileName, fileStats.size, 'application/pdf', 'certification',
      `Certificación ${env === 'sandbox' ? 'Sandbox' : 'Productivo'} - ${review_date}`,
    ]
  );

  // Devolver la URL del archivo para descarga
  res.json({
    message: 'Certificación PDF generada y guardada',
    document: savedDoc,
    downloadUrl: `/uploads/${fileName}`,
  });
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
