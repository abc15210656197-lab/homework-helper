import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Use initializeFirestore with experimentalForceLongPolling to improve proxy compatibility
// Use the databaseId from the config file
const db = initializeFirestore(app, { experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
let storage = null;

if (firebaseConfig.storageBucket) {
  storage = getStorage(app);
}

export { db, storage, auth };
