"""
storage_service.py - TinyDB read/write persistence service.

Stores resumes, job descriptions, and scored matches in a lightweight JSON database.
Supports deduplication, job-keyed querying, and re-scoring without re-parsing.
"""

import os
import uuid
import datetime
from typing import List, Dict, Any, Optional

from tinydb import TinyDB, Query


# Database file path configuration
DB_DIR = os.path.join(os.getcwd(), "data")
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "smart_screener_db.json")

# Initialize TinyDB instance
db = TinyDB(DB_PATH)

# Document tables
resumes_table = db.table("resumes")
jobs_table = db.table("job_descriptions")
matches_table = db.table("matches")


# ==========================================
# Job Description Operations
# ==========================================

def save_job_description(title: str, description_text: str, custom_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Save or update a job description in TinyDB.

    Args:
        title: Position title (e.g. 'Senior Backend Engineer').
        description_text: Full text of the requirements.
        custom_id: Optional fixed ID.

    Returns:
        The created job description document.
    """
    job_id = custom_id or f"job_{uuid.uuid4().hex[:8]}"
    Job = Query()

    existing = jobs_table.get(Job.job_id == job_id)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    doc = {
        "job_id": job_id,
        "title": title.strip() or "General Technical Role",
        "description_text": description_text.strip(),
        "created_at": existing["created_at"] if existing else now,
        "updated_at": now
    }

    if existing:
        jobs_table.update(doc, Job.job_id == job_id)
    else:
        jobs_table.insert(doc)

    return doc


def get_job_description(job_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a job description by its ID."""
    Job = Query()
    return jobs_table.get(Job.job_id == job_id)


def get_all_job_descriptions() -> List[Dict[str, Any]]:
    """Retrieve all stored job descriptions ordered by latest."""
    all_jobs = jobs_table.all()
    all_jobs.sort(key=lambda j: j.get("created_at", ""), reverse=True)
    return all_jobs


# ==========================================
# Resume Operations (Prevent Re-parsing)
# ==========================================

def get_resume_by_hash(file_hash: str) -> Optional[Dict[str, Any]]:
    """Check if a file with the given hash has already been parsed."""
    Resume = Query()
    return resumes_table.get(Resume.file_hash == file_hash)


def get_resume_by_id(resume_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a parsed resume record by ID."""
    Resume = Query()
    return resumes_table.get(Resume.resume_id == resume_id)


def save_parsed_resume(
    filename: str,
    file_hash: str,
    raw_text: str,
    extracted_profile: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Persist raw resume text and extracted metadata into TinyDB.

    Args:
        filename: Original filename.
        file_hash: SHA-256 hash.
        raw_text: Extracted raw text.
        extracted_profile: Extracted fields (name, skills, experience, education).

    Returns:
        The stored resume record.
    """
    existing = get_resume_by_hash(file_hash)
    if existing:
        return existing

    resume_id = f"res_{uuid.uuid4().hex[:8]}"
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    doc = {
        "resume_id": resume_id,
        "filename": filename,
        "file_hash": file_hash,
        "raw_text": raw_text,
        "candidate_name": extracted_profile.get("candidate_name", "Unknown Candidate"),
        "skills": extracted_profile.get("skills", []),
        "experience_summary": extracted_profile.get("experience_summary", ""),
        "education": extracted_profile.get("education", []),
        "uploaded_at": now
    }

    resumes_table.insert(doc)
    return doc


def get_all_resumes() -> List[Dict[str, Any]]:
    """Retrieve all parsed resumes in database."""
    return resumes_table.all()


# ==========================================
# Match / Shortlist Operations
# ==========================================

def save_match_result(
    job_id: str,
    resume_id: str,
    filename: str,
    match_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Save or update a candidate match record for a specific job description.

    Args:
        job_id: ID of the job description.
        resume_id: ID of the parsed resume document.
        filename: Original file name.
        match_data: Match evaluation (score, justification, strengths, gaps, etc.).

    Returns:
        The stored match record.
    """
    Match = Query()
    existing = matches_table.get((Match.job_id == job_id) & (Match.resume_id == resume_id))
    match_id = existing["match_id"] if existing else f"match_{uuid.uuid4().hex[:8]}"
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    doc = {
        "match_id": match_id,
        "job_id": job_id,
        "resume_id": resume_id,
        "filename": filename,
        "candidate_name": match_data.get("candidate_name", "Unknown Candidate"),
        "skills": match_data.get("skills", []),
        "experience_summary": match_data.get("experience_summary", ""),
        "education": match_data.get("education", []),
        "match_score": int(match_data.get("match_score", 5)),
        "justification": match_data.get("justification", ""),
        "strengths": match_data.get("strengths", []),
        "gaps": match_data.get("gaps", []),
        "evaluated_at": now
    }

    if existing:
        matches_table.update(doc, (Match.job_id == job_id) & (Match.resume_id == resume_id))
    else:
        matches_table.insert(doc)

    return doc


def get_shortlist_for_job(job_id: str) -> List[Dict[str, Any]]:
    """
    Retrieve all candidate match records for a job description,
    strictly sorted by match_score descending (10 -> 1).

    Args:
        job_id: Target job description ID.

    Returns:
        List of candidate match records in descending score order.
    """
    Match = Query()
    records = matches_table.search(Match.job_id == job_id)
    # Sort by match_score descending, then evaluated_at descending
    records.sort(key=lambda r: (r.get("match_score", 0), r.get("evaluated_at", "")), reverse=True)
    return records


def get_all_matches() -> List[Dict[str, Any]]:
    """Retrieve all matches across all jobs."""
    return matches_table.all()


def clear_database() -> None:
    """Clear all TinyDB tables (useful for test suites or resets)."""
    resumes_table.truncate()
    jobs_table.truncate()
    matches_table.truncate()
