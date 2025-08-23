// ---------- script.js ----------

// Import from firebase-config.js
import { 
  auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile, 
  signOut 
} from "./firebase-config.js";

// ---------- Modal Handling ----------
function openModal(id) {
  document.getElementById(id).style.display = "block";
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
}

document.getElementById("loginBtn").onclick = () => openModal("loginModal");
document.getElementById("signupBtn").onclick = () => openModal("signupModal");

document.querySelectorAll(".close").forEach(el => {
  el.onclick = () => closeModal(el.getAttribute("data-close"));
});

window.onclick = function(event) {
  document.querySelectorAll(".modal").forEach(modal => {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });
};

// ---------- Firebase Auth (Login) ----------
document.getElementById("loginSubmit").onclick = async () => {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    alert("Logged in!");
    closeModal("loginModal");
  } catch (err) {
    alert(err.message);
  }
};

// ---------- Firebase Auth (Signup) ----------
document.getElementById("signupSubmit").onclick = async () => {
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;
  const username = document.getElementById("signupUsername").value; // 👈 Add username field in form

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // ✅ Update profile with username
    await updateProfile(userCredential.user, {
      displayName: username
    });

    console.log("User signed up:", userCredential.user);
    alert("Signup successful! Welcome $(username)");
    closeModal("signupModal");
  } catch (error) {
    console.error("Signup error:", error.message);
    alert(error.message);
  }
};



// ---------- Logout ----------
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    alert("Logged out");
  } catch (err) {
    alert(err.message);
  }
});

// ---------- Quiz Submission ----------
document.getElementById("quizForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!auth.currentUser) {
    alert("Please log in to submit the quiz.");
    openModal("loginModal");
    return;
  }
  alert("Quiz submitted successfully!");
});
