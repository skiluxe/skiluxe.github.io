-- Seed: the four SkiLuxe apartments. Idempotent via INSERT OR IGNORE on slug.
INSERT OR IGNORE INTO apartments (slug, complex, unit_label, bedrooms, max_guests, area_sqm, base_rate, currency, amenities_json) VALUES
  ('f2-one-bedroom', 'Four Seasons F2', 'One-Bedroom Apartment with Balcony', 1, 4, 41, 49500, 'GEL',
   '["wifi","kitchen","balcony","heating","tv","washer","ski_storage","parking","mountain_view","coffee_machine","linens","towels"]'),
  ('f2-superior-studio', 'Four Seasons F2', 'Superior Studio', 0, 3, 32, 38500, 'GEL',
   '["wifi","kitchen","heating","tv","ski_storage","parking","mountain_view","coffee_machine","linens","towels"]'),
  ('loft-2-alpine-deluxe', 'Loft 2', 'Alpine Deluxe Studio', 0, 5, 31, 41000, 'GEL',
   '["wifi","kitchen","heating","tv","washer","ski_storage","mountain_view","coffee_machine","linens","towels","sofa_bed"]'),
  ('loft-2-studio-balcony', 'Loft 2', 'Studio with Balcony', 0, 3, 28, 33000, 'GEL',
    '["wifi","kitchen","balcony","heating","tv","ski_storage","mountain_view","coffee_machine","linens","towels"]');
