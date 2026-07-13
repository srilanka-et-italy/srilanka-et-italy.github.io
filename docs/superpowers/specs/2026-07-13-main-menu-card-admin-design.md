# Hauptspeisekarte im Admin-Panel verwalten

## Problem

Die permanente Hauptspeisekarte (Link "Speisekarte öffnen" in `components/menu.html`) ist aktuell hart im Code als statischer Pfad zu einer Datei in `assets/` verlinkt. Jede Aktualisierung erfordert eine Code-Änderung. Das bestehende Admin-Panel verwaltet nur `seasonal_pdfs` (zeitlich begrenzte Angebote im Hero-Karussell) — die permanente Hauptkarte ist davon komplett getrennt.

## Ziel

Die Hauptspeisekarte soll über das bestehende Admin-Panel austauschbar sein, ohne Code-Änderung. Der öffentliche Link muss stabil bleiben (für Google-Verlinkung), auch wenn die zugrunde liegende Datei ausgetauscht wird.

## Architektur

### 1. Firestore

Neues Singleton-Dokument: `main_menu/current`

```
{
  pdfUrl: string,
  fileName: string,
  contentType: string,
  updatedAt: Timestamp
}
```

Getrennt von `seasonal_pdfs`, da es konzeptionell abweicht: genau eine aktive Datei, kein Zeitraum, keine Reihenfolge.

### 2. Storage

Datei liegt unter `main-menu/<uuid>.<ext>` (pdf/png/jpg, gleiche Regeln wie Seasonal: max. 2 MB).

Beim Ersetzen wird die alte Datei aus Storage gelöscht (keine Versionshistorie, siehe Entscheidung unten).

### 3. Stabiler öffentlicher Link `/menu-card`

Neue Cloud Function `menuCard` (in `functions/`):
- Liest `main_menu/current` aus Firestore.
- Antwortet mit **302-Redirect** auf das aktuelle `pdfUrl`.
- Falls kein Dokument/keine URL vorhanden: 404.

`firebase.json` Hosting-Rewrite ergänzen:
```json
{ "source": "/menu-card", "function": "menuCard" }
```
(vor dem bestehenden Catch-all `"**" -> "/index.html"` einfügen, da Rewrite-Reihenfolge zählt)

### 4. Admin-Panel UI

Neuer Abschnitt "Hauptspeisekarte" in `components/admin-panel.html`, oberhalb des bestehenden Seasonal-Bereichs:
- Zeigt aktuelle Datei: Thumbnail (PDF-Vorschau via pdf.js, wie bei Seasonal), Dateiname, letztes Update-Datum.
- Ein "Ersetzen"-Button/Datei-Upload (kein Titel-, Zeitraum- oder Reihenfolge-Feld nötig).
- Gleiche Validierung/Fehlermeldungen wie Seasonal-Upload (Dateityp, Größe).

### 3b. Abuse-/Kostenschutz für `/menu-card`

`/menu-card` ist ein öffentlicher, unauthentifizierter Endpunkt und liest bei jedem Aufruf Firestore — ohne Schutz treibt Bot-/Scraper-Traffic unnötig Function-Invocations und Firestore-Reads hoch. Zwei Maßnahmen, kombiniert:

**a) CDN-Caching (erste Verteidigungslinie)**
Die Function setzt auf die Redirect-Antwort `Cache-Control: public, max-age=120`. Firebase Hosting/CDN liefert wiederholte Anfragen innerhalb von 2 Minuten direkt aus dem Cache aus, ohne die Function erneut aufzurufen. Deckt die meisten Missbrauchsfälle bereits ab.
Trade-off: nach einem PDF-Wechsel kann `/menu-card` bis zu 2 Minuten noch auf die alte (ggf. bereits gelöschte) Datei zeigen. Akzeptiert, da Austausch kein Alltagsvorgang ist.

**b) IP-basiertes Rate-Limiting (zusätzliche Absicherung)**
Zusätzlich ein einfacher Zähler in Firestore, Collection `rate_limits`, Dokument-ID = gehashte Client-IP:
```
{ count: number, windowStart: Timestamp }
```
- Zeitfenster: 60 Sekunden, Limit: 60 Anfragen/Fenster (großzügig für normalen Traffic, reicht aber um automatisierte Missbrauchs-Spitzen zu bremsen).
- Bei Anfrage: Fenster abgelaufen → Zähler zurücksetzen; sonst hochzählen. Überschreitung → HTTP 429.
- IP wird gehasht (nicht im Klartext gespeichert) aus Datenschutzgründen.
- Da Caching (a) die meisten wiederholten Anfragen ohnehin abfängt, verursacht (b) in der Praxis kaum zusätzliche Firestore-Kosten — greift nur, wenn Cache umgangen wird (z. B. `Cache-Control` ignorierender Client).

### 4b. Firestore- und Storage-Regeln

Beide Regeldateien erlauben aktuell nur `seasonal_pdfs` bzw. `seasonal-pdfs/*`; alles andere ist implizit verboten. Für `main_menu` müssen eigene Regeln ergänzt werden, sonst schlägt der Admin-Upload mit "permission denied" fehl (die Cloud Function selbst ist davon nicht betroffen, da sie über das Admin-SDK mit vollen Rechten liest).

**`firestore.rules`** — neue Regel analog zu `seasonal_pdfs`, aber ohne Public-Read (die Cloud Function liest serverseitig, der Client braucht kein direktes Read):
```
match /main_menu/{doc} {
  allow read: if isAdmin();
  allow create, update, delete: if isAdmin();
}
```

**`firestore.rules`** — zusätzlich `rate_limits` sperren (nur die Cloud Function schreibt/liest über das Admin-SDK, das ignoriert Security Rules ohnehin — die Regel verhindert nur direkten Client-Zugriff):
```
match /rate_limits/{ip} {
  allow read, write: if false;
}
```

**`storage.rules`** — neue Regel analog zu `seasonal-pdfs/{fileName}`, gleiche Größen-/Typ-Beschränkung:
```
match /main-menu/{fileName} {
  allow read: if request.auth != null;
  allow write: if request.auth != null &&
                  request.resource.size < 2 * 1024 * 1024 &&
                  request.resource.contentType in ['application/pdf', 'image/png', 'image/jpeg'];
  allow delete: if request.auth != null;
}
```

### 5. Öffentliche Seite

`components/menu.html` (und `preview/components/menu.html`, `preview/index.html` JSON-LD `hasMenu`) verlinken künftig auf `/menu-card` statt auf einen fest verdrahteten `assets/...pdf`-Pfad.

## Ablauf beim Ersetzen

1. Admin wählt neue Datei im Admin-Panel.
2. Upload nach `main-menu/<neue-uuid>.<ext>` in Storage.
3. `getDownloadURL` abrufen.
4. Firestore-Dokument `main_menu/current` aktualisieren (`pdfUrl`, `fileName`, `contentType`, `updatedAt`).
5. Alte Datei aus Storage löschen (basierend auf vorherigem `fileName` im Dokument, vor dem Update ausgelesen).
6. Audit-Log-Eintrag schreiben (bestehende `writeAuditLog`-Funktion wiederverwenden, Action `main_menu_replace`).

## Fehlerbehandlung

- Gleiche Regeln wie Seasonal-Upload: erlaubte Typen `application/pdf`, `image/png`, `image/jpeg`; max. 2 MB.
- Wenn Storage-Upload fehlschlägt: Firestore-Dokument nicht aktualisieren (alter Zustand bleibt aktiv), Fehlermeldung anzeigen.
- Wenn Löschen der alten Datei fehlschlägt (z. B. `storage/object-not-found`): das ist kein harter Fehler, still ignorieren (alte Datei existiert eh nicht mehr).
- `/menu-card` Cloud Function: wenn kein Dokument vorhanden oder `pdfUrl` fehlt → HTTP 404 mit einfacher Textantwort.
- `/menu-card` Cloud Function: bei Überschreiten des Rate-Limits → HTTP 429 mit einfacher Textantwort.

## Nicht im Scope

- Mehrsprachige Titel für die Hauptkarte.
- Anzeige der Hauptkarte im Hero-Karussell.
- Versionshistorie / Rückgängig-Funktion (alte Datei wird beim Ersetzen endgültig gelöscht).
- Zeitraum- oder Reihenfolge-Steuerung für die Hauptkarte.

## Betroffene Dateien (bekannt, Details folgen im Implementierungsplan)

- `functions/index.js`, neue Datei `functions/menuCard.js`
- `firebase.json` (Hosting-Rewrite)
- `js/admin.js` (neue Upload-/Replace-Logik, Firestore/Storage-Zugriff auf `main_menu`)
- `components/admin-panel.html` (neuer UI-Abschnitt)
- `css/admin.css` (Styling für neuen Abschnitt, ggf. Wiederverwendung bestehender Klassen)
- `components/menu.html`, `preview/components/menu.html`, `preview/index.html` (Link auf `/menu-card`)
- `firestore.rules`, `storage.rules` (Zugriffsregeln für `main_menu`-Dokument/Pfad ergänzen)
