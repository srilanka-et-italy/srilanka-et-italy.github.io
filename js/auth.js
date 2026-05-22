import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

async function checkAdminStatus(uid) {
  const snap = await getDoc(doc(db, 'admins', uid));
  return snap.exists();
}

// Only authenticate — admin check happens in onAdminAuthStateChanged
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
      const isAdmin = await checkAdminStatus(user.uid);
      if (isAdmin) {
        callback(user);
      } else {
        await signOut(auth);
        callback(null);
      }
    } catch {
      // Firestore read failed — deny access
      await signOut(auth);
      callback(null);
    }
  });
}
