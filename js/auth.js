import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

async function checkAdminStatus(uid) {
  const snap = await getDoc(doc(db, 'admins', uid));
  return snap.exists();
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const isAdmin = await checkAdminStatus(cred.user.uid);
  if (!isAdmin) {
    await signOut(auth);
    throw new Error('not-admin');
  }
  return cred.user;
}

export function logout() {
  return signOut(auth);
}

export function onAdminAuthStateChanged(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { callback(null); return; }
    const isAdmin = await checkAdminStatus(user.uid);
    callback(isAdmin ? user : null);
  });
}
