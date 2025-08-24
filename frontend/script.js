// ----------------- script.js (Render-ready) -----------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// ---------- Firebase init ----------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ---------- DOM Elements ----------
const loginModal = document.getElementById("loginModal");
const openLoginBtn = document.getElementById("openLoginBtn");
const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const quizForm = document.getElementById("quizForm");
const loadingDiv = document.getElementById("loading");
const resultDiv = document.getElementById("result");

// History elements
const historyDiv = document.getElementById("recommendationHistory");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const historyWrapper = document.getElementById("historyWrapper");
const toggleHistoryBtn = document.getElementById("toggleHistoryBtn");

// ---------- API Base ----------
const API_BASE = "https://career-guidance-app-yee0.onrender.com/"; // <-- Replace with your Render URL

// ---------- UI helpers ----------
function openLogin() {
  if (loginModal) loginModal.style.display = "block";
}
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
    openLoginBtn.onclick = async () => {
      await signOut(auth);
    };
  } else {
    openLoginBtn.textContent = "Login / Sign Up";
    openLoginBtn.title = "Open login popup";
    openLoginBtn.onclick = openLogin;
  }
}

// ---------- Auth listeners ----------
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

onAuthStateChanged(auth, (user) => setLoginButtonForUser(user));

// ---------- History ----------
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("recommendationHistory") || "[]").slice(0, 5);
  } catch {
    return [];
  }
}
function setHistory(arr) {
  localStorage.setItem("recommendationHistory", JSON.stringify(arr.slice(0, 5)));
}
function addToHistory(recommendationText) {
  const history = getHistory();
  history.unshift({ text: recommendationText, ts: Date.now() });
  setHistory(history);
  loadHistory();
}
function formatTimestamp(ts) {
  return new Date(ts).toLocaleString();
}
function loadHistory() {
  const history = getHistory();
  if (!historyDiv) return;
  if (!history.length) {
    historyDiv.innerHTML = "<p>No previous recommendations yet.</p>";
  } else {
    historyDiv.innerHTML = history
      .map(
        (item, i) => `
      <div class="history-item" style="margin-bottom:8px;">
        <strong>${i + 1}.</strong> ${item.text}
        <div style="font-size:12px;opacity:0.7;">${formatTimestamp(item.ts)}</div>
        <hr>
      </div>
    `
      )
      .join("");
  }
  if (toggleHistoryBtn && historyWrapper) {
    const hidden = historyWrapper.style.display === "none";
    toggleHistoryBtn.textContent = hidden
      ? `Show Previous Recommendations (${history.length})`
      : `Hide Previous Recommendations (${history.length})`;
  }
}
clearHistoryBtn?.addEventListener("click", () => {
  localStorage.removeItem("recommendationHistory");
  loadHistory();
});
toggleHistoryBtn?.addEventListener("click", () => {
  if (!historyWrapper) return;
  const hidden = historyWrapper.style.display === "none";
  historyWrapper.style.display = hidden ? "block" : "none";
  loadHistory();
});
loadHistory();

// ---------- Quiz submit ----------
quizForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) {
    alert("Please log in to submit the quiz.");
    openLogin();
    return;
  }

  const formData = new FormData(e.target);
  const answers = Object.fromEntries(formData.entries());

  if (resultDiv) {
    resultDiv.innerHTML = "Generating recommendation...";
    resultDiv.style.display = "block";
  }
  if (loadingDiv) loadingDiv.style.display = "block";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const resp = await fetch(`${API_BASE}/api/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_input: answers.career_goal || "",
        answers,
        top_k: 5,
        explain: true,
        user_id: user.uid
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
    const data = await resp.json();

    const bestJob = data.best_match || { job_title: "N/A", description: "No description" };
    const alternatives = data.alternatives || [];
    const allJobs = [bestJob, ...alternatives].slice(0, 5);

    const jobsHtml = allJobs
      .map((job, idx) => {
        const label = idx === 0 ? "🌟 Best Match" : `Suggestion ${idx}`;
        return `<p><strong>${label}: ${job.job_title}</strong><br>${job.description}</p>`;
      })
      .join("");

    resultDiv.innerHTML = `
      <h3>💼 Career Recommendations</h3>
      ${jobsHtml}
      <h4>💡 AI Explanation:</h4>
      <p><em>${data.ai_summary || "Unavailable"}</em></p>
    `;

    // Save to Firestore
    await addDoc(collection(db, "quizResponses"), {
      uid: user.uid,
      email: user.email || null,
      submittedAt: serverTimestamp(),
      answers,
      recommendation: allJobs
    });

    addToHistory(allJobs.map((j) => j.job_title).join(", "));
  } catch (err) {
    console.error(err);
    resultDiv.innerHTML = `<p style="color:red;">Error fetching recommendation. Please try again.</p>`;
  } finally {
    if (loadingDiv) loadingDiv.style.display = "none";
  }
});
