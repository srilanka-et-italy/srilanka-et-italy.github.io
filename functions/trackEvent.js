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
