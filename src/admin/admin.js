// SkiLuxe admin SPA. Vanilla JS, hash router.
const CFG = window.SKILUXE_CONFIG || { apiBase: "" };
const API = CFG.apiBase;

const app = document.getElementById("app");

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v == null) continue;
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function fmtMoney(cents, currency) {
  try { return new Intl.NumberFormat("ka-GE", { style: "currency", currency: currency || "GEL", maximumFractionDigits: 0 }).format((cents || 0) / 100); }
  catch (_) { return "₾" + Math.round((cents || 0) / 100); }
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso + "T00:00:00")); }
  catch (_) { return iso; }
}
function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString();
}
function toast(message, kind = "ok") {
  const t = el("div", { class: `toast toast--${kind}` }, message);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

async function api(path, options = {}) {
  const init = {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  };
  if (init.body && typeof init.body !== "string") init.body = JSON.stringify(init.body);
  const res = await fetch(`${API}${path}`, init);
  if (res.status === 401) { location.hash = "#/login"; throw new Error("unauthorized"); }
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch (_) {}
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return null;
  return await res.json();
}

// ---------- Router ----------
const routes = {
  "/login": renderLogin,
  "/": renderDashboard,
  "/bookings": renderBookings,
  "/pricing": renderPricing,
  "/promotions": renderPromotions,
  "/coupons": renderCoupons,
  "/ical": renderIcal,
  "/conflicts": renderConflicts,
  "/audit": renderAudit,
};

function parseHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const parts = h.split("/").filter(Boolean);
  return { path: "/" + parts.join("/"), parts };
}

async function navigate() {
  const { path, parts } = parseHash();
  // Booking detail
  if (parts[0] === "bookings" && parts[1]) {
    return renderBookingDetail(parts[1]);
  }
  const handler = routes[path] || routes["/"];
  try { await handler(); }
  catch (e) { console.error(e); }
}

window.addEventListener("hashchange", navigate);

// ---------- Layout ----------
function layout(content, active = "") {
  app.innerHTML = "";
  app.appendChild(el("div", { class: "layout" }, [
    el("aside", { class: "side" }, [
      el("div", { class: "brand", html: "SkiLuxe<small>ADMIN</small>" }),
      el("nav", { class: "nav" }, [
        navLink("#/", "Dashboard", active === "dashboard"),
        navLink("#/bookings", "Bookings", active === "bookings"),
        navLink("#/pricing", "Pricing", active === "pricing"),
        navLink("#/promotions", "Promotions", active === "promotions"),
        navLink("#/coupons", "Coupons", active === "coupons"),
        navLink("#/ical", "iCal feeds", active === "ical"),
        navLink("#/conflicts", "Conflicts", active === "conflicts"),
        navLink("#/audit", "Audit log", active === "audit"),
      ]),
      el("div", { class: "side__foot" }, [
        el("button", { onClick: async () => { await api("/api/admin/logout", { method: "POST" }); location.hash = "#/login"; } }, "Sign out"),
      ]),
    ]),
    el("main", { class: "main" }, content),
  ]));
}

function navLink(href, label, isActive) {
  return el("a", { href, class: isActive ? "is-active" : "" }, label);
}

// ---------- Pages ----------
async function ensureSession() {
  try { await api("/api/admin/me"); return true; }
  catch (_) { return false; }
}

async function renderLogin() {
  app.innerHTML = "";
  const form = el("form", { class: "login__form" }, [
    el("h1", {}, "Sign in"),
    el("p", {}, "SkiLuxe administration."),
    el("input", { type: "password", name: "password", placeholder: "Password", required: true, style: "width:100%;margin-bottom:12px" }),
    el("button", { class: "btn", type: "submit", style: "width:100%" }, "Sign in"),
  ]);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = new FormData(form).get("password");
    try {
      await api("/api/admin/login", { method: "POST", body: { password: pw } });
      location.hash = "#/";
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("429") || msg.includes("rate_limited")) {
        toast("Too many attempts — wait an hour or ask to clear rate limit", "err");
      } else if (msg.includes("hash_misconfigured")) {
        toast("Password hash broken on server — run scripts/set-admin-password.sh", "err");
      } else if (msg.includes("503") || msg.includes("not_configured")) {
        toast("Admin password not configured on server", "err");
      } else if (msg.includes("500") || msg.includes("internal_error")) {
        toast("Server error — reset ADMIN_PASSWORD_HASH (see DEPLOYMENT.md)", "err");
      } else {
        toast("Invalid password", "err");
      }
    }
  });
  app.appendChild(el("div", { class: "login" }, [
    el("div", { class: "login__card" }, form),
  ]));
}

async function renderDashboard() {
  if (!(await ensureSession())) return;
  const [bk, conflicts] = await Promise.all([
    api("/api/admin/bookings?status=pending"),
    api("/api/admin/conflicts").catch(() => ({ conflicts: [] })),
  ]);
  layout([
    el("h1", { class: "page-title" }, "Dashboard"),
    el("div", { class: "card" }, [
      el("h2", {}, `Pending bookings (${bk.bookings.length})`),
      bk.bookings.length === 0
        ? el("p", { class: "empty" }, "Nothing to confirm right now.")
        : bookingsTable(bk.bookings.slice(0, 10)),
    ]),
    el("div", { class: "card" }, [
      el("h2", {}, `Conflicts (${conflicts.conflicts.length})`),
      conflicts.conflicts.length === 0
        ? el("p", { class: "empty" }, "No overlaps between our bookings and inbound iCal feeds.")
        : conflictsTable(conflicts.conflicts),
    ]),
  ], "dashboard");
}

function statusBadge(status) {
  return el("span", { class: `badge badge--${status}` }, status);
}

function bookingsTable(rows) {
  const table = el("table", {}, [
    el("thead", {}, el("tr", {}, [
      el("th", {}, "Ref"),
      el("th", {}, "Apartment"),
      el("th", {}, "Dates"),
      el("th", {}, "Guest"),
      el("th", {}, "Total"),
      el("th", {}, "Status"),
      el("th", {}, ""),
    ])),
    el("tbody", {}, rows.map((b) => el("tr", {}, [
      el("td", {}, `SL-${String(b.id).padStart(5, "0")}`),
      el("td", {}, [b.apartment_slug || "—"]),
      el("td", {}, `${fmtDate(b.checkin)} → ${fmtDate(b.checkout)}`),
      el("td", {}, [el("div", {}, b.guest_name), el("small", { style: "color:var(--muted)" }, b.guest_email)]),
      el("td", {}, fmtMoney(b.total_amount, b.currency)),
      el("td", {}, statusBadge(b.status)),
      el("td", {}, el("a", { href: `#/bookings/${b.id}`, class: "btn btn--ghost btn--sm" }, "Open")),
    ]))),
  ]);
  return table;
}

function conflictsTable(rows) {
  return el("table", {}, [
    el("thead", {}, el("tr", {}, [
      el("th", {}, "Booking"),
      el("th", {}, "Apartment"),
      el("th", {}, "Our dates"),
      el("th", {}, "External"),
      el("th", {}, "Source"),
      el("th", {}, ""),
    ])),
    el("tbody", {}, rows.map((r) => el("tr", {}, [
      el("td", {}, `SL-${String(r.booking_id).padStart(5, "0")}`),
      el("td", {}, r.apartment_slug),
      el("td", {}, `${fmtDate(r.checkin)} → ${fmtDate(r.checkout)}`),
      el("td", {}, `${fmtDate(r.event_start)} → ${fmtDate(r.event_end)}`),
      el("td", {}, r.source_label),
      el("td", {}, el("a", { href: `#/bookings/${r.booking_id}`, class: "btn btn--ghost btn--sm" }, "Open")),
    ]))),
  ]);
}

async function renderBookings() {
  if (!(await ensureSession())) return;
  const data = await api("/api/admin/bookings");
  layout([
    el("h1", { class: "page-title" }, `Bookings (${data.bookings.length})`),
    el("div", { class: "card" }, data.bookings.length === 0
      ? el("p", { class: "empty" }, "No bookings yet.")
      : bookingsTable(data.bookings)),
  ], "bookings");
}

async function renderBookingDetail(id) {
  if (!(await ensureSession())) return;
  const b = await api(`/api/admin/bookings/${id}`);
  const quote = (() => { try { return JSON.parse(b.quote_json || "{}"); } catch (_) { return {}; } })();
  const actions = [];
  if (b.status === "pending") {
    actions.push(el("button", { class: "btn", onClick: async () => {
      await api(`/api/admin/bookings/${b.id}/confirm`, { method: "POST" });
      toast("Confirmed");
      location.hash = "#/bookings";
    } }, "Confirm booking"));
  }
  if (b.status !== "cancelled" && b.status !== "expired") {
    actions.push(el("button", { class: "btn btn--danger", onClick: async () => {
      const reason = prompt("Reason (optional)") || "";
      await api(`/api/admin/bookings/${b.id}/cancel`, { method: "POST", body: { reason } });
      toast("Cancelled");
      location.hash = "#/bookings";
    } }, "Cancel"));
  }

  layout([
    el("a", { href: "#/bookings", class: "btn btn--ghost btn--sm", style: "margin-bottom:16px" }, "← All bookings"),
    el("h1", { class: "page-title" }, `Booking SL-${String(b.id).padStart(5, "0")} `),
    el("div", { class: "card" }, [
      el("div", { style: "display:flex;gap:16px;align-items:center;margin-bottom:16px" }, [statusBadge(b.status)]),
      kv("Apartment", `${b.apartment_label} (${b.apartment_slug})`),
      kv("Check-in", fmtDate(b.checkin)),
      kv("Check-out", fmtDate(b.checkout)),
      kv("Guests", String(b.guests_count)),
      kv("Total", fmtMoney(b.total_amount, b.currency)),
      kv("Non-refundable", b.non_refundable ? "yes" : "no"),
      kv("Hold expires", fmtTs(b.hold_expires_at)),
      kv("Created", fmtTs(b.created_at)),
    ]),
    el("div", { class: "card" }, [
      el("h2", {}, "Guest"),
      kv("Name", b.guest_name),
      kv("Email", b.guest_email),
      kv("Phone", b.guest_phone || "—"),
      kv("Language", b.guest_lang || "—"),
      kv("Notes", b.notes || "—"),
    ]),
    quote.nights ? el("div", { class: "card" }, [
      el("h2", {}, "Quote breakdown"),
      el("table", {}, [
        el("thead", {}, el("tr", {}, [el("th", {}, "Date"), el("th", {}, "Rate")])),
        el("tbody", {}, (quote.nights || []).map((n) => el("tr", {}, [
          el("td", {}, n.date),
          el("td", {}, fmtMoney(n.rate, b.currency)),
        ]))),
      ]),
      ...(quote.adjustments || []).map((a) => kv(
        a.label || a.kind,
        `${a.amount >= 0 ? "+" : "−"}${fmtMoney(Math.abs(a.amount), b.currency)}`
      )),
      ...(quote.discounts || []).map((d) => kv(d.label || d.kind, `−${fmtMoney(d.amount, b.currency)}`)),
      ...(quote.paying_guests != null ? [kv("Paying guests", String(quote.paying_guests))] : []),
      ...(quote.infants ? [kv("Infants (free)", String(quote.infants))] : []),
      el("div", { style: "margin-top:12px;display:flex;justify-content:space-between;font-weight:600" }, [
        el("span", {}, "Subtotal"),
        el("span", {}, fmtMoney(quote.subtotal, b.currency)),
      ]),
      el("div", { style: "display:flex;justify-content:space-between;font-weight:600" }, [
        el("span", {}, "Total"),
        el("span", {}, fmtMoney(quote.total, b.currency)),
      ]),
    ]) : null,
    actions.length > 0 ? el("div", { class: "card", style: "display:flex;gap:12px" }, actions) : null,
  ], "bookings");
}

function kv(label, value) {
  return el("div", { style: "display:grid;grid-template-columns:160px 1fr;gap:8px;padding:6px 0;border-bottom:1px solid var(--snow-2)" }, [
    el("span", { style: "color:var(--muted);font-size:0.85rem;text-transform:uppercase;letter-spacing:0.06em" }, label),
    el("span", {}, value),
  ]);
}

async function renderPricing() {
  if (!(await ensureSession())) return;
  const [apts, seasons, overrides] = await Promise.all([
    api("/api/admin/apartments"),
    api("/api/admin/seasons"),
    api("/api/admin/date-overrides"),
  ]);

  layout([
    el("h1", { class: "page-title" }, "Pricing"),
    el("div", { class: "card" }, [
      el("h2", {}, "Apartment base rates (per night, minor units)"),
      el("table", {}, [
        el("thead", {}, el("tr", {}, [el("th", {}, "Apartment"), el("th", {}, "Base rate"), el("th", {}, "Currency"), el("th", {}, "Max guests"), el("th", {}, "")])),
        el("tbody", {}, apts.apartments.map((a) => apartmentRow(a))),
      ]),
    ]),
    el("div", { class: "card" }, [
      el("h2", {}, "Seasons"),
      seasonForm(apts.apartments),
      el("table", {}, [
        el("thead", {}, el("tr", {}, [
          el("th", {}, "Apartment"), el("th", {}, "Name"), el("th", {}, "Start"), el("th", {}, "End"),
          el("th", {}, "× / Override"), el("th", {}, "Priority"), el("th", {}, ""),
        ])),
        el("tbody", {}, seasons.seasons.map((s) => seasonRow(s, apts.apartments))),
      ]),
    ]),
    el("div", { class: "card" }, [
      el("h2", {}, "Per-date overrides"),
      overrideForm(apts.apartments),
      el("table", {}, [
        el("thead", {}, el("tr", {}, [el("th", {}, "Apartment"), el("th", {}, "Date"), el("th", {}, "Rate"), el("th", {}, "Note"), el("th", {}, "")])),
        el("tbody", {}, overrides.overrides.map((o) => el("tr", {}, [
          el("td", {}, apts.apartments.find((a) => a.id === o.apartment_id)?.slug || o.apartment_id),
          el("td", {}, o.date),
          el("td", {}, fmtMoney(o.rate, apts.apartments.find((a) => a.id === o.apartment_id)?.currency || "GEL")),
          el("td", {}, o.note || ""),
          el("td", {}, el("button", { class: "btn btn--ghost btn--sm", onClick: async () => {
            await api(`/api/admin/date-overrides/${o.id}`, { method: "DELETE" });
            renderPricing();
          } }, "Remove")),
        ]))),
      ]),
    ]),
  ], "pricing");
}

function apartmentRow(a) {
  const baseInput = el("input", { type: "number", value: a.base_rate, style: "width:100px" });
  const guestsInput = el("input", { type: "number", value: a.max_guests, style: "width:60px" });
  const currencyInput = el("input", { value: a.currency, style: "width:70px" });
  return el("tr", {}, [
    el("td", {}, [el("strong", {}, a.unit_label), el("br", {}), el("small", { style: "color:var(--muted)" }, `${a.complex} · ${a.slug}`)]),
    el("td", {}, baseInput),
    el("td", {}, currencyInput),
    el("td", {}, guestsInput),
    el("td", {}, el("button", { class: "btn btn--sm", onClick: async () => {
      try {
        await api(`/api/admin/apartments/${a.id}`, { method: "PATCH", body: {
          base_rate: parseInt(baseInput.value, 10),
          currency: currencyInput.value,
          max_guests: parseInt(guestsInput.value, 10),
        }});
        toast("Saved");
      } catch (e) { toast("Save failed", "err"); }
    } }, "Save")),
  ]);
}

function seasonForm(apartments) {
  const f = el("form", { style: "display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:16px" }, [
    apartmentSelect(apartments, "apartment_id", true),
    el("input", { name: "name", placeholder: "Season name", required: true }),
    el("input", { name: "start_date", type: "date", required: true }),
    el("input", { name: "end_date", type: "date", required: true }),
    el("input", { name: "multiplier", type: "number", step: "0.05", value: "1.0", required: true }),
    el("input", { name: "priority", type: "number", value: "10" }),
    el("button", { class: "btn btn--sm", type: "submit" }, "Add season"),
  ]);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const body = Object.fromEntries(fd);
    body.apartment_id = body.apartment_id === "" ? null : parseInt(body.apartment_id, 10);
    body.multiplier = parseFloat(body.multiplier);
    body.priority = parseInt(body.priority, 10);
    await api("/api/admin/seasons", { method: "POST", body });
    toast("Season added");
    renderPricing();
  });
  return f;
}

function seasonRow(s, apartments) {
  const cur = s.apartment_id == null
    ? "GEL"
    : (apartments.find((a) => a.id === s.apartment_id)?.currency || "GEL");
  return el("tr", {}, [
    el("td", {}, s.apartment_id == null ? "All" : (apartments.find((a) => a.id === s.apartment_id)?.slug || s.apartment_id)),
    el("td", {}, s.name),
    el("td", {}, s.start_date),
    el("td", {}, s.end_date),
    el("td", {}, s.override_rate ? `→ ${fmtMoney(s.override_rate, cur)}` : `×${s.multiplier}`),
    el("td", {}, String(s.priority)),
    el("td", {}, el("button", { class: "btn btn--ghost btn--sm", onClick: async () => {
      if (!confirm("Delete season?")) return;
      await api(`/api/admin/seasons/${s.id}`, { method: "DELETE" });
      renderPricing();
    } }, "Remove")),
  ]);
}

function overrideForm(apartments) {
  const f = el("form", { style: "display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:16px" }, [
    apartmentSelect(apartments, "apartment_id"),
    el("input", { name: "date", type: "date", required: true }),
    el("input", { name: "rate", type: "number", placeholder: "Rate (cents)", required: true }),
    el("input", { name: "note", placeholder: "Note (e.g. NYE)" }),
    el("button", { class: "btn btn--sm", type: "submit" }, "Add override"),
  ]);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const body = Object.fromEntries(fd);
    body.apartment_id = parseInt(body.apartment_id, 10);
    body.rate = parseInt(body.rate, 10);
    await api("/api/admin/date-overrides", { method: "POST", body });
    toast("Override added");
    renderPricing();
  });
  return f;
}

function apartmentSelect(apartments, name = "apartment_id", allowAll = false) {
  const s = el("select", { name }, [
    allowAll ? el("option", { value: "" }, "All apartments") : null,
    ...apartments.map((a) => el("option", { value: String(a.id) }, `${a.slug}`)),
  ]);
  return s;
}

async function renderPromotions() {
  if (!(await ensureSession())) return;
  const [apts, proms] = await Promise.all([
    api("/api/admin/apartments"),
    api("/api/admin/promotions"),
  ]);

  layout([
    el("h1", { class: "page-title" }, "Promotions"),
    el("div", { class: "card" }, [
      el("h2", {}, "Active promotions"),
      proms.promotions.length === 0
        ? el("p", { class: "empty" }, "No promotions configured.")
        : el("table", {}, [
          el("thead", {}, el("tr", {}, [
            el("th", {}, "Apartment"), el("th", {}, "Kind"), el("th", {}, "Params"),
            el("th", {}, "Stackable"), el("th", {}, "Active"), el("th", {}, ""),
          ])),
          el("tbody", {}, proms.promotions.map((p) => promoRow(p, apts.apartments))),
        ]),
    ]),
    el("div", { class: "card" }, [
      el("h2", {}, "Add promotion"),
      promoForm(apts.apartments),
    ]),
  ], "promotions");
}

function promoRow(p, apartments) {
  return el("tr", {}, [
    el("td", {}, p.apartment_id == null ? "All" : (apartments.find((a) => a.id === p.apartment_id)?.slug || p.apartment_id)),
    el("td", {}, p.kind),
    el("td", {}, el("code", { style: "font-size:0.8rem" }, p.params_json)),
    el("td", {}, p.stackable ? "yes" : "no"),
    el("td", {}, el("button", { class: "btn btn--ghost btn--sm", onClick: async () => {
      await api(`/api/admin/promotions/${p.id}`, { method: "PATCH", body: { active: !p.active } });
      renderPromotions();
    } }, p.active ? "On" : "Off")),
    el("td", {}, el("button", { class: "btn btn--ghost btn--sm", onClick: async () => {
      if (!confirm("Delete promotion?")) return;
      await api(`/api/admin/promotions/${p.id}`, { method: "DELETE" });
      renderPromotions();
    } }, "Remove")),
  ]);
}

function promoForm(apartments) {
  const f = el("form", { style: "display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px" }, [
    apartmentSelect(apartments, "apartment_id", true),
    el("select", { name: "kind" }, [
      el("option", { value: "weekly" }, "Weekly (min nights)"),
      el("option", { value: "non_refundable" }, "Non-refundable"),
    ]),
    el("input", { name: "percent", type: "number", placeholder: "Percent (e.g. 10)", required: true }),
    el("input", { name: "min_nights", type: "number", placeholder: "Min nights (weekly only)", value: "7" }),
    el("button", { class: "btn btn--sm", type: "submit" }, "Add"),
  ]);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const kind = String(fd.get("kind"));
    const params = { percent: parseFloat(fd.get("percent")) };
    if (kind === "weekly") params.min_nights = parseInt(fd.get("min_nights"), 10);
    const body = {
      apartment_id: fd.get("apartment_id") ? parseInt(fd.get("apartment_id"), 10) : null,
      kind, active: true, params, stackable: true,
    };
    await api("/api/admin/promotions", { method: "POST", body });
    toast("Promotion added");
    renderPromotions();
  });
  return f;
}

async function renderCoupons() {
  if (!(await ensureSession())) return;
  const { coupons } = await api("/api/admin/coupons");

  layout([
    el("h1", { class: "page-title" }, "Coupon codes"),
    el("div", { class: "card" }, [
      el("h2", {}, "Active codes"),
      coupons.length === 0
        ? el("p", { class: "empty" }, "No coupon codes yet.")
        : el("table", {}, [
          el("thead", {}, el("tr", {}, [
            el("th", {}, "Code"), el("th", {}, "Discount"), el("th", {}, "Active"), el("th", {}, ""),
          ])),
          el("tbody", {}, coupons.map((c) => couponRow(c))),
        ]),
    ]),
    el("div", { class: "card" }, [
      el("h2", {}, "Add coupon"),
      couponForm(),
    ]),
  ], "coupons");
}

function couponRow(c) {
  return el("tr", {}, [
    el("td", {}, el("code", {}, c.code)),
    el("td", {}, `${c.percent}%`),
    el("td", {}, el("button", { class: "btn btn--ghost btn--sm", onClick: async () => {
      await api(`/api/admin/coupons/${c.id}`, { method: "PATCH", body: { active: !c.active } });
      renderCoupons();
    } }, c.active ? "On" : "Off")),
    el("td", {}, el("button", { class: "btn btn--ghost btn--sm", onClick: async () => {
      if (!confirm("Delete coupon?")) return;
      await api(`/api/admin/coupons/${c.id}`, { method: "DELETE" });
      renderCoupons();
    } }, "Remove")),
  ]);
}

function couponForm() {
  const f = el("form", { style: "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px" }, [
    el("input", { name: "code", type: "text", placeholder: "Code (e.g. SKI10)", required: true, style: "text-transform:uppercase" }),
    el("input", { name: "percent", type: "number", placeholder: "Discount % (e.g. 10)", min: "1", max: "90", step: "0.1", required: true }),
    el("button", { class: "btn btn--sm", type: "submit" }, "Add"),
  ]);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const body = {
      code: String(fd.get("code") || "").trim().toUpperCase(),
      percent: parseFloat(fd.get("percent")),
      active: true,
    };
    try {
      await api("/api/admin/coupons", { method: "POST", body });
      toast("Coupon added");
      f.reset();
      renderCoupons();
    } catch (err) {
      toast(err.message.includes("duplicate") ? "Code already exists" : "Could not add coupon", "err");
    }
  });
  return f;
}

async function renderIcal() {
  if (!(await ensureSession())) return;
  const [apts, sources] = await Promise.all([
    api("/api/admin/apartments"),
    api("/api/admin/ical-sources"),
  ]);

  layout([
    el("h1", { class: "page-title" }, "iCal feeds"),
    el("div", { class: "card" }, [
      el("h2", {}, "Outbound feeds (subscribe Booking.com to these URLs)"),
      el("ul", { style: "list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px" },
        apts.apartments.map((a) => {
          const url = `${API}/api/ical/${a.slug}.ics`;
          return el("li", { style: "padding:10px;background:var(--snow-2);border-radius:6px;display:flex;justify-content:space-between;align-items:center;gap:12px" }, [
            el("span", {}, [el("strong", {}, a.slug), el("br", {}), el("code", { style: "font-size:0.85rem" }, url)]),
            el("button", { class: "btn btn--sm", onClick: () => { navigator.clipboard.writeText(url); toast("Copied"); } }, "Copy"),
          ]);
        })
      ),
    ]),
    el("div", { class: "card" }, [
      el("h2", {}, "Inbound feeds (from Booking.com / Airbnb etc.)"),
      icalSourceForm(apts.apartments),
      sources.sources.length === 0
        ? el("p", { class: "empty" }, "No inbound feeds yet. Add the Booking.com iCal URL for each apartment above.")
        : el("table", {}, [
            el("thead", {}, el("tr", {}, [
              el("th", {}, "Apartment"), el("th", {}, "Label"), el("th", {}, "Last sync"),
              el("th", {}, "Status"), el("th", {}, "Active"), el("th", {}, ""),
            ])),
            el("tbody", {}, sources.sources.map((s) => icalSourceRow(s))),
          ]),
    ]),
  ], "ical");
}

function icalSourceRow(s) {
  return el("tr", {}, [
    el("td", {}, s.apartment_slug),
    el("td", {}, [el("div", {}, s.label), el("small", { style: "color:var(--muted);word-break:break-all" }, s.url)]),
    el("td", {}, fmtTs(s.last_synced_at)),
    el("td", {}, s.last_status || "—"),
    el("td", {}, el("button", { class: "btn btn--ghost btn--sm", onClick: async () => {
      await api(`/api/admin/ical-sources/${s.id}`, { method: "PATCH", body: { active: !s.active } });
      renderIcal();
    } }, s.active ? "On" : "Off")),
    el("td", {}, [
      el("button", { class: "btn btn--sm", style: "margin-inline-end:6px", onClick: async () => {
        const r = await api(`/api/admin/ical-sources/${s.id}/sync-now`, { method: "POST" });
        toast(r.ok ? `Synced ${r.events || ""} events` : `Failed: ${r.error || ""}`, r.ok ? "ok" : "err");
        renderIcal();
      } }, "Sync now"),
      el("button", { class: "btn btn--ghost btn--sm", onClick: async () => {
        if (!confirm("Remove this iCal source?")) return;
        await api(`/api/admin/ical-sources/${s.id}`, { method: "DELETE" });
        renderIcal();
      } }, "Remove"),
    ]),
  ]);
}

function icalSourceForm(apartments) {
  const f = el("form", { style: "display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:16px" }, [
    apartmentSelect(apartments, "apartment_id"),
    el("input", { name: "label", placeholder: "Booking.com / Airbnb / ...", required: true }),
    el("input", { name: "url", type: "url", placeholder: "https://admin.booking.com/...ics", required: true }),
    el("button", { class: "btn btn--sm", type: "submit" }, "Add feed"),
  ]);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const body = {
      apartment_id: parseInt(fd.get("apartment_id"), 10),
      label: String(fd.get("label")),
      url: String(fd.get("url")),
      active: true,
    };
    await api("/api/admin/ical-sources", { method: "POST", body });
    toast("Feed added");
    renderIcal();
  });
  return f;
}

async function renderConflicts() {
  if (!(await ensureSession())) return;
  const data = await api("/api/admin/conflicts");
  layout([
    el("h1", { class: "page-title" }, `Conflicts (${data.conflicts.length})`),
    el("div", { class: "card" }, data.conflicts.length === 0
      ? el("p", { class: "empty" }, "No conflicts. All bookings and inbound feeds line up.")
      : conflictsTable(data.conflicts)),
  ], "conflicts");
}

async function renderAudit() {
  if (!(await ensureSession())) return;
  const data = await api("/api/admin/audit");
  layout([
    el("h1", { class: "page-title" }, "Audit log"),
    el("div", { class: "card" }, el("table", {}, [
      el("thead", {}, el("tr", {}, [el("th", {}, "Time"), el("th", {}, "Actor"), el("th", {}, "Action"), el("th", {}, "Entity"), el("th", {}, "Detail")])),
      el("tbody", {}, data.events.map((e) => el("tr", {}, [
        el("td", {}, fmtTs(e.ts)),
        el("td", {}, e.actor),
        el("td", {}, e.action),
        el("td", {}, e.entity ? `${e.entity}#${e.entity_id}` : "—"),
        el("td", {}, el("code", { style: "font-size:0.78rem" }, e.detail_json || "")),
      ]))),
    ])),
  ], "audit");
}

navigate();
