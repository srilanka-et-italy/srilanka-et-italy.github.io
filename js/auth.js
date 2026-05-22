import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Check admin status via REST API — avoids Firestore SDK WebChannel hang
async function checkAdminStatus(user) {
  const token = await user.getIdToken();
  const url = `https://firestore.googleapis.com/v1/projects/srilanka-et-italy/databases/(default)/documents/admins/${user.uid}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.status === 200;
}

export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

export function onAdminAuthStateChanged(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { callback(null); return; }
    try {
      const isAdmin = await checkAdminStatus(user);
      if (isAdmin) {
        callback(user);
      } else {
        await signOut(auth);
        callback(null);
      }
    } catch {
      await signOut(auth);
      callback(null);
    }
  });
}
