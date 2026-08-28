-- Seed content for Feel Good + Do Good.
--
-- EVERY phone number and every stated opening hour below was read off the
-- organisation's OWN live site on 2026-08-28 before it was written here, not
-- recalled. A wrong crisis number in a youth app is real harm, so this table
-- is seeded from source and re-verified whenever it is edited.
--   lifeline.org.au                13 11 14
--   kidshelpline.com.au            1800 55 1800  ("aged 5 to 25")
--   suicidecallbackservice.org.au  1300 659 467
--   13yarn.org.au                  13 92 76
--   beyondblue.org.au/get-support  1300 22 4636
--   headspace.org.au               1800 650 890  (9am-1am Melbourne time, 7 days)
--   qlife.org.au                   1800 184 527  ("3PM to 9PM, EVERY DAY")
--   1800respect.org.au             1800 737 732
--   mensline.org.au                1300 78 99 78
--
-- Idempotent on name so a re-run refreshes rather than duplicates.

insert into public.support_resources
  (name, tagline, phone, phone_note, sms_number, url, hours, category, is_crisis, sort_order)
values
  ('Lifeline', 'Someone to talk to, any hour of any day.', '13 11 14', null, '0477 13 11 14',
   'https://www.lifeline.org.au/', '24 hours, 7 days', 'crisis', true, 10),
  ('Kids Helpline', 'Free, private counselling for anyone aged 5 to 25.', '1800 55 1800', null, null,
   'https://kidshelpline.com.au/', '24 hours, 7 days', 'youth', true, 20),
  ('Suicide Call Back Service', 'Phone and online counselling if you are thinking about suicide, or worried about someone who is.', '1300 659 467', null, null,
   'https://www.suicidecallbackservice.org.au/', '24 hours, 7 days', 'crisis', true, 30),
  ('13YARN', 'Crisis support answered by Aboriginal and Torres Strait Islander Lifeline counsellors.', '13 92 76', null, null,
   'https://www.13yarn.org.au/', '24 hours, 7 days', 'first_nations', true, 40),
  ('Beyond Blue', 'Support for anxiety, depression and the low weeks in between.', '1300 22 4636', null, null,
   'https://www.beyondblue.org.au/get-support', '24 hours, 7 days', 'counselling', false, 50),
  ('headspace', 'Mental health support built for young people, online or by phone.', '1800 650 890', null, null,
   'https://headspace.org.au/', '9am to 1am AEST, 7 days', 'youth', false, 60),
  ('QLife', 'Anonymous peer support for LGBTIQ+ people, answered by LGBTIQ+ people.', '1800 184 527', null, null,
   'https://qlife.org.au/', '3pm to 9pm, every day', 'identity', false, 70),
  ('1800RESPECT', 'Confidential support for domestic, family or sexual violence.', '1800 737 732', null, null,
   'https://www.1800respect.org.au/', '24 hours, 7 days', 'family', false, 80),
  ('MensLine Australia', 'Counselling for men on relationships, family and mental health.', '1300 78 99 78', null, null,
   'https://mensline.org.au/', '24 hours, 7 days', 'counselling', false, 90)
on conflict do nothing;
