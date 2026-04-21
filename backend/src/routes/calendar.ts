import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query, queryOne } from '../database/connection';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticate);

// GET /api/v1/calendar/events
router.get('/events', async (req: AuthenticatedRequest, res: Response) => {
  const { start, end, merchant_id } = req.query as Record<string, string>;
  const user = req.user!;

  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (start) { conditions.push(`e.start_time >= $${idx++}`); params.push(start); }
  if (end) { conditions.push(`e.start_time <= $${idx++}`); params.push(end); }
  if (merchant_id) { conditions.push(`e.merchant_id = $${idx++}`); params.push(merchant_id); }

  // Show events created by user or where user is attendee
  conditions.push(`(e.created_by = $${idx} OR $${idx} = ANY(e.attendees))`);
  params.push(user.id);
  idx++;

  const where = `WHERE ${conditions.join(' AND ')}`;

  const events = await query(
    `SELECT e.*, 
      m.legal_name as merchant_name,
      u.first_name || ' ' || u.last_name as created_by_name
     FROM calendar_events e
     LEFT JOIN merchants m ON e.merchant_id = m.id
     LEFT JOIN users u ON e.created_by = u.id
     ${where}
     ORDER BY e.start_time ASC`,
    params
  );

  res.json(events);
});

// POST /api/v1/calendar/events
router.post('/events', [
  body('title').notEmpty().trim(),
  body('start_time').isISO8601(),
  body('end_time').optional().isISO8601(),
], async (req: AuthenticatedRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const user = req.user!;
  const {
    title, description, merchant_id, start_time, end_time,
    all_day = false, location, attendees = [], reminder_minutes = 30, color = '#3B82F6'
  } = req.body;

  const [event] = await query(
    `INSERT INTO calendar_events 
      (title, description, merchant_id, created_by, start_time, end_time, all_day, location, attendees, reminder_minutes, color)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [title, description, merchant_id || null, user.id, start_time, end_time || null,
     all_day, location, attendees, reminder_minutes, color]
  );

  if (merchant_id) {
    await query('UPDATE merchants SET last_activity_at = NOW() WHERE id = $1', [merchant_id]);
  }

  // Notify attendees
  if (req.io && attendees.length > 0) {
    for (const attendeeId of attendees) {
      if (attendeeId !== user.id) {
        req.io.to(`user:${attendeeId}`).emit('calendar:event_added', event);
      }
    }
  }

  res.status(201).json(event);
});

// PUT /api/v1/calendar/events/:id
router.put('/events/:id', async (req: AuthenticatedRequest, res: Response) => {
  const event = await queryOne('SELECT * FROM calendar_events WHERE id = $1', [req.params.id]);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const user = req.user!;
  if (event.created_by !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot edit this event' });
  }

  const { title, description, start_time, end_time, all_day, location, attendees, reminder_minutes, color } = req.body;
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
  if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
  if (start_time !== undefined) { updates.push(`start_time = $${idx++}`); values.push(start_time); }
  if (end_time !== undefined) { updates.push(`end_time = $${idx++}`); values.push(end_time); }
  if (all_day !== undefined) { updates.push(`all_day = $${idx++}`); values.push(all_day); }
  if (location !== undefined) { updates.push(`location = $${idx++}`); values.push(location); }
  if (attendees !== undefined) { updates.push(`attendees = $${idx++}`); values.push(attendees); }
  if (reminder_minutes !== undefined) { updates.push(`reminder_minutes = $${idx++}`); values.push(reminder_minutes); }
  if (color !== undefined) { updates.push(`color = $${idx++}`); values.push(color); }

  updates.push(`updated_at = NOW()`);
  values.push(req.params.id);

  const [updated] = await query(
    `UPDATE calendar_events SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  res.json(updated);
});

// DELETE /api/v1/calendar/events/:id
router.delete('/events/:id', async (req: AuthenticatedRequest, res: Response) => {
  const event = await queryOne('SELECT * FROM calendar_events WHERE id = $1', [req.params.id]);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const user = req.user!;
  if (event.created_by !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot delete this event' });
  }

  await query('DELETE FROM calendar_events WHERE id = $1', [req.params.id]);
  res.json({ message: 'Event deleted' });
});

export default router;
