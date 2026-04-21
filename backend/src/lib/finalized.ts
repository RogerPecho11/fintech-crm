/**
 * Centralized list of statuses that lock a merchant (no more edits/comments/docs).
 * Uses trim + lowercase comparison to be resilient against trailing chars.
 */
export const FINALIZED_STATUSES = ['finalizado', 'certified', 'inactive', 'rejected'];

export function isFinalized(status: string): boolean {
  return FINALIZED_STATUSES.includes((status || '').trim().toLowerCase());
}
