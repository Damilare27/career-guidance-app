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
function attachCheckLimit(name, limit) {
  const boxes = [...document.querySelectorAll(`input[name="${name}"]`) || []];
  boxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      const checked = boxes.filter((b) => b.checked);
      if (checked.length > limit) {
        cb.checked = false;
        alert(`You can select up to ${limit} options for this question.`);
      }
    });
  });
}
attachCheckLimit("q2", 3);
attachCheckLimit("q5", 4);

// ----------------- HISTORY (last 5 items, collapsible) -----------------
function normalizeHistoryArray(arr) {
  return (arr || []).map(item => {
    if (typeof item === "string") return { text: item, ts: Date.now() };
    if (item && typeof item === "object") {
      return { text: item.text ?? "", ts: item.ts ?? Date.now() };
    }
    return { text: String(item ?? ""), ts: Date.now() };
  });
}

function getHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem("recommendationHistory") || "[]");
    const normalized = normalizeHistoryArray(raw);
    return normalized.slice(0, 5);
  } catch {
    return [];
  }
}

function setHistory(arr) {
  const trimmed = normalizeHistoryArray(arr).slice(0, 5);
  localStorage.setItem("recommendationHistory", JSON.stringify(trimmed));
}

function formatTimestamp(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

function loadHistory() {
  const history = getHistory();
  if (!historyDiv) return;

  if (history.length === 0) {
    historyDiv.innerHTML = "<p>No previous recommendations yet.</p>";
  } else {
    historyDiv.innerHTML = history
      .map((item, i) => `
        <div class="history-item" style="margin-bottom:8px;">
          <strong>${i + 1}.</strong> ${item.text}
          <div style="font-size:12px;opacity:0.7;">${formatTimestamp(item.ts)}</div>
          <hr>
        </div>
      `)
      .join("");
  }

  if (toggleHistoryBtn) {
    const count = history.length;
    const isHidden =
      historyWrapper
        ? (historyWrapper.classList?.contains("hidden") || historyWrapper.style.display === "none")
        : false;
    toggleHistoryBtn.textContent = isHidden
      ? `Show Previous Recommendations (${count})`
      : `Hide Previous Recommendations (${count})`;
  }
}

function addToHistory(recommendation) {
  const history = getHistory();
  history.unshift({ text: recommendation, ts: Date.now() });
  setHistory(history);
  loadHistory();
}

clearHistoryBtn?.addEventListener("click", () => {
  localStorage.removeItem("recommendationHistory");
  loadHistory();
});

function setHidden(el, hidden) {
  if (!el) return;
  if (el.classList) el.classList.toggle("hidden", hidden);
  el.style.display = hidden ? "none" : "block";
}

toggleHistoryBtn?.addEventListener("click", () => {
  if (!historyWrapper) return;
  const nowHidden = !(historyWrapper.style.display !== "none" && !historyWrapper.classList.contains("hidden"));
  setHidden(historyWrapper, !nowHidden);
  loadHistory();
});

loadHistory();

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
    // ----------------- UPDATED FETCH -----------------
    const response = await fetch("http://127.0.0.1:8000/api/recommend", {
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
