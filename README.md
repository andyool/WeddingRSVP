# Wedding invitation & RSVP

The online invitation for the **TheWedding** app, hosted on GitHub Pages.

- Guests open their personal link and see a sealed envelope. Tapping the wax seal plays the opening, then the invitation scrolls: names and date, countdown, venue, timeline, dress code, gifts, menu, photo, accommodation, FAQ and the RSVP form.
- Replies are saved to a Google Sheet by a small Google Apps Script.
- The app reads the Sheet (using a secret key) and fills in each guest's RSVP automatically.

**Privacy:** the guest's name and event details travel in the part of the link after `#`, which browsers never send to GitHub. This repo holds no guest data and no secrets. Replies are only stored in your Google Sheet.

## One-time setup (about 10 minutes)

### 1. Turn on GitHub Pages
1. In this repo, go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick **main** and **/ (root)**, then **Save**.
3. After a minute the page is live at `https://andyool.github.io/WeddingRSVP/`.

### 2. Create the Google Sheet and script
1. Create a new Google Sheet (e.g. "Wedding RSVPs").
2. Choose **Extensions → Apps Script**.
3. Delete what's in `Code.gs`, then paste in [`apps-script/Code.gs`](apps-script/Code.gs) from this repo.
4. In the app, open **Settings → Online RSVP**, tap **Generate** next to *Secret key*, then tap the copy button.
5. Back in Apps Script, paste the key into the `SECRET` line:
   ```js
   const SECRET = 'your-key-here';
   ```
6. Click **Save**.

### 3. Deploy the script as a web app
1. Click **Deploy → New deployment**.
2. Click the gear next to *Select type* and choose **Web app**.
3. Set **Execute as:** *Me*, and **Who has access:** *Anyone*.
4. Click **Deploy → Authorize access** and choose your Google account.
   Google will say *"Google hasn't verified this app"*. That's expected, because the "developer" is you.
   Click **Advanced** (bottom left) → **Go to … (unsafe)** → **Allow**.
   The script can only access the one Sheet it's attached to.
5. Copy the **Web app URL** (it ends in `/exec`). If you closed the dialog, find it under **Deploy → Manage deployments**.
   Don't use the *Test deployments* URL ending in `/dev`, because guests can't reach it.

### 4. Connect the app
In **Settings → Online RSVP**:
- **RSVP page:** `https://andyool.github.io/WeddingRSVP/`
- **Google Script URL:** the `/exec` URL from step 3
- **Secret key:** the key you generated

Tap **Test connection**. You should see "Connected. 0 replies so far."

From now on, invitations and reminder messages include a personal **Open invitation** link. Replies show up under **RSVPs**: open the screen, or tap **Check now** in the *Online replies* card.

## What the invitation shows, and where it comes from

| Section | Filled from (in the app) |
| --- | --- |
| Envelope "For …" | The guest's name or household greeting |
| Names, headline, date | Wedding details and the invitation's headline |
| Countdown | The ceremony's start time (or the event's own start for other invitations) |
| The Venue, View Map, Getting there, Parking | Each event's venue, address, transport and parking |
| Timeline | Each included event's start/end time and "Other details" |
| Dress code and colour swatches | Each event's dress code and dress code colours |
| Gifts | The event's "Gifts" note and the registry links in Settings |
| Menu | The event's meal choices (guests pick one when they RSVP) |
| Photo Gallery | The invitation's photo link (hidden when empty) |
| Accommodation | Each event's accommodation note |
| Our Story, FAQ, hashtag | Settings → Wedding, Guest FAQ and Online |

Sections with nothing to show are left out.

## Updating the script (when this repo's `Code.gs` changes)
The page updates itself when this repo changes, but the Google Script does not. To pick up a new `Code.gs`:
1. Open your Sheet → **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with the new [`apps-script/Code.gs`](apps-script/Code.gs). Keep your own `SECRET` line.
3. Click **Save**, then **Deploy → Manage deployments → ✎ Edit → Version: New version → Deploy**. The `/exec` URL stays the same, so nothing changes in the app.

Latest script change (October 2026): replies carry each guest's **token** (so a reply can't be forged just from a link) and a **meal choice** per event when the event offers options. Old rows and links keep working; a new "Token" column appears in the Sheet.

## Good to know
- **Older links keep working.** Every field added for the full invitation is optional; a link made by an older app build simply shows fewer sections.
- **Meal choices:** add options to an event in the app (Wedding Details → event → Meal choices) and the page lists them as the menu and asks guests to pick one when they accept.
- **Households:** guests in the same household can all reply from one link.
- **Group emails** (BCC) send a general link, and guests type their own names. If a name doesn't exactly match a guest, the app asks you to match it under *Online replies*.
- **Changing a reply:** guests can open their link again and resubmit. The newest reply wins, but if you edit an RSVP in the app afterwards, your edit is kept.
- **Motion:** guests with "Reduce Motion" turned on see the still artwork instead of the animations.

## Files
| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The invitation and RSVP page |
| `assets/envelope.mp4`, `hero.mp4`, `paper.mp4` + `.jpg` posters | Envelope opening, Tuscan hero loop and parchment loop (H.264, encoded from the asset kit's frame sequences) |
| `assets/art/` | Illustrations, section icons and frame overlays from the asset kit |
| `assets/ui/` | Divider, string lights and scroll hint |
| `apps-script/Code.gs` | Google Apps Script that stores and returns replies |

Artwork comes from the invitation asset kit kept outside this repo (`TheWedding/InvitationAssets`); see its `guide/REBUILD-GUIDE.md` for the layer order this page follows.
