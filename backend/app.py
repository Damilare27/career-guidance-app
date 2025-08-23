# backend/app.py# backend/app.py
import os
import json
import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from openai import OpenAI

# ---------- Paths ----------
BASE_DIR = Path(__file__).resolve().parent  # backend/
DATA_PATH = BASE_DIR / "jobs_dataset.json"  # <- adjust if file is here
FRONTEND_PATH = BASE_DIR / "frontend"       # make sure this folder exists

# ---------- FastAPI ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
if FRONTEND_PATH.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_PATH, html=True), name="frontend")
else:
    print(f"⚠️ Frontend folder not found at {FRONTEND_PATH}")

# ---------- Load dataset ----------
def load_jobs() -> List[Dict[str, Any]]:
    if not DATA_PATH.exists():
        print(f"⚠️ Job dataset not found at {DATA_PATH}")
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    normalized = [
        {"job_title": j.get("job_title") or j.get("title") or "Untitled role",
         "description": j.get("description") or j.get("job_description") or ""}
        for j in data
    ]
    return normalized

JOBS = load_jobs()
JOB_TITLES = [j["job_title"] for j in JOBS]
JOB_DESCS = [j["description"] for j in JOBS]

# ---------- TF-IDF ----------
VECTORIZER = TfidfVectorizer(stop_words="english")
JOB_MATRIX = VECTORIZER.fit_transform(JOB_DESCS) if JOB_DESCS else None

# ---------- OpenAI ----------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# ---------- Request models ----------
class RecommendPayload(BaseModel):
    job_description: Optional[str] = None
    user_input: Optional[str] = None
    answers: Optional[Dict[str, Any]] = None
    top_k: int = 5
    explain: bool = True

# ---------- Helpers ----------
def map_quiz_answers_to_keywords(answers: Dict[str, Any]) -> str:
    if not answers: return ""
    kws: List[str] = []
    for field in ["experience", "tasks", "skills", "career_interests"]:
        vals = [str(v).lower() for v in answers.get(field) or [] if v]
        kws += vals * 2 if field == "skills" else vals

    work_style = (answers.get("work_style") or "").lower()
    if work_style == "analytical":
        kws += ["analysis", "data", "problem solving", "research"]
    elif work_style == "creative":
        kws += ["creative", "design", "storytelling", "branding", "content"]
    elif work_style == "practical":
        kws += ["hands-on", "implementation", "technical", "operations"]
    elif work_style:
        kws.append(work_style)

    for f in ["work_interest", "work_environment", "challenges", "career_goal"]:
        txt = (answers.get(f) or "").strip().lower()
        if txt: kws.append(txt)

    try:
        conf = int(answers.get("confidence") or 0)
        if conf >= 8: kws += ["senior", "lead", "ownership"]
        elif conf <= 3: kws += ["entry level", "junior", "training"]
    except Exception:
        pass

    return " ".join(kws)

def rank_jobs(profile_text: str, top_k: int = 5) -> List[Dict[str, Any]]:
    if not profile_text.strip() or JOB_MATRIX is None:
        return []
    user_vec = VECTORIZER.transform([profile_text])
    sims = cosine_similarity(user_vec, JOB_MATRIX).flatten()
    idxs = sims.argsort()[-top_k:][::-1]
    return [
        {"job_title": JOB_TITLES[i], "description": JOB_DESCS[i], "score": float(sims[i])}
        for i in idxs
    ]

async def enhance_jobs(profile_text: str, best: Dict[str, Any], alternatives: List[Dict[str, Any]]) -> str:
    if not client: return ""
    alt_text = "\n".join([f"- {a['job_title']}: {a['description']}" for a in alternatives])
    prompt = f"""
User profile:
{profile_text}

Best match:
{best['job_title']}: {best['description']}

Other suggestions:
{alt_text}

Write a clear career advice summary:
- Explain why the best match is ideal.
- Briefly explain why the other suggestions are relevant.
- Keep it supportive and concise (2–3 short paragraphs).
"""
    try:
        resp = await asyncio.to_thread(lambda: client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a supportive career advisor."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=400,
            temperature=0.7
        ))
        return resp.choices[0].message.content.strip()
    except Exception:
        return "(AI enhancement unavailable)"

# ---------- API endpoints ----------
@app.get("/api/jobs")
async def get_jobs():
    return JSONResponse(content=JOBS)

@app.post("/api/recommend")
async def recommend(payload: RecommendPayload):
    profile_parts = []
    if payload.job_description: profile_parts.append(payload.job_description)
    if payload.user_input: profile_parts.append(payload.user_input)
    if payload.answers: profile_parts.append(map_quiz_answers_to_keywords(payload.answers))
    profile_text = " ".join(profile_parts).strip()
    if not profile_text:
        return JSONResponse(content={"error": "No input provided."}, status_code=400)

    recs = rank_jobs(profile_text, payload.top_k)
    if not recs: return {"error": "No jobs found"}

    best = recs[0]
    alternatives = recs[1:3]
    ai_summary = await enhance_jobs(profile_text, best, alternatives) if payload.explain else None

    return {
        "profile_used": profile_text,
        "best_match": best,
        "alternatives": alternatives,
        "ai_summary": ai_summary
    }

