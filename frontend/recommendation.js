// ------------------ recommendations.js ------------------
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { db } from "./firebase-config.js"; 
import { doc, collection, addDoc, serverTimestamp, getDocs } 
  from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("quizForm");
  const loadingDiv = document.getElementById("loading");
  const resultDiv = document.getElementById("result");
  const historyDiv = document.getElementById("historyList"); // Previous recommendations

  if (!form || !loadingDiv || !resultDiv || !historyDiv) return;

  const auth = getAuth();

  // ------------------ Helpers ------------------
  const cleanDescription = (text) => {
    if (!text) return "No description available";
    return text.endsWith("...") ? text.slice(0, -3) + "." : text;
  };

  const formatDate = (ts) => {
    if (!ts?.toDate) return "";
    const date = ts.toDate();
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };

  // ------------------ Load previous recommendations ------------------
  async function loadPreviousRecommendations() {
    const user = auth.currentUser;
    if (!user) {
      historyDiv.innerHTML = "<p>Please log in to see previous recommendations.</p>";
      return;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      const historyRef = collection(userRef, "recommendations");
      const snapshot = await getDocs(historyRef);

      if (snapshot.empty) {
        historyDiv.innerHTML = "<p>No previous recommendations yet.</p>";
        return;
      }

      const items = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const best = data.bestJob || "N/A";
        const alternatives = (data.alternatives || []).join(", ") || "N/A";
        const aiSummary = data.ai_summary || "No AI explanation available";
        const createdAt = formatDate(data.createdAt);

        items.push(`
          <div class="history-card" style="
            border: 1px solid #ddd; 
            border-radius: 8px; 
            padding: 12px; 
            margin-bottom: 10px; 
            background: #f9f9f9;
            box-shadow: 1px 1px 4px rgba(0,0,0,0.1);
          ">
            <p><strong>Submitted:</strong> ${createdAt}</p>
            <p><strong>Best Match:</strong> ${best}</p>
            <p><strong>Other Suggestions:</strong> ${alternatives}</p>
            <p><em>${aiSummary}</em></p>
          </div>
        `);
      });

      historyDiv.innerHTML = items.join("");
    } catch (err) {
      console.error("Error fetching previous recommendations:", err);
      historyDiv.innerHTML = "<p style='color:red;'>Failed to load previous recommendations.</p>";
    }
  }

  // ------------------ Handle quiz submission ------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    resultDiv.innerHTML = "";
    loadingDiv.style.display = "block";

    const formData = new FormData(form);
    const careerGoal = formData.get("career_goal") || "";

    try {
      const response = await fetch("http://127.0.0.1:8000/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_input: careerGoal,
          answers: Object.fromEntries(formData.entries()),
          top_k: 5,
          explain: true
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      loadingDiv.style.display = "none";

      const bestJob = data.best_match;
      const alternatives = data.alternatives || [];
      const aiSummary = data.ai_summary || "";

      if (!bestJob) {
        resultDiv.innerHTML = "<p>No matching job found. Try different answers!</p>";
        return;
      }

      const alternativesHtml = alternatives.map((job, idx) => 
        `<p><strong>${idx + 1}. ${job.job_title}:</strong> ${cleanDescription(job.description)}</p>`
      ).join("");

      // ------------------ Display basic recommendation first ------------------
      resultDiv.innerHTML = `
        <h3>Best-Matched Job: ${bestJob.job_title}</h3>
        <p><strong>Description:</strong> ${cleanDescription(bestJob.description)}</p>
        <h4>Other Suggestions:</h4>
        ${alternativesHtml || "<p>None</p>"}
        <h4>AI Explanation:</h4>
        <p id="aiExplanation"><em>Generating your AI-enhanced recommendation...</em></p>
      `;

      // ------------------ Save to Firebase ------------------
      const user = auth.currentUser;
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const historyRef = collection(userRef, "recommendations");

        await addDoc(historyRef, {
          answers: Object.fromEntries(formData.entries()),
          bestJob: bestJob.job_title,
          alternatives: alternatives.map(r => r.job_title),
          ai_summary: aiSummary,
          createdAt: serverTimestamp(),
        });

        console.log("Recommendation saved to Firebase for user:", user.uid);
        loadPreviousRecommendations();
      } else {
        console.warn("User not logged in. Result not saved.");
      }

      // ------------------ Update AI explanation asynchronously ------------------
      if (aiSummary) {
        const aiEl = document.getElementById("aiExplanation");
        aiEl.innerHTML = `<em>${aiSummary}</em>`;
      }

    } catch (err) {
      loadingDiv.style.display = "none";
      resultDiv.innerHTML = "<p style='color:red;'>Error fetching AI recommendation. Please try again.</p>";
      console.error(err);
    }
  });

  // ------------------ Load previous recommendations on login ------------------
  auth.onAuthStateChanged(user => {
    if (user) loadPreviousRecommendations();
  });
});
