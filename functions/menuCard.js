const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { createRateLimiter } = require('./rateLimit');

// Public, unauthenticated endpoint serving the current main menu PDF/image.
// Kept at a stable path so it can be linked externally (e.g. Google Business)
// without changing when the admin replaces the underlying file, and streams
// the file content directly (rather than redirecting) so the browser's
// address bar never reveals the underlying Storage URL/token.
//
// Fallback: on a fresh deploy (before the admin's first upload), no
// main_menu/current doc exists yet. Rather than 404 on a link the public
// site already advertises, fall back to the legacy static PDF committed in
// the repo. Once the admin uploads a menu, main_menu/current takes over and
// this fallback is simply never reached again.
const FALLBACK_MENU_PDF_URL =
  'https://srilanka-et-italy.github.io/assets/srilanka%20et%20italy%20speisekarte.pdf';

exports.menuCard = functions.https.onRequest(async (req, res) => {
  const db = admin.firestore();
  const checkRateLimit = createRateLimiter(db);

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : null)
    || req.ip || 'unknown';
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

  const { allowed } = await checkRateLimit(ipHash);
  if (!allowed) {
    res.status(429).send('Too Many Requests');
    return;
  }

  const docSnap = await db.collection('main_menu').doc('current').get();
  const data = docSnap.exists ? docSnap.data() : null;

  res.set('Cache-Control', 'public, max-age=120');

  if (data && data.fileName) {
    try {
      const file = admin.storage().bucket().file(`main-menu/${data.fileName}`);
      res.set('Content-Type', data.contentType || 'application/pdf');
      file.createReadStream()
        .on('error', (err) => {
          console.error('main-menu storage stream failed:', err.message);
          if (!res.headersSent) res.status(404).send('Menu not found');
        })
        .pipe(res);
      return;
    } catch (err) {
      console.error('main-menu storage read failed:', err.message);
    }
  }

  // No doc yet, or the primary read failed — serve the fallback file instead.
  try {
    const fallbackResponse = await fetch(FALLBACK_MENU_PDF_URL);
    if (!fallbackResponse.ok || !fallbackResponse.body) {
      res.status(404).send('Menu not found');
      return;
    }
    res.set('Content-Type', 'application/pdf');
    const reader = fallbackResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error('fallback menu fetch failed:', err.message);
    res.status(404).send('Menu not found');
  }
});
