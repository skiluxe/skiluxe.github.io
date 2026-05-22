import { z } from "zod";

const ymd = /^\d{4}-\d{2}-\d{2}$/;
const dateString = z.string().regex(ymd, "Date must be YYYY-MM-DD");

export const QuoteInput = z.object({
  checkin: dateString,
  checkout: dateString,
  /** Paying guests aged 3+ (same rate as adults). */
  guests: z.number().int().positive().max(20).default(2),
  /** Infants aged 0–3 (free, not counted in occupancy pricing). */
  infants: z.number().int().min(0).max(10).default(0),
  non_refundable: z.boolean().optional().default(false),
});

export const BookingInput = z.object({
  apartment_slug: z.string().min(1).max(80),
  checkin: dateString,
  checkout: dateString,
  /** Paying guests aged 3+ (same rate as adults). */
  guests_count: z.number().int().positive().max(20),
  infants_count: z.number().int().min(0).max(10).optional().default(0),
  non_refundable: z.boolean().optional().default(false),
  guest: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(180),
    phone: z.string().max(40).optional().default(""),
    lang: z.string().max(8).optional().default("en"),
    notes: z.string().max(2000).optional().default(""),
  }),
});

export const LoginInput = z.object({
  password: z.string().min(1).max(200),
});

export const SeasonInput = z.object({
  apartment_id: z.number().int().nullable().optional(),
  name: z.string().min(1).max(80),
  start_date: dateString,
  end_date: dateString,
  multiplier: z.number().positive().default(1.0),
  override_rate: z.number().int().nonnegative().nullable().optional(),
  priority: z.number().int().default(0),
});

export const PromotionInput = z.object({
  apartment_id: z.number().int().nullable().optional(),
  kind: z.enum(["weekly", "non_refundable"]),
  active: z.boolean().default(true),
  params: z.object({
    min_nights: z.number().int().positive().optional(),
    percent: z.number().positive().max(90),
  }),
  stackable: z.boolean().default(true),
});

export const IcalSourceInput = z.object({
  apartment_id: z.number().int(),
  label: z.string().min(1).max(80),
  url: z.string().url(),
  active: z.boolean().default(true),
});

export const DateOverrideInput = z.object({
  apartment_id: z.number().int(),
  date: dateString,
  rate: z.number().int().nonnegative(),
  note: z.string().max(200).optional(),
});
