"""
prompts.py - Prompt templates as Python strings for Smart Resume Screener.

Defines the single combined prompt for extraction and job description matching.
"""

# Single combined prompt template for resume extraction and scoring against a job description.
# Explicitly instructs thinking through extraction first, then scoring, returning strict JSON.
RESUME_SCREENING_PROMPT_TEMPLATE = """You are an expert technical recruiter and talent assessment evaluator.
Evaluate the following candidate resume text against the target Job Description in a single combined analysis.

### STEP-BY-STEP EVALUATION PROCESS:
1. EXTRACTION PHASE:
   - Carefully extract the candidate's full name (or infer the most likely name from header/contact info, or "Candidate" if missing).
   - Even if the resume lacks formal sections (e.g. continuous paragraph or raw unstructured text), infer and extract all core technical and domain skills.
   - Summarize overall professional experience (years, primary domain, relevant roles).
   - Extract education credentials, degrees, or certifications.

2. MATCH SCORING PHASE:
   - Compare the extracted candidate profile against the Job Description requirements (required vs. preferred skills, seniority, domain alignment).
   - Assign a rigorous match_score on a scale of 1 to 10 (integer).
   - SCORING CALIBRATION:
     * 9-10: Exceptional fit; meets or exceeds virtually all requirements with demonstrable relevant achievements.
     * 8: Strong, clear fit; meets all core requirements with minimal ramp-up needed.
     * 6-7: Moderate fit; meets some key requirements but lacks certain depth, seniority, or non-critical skills.
     * 4-5: Partial fit; significant gaps in required technical skills or relevant experience.
     * 1-3: Poor fit / mismatch; lacks fundamental requirements.
   - BE CONSERVATIVE WITH SCORES 8+: Reserve 8, 9, and 10 strictly for candidates with strong, demonstrable evidence of meeting the core requirements.

3. JUSTIFICATION & BREAKDOWN:
   - Provide a concise "justification" of EXACTLY 2 to 3 sentences referencing concrete skills, specific technologies, and relevant experience directly compared to the job requirements.
   - List 2-5 specific "strengths" (direct matches to JD).
   - List 1-4 specific "gaps" or areas of misalignment/missing requirements.

### OUTPUT SPECIFICATION:
Think through extraction first, then scoring, but return ONLY the final JSON object with NO markdown wrapping or surrounding text.

JSON Schema:
{{
  "candidate_name": "string (Full Name of Candidate)",
  "skills": ["string", "..."],
  "experience_summary": "string (1-2 sentence overview of professional experience, years, and primary roles)",
  "education": ["string", "..."],
  "match_score": 1-10 (integer),
  "justification": "string (2-3 sentences referencing concrete skills/experience and alignment)",
  "strengths": ["string", "..."],
  "gaps": ["string", "..."]
}}

==================================================
TARGET JOB DESCRIPTION:
{job_description}
==================================================

CANDIDATE RESUME TEXT:
{resume_text}
==================================================
"""

# Re-scoring prompt template when resume text is already extracted and needs to be evaluated against a new JD
RESUME_RESCORE_PROMPT_TEMPLATE = """You are an expert technical recruiter and talent assessment evaluator.
Evaluate the candidate's extracted profile and resume text against the new target Job Description.

### CANDIDATE EXTRACTED PROFILE:
Name: {candidate_name}
Skills: {skills}
Experience Summary: {experience_summary}
Education: {education}

### RESUME TEXT:
{resume_text}

### TARGET JOB DESCRIPTION:
{job_description}

### INSTRUCTIONS:
- Compare the candidate against the Job Description.
- Assign a conservative match_score from 1 to 10 (scores 8+ reserved for strong, clear fits only).
- Keep "justification" to 2-3 sentences referencing concrete skills/experience.
- List specific strengths and gaps.
- Return ONLY a JSON object:
{{
  "candidate_name": "{candidate_name}",
  "skills": {skills_json},
  "experience_summary": "{experience_summary}",
  "education": {education_json},
  "match_score": 1-10,
  "justification": "string (2-3 sentences)",
  "strengths": ["string", "..."],
  "gaps": ["string", "..."]
}}
"""
