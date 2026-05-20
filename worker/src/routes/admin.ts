import { Hono } from "hono";
import type { Env, Booking } from "../types";
import { clearSessionCookie, createSession, isPasswordHashFormat, verifyPassword, verifySession } from "../lib/auth";
import { LoginInput, SeasonInput, PromotionInput, IcalSourceInput, DateOverrideInput } from "../lib/validate";
import { audit } from "../lib/db";

export const adminRoutes = new Hono<{ Bindings: Env }>();

// Middleware: all routes except /login require valid session
adminRoutes.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.endsWith("/admin/login")) return next();
  const ok = await verifySession(c.env, c.req.header("Cookie") ?? null);
  if (!ok) return c.json({ error: "unauthorized" }, 401);
  return next();
});

adminRoutes.post("/login", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const rlKey = `ratelimit:login:${ip}`;
  const count = parseInt((await c.env.KV.get(rlKey)) || "0", 10);
  if (count >= 20) return c.json({ error: "rate_limited" }, 429);

  const body = await c.req.json().catch(() => ({}));
  const parsed = LoginInput.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  if (!c.env.ADMIN_PASSWORD_HASH) return c.json({ error: "not_configured" }, 503);
  if (!isPasswordHashFormat(c.env.ADMIN_PASSWORD_HASH)) {
    return c.json({ error: "hash_misconfigured" }, 503);
  }
  const ok = await verifyPassword(parsed.data.password, c.env.ADMIN_PASSWORD_HASH);
  if (!ok) {
    await c.env.KV.put(rlKey, String(count + 1), { expirationTtl: 3600 });
    try {
      await audit(c.env.DB, "admin", "login.failed", null, null, { ip });
    } catch (e) {
      console.error("audit login.failed:", e);
    }
    return c.json({ error: "invalid_credentials" }, 401);
  }
  const { cookie } = await createSession(c.env);
  await audit(c.env.DB, "admin", "login.success", null, null, { ip });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
});

adminRoutes.post("/logout", async (c) => {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie() },
  });
});

adminRoutes.get("/me", async (c) => c.json({ ok: true }));

// ------- Bookings -------
adminRoutes.get("/bookings", async (c) => {
  const status = c.req.query("status");
  const apt = c.req.query("apartment");
  const conditions: string[] = [];
  const binds: any[] = [];
  if (status) { conditions.push("status = ?"); binds.push(status); }
  if (apt) {
    conditions.push("apartment_id = (SELECT id FROM apartments WHERE slug = ?)");
    binds.push(apt);
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const { results } = await c.env.DB.prepare(
    `SELECT b.*, a.slug AS apartment_slug, a.unit_label AS apartment_label
     FROM bookings b JOIN apartments a ON a.id = b.apartment_id
     ${where}
     ORDER BY b.created_at DESC
     LIMIT 200`
  ).bind(...binds).all();
  return c.json({ bookings: results || [] });
});

adminRoutes.get("/bookings/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const row = await c.env.DB.prepare(
    `SELECT b.*, a.slug AS apartment_slug, a.unit_label AS apartment_label
     FROM bookings b JOIN apartments a ON a.id = b.apartment_id
     WHERE b.id = ?`
  ).bind(id).first();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

adminRoutes.post("/bookings/:id/confirm", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const b = await c.env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<Booking>();
  if (!b) return c.json({ error: "not_found" }, 404);
  if (b.status !== "pending") return c.json({ error: "wrong_status", current: b.status }, 409);
  await c.env.DB.prepare(
    "UPDATE bookings SET status = 'confirmed', confirmed_at = ?, hold_expires_at = NULL WHERE id = ?"
  ).bind(Date.now(), id).run();
  await audit(c.env.DB, "admin", "booking.confirm", "bookings", id, null);
  return c.json({ ok: true });
});

adminRoutes.post("/bookings/:id/cancel", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => ({}));
  const reason: string = body?.reason || "";
  const b = await c.env.DB.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<Booking>();
  if (!b) return c.json({ error: "not_found" }, 404);
  if (b.status === "cancelled" || b.status === "expired") return c.json({ error: "wrong_status" }, 409);
  await c.env.DB.prepare(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = ?, notes = COALESCE(notes,'') || ? WHERE id = ?"
  ).bind(Date.now(), reason ? `\nCancelled: ${reason}` : "", id).run();
  await audit(c.env.DB, "admin", "booking.cancel", "bookings", id, { reason });
  return c.json({ ok: true });
});

// ------- Apartments -------
adminRoutes.get("/apartments", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM apartments ORDER BY id").all();
  return c.json({ apartments: results || [] });
});

adminRoutes.patch("/apartments/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => ({}));
  const updates: string[] = [];
  const binds: any[] = [];
  for (const field of ["base_rate", "currency", "amenities_json", "max_guests"]) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      binds.push(body[field]);
    }
  }
  if (updates.length === 0) return c.json({ error: "nothing_to_update" }, 400);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE apartments SET ${updates.join(", ")} WHERE id = ?`).bind(...binds).run();
  await audit(c.env.DB, "admin", "apartment.update", "apartments", id, body);
  return c.json({ ok: true });
});

// ------- Seasons -------
adminRoutes.get("/seasons", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM seasons ORDER BY priority DESC, start_date").all();
  return c.json({ seasons: results || [] });
});

adminRoutes.post("/seasons", async (c) => {
  const parsed = SeasonInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input", details: parsed.error.flatten() }, 400);
  const s = parsed.data;
  const res = await c.env.DB.prepare(
    "INSERT INTO seasons (apartment_id, name, start_date, end_date, multiplier, override_rate, priority) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(s.apartment_id ?? null, s.name, s.start_date, s.end_date, s.multiplier, s.override_rate ?? null, s.priority).run();
  await audit(c.env.DB, "admin", "season.create", "seasons", Number(res.meta.last_row_id), s);
  return c.json({ id: Number(res.meta.last_row_id) }, 201);
});

adminRoutes.patch("/seasons/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const parsed = SeasonInput.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const fields: string[] = [];
  const binds: any[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    fields.push(`${k} = ?`); binds.push(v);
  }
  if (!fields.length) return c.json({ error: "nothing" }, 400);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE seasons SET ${fields.join(", ")} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

adminRoutes.delete("/seasons/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  await c.env.DB.prepare("DELETE FROM seasons WHERE id = ?").bind(id).run();
  await audit(c.env.DB, "admin", "season.delete", "seasons", id, null);
  return c.json({ ok: true });
});

// ------- Promotions -------
adminRoutes.get("/promotions", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM promotions ORDER BY id").all();
  return c.json({ promotions: results || [] });
});

adminRoutes.post("/promotions", async (c) => {
  const parsed = PromotionInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const p = parsed.data;
  const res = await c.env.DB.prepare(
    "INSERT INTO promotions (apartment_id, kind, active, params_json, stackable) VALUES (?, ?, ?, ?, ?)"
  ).bind(p.apartment_id ?? null, p.kind, p.active ? 1 : 0, JSON.stringify(p.params), p.stackable ? 1 : 0).run();
  await audit(c.env.DB, "admin", "promotion.create", "promotions", Number(res.meta.last_row_id), p);
  return c.json({ id: Number(res.meta.last_row_id) }, 201);
});

adminRoutes.patch("/promotions/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const binds: any[] = [];
  if (body.active !== undefined) { fields.push("active = ?"); binds.push(body.active ? 1 : 0); }
  if (body.params !== undefined) { fields.push("params_json = ?"); binds.push(JSON.stringify(body.params)); }
  if (body.stackable !== undefined) { fields.push("stackable = ?"); binds.push(body.stackable ? 1 : 0); }
  if (!fields.length) return c.json({ error: "nothing" }, 400);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE promotions SET ${fields.join(", ")} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

adminRoutes.delete("/promotions/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  await c.env.DB.prepare("DELETE FROM promotions WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ------- iCal sources -------
adminRoutes.get("/ical-sources", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT s.*, a.slug AS apartment_slug FROM ical_sources s JOIN apartments a ON a.id = s.apartment_id ORDER BY a.slug, s.id"
  ).all();
  return c.json({ sources: results || [] });
});

adminRoutes.post("/ical-sources", async (c) => {
  const parsed = IcalSourceInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const s = parsed.data;
  const res = await c.env.DB.prepare(
    "INSERT INTO ical_sources (apartment_id, label, url, active) VALUES (?, ?, ?, ?)"
  ).bind(s.apartment_id, s.label, s.url, s.active ? 1 : 0).run();
  await audit(c.env.DB, "admin", "ical_source.create", "ical_sources", Number(res.meta.last_row_id), s);
  return c.json({ id: Number(res.meta.last_row_id) }, 201);
});

adminRoutes.patch("/ical-sources/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json().catch(() => ({}));
  const fields: string[] = [];
  const binds: any[] = [];
  for (const k of ["label", "url"]) if (body[k] !== undefined) { fields.push(`${k} = ?`); binds.push(body[k]); }
  if (body.active !== undefined) { fields.push("active = ?"); binds.push(body.active ? 1 : 0); }
  if (!fields.length) return c.json({ error: "nothing" }, 400);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE ical_sources SET ${fields.join(", ")} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

adminRoutes.delete("/ical-sources/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  await c.env.DB.prepare("DELETE FROM ical_sources WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

adminRoutes.post("/ical-sources/:id/sync-now", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const { syncOneSource } = await import("../jobs/sync-ical");
  const result = await syncOneSource(c.env, id);
  return c.json(result);
});

// ------- Date overrides -------
adminRoutes.get("/date-overrides", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM date_overrides ORDER BY apartment_id, date").all();
  return c.json({ overrides: results || [] });
});

adminRoutes.post("/date-overrides", async (c) => {
  const parsed = DateOverrideInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const o = parsed.data;
  const res = await c.env.DB.prepare(
    "INSERT INTO date_overrides (apartment_id, date, rate, note) VALUES (?, ?, ?, ?) ON CONFLICT(apartment_id, date) DO UPDATE SET rate = excluded.rate, note = excluded.note"
  ).bind(o.apartment_id, o.date, o.rate, o.note || null).run();
  return c.json({ ok: true, id: Number(res.meta.last_row_id) });
});

adminRoutes.delete("/date-overrides/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  await c.env.DB.prepare("DELETE FROM date_overrides WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ------- Conflicts (bookings overlapping ical_events) -------
adminRoutes.get("/conflicts", async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT b.id AS booking_id, b.status, b.checkin, b.checkout, b.guest_name,
           a.slug AS apartment_slug,
           e.id AS event_id, e.start_date AS event_start, e.end_date AS event_end,
           s.label AS source_label, s.url AS source_url
    FROM bookings b
    JOIN apartments a ON a.id = b.apartment_id
    JOIN ical_events e ON e.apartment_id = b.apartment_id
       AND NOT (e.end_date <= b.checkin OR e.start_date >= b.checkout)
    JOIN ical_sources s ON s.id = e.source_id
    WHERE b.status IN ('pending','confirmed')
    ORDER BY b.checkin
  `).all();
  return c.json({ conflicts: results || [] });
});

// ------- Audit log -------
adminRoutes.get("/audit", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "100", 10), 500);
  const { results } = await c.env.DB.prepare("SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?").bind(limit).all();
  return c.json({ events: results || [] });
});
