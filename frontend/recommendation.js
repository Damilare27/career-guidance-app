// ------------------ recommendations.js (Render-ready) ------------------
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("quizForm");
  const loadingDiv = document.getElementById("loading");
  const resultDiv = document.getElementById("result");
  const historyDiv = document.getElementById("historyList");

  if (!form || !loadingDiv || !resultDiv || !historyDiv) return;

  const auth = getAuth();
  const API_BASE = "https://career-guidance-app-yee0.onrender.com/"; // <-- Replace with your Render URL

  // ------------------ Helpers ------------------
  const cleanDescription = (text) =>
    text ? (text.endsWith("...") ? text.slice(0, -3) + "." : text) : "No description available.";

  const truncate = (str, n = 200) => (str.length > n ? str.substring(0, n) + "…" : str);

  const formatDateTime = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
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
      const response = await fetch(`${API_BASE}/api/recommendations/${user.uid}`);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      const recs = data.recommendations || [];

      if (!recs.length) {
        historyDiv.innerHTML = "<p>No previous recommendations yet.</p>";
        return;
      }

      const items = recs.map((r) => {
        const best = r.best_match?.job_title || "N/A";
        const alternatives = (r.alternatives || []).map((j) => j.job_title).join(", ") || "N/A";
        const aiSummary = truncate(r.ai_summary || "No AI explanation available", 300);
        const createdAt = formatDateTime(r.timestamp);

        return `
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
        `;
      });

      historyDiv.innerHTML = items.join("");
    } catch (err) {
      console.error("Error fetching previous recommendations:", err);
      historyDiv.innerHTML = "<p style='color:red;'>⚠️ Failed to load previous recommendations.</p>";
    }
  }

  // ------------------ Handle quiz submission ------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    resultDiv.innerHTML = "";
    loadingDiv.style.display = "block";
    loadingDiv.textContent = "✨ Generating your personalised recommendation... Please wait.";

    const formData = new FormData(form);
    const answers = Object.fromEntries(formData.entries());

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(`${API_BASE}/api/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_input: answers.career_goal || "",
          answers: answers,
          top_k: 5,
          explain: true,
          user_id: auth.currentUser?.uid || null
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      loadingDiv.style.display = "none";

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      const bestJob = data.best_match || { job_title: "N/A", description: "No description available" };
      const alternatives = data.alternatives.length
        ? data.alternatives
        : Array(4).fill({ job_title: "N/A", description: "No description available" });

      const allJobs = [bestJob, ...alternatives].slice(0, 5);

      const jobsHtml = allJobs
        .map((job, idx) => {
          const label = idx === 0 ? "🌟 Best Match" : `Suggestion ${idx}`;
          return `<p><strong>${label}: ${job.job_title}</strong><br>${cleanDescription(job.description)}</p>`;
        })
        .join("");

      const aiSummary = data.ai_summary || "AI explanation unavailable";

      resultDiv.innerHTML = `
        <h3>💼 Your Job Recommendations</h3>
        ${jobsHtml}
        <h4>💡 AI Explanation:</h4>
        <p><em>${aiSummary}</em></p>
      `;

      if (auth.currentUser) loadPreviousRecommendations();
    } catch (err) {
      loadingDiv.style.display = "none";
      if (err.name === "AbortError") {
        resultDiv.innerHTML = "<p style='color:red;'>⏳ Request timed out. Please try again.</p>";
      } else {
        resultDiv.innerHTML = "<p style='color:red;'>⚠️ Error fetching AI recommendation. Please try again.</p>";
      }
      console.error(err);
    }
  });

  // ------------------ Load previous recommendations on login ------------------
  auth.onAuthStateChanged((user) => {
    if (user) loadPreviousRecommendations();
  });
});
