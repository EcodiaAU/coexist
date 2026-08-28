-- Do Good starter directory.
--
-- Every url below was probed on 2026-08-28 and returned HTTP 200 with a browser
-- user-agent (several of these hosts 403 a bare curl, which is a bot block and
-- not a dead link). This is a STARTER set so the page is not empty on day one;
-- Co-Exist owns the list from here and edits it in Admin > Do Good.

insert into public.do_good_organisations
  (name, blurb, url, opportunity, category, location, sort_order)
values
  ('Australian Marine Conservation Society',
   'The national voice for our oceans, working on reef, fisheries and plastic pollution.',
   'https://www.marineconservation.org.au/volunteer/',
   'Volunteer with a local sea-country group or join a campaign.',
   'marine', 'Nationwide', 10),
  ('Tangaroa Blue Foundation',
   'Runs the Australian Marine Debris Initiative, turning beach clean-ups into data that changes policy.',
   'https://www.tangaroablue.org/get-involved/',
   'Join a beach clean-up and log what you find into the national database.',
   'marine', 'Nationwide, strong in QLD', 20),
  ('Reef Check Australia',
   'Trains everyday divers and snorkellers to survey reef health.',
   'https://www.reefcheckaustralia.org/volunteer',
   'Train as a citizen-science reef surveyor.',
   'marine', 'QLD', 30),
  ('Landcare Australia',
   'The grassroots network restoring land and waterways, group by group.',
   'https://landcareaustralia.org.au/get-involved/',
   'Find your nearest Landcare group and get on the tools.',
   'conservation', 'Nationwide', 40),
  ('Bush Heritage Australia',
   'Buys and cares for land of outstanding conservation value, with Aboriginal partners.',
   'https://www.bushheritage.org.au/get-involved',
   'Volunteer on reserve, or support a partnership.',
   'conservation', 'Nationwide', 50),
  ('Conservation Volunteers Australia',
   'Places volunteers on habitat restoration projects right across the country.',
   'https://conservationvolunteers.com.au/',
   'Book onto a conservation project near you.',
   'conservation', 'Nationwide', 60),
  ('WIRES',
   'Australia''s largest wildlife rescue organisation.',
   'https://www.wires.org.au/get-involved/volunteer',
   'Train as a wildlife rescuer or carer.',
   'wildlife', 'Nationwide', 70),
  ('Clean Up Australia',
   'Community clean-ups on land and water, all year, not just one Sunday.',
   'https://www.cleanup.org.au/get-involved',
   'Join a clean-up or register your own site.',
   'community', 'Nationwide', 80),
  ('Sea Shepherd Australia',
   'Direct-action marine conservation, plus a large volunteer clean-up program.',
   'https://www.seashepherd.org.au/get-involved/',
   'Join a marine debris campaign or a local chapter.',
   'marine', 'Nationwide', 90),
  ('Australian Conservation Foundation',
   'National advocacy on climate and nature, organised through local community groups.',
   'https://www.acf.org.au/volunteer',
   'Join an ACF community group and campaign locally.',
   'climate', 'Nationwide', 100)
on conflict do nothing;
