// ------------------ recommendations.js ------------------

import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { db } from "./firebase-config.js";
import { doc, collection, addDoc, serverTimestamp }
from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("quizForm");
  const loadingDiv = document.getElementById("loading");
  const resultDiv = document.getElementById("result");

  if (!form || !loadingDiv || !resultDiv) return;

  const auth = getAuth();

  // ------------------ Handle form submission ------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    resultDiv.innerHTML = "";
    loadingDiv.style.display = "block";

    const formData = new FormData(form);
    const careerGoal = formData.get("career_goal") || "";

    try {
      // ------------------ Ask backend for ranked jobs ------------------
      const response = await fetch("https://web-production-73868.up.railway.app/api/recommend", {
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

      // Build HTML for alternative jobs
      const alternativesHtml = alternatives.map((job, idx) => 
        `<p><strong>${idx + 1}. ${job.job_title}:</strong> ${job.description || "No description available"}</p>`
      ).join("");

      // Display results
      resultDiv.innerHTML = `
        <h3>Best-Matched Job: ${bestJob.job_title}</h3>
        <p><strong>Description:</strong> ${bestJob.description || "No description available"}</p>
        <h4>Other Suggestions:</h4>
        ${alternativesHtml || "<p>None</p>"}
        <h4>AI Explanation:</h4>
        <p><em>${aiSummary}</em></p>
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
      } else {
        console.warn("User not logged in. Result not saved.");
      }

    } catch (err) {
      loadingDiv.style.display = "none";
      resultDiv.innerHTML = "<p style='color:red;'>Error fetching AI recommendation. Please try again.</p>";
      console.error(err);
    }
  });
});
