# Besucher- & Klick-Statistiken mit Cookie-Consent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cookie-consent banner, an unauthenticated rate-limited `trackEvent` Cloud Function that logs pageviews/clicks to Firestore, a new admin "Statistiken" page showing aggregated counts, and a scheduled cleanup step that purges events older than 90 days.

**Architecture:** Client-side consent state lives in `localStorage`; a small `js/analytics.js` module gates all tracking calls on it and sends events via `navigator.sendBeacon` (fetch fallback) to a same-origin hosting rewrite `/track-event`, which Firebase Hosting maps to the `trackEvent` Cloud Function (same pattern already used for `/menu-card` → `menuCard`, so no CSP `connect-src` change is needed). The function rate-limits by hashed IP (reusing `functions/rateLimit.js` unchanged) and writes to a new `analytics_events` Firestore collection that only Admin SDK / `isAdmin()` readers can touch. A new `admin-analytics.html`/`js/admin-analytics.js` pair (same login-gate pattern as the other three admin pages) reads aggregated counts via `getCountFromServer()` and the last 50 raw events. `functions/scheduledCleanup.js` gets a fifth step deleting `analytics_events` docs older than 90 days.

**Tech Stack:** Firebase Hosting + Cloud Functions (Node 20, `firebase-functions` v5 `onRequest`), Firestore, vanilla JS (ES modules, no bundler), existing `I18n`/`admin-shared.js` helpers.

## Global Constraints

- Tracking must never throw a visible error or block page rendering — all tracking calls are fire-and-forget; failures are swallowed client-side.
- `trackEvent` always responds `204 No Content`, including on rate-limit rejection — the client must not be able to distinguish success from throttling.
- Rate limit: 30 events/minute per hashed IP (spec's stated allowance), reusing `functions/rateLimit.js` `createRateLimiter` unmodified.
- No raw IP is ever stored in `analytics_events` — only used transiently, sha256-hashed, as the rate-limit key (same approach as `functions/menuCard.js`).
- `analytics_events` Firestore rule: `allow write: if false` (Admin SDK bypasses rules) and `allow read: if isAdmin()`.
- 90-day retention for `analytics_events`, mirroring the existing `audit_logs` cleanup step in `functions/scheduledCleanup.js`.
- No frontend test framework exists in this repo; verify frontend/admin changes manually in a browser. `functions/rateLimit.js` already has `node:test` coverage and must be reused unchanged, not modified.
- Follow existing conventions exactly: component injection via `js/main.js`'s `loadComponent`, admin page login-gate via `initAuthGate`/`showError`/`writeAuditLog`/`t()` from `js/admin-shared.js`, i18n via `data-i18n` + `i18n/{de,en,ta}.json`.

---

### Task 1: Firestore rule for `analytics_events`

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: existing `isAdmin()` helper function (firestore.rules:5-8).
- Produces: `analytics_events` collection is now readable only by `isAdmin()`, never client-writable.

- [ ] **Step 1: Add the rule block**

Insert after the existing `audit_logs` block (before the closing braces), in `firestore.rules`:

```
    match /analytics_events/{event} {
      allow read: if isAdmin();
      allow write: if false;
    }
```

Full resulting file should read:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null &&
             exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    match /seasonal_pdfs/{doc} { allow read: if true; allow create, update, delete: if isAdmin(); }
    match /main_menu/{doc} { allow read: if isAdmin(); allow create, update, delete: if isAdmin(); }
    match /site_content/{doc} { allow read: if true; allow create, update, delete: if isAdmin(); }
    match /rate_limits/{ip} { allow read, write: if false; }
    match /admins/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
    match /audit_logs/{log} {
      allow read: if isAdmin();
      allow create: if isAdmin() &&
                       request.resource.data.userId == request.auth.uid &&
                       request.resource.data.timestamp == request.time;
      allow update, delete: if false;
    }
    match /analytics_events/{event} {
      allow read: if isAdmin();
      allow write: if false;
    }
  }
}
```

- [ ] **Step 2: Verify syntax**

Run: `npx -y firebase-tools@latest firestore:rules:validate firestore.rules 2>&1 || echo "no local CLI available — will validate on next deploy"`

Since the CLI may require login/project context and this task must not deploy anything, it is acceptable if this only confirms the file parses; a human reviewer confirms the diff visually matches the `audit_logs` block pattern otherwise.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: restrict analytics_events collection to admin-only reads"
```

---

### Task 2: Hosting rewrite for `/track-event`

**Files:**
- Modify: `firebase.json`

**Interfaces:**
- Produces: same-origin path `/track-event` that Firebase Hosting forwards to the (not-yet-created) `trackEvent` Cloud Function — client code in later tasks calls this same-origin path so no CSP `connect-src` change is required.

- [ ] **Step 1: Add the rewrite**

In `firebase.json`, in the `hosting.rewrites` array, add a new entry right after the existing `/menu-card` rewrite (before the catch-all `"**"` rewrite):

```json
      {
        "source": "/menu-card",
        "function": "menuCard"
      },
      {
        "source": "/track-event",
        "function": "trackEvent"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('firebase.json','utf8')); console.log('valid json')"`
Expected: `valid json`

- [ ] **Step 3: Commit**

```bash
git add firebase.json
git commit -m "feat: add hosting rewrite for /track-event to trackEvent function"
```

---

### Task 3: `trackEvent` Cloud Function

**Files:**
- Create: `functions/trackEvent.js`
- Modify: `functions/package.json` (add a `test` script — none currently exists even though `rateLimit.test.js` uses `node:test`)

**Interfaces:**
- Consumes: `createRateLimiter(db, options)` from `functions/rateLimit.js` (returns async `checkRateLimit(ipHash, now)` → `{ allowed: bool }`).
- Produces: `exports.trackEvent` — a `functions.https.onRequest` handler. Always responds `204`. On success writes a doc to Firestore collection `analytics_events`: `{ type: 'pageview'|'click', page: string, label: string|null, timestamp: FieldValue.serverTimestamp() }`.

- [ ] **Step 1: Add a `test` script to `functions/package.json`**

Current file:
```json
{
  "name": "srilanka-et-italy-functions",
  "version": "1.0.0",
  "engines": { "node": "20" },
  "main": "index.js",
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  }
}
```

New file:
```json
{
  "name": "srilanka-et-italy-functions",
  "version": "1.0.0",
  "engines": { "node": "20" },
  "main": "index.js",
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^5.0.0"
  }
}
```

- [ ] **Step 2: Run the existing test suite to confirm the new script works**

Run: `cd functions && npm test`
Expected: `rateLimit.test.js`'s 4 tests pass (this only wires up the runner; it does not change `rateLimit.js` itself).

- [ ] **Step 3: Write `functions/trackEvent.js`**

```js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { createRateLimiter } = require('./rateLimit');

const VALID_TYPES = ['pageview', 'click'];

exports.trackEvent = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(204).send();
    return;
  }

  const db = admin.firestore();
  const checkRateLimit = createRateLimiter(db, { limit: 30, windowMs: 60000 });

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : null)
    || req.ip || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

  const { allowed } = await checkRateLimit(ipHash);
  if (!allowed) {
    res.status(204).send();
    return;
  }

  const body = req.body || {};
  const { type, page, label } = body;
  if (!VALID_TYPES.includes(type) || typeof page !== 'string' || !page) {
    res.status(204).send();
    return;
  }

  try {
    await db.collection('analytics_events').add({
      type,
      page,
      label: typeof label === 'string' && label ? label : null,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('trackEvent write failed:', err.message);
  }

  res.status(204).send();
});
```

- [ ] **Step 4: Manual verification (no emulator/test-framework wiring exists for `onRequest` handlers in this project — same convention as `menuCard.js`)**

After deployment (or via `firebase emulators:start --only functions,firestore` if the developer has the emulator suite installed locally), run:

```bash
curl -i -X POST https://us-central1-srilanka-et-italy.cloudfunctions.net/trackEvent \
  -H "Content-Type: application/json" \
  -d '{"type":"pageview","page":"/"}'
```

Expected: `HTTP/1.1 204 No Content`, and a new document appears in the `analytics_events` Firestore collection with `type: "pageview"`, `page: "/"`, `label: null`, and a `timestamp`.

Repeat 31 times within a minute from the same IP; the 31st call must still return `204` (rate-limited but silently swallowed) and must NOT create a 31st document.

- [ ] **Step 5: Commit**

```bash
git add functions/trackEvent.js functions/package.json
git commit -m "feat: add rate-limited trackEvent Cloud Function"
```

---

### Task 4: Wire `trackEvent` into `functions/index.js`

**Files:**
- Modify: `functions/index.js`

**Interfaces:**
- Consumes: `exports.trackEvent` from `functions/trackEvent.js` (Task 3).

- [ ] **Step 1: Update `functions/index.js`**

Current file:
```js
const admin = require('firebase-admin');
admin.initializeApp();

const { validatePDFUpload } = require('./validatePDF');
const { scheduledCleanup }  = require('./scheduledCleanup');
const { menuCard }          = require('./menuCard');

exports.validatePDFUpload = validatePDFUpload;
exports.scheduledCleanup  = scheduledCleanup;
exports.menuCard          = menuCard;
```

New file:
```js
const admin = require('firebase-admin');
admin.initializeApp();

const { validatePDFUpload } = require('./validatePDF');
const { scheduledCleanup }  = require('./scheduledCleanup');
const { menuCard }          = require('./menuCard');
const { trackEvent }        = require('./trackEvent');

exports.validatePDFUpload = validatePDFUpload;
exports.scheduledCleanup  = scheduledCleanup;
exports.menuCard          = menuCard;
exports.trackEvent       = trackEvent;
```

- [ ] **Step 2: Sanity-check the module loads**

Run: `cd functions && node -e "process.env.GCLOUD_PROJECT='test'; require('firebase-admin').initializeApp(); require('./index.js'); console.log('index.js loads OK')"`
Expected: `index.js loads OK` (no throw).

- [ ] **Step 3: Commit**

```bash
git add functions/index.js
git commit -m "feat: register trackEvent Cloud Function"
```

---

### Task 5: 90-day cleanup of `analytics_events`

**Files:**
- Modify: `functions/scheduledCleanup.js`

**Interfaces:**
- Consumes: `admin.firestore.Timestamp`, `db.collection('analytics_events')` (new collection from Task 3).

- [ ] **Step 1: Add step 5 to the cleanup function**

In `functions/scheduledCleanup.js`, add a fifth cleanup block right after the existing "4. Stale rate_limits" block, reusing the already-computed `cutoff90` from step 2 (both are 90-day cutoffs, same value):

```js
    // 5. Analytics events older than 90 days
    const oldEventsSnap = await db.collection('analytics_events')
      .where('timestamp', '<', cutoff90)
      .get();
    const eventDeletes = oldEventsSnap.docs.map(d => d.ref.delete());
```

Update the `Promise.allSettled` call to include the new deletes:

```js
    await Promise.allSettled([...expiredDeletes, ...logDeletes, ...stuckDeletes, ...rateLimitDeletes, ...eventDeletes]);
```

Update the trailing `console.log` and the top-of-file comment listing the steps:

```js
    console.log(`Cleanup complete: ${expiredSnap.size} expired, ${oldLogsSnap.size} logs, ${stuckSnap.size} stuck drafts, ${staleRateLimitsSnap.size} stale rate limits, ${oldEventsSnap.size} analytics events`);
```

And the header comment:
```js
// Runs daily at 02:00 UTC.
// 1. Deletes expired PDFs (endDate in the past)
// 2. Deletes audit logs older than 90 days
// 3. Deletes stuck drafts older than 1 hour
// 4. Deletes stale rate_limits windows older than 1 hour
// 5. Deletes analytics_events older than 90 days
```

- [ ] **Step 2: Sanity-check the module loads**

Run: `cd functions && node -e "process.env.GCLOUD_PROJECT='test'; require('firebase-admin').initializeApp(); require('./scheduledCleanup.js'); console.log('scheduledCleanup.js loads OK')"`
Expected: `scheduledCleanup.js loads OK`

- [ ] **Step 3: Commit**

```bash
git add functions/scheduledCleanup.js
git commit -m "feat: purge analytics_events older than 90 days in scheduled cleanup"
```

---

### Task 6: i18n keys for consent banner and admin analytics page

**Files:**
- Modify: `i18n/de.json`
- Modify: `i18n/en.json`
- Modify: `i18n/ta.json`

**Interfaces:**
- Produces: new top-level key `consent` (`banner_text`, `accept_btn`, `decline_btn`) and new `admin.*` keys used by Tasks 9 and 11-12 (`admin.launcher_category_analytics`, `admin.analytics_title`, `admin.analytics_pageviews_label`, `admin.analytics_clicks_label`, `admin.analytics_by_page_label`, `admin.analytics_by_label_label`, `admin.analytics_recent_label`, `admin.analytics_empty`).

- [ ] **Step 1: Add keys to `i18n/de.json`**

Add a new top-level `"consent"` object (alongside `"nav"`, `"hero"`, etc.):

```json
  "consent": {
    "banner_text": "Wir verwenden anonyme Nutzungsstatistiken, um unsere Website zu verbessern. Erst nach Ihrer Zustimmung erfassen wir Seitenaufrufe und Klicks.",
    "accept_btn": "Akzeptieren",
    "decline_btn": "Ablehnen"
  },
```

Add these keys inside the existing `"admin"` object:

```json
    "launcher_category_analytics": "Statistiken",
    "analytics_title": "Besucherstatistiken",
    "analytics_pageviews_label": "Seitenaufrufe gesamt",
    "analytics_by_page_label": "Aufrufe pro Seite",
    "analytics_by_label_label": "Klicks pro Label",
    "analytics_recent_label": "Letzte Ereignisse",
    "analytics_empty": "Noch keine Daten vorhanden."
```

- [ ] **Step 2: Add the equivalent keys to `i18n/en.json`**

```json
  "consent": {
    "banner_text": "We use anonymous usage statistics to improve our website. We only collect pageviews and clicks after you consent.",
    "accept_btn": "Accept",
    "decline_btn": "Decline"
  },
```

```json
    "launcher_category_analytics": "Statistics",
    "analytics_title": "Visitor Statistics",
    "analytics_pageviews_label": "Total pageviews",
    "analytics_by_page_label": "Views per page",
    "analytics_by_label_label": "Clicks per label",
    "analytics_recent_label": "Recent events",
    "analytics_empty": "No data yet."
```

- [ ] **Step 3: Add the equivalent keys to `i18n/ta.json`**

```json
  "consent": {
    "banner_text": "எங்கள் இணையதளத்தை மேம்படுத்த அநாமதேய பயன்பாட்டு புள்ளிவிவரங்களைப் பயன்படுத்துகிறோம். உங்கள் ஒப்புதலுக்குப் பிறகே பக்கப் பார்வைகள் மற்றும் கிளிக்குகளை சேகரிக்கிறோம்.",
    "accept_btn": "ஏற்றுக்கொள்",
    "decline_btn": "நிராகரி"
  },
```

```json
    "launcher_category_analytics": "புள்ளிவிவரங்கள்",
    "analytics_title": "பார்வையாளர் புள்ளிவிவரங்கள்",
    "analytics_pageviews_label": "மொத்த பக்கப் பார்வைகள்",
    "analytics_by_page_label": "ஒரு பக்கத்திற்கான பார்வைகள்",
    "analytics_by_label_label": "ஒரு லேபிளுக்கான கிளிக்குகள்",
    "analytics_recent_label": "சமீபத்திய நிகழ்வுகள்",
    "analytics_empty": "இன்னும் தரவு இல்லை."
```

- [ ] **Step 4: Validate all three JSON files parse**

Run: `for f in i18n/de.json i18n/en.json i18n/ta.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('$f valid')"; done`
Expected: three `... valid` lines, no errors.

- [ ] **Step 5: Commit**

```bash
git add i18n/de.json i18n/en.json i18n/ta.json
git commit -m "feat: add i18n keys for cookie-consent banner and analytics admin page"
```

---

### Task 7: Cookie-consent banner component + styles

**Files:**
- Create: `components/cookie-consent.html`
- Modify: `css/main.css` (append banner styles at end of file)

**Interfaces:**
- Produces: markup with `#cookie-consent-banner`, `.consent-accept-btn`, `.consent-decline-btn` — consumed by `js/analytics.js` in Task 8 and wired into `js/main.js` in Task 9.

- [ ] **Step 1: Write `components/cookie-consent.html`**

```html
<div id="cookie-consent-banner" class="cookie-consent" hidden>
    <p class="cookie-consent-text" data-i18n="consent.banner_text">Wir verwenden anonyme Nutzungsstatistiken, um unsere Website zu verbessern. Erst nach Ihrer Zustimmung erfassen wir Seitenaufrufe und Klicks.</p>
    <div class="cookie-consent-actions">
        <button type="button" class="btn-outline consent-decline-btn" data-i18n="consent.decline_btn">Ablehnen</button>
        <button type="button" class="btn-dark consent-accept-btn" data-i18n="consent.accept_btn">Akzeptieren</button>
    </div>
</div>
```

- [ ] **Step 2: Append styles to `css/main.css`**

```css
/* Cookie consent banner */
.cookie-consent {
    position: fixed;
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    z-index: 999;
    max-width: 640px;
    margin: 0 auto;
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;
}

.cookie-consent-text {
    flex: 1 1 320px;
    margin: 0;
    font-size: 0.85rem;
    color: var(--muted);
}

.cookie-consent-actions {
    display: flex;
    gap: 0.75rem;
    flex-shrink: 0;
}
```

- [ ] **Step 3: Manual visual check**

Open `index.html` in a browser (e.g. via `npm run dev`), confirm no console errors from the new markup (the banner is `hidden` until Task 9 wires it up, so it should not be visible yet).

- [ ] **Step 4: Commit**

```bash
git add components/cookie-consent.html css/main.css
git commit -m "feat: add cookie-consent banner component and styles"
```

---

### Task 8: `js/analytics.js` — consent gate + tracking client

**Files:**
- Create: `js/analytics.js`

**Interfaces:**
- Consumes: `#cookie-consent-banner`, `.consent-accept-btn`, `.consent-decline-btn` (Task 7).
- Produces: exported functions consumed by `js/main.js` in Task 9:
  - `initConsentBanner(): void` — shows the banner if no decision stored yet, wires the two buttons to store `'accepted'`/`'declined'` in `localStorage.cookie_consent` and hide the banner.
  - `hasConsent(): boolean` — `localStorage.getItem('cookie_consent') === 'accepted'`.
  - `trackPageview(page: string): void` — fire-and-forget, gated on `hasConsent()`.
  - `trackClick(label: string): void` — fire-and-forget, gated on `hasConsent()`.
  - `setupClickTracking(): void` — delegated document click listener for `[data-track]` elements.

- [ ] **Step 1: Write `js/analytics.js`**

```js
const ENDPOINT = '/track-event';

function sendEvent(payload) {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
        try {
            navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
            return;
        } catch { /* fall through to fetch */ }
    }
    fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
    }).catch(() => { /* tracking failures are non-fatal and invisible to the user */ });
}

export function hasConsent() {
    return localStorage.getItem('cookie_consent') === 'accepted';
}

export function trackPageview(page) {
    if (!hasConsent()) return;
    sendEvent({ type: 'pageview', page });
}

export function trackClick(label) {
    if (!hasConsent()) return;
    sendEvent({ type: 'click', page: window.location.pathname, label });
}

export function initConsentBanner() {
    const banner = document.getElementById('cookie-consent-banner');
    if (!banner) return;

    if (localStorage.getItem('cookie_consent')) {
        banner.hidden = true;
        return;
    }

    banner.hidden = false;

    banner.querySelector('.consent-accept-btn').addEventListener('click', () => {
        localStorage.setItem('cookie_consent', 'accepted');
        banner.hidden = true;
        trackPageview(window.location.pathname);
    });

    banner.querySelector('.consent-decline-btn').addEventListener('click', () => {
        localStorage.setItem('cookie_consent', 'declined');
        banner.hidden = true;
    });
}

export function setupClickTracking() {
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-track]');
        if (!el) return;
        let label = el.getAttribute('data-track');
        if (label === 'lang_switch') {
            const lang = el.getAttribute('data-lang');
            if (lang) label = `lang_switch_${lang}`;
        }
        trackClick(label);
    });
}
```

- [ ] **Step 2: Manual verification**

In a browser console on any page after this file is imported (it will be, once Task 9 wires it in): run `localStorage.removeItem('cookie_consent'); location.reload();` — banner should appear. Click "Akzeptieren" — banner disappears, `localStorage.getItem('cookie_consent')` is `'accepted'`, and the Network tab shows a beacon/fetch request to `/track-event`. Reload again — banner does not reappear (decision persisted).

- [ ] **Step 3: Commit**

```bash
git add js/analytics.js
git commit -m "feat: add consent-gated analytics tracking client module"
```

---

### Task 9: Wire consent banner + tracking into `js/main.js`

**Files:**
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `initConsentBanner`, `setupClickTracking`, `trackPageview`, `hasConsent` from `js/analytics.js` (Task 8); `#cookie-consent-banner` component (Task 7).

- [ ] **Step 1: Add the component to the injected list and import the module**

At the top of `js/main.js`, add the import:

```js
import { initConsentBanner, setupClickTracking, trackPageview } from './analytics.js';
```

In the `constructor()`, add the banner to `this.components` (after `footer-placeholder` so it loads alongside the rest):

```js
        this.components = [
            { id: 'nav-placeholder',      file: 'components/nav.html' },
            { id: 'hero-placeholder',     file: 'components/hero.html' },
            { id: 'about-placeholder',    file: 'components/about.html' },
            { id: 'club-placeholder',     file: 'components/club.html' },
            { id: 'menu-placeholder',     file: 'components/menu.html' },
            { id: 'location-placeholder', file: 'components/location.html' },
            { id: 'footer-placeholder',   file: 'components/footer.html' },
            { id: 'cookie-consent-placeholder', file: 'components/cookie-consent.html' }
        ];
```

- [ ] **Step 2: Add `<div id="cookie-consent-placeholder"></div>` to `index.html`**

Find the closing `</body>` tag in `index.html` and add the placeholder div right before it (same pattern as the other placeholder divs already in that file — check the existing `<div id="footer-placeholder"></div>` for the exact sibling pattern and place this one immediately after it).

- [ ] **Step 3: Call the new setup functions from `init()`**

```js
    async init() {
        await Promise.all(this.components.map(c => this.loadComponent(c.id, c.file)));
        await this.i18n.init();
        this.setupAnimations();
        this.setupEventListeners();
        this.loadContactData().then(() => this.applyContactOverrides());
        await this.setupSeasonalCarousel();
        initConsentBanner();
        setupClickTracking();
        trackPageview(window.location.pathname);
    }
```

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open the site, confirm: (a) the consent banner appears at the bottom on first visit, (b) clicking a nav language button or the hero CTA does nothing trackable until consent is accepted (check Network tab — no `/track-event` requests before accepting), (c) after accepting, a `/track-event` request fires immediately for the pageview, and clicking `data-track`-tagged elements (added in Task 10) fires additional requests.

- [ ] **Step 5: Commit**

```bash
git add js/main.js index.html
git commit -m "feat: wire cookie-consent banner and pageview/click tracking into main.js"
```

---

### Task 10: Add `data-track` attributes to trackable elements

**Files:**
- Modify: `components/hero.html`
- Modify: `components/menu.html`
- Modify: `components/location.html`
- Modify: `components/club.html`
- Modify: `components/nav.html`

**Interfaces:**
- Consumes: the delegated `[data-track]` click listener from `setupClickTracking()` (Task 8/9).

- [ ] **Step 1: `components/hero.html`** — tag the hero CTA

Change:
```html
            <a href="#menu" class="btn-dark" data-i18n="hero.cta_menu">Speisekarte ansehen</a>
```
to:
```html
            <a href="#menu" class="btn-dark" data-i18n="hero.cta_menu" data-track="hero_cta_menu">Speisekarte ansehen</a>
```

- [ ] **Step 2: `components/menu.html`** — tag the menu-open link

Change:
```html
        <a href="/menu-card" target="_blank" class="mc mc-pdf" rel="noopener">
```
to:
```html
        <a href="/menu-card" target="_blank" class="mc mc-pdf" rel="noopener" data-track="menu_open">
```

- [ ] **Step 3: `components/location.html`** — tag route + contact links

Change:
```html
        <a href="https://maps.google.com/?q=Rötenbacher+Str.+33,+88364+Wolfegg" target="_blank" class="dir-btn"
            data-i18n="location.route_btn">→ Route planen</a>
```
to:
```html
        <a href="https://maps.google.com/?q=Rötenbacher+Str.+33,+88364+Wolfegg" target="_blank" class="dir-btn"
            data-i18n="location.route_btn" data-track="route_plan">→ Route planen</a>
```

Change:
```html
            <a href="mailto:srilanka.et.italy@gmail.com">srilanka.et.italy@gmail.com</a><br>
            <a href="tel:+4915224277600">+49 152 24277600</a><br>
            <a href="tel:+4917629931281">+49 176 29931281</a>
```
to:
```html
            <a href="mailto:srilanka.et.italy@gmail.com" data-track="contact_email">srilanka.et.italy@gmail.com</a><br>
            <a href="tel:+4915224277600" data-track="contact_phone">+49 152 24277600</a><br>
            <a href="tel:+4917629931281" data-track="contact_phone">+49 176 29931281</a>
```

- [ ] **Step 4: `components/club.html`** — tag the club link

Change:
```html
        <a href="https://www.sg-tell-wolfegg.com/" target="_blank" class="btn-outline"
            style="margin-top: 2rem; display: inline-block;" data-i18n="club.link">Mehr zum Verein</a>
```
to:
```html
        <a href="https://www.sg-tell-wolfegg.com/" target="_blank" class="btn-outline"
            style="margin-top: 2rem; display: inline-block;" data-i18n="club.link" data-track="club_link">Mehr zum Verein</a>
```

- [ ] **Step 5: `components/nav.html`** — tag language buttons

Change:
```html
    <div class="lang-switcher">
      <button class="lang-btn" data-lang="de">DE</button>
      <button class="lang-btn" data-lang="en">EN</button>
      <button class="lang-btn" data-lang="ta">TA</button>
    </div>
```
to:
```html
    <div class="lang-switcher">
      <button class="lang-btn" data-lang="de" data-track="lang_switch">DE</button>
      <button class="lang-btn" data-lang="en" data-track="lang_switch">EN</button>
      <button class="lang-btn" data-lang="ta" data-track="lang_switch">TA</button>
    </div>
```

(`setupClickTracking()` in Task 8 special-cases `data-track="lang_switch"` and appends the target language from the button's own `data-lang` attribute, producing `lang_switch_en` etc.)

- [ ] **Step 6: Manual verification**

With consent accepted (see Task 9 verification), click each tagged element and confirm in the Network tab that a `/track-event` request fires with the expected `label` in its body for: `hero_cta_menu`, `menu_open`, `route_plan`, `contact_email`, `contact_phone`, `club_link`, `lang_switch_en` (and `_de`/`_ta`).

- [ ] **Step 7: Commit**

```bash
git add components/hero.html components/menu.html components/location.html components/club.html components/nav.html
git commit -m "feat: tag trackable elements with data-track labels"
```

---

### Task 11: Admin analytics page

**Files:**
- Create: `admin-analytics.html`
- Create: `js/admin-analytics.js`

**Interfaces:**
- Consumes: `initAuthGate`, `showError`, `t` from `js/admin-shared.js`; `db` from `js/firebase-config.js`; Firestore `getCountFromServer`, `collection`, `query`, `where`, `orderBy`, `limit`, `getDocs`.

- [ ] **Step 1: Write `admin-analytics.html`**

Based on the `admin-contact.html` template (same login screen, header, back link), with the section body replaced:

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Statistiken — Admin — Sri Lanka ET Italy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/admin.css">
  <link rel="icon" type="image/x-icon" href="assets/favicon.ico">
  <meta name="robots" content="noindex, nofollow">
</head>
<body>

  <!-- Login Screen -->
  <div id="login-screen" class="admin-login-screen" hidden>
    <div class="admin-login-card">
      <p class="admin-login-eyebrow">Sri Lanka ET Italy</p>
      <h1 class="admin-login-title" data-i18n="admin.login_title">Admin Login</h1>

      <div class="admin-lang-switch">
        <button class="admin-lang-btn active" data-lang="de">DE</button>
        <button class="admin-lang-btn" data-lang="en">EN</button>
        <button class="admin-lang-btn" data-lang="ta">TA</button>
      </div>

      <form id="login-form" novalidate>
        <div class="admin-field">
          <label for="email" data-i18n="admin.email_label">E-Mail</label>
          <input type="email" id="email" autocomplete="email" required>
        </div>
        <div class="admin-field">
          <label for="password" data-i18n="admin.password_label">Passwort</label>
          <div class="admin-password-wrap">
            <input type="password" id="password" autocomplete="current-password" required>
            <button type="button" id="toggle-password" class="admin-pw-toggle" aria-label="Passwort anzeigen">👁</button>
          </div>
        </div>
        <p id="login-error" class="admin-error" hidden></p>
        <button type="submit" class="btn-dark admin-submit" data-i18n="admin.login_btn">Anmelden</button>
      </form>
    </div>
  </div>

  <!-- Admin Panel (hidden until authenticated) -->
  <div id="admin-panel" class="admin-panel" hidden>
    <header class="admin-header">
      <div class="admin-header-brand">
        <a href="admin.html" class="tile-panel-back" aria-label="Zurück">←</a>
        <span class="admin-header-logo">Sri Lanka <em>ET</em> Italy</span>
        <span class="admin-header-badge" data-i18n="admin.header_badge">Admin</span>
      </div>
      <div class="admin-header-right">
        <div class="admin-header-langs">
          <button class="admin-lang-btn active" data-lang="de">DE</button>
          <button class="admin-lang-btn" data-lang="en">EN</button>
          <button class="admin-lang-btn" data-lang="ta">TA</button>
        </div>
        <button id="logout-btn" class="btn-outline" data-i18n="admin.logout_btn">Abmelden</button>
      </div>
    </header>
    <main class="admin-main">
      <div class="admin-panel-langs">
        <button class="admin-lang-btn active" data-lang="de">DE</button>
        <button class="admin-lang-btn" data-lang="en">EN</button>
        <button class="admin-lang-btn" data-lang="ta">TA</button>
      </div>

      <div class="admin-section">
        <div class="admin-section-header">
          <h2 class="admin-section-title" data-i18n="admin.analytics_title">Besucherstatistiken</h2>
        </div>

        <div class="admin-field">
          <label data-i18n="admin.analytics_pageviews_label">Seitenaufrufe gesamt</label>
          <p id="analytics-total-pageviews">–</p>
        </div>

        <div class="admin-field">
          <label data-i18n="admin.analytics_by_page_label">Aufrufe pro Seite</label>
          <ul id="analytics-by-page"></ul>
        </div>

        <div class="admin-field">
          <label data-i18n="admin.analytics_by_label_label">Klicks pro Label</label>
          <ul id="analytics-by-label"></ul>
        </div>

        <div class="admin-field">
          <label data-i18n="admin.analytics_recent_label">Letzte Ereignisse</label>
          <ul id="analytics-recent"></ul>
        </div>

        <p id="analytics-empty" class="admin-error" hidden data-i18n="admin.analytics_empty">Noch keine Daten vorhanden.</p>
      </div>
    </main>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
  <script type="module" src="js/admin-analytics.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `js/admin-analytics.js`**

```js
import { db } from './firebase-config.js';
import {
  collection, query, where, orderBy, limit, getDocs, getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { initAuthGate } from './admin-shared.js';

const CLICK_LABELS = [
  'hero_cta_menu', 'menu_open', 'route_plan',
  'contact_email', 'contact_phone', 'club_link',
  'lang_switch_de', 'lang_switch_en', 'lang_switch_ta'
];

initAuthGate(async () => {
  await loadAnalytics();
});

async function loadAnalytics() {
  const eventsCol = collection(db, 'analytics_events');

  const [totalPageviewsSnap, allPageSnap, recentSnap] = await Promise.all([
    getCountFromServer(query(eventsCol, where('type', '==', 'pageview'))),
    getDocs(query(eventsCol, where('type', '==', 'pageview'))),
    getDocs(query(eventsCol, orderBy('timestamp', 'desc'), limit(50)))
  ]);

  document.getElementById('analytics-total-pageviews').textContent = totalPageviewsSnap.data().count;

  const byPage = {};
  allPageSnap.forEach(docSnap => {
    const page = docSnap.data().page || '(unbekannt)';
    byPage[page] = (byPage[page] || 0) + 1;
  });
  renderCountList('analytics-by-page', byPage);

  const byLabelCounts = {};
  await Promise.all(CLICK_LABELS.map(async (label) => {
    const snap = await getCountFromServer(query(eventsCol, where('type', '==', 'click'), where('label', '==', label)));
    byLabelCounts[label] = snap.data().count;
  }));
  renderCountList('analytics-by-label', byLabelCounts);

  const recentList = document.getElementById('analytics-recent');
  recentList.innerHTML = '';
  recentSnap.forEach(docSnap => {
    const data = docSnap.data();
    const li = document.createElement('li');
    const ts = data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString('de-DE') : '–';
    li.textContent = `${ts} — ${data.type}${data.label ? ' (' + data.label + ')' : ''} — ${data.page}`;
    recentList.appendChild(li);
  });

  const hasData = totalPageviewsSnap.data().count > 0 || recentSnap.size > 0;
  document.getElementById('analytics-empty').hidden = hasData;
}

function renderCountList(elementId, counts) {
  const el = document.getElementById(elementId);
  el.innerHTML = '';
  Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .forEach(([key, count]) => {
      const li = document.createElement('li');
      li.textContent = `${key}: ${count}`;
      el.appendChild(li);
    });
}
```

- [ ] **Step 3: Manual verification**

Log into `admin-analytics.html` with an existing admin account. With an empty `analytics_events` collection, confirm the "no data yet" message shows and no script errors appear. After a few tracked pageviews/clicks exist (from Tasks 9/10 testing), reload the page and confirm the total count, per-page counts, per-label counts, and the last-50 list all populate correctly, and that a non-admin user is redirected to the login screen (existing `initAuthGate` behavior, unchanged).

- [ ] **Step 4: Commit**

```bash
git add admin-analytics.html js/admin-analytics.js
git commit -m "feat: add admin analytics page showing aggregated visitor stats"
```

---

### Task 12: "Statistiken" launcher tile on `admin.html`

**Files:**
- Modify: `admin.html`

**Interfaces:**
- Consumes: `admin-analytics.html` (Task 11), `admin.launcher_category_analytics` / `admin.analytics_title` i18n keys (Task 6).

- [ ] **Step 1: Add a new launcher column**

In `admin.html`, inside `.launcher-columns`, add a new `.launcher-column` after the existing "Kontakt & Standort" column (before its closing `</div>` for `.launcher-columns`):

```html
          <div class="launcher-column">
            <div class="launcher-category" data-i18n="admin.launcher_category_analytics">Statistiken</div>
            <div class="launcher-grid">
              <a href="admin-analytics.html" class="launcher-tile">
                <div class="launcher-tile-icon launcher-tile-icon--custom">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
                    <circle cx="50" cy="50" r="46" fill="#1c2229" />
                    <circle cx="50" cy="50" r="41" fill="none" stroke="#d4af37" stroke-width="2.5" />
                    <rect x="30" y="55" width="8" height="18" rx="2" fill="#d4af37" />
                    <rect x="46" y="42" width="8" height="31" rx="2" fill="#ffffff" />
                    <rect x="62" y="30" width="8" height="43" rx="2" fill="#d4af37" />
                  </svg>
                </div>
                <span class="launcher-tile-label" data-i18n="admin.analytics_title">Besucherstatistiken</span>
              </a>
            </div>
          </div>
```

- [ ] **Step 2: Manual verification**

Load `admin.html`, log in, confirm the new "Statistiken" tile appears as a third column and navigates to `admin-analytics.html` on click, in all three languages (switch language via the lang buttons and confirm the tile label updates).

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: add Statistiken launcher tile to admin home"
```

---

## Post-plan follow-up (explicitly out of scope, per spec)

- Updating the `datenschutz` (privacy policy) i18n text to describe this tracking — noted in the spec as a separate, non-technical legal-text task.
