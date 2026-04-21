import axios from 'axios';
import crypto from 'crypto';
import { query } from '../database/connection';
import { WebhookEvent } from '../types';

export async function triggerWebhooks(event: WebhookEvent, payload: Record<string, any>): Promise<void> {
  const webhooks = await query(
    `SELECT * FROM webhook_configs WHERE is_active = true AND $1 = ANY(events)`,
    [event]
  );

  const promises = webhooks.map(webhook => sendWebhook(webhook, event, payload));
  await Promise.allSettled(promises);
}

async function sendWebhook(
  webhook: any,
  event: WebhookEvent,
  payload: Record<string, any>
): Promise<void> {
  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': event,
    'X-Webhook-Timestamp': Date.now().toString(),
  };

  if (webhook.secret) {
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');
    headers['X-Webhook-Signature'] = `sha256=${signature}`;
  }

  let success = false;
  let responseStatus: number | undefined;
  let responseBody: string | undefined;

  try {
    const response = await axios.post(webhook.url, body, {
      headers,
      timeout: 10000,
    });
    success = response.status >= 200 && response.status < 300;
    responseStatus = response.status;
    responseBody = JSON.stringify(response.data).substring(0, 1000);
  } catch (error: any) {
    responseStatus = error.response?.status;
    responseBody = error.message;
  }

  await query(
    `INSERT INTO webhook_logs (webhook_id, event, payload, response_status, response_body, success)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [webhook.id, event, payload, responseStatus, responseBody, success]
  );
}
