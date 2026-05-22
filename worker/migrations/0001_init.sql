-- SkiLuxe New Gudauri — initial schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS apartments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT UNIQUE NOT NULL,
  complex       TEXT NOT NULL,
  unit_label    TEXT NOT NULL,
  bedrooms      INTEGER NOT NULL DEFAULT 0,
  max_guests    INTEGER NOT NULL,
  area_sqm      INTEGER,
  base_rate     INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'GEL',
  amenities_json TEXT NOT NULL DEFAULT '[]',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS seasons (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  apartment_id  INTEGER REFERENCES apartments(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  multiplier    REAL NOT NULL DEFAULT 1.0,
  override_rate INTEGER,
  priority      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_seasons_apt ON seasons(apartment_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS date_overrides (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  apartment_id  INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  rate          INTEGER NOT NULL,
  note          TEXT,
  UNIQUE(apartment_id, date)
);
CREATE INDEX IF NOT EXISTS idx_overrides_apt_date ON date_overrides(apartment_id, date);

CREATE TABLE IF NOT EXISTS promotions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  apartment_id  INTEGER REFERENCES apartments(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  params_json   TEXT NOT NULL DEFAULT '{}',
  stackable     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_promotions_apt ON promotions(apartment_id, kind, active);

CREATE TABLE IF NOT EXISTS bookings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  apartment_id    INTEGER NOT NULL REFERENCES apartments(id) ON DELETE RESTRICT,
  checkin         TEXT NOT NULL,
  checkout        TEXT NOT NULL,
  guest_name      TEXT NOT NULL,
  guest_email     TEXT NOT NULL,
  guest_phone     TEXT,
  guest_lang      TEXT,
  guests_count    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  non_refundable  INTEGER NOT NULL DEFAULT 0,
  quote_json      TEXT NOT NULL,
  total_amount    INTEGER NOT NULL,
  currency        TEXT NOT NULL,
  notes           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  hold_expires_at INTEGER,
  confirmed_at    INTEGER,
  cancelled_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bookings_apt_dates ON bookings(apartment_id, checkin, checkout);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status, hold_expires_at);

CREATE TABLE IF NOT EXISTS ical_sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  apartment_id  INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  url           TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  last_synced_at INTEGER,
  last_status   TEXT
);

CREATE TABLE IF NOT EXISTS ical_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id     INTEGER NOT NULL REFERENCES ical_sources(id) ON DELETE CASCADE,
  apartment_id  INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  uid           TEXT NOT NULL,
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  summary       TEXT,
  fetched_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  UNIQUE(source_id, uid)
);
CREATE INDEX IF NOT EXISTS idx_ical_events_apt ON ical_events(apartment_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL,
  entity        TEXT,
  entity_id     INTEGER,
  detail_json   TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
