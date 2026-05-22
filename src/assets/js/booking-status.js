const CFG = window.SKILUXE_CONFIG || { lang: "en", apiBase: "" };
const STR = window.SKILUXE_HOLD_I18N || {};
const apiBase = CFG.apiBase || "";

function fmtMoney(cents, currency) {
  try {
    return new Intl.NumberFormat(CFG.lang, {
      style: "currency",
      currency: currency || "GEL",
      maximumFractionDigits: 0,
    }).format((cents || 0) / 100);
  } catch (_) {
    return "₾" + Math.round((cents || 0) / 100);
  }
}

function fmtDate(ms) {
  if (!ms) return "—";
  try {
    return new Intl.DateTimeFormat(CFG.lang, {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch (_) {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  }
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function show(el) {
  el.hidden = false;
}

function hide(el) {
  el.hidden = true;
}

function fill(template, data) {
  return String(template || "")
    .replace(/\{ref\}/g, data.ref)
    .replace(/\{apartment\}/g, data.apartment)
    .replace(/\{checkin\}/g, data.checkin)
    .replace(/\{checkout\}/g, data.checkout)
    .replace(/\{total\}/g, data.total)
    .replace(/\{expires\}/g, data.expires);
}

function setWhatsAppLinks(root, vars) {
  const base = root?.dataset?.whatsappBase || "";
  if (!base) return;
  const text = fill(STR.whatsapp_message, vars);
  const href = text ? `${base}?text=${encodeURIComponent(text)}` : base;
  root.querySelectorAll(".booking-status__whatsapp").forEach((a) => {
    a.href = href;
  });
}

async function loadBookingStatus() {
  const root = document.getElementById("booking-status");
  if (!root) return;

  const loading = root.querySelector(".booking-payment__loading");
  const pending = root.querySelector(".booking-payment__pending");
  const success = root.querySelector(".booking-payment__success");
  const failed = root.querySelector(".booking-payment__failed");
  const error = root.querySelector(".booking-payment__error");

  const id = qs("id");
  const token = qs("token");
  if (!id || !token || !apiBase) {
    hide(loading);
    const errText = root.querySelector(".booking-payment__error-text");
    if (errText) errText.textContent = STR.invalid_link || STR.error_generic || "Invalid link.";
    show(error);
    return;
  }

  try {
    const res = await fetch(
      `${apiBase}/api/bookings/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`
    );
    if (res.status === 403 || res.status === 404) {
      hide(loading);
      const errText = root.querySelector(".booking-payment__error-text");
      if (errText) errText.textContent = STR.invalid_link || "Invalid link.";
      show(error);
      return;
    }
    if (!res.ok) throw new Error("status check failed");
    const data = await res.json();

    const vars = {
      ref: data.reference || id,
      apartment: data.apartment_label || data.apartment_slug || "—",
      checkin: data.checkin || "—",
      checkout: data.checkout || "—",
      total: fmtMoney(data.total, data.currency),
      expires: fmtDate(data.hold_expires_at),
    };

    hide(loading);
    setWhatsAppLinks(root, vars);

    if (data.status === "confirmed") {
      success.querySelector(".booking-payment__text").textContent = fill(STR.confirmed_text, vars);
      show(success);
      return;
    }

    if (data.status === "cancelled") {
      failed.querySelector(".booking-payment__text").textContent = fill(STR.cancelled_text, vars);
      show(failed);
      return;
    }

    pending.querySelector(".booking-payment__text").textContent = fill(STR.pending_text, vars);
    show(pending);
  } catch (_) {
    hide(loading);
    const errText = root.querySelector(".booking-payment__error-text");
    if (errText) errText.textContent = STR.error_generic || "Something went wrong.";
    show(error);
  }
}

loadBookingStatus();
