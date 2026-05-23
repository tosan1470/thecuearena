import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
const firebaseConfig = {
  apiKey: "AIzaSyBs1co_IZvax0uTeLQ5Rxw_JCXtVcM3BVc",
  authDomain: "thecuearena.firebaseapp.com",
  projectId: "thecuearena",
  storageBucket: "thecuearena.firebasestorage.app",
  messagingSenderId: "990382414309",
  appId: "1:990382414309:web:aaee5071197041c529370c"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
