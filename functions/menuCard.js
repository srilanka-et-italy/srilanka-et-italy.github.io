const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { createRateLimiter } = require('./rateLimit');

// Public, unauthenticated redirect to the current main menu PDF/image.
// Kept at a stable path so it can be linked externally (e.g. Google Business)
// without changing when the admin replaces the underlying file.
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

  const pdfUrl = (data && data.pdfUrl) || FALLBACK_MENU_PDF_URL;

  if (!pdfUrl) {
    res.status(404).send('Menu not found');
    return;
  }

  res.set('Cache-Control', 'public, max-age=120');
  res.redirect(302, pdfUrl);
});
