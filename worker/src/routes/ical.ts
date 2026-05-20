import { Hono } from "hono";
import type { Env, Booking } from "../types";
import { getApartmentBySlug } from "../lib/db";
import { emitIcal } from "../lib/ical-emit";

export const icalRoutes = new Hono<{ Bindings: Env }>();

icalRoutes.get("/:slug.ics", async (c) => {
  const slug = c.req.param("slug") || "";
  if (!slug) return c.text("Not found", 404);
  const apt = await getApartmentBySlug(c.env.DB, slug);
  if (!apt) return c.text("Not found", 404);

  const today = new Date();
  const horizon = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate());

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM bookings
     WHERE apartment_id = ?
       AND status IN ('confirmed','pending')
       AND checkout >= ?
       AND checkin <= ?
     ORDER BY checkin`
  ).bind(apt.id, today.toISOString().slice(0, 10), horizon.toISOString().slice(0, 10)).all<Booking>();

  const domain = new URL(c.env.SITE_ORIGIN).hostname;
  const body = emitIcal(results || [], { slug: slug as string, domain });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": `inline; filename="${slug}.ics"`,
    },
  });
});
