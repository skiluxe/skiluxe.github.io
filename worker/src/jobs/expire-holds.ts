import type { Env } from "../types";
import { audit } from "../lib/db";

export async function expireHolds(env: Env): Promise<{ expired: number }> {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT id FROM bookings WHERE status = 'pending' AND hold_expires_at IS NOT NULL AND hold_expires_at < ?"
  ).bind(now).all<{ id: number }>();

  const ids = (results || []).map((r) => r.id);
  if (ids.length === 0) return { expired: 0 };

  await env.DB.prepare(
    `UPDATE bookings SET status = 'expired', cancelled_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`
  ).bind(now, ...ids).run();

  for (const id of ids) {
    await audit(env.DB, "system", "booking.expire", "bookings", id, null);
  }
  return { expired: ids.length };
}
