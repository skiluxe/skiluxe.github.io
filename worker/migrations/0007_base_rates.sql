-- Update displayed base rates (amounts in tetri, 100 = ₾1)
UPDATE apartments SET base_rate = CASE slug
  WHEN 'f2-one-bedroom' THEN 30000
  WHEN 'f2-superior-studio' THEN 25000
  WHEN 'loft-2-alpine-deluxe' THEN 28000
  WHEN 'loft-2-studio-balcony' THEN 23000
  ELSE base_rate
END;
