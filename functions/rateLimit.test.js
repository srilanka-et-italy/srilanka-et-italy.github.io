const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter } = require('./rateLimit');

function fakeDb() {
  const store = new Map();
  return {
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            async get() {
              const data = store.get(key);
              return { exists: data !== undefined, data: () => data };
            },
            async set(val) {
              store.set(key, val);
            }
          };
        }
      };
    }
  };
}

test('allows requests under the limit', async () => {
  const db = fakeDb();
  const checkRateLimit = createRateLimiter(db, { windowMs: 60000, limit: 3 });

  const r1 = await checkRateLimit('ip-a', 1000);
  const r2 = await checkRateLimit('ip-a', 1000);
  const r3 = await checkRateLimit('ip-a', 1000);

  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, true);
  assert.equal(r3.allowed, true);
});

test('blocks requests once the limit is exceeded within the window', async () => {
  const db = fakeDb();
  const checkRateLimit = createRateLimiter(db, { windowMs: 60000, limit: 2 });

  await checkRateLimit('ip-b', 1000);
  await checkRateLimit('ip-b', 1000);
  const r3 = await checkRateLimit('ip-b', 1000);

  assert.equal(r3.allowed, false);
});

test('resets the count once the window has elapsed', async () => {
  const db = fakeDb();
  const checkRateLimit = createRateLimiter(db, { windowMs: 60000, limit: 1 });

  await checkRateLimit('ip-c', 1000);
  const blocked = await checkRateLimit('ip-c', 1000);
  const resetAllowed = await checkRateLimit('ip-c', 1000 + 60000);

  assert.equal(blocked.allowed, false);
  assert.equal(resetAllowed.allowed, true);
});

test('tracks different IPs independently', async () => {
  const db = fakeDb();
  const checkRateLimit = createRateLimiter(db, { windowMs: 60000, limit: 1 });

  const a1 = await checkRateLimit('ip-d', 1000);
  const b1 = await checkRateLimit('ip-e', 1000);

  assert.equal(a1.allowed, true);
  assert.equal(b1.allowed, true);
});
