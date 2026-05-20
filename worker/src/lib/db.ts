import type { Apartment, Booking, DateOverride, IcalEvent, IcalSource, Promotion, Season } from "../types";

export async function getApartmentBySlug(db: D1Database, slug: string): Promise<Apartment | null> {
  return (await db.prepare("SELECT * FROM apartments WHERE slug = ?").bind(slug).first<Apartment>()) || null;
}

export async function listApartments(db: D1Database): Promise<Apartment[]> {
  const { results } = await db.prepare("SELECT * FROM apartments ORDER BY base_rate DESC").all<Apartment>();
  return results || [];
}

export async function listSeasons(db: D1Database, apartmentId: number): Promise<Season[]> {
  const { results } = await db
    .prepare("SELECT * FROM seasons WHERE apartment_id IS NULL OR apartment_id = ? ORDER BY priority DESC")
    .bind(apartmentId)
    .all<Season>();
  return results || [];
}

export async function listDateOverrides(
  db: D1Database,
  apartmentId: number,
  from: string,
  to: string
): Promise<DateOverride[]> {
  const { results } = await db
    .prepare("SELECT * FROM date_overrides WHERE apartment_id = ? AND date >= ? AND date < ?")
    .bind(apartmentId, from, to)
    .all<DateOverride>();
  return results || [];
}

export async function listActivePromotions(
  db: D1Database,
  apartmentId: number
): Promise<Promotion[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM promotions WHERE active = 1 AND (apartment_id IS NULL OR apartment_id = ?)"
    )
    .bind(apartmentId)
    .all<Promotion>();
  return results || [];
}

export async function bookingsForApartmentRange(
  db: D1Database,
  apartmentId: number,
  from: string,
  to: string
): Promise<Booking[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM bookings
       WHERE apartment_id = ?
         AND status IN ('pending','confirmed')
         AND NOT (checkout <= ? OR checkin >= ?)`
    )
    .bind(apartmentId, from, to)
    .all<Booking>();
  return results || [];
}

export async function icalEventsForApartmentRange(
  db: D1Database,
  apartmentId: number,
  from: string,
  to: string
): Promise<IcalEvent[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM ical_events
       WHERE apartment_id = ?
         AND NOT (end_date <= ? OR start_date >= ?)`
    )
    .bind(apartmentId, from, to)
    .all<IcalEvent>();
  return results || [];
}

export async function isRangeAvailable(
  db: D1Database,
  apartmentId: number,
  checkin: string,
  checkout: string
): Promise<boolean> {
  const conflictingBooking = await db
    .prepare(
      `SELECT id FROM bookings
       WHERE apartment_id = ?
         AND status IN ('pending','confirmed')
         AND NOT (checkout <= ? OR checkin >= ?)
       LIMIT 1`
    )
    .bind(apartmentId, checkin, checkout)
    .first();
  if (conflictingBooking) return false;

  const conflictingIcal = await db
    .prepare(
      `SELECT id FROM ical_events
       WHERE apartment_id = ?
         AND NOT (end_date <= ? OR start_date >= ?)
       LIMIT 1`
    )
    .bind(apartmentId, checkin, checkout)
    .first();
  return !conflictingIcal;
}

export async function listIcalSources(db: D1Database, apartmentId?: number): Promise<IcalSource[]> {
  if (apartmentId) {
    const { results } = await db
      .prepare("SELECT * FROM ical_sources WHERE apartment_id = ?")
      .bind(apartmentId)
      .all<IcalSource>();
    return results || [];
  }
  const { results } = await db.prepare("SELECT * FROM ical_sources").all<IcalSource>();
  return results || [];
}

export async function audit(
  db: D1Database,
  actor: string,
  action: string,
  entity: string | null,
  entityId: number | null,
  detail: unknown
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO audit_log (actor, action, entity, entity_id, detail_json) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(actor, action, entity, entityId, detail == null ? null : JSON.stringify(detail))
    .run();
}
