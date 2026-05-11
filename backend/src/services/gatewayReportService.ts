import nodemailer from 'nodemailer';
import { mysqlQuery } from '../database/mysqlConnection';
import { query } from '../database/connection';

export async function sendDailyGatewayReport(): Promise<void> {
  try {
    // Obtener correos destinatarios desde app_config
    const configRow = await query('SELECT value FROM app_config WHERE key = $1', ['gateway_report_emails']);
    const emails: string[] = configRow[0]?.value || [];

    if (!emails.length) {
      console.log('[GatewayReport] No hay correos configurados, saltando envío.');
      return;
    }

    // Obtener cambios del día anterior
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    const changes = await mysqlQuery(
      `SELECT 
        c.id as commerce_id,
        c.name as commerce_name,
        c.country as commerce_country,
        'Pay In' as flow_type,
        gp.name as gateway_name,
        h.type as change_type,
        h.created_by as modified_by,
        h.created_at as modified_at
       FROM history_update_commerce_gateway h
       JOIN commerce_gateway cg ON cg.id = h.commerce_gateway_id
       JOIN commerce c ON c.id = cg.commerce_id
       LEFT JOIN gateway_payment gp ON gp.id = cg.gateway_payment_id
       WHERE h.deleted_at IS NULL AND DATE(h.created_at) = ?
       
       UNION ALL
       
       SELECT 
        c.id as commerce_id,
        c.name as commerce_name,
        c.country as commerce_country,
        'Pay Out' as flow_type,
        gw.name as gateway_name,
        hw.type as change_type,
        hw.created_by as modified_by,
        hw.created_at as modified_at
       FROM history_update_commerce_gwithdrawal hw
       JOIN commerce_gateway_withdrawal cgw ON cgw.id = hw.commerce_gateway_withdrawal_id
       JOIN commerce c ON c.id = cgw.commerce_id
       LEFT JOIN gateway_withdrawal gw ON gw.id = cgw.gateway_withdrawal_id
       WHERE hw.deleted_at IS NULL AND DATE(hw.created_at) = ?
       
       ORDER BY modified_at DESC`,
      [dateStr, dateStr]
    );

    if (!changes.length) {
      // En vez de saltar, enviar email informando que no hubo cambios
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'gtxm1326.siteground.biz',
        port: parseInt(process.env.SMTP_PORT || '465'),
        secure: true,
        auth: {
          user: process.env.SMTP_USER || 'gestion@certificaciones.prontopaga.com',
          pass: process.env.SMTP_PASS || 'uf146%4J^9~1',
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'gestion@certificaciones.prontopaga.com',
        to: emails.join(', '),
        subject: `[ProntoPaga] Cambios de Pasarelas — ${dateStr} (Sin cambios)`,
        html: `
          <div style="font-family:'Inter',sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#FC2B5F;padding:16px 24px;border-radius:8px 8px 0 0;">
              <h2 style="color:white;margin:0;font-size:18px;">ProntoPaga — Reporte Diario de Pasarelas</h2>
            </div>
            <div style="background:#fff;padding:24px;border:1px solid #E5E7EB;border-radius:0 0 8px 8px;">
              <p>No se registraron cambios en pasarelas el día <strong>${dateStr}</strong>.</p>
            </div>
          </div>
        `,
      });

      console.log(`[GatewayReport] Sin cambios para ${dateStr}, email informativo enviado.`);
      return;
    }

    // Generar HTML del email
    const tableRows = (changes as any[]).map(row => `
      <tr>
        <td style="padding:8px;border:1px solid #E5E7EB;">${row.commerce_id}</td>
        <td style="padding:8px;border:1px solid #E5E7EB;">${row.commerce_name}</td>
        <td style="padding:8px;border:1px solid #E5E7EB;">${row.commerce_country || '—'}</td>
        <td style="padding:8px;border:1px solid #E5E7EB;color:${row.flow_type === 'Pay In' ? '#3B82F6' : '#8B5CF6'};font-weight:bold;">${row.flow_type}</td>
        <td style="padding:8px;border:1px solid #E5E7EB;">${row.gateway_name || '—'}</td>
        <td style="padding:8px;border:1px solid #E5E7EB;">${row.change_type || '—'}</td>
        <td style="padding:8px;border:1px solid #E5E7EB;">${row.modified_by || '—'}</td>
        <td style="padding:8px;border:1px solid #E5E7EB;">${new Date(row.modified_at).toLocaleString('es-PE')}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family:'Inter',sans-serif;max-width:900px;margin:0 auto;">
        <div style="background:#FC2B5F;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:white;margin:0;font-size:18px;">ProntoPaga — Reporte Diario de Cambios en Pasarelas</h2>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;">
          <p style="color:#374151;">Cambios realizados el <strong>${dateStr}</strong>:</p>
          <p style="color:#6B7280;font-size:13px;">Total de cambios: <strong>${changes.length}</strong></p>
          <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:16px;">
            <thead>
              <tr style="background:#F9FAFB;">
                <th style="padding:8px;border:1px solid #E5E7EB;text-align:left;">ID</th>
                <th style="padding:8px;border:1px solid #E5E7EB;text-align:left;">Comercio</th>
                <th style="padding:8px;border:1px solid #E5E7EB;text-align:left;">País</th>
                <th style="padding:8px;border:1px solid #E5E7EB;text-align:left;">Flujo</th>
                <th style="padding:8px;border:1px solid #E5E7EB;text-align:left;">Pasarela</th>
                <th style="padding:8px;border:1px solid #E5E7EB;text-align:left;">Tipo Cambio</th>
                <th style="padding:8px;border:1px solid #E5E7EB;text-align:left;">Modificado por</th>
                <th style="padding:8px;border:1px solid #E5E7EB;text-align:left;">Fecha</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <p style="color:#9CA3AF;font-size:11px;margin-top:24px;">
            Este es un mensaje automático del CRM ProntoPaga. No responder a este correo.
          </p>
        </div>
      </div>
    `;

    // Enviar email
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'gtxm1326.siteground.biz',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true,
      auth: {
        user: process.env.SMTP_USER || 'gestion@certificaciones.prontopaga.com',
        pass: process.env.SMTP_PASS || 'uf146%4J^9~1',
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: emails.join(', '),
      subject: `[ProntoPaga] Cambios de Pasarelas — ${dateStr}`,
      html,
    });

    console.log(`[GatewayReport] Reporte enviado a ${emails.length} destinatarios (${changes.length} cambios).`);
  } catch (err: any) {
    console.error('[GatewayReport] Error:', err.message);
  }
}
