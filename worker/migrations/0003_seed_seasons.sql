-- Seed: default seasons (apply to all apartments — apartment_id NULL means "all").
-- Multipliers based on Gudauri's typical Dec-Apr ski season.
-- Owner can edit / add per-apartment overrides via /admin.

-- High: holiday week through Orthodox Christmas
INSERT INTO seasons (apartment_id, name, start_date, end_date, multiplier, priority) VALUES
  (NULL, 'High — NY & Orthodox Christmas', '2026-12-22', '2027-01-10', 2.0, 100),
  (NULL, 'High — NY & Orthodox Christmas', '2027-12-22', '2028-01-10', 2.0, 100);

-- Mid: surrounding peak ski weeks
INSERT INTO seasons (apartment_id, name, start_date, end_date, multiplier, priority) VALUES
  (NULL, 'Mid — Ski peak', '2026-12-01', '2026-12-21', 1.4, 50),
  (NULL, 'Mid — Ski peak', '2027-01-11', '2027-03-31', 1.4, 50),
  (NULL, 'Mid — Ski peak', '2027-12-01', '2027-12-21', 1.4, 50),
  (NULL, 'Mid — Ski peak', '2028-01-11', '2028-03-31', 1.4, 50);

-- Low: shoulder season (April-May, late autumn) and off-season summer with deeper discount
INSERT INTO seasons (apartment_id, name, start_date, end_date, multiplier, priority) VALUES
  (NULL, 'Shoulder', '2026-04-01', '2026-05-15', 0.85, 20),
  (NULL, 'Shoulder', '2027-04-01', '2027-05-15', 0.85, 20),
  (NULL, 'Low — Summer', '2026-05-16', '2026-11-30', 0.6, 10),
  (NULL, 'Low — Summer', '2027-05-16', '2027-11-30', 0.6, 10);

-- Default promotions: weekly (-10% from 7 nights) and non-refundable (-15%)
INSERT INTO promotions (apartment_id, kind, active, params_json, stackable) VALUES
  (NULL, 'weekly', 1, '{"min_nights":7,"percent":10}', 1),
  (NULL, 'non_refundable', 1, '{"percent":15}', 1);
