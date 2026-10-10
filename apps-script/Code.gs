/**
 * @OnlyCurrentDoc
 *
 * Wedding RSVP – Google Apps Script
 *
 * Paste this into Extensions → Apps Script of a Google Sheet, then deploy it as a web app
 * (see README.md). The RSVP page POSTs replies here, one row per guest. The TheWedding app
 * reads them back with GET ?key=SECRET.
 */

// Paste the secret key from the app (Settings → Online RSVP) between the quotes.
const SECRET = 'PASTE-YOUR-SECRET-KEY-HERE';

const SHEET_NAME = 'RSVPs';
const HEADERS = ['Submitted', 'Reply ID', 'Guest ID', 'Name', 'Replies', 'Bringing', 'Dietary', 'Song request', 'Notes', 'Events JSON'];
const STATUSES = { attending: 'Yes', declined: 'No' };

/** Receives a reply from the RSVP page. */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const people = Array.isArray(body.people) ? body.people.slice(0, 12) : [];
    if (!people.length) return json({ ok: false, error: 'No guests in reply' });

    const submitted = new Date().toISOString();
    const submissionId = Utilities.getUuid();
    const rows = people.map(function (person, i) {
      const events = (Array.isArray(person.events) ? person.events : []).slice(0, 20).map(function (event) {
        return {
          id: clean(event.id, 64),
          title: clean(event.title, 120),
          status: STATUSES[event.status] ? event.status : 'pending',
        };
      });
      const summary = events.map(function (event) {
        return event.title + ': ' + (STATUSES[event.status] || '?');
      }).join(' · ');
      return [
        submitted,
        submissionId + '-' + i,
        clean(person.guestId, 64),
        clean(person.name, 200),
        summary,
        clean(person.plusOneName, 200),
        clean(person.dietary, 300),
        i === 0 ? clean(body.song, 200) : '',
        i === 0 ? clean(body.notes, 1000) : '',
        JSON.stringify(events),
      ].map(asText);
    });

    const sheet = getSheet();
    const range = sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length);
    range.setNumberFormat('@'); // keep everything as plain text (no date or number guessing)
    range.setValues(rows);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Returns every reply to the app. Requires the secret key. */
function doGet(e) {
  const key = (e && e.parameter && e.parameter.key) || '';
  if (!SECRET || SECRET.indexOf('PASTE-') === 0 || key !== SECRET) {
    return json({ ok: false, error: 'unauthorized' });
  }
  const values = getSheet().getDataRange().getValues().slice(1);
  const replies = values
    .filter(function (row) { return row[1]; })
    .map(function (row) {
      let events = [];
      try { events = JSON.parse(fromText(row[9])); } catch (err) { events = []; }
      return {
        submittedAt: row[0] instanceof Date ? row[0].toISOString() : fromText(row[0]),
        id: fromText(row[1]),
        guestId: fromText(row[2]),
        name: fromText(row[3]),
        plusOneName: fromText(row[5]),
        dietary: fromText(row[6]),
        song: fromText(row[7]),
        notes: fromText(row[8]),
        events: events,
      };
    });
  return json({ ok: true, replies: replies });
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function clean(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

/** Stops replies like "=IMPORTXML(…)" from being treated as spreadsheet formulas. */
function asText(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function fromText(value) {
  const text = String(value == null ? '' : value);
  return text.charAt(0) === "'" ? text.slice(1) : text;
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
