const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Runs daily at 02:00 UTC.
// 1. Deletes expired PDFs (endDate in the past)
// 2. Deletes audit logs older than 90 days
// 3. Deletes stuck drafts older than 1 hour
// 4. Deletes stale rate_limits windows older than 1 hour
exports.scheduledCleanup = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('UTC')
  .onRun(async () => {
    const db      = admin.firestore();
    const storage = admin.storage().bucket();
    const now     = admin.firestore.Timestamp.now();

    // 1. Expired active PDFs
    const expiredSnap = await db.collection('seasonal_pdfs')
      .where('endDate', '<', now)
      .where('status', '==', 'active')
      .get();

    const expiredDeletes = expiredSnap.docs.map(async (docSnap) => {
      const { fileName, pdfUrl } = docSnap.data();
      if (fileName) {
        try {
          await storage.file(`seasonal-pdfs/${fileName}`).delete();
        } catch (err) {
          if (err.code !== 404) console.warn('Storage delete failed:', fileName, err.message);
        }
      }
      await docSnap.ref.delete();
    });

    // 2. Audit logs older than 90 days
    const cutoff90 = admin.firestore.Timestamp.fromMillis(now.toMillis() - 90 * 24 * 3600 * 1000);
    const oldLogsSnap = await db.collection('audit_logs')
      .where('timestamp', '<', cutoff90)
      .get();
    const logDeletes = oldLogsSnap.docs.map(d => d.ref.delete());

    // 3. Stuck drafts older than 1 hour
    const cutoff1h = admin.firestore.Timestamp.fromMillis(now.toMillis() - 3600 * 1000);
    const stuckSnap = await db.collection('seasonal_pdfs')
      .where('status', '==', 'draft')
      .where('createdAt', '<', cutoff1h)
      .get();

    const stuckDeletes = stuckSnap.docs.map(async (docSnap) => {
      const { fileName } = docSnap.data();
      if (fileName) {
        try { await storage.file(`seasonal-pdfs/${fileName}`).delete(); } catch { /* ignore */ }
      }
      await docSnap.ref.delete();
    });

    // 4. Stale rate_limits windows older than 1 hour.
    // windowStart is stored as a plain JS number (Date.now()), not a
    // Firestore Timestamp, so compare against a plain number here.
    const rateLimitCutoffMs = Date.now() - 3600 * 1000;
    const staleRateLimitsSnap = await db.collection('rate_limits')
      .where('windowStart', '<', rateLimitCutoffMs)
      .get();
    const rateLimitDeletes = staleRateLimitsSnap.docs.map(d => d.ref.delete());

    await Promise.allSettled([...expiredDeletes, ...logDeletes, ...stuckDeletes, ...rateLimitDeletes]);
    console.log(`Cleanup complete: ${expiredSnap.size} expired, ${oldLogsSnap.size} logs, ${stuckSnap.size} stuck drafts, ${staleRateLimitsSnap.size} stale rate limits`);
  });
