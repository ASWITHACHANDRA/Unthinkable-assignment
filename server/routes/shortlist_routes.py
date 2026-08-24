"""
shortlist_routes.py - Flask Blueprint for managing and viewing ranked candidate shortlists.

Provides endpoints to fetch score-sorted candidate lists, inspect job details,
re-score existing candidates without re-parsing, and list all active job screenings.
"""

import logging
from flask import Blueprint, jsonify, request

from server.services.storage_service import (
    get_shortlist_for_job,
    get_job_description,
    get_all_job_descriptions,
    get_all_resumes,
    get_resume_by_id,
    save_match_result,
    save_job_description,
    save_parsed_resume
)
from server.services.llm_service import (
    rescore_existing_candidate,
    call_gemini_combined_screen,
    LLMServiceError
)

logger = logging.getLogger(__name__)

shortlist_bp = Blueprint("shortlist", __name__, url_prefix="/api")


@shortlist_bp.route("/jobs", methods=["GET"])
def list_jobs():
    """
    Retrieve all job descriptions with the count of screened candidates for each.
    """
    jobs = get_all_job_descriptions()
    enriched_jobs = []
    for job in jobs:
        candidates = get_shortlist_for_job(job["job_id"])
        job_copy = dict(job)
        job_copy["candidate_count"] = len(candidates)
        enriched_jobs.append(job_copy)

    return jsonify({
        "jobs": enriched_jobs
    }), 200


@shortlist_bp.route("/job/<job_id>", methods=["GET"])
def get_job(job_id: str):
    """
    Retrieve metadata for a specific job description.
    """
    job = get_job_description(job_id)
    if not job:
        return jsonify({"error": f"Job with ID '{job_id}' not found."}), 404
    return jsonify({"job": job}), 200


@shortlist_bp.route("/shortlist/<job_id>", methods=["GET"])
def get_job_shortlist(job_id: str):
    """
    Retrieve candidate shortlist sorted by match_score descending for a given job.
    """
    job = get_job_description(job_id)
    if not job:
        return jsonify({"error": f"Job with ID '{job_id}' not found."}), 404

    candidates = get_shortlist_for_job(job_id)
    return jsonify({
        "job": job,
        "total_candidates": len(candidates),
        "candidates": candidates
    }), 200


@shortlist_bp.route("/resumes", methods=["GET"])
def list_resumes():
    """
    Retrieve all cached/parsed resumes available for cross-job matching or re-scoring.
    """
    resumes = get_all_resumes()
    return jsonify({
        "total": len(resumes),
        "resumes": resumes
    }), 200


@shortlist_bp.route("/rescore", methods=["POST"])
def rescore_candidate():
    """
    Re-evaluate an already parsed resume against a new or existing job description.
    Bypasses file extraction, reusing existing text directly for the LLM call.

    JSON Payload:
        job_id (required): Target job description ID.
        resume_id (required): Target stored resume ID.
    """
    payload = request.get_json(silent=True) or {}
    job_id = payload.get("job_id")
    resume_id = payload.get("resume_id")

    if not job_id or not resume_id:
        return jsonify({"error": "Both 'job_id' and 'resume_id' are required parameters."}), 400

    job = get_job_description(job_id)
    if not job:
        return jsonify({"error": f"Job with ID '{job_id}' not found."}), 404

    resume = get_resume_by_id(resume_id)
    if not resume:
        return jsonify({"error": f"Resume with ID '{resume_id}' not found."}), 404

    logger.info(f"Re-scoring resume '{resume['filename']}' ({resume_id}) against job '{job['title']}' ({job_id})...")

    try:
        new_match_data = rescore_existing_candidate(
            candidate_profile={
                "candidate_name": resume.get("candidate_name", "Unknown Candidate"),
                "skills": resume.get("skills", []),
                "experience_summary": resume.get("experience_summary", ""),
                "education": resume.get("education", [])
            },
            resume_text=resume.get("raw_text", ""),
            new_job_description=job.get("description_text", "")
        )

        match_record = save_match_result(
            job_id=job_id,
            resume_id=resume_id,
            filename=resume.get("filename", "resume"),
            match_data=new_match_data
        )

        updated_shortlist = get_shortlist_for_job(job_id)

        return jsonify({
            "success": True,
            "message": f"Candidate '{match_record['candidate_name']}' successfully re-scored.",
            "match": match_record,
            "candidates": updated_shortlist
        }), 200

    except LLMServiceError as err:
        return jsonify({"error": f"Re-scoring evaluation failed: {str(err)}"}), 502
    except Exception as e:
        logger.error(f"Error during re-scoring: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@shortlist_bp.route("/sample-data", methods=["POST"])
def populate_sample_assessment_data():
    """
    Helper endpoint to populate sample candidates and a benchmark job description
    for assessment verification and rapid UI testing.
    """
    # Sample Job Description
    sample_jd_title = "Senior Full-Stack Engineer (Python & React)"
    sample_jd_text = """Job Title: Senior Full-Stack Engineer (Python & React)
Location: Remote / Hybrid
Experience Required: 4+ Years

Role Summary:
We are looking for a Senior Full-Stack Engineer to architect, build, and scale web applications and AI-enabled internal tools. You will lead technical design, implement resilient REST APIs with Python/Flask or FastAPI, and build reactive frontend dashboards with modern React/TypeScript.

Key Responsibilities:
- Design and maintain modular backend microservices and APIs in Python (Flask/FastAPI).
- Build performant, accessible frontend dashboards and responsive user interfaces using React, TypeScript, and modern styling frameworks.
- Integrate LLM services (Gemini/OpenAI) using prompt engineering, function calling, and structured outputs.
- Manage relational and document data stores (PostgreSQL, TinyDB, Redis), ensuring schema integrity and optimal query performance.
- Champion code quality, unit testing (Pytest), CI/CD pipelines, and clean architecture principles.

Requirements:
- 4+ years of professional full-stack software development experience.
- Strong proficiency in Python with frameworks like Flask, Django, or FastAPI.
- Solid experience with modern frontend technologies (React, TypeScript, CSS).
- Demonstrated experience integrating LLMs or building AI-powered workflows.
- Experience with testing suites (Pytest, Jest) and version control (Git).
- Bachelor's degree in Computer Science, Software Engineering, or equivalent practical experience.

Nice to Have:
- Experience with Docker, Kubernetes, and Cloud Run / GCP deployment.
- Experience with asynchronous task queues and document databases.
"""

    job = save_job_description(sample_jd_title, sample_jd_text, custom_id="sample_job_01")
    job_id = job["job_id"]

    sample_candidates = [
        {
            "filename": "Alex_Chen_Senior_FullStack.pdf",
            "candidate_name": "Alex Chen",
            "raw_text": "Alex Chen - Senior Full-Stack Developer with 6 years experience specializing in Python (Flask, FastAPI), React, TypeScript, and Generative AI integrations. Built LLM document processing pipelines at ScaleOps, deployed containerized services on GCP Cloud Run with automated Pytest pipelines. B.S. in Computer Science from UC Berkeley.",
            "skills": ["Python", "Flask", "FastAPI", "React", "TypeScript", "Google Gemini API", "Pytest", "Docker", "GCP", "PostgreSQL"],
            "experience_summary": "6+ years of full-stack experience leading development of Python backend microservices and React dashboards with deep LLM prompt engineering experience.",
            "education": ["B.S. in Computer Science - UC Berkeley (2018)"],
            "match_score": 9,
            "justification": "Alex possesses exceptional alignment with 6 years of hands-on experience spanning Python (Flask/FastAPI), modern React/TypeScript, and direct LLM pipeline engineering. Demonstrates strong testing practices with Pytest and GCP cloud deployment that exceed core criteria.",
            "strengths": [
                "6+ years full-stack experience exceeding the 4+ year requirement",
                "Demonstrated expertise in Python (Flask/FastAPI) and React/TypeScript",
                "Direct production experience with LLM APIs and prompt engineering",
                "Strong automated testing and cloud containerization background"
            ],
            "gaps": [
                "No explicit mention of Kubernetes cluster administration (minor nice-to-have)"
            ]
        },
        {
            "filename": "Elena_Rostova_Python_AI_Specialist.docx",
            "candidate_name": "Elena Rostova",
            "raw_text": "Elena Rostova - Backend & AI Engineer with 4 years building scalable Python web services using Flask and Django. Deep expertise in NLP, GenAI LLM function calling, vector search, and Pytest. Frontend skills include vanilla JavaScript and introductory React. Master of Science in Data Science.",
            "skills": ["Python", "Flask", "Django", "LLM Function Calling", "Prompt Engineering", "NLP", "Pytest", "PostgreSQL", "JavaScript"],
            "experience_summary": "4 years of specialized backend and AI engineering experience focusing on Python APIs and LLM workflow orchestration.",
            "education": ["M.S. in Data Science - University of Michigan (2020)"],
            "match_score": 8,
            "justification": "Elena is a strong fit for the backend and AI integration scope with solid Python/Flask credentials and deep GenAI prompt engineering knowledge. Her frontend experience in React is more recent compared to her backend depth.",
            "strengths": [
                "Deep proficiency in Python backend services (Flask/Django) and REST APIs",
                "Proven track record with LLM function-calling and NLP pipelines",
                "Solid unit testing practices with Pytest"
            ],
            "gaps": [
                "Moderate React/TypeScript experience; primarily specialized in Python backends"
            ]
        },
        {
            "filename": "Marcus_Brody_Frontend_Engineer.pdf",
            "candidate_name": "Marcus Brody",
            "raw_text": "Marcus Brody - Lead Frontend Engineer with 5 years experience crafting complex UI dashboards in React, Next.js, and TypeScript. Experience with Tailwind CSS and state management. Basic exposure to Python scripting and Node.js backend services. B.S. in Web Development.",
            "skills": ["React", "TypeScript", "Next.js", "Tailwind CSS", "JavaScript", "HTML5/CSS3", "REST APIs", "Python (Basic)"],
            "experience_summary": "5 years focused primarily on frontend architecture, reactive dashboards, and TypeScript component libraries.",
            "education": ["B.S. in Web Development - Georgia Tech (2019)"],
            "match_score": 6,
            "justification": "Marcus has excellent React and TypeScript UI design skills that would elevate the frontend dashboard experience. However, the role requires substantial Python backend API design (Flask/FastAPI) and LLM integration, which are areas of significant ramp-up for him.",
            "strengths": [
                "Exemplary frontend development with React, TypeScript, and modern CSS",
                "Strong focus on responsive dashboard architecture and performance"
            ],
            "gaps": [
                "Limited professional experience designing production Python APIs with Flask",
                "No demonstrable experience with LLM prompt engineering or GenAI workflows"
            ]
        },
        {
            "filename": "Devon_Vance_Junior_Developer.txt",
            "candidate_name": "Devon Vance",
            "raw_text": "Devon Vance - Junior Software Developer with 1 year experience building small Python scripts and static web pages. Completed a 6-month coding bootcamp in 2023. Familiar with Git, Python fundamentals, and basic HTML/CSS. Looking for an entry-level software engineering role.",
            "skills": ["Python Fundamentals", "HTML", "CSS", "Git", "Basic SQL"],
            "experience_summary": "1 year of junior/entry-level programming experience across personal scripts and bootcamp projects.",
            "education": ["Software Engineering Bootcamp Certificate (2023)"],
            "match_score": 3,
            "justification": "Devon is an enthusiastic junior developer with foundational Python knowledge, but lacks the required 4+ years of senior-level engineering experience. He does not currently demonstrate familiarity with React, TypeScript, production Flask services, or LLM engineering.",
            "strengths": [
                "Foundational familiarity with Python syntax and Git version control"
            ],
            "gaps": [
                "Does not meet the 4+ years senior experience requirement (has 1 year entry-level)",
                "No demonstrable experience in React, TypeScript, or automated testing (Pytest)",
                "No experience building production APIs or LLM pipelines"
            ]
        }
    ]

    for candidate in sample_candidates:
        file_hash = f"hash_{candidate['candidate_name'].replace(' ', '_').lower()}"
        resume_doc = save_parsed_resume(
            filename=candidate["filename"],
            file_hash=file_hash,
            raw_text=candidate["raw_text"],
            extracted_profile={
                "candidate_name": candidate["candidate_name"],
                "skills": candidate["skills"],
                "experience_summary": candidate["experience_summary"],
                "education": candidate["education"]
            }
        )
        save_match_result(
            job_id=job_id,
            resume_id=resume_doc["resume_id"],
            filename=candidate["filename"],
            match_data=candidate
        )

    shortlist = get_shortlist_for_job(job_id)
    return jsonify({
        "success": True,
        "message": "Sample assessment benchmark job and candidates seeded successfully.",
        "job": job,
        "candidates": shortlist
    }), 201
