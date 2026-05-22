-- Switch apartment pricing from USD to GEL (amounts in tetri, 100 = ₾1)
UPDATE apartments SET currency = 'GEL', base_rate = CASE slug
  WHEN 'f2-one-bedroom' THEN 49500
  WHEN 'f2-superior-studio' THEN 38500
  WHEN 'loft-2-alpine-deluxe' THEN 41000
  WHEN 'loft-2-studio-balcony' THEN 33000
  ELSE base_rate
END;
