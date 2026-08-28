-- Seven of the ten Do Good cards shared a backdrop with a neighbour, because
-- four orgs are 'marine' and three are 'conservation' and a category has ONE
-- fallback image. Adjacent identical photos read as a broken page, so the
-- seeded rows carry their OWN cover. The category fallback stays for rows
-- staff add later.
update public.do_good_organisations set image_url = 'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_marine_b.jpg'       where name = 'Tangaroa Blue Foundation';
update public.do_good_organisations set image_url = 'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_marine_c.jpg'       where name = 'Reef Check Australia';
update public.do_good_organisations set image_url = 'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_marine_d.jpg'       where name = 'Sea Shepherd Australia';
update public.do_good_organisations set image_url = 'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_conservation_b.jpg' where name = 'Bush Heritage Australia';
update public.do_good_organisations set image_url = 'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_conservation_c.jpg' where name = 'Conservation Volunteers Australia';
