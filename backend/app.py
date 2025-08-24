# backend/app.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from pathlib import Path
import os, json, asyncio

# Similarity
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# OpenAI
from openai import OpenAI

# ---------- Paths ----------
BASE_DIR = Path(__file__).resolve().parent.parent  # project root
DATA_PATH = BASE_DIR / "job_data" / "jobs_dataset.json"
FRONTEND_PATH = BASE_DIR / "frontend"

# ---------- FastAPI ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Load dataset ----------
def load_jobs() -> List[Dict[str, Any]]:
    if not DATA_PATH.exists():
        print(f"Warning: DATA_PATH not found: {DATA_PATH}")
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    normalized = []
    for j in data:
        title = j.get("job_title") or j.get("title") or "Untitled role"
        desc = j.get("description") or j.get("job_description") or ""
        normalized.append({"job_title": title, "description": desc})
    return normalized

JOBS = load_jobs()
JOB_TITLES = [j["job_title"] for j in JOBS]
JOB_DESCS = [j["description"] for j in JOBS]

# ---------- TF-IDF ----------
VECTORIZER = TfidfVectorizer(stop_words="english")
JOB_MATRIX = VECTORIZER.fit_transform(JOB_DESCS) if JOB_DESCS else None

# ---------- OpenAI (optional) ----------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
HARDCODED_BACKUP_KEY = "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"  # replace with your backup key

client = AsyncOpenAI(api_key=OPENAI_API_KEY or HARDCODED_BACKUP_KEY)

# ---------- Request models ----------
class RecommendPayload(BaseModel):
    job_description: Optional[str] = None
    user_input: Optional[str] = None
    answers: Optional[Dict[str, Any]] = None
    top_k: int = 5
    explain: bool = True

# ---------- Quiz → keywords ----------
def map_quiz_answers_to_keywords(answers: Dict[str, Any]) -> str:
    if not answers:
        return ""
    kws: List[str] = []
    for field in ["experience", "tasks", "skills", "career_interests"]:
        vals = answers.get(field) or []
        vals = [str(v).lower() for v in vals if v]
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
        if txt:
            kws.append(txt)

    try:
        conf = int(answers.get("confidence") or 0)
        if conf >= 8:
            kws += ["senior", "lead", "ownership"]
        elif conf <= 3:
            kws += ["entry level", "junior", "training"]
    except Exception:
        pass

    return " ".join(kws)

# ---------- Ranking ----------
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

# ---------- AI Enhancement ----------
async def enhance_jobs(profile_text: str, best: Dict[str, Any], alternatives: List[Dict[str, Any]]) -> str:
    if not client:
        return ""
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

# ---------- API ----------
@app.get("/api/jobs")
async def get_jobs():
    return JSONResponse(content=JOBS)

@app.post("/api/recommend")
async def recommend(payload: RecommendPayload):
    # Build profile
    parts: List[str] = []
    if payload.job_description:
        parts.append(payload.job_description)
    if payload.user_input:
        parts.append(payload.user_input)
    if payload.answers:
        parts.append(map_quiz_answers_to_keywords(payload.answers))
    profile_text = " ".join([p for p in parts if p]).strip()
    if not profile_text:
        return JSONResponse(content={"error": "No input provided."}, status_code=400)

    # Rank jobs
    recs = rank_jobs(profile_text, payload.top_k or 5)
    if not recs:
        return {"error": "No jobs found"}

    best = recs[0]
    alternatives = recs[1:3]

    # Generate AI enhancement asynchronously
    ai_summary = await enhance_jobs(profile_text, best, alternatives) if payload.explain else None

    return {
        "profile_used": profile_text,
        "best_match": best,
        "alternatives": alternatives,
        "ai_summary": ai_summary
    }

# ---------- Serve frontend (MOUNT LAST so it doesn’t swallow /api/*) ----------
if FRONTEND_PATH.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_PATH, html=True), name="frontend")
else:
    print(f"Warning: FRONTEND_PATH does not exist: {FRONTEND_PATH}")
