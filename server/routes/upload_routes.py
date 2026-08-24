"""
upload_routes.py - Flask Blueprint for resume & job description upload processing.

Handles batch resume uploads (PDF, DOCX, TXT), validates sizes/formats,
skips and logs corrupted files, invokes single combined LLM screening,
and persists outcomes in TinyDB.
"""

import logging
from typing import List, Dict, Any
from flask import Blueprint, request, jsonify

from server.services.resume_parser import (
    extract_resume_text,
    compute_file_hash,
    ResumeParseError,
    validate_file_metadata
)
from server.services.llm_service import call_gemini_combined_screen, LLMServiceError
from server.services.storage_service import (
    save_job_description,
    get_job_description,
    save_parsed_resume,
    get_resume_by_hash,
    save_match_result,
    get_shortlist_for_job
)

logger = logging.getLogger(__name__)

upload_bp = Blueprint("upload", __name__, url_prefix="/api")


@upload_bp.route("/upload", methods=["POST"])
def upload_and_screen_resumes():
    """
    Primary endpoint to ingest one or more resumes and evaluate them against a job description.

    Form Parameters:
        job_title (optional): Title of the position.
        job_description (required): Raw text of the job description.
        job_id (optional): Existing job description ID to append candidates to.
        resumes (required): List of multipart file objects (.pdf, .docx, .txt).

    Returns:
        JSON object containing job metadata, processed candidates shortlist, and failure logs.
    """
    job_description = request.form.get("job_description", "").strip()
    job_title = request.form.get("job_title", "").strip() or "Position Screening"
    existing_job_id = request.form.get("job_id", "").strip()

    if not job_description:
        return jsonify({
            "error": "Job description is required to perform candidate screening."
        }), 400

    uploaded_files = request.files.getlist("resumes")
    if not uploaded_files or len(uploaded_files) == 0 or (len(uploaded_files) == 1 and uploaded_files[0].filename == ""):
        return jsonify({
            "error": "At least one resume file (.pdf, .docx, .txt) must be uploaded."
        }), 400

    # 1. Persist or retrieve job description
    job_doc = save_job_description(job_title, job_description, custom_id=existing_job_id if existing_job_id else None)
    job_id = job_doc["job_id"]

    processed_candidates: List[Dict[str, Any]] = []
    failed_files: List[Dict[str, str]] = []

    logger.info(f"Initiating batch processing of {len(uploaded_files)} resumes for Job ID: {job_id}")

    # 2. Process each resume file individually
    for file_storage in uploaded_files:
        filename = file_storage.filename or "uploaded_resume"
        try:
            # Read file bytes
            file_bytes = file_storage.read()
            if not file_bytes:
                raise ResumeParseError(f"File '{filename}' is empty.")

            # Validate metadata (extension and size limit)
            validate_file_metadata(filename, len(file_bytes))
            file_hash = compute_file_hash(file_bytes)

            # Check if this resume was already parsed previously
            cached_resume = get_resume_by_hash(file_hash)
            if cached_resume:
                logger.info(f"Resume '{filename}' found in cache ({cached_resume['resume_id']}). Reusing parsed text.")
                raw_text = cached_resume["raw_text"]
                resume_id = cached_resume["resume_id"]
                candidate_name = cached_resume["candidate_name"]
            else:
                # Parse raw text using resume_parser
                logger.info(f"Parsing raw text from '{filename}'...")
                raw_text = extract_resume_text(file_bytes, filename)
                resume_id = None
                candidate_name = None

            # 3. Perform single combined LLM call (extraction + matching)
            logger.info(f"Invoking combined LLM screening for '{filename}'...")
            match_result = call_gemini_combined_screen(raw_text, job_description)

            # 4. Save parsed resume if newly processed
            if not cached_resume:
                resume_doc = save_parsed_resume(
                    filename=filename,
                    file_hash=file_hash,
                    raw_text=raw_text,
                    extracted_profile={
                        "candidate_name": match_result.get("candidate_name", "Unknown Candidate"),
                        "skills": match_result.get("skills", []),
                        "experience_summary": match_result.get("experience_summary", ""),
                        "education": match_result.get("education", [])
                    }
                )
                resume_id = resume_doc["resume_id"]

            # 5. Persist match record linked to job_id and resume_id
            match_record = save_match_result(
                job_id=job_id,
                resume_id=resume_id,
                filename=filename,
                match_data=match_result
            )
            processed_candidates.append(match_record)

        except ResumeParseError as parse_err:
            logger.warning(f"Skipping unparseable file '{filename}': {str(parse_err)}")
            failed_files.append({
                "filename": filename,
                "error": f"Parsing Error: {str(parse_err)}"
            })
        except LLMServiceError as llm_err:
            logger.error(f"LLM evaluation failed for '{filename}': {str(llm_err)}")
            failed_files.append({
                "filename": filename,
                "error": f"AI Evaluation Error: {str(llm_err)}"
            })
        except Exception as generic_err:
            logger.error(f"Unexpected error processing '{filename}': {str(generic_err)}", exc_info=True)
            failed_files.append({
                "filename": filename,
                "error": f"Unexpected System Error: {str(generic_err)}"
            })

    # 6. Retrieve complete updated shortlist sorted by score descending
    full_shortlist = get_shortlist_for_job(job_id)

    return jsonify({
        "success": True,
        "job": job_doc,
        "total_uploaded": len(uploaded_files),
        "processed_count": len(processed_candidates),
        "failed_count": len(failed_files),
        "failed_files": failed_files,
        "candidates": full_shortlist
    }), 200
