import type { Apartment, Booking, Env } from "../types";
import { audit } from "./db";
import { getTbcPayment, isTbcPaymentFailed, isTbcPaymentSucceeded } from "./tbc-pay";
import { bookingGuestEmail, bookingOwnerEmail, sendEmail, sendWhatsApp } from "./notify";
import { signToken } from "./auth";

async function getApartmentById(db: D1Database, id: number): Promise<Apartment | null> {
  return (await db.prepare("SELECT * FROM apartments WHERE id = ?").bind(id).first<Apartment>()) || null;
}

export async function syncBookingPayment(env: Env, bookingId: number): Promise<{
  booking: Booking | null;
  paymentStatus: string | null;
  changed: boolean;
}> {
  const booking = await env.DB.prepare("SELECT * FROM bookings WHERE id = ?")
    .bind(bookingId)
    .first<Booking>();
  if (!booking || !booking.tbc_pay_id) {
    return { booking, paymentStatus: booking?.payment_status || null, changed: false };
  }
  if (booking.payment_status === "succeeded" || booking.status === "confirmed") {
    return { booking, paymentStatus: "succeeded", changed: false };
  }

  const payment = await getTbcPayment(env, booking.tbc_pay_id);
  const now = Date.now();
  let changed = false;

  if (isTbcPaymentSucceeded(payment.status)) {
    await env.DB.prepare(
      `UPDATE bookings SET status = 'confirmed', payment_status = 'succeeded', paid_at = ?, confirmed_at = ?
       WHERE id = ?`
    ).bind(now, now, bookingId).run();
    changed = true;
    try {
      await audit(env.DB, "system", "booking.paid", "bookings", bookingId, { payId: booking.tbc_pay_id });
    } catch (e) {
      console.error("audit booking.paid:", e);
    }
    const apt = await getApartmentById(env.DB, booking.apartment_id);
    if (apt) {
      await notifyBookingConfirmed(env, bookingId, apt, booking);
    }
    return {
      booking: { ...booking, status: "confirmed", payment_status: "succeeded", paid_at: now, confirmed_at: now },
      paymentStatus: "succeeded",
      changed,
    };
  }

  if (isTbcPaymentFailed(payment.status)) {
    const mapped = payment.status === "Expired" ? "expired" : "failed";
    if (booking.payment_status !== mapped) {
      await env.DB.prepare("UPDATE bookings SET payment_status = ? WHERE id = ?")
        .bind(mapped, bookingId)
        .run();
      changed = true;
    }
    return {
      booking: { ...booking, payment_status: mapped },
      paymentStatus: mapped,
      changed,
    };
  }

  if (booking.payment_status !== payment.status.toLowerCase()) {
    await env.DB.prepare("UPDATE bookings SET payment_status = ? WHERE id = ?")
      .bind(payment.status.toLowerCase(), bookingId)
      .run();
    changed = true;
  }

  return {
    booking: { ...booking, payment_status: payment.status.toLowerCase() },
    paymentStatus: payment.status.toLowerCase(),
    changed,
  };
}

export async function findBookingByPayId(env: Env, payId: string): Promise<Booking | null> {
  return (
    (await env.DB.prepare("SELECT * FROM bookings WHERE tbc_pay_id = ?").bind(payId).first<Booking>()) || null
  );
}

async function notifyBookingConfirmed(env: Env, bookingId: number, apt: Apartment, b: Booking) {
  const ownerMail = bookingOwnerEmail(
    {
      id: b.id,
      guest_name: b.guest_name,
      guest_email: b.guest_email,
      guest_phone: b.guest_phone,
      checkin: b.checkin,
      checkout: b.checkout,
      guests_count: b.guests_count,
      total_amount: b.total_amount,
      currency: b.currency,
      notes: b.notes,
      apartment_slug: apt.slug,
    },
    env.SITE_ORIGIN
  );
  const paidSubject = ownerMail.subject.replace("New booking", "Paid booking");
  const paidText = ownerMail.text.replace("New booking hold (24h):", "Paid booking (auto-confirmed):");
  const paidHtml = ownerMail.html.replace("New booking hold", "Paid booking (auto-confirmed)");
  await sendEmail(env, [{ email: env.OWNER_EMAIL }], paidSubject, paidText, paidHtml);

  const lookupToken = await signToken(env, `booking:${bookingId}`);
  const lookupUrl = `${env.SITE_ORIGIN}/${b.guest_lang || "en"}/booking/payment/?id=${bookingId}&token=${lookupToken}`;
  const guestMail = bookingGuestEmail(
    {
      id: b.id,
      guest_name: b.guest_name,
      checkin: b.checkin,
      checkout: b.checkout,
      total_amount: b.total_amount,
      currency: b.currency,
      apartment_slug: apt.unit_label,
    },
    lookupUrl
  );
  const confirmedSubject = guestMail.subject.replace("booking hold", "booking confirmation");
  const confirmedText = guestMail.text
    .replace("24-hour hold", "confirmed booking")
    .replace("Within 24 hours we'll contact you to arrange payment and confirm the booking.", "Your payment was received and your stay is confirmed.");
  const confirmedHtml = guestMail.html
    .replace("24-hour hold", "confirmed booking")
    .replace("Within 24 hours we'll contact you to arrange payment and confirm the booking.", "Your payment was received and your stay is confirmed.");
  await sendEmail(
    env,
    [{ email: b.guest_email, name: b.guest_name }],
    confirmedSubject,
    confirmedText,
    confirmedHtml
  );

  await sendWhatsApp(
    env,
    `SkiLuxe PAID booking #${bookingId} — ${apt.slug} ${b.checkin}→${b.checkout} ${b.currency} ${(b.total_amount / 100).toFixed(0)} — ${env.SITE_ORIGIN}/admin/`
  );
}
