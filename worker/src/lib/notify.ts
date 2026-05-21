// Email (MailChannels) + WhatsApp (CallMeBot). Both best-effort; failures are logged but don't fail the request.
import type { Env } from "../types";

interface MailRecipient {
  email: string;
  name?: string;
}

async function mailchannelsSend(
  env: Env,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!env.MAILCHANNELS_API_KEY) {
    return { ok: false, error: "MAILCHANNELS_API_KEY not configured" };
  }
  headers["X-Api-Key"] = env.MAILCHANNELS_API_KEY;

  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const respText = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: `mailchannels ${res.status}: ${respText.slice(0, 400)}` };
  }
  console.log("sendEmail ok:", res.status, respText.slice(0, 120));
  return { ok: true, status: res.status };
}

export async function sendEmail(
  env: Env,
  to: MailRecipient[],
  subject: string,
  text: string,
  html?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!env.MAIL_FROM) {
    console.error("sendEmail: MAIL_FROM not configured");
    return { ok: false, error: "MAIL_FROM not configured" };
  }

  const base: Record<string, unknown> = {
    personalizations: [{ to }],
    from: { email: env.MAIL_FROM, name: "SkiLuxe New Gudauri" },
    subject,
    content: [
      { type: "text/plain", value: text },
      ...(html ? [{ type: "text/html", value: html }] : []),
    ],
  };

  const hasDkim = !!(env.MAIL_DKIM_DOMAIN && env.MAIL_DKIM_SELECTOR && env.MAIL_DKIM_PRIVATE_KEY);
  if (hasDkim) {
    const p = base.personalizations as Record<string, unknown>[];
    p[0] = {
      ...p[0],
      dkim_domain: env.MAIL_DKIM_DOMAIN,
      dkim_selector: env.MAIL_DKIM_SELECTOR,
      dkim_private_key: env.MAIL_DKIM_PRIVATE_KEY.trim(),
    };
    const withDkim = await mailchannelsSend(env, base);
    if (withDkim.ok) return { ok: true };
    console.error("sendEmail DKIM attempt failed:", withDkim.error);
    // Retry without DKIM so booking notifications still deliver
  }

  try {
    const plain: Record<string, unknown> = {
      ...base,
      personalizations: [{ to }],
    };
    const res = await mailchannelsSend(env, plain);
    if (!res.ok) {
      console.error("sendEmail failed:", res.error);
      return { ok: false, error: res.error };
    }
    return { ok: true };
  } catch (e: any) {
    const err = String(e?.message || e);
    console.error("sendEmail error:", err);
    return { ok: false, error: err };
  }
}

export async function sendWhatsApp(env: Env, message: string): Promise<{ ok: boolean; error?: string }> {
  if (!env.OWNER_WHATSAPP_PHONE || !env.CALLMEBOT_API_KEY) return { ok: false, error: "WhatsApp not configured" };
  try {
    const url = new URL("https://api.callmebot.com/whatsapp.php");
    url.searchParams.set("phone", env.OWNER_WHATSAPP_PHONE);
    url.searchParams.set("text", message);
    url.searchParams.set("apikey", env.CALLMEBOT_API_KEY);
    const res = await fetch(url.toString());
    if (!res.ok) return { ok: false, error: `callmebot ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export function bookingOwnerEmail(booking: {
  id: number;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  checkin: string;
  checkout: string;
  guests_count: number;
  total_amount: number;
  currency: string;
  notes: string | null;
  apartment_slug: string;
}, siteOrigin: string): { subject: string; text: string; html: string } {
  const subject = `New booking #${booking.id} — ${booking.apartment_slug} (${booking.checkin} → ${booking.checkout})`;
  const amount = `${booking.currency} ${(booking.total_amount / 100).toFixed(0)}`;
  const text = [
    `New booking hold (24h):`,
    `Apartment: ${booking.apartment_slug}`,
    `Dates: ${booking.checkin} → ${booking.checkout}`,
    `Guests: ${booking.guests_count}`,
    `Total: ${amount}`,
    `Guest: ${booking.guest_name} <${booking.guest_email}> ${booking.guest_phone || ""}`,
    booking.notes ? `Notes: ${booking.notes}` : "",
    ``,
    `Confirm in admin: ${siteOrigin}/admin/#/bookings/${booking.id}`,
  ].filter(Boolean).join("\n");
  const html = `<h2>New booking hold</h2>
<p><strong>${booking.apartment_slug}</strong><br>
${booking.checkin} → ${booking.checkout} · ${booking.guests_count} guests<br>
<strong>${amount}</strong></p>
<p><strong>${booking.guest_name}</strong> &lt;${booking.guest_email}&gt;<br>${booking.guest_phone || ""}</p>
${booking.notes ? `<p>${booking.notes}</p>` : ""}
<p><a href="${siteOrigin}/admin/#/bookings/${booking.id}">Confirm in admin →</a></p>`;
  return { subject, text, html };
}

export function bookingGuestEmail(booking: {
  id: number;
  guest_name: string;
  checkin: string;
  checkout: string;
  total_amount: number;
  currency: string;
  apartment_slug: string;
}, lookupUrl: string): { subject: string; text: string; html: string } {
  const subject = `SkiLuxe New Gudauri — your booking hold (#${booking.id})`;
  const amount = `${booking.currency} ${(booking.total_amount / 100).toFixed(0)}`;
  const text = [
    `Dear ${booking.guest_name},`,
    ``,
    `We've placed a 24-hour hold on your dates for ${booking.apartment_slug}:`,
    `${booking.checkin} → ${booking.checkout}`,
    `Total: ${amount}`,
    ``,
    `Within 24 hours we'll contact you to arrange payment and confirm the booking.`,
    ``,
    `View your hold: ${lookupUrl}`,
    ``,
    `Looking forward to hosting you in the mountains.`,
    `— SkiLuxe`,
  ].join("\n");
  const html = `<p>Dear ${booking.guest_name},</p>
<p>We've placed a <strong>24-hour hold</strong> on your dates at <strong>${booking.apartment_slug}</strong>:</p>
<p>${booking.checkin} → ${booking.checkout}<br>
<strong>${amount}</strong></p>
<p>Within 24 hours we'll contact you to arrange payment and confirm the booking.</p>
<p><a href="${lookupUrl}">View your hold →</a></p>
<p>Looking forward to hosting you in the mountains.<br>— SkiLuxe</p>`;
  return { subject, text, html };
}
