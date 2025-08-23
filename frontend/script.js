// ----------------- FIREBASE INIT -----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } 
  from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } 
  from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ----------------- API Base URL -----------------
// Railway deployed URL
const DEPLOYED_API_BASE = "https://web-production-73868.up.railway.app";

// Local development fallback
const API_BASE = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
    ? "http://127.0.0.1:8000"
    : DEPLOYED_API_BASE;

// ----------------- DOM ELEMENTS -----------------
const loginModal = document.getElementById("loginModal");
const openLoginBtn = document.getElementById("openLoginBtn");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const quizForm = document.getElementById("quizForm");
const loadingDiv = document.getElementById("loading");
const resultDiv = document.getElementById("result");

// NEW: history elements
const historyDiv = document.getElementById("recommendationHistory");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

// Optional (for collapsible UI)
const historyWrapper = document.getElementById("historyWrapper");
const toggleHistoryBtn = document.getElementById("toggleHistoryBtn");

// ----------------- UI HELPERS -----------------
function openLogin() { if (loginModal) loginModal.style.display = "block"; }
function closeLogin() {
  if (!loginModal) return;
  loginModal.style.display = "none";
  if (loginEmail) loginEmail.value = "";
  if (loginPassword) loginPassword.value = "";
}
window.openLogin = openLogin;
window.closeLogin = closeLogin;

function setLoginButtonForUser(user) {
  if (!openLoginBtn) return;
  if (user) {
    openLoginBtn.textContent = "Logout";
    openLoginBtn.title = user.email || "Logged in";
    openLoginBtn.onclick = async () => await signOut(auth);
  } else {
    openLoginBtn.textContent = "Login / Sign Up";
    openLoginBtn.title = "Open login popup";
    openLoginBtn.onclick = openLogin;
  }
}

// ----------------- AUTH LISTENERS -----------------
loginBtn?.addEventListener("click", async () => {
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
    alert("Login successful!");
    closeLogin();
  } catch (err) {
    alert("Login failed: " + (err?.message || err));
  }
});

signupBtn?.addEventListener("click", async () => {
  try {
    await createUserWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
    alert("Sign up successful! You are now logged in.");
    closeLogin();
  } catch (err) {
    alert("Sign up failed: " + (err?.message || err));
  }
});

onAuthStateChanged(auth, (user) => {
  console.log(user ? `✅ User logged in: ${user.email}` : "⚠️ No user logged in");
  setLoginButtonForUser(user);
});

// ----------------- QUIZ HELPERS -----------------
// ... keep attachCheckLimit, normalizeHistoryArray, getHistory, setHistory, formatTimestamp, loadHistory, addToHistory as-is ...

// ----------------- QUIZ SUBMIT -----------------
quizForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;

  if (!user) {
    alert("Please log in to submit the quiz.");
    openLogin();
    return;
  }

  const form = e.target;
  const formData = new FormData(form);

  const answers = {
    experience: formData.getAll("experience"),
    tasks: formData.getAll("tasks"),
    confidence: formData.get("confidence"),
    work_style: formData.get("work_style"),
    skills: formData.getAll("skills"),
    career_interests: formData.getAll("career_interests"),
    work_interest: formData.get("work_interest"),
    work_environment: formData.get("work_environment"),
    challenges: formData.get("challenges"),
    career_goal: formData.get("career_goal"),
  };

  if (resultDiv) {
    resultDiv.innerHTML = "Generating your personalised recommendation... Please wait.";
    resultDiv.style.display = "block";
  }
  if (loadingDiv) loadingDiv.style.display = "block";

  try {
    // ----------------- FETCH USING RAILWAY URL -----------------
    const response = await fetch(`${API_BASE}/api/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_input: answers.career_goal || "",
        answers: answers,
        top_k: 5,
        explain: true
      }),
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (resultDiv) {
      resultDiv.innerHTML = `
        <h3>Your Career Recommendations:</h3>
        <p>${data.recommendations?.map(r => r.job_title).join(", ") || "No recommendation received."}</p>
        ${data.explanation ? `<p><em>${data.explanation}</em></p>` : ""}
      `;
    }

    // Save to Firebase
    await addDoc(collection(db, "quizResponses"), {
      uid: user.uid,
      email: user.email || null,
      submittedAt: serverTimestamp(),
      answers,
      recommendation: data.recommendations || null,
    });

    if (data.recommendations) addToHistory(data.recommendations.map(r => r.job_title).join(", "));

    console.log("✅ Quiz answers saved for:", user.uid);

  } catch (err) {
    console.error(err);
    if (resultDiv) resultDiv.innerHTML = `<p style="color:red;">Error fetching recommendation. Check console.</p>`;
  } finally {
    if (loadingDiv) loadingDiv.style.display = "none";
  }
});
