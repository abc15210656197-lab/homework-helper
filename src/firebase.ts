import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY,
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID
};

const databaseId = 'textbook';

let app;
let db: ReturnType<typeof getFirestore> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;

if (firebaseConfig.apiKey) {
  app = initializeApp(firebaseConfig);
  // Use initializeFirestore with experimentalForceLongPolling to improve proxy compatibility
  db = initializeFirestore(app, { experimentalForceLongPolling: true }, databaseId);
  
  if (firebaseConfig.storageBucket) {
    storage = getStorage(app);
  }
}

export { db, storage };
