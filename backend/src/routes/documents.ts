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

    const startX = 40;
    const pageWidth = 515;

    // ─── Header ───
    doc.rect(0, 0, 595, 65).fill('#FC2B5F');
    doc.fontSize(20).fillColor('#FFFFFF').text('Certificación de Integraciones', 40, 15, { align: 'center' });
    doc.fontSize(9).fillColor('#FFFFFF').text('ProntoPaga — Sistema avanzado de certificación digital', 40, 42, { align: 'center' });
    doc.y = 80;

    // Badge ambiente
    const envLabel = env === 'sandbox' ? '🟡 Ambiente Sandbox' : '🟢 Ambiente Productivo';
    doc.fontSize(10).fillColor(env === 'sandbox' ? '#92400E' : '#065F46').text(envLabel, startX);
    doc.moveDown(0.8);

    // Info comercio
    doc.fontSize(14).fillColor('#111111').text(merchant_name || 'Sin nombre');
    doc.fontSize(9).fillColor('#6B7280').text(`Fecha de revisión: ${review_date || new Date().toISOString().slice(0, 10)}`);
    doc.moveDown(0.5);
    doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).strokeColor('#E5E7EB').lineWidth(1).stroke();
    doc.moveDown(0.8);

    // ─── Función para dibujar sección ───
    const drawSection = (title: string) => {
      if (doc.y > 700) doc.addPage();
      doc.moveDown(0.5);
      doc.rect(startX, doc.y, pageWidth, 20).fill('#F3F4F6');
      doc.fontSize(10).fillColor('#1F2937').text('  ' + title, startX, doc.y + 5);
      doc.y += 26;
    };

    // ─── Función para campo ───
    const drawField = (label: string, value: string) => {
      if (doc.y > 750) doc.addPage();
      doc.fontSize(8).fillColor('#6B7280').text(label, startX, doc.y, { width: 180, lineBreak: false });
      doc.fillColor('#111827').text(value || '—', startX + 185, doc.y, { width: 330 });
      doc.moveDown(0.6);
    };

    // ─── Parsear HTML ───
    // Extraer campos con regex
    const getFieldValue = (labelSearch: string): string => {
      const regex = new RegExp(`<span class="label">${labelSearch}</span><span class="(?:value|check|uncheck)">(.*?)</span>`);
      const match = html.match(regex);
      return match ? match[1] : '';
    };

    // Extraer todos los campos div.field
    const fieldRegex = /<div class="field"><span class="label">(.*?)<\/span><span class="(?:value|check|uncheck)">(.*?)<\/span><\/div>/g;
    const allFields: { label: string; value: string }[] = [];
    let fm;
    while ((fm = fieldRegex.exec(html)) !== null) {
      allFields.push({ label: fm[1], value: fm[2] });
    }

    // Extraer secciones h2
    const h2Regex = /<h2>(.*?)<\/h2>/g;
    const sections: string[] = [];
    let h2m;
    while ((h2m = h2Regex.exec(html)) !== null) {
      sections.push(h2m[1].replace(/<[^>]+>/g, ''));
    }

    // ─── Información Básica ───
    drawSection('Información Básica');
    // Buscar campos específicos
    const basicFields = allFields.slice(0, allFields.findIndex(f => 
      f.label.toLowerCase().includes('min') || f.label.toLowerCase().includes('límite') || f.label.toLowerCase().includes('limit')
    ) || allFields.length);
    
    if (basicFields.length > 0) {
      basicFields.forEach(f => drawField(f.label, f.value));
    } else {
      // Fallback: mostrar todos los campos
      allFields.forEach(f => drawField(f.label, f.value));
    }

    // ─── Límites (si hay) ───
    const limitFields = allFields.filter(f => 
      f.label.toLowerCase().includes('min') || f.label.toLowerCase().includes('max') || 
      f.label.toLowerCase().includes('limit') || f.label.toLowerCase().includes('límite') ||
      f.label.toLowerCase().includes('daily') || f.label.toLowerCase().includes('monthly')
    );
    if (limitFields.length > 0) {
      drawSection('Límites');
      limitFields.forEach(f => drawField(f.label, f.value));
    }

    // ─── Métodos de Pago / UX / Rendimiento ───
    const paymentFields = allFields.filter(f => 
      f.label.toLowerCase().includes('visib') || f.label.toLowerCase().includes('avail') ||
      f.label.toLowerCase().includes('logo') || f.label.toLowerCase().includes('mobile') ||
      f.label.toLowerCase().includes('compat')
    );
    if (paymentFields.length > 0) {
      drawSection('Métodos de Pago');
      paymentFields.forEach(f => drawField(f.label, f.value));
    }

    const uxFields = allFields.filter(f => 
      f.label.toLowerCase().includes('redirect') || f.label.toLowerCase().includes('error') ||
      f.label.toLowerCase().includes('success') || f.label.toLowerCase().includes('responsive')
    );
    if (uxFields.length > 0) {
      drawSection('UX');
      uxFields.forEach(f => drawField(f.label, f.value));
    }

    const perfFields = allFields.filter(f => 
      f.label.toLowerCase().includes('response') || f.label.toLowerCase().includes('timeout') ||
      f.label.toLowerCase().includes('retry')
    );
    if (perfFields.length > 0) {
      drawSection('Rendimiento');
      perfFields.forEach(f => drawField(f.label, f.value));
    }

    // ─── Transacciones ───
    const txRegex2 = /<tr>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<\/tr>/g;
    const txRows: string[][] = [];
    let txM;
    while ((txM = txRegex2.exec(html)) !== null) txRows.push([txM[1], txM[2], txM[3], txM[4], txM[5]]);

    if (txRows.length > 0) {
      drawSection(`Transacciones (${txRows.length})`);
      
      // Header tabla
      const colWidths = [60, 100, 70, 130, 155];
      const headers = ['Tipo', 'Método', 'Estado', 'Order ID', 'UID'];
      let tx = startX;
      doc.fontSize(7).fillColor('#6B7280');
      headers.forEach((h, i) => { doc.text(h, tx, doc.y, { width: colWidths[i], lineBreak: false }); tx += colWidths[i]; });
      doc.moveDown(0.5);
      doc.moveTo(startX, doc.y).lineTo(startX + pageWidth, doc.y).strokeColor('#E5E7EB').stroke();
      doc.moveDown(0.3);

      doc.fontSize(7).fillColor('#111827');
      txRows.forEach((row, idx) => {
        if (doc.y > 740) doc.addPage();
        if (idx % 2 === 0) doc.rect(startX, doc.y - 2, pageWidth, 12).fill('#F9FAFB');
        let x = startX;
        row.forEach((cell, i) => {
          doc.fillColor('#111827').text(cell || '—', x, doc.y, { width: colWidths[i], lineBreak: false });
          x += colWidths[i];
        });
        doc.moveDown(0.7);
      });
    }

    // ─── Comentarios ───
    const commentsMatch = html.match(/<h2>[^<]*[Cc]omentarios[^<]*<\/h2>\s*<p>(.*?)<\/p>/s);
    if (commentsMatch && commentsMatch[1] && commentsMatch[1] !== '—') {
      drawSection('Comentarios Generales');
      doc.fontSize(9).fillColor('#374151').text(commentsMatch[1], startX, doc.y, { width: pageWidth });
      doc.moveDown(0.5);
    }

    const recsMatch = html.match(/<h2>[^<]*[Rr]ecomendaciones[^<]*<\/h2>\s*<p>(.*?)<\/p>/s);
    if (recsMatch && recsMatch[1]) {
      drawSection('Recomendaciones');
      doc.fontSize(9).fillColor('#374151').text(recsMatch[1], startX, doc.y, { width: pageWidth });
    }

    // ─── Imágenes (extraer base64 del HTML) ───
    const imgRegex = /<img[^>]+src="(data:image\/[^"]+)"[^>]*>/g;
    const images: string[] = [];
    let imgM;
    while ((imgM = imgRegex.exec(html)) !== null) images.push(imgM[1]);

    if (images.length > 0) {
      drawSection(`Evidencias (${images.length} imágenes)`);
      let imgX = startX;
      let imgCount = 0;
      for (const imgSrc of images) {
        try {
          if (doc.y > 600) { doc.addPage(); imgX = startX; }
          // Convertir base64 a buffer
          const base64Data = imgSrc.split(',')[1];
          if (base64Data) {
            const imgBuffer = Buffer.from(base64Data, 'base64');
            doc.image(imgBuffer, imgX, doc.y, { width: 150, height: 100 });
            imgX += 160;
            imgCount++;
            if (imgCount % 3 === 0) { doc.y += 110; imgX = startX; }
          }
        } catch { /* ignorar imagen con error */ }
      }
      if (imgCount % 3 !== 0) doc.y += 110;
    }

    // ─── Footer ───
    doc.moveDown(2);
    doc.fontSize(7).fillColor('#9CA3AF').text(
      `Generado por ProntoPaga CRM — ${new Date().toLocaleString('es-PE')}`,
      startX, doc.y, { align: 'center', width: pageWidth }
    );

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
