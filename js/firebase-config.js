import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { getRemoteConfig } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-remote-config.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js';

const firebaseConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "srilanka-et-italy.firebaseapp.com",
  projectId: "srilanka-et-italy",
  storageBucket: "srilanka-et-italy.firebasestorage.app",
  messagingSenderId: "847762650004",
  appId: "1:847762650004:web:1b7dccf7ca7cbe51b21581"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const remoteConfig = getRemoteConfig(app);

remoteConfig.settings.minimumFetchIntervalMillis = 60000;

// App Check in Monitoring Mode — does not block requests when reCAPTCHA is unavailable
// (privacy tools may block it; Enforcement would break the public carousel for those users)
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('__RECAPTCHA_SITE_KEY__'),
  isTokenAutoRefreshEnabled: true
});
