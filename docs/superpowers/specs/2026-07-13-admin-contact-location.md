# Admin: Kontakt & Standort verwalten

## Problem

Kontaktdaten (E-Mail, zwei Telefonnummern), Öffnungszeiten und Adresse sind aktuell hart im Code verteilt: `components/location.html` und die drei i18n-Dateien (`i18n/de.json`, `i18n/en.json`, `i18n/ta.json`, jeweils im `location`-Objekt). Öffnungszeiten ändern sich am häufigsten (Feiertage, Saison) und erfordern aktuell eine Code-Änderung in drei Sprachdateien gleichzeitig.

## Ziel

Eine neue Admin-Kachel "Kontakt & Öffnungszeiten" (Kategorie "Kontakt & Standort" im Launcher), über die E-Mail, Telefonnummern, Öffnungszeiten (DE/EN/TA) und Adresse (DE/EN/TA) bearbeitet werden können. Die öffentliche Seite zeigt die admin-gepflegten Werte, sobald vorhanden — vorher bleibt der bisherige statische Text unverändert sichtbar (kein Bruch beim ersten Deploy).

## Architektur

### 1. Firestore

Neues Singleton-Dokument `site_content/contact`:
```
{
  email: string,
  phone1: string,
  phone2: string,
  hours: { de: string, en: string, ta: string },
  address: { de: string, en: string, ta: string },
  updatedAt: Timestamp
}
```
`hours`/`address` bleiben pro Sprache getrennt (bestehende i18n-Struktur zeigt, dass sich die Texte zwischen Sprachen leicht unterscheiden, z. B. "Im Schützenverein" vs. "At the Shooting Club" vs. Tamil). `email`/`phone1`/`phone2` sind sprachunabhängig. Freitextfelder erlauben `<br>` wie im bestehenden i18n-Text (kein Rich-Text-Editor, reines Textfeld mit Zeilenumbrüchen als `<br>` wie bisher).

### 2. Admin-Seite `admin-contact.html` + `js/admin-contact.js`

- Login-Gate wie die bestehenden drei Admin-Seiten (`initAuthGate` aus `js/admin-shared.js`).
- E-Mail- und Telefon-Felder (einfache Texteingaben, keine Mehrsprachigkeit).
- Öffnungszeiten + Adresse: Sprach-Reiter (DE/EN/TA), wiederverwendet das bestehende, aktuell ungenutzte CSS `.admin-lang-tabs`/`.admin-title-pane` aus `css/admin.css` (war für genau diesen Zweck vorbereitet, aber nie verdrahtet).
- Beim Laden: aktuelle Werte aus `site_content/contact` vorbefüllen (falls vorhanden), sonst leere Felder.
- Speichern-Button schreibt das komplette Dokument per `setDoc` (kein partielles Update nötig, da ein Formular alle Felder zeigt).
- Audit-Log-Eintrag wie bei bestehenden Speichervorgängen (`writeAuditLog('contact_update', 'contact', '')`).

### 3. Öffentliche Seite

`js/main.js` bekommt eine kleine Erweiterung: nach dem Laden der Komponenten wird `site_content/contact` per Firestore gelesen (öffentlicher, unauthentifizierter Read). Falls das Dokument existiert, werden die entsprechenden DOM-Elemente in `#location` (Öffnungszeiten-Text, Adress-Text, E-Mail-/Telefon-Links) für die **aktuell aktive Sprache** überschrieben — sowohl beim initialen Laden als auch beim Sprachwechsel (`i18n.setLanguage`). Existiert das Dokument nicht (noch nie gespeichert), bleibt der bestehende statische i18n-Text unverändert.

Betroffene DOM-Stellen in `components/location.html`: die beiden `<p data-i18n="location.hours_desc">`/`address_desc">`-Elemente, die drei Kontakt-Links (`mailto:`, zwei `tel:`), sowie die Karten-Platzhalter-Adresse (gleicher `address_desc`-Key, zweite Verwendungsstelle).

### 4. Firestore-Regeln

Neue Regel für `site_content/{doc}`:
```
match /site_content/{doc} {
  allow read: if true;
  allow create, update, delete: if isAdmin();
}
```
Öffentlicher Read ist nötig, da die Startseite ohne Login lädt.

### 5. Launcher

Neue Kategorie "Kontakt & Standort" (`admin.launcher_category_contact`, neuer i18n-Key) unterhalb der bestehenden "Speisekarten"-Kategorie, mit einer Kachel "Kontakt & Öffnungszeiten" (neuer i18n-Key `admin.contact_title`), die zu `admin-contact.html` verlinkt.

## Fehlerbehandlung

- Keine Validierung über "ist ausgefüllt" hinaus nötig — leere Felder sind erlaubt (z. B. nur eine Telefonnummer eingetragen), rendern dann einfach nichts an der jeweiligen Stelle auf der öffentlichen Seite.
- Firestore-Lesefehler auf der öffentlichen Seite (z. B. Regel-Problem) werden abgefangen und führen zum Fallback auf den statischen Text — kein sichtbarer Fehler für Website-Besucher.

## Tests

Kein Test-Framework für dieses Frontend, wie im restlichen Projekt. Verifikation manuell: Admin speichert Kontaktdaten, öffentliche Seite zeigt die neuen Werte in allen drei Sprachen beim Sprachwechsel, Dokument-Löschung/leerer Zustand fällt korrekt auf statischen Text zurück.

## Nicht im Scope

- Keine Bearbeitung von Nav-Struktur, Hero-Text oder anderen Website-Inhalten (spätere, separate Kacheln laut Gesamtplan).
- Kein Rich-Text-Editor — reines Textfeld mit `<br>`-Konvention wie bisher.
- Keine dynamische Liste für beliebig viele Telefonnummern — exakt zwei feste Felder wie auf der aktuellen Seite.
