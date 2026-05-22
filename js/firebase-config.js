import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { getRemoteConfig } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-remote-config.js';

const firebaseConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "srilanka-et-italy.firebaseapp.com",
  projectId: "srilanka-et-italy",
  storageBucket: "srilanka-et-italy.firebasestorage.app",
  messagingSenderId: "847762650004",
  appId: "1:847762650004:web:1b7dccf7ca7cbe51b21581"
};

export const app = initializeApp(firebaseConfig);
// Use REST transport instead of gRPC-WebChannel to avoid long-polling CORS issues
export const db = initializeFirestore(app, { experimentalForceLongPolling: false, useFetchStreams: false });
export const auth = getAuth(app);
export const storage = getStorage(app);
export const remoteConfig = getRemoteConfig(app);

remoteConfig.settings.minimumFetchIntervalMillis = 60000;
