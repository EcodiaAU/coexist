-- Populate Co-Exist legal pages that are currently empty:
-- cookies, data-policy, disclaimer, accessibility. These were created with
-- titles + summaries only - the `content` column has been blank. The
-- legal-page-shell renders fallback copy when content is empty, which
-- looked unfinished. This migration writes the real policy text.
--
-- about / privacy / terms are already populated and left untouched.

UPDATE public.legal_pages
SET content = $html$
<h2>How we use cookies</h2>
<p>
  Co-Exist uses a small set of cookies and similar technologies to keep
  you signed in, remember your preferences, and understand how the site
  and app are used. We do not sell or share cookie data with advertisers.
</p>

<h2>Types we use</h2>
<ul>
  <li>
    <strong>Strictly necessary.</strong> Session cookies that keep you
    signed in to your Co-Exist account, hold your security tokens, and
    let core pages load. The site does not work without these.
  </li>
  <li>
    <strong>Preferences.</strong> Small local-storage entries that
    remember things like your selected collective, reduced-motion
    setting, and whether you've dismissed onboarding tips.
  </li>
  <li>
    <strong>Analytics.</strong> Aggregated, de-identified usage data so
    we can see which features get used and where people drop off. We use
    this to improve the product. We do not use this for advertising.
  </li>
</ul>

<h2>Push notification tokens</h2>
<p>
  When you allow push notifications in the Co-Exist app, your device
  hands us an anonymous token from Apple or Google. We store this token
  against your account so we can send event reminders, chat alerts, and
  survey prompts. You can revoke at any time from your device's
  notification settings or by signing out.
</p>

<h2>Your choices</h2>
<p>
  Most browsers let you clear or block cookies for any site, including
  Co-Exist. Blocking strictly-necessary cookies will sign you out and
  break the app. Clearing preference storage will reset your saved
  settings.
</p>

<h2>Questions</h2>
<p>
  If you'd like more detail about anything on this page, write to
  <a href="mailto:hello@coexistaus.org">hello@coexistaus.org</a>.
</p>
$html$,
    updated_at = NOW()
WHERE slug = 'cookies';

UPDATE public.legal_pages
SET content = $html$
<h2>What this policy covers</h2>
<p>
  Our <a href="/privacy">Privacy Policy</a> is the full description of
  how Co-Exist handles personal information. This Data Policy is a
  plain-English companion that focuses on the data itself: what we
  collect, where it lives, how long we keep it, and what you can ask us
  to do with it.
</p>

<h2>What we collect</h2>
<ul>
  <li>
    <strong>Account.</strong> Name, email, optional phone number,
    avatar, and the collectives you belong to.
  </li>
  <li>
    <strong>Activity.</strong> Events you've registered for or attended,
    impact you've logged, survey responses you've submitted, chat
    messages you've sent inside collective channels.
  </li>
  <li>
    <strong>Device.</strong> Operating system, app version, and a push
    notification token if you've allowed notifications.
  </li>
  <li>
    <strong>Location.</strong> Only when you explicitly tap "Check in"
    or "Use my location" - we never track you in the background.
  </li>
</ul>

<h2>Where it lives</h2>
<p>
  Personal data is stored on Supabase infrastructure hosted in
  Australia. Backups are encrypted and kept for 7 days. Push tokens are
  stored alongside your account and sent to Firebase Cloud Messaging
  (operated by Google) only at the moment a push is delivered.
</p>

<h2>How long we keep it</h2>
<ul>
  <li>
    <strong>Active accounts:</strong> for as long as you have a Co-Exist
    account.
  </li>
  <li>
    <strong>Deleted accounts:</strong> personal identifiers are removed
    within 30 days. Aggregated impact data (e.g. trees planted) is
    retained but de-identified.
  </li>
  <li>
    <strong>Chat messages:</strong> kept while the collective exists.
    Members can request deletion of individual messages they've sent.
  </li>
  <li>
    <strong>Event photos:</strong> kept indefinitely so the memory stays
    accessible long after the event. Uploaders can delete their own
    photos at any time.
  </li>
</ul>

<h2>Your rights</h2>
<p>
  You can request a copy of all data we hold about you, ask us to
  correct anything that's wrong, or request full deletion. Email
  <a href="mailto:hello@coexistaus.org">hello@coexistaus.org</a> from
  the address on your account and we'll respond within 30 days.
</p>
$html$,
    updated_at = NOW()
WHERE slug = 'data-policy';

UPDATE public.legal_pages
SET content = $html$
<h2>General information</h2>
<p>
  The information on the Co-Exist website and app is provided in good
  faith and is intended as general guidance for people interested in
  nature, conservation, and community-led events in Australia. It is
  not professional advice.
</p>

<h2>Event participation</h2>
<p>
  Co-Exist events are organised by local volunteer leaders. Co-Exist
  Australia is not responsible for the conduct of individual leaders or
  attendees. Always follow your event leader's safety guidance,
  carry water, wear weather-appropriate clothing, and let someone know
  where you'll be. Outdoor activities carry inherent risks - by attending
  you accept those risks for yourself.
</p>

<h2>Country and culture</h2>
<p>
  We acknowledge that all Co-Exist events take place on the traditional
  lands of First Nations peoples. Information shared on the platform
  about Country, culture, or knowledge is for general orientation only
  and is not a substitute for guidance from Traditional Owners or
  cultural authorities.
</p>

<h2>External links and content</h2>
<p>
  Co-Exist may link to third-party sites, partner organisations, or
  research papers. We don't control the content of external sites and
  don't endorse any specific product, service, or organisation by
  linking to them.
</p>

<h2>Conservation outcomes</h2>
<p>
  Impact figures displayed in Co-Exist (trees planted, litter removed,
  hours volunteered, etc.) are the totals reported by collective
  leaders. We do our best to verify these numbers but we don't
  independently audit every entry. Treat them as community-reported
  rather than scientifically-measured.
</p>

<h2>Updates</h2>
<p>
  This disclaimer may change. The "Last updated" date at the bottom of
  the page tells you when it was last revised. Significant changes will
  be announced inside the app.
</p>
$html$,
    updated_at = NOW()
WHERE slug = 'disclaimer';

UPDATE public.legal_pages
SET content = $html$
<h2>Our commitment</h2>
<p>
  Co-Exist is a community for everyone. We want the website and app to
  work for people across the full range of abilities, devices, and
  network conditions. Accessibility isn't a feature we bolt on at the
  end - we try to bake it in from the start.
</p>

<h2>What we aim for</h2>
<ul>
  <li>
    Compliance with WCAG 2.2 Level AA across all public pages. We're not
    perfect yet, and we treat accessibility bugs as first-class issues.
  </li>
  <li>
    Full keyboard navigation for every interactive element.
  </li>
  <li>
    Visible focus indicators that survive on light and dark backgrounds.
  </li>
  <li>
    Honouring the operating system's reduced-motion preference - if
    you've asked your device to dial animations down, the app will too.
  </li>
  <li>
    Honest text contrast on all body copy and important controls.
  </li>
  <li>
    Sufficient tap targets on mobile (at least 44 x 44 px for every
    primary action).
  </li>
  <li>
    Captioned video and described imagery where the content is
    informational. Decorative imagery uses empty alt text so it's
    silent to screen readers.
  </li>
</ul>

<h2>If something is broken</h2>
<p>
  If you hit an accessibility barrier in Co-Exist - whether it's a low
  contrast colour, an unlabelled icon, a screen reader trap, or
  anything else - please tell us. Email
  <a href="mailto:hello@coexistaus.org">hello@coexistaus.org</a> with
  the page or screen you were on and a quick description, and we'll
  treat it as a priority.
</p>

<h2>Assistive technology</h2>
<p>
  We test the app with iOS VoiceOver, Android TalkBack, and major
  desktop screen readers. If you use assistive tech that runs into
  trouble somewhere we haven't found, we want to hear about it - your
  feedback shapes what we fix next.
</p>
$html$,
    updated_at = NOW()
WHERE slug = 'accessibility';
