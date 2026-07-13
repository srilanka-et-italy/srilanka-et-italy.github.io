// Simple fixed-window rate limiter backed by a Firestore-shaped store.
// db must expose db.collection(name).doc(id).get()/.set() (Admin SDK subset).
function createRateLimiter(db, { collection = 'rate_limits', windowMs = 60000, limit = 60 } = {}) {
  return async function checkRateLimit(ipHash, now = Date.now()) {
    const ref = db.collection(collection).doc(ipHash);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;

    if (!data || now - data.windowStart >= windowMs) {
      await ref.set({ count: 1, windowStart: now });
      return { allowed: true };
    }

    if (data.count >= limit) {
      return { allowed: false };
    }

    await ref.set({ count: data.count + 1, windowStart: data.windowStart });
    return { allowed: true };
  };
}

module.exports = { createRateLimiter };
