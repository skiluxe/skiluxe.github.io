export interface Env {
  DB: D1Database;
  KV: KVNamespace;

  SITE_ORIGIN: string;
  ALT_SITE_ORIGIN: string;
  HOLD_HOURS: string;
  ICAL_OWNER_EMAIL: string;

  ADMIN_PASSWORD_HASH: string;
  SESSION_SECRET: string;
  OWNER_EMAIL: string;
  OWNER_WHATSAPP_PHONE: string;
  CALLMEBOT_API_KEY: string;
  MAIL_FROM: string;
  MAIL_DKIM_DOMAIN: string;
  MAIL_DKIM_SELECTOR: string;
  MAIL_DKIM_PRIVATE_KEY: string;
  /** MailChannels Email API key (required since 2024 Workers free tier ended). */
  MAILCHANNELS_API_KEY: string;
}

export interface Apartment {
  id: number;
  slug: string;
  complex: string;
  unit_label: string;
  bedrooms: number;
  max_guests: number;
  area_sqm: number;
  base_rate: number; // minor units
  currency: string;
  amenities_json: string;
  created_at: number;
}

export interface Season {
  id: number;
  apartment_id: number | null;
  name: string;
  start_date: string;
  end_date: string;
  multiplier: number;
  override_rate: number | null;
  priority: number;
}

export interface DateOverride {
  id: number;
  apartment_id: number;
  date: string;
  rate: number;
  note: string | null;
}

export interface Promotion {
  id: number;
  apartment_id: number | null;
  kind: "weekly" | "non_refundable" | string;
  active: number;
  params_json: string;
  stackable: number;
}

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "expired";

export interface Booking {
  id: number;
  apartment_id: number;
  checkin: string;
  checkout: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  guest_lang: string | null;
  guests_count: number;
  status: BookingStatus;
  non_refundable: number;
  quote_json: string;
  total_amount: number;
  currency: string;
  notes: string | null;
  created_at: number;
  hold_expires_at: number | null;
  confirmed_at: number | null;
  cancelled_at: number | null;
}

export interface IcalSource {
  id: number;
  apartment_id: number;
  label: string;
  url: string;
  active: number;
  last_synced_at: number | null;
  last_status: string | null;
}

export interface IcalEvent {
  id: number;
  source_id: number;
  apartment_id: number;
  uid: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  fetched_at: number;
}

export interface QuoteResult {
  nights: { date: string; rate: number }[];
  subtotal: number;
  discounts: { kind: string; label: string; amount: number; percent?: number }[];
  total: number;
  currency: string;
  apartment_slug: string;
  computed_at: number;
}
