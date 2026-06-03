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

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const X = 40;
    const W = 515;

    // ─── Header ───
    doc.rect(0, 0, 595, 60).fill('#FC2B5F');
    doc.fontSize(18).fillColor('#FFFFFF').text('Certificacion de Integraciones', X, 15, { align: 'center' });
    doc.fontSize(9).text('ProntoPaga - Sistema avanzado de certificacion digital', X, 38, { align: 'center' });
    doc.y = 72;

    // Badge
    const badge = env === 'sandbox' ? 'SANDBOX' : 'PRODUCTIVO';
    const badgeColor = env === 'sandbox' ? '#F59E0B' : '#10B981';
    doc.fontSize(9).fillColor(badgeColor).text(`[ ${badge} ]`, X);
    doc.moveDown(0.5);

    // Comercio
    doc.fontSize(13).fillColor('#111111').text(merchant_name || 'Sin nombre');
    doc.fontSize(9).fillColor('#6B7280').text(`Fecha de revision: ${review_date || ''}`);
    doc.moveDown(0.5);
    doc.moveTo(X, doc.y).lineTo(X + W, doc.y).strokeColor('#D1D5DB').lineWidth(0.5).stroke();
    doc.moveDown(0.8);

    // ─── Helpers ───
    const section = (title: string) => {
      if (doc.y > 710) doc.addPage();
      doc.moveDown(0.4);
      doc.rect(X, doc.y, W, 18).fill('#F3F4F6');
      doc.fontSize(9).fillColor('#111827').text('  ' + title, X, doc.y + 5, { lineBreak: false });
      doc.y += 22;
    };

    const field = (label: string, value: string) => {
      if (doc.y > 750) doc.addPage();
      const y = doc.y;
      doc.fontSize(8).fillColor('#6B7280').text(label, X, y, { width: 160, lineBreak: false });
      // Convertir checks
      let displayVal = value || '-';
      if (displayVal === '\u2705' || displayVal === '✅') displayVal = 'Si';
      else if (displayVal === '\u274C' || displayVal === '❌') displayVal = 'No';
      const valColor = displayVal === 'Si' ? '#059669' : displayVal === 'No' ? '#DC2626' : '#111827';
      doc.fontSize(8).fillColor(valColor).text(displayVal, X + 170, y, { width: 340, lineBreak: false });
      doc.y = y + 14;
    };

    // ─── Parsear HTML ───
    const allFields: { label: string; value: string }[] = [];
    const fRegex = /<div class="field"><span class="label">(.*?)<\/span><span class="(?:value|check|uncheck)">(.*?)<\/span><\/div>/g;
    let fm;
    while ((fm = fRegex.exec(html)) !== null) allFields.push({ label: fm[1], value: fm[2] });

    // Separar en secciones por posición
    // Los primeros campos son info básica (hasta encontrar montos/limits)
    const limitIdx = allFields.findIndex(f => /min|max|daily|monthly|limit/i.test(f.label));
    const basicEnd = limitIdx > 0 ? limitIdx : 7;

    const basicFields = allFields.slice(0, basicEnd);
    const limitFields = allFields.filter(f => /min|max|daily|monthly|limit/i.test(f.label));
    const payFields = allFields.filter(f => /visib|availab|logos|mobile comp/i.test(f.label));
    const uxFields = allFields.filter(f => /redirect|error.*hand|success.*page|mobile.*respon/i.test(f.label));
    const perfFields = allFields.filter(f => /response|timeout|retry/i.test(f.label));

    // ─── Secciones ───
    section('Informacion Basica');
    basicFields.forEach(f => field(f.label, f.value));

    if (limitFields.length > 0) {
      section('Limites');
      limitFields.forEach(f => field(f.label, f.value));
    }

    if (payFields.length > 0) {
      section('Metodos de Pago');
      payFields.forEach(f => field(f.label, f.value));
    }

    if (uxFields.length > 0) {
      section('UX');
      uxFields.forEach(f => field(f.label, f.value));
    }

    if (perfFields.length > 0) {
      section('Rendimiento');
      perfFields.forEach(f => field(f.label, f.value));
    }

    // ─── Transacciones ───
    const txRegex2 = /<tr>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<\/tr>/g;
    const txRows: string[][] = [];
    let txM;
    while ((txM = txRegex2.exec(html)) !== null) txRows.push([txM[1], txM[2], txM[3], txM[4], txM[5]]);

    if (txRows.length > 0) {
      section(`Transacciones (${txRows.length})`);

      // Posiciones fijas de columnas
      const cols = [X, X + 55, X + 160, X + 240, X + 320];
      const colW = [55, 105, 80, 80, 195];

      // Header
      doc.fontSize(7).fillColor('#6B7280');
      ['Tipo', 'Metodo', 'Estado', 'Order ID', 'UID'].forEach((h, i) => {
        doc.text(h, cols[i], doc.y, { width: colW[i], lineBreak: false });
      });
      doc.y += 12;
      doc.moveTo(X, doc.y).lineTo(X + W, doc.y).strokeColor('#E5E7EB').stroke();
      doc.y += 4;

      // Filas
      txRows.forEach((row, idx) => {
        if (doc.y > 740) doc.addPage();
        const y = doc.y;
        if (idx % 2 === 0) doc.rect(X, y - 2, W, 13).fill('#F9FAFB');
        doc.fontSize(7).fillColor('#111827');
        row.forEach((cell, i) => {
          doc.text(cell || '-', cols[i], y, { width: colW[i], lineBreak: false });
        });
        doc.y = y + 14;
      });
    }

    // ─── Comentarios ───
    const commMatch = html.match(/<h2>[^<]*[Cc]omentarios[^<]*<\/h2>\s*<p>([\s\S]*?)<\/p>/);
    if (commMatch && commMatch[1] && commMatch[1].trim() !== '-' && commMatch[1].trim() !== '') {
      section('Comentarios Generales');
      doc.fontSize(8).fillColor('#374151').text(commMatch[1].trim(), X, doc.y, { width: W });
      doc.moveDown(0.5);
    }

    const recMatch = html.match(/<h2>[^<]*[Rr]ecomendaciones[^<]*<\/h2>\s*<p>([\s\S]*?)<\/p>/);
    if (recMatch && recMatch[1] && recMatch[1].trim() !== '') {
      section('Recomendaciones');
      doc.fontSize(8).fillColor('#374151').text(recMatch[1].trim(), X, doc.y, { width: W });
    }

    // ─── Imagenes ───
    const imgRegex = /<img[^>]+src="(data:image\/[^"]+)"[^>]*>/g;
    const images: string[] = [];
    let imgM;
    while ((imgM = imgRegex.exec(html)) !== null) images.push(imgM[1]);

    if (images.length > 0) {
      section(`Evidencias (${images.length} imagenes)`);
      let imgX = X;
      let imgRow = 0;
      for (const src of images) {
        try {
          if (doc.y > 580) { doc.addPage(); imgX = X; }
          const b64 = src.split(',')[1];
          if (b64) {
            const buf = Buffer.from(b64, 'base64');
            doc.image(buf, imgX, doc.y, { width: 160, height: 110 });
            imgX += 170;
            imgRow++;
            if (imgRow % 3 === 0) { doc.y += 120; imgX = X; }
          }
        } catch { /* skip */ }
      }
      if (imgRow % 3 !== 0) doc.y += 120;
    }

    // Footer
    doc.moveDown(1);
    doc.fontSize(7).fillColor('#9CA3AF').text(
      `Generado por ProntoPaga CRM - ${new Date().toLocaleString('es-PE')}`, X, doc.y, { align: 'center', width: W }
    );

    doc.end();
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  // Registrar en BD
  const fileStats = fs.statSync(filePath);
  const docName = `Certificacion ${env === 'sandbox' ? 'Sandbox' : 'Productivo'} - ${merchant_name}`;

  const [savedDoc] = await query(
    `INSERT INTO documents (merchant_id, uploaded_by, name, original_name, file_path, file_size, mime_type, document_type, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      merchant_id, user.id, docName,
      `certificacion_${(merchant_name || '').replace(/\s+/g, '_')}_${env}.pdf`,
      fileName, fileStats.size, 'application/pdf', 'certification',
      `Certificacion ${env === 'sandbox' ? 'Sandbox' : 'Productivo'} - ${review_date}`,
    ]
  );

  res.json({ message: 'Certificacion PDF generada', document: savedDoc, downloadUrl: `/uploads/${fileName}` });
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
