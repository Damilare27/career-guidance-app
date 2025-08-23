// ---------- Firebase v9 Modular Setup ----------

// Import Firebase services you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { 
  getAuth,
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,  
  updateProfile 
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
// ⚠️ Optional: only include analytics if you need it
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-analytics.js";

// ✅ Your Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyBf_zU0nbwHF0F5z8KmxWJmH2RXvvAWiYs",
  authDomain: "career-guidance-f1753.firebaseapp.com",
  projectId: "career-guidance-f1753",
  storageBucket: "career-guidance-f1753.appspot.com", // <-- fixed: should end with .appspot.com
  messagingSenderId: "278554380263",
  appId: "1:278554380263:web:603771b10ebc920bf35f42",
  measurementId: "G-FJ1YPCDSCT"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// Optional: Initialize Analytics (only works on https)
let analytics = null;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn("Analytics not supported in this environment");
}

// ✅ Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// ✅ Export useful auth functions (so you don’t get undefined errors)
export {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
};
