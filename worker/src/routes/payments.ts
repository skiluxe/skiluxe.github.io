import { Hono } from "hono";
import type { Env } from "../types";
import { findBookingByPayId, markBookingPaid, syncBookingPayment } from "../lib/booking-payment";
import { verifyToken } from "../lib/auth";

export const paymentRoutes = new Hono<{ Bindings: Env }>();

function geopaySuccess(body: Record<string, unknown>, query: Record<string, string>): boolean {
  const status = String(body.status || body.result || body.payment_status || query.status || query.result || "").toLowerCase();
  const okValues = new Set(["ok", "success", "succeeded", "paid", "approved", "1", "true", "completed"]);
  return okValues.has(status);
}

/** GeoPay / UFC return or server callback — accepts GET or POST. */
paymentRoutes.all("/geopay/callback", async (c) => {
  const query = c.req.query();
  const body = c.req.method === "POST" ? await c.req.json().catch(() => ({})) : {};
  const uniqid = String(
    body.uniqid || body.id || query.uniqid || query.id || body.PaymentId || ""
  );
  if (!uniqid) {
    console.error("GeoPay callback: missing uniqid", { query, body });
    return c.text("ok", 200);
  }

  const booking = await findBookingByPayId(c.env, uniqid);
  if (!booking) {
    console.error("GeoPay callback: no booking for uniqid", uniqid);
    return c.text("ok", 200);
  }

  if (geopaySuccess(body as Record<string, unknown>, query)) {
    try {
      await markBookingPaid(c.env, booking.id, uniqid);
    } catch (e) {
      console.error("GeoPay callback confirm error:", e);
    }
  } else {
    console.log("GeoPay callback received (not auto-confirming):", { uniqid, query, body });
  }

  return c.text("ok", 200);
});
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
