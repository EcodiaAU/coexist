insert into public.good_category_images (surface, category, image_url) values
 ('do_good','conservation','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_conservation.jpg'),
 ('do_good','wildlife','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_wildlife.jpg'),
 ('do_good','marine','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_marine.jpg'),
 ('do_good','climate','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_climate.jpg'),
 ('do_good','community','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_community.jpg'),
 ('do_good','first_nations','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_first_nations.jpg'),
 ('do_good','youth','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/dg_youth.jpg'),
 ('feel_good','crisis','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/fg_crisis.jpg'),
 ('feel_good','counselling','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/fg_counselling.jpg'),
 ('feel_good','youth','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/fg_youth.jpg'),
 ('feel_good','identity','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/fg_identity.jpg'),
 ('feel_good','first_nations','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/fg_first_nations.jpg'),
 ('feel_good','family','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/fg_family.jpg'),
 ('feel_good','general','https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/app-images/good-pages/category/fg_general.jpg')
 on conflict (surface, category) do update set image_url = excluded.image_url;
