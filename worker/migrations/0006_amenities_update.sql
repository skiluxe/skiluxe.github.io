-- Remove espresso machine; align amenities with site data
UPDATE apartments SET amenities_json = '["wifi","kitchen","balcony","heating","tv","washer","ski_storage","parking","mountain_view","linens","towels"]' WHERE slug = 'f2-one-bedroom';
UPDATE apartments SET amenities_json = '["wifi","kitchen","heating","tv","ski_storage","parking","mountain_view","linens","towels"]' WHERE slug = 'f2-superior-studio';
UPDATE apartments SET amenities_json = '["wifi","kitchen","heating","tv","washer","ski_storage","mountain_view","linens","towels","sofa_bed"]' WHERE slug = 'loft-2-alpine-deluxe';
UPDATE apartments SET amenities_json = '["wifi","kitchen","balcony","heating","tv","ski_storage","mountain_view","linens","towels"]' WHERE slug = 'loft-2-studio-balcony';
