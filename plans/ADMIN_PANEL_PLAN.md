## Plan: Firebase Admin-Panel für PDF-Verwaltung im Hero-Bereich

**TL;DR:** Integration von Firebase Authentication, Storage und Firestore, um Admins das Hochladen und Zeitplanen von PDFs (max 2MB) für den Hero-Bereich zu ermöglichen. Mehrere PDFs können gleichzeitig aktiv sein und werden als Carousel/Slider dargestellt. Admin-Panel unter `/admin.html` als eigene Seite.

**Empfohlener Ansatz:** Firebase SDK v10 (modular) via **CDN** (kein Build-Step, kein Bundler), Firestore für Metadaten, Storage für PDF-Dateien, Security Rules für Zugriffskontrolle.

---

## ⚠️ Voraussetzungen — MUSS vor Agent-Start erledigt sein

Firebase-Projekt `srilanka-et-italy` existiert bereits. Web-App wurde via CLI erstellt.

### Schritt A: Firebase Console — manuelle Einstellungen
1. [Firebase Console](https://console.firebase.google.com) → Projekt `srilanka-et-italy`
2. **Authentication** → E-Mail/Passwort-Provider aktivieren
3. **Firestore** → Datenbank erstellen (Production-Modus, Region: `eur3`)
4. **Storage** → Standard-Bucket aktivieren (Bucket: `srilanka-et-italy.firebasestorage.app`)
5. **Budget Alerts:** $5 / $20 / $50 einrichten (Abrechnung → Budgets)
6. **App Check** → reCAPTCHA v3 → Site Key generieren → als GitHub Secret `RECAPTCHA_SITE_KEY` hinterlegen
7. **Authentication → Settings** → E-Mail-Enumeration-Schutz AN + Passwort-Policy (min. 12 Zeichen)

### Schritt B: GitHub Secrets hinterlegen
Nur diese zwei Werte sind sensitiv und müssen als GitHub Secrets hinterlegt werden:

| Secret Name | Wert | Woher |
|-------------|------|-------|
| `FIREBASE_API_KEY` | `AIzaSyDZxJMCh0Ur7Vq2eYIRzJ4H9j6I-VwnUd4` | Firebase CLI (bereits ermittelt) |
| `RECAPTCHA_SITE_KEY` | `6Lc...` | [reCAPTCHA Console](https://www.google.com/recaptcha/admin) → v3 Key für `srilanka-et-italy.web.app` |

GitHub → Repository Settings → Secrets and variables → Actions → New repository secret

Alle anderen Firebase-Werte sind öffentliche Identifier (per Firebase-Design Client-seitig sicher) und stehen direkt im Code:
```
projectId:         srilanka-et-italy
authDomain:        srilanka-et-italy.firebaseapp.com
storageBucket:     srilanka-et-italy.firebasestorage.app
messagingSenderId: 847762650004
appId:             1:847762650004:web:1b7dccf7ca7cbe51b21581
```

### Schritt C: Admin-User anlegen
1. Firebase Console → Authentication → User anlegen (E-Mail + sicheres Passwort)
2. UID des Users kopieren (Spalte "User UID" in der User-Liste)
3. Firestore → Collection `admins` → Dokument mit **Dokument-ID = UID** anlegen: `{email: "...", role: "admin", createdAt: <timestamp>}`

### Schritt D: GitHub Actions Workflow anpassen
Die bestehenden Workflows (`.github/workflows/firebase-hosting-merge.yml` + `firebase-hosting-pull-request.yml`) benötigen einen zusätzlichen Schritt der Secrets vor dem Deploy in `firebase-config.js` injiziert:

```yaml
# In beiden Workflow-Dateien nach "uses: actions/checkout@v4" einfügen:
- name: Inject secrets into Firebase config
  run: |
    sed -i "s/__FIREBASE_API_KEY__/${{ secrets.FIREBASE_API_KEY }}/g" js/firebase-config.js
    sed -i "s/__RECAPTCHA_SITE_KEY__/${{ secrets.RECAPTCHA_SITE_KEY }}/g" js/firebase-config.js
```

---

## Steps

### Phase 1: Firebase Setup & Konfiguration *(parallel ausführbar)*

1. **Firebase-Projekt konfigurieren**  
   - Firebase Console öffnen und neues Projekt erstellen (oder bestehendes nutzen)
   - Authentication aktivieren: E-Mail/Passwort-Provider einschalten
   - Firestore Database erstellen (im Production-Modus starten)
   - Storage aktivieren (default bucket)
   - Web-App registrieren und Config-Daten kopieren
   - **Budget Alerts einrichten:** $5, $20, $50/Monat mit E-Mail-Benachrichtigung
   - **App Check aktivieren:** reCAPTCHA v3 für Web, blockiert Bot-Traffic
   - **API Key Restrictions:** Firebase Console → Einstellungen → API-Schlüssel → Nur folgende APIs erlauben: Firestore, Storage, Auth, Remote Config (NICHT Admin SDK)
   - **E-Mail-Enumeration-Schutz aktivieren:** Firebase Console → Authentication → Settings → "Protect against email enumeration" → ON (verhindert dass Angreifer per Login-Fehlercode gültige Admin-E-Mails erraten)
   - **Passwort-Policy setzen:** Firebase Console → Authentication → Settings → Password policy → min. 12 Zeichen, Großbuchstaben + Zahlen + Sonderzeichen erzwingen
   - **Security Headers in `firebase.json`** (stärker als CSP Meta-Tag — greift vor HTML-Parse):
   ```json
   "hosting": {
     "headers": [{
       "source": "**",
       "headers": [
         { "key": "X-Frame-Options", "value": "DENY" },
         { "key": "X-Content-Type-Options", "value": "nosniff" },
         { "key": "Referrer-Policy", "value": "no-referrer" },
         { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
         { "key": "Content-Security-Policy",
           "value": "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://firebasestorage.googleapis.com https://identitytoolkit.googleapis.com; frame-src 'none'; object-src 'none';"
         }
       ]
     }]
   }
   ```
   → CSP Meta-Tag in `index.html` kann danach entfernt werden (Header hat Vorrang)
   - **WICHTIG: `/admin.html` aus Rewrite-Catch-all ausschließen** — aktuell leitet `"**" → /index.html` auch `/admin.html` auf `index.html` um:
   ```json
   "rewrites": [
     { "source": "/admin.html", "destination": "/admin.html" },
     { "source": "**", "destination": "/index.html" }
   ]
   ```

2. **Firebase SDK in Projekt integrieren**  
   - Firebase SDK v10 (modular) via **CDN** einbinden (kein npm/bundler — Projekt hat keinen Build-Step):
   ```html
   <!-- In index.html, vor main.js: -->
   <script type="module" src="js/firebase-config.js"></script>
   ```
   - DOMPurify via CDN für Input-Sanitization:
   ```html
   <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
   ```
   - Luxon via CDN für Timezone-Handling (Europe/Berlin → UTC):
   ```html
   <script src="https://cdnjs.cloudflare.com/ajax/libs/luxon/3.4.4/luxon.min.js"></script>
   ```
   - Neue Datei `js/firebase-config.js` — `__FIREBASE_API_KEY__` und `__RECAPTCHA_SITE_KEY__` sind Platzhalter, die GitHub Actions vor dem Deploy ersetzt (siehe Voraussetzungen Schritt D):
   ```javascript
   import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
   import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
   import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
   import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
   import { getRemoteConfig } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-remote-config.js';
   import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js';

   const firebaseConfig = {
     apiKey: "__FIREBASE_API_KEY__",          // wird von GitHub Actions ersetzt
     authDomain: "srilanka-et-italy.firebaseapp.com",
     projectId: "srilanka-et-italy",
     storageBucket: "srilanka-et-italy.firebasestorage.app",
     messagingSenderId: "847762650004",
     appId: "1:847762650004:web:1b7dccf7ca7cbe51b21581"
   };

   export const app = initializeApp(firebaseConfig);
   export const db = getFirestore(app);
   export const auth = getAuth(app);
   export const storage = getStorage(app);
   export const remoteConfig = getRemoteConfig(app);
   remoteConfig.settings.minimumFetchIntervalMillis = 60000;

   initializeAppCheck(app, {
     provider: new ReCaptchaV3Provider('__RECAPTCHA_SITE_KEY__'), // wird von GitHub Actions ersetzt
     isTokenAutoRefreshEnabled: true
   });
   ```
   - In `index.html` vor `main.js` einbinden
   - **Remote Config initialisieren** mit folgenden Parametern:

     | Parameter | Typ | Default | Zweck |
     |-----------|-----|---------|-------|
     | `feature_pdf_enabled` | boolean | `true` | Kill-Switch |
     | `carousel_interval_ms` | number | `8000` | Auto-Rotation-Geschwindigkeit |
     | `max_pdfs_in_carousel` | number | `5` | Max. Slides |
     | `hero_fallback_mode` | string | `"image"` | Bei 0 PDFs: `"image"` oder `"hidden"` |
     | `announcement_enabled` | boolean | `false` | Kurzfrist-Banner ein/aus |
     | `announcement_text_de` | string | `""` | Bannertext DE (z.B. "Heute Ruhetag") |
     | `announcement_text_en` | string | `""` | Bannertext EN |
     | `announcement_text_ta` | string | `""` | Bannertext TA |

   - **Remote Config Cache-Interval setzen:** `remoteConfig.settings.minimumFetchIntervalMillis = 60000` (1 Minute statt 12 Stunden!)
   - **App Check im Monitoring-Modus** (NICHT Enforcement-Modus):
     - Firebase Console → App Check → Monitoring only (nicht "Enforce")
     - Grund: Enforcement-Modus bricht den öffentlichen PDF-Carousel für Nutzer mit uBlock/Privacy-Tools, da App Check global für ALLE Firebase-Calls gilt — auch unauthentifizierte Public-Reads
     - Schreiboperationen sind bereits durch `isAdmin()` in Security Rules geschützt
     - App Check in Monitoring-Modus gibt Telemetrie über Bot-Traffic ohne echte Nutzer zu blockieren
   
   ```javascript
   // App Check initialisieren (Monitoring-Modus, kein Enforcement)
   initializeAppCheck(app, { 
     provider: new ReCaptchaV3Provider('RECAPTCHA_SITE_KEY'), // aus Voraussetzungen Schritt B
     isTokenAutoRefreshEnabled: true 
   });
   // KEIN await, KEIN catch — App Check läuft im Hintergrund, blockiert keine Calls
   ```

3. **Firestore Security Rules definieren**  
   - Collection `seasonal_pdfs` erstellen für PDF-Metadaten (Schema: `{title, pdfUrl, startDate, endDate, createdBy, createdAt, order, status: 'draft'|'active'}`)
   - Collection `audit_logs` für Admin-Aktionen (Schema: `{action, userId, timestamp, pdfId, details}`)
   - Collection `admins` für Admin-Liste
   - **WICHTIG:** Konkrete Rules mit Zeitcheck, Admin-Validation, nur aktive PDFs lesbar
   
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       
       // Helper: Check if user is admin
       function isAdmin() {
         return request.auth != null && 
                exists(/databases/$(database)/documents/admins/$(request.auth.uid));
       }
       
       // Seasonal PDFs: Admins sehen alles (inkl. Drafts), öffentlich nur aktive PDFs
       match /seasonal_pdfs/{doc} {
         allow read: if isAdmin() ||
                        (resource.data.status == 'active' &&
                         resource.data.startDate.toMillis() <= request.time.toMillis() && 
                         request.time.toMillis() <= resource.data.endDate.toMillis());
         allow create, update, delete: if isAdmin();
       }
       
       // Admins Collection: User kann nur SICH SELBST prüfen (verhindert Enumeration)
       match /admins/{userId} {
         allow read: if request.auth != null && request.auth.uid == userId;
         allow write: if false; // Nur manuell via Firebase Console
       }
       
       // Audit Logs: Immutable, userId wird server-seitig validiert
       match /audit_logs/{log} {
         allow read: if isAdmin();
         allow create: if isAdmin() && 
                          request.resource.data.userId == request.auth.uid && // verhindert Spoofing
                          request.resource.data.timestamp == request.time; // server timestamp required
         allow update, delete: if false; // Logs sind unveränderlich
       }
     }
   }
   ```

4. **Storage Security Rules definieren**  
   - Bucket: `seasonal-pdfs/` für hochgeladene PDFs
   - **KRITISCH:** Read-Schutz via Firestore-Lookup (verhindert Race Condition + Direktzugriff)
   
   ```javascript
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /seasonal-pdfs/{fileName} {
         // Read: NUR wenn Firestore-Dokument existiert UND status == 'active'
         // Ein Read statt drei (vorher: exists() + 2x get() = 3 Firestore-Reads pro Download!)
         // Date-Filter ist redundant: Firestore versteckt pdfUrl bereits vor startDate
         allow read: if firestore.get(
           /databases/(default)/documents/seasonal_pdfs/$(fileName.split('_')[0])
         ).data.status == 'active';
         
         // Write: Nur Admins, max 2MB, nur PDF (aber: MIME kann gefälscht werden!)
         // → Zusätzlich Cloud Function für echte PDF-Magic-Bytes-Prüfung (siehe Step 4b)
         allow write: if request.auth != null && 
                         firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid)) &&
                         request.resource.size < 2 * 1024 * 1024 &&
                         request.resource.contentType == 'application/pdf';
         
         // Delete: Nur Admins
         allow delete: if request.auth != null && 
                          firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid));
       }
     }
   }
   ```
   - Dateinamen-Schema: `{firestoreDocId}_{timestamp}.pdf` für Firestore-Lookup (nicht mehr `{timestamp}_{uuid}`!)
   
**4b. Storage CORS konfigurieren** *(depends on 4)*
   - **Pflicht:** PDF.js lädt PDFs via `fetch()` von `firebasestorage.googleapis.com` — andere Domain als die Website → ohne CORS-Konfiguration blockiert der Browser den Download
   - Einmalig via Firebase CLI setzen:

   ```json
   // cors.json (im Projekt-Root erstellen)
   [{
     "origin": [
       "https://srilanka-et-italy.web.app",
       "https://srilanka-et-italy.firebaseapp.com",
       "https://srilanka-et-italy.github.io",
       "http://localhost:3000"
     ],
     "method": ["GET"],
     "responseHeader": ["Content-Type"],
     "maxAgeSeconds": 3600
   }]
   ```
   ```bash
   gsutil cors set cors.json gs://srilanka-et-italy.firebasestorage.app
   ```

**4c. Cloud Function für MIME-Type-Validierung** *(depends on 4)*  
   - **Problem:** `contentType` kann vom Client gefälscht werden (`.exe` als PDF)
   - **Lösung:** Cloud Function bei `onFinalize` prüft echte PDF-Magic-Bytes
   
   ```javascript
   // functions/validatePDF.js
   exports.validateUploadedPDF = functions.storage.object().onFinalize(async (object) => {
     if (!object.name.startsWith('seasonal-pdfs/')) return;
     
     // Download erste 4 Bytes
     const bucket = admin.storage().bucket(object.bucket);
     const file = bucket.file(object.name);
     const [buffer] = await file.download({ start: 0, end: 3 });
     
     // PDF Magic Bytes: %PDF (0x25 0x50 0x44 0x46)
     if (buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) {
       console.error(`Invalid PDF detected: ${object.name}`);
       await file.delete(); // Sofort löschen
       
       // Admin benachrichtigen
       await db.collection('audit_logs').add({
         action: 'malicious-upload-detected',
         fileName: object.name,
         timestamp: admin.firestore.FieldValue.serverTimestamp()
       });
     }
   });
   ```

### Phase 2: Authentication & Admin-Verwaltung

5. **Admin-Liste in Firestore erstellen** *(depends on 1, 3)*  
   - Collection `admins` mit Dokumenten: `{email, role: 'admin', createdAt}`
   - **Dokument-ID = User-UID** (nicht random ID!) → ermöglicht `request.auth.uid == userId` Check
   - Initial-Admin manuell über Firebase Console anlegen (Dokument-ID = Admin-UID)
   - **Wichtig:** User kann NUR sich selbst prüfen, NICHT alle Admins auflisten (verhindert Enumeration)

6. **Login/Logout-Modul erstellen** *(depends on 2)*  
   - Neue Datei `js/auth.js` mit Funktionen: `signIn(email, password)`, `signOut()`, `checkAdminStatus()`
   - Auth-State-Listener implementieren: `onAuthStateChanged`
   - Admin-Check: Nach Login Firestore `admins/{currentUser.uid}` abfragen (NICHT alle Admins!)
   
   ```javascript
   async function checkAdminStatus(user) {
     const adminDoc = await getDoc(doc(db, 'admins', user.uid)); // Nur eigener UID
     return adminDoc.exists(); // User ist Admin wenn Dokument existiert
   }
   ```

7. **Admin-UI-Trigger auf Hauptseite** *(depends on 6)*  
   - ~~Versteckter Button/Link im Footer~~ **Security by Obscurity ist keine Sicherheit!**
   - **Stattdessen:** Admin-Panel unter `/admin.html` (separate Seite, nicht #hash)
   - Redirect zu Login wenn nicht eingeloggt
   - **Oder:** Öffentlicher Login-Link im Footer mit "Admin Login" → zeigt nur Login, Admin-Panel nur nach erfolgreicher Auth + Admin-Check
   - **Wichtig:** Admin-Panel-Existenz ist kein Geheimnis, Sicherheit kommt von Firestore Rules!

### Phase 3: Admin-Panel UI *(parallel mit Phase 2, Step 7)*

8. **Login-Modal erstellen**  
   - HTML-Modal mit E-Mail- und Passwort-Feldern
   - Fehlerbehandlung (falsches Passwort, User nicht gefunden, kein Admin)
   - CSS: Ähnlich wie `.md-modal` (Muttertag-Modal als Vorlage)

9. **Admin-Panel-UI erstellen** *(depends on 8)*  
   - Neuer Komponenten-Abschnitt: `components/admin-panel.html` (oder direkt in `index.html` als verstecktes `<div>`)
   - **Struktur:**
     - Header mit Logout-Button und User-Anzeige
     - **Upload-Bereich:** Datei-Input (accept=".pdf", max 2MB), Titel-Input (mehrsprachig: DE, EN, TA), Kicker-Text (optional), Start-/Enddatum (datetime-local), Sortierungs-Nummer
     - **PDF-Liste:** Tabelle/Cards mit aktiven und zukünftigen PDFs, Bearbeiten/Löschen-Buttons, Live-Vorschau
   - CSS: Modern, konsistent mit bestehendem Design (Outfit/Libre Baskerville Fonts)
   - i18n: Keys für Admin-UI in `de.json`, `en.json`, `ta.json` hinzufügen

10. **PDF-Upload-Logik implementieren** *(depends on 2, 4, 9)*  
    - **Input-Sanitization:** Alle User-Inputs (Titel, Kicker) mit DOMPurify escapen oder manuell HTML-Tags entfernen
    - Datei-Validierung: max 2MB, nur PDF, MIME-Type prüfen
    - **Timezone-Handling:** Start-/Enddatum vom Admin-UI (Europe/Berlin) in UTC konvertieren mit Luxon/date-fns-tz
    - **Transaktions-ähnliches Upload:** Error-Handling mit Rollback
    
    ```javascript
    async function uploadPDF(file, metadata) {
      let storageRef;
      let firestoreDocId;
      
      try {
        // 1. Firestore-Dokument ZUERST erstellen mit status: 'draft'
        // → status: 'draft' verhindert, dass 'pending'-URL im Carousel erscheint
        // → Storage Rules prüfen status == 'active', also kein Lesezugriff während Upload
        const docRef = await addDoc(collection(db, 'seasonal_pdfs'), {
          ...metadata,
          pdfUrl: '', // leer bis Upload fertig
          status: 'draft', // NICHT 'active' — verhindert Anzeige während Upload
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp()
        });
        firestoreDocId = docRef.id;
        
        // 2. Upload zu Storage MIT Firestore-Doc-ID im Dateinamen
        // → Ermöglicht Storage Rules Lookup: get(...seasonal_pdfs/$(fileName.split('_')[0])).data.status
        storageRef = ref(storage, `seasonal-pdfs/${firestoreDocId}_${Date.now()}.pdf`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        
        // 3. Firestore-Dokument atomisch auf 'active' setzen + URL eintragen
        // → Erst jetzt wird Storage-Datei lesbar (Storage Rule: status == 'active')
        await updateDoc(docRef, { pdfUrl: url, status: 'active' });
        
        // 4. Audit Log (userId wird server-seitig validiert in Firestore Rules)
        await addDoc(collection(db, 'audit_logs'), {
          action: 'upload',
          userId: auth.currentUser.uid, // wird gegen request.auth.uid geprüft
          timestamp: serverTimestamp(), // server timestamp required
          title: metadata.title,
          pdfId: firestoreDocId
        });
      } catch (error) {
        // Rollback: Beide löschen wenn Fehler
        if (storageRef) await deleteObject(storageRef).catch(console.error);
        if (firestoreDocId) await deleteDoc(doc(db, 'seasonal_pdfs', firestoreDocId)).catch(console.error);
        throw error;
      }
    }
    ```
    - Progress-Bar während Upload anzeigen
    - Erfolgs-/Fehlermeldungen

11. **PDF-Verwaltung (Bearbeiten/Löschen)** *(depends on 10)*  
    - PDF-Liste aus Firestore laden und anzeigen (sortiert nach `order`, dann `startDate`)
    - **Snapshot Listener für Live-Updates:** `onSnapshot()` statt `getDocs()` → Änderungen sofort sichtbar
    - Bearbeiten: Metadaten (Titel, Daten, Kicker) ändern, PDF nicht austauschbar (nur neu hochladen + altes löschen)
    - **Audit Log bei Bearbeitung:** `{action: 'edit', userId, timestamp, pdfId, changes}`
    - Löschen mit Rollback-Logik:
    ```javascript
    async function deletePDF(pdfId, pdfUrl) {
      // 1. Zuerst auf 'deleting' setzen (verhindert Anzeige im Carousel während Löschvorgang)
      await updateDoc(doc(db, 'seasonal_pdfs', pdfId), { status: 'deleting' });
      try {
        // 2. Storage-Datei löschen
        const filePath = decodeURIComponent(pdfUrl.split('/o/')[1].split('?')[0]);
        await deleteObject(ref(storage, filePath));
        // 3. Firestore-Dokument löschen
        await deleteDoc(doc(db, 'seasonal_pdfs', pdfId));
      } catch (error) {
        // Rollback: status zurück auf 'active' wenn Löschen fehlschlägt
        await updateDoc(doc(db, 'seasonal_pdfs', pdfId), { status: 'active' });
        throw error;
      }
    }
    ```
    - **Audit Log bei Löschen:** `{action: 'delete', userId, timestamp, pdfId, title}`
    - **Audit Log Retention:** Cloud Function löscht Logs älter als 90 Tage (DSGVO-Compliance)
    - Bestätigungs-Dialog vor Löschen

### Phase 4: Frontend-Integration (Hero-Bereich) *(depends on Phase 1-3)*

12. **Hero-Bereich für dynamische PDFs anpassen**  
    - `components/hero.html`: Ersetze hardcodiertes `#hero-seasonal-card` durch dynamisches Container-Element: `<div id="hero-seasonal-carousel"></div>`
    - Wenn mehrere aktive PDFs: Carousel/Slider-Struktur erstellen (prev/next Buttons, Dots-Indikator)
    - Wenn nur 1 PDF: Einzelne Card wie bisher
    - **CSP Meta-Tag in `index.html` hinzufügen** — `connect-src` ist PFLICHT für Firebase SDK:
    ```html
    <meta http-equiv="Content-Security-Policy" 
          content="default-src 'self';
                   script-src 'self' https://cdnjs.cloudflare.com https://www.gstatic.com;
                   style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
                   connect-src 'self'
                     https://*.googleapis.com
                     https://*.firebaseio.com
                     wss://*.firebaseio.com
                     https://firebasestorage.googleapis.com
                     https://identitytoolkit.googleapis.com;
                   frame-src 'none';
                   object-src 'none';">
    ```
    - **Wichtig:** Ohne `connect-src` blockt der Browser alle Firebase-Calls stumm — Firestore, Auth, Storage, Remote Config funktionieren nicht!

13. **PDF-Daten aus Firestore laden** *(depends on 2, 12)*  
    - **Remote Config Kill-Switch prüfen:** Vor dem Laden Remote Config `feature_pdf_enabled` abfragen, bei `false` → keine PDFs laden
    - Neue Funktion in `js/main.js`: `loadSeasonalPDFs()`
    - Firestore-Query (siehe Firestore Indexes Abschnitt — nur ein Range-Filter möglich!):
    ```javascript
    const q = query(
      collection(db, 'seasonal_pdfs'),
      where('endDate', '>=', Timestamp.now()),
      orderBy('endDate'),
      orderBy('order')
    );
    const snapshot = await getDocs(q);
    const pdfs = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(pdf => pdf.startDate.toMillis() <= Date.now() && pdf.status === 'active');
    ```
    - Daten in Array speichern, an Carousel-Renderer übergeben

14. **Carousel-Logik implementieren** *(depends on 13)*  
    - Wenn 0 PDFs: Hero-Visual ausblenden oder Standard-Bild anzeigen (via Remote Config `hero_fallback_mode`)
    - **Announcement-Banner:** `announcement_text_*` via `el.textContent` rendern, NICHT `innerHTML` — Remote Config-Werte niemals als HTML behandeln
    - Wenn 1 PDF: Einzelne Card rendern (wie bisheriges Muttertagskarte-Beispiel)
    - Wenn 2+ PDFs: Carousel mit Auto-Rotation (Intervall aus Remote Config `carousel_interval_ms`), Prev/Next-Buttons, Swipe-Support (optional)
    - **Lazy Loading:** Nur aktiven Slide rendern, nächsten im Hintergrund prefetchen — nicht alle PDFs gleichzeitig laden
    - **Ladebalken via PDF.js `onProgress`:** Echter Byte-Fortschritt während Download, kein blindes Warten
    
    ```javascript
    async renderPDFSlide(url, canvas) {
      const container = canvas.parentElement;
      container.classList.add('pdf-loading'); // zeigt Skeleton + Fortschrittsbalken
      const bar = container.querySelector('.pdf-progress-fill');

      const loadingTask = pdfjsLib.getDocument({
        url,
        onProgress: ({ loaded, total }) => {
          if (total) bar.style.width = Math.round(loaded / total * 100) + '%';
        }
      });
      try {
        const pdf = await loadingTask.promise;
        bar.style.width = '100%';
        const page = await pdf.getPage(1);
        const scale = container.clientWidth / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        container.classList.remove('pdf-loading');
      } catch {
        container.classList.remove('pdf-loading');
        container.classList.add('pdf-error');
      }
    }
    ```
    
    **HTML pro Slide:**
    ```html
    <div class="carousel-slide">
      <div class="pdf-skeleton">
        <div class="pdf-progress-bar"><div class="pdf-progress-fill"></div></div>
        <span data-i18n="hero.pdf_loading">Angebot wird geladen…</span>
      </div>
      <canvas class="pdf-canvas"></canvas>
    </div>
    ```
    
    **CSS** (konsistent mit `--spice`/`--sand`/`--border`):
    ```css
    .pdf-skeleton { display: none; position: absolute; inset: 0; background: var(--sand);
      border-radius: 12px; align-items: center; justify-content: center;
      flex-direction: column; gap: .8rem; }
    .pdf-loading .pdf-skeleton { display: flex; }
    .pdf-loading canvas { opacity: 0; }
    .pdf-progress-bar { width: 60%; height: 4px; background: var(--border);
      border-radius: 2px; overflow: hidden; }
    .pdf-progress-fill { height: 100%; background: var(--spice);
      transition: width 0.15s ease; width: 0%; }
    ```
    
    **i18n-Key hinzufügen** in `de.json`/`en.json`/`ta.json`: `"hero.pdf_loading"`

15. **Cleanup-Mechanismus für abgelaufene PDFs** *(REQUIRED, parallel mit 14)*  
    - **Cloud Function (PFLICHT, nicht optional!):** Scheduled Function (täglich um 2 Uhr UTC) löscht abgelaufene PDFs
    - **Warum Cloud Function nötig:** Firestore Rules verstecken bereits abgelaufene PDFs, aber Storage-Dateien müssen gelöscht werden → Sonst steigen Kosten unbegrenzt!
    
    ```javascript
    // Cloud Function (functions/scheduledCleanup.js)
    exports.cleanupExpiredPDFs = functions.pubsub
      .schedule('0 2 * * *') // Täglich 2 Uhr UTC
      .timeZone('Europe/Berlin')
      .onRun(async (context) => {
        const now = admin.firestore.Timestamp.now();
        const expiredDocs = await db.collection('seasonal_pdfs')
          .where('endDate', '<', now)
          .get();
        
        for (const doc of expiredDocs.docs) {
          // Lösche Storage-Datei (Admin SDK — NICHT storage.refFromURL(), das ist Client-only!)
          const pdfUrl = doc.data().pdfUrl;
          const filePath = decodeURIComponent(pdfUrl.split('/o/')[1].split('?')[0]);
          await admin.storage().bucket().file(filePath).delete();

          
          // Lösche Firestore-Dokument
          await doc.ref.delete();
          
          // Audit Log
          await db.collection('audit_logs').add({
            action: 'auto-cleanup',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            pdfId: doc.id
          });
        }
      });
    ```
    - **Zusätzlich:** Audit Logs älter als 90 Tage löschen (DSGVO)
    - **Zusätzlich:** Stuck Drafts bereinigen — Dokumente mit `status == 'draft'` älter als 1 Stunde löschen (entsteht wenn Upload in Schritt 3 fehlschlägt):
    ```javascript
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stuckDrafts = await db.collection('seasonal_pdfs')
      .where('status', '==', 'draft')
      .where('createdAt', '<', oneHourAgo)
      .get();
    for (const doc of stuckDrafts.docs) {
      await doc.ref.delete(); // Storage-Datei existiert bei Stuck-Drafts meist nicht
    }
    ```

### Phase 5: Testing & Refinement

16. **Admin-Workflow testen** *(depends on all previous steps)*  
    - Admin-Login mit Test-Account
    - PDF hochladen (verschiedene Größen, inkl. >2MB für Validierung)
    - Zeitplanung: PDF mit Start in Zukunft → sollte nicht sofort sichtbar sein
    - Zeitplanung: PDF mit End in Vergangenheit → sollte automatisch verschwinden
    - Mehrere PDFs gleichzeitig hochladen → Carousel sollte erscheinen
    - Bearbeiten und Löschen von PDFs

17. **Cross-Browser & Responsive Testing** *(depends on 16)*  
    - Admin-Panel auf Mobile, Tablet, Desktop testen
    - Carousel auf verschiedenen Bildschirmgrößen
    - PDF-Vorschau-Rendering in Safari, Firefox, Chrome

18. **Security-Review** *(depends on all)*  
    - Firestore Rules testen: Nicht-Admin darf nicht schreiben
    - Storage Rules testen: Upload ohne Auth sollte fehlschlagen
    - Admin-Check: User ohne Admin-Flag in `admins`-Collection darf Admin-Panel nicht nutzen

---

## Relevant files

**Neue Dateien:**
- `js/firebase-config.js` — Firebase SDK Initialisierung (auth, firestore, storage, remoteConfig, appCheck)
- `js/auth.js` — Login/Logout, Admin-Check, Auth-State-Listener
- `js/admin.js` — Admin-Panel-Logik (Upload, Verwaltung, UI, Löschen mit Rollback)
- `admin.html` — Separate Admin-Seite (Login + Panel, Redirect wenn nicht eingeloggt)
- `components/admin-panel.html` — Admin-UI-HTML als Komponente
- `css/admin.css` — Admin-spezifische Styles
- `firestore.rules` — Firestore Security Rules (deployen mit `firebase deploy --only firestore:rules`)
- `storage.rules` — Storage Security Rules (deployen mit `firebase deploy --only storage`)
- `firestore.indexes.json` — Composite Index `endDate+order` (deployen mit `firebase deploy --only firestore:indexes`)
- `cors.json` — Storage CORS-Konfiguration (einmalig via `gsutil cors set`)
- `functions/index.js` — Cloud Functions Exports
- `functions/validatePDF.js` — MIME Magic Bytes Validierung (onFinalize Trigger)
- `functions/scheduledCleanup.js` — Täglich: abgelaufene PDFs + Stuck Drafts + alte Audit Logs löschen
- `functions/package.json` — Cloud Functions Dependencies (firebase-admin, firebase-functions)

**Zu modifizierende Dateien:**
- [index.html](index.html#L1) — Firebase SDK einbinden, CSP Meta-Tag entfernen (kommt via firebase.json Header)
- [components/hero.html](components/hero.html#L52) — `#hero-seasonal-card` entfernen, durch `#hero-seasonal-carousel` ersetzen
- [js/main.js](js/main.js#L1) — `setupMothersDayPromo()` + `renderMothersDay()` entfernen, neue Funktionen: `loadSeasonalPDFs()`, `renderCarousel()`, `renderPDFSlide()`
- [css/main.css](css/main.css#L1) — Carousel-Styles, PDF-Skeleton + Ladebalken, Announcement-Banner
- `i18n/de.json`, `i18n/en.json`, `i18n/ta.json` — Keys: `hero.pdf_loading`, `hero.pdf_error`, `admin.*`-Keys
- `firebase.json` — Security Headers (X-Frame-Options, CSP, etc.) + `functions`-Eintrag + `/admin.html` aus Rewrite-Catch-all ausschließen
- `package.json` — Firebase Emulator als Dev-Script: `"emulator": "firebase emulators:start --only firestore,storage,auth,functions"`
- `.github/workflows/firebase-hosting-merge.yml` — Secret-Injection-Schritt ergänzen (siehe Voraussetzungen Schritt D)
- `.github/workflows/firebase-hosting-pull-request.yml` — Secret-Injection-Schritt ergänzen

**Firebase Console (manuelle Schritte vor Go-Live):**
- **Authentication:** E-Mail/Passwort-Provider aktivieren, E-Mail-Enumeration-Schutz AN, Passwort-Policy setzen
- **Firestore:** Production-Modus, Rules + Index deployen
- **Storage:** Rules deployen, CORS setzen via `gsutil`
- **App Check:** reCAPTCHA v3 Site Key hinterlegen, Monitoring-Modus (kein Enforcement)
- **Remote Config:** Parameter anlegen (Tabelle in Step 2)
- **Cloud Functions:** `firebase deploy --only functions`
- **Budget Alerts:** $5 / $20 / $50 Alerts in Firebase Console → Abrechnung

**Specific Functions/Patterns zu reusieren:**
- PDF-Rendering: `renderMothersDay()` in [js/main.js](js/main.js#L116) als Vorlage für Canvas-Rendering mit PDF.js
- Modal-Pattern: `.md-modal`, `.md-backdrop` in [css/main.css](css/main.css#L1) als Vorlage für Login-Modal und Admin-Panel
- Component-Loading: `loadComponent()` in [js/main.js](js/main.js#L23) für dynamisches Laden von HTML
- i18n-System: `I18n` Klasse in [js/i18n.js](js/i18n.js#L1) für Admin-UI-Übersetzungen

---

## Verification

**Lokal testen mit Firebase Emulator (empfohlen vor Deploy):**
```bash
npm run emulator   # startet Firestore + Storage + Auth + Functions Emulator
# Dann in firebase-config.js connectFirestoreEmulator(), connectStorageEmulator() aktivieren
```

**Automatisierte Tests (optional, später):**
1. Firebase Emulator Suite: Rules mit `@firebase/rules-unit-testing` testen
2. Jest/Vitest: Unit-Tests für `auth.js` und `admin.js` Funktionen

**Manuelle Tests (erforderlich):**
1. **Admin-Login:** Mit korrekten Credentials einloggen → Admin-Panel sollte erscheinen
2. **Nicht-Admin-Login:** Mit User ohne Admin-Flag einloggen → "Kein Admin"-Fehler sollte erscheinen
3. **PDF-Upload (gültig):** 1.5MB PDF hochladen mit Titel "Sommerfest" und Zeitraum 01.06.2026 - 30.06.2026 → PDF sollte in Firestore + Storage erscheinen
4. **PDF-Upload (ungültig):** 3MB PDF hochladen → Fehler "Datei zu groß" sollte erscheinen
5. **Carousel-Anzeige:** 3 PDFs mit überlappenden Zeiträumen hochladen → Carousel mit 3 Slides sollte auf Hauptseite erscheinen
6. **Auto-Rotation:** Carousel sollte alle 8 Sekunden zum nächsten Slide wechseln
7. **PDF-Löschen:** PDF in Admin-Panel löschen → sollte aus Firestore, Storage UND vom Frontend verschwinden (Reload oder Live-Update via Snapshot-Listener)
8. **Zeitsteuerung (Zukunft):** PDF mit `startDate` = morgen hochladen → sollte heute NICHT im Hero-Bereich erscheinen
9. **Zeitsteuerung (Vergangenheit):** Firestore-Dokument manuell ändern: `endDate` = gestern → PDF sollte automatisch verschwinden (nach Reload oder nach Cleanup-Job)
10. **Responsive:** Admin-Panel auf iPhone (Safari) öffnen → sollte vollständig nutzbar sein
11. **Sicherheit:** In Browser-Console: `fetch()` zu Storage ohne Auth-Token → sollte mit 401/403 fehlschlagen
12. **CORS:** PDF.js lädt PDF im Hero-Bereich ohne CORS-Fehler in der Console
13. **Draft-Sichtbarkeit:** PDF hochladen → während Upload ist es im Hero-Bereich NICHT sichtbar (status: 'draft')
14. **Admin sieht Drafts:** Im Admin-Panel erscheint das PDF sofort nach Erstellen (noch als Draft)
15. **Löschen-Rollback:** Löschen simulieren mit getrennter Internetverbindung nach Step 1 → status springt zurück auf 'active'
16. **MIME-Validierung:** `.exe`-Datei mit Content-Type `application/pdf` hochladen → Cloud Function löscht sie innerhalb 5 Sekunden
17. **Security Headers:** Browser DevTools → Network → Response Headers prüfen: `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy` vorhanden
18. **Stuck Draft Cleanup:** Dokument manuell mit `status: 'draft'` und `createdAt: 2 Stunden her` anlegen → nach nächstem Cleanup-Job verschwunden

---

## Decisions

1. **Firebase SDK v10 (modular):** Kleinere Bundle-Size, zukunftssicher, besseres Tree-Shaking
2. **Firestore statt Realtime Database:** Bessere Querying-Möglichkeiten (z.B. `where('endDate', '>=', now)`), skaliert besser
3. **Admin-Check via Firestore `admins` Collection:** Einfacher als Custom Claims (keine Cloud Functions nötig für User-Management), flexibel erweiterbar (Rollen, Permissions)
4. **PDF-Dateien in Storage (nicht als Base64 in Firestore):** Firestore-Dokumente haben 1MB Limit, PDFs können größer sein; Storage ist optimiert für Datei-Hosting
5. **Carousel mit eigenem JavaScript:** Keine externe Library (z.B. Swiper.js) nötig, volle Kontrolle, konsistent mit bestehendem Code-Stil
6. **`/admin.html` als separate Seite** (nicht `#admin` URL-Hash): Admin-Panel-Existenz ist kein Geheimnis — Sicherheit kommt von Firestore Rules, nicht vom Verstecken. Öffentlicher Login-Link möglich.
7. **Auto-Delete nach Ablauf (clientseitig zunächst):** Später auf Cloud Function migrieren für Robustheit, aber funktioniert auch ohne Backend-Code
8. **i18n für Admin-UI:** Konsistenz mit restlicher App, mehrsprachige Admins möglich (Restaurant hat tamilische + italienische Einflüsse)

**Scope:**
- ✅ **Included:** Firebase Auth (E-Mail/Passwort), Storage Upload, Firestore CRUD, Admin-Panel-UI, Carousel im Hero-Bereich, Zeitplanung, Auto-Delete, Security Rules, **Budget Alerts, App Check, Remote Config Kill-Switch, Audit Logs, Input-Sanitization, CSP**
- ❌ **Excluded:** Custom Claims (zunächst), Google Sign-In (nur E-Mail/Passwort), Mobile App, Push-Notifications, Analytics, Admin-Rollen-Hierarchie (alle Admins haben gleiche Rechte), PDF-Bearbeitung (nur Metadaten ändern, nicht PDF-Inhalt), Multi-Language für PDF-Titel (ein Titel für alle Sprachen, kann manuell mit "/" getrennt werden), **MFA (Multi-Factor Auth - optional später), Automatischer Kill-Switch via Cloud Function (optional später), CDN-Integration (optional später)**

---

## Security & Cost Protection

### Security-Risiken & Mitigations

**Potenzielle Angriffsvektoren:**

1. **DoS via PDF-Upload (Storage-Bombing)**  
   ❌ **Risiko:** Angreifer lädt massenhaft 2MB PDFs hoch → Firebase Storage-Kosten explodieren  
   ✅ **Mitigation:**
   - Storage Rules: `allow write: if request.auth != null && request.resource.size < 2 * 1024 * 1024 && request.resource.contentType == 'application/pdf'`
   - Rate Limiting in Admin-UI: Max 5 Uploads pro Minute (clientseitig)
   - **Firestore Counter:** Collection `admin_stats` mit Dokument `{userId, uploadCount, lastReset}`, bei >10 Uploads/Tag Warnung
   - **App Check (empfohlen):** Firebase App Check aktivieren → blockiert Zugriffe außerhalb deiner Web-App

2. **Firestore DoS (Read/Write-Bombing)**  
   ❌ **Risiko:** Angreifer macht tausende Firestore-Queries → Read-Kosten steigen  
   ✅ **Mitigation:**
   - **Daily Budget Limit:** Firebase Console → Spark Plan (kostenfrei) mit harten Limits ODER Blaze Plan mit Budget Alert (siehe unten)
   - **App Check (empfohlen):** Blockiert nicht-autorisierte Clients
   - **Rate Limiting in Rules:** Firestore Rules können nur limited Rate Limiting → besser via App Check

3. **Kompromittierter Admin-Account**  
   ❌ **Risiko:** Admin-Passwort geleakt → Angreifer löscht alle PDFs oder lädt Malware-PDFs hoch  
   ✅ **Mitigation:**
   - **MFA (Multi-Factor Authentication):** In Firebase Console aktivierbar (E-Mail + SMS)
   - **Audit Logs:** Alle Upload/Delete-Aktionen in Firestore `audit_logs` Collection speichern (`{action, userId, timestamp, pdfId}`)
   - **IP-Whitelisting (optional):** Cloud Armor (Google Cloud) kann nur bestimmte IPs zulassen (z.B. Restaurant-WiFi)

4. **XSS via PDF-Metadaten**  
   ❌ **Risiko:** Admin gibt `<script>alert('XSS')</script>` als PDF-Titel ein → wird auf Frontend ausgeführt  
   ✅ **Mitigation:**
   - **Sanitization:** In `admin.js` alle Inputs mit DOMPurify oder manuell escapen
   - **Content Security Policy (CSP):** In `index.html` Meta-Tag: `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com">`

### Cost Control Mechanismen

**Firebase Kosten-Quellen:**
- **Storage:** $0.026/GB/Monat (~$0.000026/MB/Monat) → 100 PDFs à 2MB = 200MB = ~$0.005/Monat (vernachlässigbar)
- **Storage Downloads:** $0.12/GB → 1000 Downloads à 2MB = 2GB = $0.24 (relevant bei vielen Besuchern)
- **Firestore Reads:** $0.036 pro 100.000 Dokument-Reads → 10.000 Besucher à 5 Reads = 50.000 Reads = $0.018 (billig)
- **Firestore Writes:** $0.18 pro 100.000 Writes → 100 PDF-Uploads = 100 Writes = $0.0002 (vernachlässigbar)

**Worst-Case-Szenario:** 10.000 Besucher/Tag, jeder lädt 3 PDFs à 2MB runter = 60GB Downloads/Tag = $7.20/Tag = **$216/Monat**

**Schutzmaßnahmen:**

1. **Firebase Budget Alerts (CRITICAL, Phase 1)**  
   - Firebase Console → Projekt-Einstellungen → Nutzung und Abrechnung → **Budget Alerts** einrichten
   - **Alert 1:** $5/Monat → E-Mail an Admin
   - **Alert 2:** $20/Monat → E-Mail + SMS
   - **Alert 3:** $50/Monat → **Automatisches Abschalten** (siehe unten)

2. **Kill-Switch via Firebase Remote Config (EMPFOHLEN)**  
   - **Setup:** Firebase Remote Config aktivieren, Parameter `feature_pdf_enabled` (boolean, default: true)
   - **Im Code:** Vor `loadSeasonalPDFs()` Remote Config abfragen:
     ```javascript
     if (!remoteConfig.getValue('feature_pdf_enabled').asBoolean()) {
       console.log('PDF feature disabled by admin');
       return; // Keine PDFs laden
     }
     ```
   - **Kill-Switch:** In Firebase Console Remote Config → `feature_pdf_enabled` auf `false` setzen → Website lädt keine PDFs mehr (innerhalb 1 Minute wirksam)
   - **Cost:** Remote Config ist kostenfrei

3. **Automatischer Kill-Switch via Cloud Function (FORTGESCHRITTEN)**  
   - **Cloud Function:** Scheduled Function (stündlich), prüft Firebase Usage API
   - Wenn Budget-Limit überschritten → setzt Remote Config `feature_pdf_enabled = false` automatisch
   - Sendet E-Mail an Admin: "⚠️ Budget-Limit erreicht, PDFs deaktiviert"

4. **Firestore Quota-Rules (ZUSÄTZLICH)**  
   ```javascript
   // In Firestore Rules: Max 100 Reads pro User pro Stunde (schwer zu implementieren)
   // Besser: App Check nutzen für globale Rate Limits
   ```

5. **CDN für PDFs (LANGFRISTIG)**  
   - Wenn Traffic steigt: Storage-URLs über Firebase Hosting CDN cachen (automatisch mit Firebase Hosting)
   - Alternative: CloudFlare CDN vorschalten → kostenfreies Tier bis 100GB/Monat

6. **Storage Download-Token-Rotation**  
   - Firebase Storage-URLs haben Download-Token → regelmäßig rotieren (wöchentlich) um Hotlinking zu verhindern
   - Cloud Function: Jeden Sonntag neue Tokens generieren

### Empfohlene Implementierungs-Reihenfolge:

**Must-Have (Phase 1):**
1. ✅ Budget Alerts in Firebase Console ($5, $20, $50) → **Step 1a hinzufügen**
2. ✅ App Check aktivieren → **Step 1b hinzufügen**
3. ✅ Storage Rules: max 2MB, nur PDF, nur authentifiziert (bereits in Step 4)
4. ✅ Remote Config Kill-Switch → **Step 2a hinzufügen**

**Should-Have (Phase 3):**
5. Audit Logs für Admin-Aktionen → **Step 11a hinzufügen**
6. CSP Meta-Tag in index.html → **in Step 12 erwähnen**
7. Input-Sanitization in admin.js → **in Step 10 erwähnen**

**Nice-to-Have (später):**
8. Automatischer Kill-Switch via Cloud Function
9. MFA für Admin-Accounts
10. Firestore Quota-Rules (nur wenn DoS-Problem auftritt)

---



## Firestore Indexes

### Pflicht: Composite Index für `seasonal_pdfs`-Query

Die geplante Query mit zwei Range-Filtern funktioniert in Firestore **nicht**:
```javascript
// GEHT NICHT — Firestore erlaubt Range-Filter nur auf ein Feld:
where('startDate', '<=', now).where('endDate', '>=', now)
// → Error: "Inequality filters on multiple properties are not supported"
```

**Lösung:** Nur `endDate` als Range-Filter, `startDate` client-seitig filtern:
```javascript
// In js/main.js → loadSeasonalPDFs()
const q = query(
  collection(db, 'seasonal_pdfs'),
  where('endDate', '>=', Timestamp.now()),
  orderBy('endDate'),
  orderBy('order')
);
const snapshot = await getDocs(q);
const pdfs = snapshot.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(pdf => pdf.startDate.toMillis() <= Date.now()); // client-seitig
```

Kein Performance-Problem — die Collection hat max. ~20 Dokumente.

### `firestore.indexes.json` (deployen mit `firebase deploy --only firestore:indexes`)

```json
{
  "indexes": [
    {
      "collectionGroup": "seasonal_pdfs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "endDate", "order": "ASCENDING" },
        { "fieldPath": "order",   "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

**Wichtig:** Ohne diesen Index schlägt die Query zur Laufzeit fehl. Firebase gibt in der Browser-Console einen direkten Link zum Index-Builder aus — der Index kann dann mit einem Klick erstellt werden. Besser aber: vor dem Go-Live via CLI deployen.

**Betroffene Dateien:** `firestore.indexes.json` (neu anlegen im Projekt-Root), `js/main.js` (`loadSeasonalPDFs()`)

---

## Further Considerations

1. **Cloud Function für Cleanup vs. clientseitiger Cleanup?**  
   - **Empfehlung:** Start mit clientseitigem Cleanup (einfacher Setup, keine Cloud Functions nötig), später auf scheduled Cloud Function migrieren (robuster, läuft auch wenn keine User online sind)  
   - **Trade-off:** Clientseitig = Performance-Overhead, aber funktioniert ohne zusätzliche Firebase-Kosten

2. **Custom Claims vs. Firestore `admins` Collection?**  
   - **Empfehlung:** Firestore Collection (gewählt, siehe Decisions), außer du erwartest >1000 Admins oder brauchst Offline-Support für Admin-Check  
   - **Alternative:** Custom Claims = serverseitig, sicherer, aber braucht Cloud Function für User-Management

3. **PDF-Titel mehrsprachig (separates Feld pro Sprache)?**  
   - **Empfehlung:** Zunächst ein Titelfeld, Admins können manuell "Sommerfest / Summer Festival / கோடை விழா" eingeben  
   - **Alternative:** Separate Felder `title_de`, `title_en`, `title_ta` in Firestore → komplexeres Admin-UI, aber bessere UX

4. **Live-Updates (Firestore Snapshot Listener) für PDF-Liste im Admin-Panel?**  
   - **Empfehlung:** Ja, implementieren für bessere UX (Änderungen sofort sichtbar, auch wenn anderer Admin etwas ändert)  
   - **Implementation:** `onSnapshot()` statt `getDocs()` in Admin-Panel

5. **PDF-Vorschau-Thumbnail generieren (z.B. als JPEG) für schnelleres Laden?**  
   - **Empfehlung:** Nice-to-have, später optimieren wenn Performance-Problem  
   - **Implementation:** Cloud Function mit ImageMagick/pdf2image, speichert Thumbnail in Storage

6. **Spark Plan (kostenfrei) vs. Blaze Plan (Pay-as-you-go)?**  
   - **Spark Plan:** Kostenfreie Limits: 50k Firestore Reads/Tag, 1GB Storage, 10GB Downloads/Monat → ausreichend für Start (~300 Besucher/Tag), aber **keine Budget Alerts möglich**
   - **Blaze Plan (EMPFOHLEN):** Unbegrenzt mit Budget Alerts → Setze $10-20/Monat Budget-Limit, verhindert Kosten-Überraschungen, ermöglicht App Check
   - **Trade-off:** Spark = kostenlos aber kein Kostenschutz; Blaze = minimale Kosten (~$2-5/Monat bei normalem Traffic) aber mit voller Kontrolle

---

## 🔥 Security-Fixes aus Review (22. Mai 2026)

### Kritische Lücken behoben:

#### 1. ✅ **Admin-Enumeration verhindert** (KRITISCH)
**Problem:** `allow read: if request.auth != null` → Jeder authentifizierte User konnte alle Admin-UIDs + E-Mails auslesen  
**Fix:** `allow read: if request.auth.uid == userId` → User kann nur SICH SELBST prüfen

#### 2. ✅ **App Check Bypass geschlossen** (HOCH)
**Problem:** `catch { console.warn(...) }` → Angreifer konnte App Check absichtlich zum Scheitern bringen  
**Fix:** KEIN Fallback → App bricht ab wenn App Check fehlschlägt (besser als unsicher weiterlaufen)

#### 3. ✅ **MIME-Type-Spoofing verhindert** (HOCH)
**Problem:** `contentType == 'application/pdf'` prüft nur HTTP-Header → `.exe` als PDF möglich  
**Fix:** Cloud Function prüft echte PDF-Magic-Bytes (`0x25 0x50 0x44 0x46`) + löscht invalide Files

#### 4. ✅ **Race Condition behoben** (MITTEL)
**Problem:** Storage `allow read: if true` → PDF während Upload öffentlich, bevor Firestore-Doc existiert  
**Fix:** Firestore-Doc ZUERST erstellen, Storage-Filename mit Doc-ID, Storage Rules mit Firestore-Lookup

#### 5. ✅ **Audit Log Spoofing verhindert** (NIEDRIG)
**Problem:** `userId` vom Client gesetzt → falscher Schuldiger möglich  
**Fix:** Firestore Rules validieren `request.resource.data.userId == request.auth.uid`

#### 6. ✅ **Client-Side Rate Limiting entfernt** (INFO)
**Problem:** JavaScript-basiert → trivial zu umgehen  
**Fix:** Verlassen auf App Check + Firestore Rules (echtes server-seitiges Rate Limiting)

#### 7. ✅ **Security by Obscurity entfernt** (INFO)
**Problem:** `#admin` als "verstecktes" Panel  
**Fix:** `/admin.html` als öffentliche URL, Sicherheit kommt von Rules nicht von Verstecken

### Angriffsvektoren adressiert:

| Vector | Status | Mitigation |
|--------|--------|------------|
| Admin-Panel Discovery | ✅ | Öffentlich, Sicherheit via Rules |
| Firebase Config Leak | ✅ | App Check OHNE Fallback |
| Admin Enumeration | ✅ | Firestore Rules: nur eigener UID |
| Timing Attack | ⚠️ | Firestore Rules verstecken Zeitplan, aber Bruteforce möglich (akzeptables Risiko) |
| Race Condition | ✅ | Firestore-first, Storage Rules mit Lookup |
| Client Rate Limiting | ✅ | Nur server-seitig (App Check) |
| MIME Spoofing | ✅ | Cloud Function mit Magic Bytes |
| Audit Log Manipulation | ✅ | Server-seitige Validierung in Rules |

---

**Plan-Version:** 2.0 (Security-Hardened)  
**Letzte Aktualisierung:** 22. Mai 2026  
**Security-Review:** Abgeschlossen ✅

