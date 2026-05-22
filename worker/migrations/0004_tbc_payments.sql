-- TBC E-Commerce payment tracking on bookings
ALTER TABLE bookings ADD COLUMN tbc_pay_id TEXT;
ALTER TABLE bookings ADD COLUMN payment_status TEXT;
ALTER TABLE bookings ADD COLUMN paid_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_bookings_tbc_pay ON bookings(tbc_pay_id);
