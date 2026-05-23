// Apartment detail page: gallery, interactive booking calendar, booking widget.
const CFG = window.SKILUXE_CONFIG || { lang: "en", apiBase: "" };
const STR = window.SKILUXE_I18N || {};

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

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
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

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function parseYmd(str) {
  return new Date(str + "T00:00:00");
}

function todayStart() {
  return startOfDay(new Date());
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

// ---------- Availability ----------
const availabilityCache = { slug: null, from: null, to: null, dates: {} };

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

function parseStatusMap(data) {
  const statusByDate = {};
  if (Array.isArray(data.dates)) {
    for (const d of data.dates) statusByDate[d.date] = d.status;
  } else if (data.dates && typeof data.dates === "object") {
    Object.assign(statusByDate, data.dates);
  }
  return statusByDate;
}

async function ensureAvailability(slug, fromDate, toDate) {
  const from = ymd(fromDate);
  const to = ymd(toDate);

  if (
    availabilityCache.slug === slug &&
    availabilityCache.from &&
    availabilityCache.to &&
    from >= availabilityCache.from &&
    to <= availabilityCache.to
  ) {
    return availabilityCache.dates;
  }

  let fetchFrom = fromDate;
  let fetchTo = toDate;
  if (availabilityCache.slug === slug && availabilityCache.from && availabilityCache.to) {
    const cacheFrom = parseYmd(availabilityCache.from);
    const cacheTo = parseYmd(availabilityCache.to);
    if (cacheFrom < fetchFrom) fetchFrom = cacheFrom;
    if (cacheTo > fetchTo) fetchTo = cacheTo;
  }

  if (availabilityCache.slug !== slug) {
    availabilityCache.dates = {};
    availabilityCache.slug = slug;
    availabilityCache.from = null;
    availabilityCache.to = null;
  }

  const data = await fetchAvailability(slug, fetchFrom, fetchTo);
  Object.assign(availabilityCache.dates, parseStatusMap(data));
  availabilityCache.from = ymd(fetchFrom);
  availabilityCache.to = ymd(fetchTo);
  return availabilityCache.dates;
}

function isRangeUnavailable(checkin, checkout, statusByDate) {
  let cur = parseYmd(checkin);
  const stop = parseYmd(checkout);
  while (cur < stop) {
    const st = statusByDate[ymd(cur)];
    if (st === "blocked" || st === "pending") return true;
    cur = new Date(cur.getTime() + 86400000);
  }
  return false;
}

function isBlockedNight(key, statusByDate) {
  const st = statusByDate[key];
  return st === "blocked" || st === "pending";
}

function monthGridCells(year, month, statusByDate, today) {
  const first = new Date(year, month, 1);
  const days = endOfMonth(first).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < leading; i++) cells.push({ empty: true });
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const key = ymd(date);
    cells.push({
      day: d,
      key,
      status: statusByDate[key] || "available",
      past: date < today,
    });
  }
  return cells;
}

function pickerMonthCount() {
  return window.matchMedia("(min-width: 640px)").matches ? 2 : 1;
}

function weekdayLabels() {
  const base = new Date(2024, 0, 1); // Monday
  const fmt = new Intl.DateTimeFormat(CFG.lang, { weekday: "short" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(base.getTime() + i * 86400000)));
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
  const checkinDisplay = form.querySelector('[data-display="checkin"]');
  const checkoutDisplay = form.querySelector('[data-display="checkout"]');
  const picker = form.querySelector(".booking__picker");
  const pickerMonths = form.querySelector(".booking__picker-months");
  const pickerHint = form.querySelector(".booking__picker-hint");
  const pickerPrev = form.querySelector(".booking__picker-prev");
  const pickerNext = form.querySelector(".booking__picker-next");
  const guests = form.querySelector('[name="guests"]');
  const infants = form.querySelector('[name="infants"]');
  const couponCode = form.querySelector('[name="coupon_code"]');
  const nonRefundable = form.querySelector('[name="non_refundable"]');
  const quoteBox = widget.querySelector(".booking__quote");
  const quoteLines = widget.querySelector(".booking__quote-lines");
  const quoteAmt = widget.querySelector(".booking__quote-amount");
  const hint = widget.querySelector(".booking__hint");
  const submitPay = form.querySelector(".booking__submit");
  const submitHold = form.querySelector(".booking__submit-hold");
  const submitButtons = [submitPay, submitHold].filter(Boolean);
  const payIdle = submitPay?.querySelector(".booking__submit-idle");
  const payBusy = submitPay?.querySelector(".booking__submit-busy");
  const holdIdle = submitHold?.querySelector(".booking__hold-idle");
  const holdBusy = submitHold?.querySelector(".booking__hold-busy");
  const successBox = widget.querySelector(".booking__success");
  const successText = widget.querySelector(".booking__success-text");
  const errorBox = widget.querySelector(".booking__error");
  const subtitle = widget.querySelector(".booking__subtitle");
  const guestSection = widget.querySelector(".booking__guest");

  const today = todayStart();
  const defIn = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  let viewStart = startOfMonth(defIn);
  let awaitingCheckout = false;

  function normalizedCoupon() {
    return (couponCode?.value || "").trim().toUpperCase();
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
  }

  function showHint(msg) {
    if (!msg) { hint.hidden = true; return; }
    hint.textContent = msg;
    hint.hidden = false;
  }

  function updateDateDisplays() {
    if (checkinDisplay) {
      checkinDisplay.textContent = checkin.value
        ? fmtDate(parseYmd(checkin.value), { day: "numeric", month: "short" })
        : "—";
    }
    if (checkoutDisplay) {
      checkoutDisplay.textContent = checkout.value
        ? fmtDate(parseYmd(checkout.value), { day: "numeric", month: "short" })
        : "—";
    }
    if (pickerHint) {
      pickerHint.textContent = awaitingCheckout
        ? (STR.calendar_pick_checkout || "Select check-out")
        : (STR.calendar_pick_checkin || "Select check-in");
    }
  }

  function setDates(ci, co, { refresh = true } = {}) {
    checkin.value = ci || "";
    checkout.value = co || "";
    awaitingCheckout = !!ci && !co;
    updateDateDisplays();
    if (refresh) refreshQuote();
    renderPicker();
  }

  let quoteTimer;
  let datesUnavailable = false;

  function setSubmitEnabled(enabled) {
    submitButtons.forEach((btn) => { btn.disabled = !enabled; });
  }

  function setSubmitting(activeMode) {
    submitButtons.forEach((btn) => { btn.disabled = true; });
    if (activeMode === "pay") {
      if (payIdle) payIdle.hidden = true;
      if (payBusy) payBusy.hidden = false;
    } else if (activeMode === "hold") {
      if (holdIdle) holdIdle.hidden = true;
      if (holdBusy) holdBusy.hidden = false;
    }
  }

  function resetSubmitting() {
    if (payIdle) payIdle.hidden = false;
    if (payBusy) payBusy.hidden = true;
    if (holdIdle) holdIdle.hidden = false;
    if (holdBusy) holdBusy.hidden = true;
  }

  async function refreshQuote() {
    showError("");
    datesUnavailable = false;
    const ci = checkin.value;
    const co = checkout.value;
    if (!ci || !co) {
      quoteBox.hidden = true;
      showHint(STR.select_dates);
      setSubmitEnabled(false);
      return;
    }
    const ciD = parseYmd(ci);
    const coD = parseYmd(co);
    if (coD <= ciD) {
      quoteBox.hidden = true;
      showHint(STR.min_stay);
      setSubmitEnabled(false);
      return;
    }
    if (diffDays(ciD, coD) < 1) {
      quoteBox.hidden = true;
      showHint(STR.min_stay);
      setSubmitEnabled(false);
      return;
    }

    if (apiBase) {
      const statusByDate = await ensureAvailability(slug, ciD, coD);
      if (isRangeUnavailable(ci, co, statusByDate)) {
        quoteBox.hidden = true;
        showHint("");
        showError(STR.unavailable || "Dates no longer available. Please pick different dates.");
        datesUnavailable = true;
        setSubmitEnabled(false);
        return;
      }
      showHint("");
    }

    if (!apiBase) {
      const nights = diffDays(ciD, coD);
      const base = parseInt(widget.dataset.base, 10);
      const currency = widget.dataset.currency || "GEL";
      quoteLines.innerHTML = `<li><span>${nights} × ${fmtMoney(base, currency)}</span><span>${fmtMoney(base * nights, currency)}</span></li>`;
      quoteAmt.textContent = fmtMoney(base * nights, currency);
      quoteBox.hidden = false;
      showHint("");
      setSubmitEnabled(true);
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
            infants: parseInt(infants?.value || "0", 10),
            non_refundable: !!nonRefundable.checked,
            coupon_code: normalizedCoupon() || undefined,
          }),
        });
        if (res.status === 409) {
          quoteBox.hidden = true;
          showHint("");
          showError(STR.unavailable || "Dates no longer available. Please pick different dates.");
          datesUnavailable = true;
          setSubmitEnabled(false);
          return;
        }
        if (!res.ok) throw new Error("quote failed");
        const q = await res.json();
        renderQuote(q);
        if (q.coupon_error === "invalid_coupon") {
          showError(STR.invalid_coupon || "Invalid coupon code.");
          setSubmitEnabled(false);
        } else {
          setSubmitEnabled(true);
        }
      } catch (_) {
        quoteBox.hidden = true;
        showHint("");
        setSubmitEnabled(false);
      }
    }, 250);
  }

  function adjustmentLabel(a) {
    if (a.kind === "single_night") return STR.single_night_surcharge || a.label;
    if (a.kind === "occupancy_single") return STR.single_occupancy_discount || a.label;
    if (a.kind === "occupancy_extra") {
      return (STR.extra_guests_surcharge || a.label).replace("{percent}", formatPercent(a.percent));
    }
    if (a.kind === "weekly") return STR.weekly_discount || a.label;
    if (a.kind === "non_refundable") return STR.non_refundable_discount || a.label;
    if (a.kind === "coupon") {
      const code = (a.label || "").replace(/^Coupon\s+/i, "") || "";
      return (STR.coupon_discount || "Coupon {code} ({percent}%)")
        .replace("{code}", code)
        .replace("{percent}", formatPercent(a.percent));
    }
    return a.label || a.kind;
  }

  function renderQuote(q) {
    const cur = q.currency || "GEL";
    const nightsCount = (q.nights || []).length;
    const nightlyAvg = nightsCount ? Math.round(q.subtotal / nightsCount) : 0;
    const lines = [];
    lines.push(`<li><span>${nightsCount} × ${fmtMoney(nightlyAvg, cur)}</span><span>${fmtMoney(q.subtotal, cur)}</span></li>`);
    for (const a of q.adjustments || []) {
      const label = adjustmentLabel(a);
      if (a.amount >= 0) {
        lines.push(`<li class="is-surcharge"><span>${label}</span><span>+${fmtMoney(a.amount, cur)}</span></li>`);
      } else {
        lines.push(`<li class="is-discount"><span>${label}</span><span>−${fmtMoney(Math.abs(a.amount), cur)}</span></li>`);
      }
    }
    for (const d of q.discounts || []) {
      lines.push(`<li class="is-discount"><span>${adjustmentLabel(d)}</span><span>−${fmtMoney(d.amount, cur)}</span></li>`);
    }
    quoteLines.innerHTML = lines.join("");
    quoteAmt.textContent = fmtMoney(q.total, cur);
    quoteBox.hidden = false;
    showHint("");
  }

  function inSelectedRange(key) {
    if (!checkin.value) return false;
    if (!checkout.value) return key === checkin.value;
    const start = parseYmd(checkin.value);
    const end = parseYmd(checkout.value);
    const d = parseYmd(key);
    return d >= start && d <= end;
  }

  function isRangeStart(key) {
    return checkin.value === key;
  }

  function isRangeEnd(key) {
    return checkout.value === key;
  }

  function canSelectAsCheckin(key, statusByDate) {
    if (parseYmd(key) < today) return false;
    return !isBlockedNight(key, statusByDate);
  }

  async function renderPicker() {
    if (!pickerMonths) return;
    const count = pickerMonthCount();
    const fetchEnd = endOfMonth(addMonths(viewStart, count - 1));
    const statusByDate = await ensureAvailability(slug, viewStart, fetchEnd);
    const dows = weekdayLabels();
    let html = "";

    for (let i = 0; i < count; i++) {
      const monthDate = addMonths(viewStart, i);
      const cells = monthGridCells(monthDate.getFullYear(), monthDate.getMonth(), statusByDate, today);
      const title = new Intl.DateTimeFormat(CFG.lang, { month: "long", year: "numeric" }).format(monthDate);
      html += `<div class="picker-month"><h3 class="picker-month__title">${title}</h3><div class="picker-month__grid">`;
      for (const d of dows) html += `<div class="picker-month__dow">${d}</div>`;
      for (const c of cells) {
        if (c.empty) {
          html += `<div class="picker-month__cell is-empty" aria-hidden="true"></div>`;
          continue;
        }
        const cls = ["picker-month__cell"];
        if (c.past) cls.push("is-past");
        if (c.status === "pending") cls.push("is-pending");
        if (c.status === "blocked") cls.push("is-blocked");
        if (!c.past && !isBlockedNight(c.key, statusByDate)) cls.push("is-selectable");
        if (inSelectedRange(c.key)) cls.push("is-in-range");
        if (isRangeStart(c.key)) cls.push("is-range-start");
        if (isRangeEnd(c.key)) cls.push("is-range-end");
        const disabled = c.past || (!awaitingCheckout && isBlockedNight(c.key, statusByDate));
        html += `<button type="button" class="${cls.join(" ")}" data-date="${c.key}"${disabled ? " disabled" : ""} aria-label="${c.key}">${c.day}</button>`;
      }
      html += `</div></div>`;
    }

    pickerMonths.innerHTML = html;
    pickerMonths.querySelectorAll(".picker-month__cell[data-date]").forEach((btn) => {
      btn.addEventListener("click", () => onPickDate(btn.dataset.date));
    });
    if (picker) picker.hidden = false;
  }

  function onPickDate(key) {
    const statusByDate = availabilityCache.dates;
    if (parseYmd(key) < today) return;

    if (!awaitingCheckout || !checkin.value) {
      if (!canSelectAsCheckin(key, statusByDate)) return;
      setDates(key, "", { refresh: false });
      updateDateDisplays();
      renderPicker();
      return;
    }

    const ciD = parseYmd(checkin.value);
    const coD = parseYmd(key);
    if (coD <= ciD) {
      setDates(key, "", { refresh: false });
      updateDateDisplays();
      renderPicker();
      return;
    }

    if (isRangeUnavailable(checkin.value, key, statusByDate)) {
      showError(STR.unavailable || "Dates no longer available. Please pick different dates.");
      setDates(key, "", { refresh: false });
      updateDateDisplays();
      renderPicker();
      return;
    }

    showError("");
    checkout.value = key;
    awaitingCheckout = false;
    updateDateDisplays();
    renderPicker();
    refreshQuote();
  }

  pickerPrev?.addEventListener("click", () => {
    const minView = startOfMonth(today);
    const next = addMonths(viewStart, -1);
    if (next < minView) return;
    viewStart = next;
    renderPicker();
  });

  pickerNext?.addEventListener("click", () => {
    viewStart = addMonths(viewStart, 1);
    renderPicker();
  });

  window.matchMedia("(min-width: 640px)").addEventListener("change", () => renderPicker());

  [guests, infants, nonRefundable, couponCode].forEach((el) => {
    if (!el) return;
    el.addEventListener("change", refreshQuote);
    el.addEventListener("input", refreshQuote);
  });
  couponCode?.addEventListener("blur", () => {
    if (couponCode.value) couponCode.value = couponCode.value.trim().toUpperCase();
  });

  async function submitBooking(paymentMode) {
    showError("");
    if (datesUnavailable) {
      showError(STR.unavailable || "Dates no longer available. Please pick different dates.");
      return;
    }
    const fd = new FormData(form);
    const ci = String(fd.get("checkin") || "");
    const co = String(fd.get("checkout") || "");
    const g = parseInt(String(fd.get("guests") || "2"), 10);
    const infantCount = parseInt(String(fd.get("infants") || "0"), 10);
    if (g + infantCount > maxGuests) {
      showError((STR.max_guests || "Maximum {n} guests for this apartment.").replace("{n}", String(maxGuests)));
      return;
    }
    if (!apiBase) { showError("Booking API not configured yet."); return; }

    setSubmitting(paymentMode);
    try {
      const res = await fetch(`${apiBase}/api/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartment_slug: slug,
          checkin: ci,
          checkout: co,
          guests_count: g,
          infants_count: infantCount,
          non_refundable: !!fd.get("non_refundable"),
          coupon_code: normalizedCoupon() || undefined,
          payment_mode: paymentMode,
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
        datesUnavailable = true;
        return;
      }
      if (res.status === 429) {
        showError(STR.rate_limited || "Too many booking attempts. Please wait 10 minutes and try again.");
        return;
      }
      if (!res.ok) {
        let detail = "";
        try { const j = await res.json(); detail = j.error || ""; } catch (_) {}
        if (detail === "payment_init_failed") {
          showError(STR.payment_failed || "Could not start payment. Please try again or contact us on WhatsApp.");
          return;
        }
        if (detail === "invalid_coupon") {
          showError(STR.invalid_coupon || "Invalid coupon code.");
          return;
        }
        throw new Error(detail || `booking failed ${res.status}`);
      }
      const data = await res.json();
      const ref = data.reference || data.booking_id || "—";

      if (data.payment_url) {
        successText.textContent = (STR.redirecting_payment || "Redirecting to secure payment…").replace("{ref}", ref);
        successBox.hidden = false;
        form.querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = true; });
        submitButtons.forEach((btn) => { btn.hidden = true; });
        subtitle.hidden = true;
        guestSection.hidden = true;
        quoteBox.hidden = true;
        hint.hidden = true;
        window.location.href = data.payment_url;
        return;
      }

      successText.textContent = (STR.success_text || "Dates held. Reference: {ref}.").replace("{ref}", ref);
      successBox.hidden = false;
      form.querySelectorAll("input, select, textarea, button").forEach((el) => { el.disabled = true; });
      submitButtons.forEach((btn) => { btn.hidden = true; });
      subtitle.hidden = true;
      guestSection.hidden = true;
      quoteBox.hidden = true;
      hint.hidden = true;
    } catch (_) {
      showError(STR.error_generic || "Something went wrong. Please try again or message us on WhatsApp.");
    } finally {
      resetSubmitting();
      if (!datesUnavailable && submitButtons.some((btn) => !btn.hidden)) setSubmitEnabled(true);
    }
  }

  submitPay?.addEventListener("click", () => submitBooking("pay"));
  submitHold?.addEventListener("click", () => submitBooking("hold"));
  form.addEventListener("submit", (e) => e.preventDefault());

  // Defaults: check-in +7 days, check-out +10 days
  const defOut = new Date(defIn.getFullYear(), defIn.getMonth(), defIn.getDate() + 3);
  checkin.value = ymd(defIn);
  checkout.value = ymd(defOut);
  awaitingCheckout = false;
  updateDateDisplays();
  renderPicker();
  refreshQuote();
}

initGallery();
initBooking();
