// Wedding RSVP page.
//
// The invitation link carries everything this page shows in its #fragment (base64url JSON
// made by the TheWedding app). Browsers never send the fragment to the server, so no
// guest details are stored on GitHub. Replies are posted to a Google Apps Script that
// appends them to a Google Sheet, where the app picks them up.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ALLOWED_ENDPOINT = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  const MAX_PEOPLE = 12;

  let invite = null;
  let personCount = 0;

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
        couple: text(data.c),
        date: text(data.d),
        deadline: text(data.r),
        greeting: text(data.h),
        events: data.e.map((e) => ({
          id: text(e.i), title: text(e.t) || 'Celebration',
          when: text(e.w), place: text(e.l), dressCode: text(e.x),
        })),
        people: (Array.isArray(data.p) ? data.p : []).map((p) => ({
          id: text(p.i), name: text(p.n),
          events: Array.isArray(p.e) ? p.e.filter((i) => Number.isInteger(i) && i >= 0 && i < data.e.length) : [],
          plusOneAllowed: p.p === true, plusOneName: text(p.q),
        })),
      };
    } catch (err) {
      return null;
    }
  }

  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  // ---------- Building the page ----------

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  }

  function renderHeader() {
    if (invite.couple) {
      $('couple').textContent = invite.couple;
      document.title = `RSVP · ${invite.couple}`;
    }
    if (invite.date) {
      $('wedding-date').textContent = invite.date;
      $('wedding-date').hidden = false;
    }
    const name = invite.greeting || 'there';
    $('greeting').textContent = `Hi ${name}! We'd love to know if you can join us.`;
    if (invite.deadline) {
      $('deadline').textContent = `Kindly reply by ${invite.deadline}`;
      $('deadline').hidden = false;
    }
  }

  function renderEvents() {
    const container = $('events');
    invite.events.forEach((event) => {
      const card = el('div', 'event');
      card.append(el('h3', null, event.title));
      if (event.when) card.append(el('p', 'event-when', event.when));
      if (event.place) card.append(el('p', 'event-place', event.place));
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
        return { id: event.id, title: event.title, status: checked ? checked.value : '' };
      });
      return {
        guestId,
        name,
        events,
        plusOneName: node.querySelector('.plus-one').hidden ? '' : node.querySelector('.plus-one-input').value.trim(),
        dietary: node.querySelector('.dietary-input').value.trim(),
      };
    });
    return { people, song: $('song').value.trim(), notes: $('notes').value.trim() };
  }

  function validate(reply) {
    for (const person of reply.people) {
      if (!person.name) return 'Please add your name.';
      if (person.events.some((e) => !e.status)) {
        return `Please let us know which events ${reply.people.length > 1 ? person.name : 'you'} can make.`;
      }
    }
    return null;
  }

  // ---------- Remembering a previous reply on this device ----------

  function storageKey() {
    const ids = invite.people.map((p) => p.id).join(',');
    return ids ? `rsvp:${ids}` : null;
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
        .map((e) => `${e.title}: ${e.status === 'attending' ? 'Yes' : 'No'}`)
        .join(' · ');
      list.append(el('li', null, `${person.name} — ${summary}`));
    });
    $('rsvp-form').hidden = true;
    $('thanks').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Start ----------

  function start() {
    invite = decodeInvite();
    if (!invite) {
      $('no-invite').hidden = false;
      return;
    }
    renderHeader();
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
    $('rsvp-form').hidden = false;
  }

  start();
})();
