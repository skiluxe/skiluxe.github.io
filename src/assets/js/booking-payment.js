const CFG = window.SKILUXE_CONFIG || { lang: "en", apiBase: "" };
const STR = window.SKILUXE_PAYMENT_I18N || {};
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

function qs(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function show(el) {
  el.hidden = false;
}

function hide(el) {
  el.hidden = true;
}

async function pollPaymentStatus(id, token, attempt = 0) {
  const root = document.getElementById("booking-payment");
  if (!root || !apiBase) return;

  const loading = root.querySelector(".booking-payment__loading");
  const success = root.querySelector(".booking-payment__success");
  const pending = root.querySelector(".booking-payment__pending");
  const failed = root.querySelector(".booking-payment__failed");
  const error = root.querySelector(".booking-payment__error");

  try {
    const res = await fetch(
      `${apiBase}/api/payments/bookings/${encodeURIComponent(id)}/payment-status?token=${encodeURIComponent(token)}`
    );
    if (!res.ok) throw new Error("status check failed");
    const data = await res.json();

    if (data.status === "confirmed" || data.payment_status === "succeeded") {
      hide(loading);
      success.querySelector(".booking-payment__text").textContent = (STR.success_text || "")
        .replace("{ref}", data.reference || id)
        .replace("{total}", fmtMoney(data.total, data.currency));
      show(success);
      return;
    }

    if (data.payment_status === "failed" || data.payment_status === "expired") {
      hide(loading);
      failed.querySelector(".booking-payment__text").textContent = (STR.failed_text || "")
        .replace("{ref}", data.reference || id);
      show(failed);
      return;
    }

    if (attempt < 8) {
      setTimeout(() => pollPaymentStatus(id, token, attempt + 1), 2000);
      return;
    }

    hide(loading);
    pending.querySelector(".booking-payment__text").textContent = (STR.pending_text || "")
      .replace("{ref}", data.reference || id);
    show(pending);
  } catch (_) {
    hide(loading);
    error.textContent = STR.error_generic || "Something went wrong.";
    show(error);
  }
}

const id = qs("id");
const token = qs("token");
if (id && token) {
  pollPaymentStatus(id, token);
} else {
  const root = document.getElementById("booking-payment");
  if (root) {
    hide(root.querySelector(".booking-payment__loading"));
    const error = root.querySelector(".booking-payment__error");
    error.textContent = STR.error_generic || "Invalid link.";
    show(error);
  }
}
