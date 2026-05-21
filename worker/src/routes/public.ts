import { Hono } from "hono";
import { z } from "zod";
import type { Env, Apartment, Booking } from "../types";
import {
  getApartmentBySlug,
  listApartments,
  listSeasons,
  listDateOverrides,
  listActivePromotions,
  bookingsForApartmentRange,
  icalEventsForApartmentRange,
  isRangeAvailable,
  audit,
} from "../lib/db";
import { quote as buildQuote, nightsBetween, ymd } from "../lib/pricing";
import { BookingInput, QuoteInput } from "../lib/validate";
import { bookingGuestEmail, bookingOwnerEmail, sendEmail, sendWhatsApp } from "../lib/notify";
import { signToken } from "../lib/auth";

export const publicRoutes = new Hono<{ Bindings: Env }>();

publicRoutes.get("/apartments", async (c) => {
  const apartments = await listApartments(c.env.DB);
  return c.json({
    apartments: apartments.map((a) => ({
      slug: a.slug,
      complex: a.complex,
      unit_label: a.unit_label,
      bedrooms: a.bedrooms,
      max_guests: a.max_guests,
      area_sqm: a.area_sqm,
      base_rate: a.base_rate,
      currency: a.currency,
      amenities: parseJson(a.amenities_json) || [],
    })),
  });
});

publicRoutes.get("/apartments/:slug", async (c) => {
  const slug = c.req.param("slug");
  const apt = await getApartmentBySlug(c.env.DB, slug);
  if (!apt) return c.json({ error: "not_found" }, 404);
  return c.json({
    slug: apt.slug,
    complex: apt.complex,
    unit_label: apt.unit_label,
    bedrooms: apt.bedrooms,
    max_guests: apt.max_guests,
    area_sqm: apt.area_sqm,
    base_rate: apt.base_rate,
    currency: apt.currency,
    amenities: parseJson(apt.amenities_json) || [],
  });
});

publicRoutes.get("/apartments/:slug/availability", async (c) => {
  const slug = c.req.param("slug");
  const fromQ = c.req.query("from");
  const toQ = c.req.query("to");
  const today = new Date();
  const defaultFrom = ymd(new Date(today.getFullYear(), today.getMonth(), 1));
  const defaultTo = ymd(new Date(today.getFullYear(), today.getMonth() + 6, 0));
  const from = (fromQ && /^\d{4}-\d{2}-\d{2}$/.test(fromQ)) ? fromQ : defaultFrom;
  const to = (toQ && /^\d{4}-\d{2}-\d{2}$/.test(toQ)) ? toQ : defaultTo;

  const apt = await getApartmentBySlug(c.env.DB, slug);
  if (!apt) return c.json({ error: "not_found" }, 404);

  const [bookings, icalEvents] = await Promise.all([
    bookingsForApartmentRange(c.env.DB, apt.id, from, to),
    icalEventsForApartmentRange(c.env.DB, apt.id, from, to),
  ]);

  const statusByDate: Record<string, "available" | "pending" | "blocked"> = {};
  const setRange = (start: string, end: string, status: "pending" | "blocked") => {
    let cur = new Date(start + "T00:00:00Z");
    const stopAt = new Date(end + "T00:00:00Z").getTime();
    while (cur.getTime() < stopAt) {
      const key = cur.toISOString().slice(0, 10);
      if (key >= from && key < to) {
        if (status === "blocked") statusByDate[key] = "blocked";
        else if (statusByDate[key] !== "blocked") statusByDate[key] = "pending";
      }
      cur = new Date(cur.getTime() + 86400000);
    }
  };

  for (const b of bookings) {
    setRange(b.checkin, b.checkout, b.status === "confirmed" ? "blocked" : "pending");
  }
  for (const e of icalEvents) {
    setRange(e.start_date, e.end_date, "blocked");
  }

  return c.json({ from, to, dates: statusByDate });
});

publicRoutes.post("/apartments/:slug/quote", async (c) => {
  const slug = c.req.param("slug");
  const body = await c.req.json().catch(() => ({}));
  const parsed = QuoteInput.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);

  const { checkin, checkout, non_refundable } = parsed.data;
  if (nightsBetween(checkin, checkout) < 1) return c.json({ error: "invalid_range" }, 400);

  const apt = await getApartmentBySlug(c.env.DB, slug);
  if (!apt) return c.json({ error: "not_found" }, 404);

  const [seasons, overrides, promos] = await Promise.all([
    listSeasons(c.env.DB, apt.id),
    listDateOverrides(c.env.DB, apt.id, checkin, checkout),
    listActivePromotions(c.env.DB, apt.id),
  ]);
  const overridesByDate = new Map(overrides.map((o) => [o.date, o]));
  const q = buildQuote(apt, seasons, overridesByDate, promos, checkin, checkout, { non_refundable });
  return c.json(q);
});

publicRoutes.post("/bookings", async (c) => {
  // Rate-limit by IP
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const rlKey = `ratelimit:booking:${ip}`;
  const count = parseInt((await c.env.KV.get(rlKey)) || "0", 10);
  if (count >= 15) return c.json({ error: "rate_limited", retry_after_sec: 600 }, 429);
  await c.env.KV.put(rlKey, String(count + 1), { expirationTtl: 600 });

  const body = await c.req.json().catch(() => ({}));
  const parsed = BookingInput.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const { apartment_slug, checkin, checkout, guests_count, non_refundable, guest } = parsed.data;
  if (nightsBetween(checkin, checkout) < 2) return c.json({ error: "min_stay" }, 400);

  const apt = await getApartmentBySlug(c.env.DB, apartment_slug);
  if (!apt) return c.json({ error: "not_found" }, 404);
  if (guests_count > apt.max_guests) return c.json({ error: "too_many_guests", max: apt.max_guests }, 400);

  const available = await isRangeAvailable(c.env.DB, apt.id, checkin, checkout);
  if (!available) return c.json({ error: "unavailable" }, 409);

  const [seasons, overrides, promos] = await Promise.all([
    listSeasons(c.env.DB, apt.id),
    listDateOverrides(c.env.DB, apt.id, checkin, checkout),
    listActivePromotions(c.env.DB, apt.id),
  ]);
  const overridesByDate = new Map(overrides.map((o) => [o.date, o]));
  const q = buildQuote(apt, seasons, overridesByDate, promos, checkin, checkout, { non_refundable });

  const holdMs = (parseInt(c.env.HOLD_HOURS || "24", 10) || 24) * 60 * 60 * 1000;
  const holdExpires = Date.now() + holdMs;

  const result = await c.env.DB.prepare(
    `INSERT INTO bookings (apartment_id, checkin, checkout, guest_name, guest_email, guest_phone, guest_lang, guests_count, status, non_refundable, quote_json, total_amount, currency, notes, hold_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
  ).bind(
    apt.id,
    checkin,
    checkout,
    guest.name,
    guest.email,
    guest.phone || null,
    guest.lang || null,
    guests_count,
    non_refundable ? 1 : 0,
    JSON.stringify(q),
    q.total,
    q.currency,
    guest.notes || null,
    holdExpires
  ).run();

  const bookingId = Number(result.meta.last_row_id);
  try {
    await audit(c.env.DB, "guest", "booking.create", "bookings", bookingId, { slug: apt.slug, ip, total: q.total });
  } catch (e) {
    console.error("audit booking.create:", e);
  }

  // Fire and forget notifications
  c.executionCtx.waitUntil(notifyOwnerAndGuest(c.env, bookingId, apt, {
    id: bookingId,
    guest_name: guest.name,
    guest_email: guest.email,
    guest_phone: guest.phone || null,
    guest_lang: guest.lang || null,
    checkin,
    checkout,
    guests_count,
    total_amount: q.total,
    currency: q.currency,
    notes: guest.notes || null,
  }));

  const reference = `SL-${String(bookingId).padStart(5, "0")}`;
  return c.json({
    booking_id: bookingId,
    reference,
    status: "pending",
    hold_expires_at: holdExpires,
    total: q.total,
    currency: q.currency,
  }, 201);
});

publicRoutes.get("/bookings/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const token = c.req.query("token") || "";
  if (!Number.isFinite(id) || !token) return c.json({ error: "invalid" }, 400);
  const { verifyToken } = await import("../lib/auth");
  const ok = await verifyToken(c.env, `booking:${id}`, token);
  if (!ok) return c.json({ error: "invalid_token" }, 403);
  const b = await c.env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<Booking>();
  if (!b) return c.json({ error: "not_found" }, 404);
  return c.json({
    id: b.id,
    apartment_id: b.apartment_id,
    checkin: b.checkin,
    checkout: b.checkout,
    status: b.status,
    total: b.total_amount,
    currency: b.currency,
    hold_expires_at: b.hold_expires_at,
  });
});

async function notifyOwnerAndGuest(env: Env, bookingId: number, apt: Apartment, b: {
  id: number;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  guest_lang: string | null;
  checkin: string;
  checkout: string;
  guests_count: number;
  total_amount: number;
  currency: string;
  notes: string | null;
}) {
  const ownerMail = bookingOwnerEmail({ ...b, apartment_slug: apt.slug }, env.SITE_ORIGIN);
  console.log(`booking #${bookingId} notify → owner:${env.OWNER_EMAIL} guest:${b.guest_email}`);
  const ownerRes = await sendEmail(env, [{ email: env.OWNER_EMAIL }], ownerMail.subject, ownerMail.text, ownerMail.html);
  console.log(`booking #${bookingId} owner email:`, ownerRes.ok ? "ok" : ownerRes.error);

  const lookupToken = await signToken(env, `booking:${bookingId}`);
  const lookupUrl = `${env.SITE_ORIGIN}/${b.guest_lang || "en"}/booking/?id=${bookingId}&token=${lookupToken}`;
  const guestMail = bookingGuestEmail({ ...b, apartment_slug: apt.unit_label }, lookupUrl);
  const guestRes = await sendEmail(env, [{ email: b.guest_email, name: b.guest_name }], guestMail.subject, guestMail.text, guestMail.html);
  console.log(`booking #${bookingId} guest email:`, guestRes.ok ? "ok" : guestRes.error);

  await sendWhatsApp(env, `SkiLuxe booking #${bookingId} — ${apt.slug} ${b.checkin}→${b.checkout} ${b.currency} ${(b.total_amount/100).toFixed(0)} — confirm: ${env.SITE_ORIGIN}/admin/`);
}

function parseJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}
