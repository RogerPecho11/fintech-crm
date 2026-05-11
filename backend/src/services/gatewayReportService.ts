import nodemailer from 'nodemailer';
import { mysqlQuery } from '../database/mysqlConnection';
import { query } from '../database/connection';

export async function sendDailyGatewayReport(): Promise<void> {
  try {
    // 1. Obtener correos destinatarios
    const configRow = await query('SELECT value FROM app_config WHERE key = $1', ['gateway_report_emails']);
    const emails: string[] = configRow[0]?.value || [];

    if (!emails.length) {
      console.log('[GatewayReport] No hay correos configurados.');
      return;
    }

    // 2. Obtener cambios del día anterior (query simple sin JOINs pesados)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    let changes: any[] = [];
    try {
      changes = await mysqlQuery(
        `SELECT 
          h.id,
          cg.commerce_id,
          h.type as change_type,
          h.created_by as modified_by,
          h.created_at as modified_at
         FROM history_update_commerce_gateway h
         JOIN commerce_gateway cg ON cg.id = h.commerce_gateway_id
         WHERE h.deleted_at IS NULL AND DATE(h.created_at) = ?
         ORDER BY h.created_at DESC
         LIMIT 100`,
        [dateStr]
      );
    } catch (err: any) {
      console.error('[GatewayReport] Error en query MySQL:', err.message);
    }

    // 3. Generar contenido del email
    let htmlBody: string;

    if (changes.length === 0) {
      htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#FC2B5F;padding:16px 24px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;font-size:16px;">ProntoPaga — Reporte Diario de Pasarelas</h2>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #E5E7EB;border-radius:0 0 8px 8px;">
            <p>No se registraron cambios en pasarelas el día <strong>${dateStr}</strong>.</p>
          </div>
        </div>`;
    } else {
      const rows = changes.map(r => `
        <tr>
          <td style="padding:6px 8px;border:1px solid #eee;">${r.commerce_id}</td>
          <td style="padding:6px 8px;border:1px solid #eee;">${r.change_type || '—'}</td>
          <td style="padding:6px 8px;border:1px solid #eee;">${r.modified_by || '—'}</td>
          <td style="padding:6px 8px;border:1px solid #eee;">${new Date(r.modified_at).toLocaleString('es-PE')}</td>
        </tr>`).join('');

      htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
          <div style="background:#FC2B5F;padding:16px 24px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;font-size:16px;">ProntoPaga — Reporte Diario de Pasarelas</h2>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #E5E7EB;border-radius:0 0 8px 8px;">
            <p>Cambios del <strong>${dateStr}</strong>: <strong>${changes.length}</strong> modificaciones.</p>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead><tr style="background:#f9f9f9;">
                <th style="padding:8px;border:1px solid #eee;text-align:left;">Commerce ID</th>
                <th style="padding:8px;border:1px solid #eee;text-align:left;">Tipo Cambio</th>
                <th style="padding:8px;border:1px solid #eee;text-align:left;">Modificado por</th>
                <th style="padding:8px;border:1px solid #eee;text-align:left;">Fecha</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    }

    // 4. Enviar email (conexión SMTP separada de la query MySQL)
    console.log('[GatewayReport] Conectando a SMTP...');
    const transporter = nodemailer.createTransport({
      host: 'gtxm1326.siteground.biz',
      port: 465,
      secure: true,
      auth: {
        user: 'gestion@certificaciones.prontopaga.com',
        pass: 'uf146%4J^9~1',
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
    });

    const info = await transporter.sendMail({
      from: 'gestion@certificaciones.prontopaga.com',
      to: emails.join(', '),
      subject: `[ProntoPaga] Cambios de Pasarelas — ${dateStr}`,
      html: htmlBody,
    });

    console.log(`[GatewayReport] Email enviado: ${info.messageId} a ${emails.join(', ')}`);
  } catch (err: any) {
    console.error('[GatewayReport] Error:', err.message);
  }
}
