import { Hono } from "hono";
import type { Env } from "../types";
import { findBookingByPayId, syncBookingPayment } from "../lib/booking-payment";
import { verifyToken } from "../lib/auth";

export const paymentRoutes = new Hono<{ Bindings: Env }>();

/** TBC server-to-server callback when payment reaches a final status. */
paymentRoutes.post("/tbc/callback", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const payId = String(body.PaymentId || body.paymentId || body.payId || "");
  if (!payId) {
    console.error("TBC callback: missing PaymentId", body);
    return c.text("ok", 200);
  }

  const booking = await findBookingByPayId(c.env, payId);
  if (!booking) {
    console.error("TBC callback: no booking for payId", payId);
    return c.text("ok", 200);
  }

  try {
    await syncBookingPayment(c.env, booking.id);
  } catch (e) {
    console.error("TBC callback sync error:", e);
  }

  return c.text("ok", 200);
});

/** Guest return page polls this after TBC redirect. */
paymentRoutes.get("/bookings/:id/payment-status", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const token = c.req.query("token") || "";
  if (!Number.isFinite(id) || !token) return c.json({ error: "invalid" }, 400);

  const ok = await verifyToken(c.env, `booking:${id}`, token);
  if (!ok) return c.json({ error: "invalid_token" }, 403);

  try {
    const { booking, paymentStatus } = await syncBookingPayment(c.env, id);
    if (!booking) return c.json({ error: "not_found" }, 404);

    return c.json({
      id: booking.id,
      status: booking.status,
      payment_status: paymentStatus || booking.payment_status,
      reference: `SL-${String(booking.id).padStart(5, "0")}`,
      checkin: booking.checkin,
      checkout: booking.checkout,
      total: booking.total_amount,
      currency: booking.currency,
    });
  } catch (e) {
    console.error("payment-status sync error:", e);
    return c.json({ error: "payment_sync_failed" }, 502);
  }
});
