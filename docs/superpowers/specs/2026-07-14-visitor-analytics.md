# Besucher- & Klick-Statistiken mit Cookie-Consent

## Problem

Es gibt keinerlei Einblick, wie oft die Website besucht wird oder welche Elemente (Speisekarte, Route planen, Kontakt etc.) tatsächlich genutzt werden. Es existiert auch noch kein Cookie-Consent-Mechanismus, obwohl die Seite bereits ein Impressum/Datenschutzerklärung hat.

## Ziel

- Ein Cookie-Consent-Banner, der Tracking nur nach expliziter Zustimmung aktiviert.
- Seitenaufrufe und gezielte Klicks (via `data-track`-Attribut) werden über eine rate-limitete Cloud Function als Event-Log in Firestore geschrieben — unsichtbar für den Besucher.
- Eine neue Admin-Kachel "Statistiken" zeigt aggregierte Zahlen (Aufrufe/Klicks pro Label) sowie eine Liste der letzten Ereignisse.
- Automatische Bereinigung alter Einträge (90 Tage), analog zu `audit_logs`.

## Architektur

### 1. Cookie-Consent-Banner

Neue, kleine Komponente `components/cookie-consent.html` + zugehöriges JS (in `js/main.js` integriert oder eigenes kleines Modul): dezenter Banner am unteren Bildschirmrand, erscheint nur, wenn noch keine Entscheidung gespeichert ist (`localStorage.getItem('cookie_consent')`). Zwei Buttons: "Akzeptieren" / "Ablehnen", Entscheidung wird in `localStorage` gespeichert (`'accepted'`/`'declined'`). Tracking-Aufrufe (Seitenaufruf + Klicks) werden nur ausgelöst, wenn `cookie_consent === 'accepted'`.

### 2. `data-track`-Konvention

Klickbare Elemente, die getrackt werden sollen, bekommen ein `data-track="<label>"`-Attribut (z. B. `data-track="hero_cta_menu"`). Ein globaler Klick-Listener in `js/main.js` (ähnlich dem bestehenden `.lang-btn`-Listener-Muster) prüft bei jedem Klick, ob das Zielelement (oder ein Vorfahre via `closest('[data-track]')`) dieses Attribut hat, und meldet den Klick — nur bei erteiltem Consent.

Start-Set an Labels (später durch einfaches Hinzufügen des Attributs erweiterbar, keine Code-Änderung nötig):
- `hero_cta_menu` — "Speisekarte ansehen" (Hero-CTA)
- `menu_open` — "Speisekarte öffnen" (Menü-Kachel)
- `route_plan` — "Route planen"
- `contact_email` / `contact_phone` — Kontakt-Links
- `lang_switch` — Sprachumschaltung (Label inkl. Zielsprache, z. B. `lang_switch_en`)
- `club_link` — "Mehr zum Verein"

### 3. Cloud Function `trackEvent`

Neue Function (public, unauthenticated `onRequest`, wie `menuCard`), nimmt POST mit `{ type: 'pageview'|'click', page: string, label?: string }`:
- Rate-Limit pro gehashter IP, wiederverwendet `functions/rateLimit.js` (`createRateLimiter`), großzügiges Limit (z. B. 30 Events/Minute pro IP — deckt normales Nutzerverhalten ab, bremst aber Missbrauch).
- Schreibt bei Erfolg ein Dokument in Firestore-Collection `analytics_events`: `{ type, page, label: label || null, timestamp: serverTimestamp() }`.
- Antwortet immer mit `204 No Content` (auch bei Rate-Limit-Überschreitung — der Client soll das Ergebnis nicht auswerten, da unsichtbar im Hintergrund).

Aufruf vom Client: `navigator.sendBeacon` (bevorzugt, da non-blocking und überlebt Seitenwechsel) mit Fallback auf `fetch(..., { keepalive: true })`.

### 4. Firestore

Neue Collection `analytics_events`, Dokument-Schema wie oben. Sicherheitsregel: kein Client-Zugriff (`allow read, write: if false`) — nur die Cloud Function (Admin-SDK, umgeht Regeln) schreibt, nur der Admin-Panel-Client liest (`allow read: if isAdmin()`).

### 5. Admin-Seite `admin-analytics.html` + `js/admin-analytics.js`

Neue, eigenständige Seite (gleiches Muster wie die anderen drei Admin-Seiten: Login-Gate, Zurück-Link zu `admin.html`):
- Aggregierte Zahlen über `getCountFromServer()`-Abfragen (liest nur die Summe, nicht jedes Dokument — bleibt günstig): Gesamtaufrufe, Aufrufe pro Seite, Klicks pro Label.
- Liste der letzten ~50 Ereignisse mit Zeitstempel (einfache `orderBy('timestamp', 'desc').limit(50)`-Abfrage).

Neue Launcher-Kachel "Statistiken" in einer neuen vierten Kategorie (oder Erweiterung von "Kontakt & Standort" — noch zu entscheiden im Plan) mit Link zu `admin-analytics.html`.

### 6. Bereinigung

`functions/scheduledCleanup.js` bekommt einen fünften Schritt: Löschen von `analytics_events`-Dokumenten älter als 90 Tage (identisches Muster zu Schritt 2 dort für `audit_logs`).

### 7. Datenschutz

Diese Funktion sammelt aggregierte Nutzungsdaten (Seitenaufrufe, Klick-Labels), keine direkt identifizierenden Daten (IP wird nur gehasht fürs Rate-Limiting verwendet, nicht im Event-Dokument gespeichert). Die bestehende Datenschutzerklärung (`i18n` `datenschutz`-Sektion) sollte um einen Abschnitt zu diesem Tracking ergänzt werden — das ist ein **eigener, nicht-technischer Folge-Task** (Rechtstext), nicht Teil dieses Implementierungsplans.

## Fehlerbehandlung

- Tracking-Aufrufe dürfen niemals sichtbare Fehler verursachen oder die Seite verlangsamen — `sendBeacon`/`fetch keepalive` sind fire-and-forget, Fehler werden clientseitig ignoriert.
- Rate-Limit-Überschreitung führt nicht zu einer Fehlermeldung beim Nutzer (unsichtbar, wie oben beschrieben).
- Admin-Statistik-Seite: leere Zustände (noch keine Daten) werden sauber angezeigt, kein Absturz bei leerer Collection.

## Tests

Kein Test-Framework für Frontend in diesem Projekt, konsistent mit dem Rest. `functions/rateLimit.js` ist bereits mit `node:test` abgedeckt und wird unverändert wiederverwendet. Verifikation manuell: Consent akzeptieren löst Tracking aus, Consent ablehnen verhindert es, Admin-Seite zeigt Zahlen korrekt an.

## Nicht im Scope

- Keine Änderung der Datenschutzerklärung-Texte selbst (nur als Folge-Empfehlung notiert).
- Kein Reject-dann-später-wieder-fragen-Mechanismus (einmal "Ablehnen" bleibt erstmal bestehen, kein erneutes Banner bei jedem Besuch — Standard-Cookie-Banner-Verhalten).
- Keine Diagramme/Zeitverlaufs-Charts im Admin-Panel (nur Zahlen + Liste, wie oben beschrieben) — könnte ein späterer Ausbau sein.
- Keine IP-basierte Geo-Auswertung oder Gerätetyp-Erkennung.
