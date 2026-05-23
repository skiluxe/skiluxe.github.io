import type { Apartment, DateOverride, Promotion, QuoteResult, Season } from "../types";

export const BASE_OCCUPANCY = 2;
const SINGLE_NIGHT_SURCHARGE = 0.2;
const SINGLE_OCCUPANCY_DISCOUNT = 0.05;
const EXTRA_GUEST_SURCHARGE = 0.1;

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const s = parseDate(start);
  const e = parseDate(end);
  for (let t = s.getTime(); t < e.getTime(); t += 86400000) out.push(ymd(new Date(t)));
  return out;
}
function nightsBetween(start: string, end: string): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}

function findSeason(seasons: Season[], date: string): Season | null {
  let best: Season | null = null;
  for (const s of seasons) {
    if (date >= s.start_date && date <= s.end_date) {
      if (!best || s.priority > best.priority) best = s;
    }
  }
  return best;
}

function occupancyAdjustment(
  base: number,
  payingGuests: number
): QuoteResult["adjustments"][number] | null {
  if (payingGuests < 1) return null;
  if (payingGuests === 1) {
    return {
      kind: "occupancy_single",
      label: "Single occupancy (-5%)",
      amount: -Math.round(base * SINGLE_OCCUPANCY_DISCOUNT),
      percent: 5,
    };
  }
  if (payingGuests > BASE_OCCUPANCY) {
    const extra = payingGuests - BASE_OCCUPANCY;
    const percent = extra * 10; // 10% per guest above base occupancy (2)
    return {
      kind: "occupancy_extra",
      label: `Extra guests (+${percent}%)`,
      amount: Math.round(base * extra * EXTRA_GUEST_SURCHARGE),
      percent,
    };
  }
  return null;
}

export function quote(
  apartment: Apartment,
  seasons: Season[],
  overridesByDate: Map<string, DateOverride>,
  promos: Promotion[],
  checkin: string,
  checkout: string,
  flags: {
    non_refundable?: boolean;
    paying_guests?: number;
    infants?: number;
    coupon?: { code: string; percent: number } | null;
  } = {}
): QuoteResult {
  const payingGuests = Math.max(1, flags.paying_guests ?? BASE_OCCUPANCY);
  const infants = Math.max(0, flags.infants ?? 0);
  const dates = eachDate(checkin, checkout);
  const nights: { date: string; rate: number }[] = [];
  for (const d of dates) {
    const override = overridesByDate.get(d);
    let rate = apartment.base_rate;
    if (override) {
      rate = override.rate;
    } else {
      const season = findSeason(seasons, d);
      if (season) {
        rate = season.override_rate != null ? season.override_rate : Math.round(apartment.base_rate * season.multiplier);
      }
    }
    nights.push({ date: d, rate });
  }

  const subtotal = nights.reduce((acc, n) => acc + n.rate, 0);
  const totalNights = nights.length;
  const adjustments: QuoteResult["adjustments"] = [];

  let adjustedBase = subtotal;
  if (totalNights === 1) {
    const amount = Math.round(subtotal * SINGLE_NIGHT_SURCHARGE);
    adjustments.push({
      kind: "single_night",
      label: "Single-night stay (+20%)",
      amount,
      percent: 20,
    });
    adjustedBase += amount;
  }

  const occ = occupancyAdjustment(adjustedBase, payingGuests);
  if (occ) adjustments.push(occ);

  const afterAdjustments = subtotal + adjustments.reduce((acc, a) => acc + a.amount, 0);
  const discounts: QuoteResult["discounts"] = [];

  const weekly = promos.find((p) => p.kind === "weekly" && p.active);
  if (weekly) {
    const params = parseJson(weekly.params_json);
    const minNights = params.min_nights || 7;
    const percent = params.percent || 10;
    if (totalNights >= minNights) {
      const amount = Math.round((afterAdjustments * percent) / 100);
      discounts.push({ kind: "weekly", label: "Weekly stay", amount, percent });
    }
  }

  const nr = promos.find((p) => p.kind === "non_refundable" && p.active);
  if (nr && flags.non_refundable) {
    const params = parseJson(nr.params_json);
    const percent = params.percent || 15;
    const alreadyApplied = discounts.reduce((a, d) => a + d.amount, 0);
    const base = nr.stackable ? afterAdjustments - alreadyApplied : afterAdjustments;
    const amount = Math.round((base * percent) / 100);
    discounts.push({ kind: "non_refundable", label: "Non-refundable", amount, percent });
  }

  if (flags.coupon) {
    const alreadyApplied = discounts.reduce((a, d) => a + d.amount, 0);
    const base = afterAdjustments - alreadyApplied;
    const amount = Math.round((base * flags.coupon.percent) / 100);
    discounts.push({
      kind: "coupon",
      label: `Coupon ${flags.coupon.code}`,
      amount,
      percent: flags.coupon.percent,
    });
  }

  const total = afterAdjustments - discounts.reduce((acc, d) => acc + d.amount, 0);

  return {
    nights,
    subtotal,
    adjustments,
    discounts,
    total,
    currency: apartment.currency,
    apartment_slug: apartment.slug,
    paying_guests: payingGuests,
    infants,
    computed_at: Date.now(),
    coupon_code: flags.coupon?.code ?? null,
  };
}

function parseJson(s: string): { [k: string]: any } {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

export { nightsBetween, eachDate, ymd };
