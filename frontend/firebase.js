// ---------- Imports ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } 
  from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ---------- Initialize Firebase ----------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Export for other scripts ----------
export { auth, db };

// ---------- Modal helpers ----------
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

// ---------- DOM refs ----------
const loginModal = document.getElementById("loginModal");
const signupModal = document.getElementById("signupModal");

const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userDisplay = document.getElementById("userDisplay");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const signupUsername = document.getElementById("signupUsername");
const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");

// ---------- Modal open/close ----------
if (loginBtn) loginBtn.addEventListener("click", () => openModal("loginModal"));
if (signupBtn) signupBtn.addEventListener("click", () => openModal("signupModal"));

document.querySelectorAll(".close").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

window.addEventListener("click", (e) => {
  if (e.target === loginModal)  closeModal("loginModal");
  if (e.target === signupModal) closeModal("signupModal");
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal("loginModal");
    closeModal("signupModal");
  }
});

// ---------- Sign Up ----------
const signupSubmitBtn = document.getElementById("signupSubmit");
if (signupSubmitBtn) {
  signupSubmitBtn.addEventListener("click", async () => {
    const username = signupUsername?.value.trim();
    const email = signupEmail?.value.trim();
    const password = signupPassword?.value;

    if (!username || !email || !password) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: username });
      alert("Sign-up successful!");
      closeModal("signupModal");
    } catch (err) {
      alert(err.message);
    }
  });
}

// ---------- Login ----------
const loginSubmitBtn = document.getElementById("loginSubmit");
if (loginSubmitBtn) {
  loginSubmitBtn.addEventListener("click", async () => {
    const email = loginEmail?.value.trim();
    const password = loginPassword?.value;

    if (!email || !password) {
      alert("Enter email and password.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert("Login successful!");
      closeModal("loginModal");
    } catch (err) {
      alert(err.message);
    }
  });
}

// ---------- Logout ----------
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
  });
}

// ---------- Auth state listener ----------
onAuthStateChanged(auth, (user) => {
  if (user && userDisplay) {
    userDisplay.textContent = `Hello, ${user.displayName || user.email}`;
    if (loginBtn) loginBtn.style.display = "none";
    if (signupBtn) signupBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
  } else {
    if (userDisplay) userDisplay.textContent = "";
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (signupBtn) signupBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
  }
});
