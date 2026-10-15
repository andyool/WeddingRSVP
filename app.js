// Digital wedding invitation + RSVP page.
//
// The invitation link carries everything this page shows in its #fragment (base64url JSON
// made by the TheWedding app). Browsers never send the fragment to the server, so no
// guest details are stored on GitHub. Replies are posted to a Google Apps Script that
// appends them to a Google Sheet, where the app picks them up.
//
// Presentation follows guide/REBUILD-GUIDE.md from the asset kit: a sealed Ivory Glow
// envelope plays its opening once when the seal is tapped, fades into the Tuscan Sunset
// Lights hero, and the rest of the card scrolls over the vintage rose parchment loop.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ALLOWED_ENDPOINT = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  const MAX_PEOPLE = 12;
  const STYLES = ['blush', 'rose', 'peach', 'butter', 'mint', 'sage', 'aqua', 'sky', 'lavender', 'lilac'];
  const TIMELINE_ART = ['assets/art/timeline-1.png', 'assets/art/timeline-2.png', 'assets/art/timeline-3.png', 'assets/art/timeline-4.png'];
  const STAY_ART = ['assets/art/hotel-1.png', 'assets/art/hotel-2.png'];
  const ENVELOPE_SECONDS = 5.875;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let invite = null;
  let personCount = 0;
  let opened = false;
  let countdownTimer = null;

  // ---------- Decoding the invitation ----------

  function decodeInvite() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return null;
    try {
      const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (!data || data.v !== 1 || !ALLOWED_ENDPOINT.test(data.s || '') || !Array.isArray(data.e)) return null;
      return {
        endpoint: data.s,
        title: text(data.t),
        couple: text(data.c),
        date: text(data.d),
        deadline: text(data.r),
        greeting: text(data.h),
        // Newer links (October 2026) add the fields below; older links simply leave them blank.
        weddingAt: text(data.dt),
        style: STYLES.includes(data.y) ? data.y : 'blush',
        hashtag: text(data.g),
        story: text(data.st),
        photo: safeURL(data.im),
        registry: list(data.rg).map((r) => ({ name: text(r.n), url: safeURL(r.u) })).filter((r) => r.url).slice(0, 8),
        faq: list(data.q).map((f) => ({ q: text(f.q), a: text(f.a) })).filter((f) => f.q).slice(0, 20),
        events: data.e.slice(0, 20).map((e) => ({
          id: text(e.i), title: text(e.t) || 'Celebration',
          when: text(e.w), place: text(e.l), dressCode: text(e.x),
          // Meal choices to offer when someone is coming ("o" = options).
          mealOptions: Array.isArray(e.o) ? e.o.filter((s) => typeof s === 'string' && s.trim()).slice(0, 12) : [],
          start: text(e.b), end: text(e.f),
          venue: text(e.v), address: text(e.a), details: text(e.d),
          transport: text(e.tr), parking: text(e.pk), accommodation: text(e.ac), gifts: text(e.gi),
          // Suggested colours for the dress code: { n: name, h: #hex }
          colors: list(e.cl).map((c) => ({ name: text(c.n), hex: safeHex(c.h) })).filter((c) => c.hex).slice(0, 8),
        })),
        people: list(data.p).map((p) => ({
          id: text(p.i), name: text(p.n),
          events: Array.isArray(p.e) ? p.e.filter((i) => Number.isInteger(i) && i >= 0 && i < data.e.length) : [],
          plusOneAllowed: p.p === true, plusOneName: text(p.q),
          // Per-guest code from the app; echoed back so a reply can't be forged from a guest ID alone.
          token: text(p.k),
        })),
        asksForSong: data.m === true,
      };
    } catch (err) {
      return null;
    }
  }

  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  function list(value) {
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
  }

  /// Only http(s) links are ever rendered, so a tampered link can't inject javascript: URLs.
  function safeURL(value) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch (err) {
      return '';
    }
  }

  function safeHex(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '';
  }

  // ---------- Small helpers ----------

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  }

  function img(src, className) {
    const node = document.createElement('img');
    node.src = src;
    node.alt = '';
    if (className) node.className = className;
    return node;
  }

  function externalIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(ns, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    icon.append(path);
    return icon;
  }

  function pill(label, href, quiet) {
    const link = el('a', quiet ? 'pill quiet' : 'pill', label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(externalIcon());
    return link;
  }

  function textLink(label, href) {
    const link = el('a', 'text-link', label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  /// "Andreas & Georgina" → ["Andreas", "Georgina"]; anything else stays whole.
  function coupleNames() {
    const parts = invite.couple.split(/\s*(?:&|\band\b|\+)\s*/i).map((s) => s.trim()).filter(Boolean);
    return parts.length === 2 ? parts : [invite.couple || 'Our Wedding'];
  }

  /// "2027-05-03T14:00:00+10:00" → "14:00" (the venue's local time, whatever the guest's time zone).
  function isoTime(iso) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) ? iso.slice(11, 16) : '';
  }

  function isoDay(iso) {
    return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
  }

  function formatDay(day) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function uniqueBy(items, key) {
    const seen = new Set();
    return items.filter((item) => {
      const k = key(item);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function playQuietly(video) {
    if (!video) return;
    video.muted = true;
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(() => { /* poster stays visible */ });
  }

  // ---------- 1. Envelope ----------

  function renderEnvelope() {
    $('env-greeting').textContent = invite.greeting || 'our family & friends';
  }

  /// Plays the 141-frame opening once (5.875 s at 24 fps), then crossfades into the hero.
  function openEnvelope() {
    if (opened) return;
    opened = true;
    const envelope = $('envelope');
    const video = $('env-video');
    envelope.classList.add('opening');

    // This runs inside the tap, so the looping backgrounds may start too (Low Power Mode
    // blocks autoplay but allows playback begun by a gesture).
    if (!reduceMotion) {
      playQuietly($('hero-video'));
      playQuietly($('paper-video'));
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      revealInvite();
      envelope.classList.add('away');
      setTimeout(() => envelope.remove(), 700);
    };

    if (reduceMotion) {
      setTimeout(finish, 150);
      return;
    }
    video.addEventListener('ended', finish, { once: true });
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(finish);
    // Safety net: never leave a guest stuck if the video stalls.
    setTimeout(finish, (ENVELOPE_SECONDS + 1.5) * 1000);
  }

  function revealInvite() {
    document.body.classList.remove('sealed');
    document.body.classList.add('open');
    $('invite').classList.remove('pending');
    $('scroll-rsvp').hidden = false;
    window.scrollTo(0, 0);
    observeReveals();
    const heading = $('couple');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  // ---------- 2. Hero ----------

  function renderHero() {
    if (invite.title) $('headline').textContent = invite.title;
    const names = coupleNames();
    $('name-one').textContent = names[0];
    if (names.length === 2) {
      $('name-two').textContent = names[1];
    } else {
      $('amp').hidden = true;
      $('name-two').hidden = true;
    }
    if (invite.couple) document.title = `${invite.couple} · Invitation`;
    if (invite.date) {
      $('wedding-date').textContent = invite.date;
      $('wedding-date').hidden = false;
    }
  }

  // ---------- 4. Countdown ----------

  function renderCountdown() {
    const starts = invite.events.map((e) => e.start).filter(Boolean).sort();
    const target = Date.parse(invite.weddingAt || starts[0] || '');
    if (!target) return;
    $('countdown').hidden = false;

    const tick = () => {
      let diff = target - Date.now();
      if (diff <= 0) {
        ['cd-days', 'cd-hours', 'cd-mins', 'cd-secs'].forEach((id) => { $(id).textContent = '0'; });
        $('cd-done').textContent = diff > -36 * 3600 * 1000 ? "Today's the day!" : 'Happily married!';
        $('cd-done').hidden = false;
        clearInterval(countdownTimer);
        return;
      }
      const days = Math.floor(diff / 86400000); diff -= days * 86400000;
      const hours = Math.floor(diff / 3600000); diff -= hours * 3600000;
      const mins = Math.floor(diff / 60000); diff -= mins * 60000;
      const secs = Math.floor(diff / 1000);
      $('cd-days').textContent = String(days);
      $('cd-hours').textContent = String(hours).padStart(2, '0');
      $('cd-mins').textContent = String(mins).padStart(2, '0');
      $('cd-secs').textContent = String(secs).padStart(2, '0');
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // ---------- 5. Venue ----------

  function renderVenue() {
    const places = uniqueBy(
      invite.events.map((e) => ({ name: e.venue, address: e.address, fallback: e.place, event: e.title })),
      (p) => `${p.name}|${p.address}|${p.fallback}`
    ).filter((p) => p.name || p.address || p.fallback);

    const container = $('venue-list');
    const several = places.length > 1;
    places.forEach((place) => {
      const item = el('div', 'venue-item');
      if (several) item.append(el('p', 'label', place.event));
      const name = place.name || place.fallback;
      if (name) item.append(el('p', 'venue-name', name));
      if (place.address && place.name) item.append(el('p', 'venue-address', place.address));
      const query = [place.name, place.address].filter(Boolean).join(', ') || place.fallback;
      if (query) {
        const stack = el('div', 'button-stack');
        stack.append(pill('View Map', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, false));
        stack.append(textLink('Open in Apple Maps', `https://maps.apple.com/?q=${encodeURIComponent(query)}`));
        item.append(stack);
      }
      container.append(item);
    });

    // Getting there and parking live with the venue.
    const rows = [];
    const add = (title, value) => {
      const trimmed = value.trim();
      if (trimmed && !rows.some((r) => r.title === title && r.value === trimmed)) rows.push({ title, value: trimmed });
    };
    invite.events.forEach((e) => {
      add('Getting there', e.transport);
      add('Parking', e.parking);
    });
    const travel = $('travel-list');
    rows.forEach((row) => {
      const item = el('div', 'travel-item');
      item.append(el('p', 'label', row.title), el('p', null, row.value));
      travel.append(item);
    });

    if (places.length || rows.length) $('venue').hidden = false;
  }

  // ---------- 6. Timeline ----------

  function renderTimeline() {
    const timed = invite.events.filter((e) => isoTime(e.start)).sort((a, b) => a.start.localeCompare(b.start));
    if (!timed.length) return;
    const untimed = invite.events.filter((e) => !isoTime(e.start));
    const days = new Set(timed.map((e) => isoDay(e.start)));
    const container = $('timeline-list');

    [...timed, ...untimed].forEach((event, index) => {
      const item = el('li', 'tl');
      item.append(img(TIMELINE_ART[index % TIMELINE_ART.length], 'tl-art'));
      const time = isoTime(event.start);
      let label = time || 'Time to follow';
      if (time && isoTime(event.end) && isoDay(event.end) === isoDay(event.start)) label += ` – ${isoTime(event.end)}`;
      item.append(el('span', 'tl-time', label));
      if (days.size > 1 && isoDay(event.start)) item.append(el('span', 'tl-date', formatDay(isoDay(event.start))));
      item.append(el('span', 'tl-title', event.title));
      const note = event.details || event.venue || event.place;
      if (note) item.append(el('span', 'tl-note', note));
      container.append(item);
    });
    $('timeline').hidden = false;
  }

  // ---------- 7. Dress code ----------

  function renderDress() {
    const codes = uniqueBy(invite.events.filter((e) => e.dressCode), (e) => e.dressCode.trim().toLowerCase());
    const colors = uniqueBy(invite.events.flatMap((e) => e.colors), (c) => `${c.hex}|${c.name}`.toLowerCase());
    if (!codes.length && !colors.length) return;

    if (codes.length === 1) {
      // One code becomes the heading itself, like the "Casual Attire" title in the reference.
      $('dress-title').textContent = codes[0].dressCode;
    } else if (codes.length) {
      const container = $('dress-list');
      codes.forEach((event) => {
        const item = el('div', 'dress-item');
        item.append(el('p', 'label', event.title), el('p', 'dress-code', event.dressCode));
        container.append(item);
      });
    }

    if (colors.length) {
      const row = $('swatches');
      colors.forEach((color) => {
        const swatch = el('div', 'swatch');
        const dot = el('i');
        dot.style.background = color.hex;
        swatch.append(dot);
        if (color.name) swatch.append(el('span', null, color.name));
        row.append(swatch);
      });
      row.hidden = false;
    }
    $('dress').hidden = false;
  }

  // ---------- 8. Gifts ----------

  function renderGifts() {
    const note = (invite.events.find((e) => e.gifts) || {}).gifts || '';
    if (!note && !invite.registry.length) return;
    $('gift-text').textContent = note || "Your presence is the greatest gift. Should you wish to give something more, we've put together a few ideas below.";
    const stack = $('registry');
    invite.registry.forEach((link, i) => {
      let label = link.name;
      if (!label) {
        try { label = new URL(link.url).hostname.replace(/^www\./, ''); } catch (err) { label = 'Gift list'; }
      }
      stack.append(pill(label, link.url, i > 0));
    });
    $('gifts').hidden = false;
  }

  // ---------- 9. Menu ----------

  function renderMenu() {
    const withMenu = invite.events.filter((e) => e.mealOptions.length);
    if (!withMenu.length) return;
    const container = $('menu-list');
    withMenu.forEach((event) => {
      const course = el('div', 'menu-course');
      if (withMenu.length > 1) course.append(el('h3', null, event.title));
      event.mealOptions.forEach((option) => course.append(el('p', 'menu-item', option)));
      container.append(course);
    });
    $('menu').hidden = false;
  }

  // ---------- 10. Gallery ----------

  function renderGallery() {
    if (!invite.photo) return;
    const photo = $('gallery-photo');
    photo.src = invite.photo;
    photo.alt = invite.couple ? `Photo of ${invite.couple}` : 'Photo of the couple';
    // Only show the frame once the photo actually loads.
    photo.addEventListener('load', () => { $('gallery').hidden = false; }, { once: true });
  }

  // ---------- 11 + 12. Accommodation ----------

  function renderStay() {
    const notes = uniqueBy(invite.events.filter((e) => e.accommodation.trim()), (e) => e.accommodation.trim());
    if (!notes.length) return;
    const container = $('stay-list');
    notes.forEach((event, index) => {
      const item = el('div', 'stay-item');
      item.append(img(STAY_ART[index % STAY_ART.length]));
      if (notes.length > 1) item.append(el('p', 'label', event.title));
      item.append(el('p', null, event.accommodation.trim()));
      container.append(item);
    });
    $('stay').hidden = false;
  }

  function renderStory() {
    if (!invite.story.trim()) return;
    $('story-text').textContent = invite.story.trim();
    $('story').hidden = false;
  }

  // ---------- 13. FAQ ----------

  function renderFAQ() {
    if (!invite.faq.length) return;
    const container = $('faq-list');
    invite.faq.forEach((item) => {
      const details = el('details');
      details.append(el('summary', null, item.q), el('p', null, item.a || '—'));
      container.append(details);
    });
    $('faq').hidden = false;
  }

  function renderFooter() {
    $('footer-names').textContent = invite.couple;
    if (invite.hashtag) {
      $('hashtag').textContent = invite.hashtag.startsWith('#') ? invite.hashtag : `#${invite.hashtag}`;
      $('hashtag').hidden = false;
    }
  }

  /// Fades sections in as they scroll into view, and hides the "scroll to RSVP" hint at the end.
  function observeReveals() {
    const reveals = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      reveals.forEach((node) => node.classList.add('in'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach((node) => observer.observe(node));

    const hint = $('scroll-rsvp');
    new IntersectionObserver((entries) => {
      hint.classList.toggle('gone', entries.some((entry) => entry.isIntersecting));
    }, { threshold: 0.15 }).observe($('rsvp'));
  }

  // ---------- 14. RSVP ----------

  function renderRSVPHeader() {
    $('song-field').hidden = !invite.asksForSong;
    const name = invite.greeting || 'there';
    $('greeting').textContent = `Hi ${name}! We'd love to know if you can join us.`;
    if (invite.deadline) {
      $('deadline').textContent = `Please reply by ${invite.deadline}`;
      $('deadline').hidden = false;
    }
  }

  function renderEvents() {
    const container = $('events');
    invite.events.forEach((event) => {
      const card = el('div', 'event');
      card.append(el('h3', null, event.title));
      if (event.when) card.append(el('p', 'event-when', event.when));
      const place = [event.venue, event.address].filter(Boolean).join(', ') || event.place;
      if (place) card.append(el('p', 'event-place', place));
      if (event.dressCode) card.append(el('p', 'event-dress', `Dress code: ${event.dressCode}`));
      container.append(card);
    });
  }

  /// Adds one person's reply block. `person` is null for group links, where guests type their name.
  function addPerson(person) {
    const index = personCount++;
    const node = $('person-template').content.firstElementChild.cloneNode(true);
    node.dataset.index = String(index);
    node.dataset.guestId = person ? person.id : '';
    node.dataset.token = person ? person.token : '';

    const legend = node.querySelector('.person-name');
    const nameField = node.querySelector('.name-field');
    if (person) {
      legend.textContent = person.name;
    } else {
      legend.textContent = index === 0 ? 'You' : 'Another guest';
      nameField.hidden = false;
      linkLabel(nameField, `name-${index}`);
      node.querySelector('.name-input').required = true;
    }

    const eventIndexes = person && person.events.length ? person.events : invite.events.map((_, i) => i);
    const replies = node.querySelector('.event-replies');
    eventIndexes.forEach((eventIndex) => {
      const event = invite.events[eventIndex];
      const group = el('div', 'reply');
      group.setAttribute('role', 'radiogroup');
      group.dataset.eventIndex = String(eventIndex);
      const label = el('span', 'reply-label', event.title);
      label.id = `reply-${index}-${eventIndex}`;
      group.setAttribute('aria-labelledby', label.id);
      group.append(label);
      const choices = el('div', 'choices');
      [['attending', 'Joyfully accepts'], ['declined', 'Regretfully declines']].forEach(([value, title]) => {
        const option = el('label', `choice choice-${value}`);
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `p${index}-e${eventIndex}`;
        input.value = value;
        option.append(input, el('span', null, title));
        choices.append(option);
      });
      group.append(choices);
      if (event.mealOptions.length) addMealChoice(group, event, index, eventIndex);
      replies.append(group);
    });

    const plusOne = node.querySelector('.plus-one');
    if (person && person.plusOneAllowed) {
      plusOne.hidden = false;
      linkLabel(plusOne, `plus-one-${index}`);
      node.querySelector('.plus-one-input').value = person.plusOneName;
    }
    linkLabel(node, `dietary-${index}`, '.dietary-input', '.dietary-label');

    const remove = node.querySelector('.remove-person');
    if (!person && index > 0) {
      remove.hidden = false;
      remove.addEventListener('click', () => {
        node.remove();
        $('add-person').hidden = document.querySelectorAll('.person').length >= MAX_PEOPLE;
      });
    }

    $('people').append(node);
    return node;
  }

  /// A meal picker under an event's yes/no, shown only once "Joyfully accepts" is chosen.
  function addMealChoice(group, event, index, eventIndex) {
    const meal = el('div', 'meal');
    meal.hidden = true;
    const label = el('label', null, 'Meal choice');
    const select = document.createElement('select');
    select.className = 'meal-select';
    select.id = `meal-${index}-${eventIndex}`;
    label.htmlFor = select.id;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Please choose…';
    select.append(placeholder);
    event.mealOptions.forEach((option) => {
      const choice = document.createElement('option');
      choice.value = option;
      choice.textContent = option;
      select.append(choice);
    });
    meal.append(label, select);
    group.append(meal);
    group.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener('change', () => syncMeal(group));
    });
  }

  /// Shows the meal picker only when the person is coming to that event.
  function syncMeal(group) {
    const meal = group.querySelector('.meal');
    if (!meal) return;
    const checked = group.querySelector('input:checked');
    meal.hidden = !(checked && checked.value === 'attending');
  }

  /// Ties a <label> to its input so screen readers announce it.
  function linkLabel(scope, id, inputSelector = 'input', labelSelector = 'label') {
    const input = scope.querySelector(inputSelector);
    const labels = scope.querySelectorAll(labelSelector);
    const label = labels[labels.length - 1];
    if (!input || !label) return;
    input.id = id;
    label.htmlFor = id;
  }

  // ---------- Reading the form ----------

  function collect() {
    const people = [...document.querySelectorAll('.person')].map((node) => {
      const nameInput = node.querySelector('.name-input');
      const guestId = node.dataset.guestId;
      const name = guestId ? node.querySelector('.person-name').textContent : nameInput.value.trim();
      const events = [...node.querySelectorAll('.reply')].map((group) => {
        const event = invite.events[Number(group.dataset.eventIndex)];
        const checked = group.querySelector('input:checked');
        const status = checked ? checked.value : '';
        const select = group.querySelector('.meal-select');
        return { id: event.id, title: event.title, status, meal: select && status === 'attending' ? select.value : '' };
      });
      return {
        guestId,
        token: node.dataset.token || '',
        name,
        events,
        plusOneName: node.querySelector('.plus-one').hidden ? '' : node.querySelector('.plus-one-input').value.trim(),
        dietary: node.querySelector('.dietary-input').value.trim(),
      };
    });
    const song = invite.asksForSong ? $('song').value.trim() : '';
    return { people, song, notes: $('notes').value.trim() };
  }

  function validate(reply) {
    for (const person of reply.people) {
      if (!person.name) return 'Please add your name.';
      if (person.events.some((e) => !e.status)) {
        return `Please let us know which events ${reply.people.length > 1 ? person.name : 'you'} can make.`;
      }
      const missingMeal = person.events.find((e) => e.status === 'attending' && !e.meal
        && (invite.events.find((ev) => ev.id === e.id) || { mealOptions: [] }).mealOptions.length);
      if (missingMeal) {
        return `Please choose a meal for ${reply.people.length > 1 ? person.name : 'yourself'} at the ${missingMeal.title}.`;
      }
    }
    return null;
  }

  // ---------- Remembering a previous reply on this device ----------

  /// One saved reply per guest and invitation, so an engagement party reply
  /// doesn't pre-fill the wedding RSVP.
  function storageKey() {
    const ids = invite.people.map((p) => p.id).join(',');
    return ids ? `rsvp:${ids}|${invite.events.map((e) => e.id).join(',')}` : null;
  }

  function restorePrevious() {
    const key = storageKey();
    if (!key) return;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (err) { saved = null; }
    if (!saved || !saved.reply) return;
    fill(saved.reply);
    $('previous').textContent = `You replied on ${new Date(saved.at).toLocaleDateString(undefined, { dateStyle: 'long' })}. You can change your answers below.`;
    $('previous').hidden = false;
  }

  function fill(reply) {
    document.querySelectorAll('.person').forEach((node, i) => {
      const person = reply.people[i];
      if (!person) return;
      const nameInput = node.querySelector('.name-input');
      if (!node.dataset.guestId) nameInput.value = person.name || '';
      node.querySelectorAll('.reply').forEach((group) => {
        const event = invite.events[Number(group.dataset.eventIndex)];
        const match = (person.events || []).find((e) => e.id === event.id);
        const input = match && group.querySelector(`input[value="${match.status === 'attending' ? 'attending' : 'declined'}"]`);
        if (input) input.checked = true;
        const select = group.querySelector('.meal-select');
        if (select && match && match.meal) select.value = match.meal;
        syncMeal(group);
      });
      node.querySelector('.plus-one-input').value = person.plusOneName || node.querySelector('.plus-one-input').value;
      node.querySelector('.dietary-input').value = person.dietary || '';
    });
    $('song').value = reply.song || '';
    $('notes').value = reply.notes || '';
  }

  // ---------- Sending ----------

  async function submit(event) {
    event.preventDefault();
    const reply = collect();
    const problem = validate(reply);
    showError(problem);
    if (problem) return;

    const button = $('submit');
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      // text/plain keeps this a "simple" request, so Google doesn't need a CORS preflight.
      const response = await fetch(invite.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(reply),
        redirect: 'follow',
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || 'unknown error');
      const key = storageKey();
      if (key) {
        try { localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), reply })); } catch (err) { /* private mode */ }
      }
      showThanks(reply);
    } catch (err) {
      showError("Sorry, we couldn't send your RSVP. Please check your connection and try again.");
    } finally {
      button.disabled = false;
      button.textContent = 'Send RSVP';
    }
  }

  function showError(message) {
    $('error').textContent = message || '';
    $('error').hidden = !message;
  }

  function showThanks(reply) {
    const anyoneComing = reply.people.some((p) => p.events.some((e) => e.status === 'attending'));
    $('thanks-message').textContent = anyoneComing
      ? "We can't wait to celebrate with you!"
      : "We'll miss you, and thank you for letting us know.";
    const list = $('thanks-summary');
    list.replaceChildren();
    reply.people.forEach((person) => {
      const summary = person.events
        .map((e) => `${e.title}: ${e.status === 'attending' ? (e.meal ? `Yes (${e.meal})` : 'Yes') : 'No'}`)
        .join(' · ');
      list.append(el('li', null, `${person.name} — ${summary}`));
    });
    $('rsvp-form').hidden = true;
    $('thanks').hidden = false;
    $('rsvp').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Start ----------

  function start() {
    invite = decodeInvite();
    if (!invite) {
      $('invite').hidden = true;
      $('paper').hidden = true;
      $('no-invite').hidden = false;
      return;
    }
    document.documentElement.dataset.style = invite.style;
    document.body.classList.add('sealed');

    renderEnvelope();
    renderHero();
    renderCountdown();
    renderVenue();
    renderTimeline();
    renderDress();
    renderGifts();
    renderMenu();
    renderGallery();
    renderStay();
    renderStory();
    renderFAQ();
    renderFooter();

    renderRSVPHeader();
    renderEvents();
    if (invite.people.length) {
      invite.people.slice(0, MAX_PEOPLE).forEach(addPerson);
    } else {
      addPerson(null);
      $('add-person').hidden = false;
      $('add-person').addEventListener('click', () => {
        addPerson(null).querySelector('.name-input').focus();
        $('add-person').hidden = document.querySelectorAll('.person').length >= MAX_PEOPLE;
      });
    }
    restorePrevious();
    $('rsvp-form').addEventListener('submit', submit);
    $('edit').addEventListener('click', () => {
      $('thanks').hidden = true;
      $('rsvp-form').hidden = false;
    });
    $('scroll-rsvp').addEventListener('click', () => $('rsvp').scrollIntoView({ behavior: 'smooth', block: 'start' }));

    // Motion off: the loops stay on their poster frames.
    if (reduceMotion) {
      ['hero-video', 'paper-video'].forEach((id) => { $(id).removeAttribute('autoplay'); $(id).pause(); });
    }

    $('envelope').hidden = false;
    $('envelope').addEventListener('click', openEnvelope);
    $('seal').addEventListener('click', (event) => {
      event.stopPropagation();
      openEnvelope();
    });
  }

  start();
})();
