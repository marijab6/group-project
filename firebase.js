import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "red-flag-4fb04.firebaseapp.com",
  projectId: "red-flag-4fb04",
  storageBucket: "red-flag-4fb04.firebasestorage.app",
  messagingSenderId: "309733202549",
  appId: "1:309733202549:web:065d0e527447fe1e74f63c",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function saveScanResult(result) {
  await addDoc(collection(db, "scan_results"), {
    site_url: result.site_url,
    hostname: result.hostname,
    risk_score: result.risk_score,
    status: result.status,
    details: result.details,
    scan_date: serverTimestamp(),
  });
}

export async function getScanResults() {
  const q = query(collection(db, "scan_results"), orderBy("scan_date", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}