# backend/app.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from pathlib import Path
import json
from datetime import datetime
from random import sample
import os
import logging

# Similarity
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# OpenAI
from openai import OpenAI

# Firestore
import firebase_admin
from firebase_admin import credentials, firestore

# ---------- Paths ----------
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "job_data" / "jobs_dataset.json"
FRONTEND_PATH = BASE_DIR / "frontend"

# ---------- FastAPI ----------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # You can restrict to your frontend domain for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO)

# ---------- 🔑 OpenAI ----------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# ---------- Firestore ----------
db = None
FIREBASE_KEY_JSON = os.getenv("FIREBASE_KEY_JSON")  # Store private key as Render secret
if FIREBASE_KEY_JSON:
    try:
        cred_dict = json.loads(FIREBASE_KEY_JSON)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        logging.info("✅ Firestore initialized successfully")
    except Exception as e:
        logging.error(f"❌ Firestore init failed: {e}")
else:
    logging.warning("⚠️ FIREBASE_KEY_JSON not provided; Firestore disabled")

# ---------- Load dataset ----------
def load_jobs() -> List[Dict[str, Any]]:
    if not DATA_PATH.exists():
        logging.warning(f"⚠️ DATA_PATH not found: {DATA_PATH}")
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    normalized = []
    for j in data:
        title = j.get("job_title") or j.get("title") or "Untitled role"
        desc = j.get("description") or j.get("job_description") or ""
        normalized.append({**j, "job_title": title, "description": desc})
    return normalized

JOBS = load_jobs()
JOB_TITLES = [j["job_title"] for j in JOBS]
JOB_DESCS = [j["description"] for j in JOBS]

# ---------- TF-IDF ----------
VECTORIZER = TfidfVectorizer(stop_words="english")
JOB_MATRIX = VECTORIZER.fit_transform(JOB_DESCS) if JOB_DESCS else None

# ---------- Request models ----------
class RecommendPayload(BaseModel):
    job_description: Optional[str] = None
    user_input: Optional[str] = None
    answers: Optional[Dict[str, Any]] = None
    top_k: int = 5
    explain: bool = True
    user_id: Optional[str] = None

# ---------- Quiz → keywords ----------
def map_quiz_answers_to_keywords(answers: Dict[str, Any]) -> str:
    if not answers:
        return ""
    kws: List[str] = []
    for field in ["experience", "tasks", "skills", "career_interests"]:
        vals = [str(v).lower() for v in answers.get(field) or [] if v]
        kws += vals * 2 if field == "skills" else vals
    work_style = (answers.get("work_style") or "").lower()
    style_map = {
        "analytical": ["analysis", "data", "problem solving", "research"],
        "creative": ["creative", "design", "storytelling", "branding", "content"],
        "practical": ["hands-on", "implementation", "technical", "operations"]
    }
    kws += style_map.get(work_style, [work_style]) if work_style else []
    for field in ["work_interest", "work_environment", "challenges", "career_goal"]:
        val = (answers.get(field) or "").strip().lower()
        if val:
            kws.append(val)
    try:
        conf = int(answers.get("confidence") or 0)
        if conf >= 8: kws += ["senior", "lead", "ownership"]
        elif conf <= 3: kws += ["entry level", "junior", "training"]
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
    return [{"job_title": JOB_TITLES[i], "description": JOB_DESCS[i], "score": float(sims[i])} for i in idxs]

# ---------- AI Enhancement ----------
def enhance_recommendations(profile_text: str, recs: List[Dict[str, Any]]) -> str:
    if not client or not recs:
        return "AI enhancement unavailable"
    best_job = recs[0]
    alternatives = recs[1:3]
    prompt_lines = [
        "User profile text:",
        profile_text,
        "Top matched jobs:",
        f"1. {best_job['job_title']}: {best_job['description'][:300]}..."
    ]
    prompt_lines += [
        f"{i+2}. {alt['job_title']}: {alt['description'][:300]}..."
        for i, alt in enumerate(alternatives)
    ]
    prompt_lines.append(
        "Please:\n- Rephrase the best matched job description clearly.\n"
        "- Explain why it’s a good fit for the user.\n"
        "- Provide two alternative suggestions, concise and engaging."
    )
    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a supportive career advisor."},
                {"role": "user", "content": "\n".join(prompt_lines)}
            ],
            max_tokens=500,
            temperature=0.7
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return "AI enhancement unavailable"

# ---------- Firestore save ----------
def save_recommendation(user_id: str, data: Dict[str, Any]):
    if not db or not user_id:
        return
    db.collection("recommendations").document().set({
        "user_id": user_id,
        "profile_used": data.get("profile_used"),
        "best_match": data.get("best_match"),
        "alternatives": data.get("alternatives"),
        "ai_summary": data.get("ai_summary"),
        "timestamp": datetime.utcnow()
    })

# ---------- Firestore get previous ----------
def get_previous_recommendations(user_id: str) -> List[Dict[str, Any]]:
    if not db or not user_id:
        return []
    docs = db.collection("recommendations")\
        .where("user_id", "==", user_id)\
        .order_by("timestamp", direction=firestore.Query.DESCENDING)\
        .limit(10).stream()
    return [doc.to_dict() for doc in docs]

# ---------- API ----------
@app.get("/api/jobs")
def get_jobs():
    return JSONResponse(content=JOBS)

@app.post("/api/recommend")
def recommend(payload: RecommendPayload):
    profile_parts = []
    if payload.job_description: profile_parts.append(payload.job_description)
    if payload.user_input: profile_parts.append(payload.user_input)
    if payload.answers: profile_parts.append(map_quiz_answers_to_keywords(payload.answers))
    profile_text = " ".join([p for p in profile_parts if p]).strip()
    logging.info("Profile text: %s", profile_text)

    recs = rank_jobs(profile_text, payload.top_k) if profile_text else []
    if not recs and JOBS:
        recs = [{"job_title": j["job_title"], "description": j["description"], "score": 0.0} for j in sample(JOBS, min(payload.top_k, len(JOBS)))]

    ai_summary = enhance_recommendations(profile_text, recs) if payload.explain else "AI enhancement unavailable"

    result = {
        "profile_used": profile_text or "(No profile text provided, showing fallback jobs)",
        "best_match": recs[0] if recs else {"job_title": "N/A", "description": "No description available"},
        "alternatives": recs[1:3] if len(recs) > 1 else [{"job_title": "N/A", "description": "No description available"}],
        "ai_summary": ai_summary
    }

    if payload.user_id: save_recommendation(payload.user_id, result)
    return result

@app.get("/api/recommendations/{user_id}")
def get_user_recommendations(user_id: str):
    recs = get_previous_recommendations(user_id)
    return {"recommendations": recs}

# ---------- Serve frontend ----------
if FRONTEND_PATH.exists():
    app.mount("/frontend", StaticFiles(directory=FRONTEND_PATH, html=True), name="frontend")
else:
    logging.warning(f"⚠️ FRONTEND_PATH does not exist: {FRONTEND_PATH}")

# ---------- OpenAI test ----------
@app.get("/api/test-openai")
def test_openai():
    if not client:
        return {"error": "OpenAI client not initialized"}
    try:
        resp = client.models.list()
        models = [m.id for m in resp.data[:5]]
        return {"status": "ok", "models": models}
    except Exception as e:
        return {"error": str(e)}

