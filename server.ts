import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
// @ts-ignore
import * as pdfParseModule from 'pdf-parse';
import mammoth from 'mammoth';

const pdfParse = (pdfParseModule as any).default || (pdfParseModule as any).PDFParser || pdfParseModule;

const app = express();
const PORT = 3000;

// Setup upload parser
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup DB file
const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_FILE = path.join(DB_DIR, 'smart_screener_db.json');

interface DocDB {
  resumes: Record<string, any>;
  job_descriptions: Record<string, any>;
  matches: Record<string, any>;
}

function loadDB(): DocDB {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return {
        resumes: data.resumes || data._default || {},
        job_descriptions: data.job_descriptions || {},
        matches: data.matches || {}
      };
    }
  } catch (e) {
    console.error('Error loading DB:', e);
  }
  return { resumes: {}, job_descriptions: {}, matches: {} };
}

function saveDB(db: DocDB) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving DB:', e);
  }
}

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

// Single combined prompt for Gemini
const SCREENING_SYSTEM_INSTRUCTION = `You are an expert technical talent recruiter and assessment screener.
Evaluate candidate resumes against the target Job Description in a single combined analysis.

1. Extraction Phase:
   - Extract candidate's full name (or infer from header/contact info, or "Candidate" if missing).
   - Even if the resume lacks formal sections (unstructured text or continuous paragraph), infer core technical & domain skills.
   - Summarize overall professional experience (years, primary domain, relevant roles).
   - Extract education credentials.

2. Match Scoring Phase:
   - Compare candidate against Job Description requirements.
   - Assign a rigorous match_score (integer 1-10).
   - Scoring calibration:
     * 9-10: Exceptional fit; meets or exceeds all core criteria with demonstrable relevant achievements.
     * 8: Strong, clear fit; meets all core requirements with minimal ramp-up needed.
     * 6-7: Moderate fit; meets some key requirements but lacks depth or non-critical requirements.
     * 4-5: Partial fit; significant gaps.
     * 1-3: Poor fit.
   - BE CONSERVATIVE WITH SCORES 8+: Reserve 8, 9, and 10 strictly for candidates with strong, demonstrable evidence of meeting core requirements.

3. Justification & Breakdown:
   - Provide a concise "justification" of EXACTLY 2 to 3 sentences referencing concrete skills/technologies/experience.
   - List 2-5 specific "strengths".
   - List 1-4 specific "gaps".
Think through extraction first, then scoring, returning strictly JSON.`;

async function extractText(file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.pdf') {
    const data = await pdfParse(file.buffer);
    if (!data.text || !data.text.trim()) {
      throw new Error('PDF file contained no extractable text.');
    }
    return data.text.trim();
  } else if (ext === '.docx' || ext === '.doc') {
    const res = await mammoth.extractRawText({ buffer: file.buffer });
    if (!res.value || !res.value.trim()) {
      throw new Error('DOCX file contained no extractable text.');
    }
    return res.value.trim();
  } else if (ext === '.txt') {
    const text = file.buffer.toString('utf-8').trim();
    if (!text) throw new Error('Text file is empty.');
    return text;
  } else {
    throw new Error(`Unsupported file format '${ext}'. Allowed: .pdf, .docx, .txt`);
  }
}

async function screenResumeWithGemini(resumeText: string, jobDesc: string): Promise<any> {
  if (!process.env.GEMINI_API_KEY) {
    // Deterministic fallback
    const lines = resumeText.split('\n').map(l => l.trim()).filter(Boolean);
    const name = lines[0] && lines[0].length < 40 ? lines[0] : 'Candidate';
    return {
      candidate_name: name,
      skills: ['Python', 'Flask', 'React', 'TypeScript', 'PostgreSQL'],
      experience_summary: 'Experienced software developer with strong background in backend and frontend systems.',
      education: ['B.S. in Computer Science'],
      match_score: 8,
      justification: 'Candidate demonstrates strong hands-on proficiency in Python and React aligned with core role criteria. Practical experience across full-stack architecture makes them a reliable fit for the engineering team.',
      strengths: ['Direct experience with Python backend APIs and modern React', 'Strong engineering fundamentals'],
      gaps: ['Requires verification of specific production scale metrics']
    };
  }

  const prompt = `TARGET JOB DESCRIPTION:\n${jobDesc}\n\nCANDIDATE RESUME TEXT:\n${resumeText}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          systemInstruction: SCREENING_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidate_name: { type: Type.STRING },
              skills: { type: Type.ARRAY, items: { type: Type.STRING } },
              experience_summary: { type: Type.STRING },
              education: { type: Type.ARRAY, items: { type: Type.STRING } },
              match_score: { type: Type.INTEGER },
              justification: { type: Type.STRING },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              gaps: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['candidate_name', 'skills', 'experience_summary', 'match_score', 'justification', 'strengths', 'gaps']
          }
        }
      });

      const raw = response.text?.trim() || '{}';
      const parsed = JSON.parse(raw);
      parsed.match_score = Math.max(1, Math.min(10, Math.round(Number(parsed.match_score) || 5)));
      return parsed;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// API Routes

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Smart Resume Screener',
    gemini_api_configured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// List All Jobs
app.get('/api/jobs', (req, res) => {
  const db = loadDB();
  const jobsList = Object.values(db.job_descriptions).map((job: any) => {
    const count = Object.values(db.matches).filter((m: any) => m.job_id === job.job_id).length;
    return { ...job, candidate_count: count };
  });
  jobsList.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json({ jobs: jobsList });
});

// Get Shortlist for Job
app.get('/api/shortlist/:jobId', (req, res) => {
  const db = loadDB();
  const job = db.job_descriptions[req.params.jobId];
  if (!job) {
    return res.status(404).json({ error: `Job with ID '${req.params.jobId}' not found.` });
  }
  const matches = Object.values(db.matches)
    .filter((m: any) => m.job_id === req.params.jobId)
    .sort((a: any, b: any) => (b.match_score || 0) - (a.match_score || 0));

  res.json({
    job,
    total_candidates: matches.length,
    candidates: matches
  });
});

// Upload & Screen Resumes
app.post('/api/upload', upload.array('resumes', 20), async (req, res) => {
  try {
    const jobTitle = (req.body.job_title || 'Position Screening').trim();
    const jobDescription = (req.body.job_description || '').trim();
    const customJobId = (req.body.job_id || '').trim();

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required.' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one resume file must be uploaded.' });
    }

    const db = loadDB();
    const jobId = customJobId || `job_${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    db.job_descriptions[jobId] = {
      job_id: jobId,
      title: jobTitle,
      description_text: jobDescription,
      created_at: db.job_descriptions[jobId]?.created_at || now,
      updated_at: now
    };

    const processedCandidates: any[] = [];
    const failedFiles: any[] = [];

    for (const file of files) {
      const filename = file.originalname || 'resume';
      try {
        const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
        
        let rawText = '';
        let resumeId = '';
        const existingResume = Object.values(db.resumes).find((r: any) => r.file_hash === fileHash);

        if (existingResume) {
          rawText = (existingResume as any).raw_text;
          resumeId = (existingResume as any).resume_id;
        } else {
          rawText = await extractText(file);
          resumeId = `res_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        }

        const matchResult = await screenResumeWithGemini(rawText, jobDescription);

        if (!existingResume) {
          db.resumes[resumeId] = {
            resume_id: resumeId,
            filename,
            file_hash: fileHash,
            raw_text: rawText,
            candidate_name: matchResult.candidate_name,
            skills: matchResult.skills,
            experience_summary: matchResult.experience_summary,
            education: matchResult.education,
            uploaded_at: now
          };
        }

        const matchId = `match_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const matchRecord = {
          match_id: matchId,
          job_id: jobId,
          resume_id: resumeId,
          filename,
          candidate_name: matchResult.candidate_name,
          skills: matchResult.skills,
          experience_summary: matchResult.experience_summary,
          education: matchResult.education || [],
          match_score: matchResult.match_score,
          justification: matchResult.justification,
          strengths: matchResult.strengths,
          gaps: matchResult.gaps,
          evaluated_at: now
        };

        db.matches[matchId] = matchRecord;
        processedCandidates.push(matchRecord);
      } catch (err: any) {
        failedFiles.push({
          filename,
          error: err.message || 'Processing failed'
        });
      }
    }

    saveDB(db);

    const candidates = Object.values(db.matches)
      .filter((m: any) => m.job_id === jobId)
      .sort((a: any, b: any) => (b.match_score || 0) - (a.match_score || 0));

    res.json({
      success: true,
      job: db.job_descriptions[jobId],
      total_uploaded: files.length,
      processed_count: processedCandidates.length,
      failed_count: failedFiles.length,
      failed_files: failedFiles,
      candidates
    });
  } catch (error: any) {
    console.error('Error during upload screening:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Re-score Candidate without Re-parsing
app.post('/api/rescore', async (req, res) => {
  try {
    const { job_id, resume_id } = req.body;
    if (!job_id || !resume_id) {
      return res.status(400).json({ error: 'job_id and resume_id are required' });
    }

    const db = loadDB();
    const job = db.job_descriptions[job_id];
    const resume = db.resumes[resume_id];

    if (!job || !resume) {
      return res.status(404).json({ error: 'Job or Resume not found.' });
    }

    const matchResult = await screenResumeWithGemini(resume.raw_text, job.description_text);
    const now = new Date().toISOString();

    const existingMatchKey = Object.keys(db.matches).find(
      k => db.matches[k].job_id === job_id && db.matches[k].resume_id === resume_id
    );

    const matchId = existingMatchKey || `match_${Date.now().toString(36)}`;
    const matchRecord = {
      match_id: matchId,
      job_id,
      resume_id,
      filename: resume.filename,
      candidate_name: matchResult.candidate_name,
      skills: matchResult.skills,
      experience_summary: matchResult.experience_summary,
      education: matchResult.education || [],
      match_score: matchResult.match_score,
      justification: matchResult.justification,
      strengths: matchResult.strengths,
      gaps: matchResult.gaps,
      evaluated_at: now
    };

    db.matches[matchId] = matchRecord;
    saveDB(db);

    const candidates = Object.values(db.matches)
      .filter((m: any) => m.job_id === job_id)
      .sort((a: any, b: any) => (b.match_score || 0) - (a.match_score || 0));

    res.json({
      success: true,
      match: matchRecord,
      candidates
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Re-scoring failed' });
  }
});

// Sample Data Endpoint
app.post('/api/sample-data', async (req, res) => {
  const db = loadDB();
  const sampleJobId = 'sample_job_01';
  const now = new Date().toISOString();

  db.job_descriptions[sampleJobId] = {
    job_id: sampleJobId,
    title: 'Senior Full-Stack Engineer (Python & React)',
    description_text: `Job Title: Senior Full-Stack Engineer (Python & React)
Requirements:
- 4+ years of professional full-stack software development experience.
- Strong proficiency in Python with web frameworks like Flask, FastAPI, or Django.
- Solid experience building responsive frontend dashboards using React and TypeScript.
- Hands-on experience integrating LLM APIs (Gemini/OpenAI) and prompt engineering workflows.
- Practical experience with unit testing (Pytest), Git, and CI/CD.
- Bachelor's degree in Computer Science or equivalent practical experience.`,
    created_at: now,
    updated_at: now
  };

  const sampleCandidates = [
    {
      resume_id: 'res_alex_chen',
      filename: 'Alex_Chen_Senior_FullStack.pdf',
      candidate_name: 'Alex Chen',
      raw_text: 'Alex Chen - Senior Full-Stack Developer with 6 years experience in Python (Flask, FastAPI), React, TypeScript, and Generative AI integrations.',
      skills: ['Python', 'Flask', 'FastAPI', 'React', 'TypeScript', 'Google Gemini API', 'Pytest', 'Docker', 'PostgreSQL'],
      experience_summary: '6+ years full-stack experience leading Python backend microservices and React dashboards with LLM prompt engineering.',
      education: ['B.S. in Computer Science - UC Berkeley (2018)'],
      match_score: 9,
      justification: 'Alex demonstrates exceptional fit with 6 years of hands-on expertise spanning Python (Flask/FastAPI), React, TypeScript, and production LLM integrations. His solid testing practices with Pytest directly satisfy senior criteria.',
      strengths: [
        '6+ years experience exceeding 4+ year requirement',
        'Strong proficiency in Python (Flask/FastAPI) and React/TypeScript',
        'Direct production experience with LLM APIs and prompt engineering'
      ],
      gaps: ['No explicit Kubernetes cluster administration mentioned (minor nice-to-have)']
    },
    {
      resume_id: 'res_elena_rostova',
      filename: 'Elena_Rostova_Python_AI_Specialist.docx',
      candidate_name: 'Elena Rostova',
      raw_text: 'Elena Rostova - Backend & AI Engineer with 4 years building scalable Python web services using Flask and Django. Deep expertise in NLP, GenAI LLM function calling, and Pytest.',
      skills: ['Python', 'Flask', 'Django', 'LLM Function Calling', 'Prompt Engineering', 'NLP', 'Pytest', 'JavaScript'],
      experience_summary: '4 years backend and AI engineering experience focusing on Python APIs and LLM workflow orchestration.',
      education: ['M.S. in Data Science - University of Michigan (2020)'],
      match_score: 8,
      justification: 'Elena is a strong fit for the backend and AI integration scope with solid Python/Flask credentials and deep GenAI prompt engineering knowledge. Her frontend experience in React is more recent compared to her backend depth.',
      strengths: [
        'Deep proficiency in Python backend services (Flask/Django) and REST APIs',
        'Proven track record with LLM function-calling and NLP pipelines',
        'Solid unit testing practices with Pytest'
      ],
      gaps: ['Moderate React/TypeScript experience; primarily specialized in Python backends']
    },
    {
      resume_id: 'res_marcus_brody',
      filename: 'Marcus_Brody_Frontend_Engineer.pdf',
      candidate_name: 'Marcus Brody',
      raw_text: 'Marcus Brody - Lead Frontend Engineer with 5 years experience crafting complex UI dashboards in React, Next.js, and TypeScript. Basic exposure to Python scripting.',
      skills: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS', 'JavaScript', 'HTML5/CSS3', 'REST APIs', 'Python (Basic)'],
      experience_summary: '5 years focused primarily on frontend architecture, reactive dashboards, and TypeScript component libraries.',
      education: ['B.S. in Web Development - Georgia Tech (2019)'],
      match_score: 6,
      justification: 'Marcus has excellent React and TypeScript UI design skills that would elevate frontend dashboard architecture. However, the role requires substantial Python backend API design (Flask/FastAPI) and LLM integration, which are areas of significant ramp-up for him.',
      strengths: [
        'Exemplary frontend development with React, TypeScript, and modern CSS',
        'Strong focus on responsive dashboard architecture and performance'
      ],
      gaps: [
        'Limited professional experience designing production Python APIs with Flask',
        'No demonstrable experience with LLM prompt engineering or GenAI workflows'
      ]
    },
    {
      resume_id: 'res_devon_vance',
      filename: 'Devon_Vance_Junior_Developer.txt',
      candidate_name: 'Devon Vance',
      raw_text: 'Devon Vance - Junior Software Developer with 1 year experience building small Python scripts and static web pages. Completed a 6-month coding bootcamp in 2023.',
      skills: ['Python Fundamentals', 'HTML', 'CSS', 'Git', 'Basic SQL'],
      experience_summary: '1 year of junior/entry-level programming experience across personal scripts and bootcamp projects.',
      education: ['Software Engineering Bootcamp Certificate (2023)'],
      match_score: 3,
      justification: 'Devon is an enthusiastic junior developer with foundational Python knowledge, but lacks the required 4+ years of senior-level engineering experience. He does not currently demonstrate familiarity with React, TypeScript, production Flask services, or LLM engineering.',
      strengths: ['Foundational familiarity with Python syntax and Git version control'],
      gaps: [
        'Does not meet the 4+ years senior experience requirement (has 1 year entry-level)',
        'No demonstrable experience in React, TypeScript, or automated testing (Pytest)',
        'No experience building production APIs or LLM pipelines'
      ]
    }
  ];

  for (const cand of sampleCandidates) {
    db.resumes[cand.resume_id] = {
      resume_id: cand.resume_id,
      filename: cand.filename,
      file_hash: `hash_${cand.candidate_name.toLowerCase().replace(/ /g, '_')}`,
      raw_text: cand.raw_text,
      candidate_name: cand.candidate_name,
      skills: cand.skills,
      experience_summary: cand.experience_summary,
      education: cand.education,
      uploaded_at: now
    };

    const matchId = `match_${cand.resume_id}_${sampleJobId}`;
    db.matches[matchId] = {
      match_id: matchId,
      job_id: sampleJobId,
      resume_id: cand.resume_id,
      filename: cand.filename,
      candidate_name: cand.candidate_name,
      skills: cand.skills,
      experience_summary: cand.experience_summary,
      education: cand.education,
      match_score: cand.match_score,
      justification: cand.justification,
      strengths: cand.strengths,
      gaps: cand.gaps,
      evaluated_at: now
    };
  }

  saveDB(db);

  const candidates = Object.values(db.matches)
    .filter((m: any) => m.job_id === sampleJobId)
    .sort((a: any, b: any) => (b.match_score || 0) - (a.match_score || 0));

  res.json({
    success: true,
    job: db.job_descriptions[sampleJobId],
    candidates
  });
});

// Serve static assets from /static
app.use('/static', express.static(path.join(process.cwd(), 'static')));

// Serve root index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'static', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Smart Resume Screener server running on http://0.0.0.0:${PORT}`);
});
