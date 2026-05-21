// Apartment detail page: gallery, availability calendar, booking widget.
const CFG = window.SKILUXE_CONFIG || { lang: "en", apiBase: "" };
const STR = window.SKILUXE_I18N || {}; // optional: loaded by server

const apiBase = CFG.apiBase || "";

function fmtMoney(cents, currency) {
  try {
    return new Intl.NumberFormat(CFG.lang, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format((cents || 0) / 100);
  } catch (_) {
    return "$" + Math.round((cents || 0) / 100);
  }
}

function fmtDate(date, opts) {
  try {
    return new Intl.DateTimeFormat(CFG.lang, opts || { day: "numeric", month: "short", year: "numeric" }).format(date);
  } catch (_) {
    return date.toISOString().slice(0, 10);
  }
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function diffDays(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// ---------- Gallery ----------
function initGallery() {
  const gallery = document.querySelector(".gallery");
  if (!gallery) return;
  const hero = gallery.querySelector(".gallery__hero img");
  const thumbs = gallery.querySelectorAll(".gallery__thumb");
  thumbs.forEach((t) => {
    t.addEventListener("click", () => {
      const src = t.dataset.src;
      if (hero && src) hero.src = src;
      thumbs.forEach((x) => x.classList.toggle("is-active", x === t));
    });
  });
}

// ---------- Availability calendar ----------
async function fetchAvailability(slug, from, to) {
  if (!apiBase) return { dates: {} };
  try {
    const url = `${apiBase}/api/apartments/${encodeURIComponent(slug)}/availability?from=${ymd(from)}&to=${ymd(to)}`;
    const res = await fetch(url);
    if (!res.ok) return { dates: {} };
    return await res.json();
  } catch (_) {
    return { dates: {} };
  }
}

function monthGrid(year, month, statusByDate, today) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // Monday-first
  const cells = [];
  for (let i = 0; i < leading; i++) cells.push({ empty: true });
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const key = ymd(date);
    const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    cells.push({ day: d, key, status: statusByDate[key] || "available", past: isPast });
  }
  return cells;
}

function renderCalendar(grid, statusByDate) {
  const today = new Date();
  const months = parseInt(grid.dataset.months || "3", 10);
  const dows = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  let html = "";
  for (let m = 0; m < months; m++) {
    const dt = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const cells = monthGrid(dt.getFullYear(), dt.getMonth(), statusByDate, today);
    const title = new Intl.DateTimeFormat(CFG.lang, { month: "long", year: "numeric" }).format(dt);
    html += `<div class="cal"><h3 class="cal__title">${title}</h3><div class="cal__grid">`;
    for (const d of dows) html += `<div class="cal__dow">${d}</div>`;
    for (const c of cells) {
      if (c.empty) { html += `<div class="cal__cell is-empty"></div>`; continue; }
      const cls = ["cal__cell"];
      if (c.past) cls.push("is-past");
      if (c.status === "pending") cls.push("is-pending");
      if (c.status === "blocked") cls.push("is-blocked");
      html += `<div class="${cls.join(" ")}" data-date="${c.key}">${c.day}</div>`;
    }
    html += `</div></div>`;
  }
  grid.innerHTML = html;
}

async function initCalendar() {
  const grid = document.querySelector(".availability__grid");
  if (!grid) return;
  const slug = grid.dataset.slug;
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 4, 0);
  const data = await fetchAvailability(slug, from, to);
  const statusByDate = {};
  if (Array.isArray(data.dates)) {
    for (const d of data.dates) statusByDate[d.date] = d.status;
  } else if (data.dates && typeof data.dates === "object") {
    Object.assign(statusByDate, data.dates);
  }
  renderCalendar(grid, statusByDate);
}

// ---------- Booking widget ----------
function initBooking() {
  const widget = document.querySelector(".booking");
  if (!widget) return;
  const slug = widget.dataset.slug;
  const maxGuests = parseInt(widget.dataset.maxGuests, 10);
  const form = widget.querySelector(".booking__form");
  const checkin = form.querySelector('[name="checkin"]');
  const checkout = form.querySelector('[name="checkout"]');
  const guests = form.querySelector('[name="guests"]');
  const nonRefundable = form.querySelector('[name="non_refundable"]');
  const quoteBox = widget.querySelector(".booking__quote");
  const quoteLines = widget.querySelector(".booking__quote-lines");
  const quoteAmt = widget.querySelector(".booking__quote-amount");
  const hint = widget.querySelector(".booking__hint");
  const submit = form.querySelector(".booking__submit");
  const submitIdle = form.querySelector(".booking__submit-idle");
  const submitBusy = form.querySelector(".booking__submit-busy");
  const successBox = widget.querySelector(".booking__success");
  const successText = widget.querySelector(".booking__success-text");
  const errorBox = widget.querySelector(".booking__error");
  const subtitle = widget.querySelector(".booking__subtitle");
  const guestSection = widget.querySelector(".booking__guest");

  // Default checkin = today + 7, checkout = today + 10
  const today = new Date();
  const defIn = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const defOut = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10);
  checkin.min = ymd(today);
  checkout.min = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
  }

  function showHint(msg) {
    if (!msg) { hint.hidden = true; return; }
    hint.textContent = msg;
    hint.hidden = false;
  }

  let quoteTimer;
  async function refreshQuote() {
    showError("");
    const ci = checkin.value, co = checkout.value;
    if (!ci || !co) { quoteBox.hidden = true; showHint(STR.select_dates); return; }
    const ciD = new Date(ci), coD = new Date(co);
    if (coD <= ciD) { quoteBox.hidden = true; showHint(STR.min_stay); return; }
    if (diffDays(ciD, coD) < 2) { quoteBox.hidden = true; showHint(STR.min_stay); return; }
    if (!apiBase) {
      // Offline / static-only: show a rough estimate from base rate
      const nights = diffDays(ciD, coD);
      const base = parseInt(widget.dataset.base, 10);
      const currency = widget.dataset.currency || "USD";
      quoteLines.innerHTML = `<li><span>${nights} × ${fmtMoney(base, currency)}</span><span>${fmtMoney(base * nights, currency)}</span></li>`;
      quoteAmt.textContent = fmtMoney(base * nights, currency);
      quoteBox.hidden = false;
      showHint("");
      return;
    }
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/api/apartments/${encodeURIComponent(slug)}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkin: ci,
            checkout: co,
            guests: parseInt(guests.value, 10),
            non_refundable: !!nonRefundable.checked,
          }),
        });
        if (!res.ok) throw new Error("quote failed");
        const q = await res.json();
        renderQuote(q);
      } catch (e) {
        quoteBox.hidden = true;
        showHint("");
      }
    }, 250);
  }

  function renderQuote(q) {
    const cur = q.currency || "USD";
    const nightsCount = (q.nights || []).length;
    const nightlyAvg = nightsCount ? Math.round(q.subtotal / nightsCount) : 0;
    const lines = [];
    lines.push(`<li><span>${nightsCount} × ${fmtMoney(nightlyAvg, cur)}</span><span>${fmtMoney(q.subtotal, cur)}</span></li>`);
    for (const d of q.discounts || []) {
      lines.push(`<li class="is-discount"><span>${d.label || d.kind}</span><span>−${fmtMoney(d.amount, cur)}</span></li>`);
    }
    quoteLines.innerHTML = lines.join("");
    quoteAmt.textContent = fmtMoney(q.total, cur);
    quoteBox.hidden = false;
    showHint("");
  }

  [checkin, checkout, guests, nonRefundable].forEach((el) => {
    el.addEventListener("change", refreshQuote);
    el.addEventListener("input", refreshQuote);
  });

  // Set defaults & initial quote
  checkin.value = ymd(defIn);
  checkout.value = ymd(defOut);
  refreshQuote();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const fd = new FormData(form);
    const ci = String(fd.get("checkin") || "");
    const co = String(fd.get("checkout") || "");
    const g = parseInt(String(fd.get("guests") || "1"), 10);
    if (g > maxGuests) { showError(`Maximum ${maxGuests} guests for this apartment.`); return; }
    if (!apiBase) { showError("Booking API not configured yet."); return; }

    submit.disabled = true;
    submitIdle.hidden = true;
    submitBusy.hidden = false;
    try {
      const res = await fetch(`${apiBase}/api/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartment_slug: slug,
          checkin: ci,
          checkout: co,
          guests_count: g,
          non_refundable: !!fd.get("non_refundable"),
          guest: {
            name: String(fd.get("name") || ""),
            email: String(fd.get("email") || ""),
            phone: String(fd.get("phone") || ""),
            lang: CFG.lang,
            notes: String(fd.get("notes") || ""),
          },
        }),
      });
      if (res.status === 409) {
        showError(STR.unavailable || "Dates no longer available. Please pick different dates.");
        return;
      }
      if (res.status === 429) {
        showError(STR.rate_limited || "Too many booking attempts. Please wait 10 minutes and try again.");
        return;
      }
      if (!res.ok) {
        let detail = "";
        try { const j = await res.json(); detail = j.error || ""; } catch (_) {}
        throw new Error(detail || `booking failed ${res.status}`);
      }
      const data = await res.json();
      const ref = data.reference || data.booking_id || "—";
      successText.textContent = (STR.success_text || "Dates held. Reference: {ref}.").replace("{ref}", ref);
      successBox.hidden = false;
      form.querySelectorAll("input, select, textarea, button").forEach((el) => { if (el.type !== "submit") el.disabled = true; });
      submit.hidden = true;
      subtitle.hidden = true;
      guestSection.hidden = true;
      quoteBox.hidden = true;
      hint.hidden = true;
    } catch (err) {
      showError(STR.error_generic || "Something went wrong. Please try again or message us on WhatsApp.");
    } finally {
      submit.disabled = false;
      submitIdle.hidden = false;
      submitBusy.hidden = true;
    }
  });
}

initGallery();
initCalendar();
initBooking();
