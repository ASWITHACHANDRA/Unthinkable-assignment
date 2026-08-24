# Smart Resume Screener

An intelligent, full-stack recruitment assessment tool that automatically parses candidate resumes (PDF, DOCX, TXT), extracts structured skills, experience, and education, and matches candidates against a target Job Description using a **single combined LLM evaluation**. It outputs a score-ranked shortlist with concise justifications, strengths, and gaps.

---

## 📸 Application Preview

```
+---------------------------------------------------------------------------------------------------+
|  [📄] Smart Resume Screener                [Load Sample Data]   [+ New Screening]                |
+---------------------------------------------------------------------------------------------------+
|  1. Define Role & Upload Resumes                                                                  |
|  +--------------------------------------------------+------------------------------------------+  |
|  | Position Title: [Senior Full-Stack Engineer    ] | [ Drag & Drop Resumes (PDF / DOCX) ]     |  |
|  | Job Description:                                 | • Alex_Chen_Resume.pdf (42 KB)           |  |
|  | - 4+ years Python (Flask/FastAPI), React, LLMs...| • Elena_Rostova_Resume.docx (38 KB)      |  |
|  +--------------------------------------------------+------------------------------------------+  |
|  [ Screen & Rank Candidates -> ]                                                                  |
+---------------------------------------------------------------------------------------------------+
|  Candidate Shortlist  (Sorted by Match Score Descending)                                          |
|  [ Search name/skill... ]  [ Min Score: Score >= 8 ]  [ Expand All ] [ Collapse All ]            |
|  +------+--------------------+-------------+---------------------------+-----------------------+  |
|  | Rank | Candidate          | Match Score | Experience Summary        | Core Skills           |  |
|  +------+--------------------+-------------+---------------------------+-----------------------+  |
|  | #1   | Alex Chen          | [ 9 / 10 ]  | 6+ yrs full-stack Python  | Python, React, Gemini |  |
|  | #2   | Elena Rostova      | [ 8 / 10 ]  | 4 yrs backend & AI APIs   | Flask, NLP, Pytest    |  |
|  | #3   | Marcus Brody       | [ 6 / 10 ]  | 5 yrs frontend UI lead    | React, TypeScript     |  |
|  | #4   | Devon Vance        | [ 3 / 10 ]  | 1 yr junior developer     | Python, HTML, Git     |  |
|  +------+--------------------+-------------+---------------------------+-----------------------+  |
|                                                                                                   |
|  ▼ Expanded Detail Row (Alex Chen):                                                               |
|  +---------------------------------------------------------------------------------------------+  |
|  | AI Fit Justification:                                                                       |  |
|  | "Alex possesses exceptional alignment with 6 years of experience in Python (Flask/FastAPI),  |  |
|  | modern React/TypeScript, and direct LLM pipeline engineering. Demonstrates strong testing    |  |
|  | practices with Pytest and GCP cloud deployment that exceed core criteria."                   |  |
|  |                                                                                             |  |
|  | Key Strengths (JD Matches):                 Identified Gaps:                                |  |
|  | ✔ 6+ years experience (exceeds 4+ req)       ⚠ No explicit Kubernetes cluster admin          |  |
|  | ✔ Deep expertise in Python & React                                                          |  |
|  | ✔ Production LLM API integration                                                            |  |
|  +---------------------------------------------------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 🚀 Key Features

1. **Batch Multi-Format Parsing**:
   - Ingests multiple PDF (`PyPDF2`), DOCX (`docx2txt`), and plain text resumes in a single submission.
   - Individual corrupted or unreadable files are skipped and logged in an alert banner without terminating the remaining batch.

2. **Single Combined LLM Call**:
   - Performs extraction (candidate name, skills, experience summary, education) and scoring (1-10 fit score, justification, strengths, gaps) in **one structured LLM prompt** to minimize latency and token cost.
   - Strict output schema validation and JSON sanitization.

3. **Conservative Score Calibration**:
   - Scores 8, 9, and 10 are strictly reserved for strong, demonstrable matches.
   - Justifications are constrained to 2–3 concise sentences referencing concrete technologies and years of experience.

4. **Lightweight TinyDB Storage**:
   - Stores documents across `resumes`, `job_descriptions`, and `matches` tables.
   - Uses SHA-256 content hashing to deduplicate resumes and avoid re-parsing previously processed files.

5. **Re-Scoring Support**:
   - Re-evaluates an existing candidate against a new or updated Job Description without re-parsing raw files.

6. **Responsive Dashboard**:
   - Vanilla HTML5 / CSS3 / JavaScript interface (no external framework overhead).
   - Real-time search by name or skills, score filtering, and expandable candidate detail cards.

---

## 🛠 Tech Stack

- **Backend Framework**: Python 3.10+, Flask 3.0 (Modular Blueprints architecture)
- **Document Extractors**: PyPDF2 (PDF), docx2txt (DOCX/DOC)
- **Database**: TinyDB (Embedded JSON document store)
- **LLM Engine**: Google Gemini API (`gemini-3.7-flash`) via `@google/genai`
- **Testing**: Python `unittest` / `pytest`
- **Frontend**: Vanilla HTML5, CSS3 (Custom Design System), JavaScript (ES6+)

---

## 📁 Project Structure

```
smart-resume-screener/
├── server/
│   ├── __init__.py
│   ├── app.py                   # Flask Application Factory
│   ├── prompts.py               # Single combined prompt templates
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── upload_routes.py     # Resume & JD upload/screening endpoints
│   │   └── shortlist_routes.py  # Ranked shortlist & re-scoring endpoints
│   └── services/
│       ├── __init__.py
│       ├── resume_parser.py     # PyPDF2 / docx2txt text extraction & validation
│       ├── llm_service.py       # Single-call LLM execution with retry logic
│       └── storage_service.py   # TinyDB document CRUD & deduplication
├── static/
│   ├── index.html               # Main dashboard UI
│   ├── style.css                # Custom CSS design system
│   └── script.js                # Frontend API interactions & UI rendering
├── tests/
│   ├── __init__.py
│   └── test_resume_parser.py    # Unit tests for parser edge cases & corrupt files
├── data/
│   └── smart_screener_db.json   # TinyDB JSON storage
├── requirements.txt             # Pinned Python dependencies
├── package.json                 # Node/Express container config
└── README.md
```

---

## ⚙️ Setup & Installation

### Option 1: Running with Python & Flask

1. **Clone the repository and enter directory**:
   ```bash
   cd smart-resume-screener
   ```

2. **Create and activate a virtual environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate   # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set environment variables**:
   Create a `.env` file or export your Gemini API key:
   ```bash
   export GEMINI_API_KEY="your-gemini-api-key-here"
   export PORT=5000
   ```

5. **Start the Flask server**:
   ```bash
   python server/app.py
   ```
   Open your browser at `http://localhost:5000`.

---

### Option 2: Running with Node Dev Server (Google AI Studio Preview)

1. **Install Node dependencies**:
   ```bash
   npm install
   ```

2. **Start the server**:
   ```bash
   npm run dev
   ```
   The application will bind to `http://0.0.0.0:3000`.

---

## 🧪 Running Unit Tests

Run the test suite for resume parsing and error handling:

```bash
python3 -m unittest tests/test_resume_parser.py
```

Or using `pytest`:

```bash
pytest tests/
```

**Test Coverage**:
- `test_empty_file_raises_error`: Validates rejection of 0-byte files.
- `test_malformed_pdf_raises_error`: Validates handling of corrupted binary PDF streams.
- `test_unsupported_file_extension`: Validates rejection of unsupported extensions (e.g. `.exe`).
- `test_valid_text_extraction`: Verifies clean extraction of plain text resumes.
- `test_file_hash_computation`: Confirms SHA-256 consistency for deduplication.

---

## 🧠 LLM Prompt Architecture

The single combined prompt defined in `server/prompts.py` instructs the model to perform extraction and scoring in one execution while strictly outputting pure JSON:

```python
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
```

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload multiple resumes and evaluate against a Job Description |
| `GET` | `/api/shortlist/<job_id>` | Retrieve ranked candidates sorted by `match_score` descending |
| `GET` | `/api/jobs` | List all saved job screening sessions with candidate counts |
| `POST` | `/api/rescore` | Re-score an existing candidate resume against a JD without re-parsing |
| `POST` | `/api/sample-data` | Seed benchmark assessment data and candidates for quick testing |
| `GET` | `/api/health` | Service health and LLM API status check |

---

## 📄 License
Apache-2.0
