/**
 * Smart Resume Screener - Frontend JavaScript
 * Handles resume uploads, job switcher, candidate shortlist rendering,
 * search/filter controls, expandable AI justifications, and candidate re-scoring.
 */

// Application State
const state = {
  currentJobId: null,
  jobs: [],
  candidates: [],
  selectedFiles: [],
  filterMinScore: 0,
  searchQuery: "",
  expandedCandidateIds: new Set()
};

// Sample Job Descriptions for quick-fill
const SAMPLE_JDS = {
  fullstack: {
    title: "Senior Full-Stack Engineer (Python & React)",
    description: `Job Title: Senior Full-Stack Engineer (Python & React)
Requirements:
- 4+ years of professional full-stack software development experience.
- Strong proficiency in Python with web frameworks like Flask, FastAPI, or Django.
- Solid experience building responsive frontend dashboards using React and TypeScript.
- Hands-on experience integrating LLM APIs (Gemini/OpenAI) and prompt engineering workflows.
- Practical experience with unit testing (Pytest), Git, and CI/CD.
- Bachelor's degree in Computer Science or equivalent practical experience.`
  },
  aiml: {
    title: "AI / LLM Systems Engineer",
    description: `Job Title: AI / LLM Systems Engineer
Requirements:
- 3+ years experience developing AI/ML applications and backend services in Python.
- Proven expertise with Generative AI models, prompt evaluation, function calling, and structured JSON output.
- Experience building scalable REST microservices with FastAPI or Flask.
- Familiarity with vector databases, embeddings, and RAG pipelines.
- Strong background in data validation, automated testing, and cloud deployments.`
  },
  dataeng: {
    title: "Lead Data & Backend Engineer",
    description: `Job Title: Lead Data & Backend Engineer
Requirements:
- 5+ years experience architecting data pipelines and high-throughput backend APIs.
- Expert knowledge of Python, SQL, PostgreSQL, and document/NoSQL stores.
- Strong proficiency in data ingestion, ETL processing, and schema design.
- Hands-on experience with containerization (Docker) and cloud infrastructure (GCP/AWS).
- Experience leading code reviews, data governance, and reliability engineering.`
  }
};

// DOM Elements
const elements = {
  uploadForm: document.getElementById("upload-form"),
  jobTitleInput: document.getElementById("job-title-input"),
  jobDescInput: document.getElementById("job-desc-input"),
  sampleJdSelect: document.getElementById("sample-jd-select"),
  jdCharCount: document.getElementById("jd-char-count"),
  dropzone: document.getElementById("dropzone"),
  resumeFileInput: document.getElementById("resume-file-input"),
  selectedFilesContainer: document.getElementById("selected-files-container"),
  selectedFilesCount: document.getElementById("selected-files-count"),
  selectedFilesList: document.getElementById("selected-files-list"),
  btnClearFiles: document.getElementById("btn-clear-files"),
  btnSubmit: document.getElementById("btn-submit-screening"),
  processingOverlay: document.getElementById("processing-overlay"),
  progressTitle: document.getElementById("progress-title"),
  progressDesc: document.getElementById("progress-desc"),
  failedBanner: document.getElementById("failed-files-banner"),
  failedList: document.getElementById("failed-files-list"),
  activeJobTitle: document.getElementById("active-job-title"),
  activeJobSubtitle: document.getElementById("active-job-subtitle"),
  candidateCountBadge: document.getElementById("candidate-count-badge"),
  jobSelector: document.getElementById("job-selector"),
  searchInput: document.getElementById("search-input"),
  scoreFilter: document.getElementById("score-filter"),
  btnExpandAll: document.getElementById("btn-expand-all"),
  btnCollapseAll: document.getElementById("btn-collapse-all"),
  candidateTableBody: document.getElementById("candidate-table-body"),
  btnSeedSample: document.getElementById("btn-seed-sample"),
  btnNewScreening: document.getElementById("btn-new-screening"),
  statHighMatches: document.getElementById("stat-high-matches"),
  statAvgScore: document.getElementById("stat-avg-score"),
  metricTotalBadge: document.getElementById("metric-total-badge")
};

// ==========================================
// Initialization
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  updateCharCount();
  fetchJobsList();
});

function setupEventListeners() {
  // Character count on JD input
  elements.jobDescInput.addEventListener("input", updateCharCount);

  // Sample JD preset selector
  elements.sampleJdSelect.addEventListener("change", (e) => {
    const key = e.target.value;
    if (key && SAMPLE_JDS[key]) {
      elements.jobTitleInput.value = SAMPLE_JDS[key].title;
      elements.jobDescInput.value = SAMPLE_JDS[key].description;
      updateCharCount();
    }
  });

  // Dropzone drag-and-drop
  ["dragenter", "dragover"].forEach(eventName => {
    elements.dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    elements.dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.dropzone.classList.remove("dragover");
    });
  });

  elements.dropzone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length > 0) {
      handleFilesSelected(dt.files);
    }
  });

  // File input change
  elements.resumeFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
    }
  });

  // Clear selected files
  elements.btnClearFiles.addEventListener("click", () => {
    state.selectedFiles = [];
    elements.resumeFileInput.value = "";
    renderSelectedFilesList();
  });

  // Upload & Screen Form Submission
  elements.uploadForm.addEventListener("submit", handleFormSubmit);

  // Job Switcher
  elements.jobSelector.addEventListener("change", (e) => {
    const selectedJobId = e.target.value;
    if (selectedJobId) {
      loadShortlistForJob(selectedJobId);
    }
  });

  // Search & Filter
  elements.searchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    renderCandidateTable();
  });

  elements.scoreFilter.addEventListener("change", (e) => {
    state.filterMinScore = parseInt(e.target.value, 10) || 0;
    renderCandidateTable();
  });

  // Expand / Collapse all
  elements.btnExpandAll.addEventListener("click", () => {
    state.candidates.forEach(c => state.expandedCandidateIds.add(c.match_id || c.resume_id));
    renderCandidateTable();
  });

  elements.btnCollapseAll.addEventListener("click", () => {
    state.expandedCandidateIds.clear();
    renderCandidateTable();
  });

  // Seed sample benchmark button
  elements.btnSeedSample.addEventListener("click", handleSeedSampleData);

  // New Screening quick scroll
  elements.btnNewScreening.addEventListener("click", () => {
    document.getElementById("screening-form-card").scrollIntoView({ behavior: "smooth" });
    elements.jobTitleInput.focus();
  });
}

function updateCharCount() {
  const len = elements.jobDescInput.value.length;
  elements.jdCharCount.textContent = `${len.toLocaleString()} characters`;
}

// ==========================================
// File Upload Handling
// ==========================================

function handleFilesSelected(fileList) {
  const newFiles = Array.from(fileList);
  // Add unique files by name
  for (const file of newFiles) {
    if (!state.selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
      state.selectedFiles.push(file);
    }
  }
  renderSelectedFilesList();
}

function removeFile(index) {
  state.selectedFiles.splice(index, 1);
  renderSelectedFilesList();
}

function renderSelectedFilesList() {
  if (state.selectedFiles.length === 0) {
    elements.selectedFilesContainer.style.display = "none";
    return;
  }

  elements.selectedFilesContainer.style.display = "block";
  elements.selectedFilesCount.textContent = `${state.selectedFiles.length} file${state.selectedFiles.length > 1 ? "s" : ""} selected`;
  elements.selectedFilesList.innerHTML = "";

  state.selectedFiles.forEach((file, index) => {
    const li = document.createElement("li");
    li.className = "file-item";
    const sizeKb = (file.size / 1024).toFixed(1);
    li.innerHTML = `
      <div class="file-item-info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <span class="file-item-name">${escapeHtml(file.name)}</span>
        <span class="file-item-size">(${sizeKb} KB)</span>
      </div>
      <button type="button" class="file-item-remove" onclick="removeFile(${index})" title="Remove file">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;
    elements.selectedFilesList.appendChild(li);
  });
}

// Make removeFile globally accessible
window.removeFile = removeFile;

// ==========================================
// Form Submission & API Calls
// ==========================================

async function handleFormSubmit(e) {
  e.preventDefault();

  const title = elements.jobTitleInput.value.trim();
  const description = elements.jobDescInput.value.trim();

  if (!description) {
    alert("Please enter a Job Description.");
    elements.jobDescInput.focus();
    return;
  }

  if (state.selectedFiles.length === 0) {
    alert("Please select or drop at least one candidate resume file (.pdf, .docx, .txt).");
    return;
  }

  // Prepare FormData
  const formData = new FormData();
  formData.append("job_title", title);
  formData.append("job_description", description);

  state.selectedFiles.forEach(file => {
    formData.append("resumes", file);
  });

  // Show processing progress overlay
  showLoading(true, `Processing ${state.selectedFiles.length} Resumes...`);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Upload failed with status ${response.status}`);
    }

    // Handle skipped/failed files banner
    if (data.failed_files && data.failed_files.length > 0) {
      elements.failedBanner.style.display = "flex";
      elements.failedList.innerHTML = data.failed_files.map(f => 
        `<li><strong>${escapeHtml(f.filename)}:</strong> ${escapeHtml(f.error)}</li>`
      ).join("");
    } else {
      elements.failedBanner.style.display = "none";
    }

    // Clear uploaded files state
    state.selectedFiles = [];
    elements.resumeFileInput.value = "";
    renderSelectedFilesList();

    // Refresh jobs and load new shortlist
    await fetchJobsList(data.job.job_id);

    // Scroll to shortlist
    document.getElementById("shortlist-section").scrollIntoView({ behavior: "smooth" });

  } catch (err) {
    console.error("Screening error:", err);
    alert(`Screening encountered an issue: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

async function handleSeedSampleData() {
  showLoading(true, "Loading Sample Benchmark Assessment Data...");
  try {
    const res = await fetch("/api/sample-data", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to seed sample data");

    elements.failedBanner.style.display = "none";
    await fetchJobsList(data.job.job_id);

    document.getElementById("shortlist-section").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error("Failed to load sample data:", err);
    alert(`Could not load sample data: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

async function fetchJobsList(selectJobId = null) {
  try {
    const res = await fetch("/api/jobs");
    if (!res.ok) return;
    const data = await res.json();
    state.jobs = data.jobs || [];

    // Populate Job Selector
    elements.jobSelector.innerHTML = "";
    if (state.jobs.length === 0) {
      elements.jobSelector.innerHTML = `<option value="">No screenings created yet</option>`;
      return;
    }

    state.jobs.forEach(job => {
      const opt = document.createElement("option");
      opt.value = job.job_id;
      opt.textContent = `${job.title} (${job.candidate_count || 0} candidates)`;
      elements.jobSelector.appendChild(opt);
    });

    // Select target job or default to first
    const targetJobId = selectJobId || (state.jobs.length > 0 ? state.jobs[0].job_id : null);
    if (targetJobId) {
      elements.jobSelector.value = targetJobId;
      await loadShortlistForJob(targetJobId);
    }
  } catch (err) {
    console.error("Error fetching jobs list:", err);
  }
}

async function loadShortlistForJob(jobId) {
  state.currentJobId = jobId;
  try {
    const res = await fetch(`/api/shortlist/${encodeURIComponent(jobId)}`);
    if (!res.ok) throw new Error(`Could not load shortlist: ${res.statusText}`);
    const data = await res.json();

    state.candidates = data.candidates || [];

    if (data.job) {
      elements.activeJobTitle.textContent = data.job.title;
      elements.activeJobSubtitle.textContent = `Target Requirements: ${data.job.description_text.slice(0, 140)}...`;
    }

    elements.candidateCountBadge.textContent = `${state.candidates.length} candidate${state.candidates.length !== 1 ? "s" : ""}`;

    // Update Bento Metrics
    updateBentoMetrics(state.candidates);

    renderCandidateTable();
  } catch (err) {
    console.error("Error loading shortlist:", err);
  }
}

function updateBentoMetrics(candidates) {
  const total = candidates.length;
  if (elements.metricTotalBadge) {
    elements.metricTotalBadge.textContent = total;
  }
  
  if (total === 0) {
    if (elements.statHighMatches) elements.statHighMatches.textContent = "0";
    if (elements.statAvgScore) elements.statAvgScore.textContent = "--";
    return;
  }

  const highMatches = candidates.filter(c => (c.match_score || 0) >= 8).length;
  const avgScore = (candidates.reduce((acc, c) => acc + (c.match_score || 0), 0) / total).toFixed(1);

  if (elements.statHighMatches) elements.statHighMatches.textContent = highMatches;
  if (elements.statAvgScore) elements.statAvgScore.textContent = avgScore;
}

// ==========================================
// Candidate Table Rendering
// ==========================================

function renderCandidateTable() {
  const tbody = elements.candidateTableBody;
  tbody.innerHTML = "";

  // Apply search & score filters
  const filtered = state.candidates.filter(c => {
    // Score filter
    if (c.match_score < state.filterMinScore) return false;

    // Search query filter
    if (state.searchQuery) {
      const name = (c.candidate_name || "").toLowerCase();
      const summary = (c.experience_summary || "").toLowerCase();
      const skills = (c.skills || []).map(s => String(s).toLowerCase()).join(" ");
      const matchesSearch = name.includes(state.searchQuery) ||
                            summary.includes(state.searchQuery) ||
                            skills.includes(state.searchQuery);
      if (!matchesSearch) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6" class="empty-cell">
          <div class="bento-empty-state">
            <div class="empty-icon-box">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <h3>No candidates match the filter criteria</h3>
            <p>Try lowering the minimum score or clearing the search query.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach((candidate, index) => {
    const rowId = candidate.match_id || candidate.resume_id || `cand_${index}`;
    const isExpanded = state.expandedCandidateIds.has(rowId);
    const score = candidate.match_score || 5;

    // Score badge style class
    let scoreClass = "score-low";
    if (score >= 9) scoreClass = "score-high";
    else if (score >= 8) scoreClass = "score-med";
    else if (score >= 6) scoreClass = "score-low";
    else scoreClass = "score-low";

    const formattedRank = String(index + 1).padStart(2, '0');

    // Main Candidate Row
    const tr = document.createElement("tr");
    tr.className = `candidate-row ${isExpanded ? "expanded" : ""}`;
    tr.id = `row-${rowId}`;
    tr.onclick = (e) => {
      // Don't trigger toggle if user clicked on a button or link inside
      if (e.target.closest("button") || e.target.closest("a")) return;
      toggleCandidateDetails(rowId);
    };

    const skillsHtml = (candidate.skills || []).slice(0, 3).map(skill => 
      `<span class="skill-chip">${escapeHtml(skill)}</span>`
    ).join("");

    const remainingSkillsCount = (candidate.skills || []).length - 3;
    const moreSkillsBadge = remainingSkillsCount > 0 
      ? `<span class="skill-chip font-bold">+${remainingSkillsCount}</span>` 
      : "";

    tr.innerHTML = `
      <td class="col-rank">#${formattedRank}</td>
      <td class="col-name">
        <div class="candidate-name">${escapeHtml(candidate.candidate_name || "Unknown Candidate")}</div>
        <div class="candidate-file">${escapeHtml(candidate.filename || "Resume Document")}</div>
      </td>
      <td class="col-score">
        <span class="score-badge ${scoreClass}">
          ${score}<span class="score-denominator">/10</span>
        </span>
      </td>
      <td class="col-summary">
        ${escapeHtml(candidate.experience_summary || "Experience details extracted from resume.")}
      </td>
      <td class="col-skills">
        <div class="skill-chips">
          ${skillsHtml}
          ${moreSkillsBadge}
        </div>
      </td>
      <td class="col-actions">
        <button class="expand-btn" type="button" onclick="toggleCandidateDetails('${rowId}')">
          <span>${isExpanded ? "Hide" : "Inspect"}</span>
          <svg class="expand-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);

    // Detail Expanded Row (Bento Dark Evaluation Drawer)
    if (isExpanded) {
      const detailTr = document.createElement("tr");
      detailTr.className = "detail-row";
      detailTr.id = `detail-${rowId}`;

      const strengthsList = (candidate.strengths || []).map(str => 
        `<span class="tag-strength">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
          ${escapeHtml(str)}
        </span>`
      ).join("") || `<span class="tag-strength">Demonstrated core competencies matching role profile.</span>`;

      const gapsList = (candidate.gaps || []).map(gap => 
        `<span class="tag-gap">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          ${escapeHtml(gap)}
        </span>`
      ).join("") || `<span class="tag-gap">No critical disqualifying gaps identified.</span>`;

      const allSkillsChips = (candidate.skills || []).map(skill => 
        `<span class="skill-chip">${escapeHtml(skill)}</span>`
      ).join("");

      const educationHtml = (candidate.education || []).map(edu => 
        `<strong>• ${escapeHtml(edu)}</strong>`
      ).join(" ");

      detailTr.innerHTML = `
        <td colspan="6">
          <div class="bento-inspection-panel">
            
            <div class="inspection-header">
              <span class="inspection-title">LLM Analysis & Justification</span>
              <span class="inspection-meta">CANDIDATE_ID: ${escapeHtml(candidate.resume_id || rowId)}</span>
            </div>

            <!-- AI Justification Quote Box -->
            <div class="inspection-justification">
              "${escapeHtml(candidate.justification || "Candidate matches role requirements.")}"
            </div>

            <!-- Strengths vs Gaps Breakdown -->
            <div class="inspection-grid">
              <div class="inspection-card">
                <div class="inspection-section-title-strengths">Demonstrated Strengths</div>
                <div class="inspection-tags">
                  ${strengthsList}
                </div>
              </div>

              <div class="inspection-card">
                <div class="inspection-section-title-gaps">Identified Gaps & Missing Reqs</div>
                <div class="inspection-tags">
                  ${gapsList}
                </div>
              </div>
            </div>

            <!-- Extracted Skills Micro List -->
            <div>
              <div class="inspection-title" style="margin-bottom: 6px;">All Extracted Skills</div>
              <div class="skill-chips">
                ${allSkillsChips}
              </div>
            </div>

            <!-- Bottom Row: Education and Re-score Action -->
            <div class="inspection-footer">
              <div class="inspection-education">
                Education: ${educationHtml || "<strong>Not explicitly stated</strong>"}
              </div>
              <button class="bento-btn-rescore" type="button" onclick="handleRescoreCandidate('${candidate.resume_id}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                Re-Evaluate Against Current JD
              </button>
            </div>

          </div>
        </td>
      `;
      tbody.appendChild(detailTr);
    }
  });
}

function toggleCandidateDetails(rowId) {
  if (state.expandedCandidateIds.has(rowId)) {
    state.expandedCandidateIds.delete(rowId);
  } else {
    state.expandedCandidateIds.add(rowId);
  }
  renderCandidateTable();
}

window.toggleCandidateDetails = toggleCandidateDetails;

// ==========================================
// Candidate Re-scoring
// ==========================================

async function handleRescoreCandidate(resumeId) {
  if (!state.currentJobId || !resumeId) return;

  showLoading(true, "Re-scoring candidate without re-parsing raw file...");
  try {
    const res = await fetch("/api/rescore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: state.currentJobId,
        resume_id: resumeId
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Re-scoring failed");

    state.candidates = data.candidates || [];
    renderCandidateTable();
  } catch (err) {
    console.error("Re-scoring error:", err);
    alert(`Re-scoring failed: ${err.message}`);
  } finally {
    showLoading(false);
  }
}

window.handleRescoreCandidate = handleRescoreCandidate;

// ==========================================
// Utilities
// ==========================================

function showLoading(show, title = "Processing...", desc = "") {
  elements.processingOverlay.style.display = show ? "flex" : "none";
  if (title) elements.progressTitle.textContent = title;
  if (desc) elements.progressDesc.textContent = desc;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
