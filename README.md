# 🚨 AI Incident Assistant (`Incident_Triger-Agent`)

An intelligent, multi-agent IT incident investigation and response assistant. It ingests technical issue reports, queries internal runbooks via Retrieval-Augmented Generation (RAG), orchestrates specialized AI agents to uncover root causes, and recommends remediation plans with human-in-the-loop approval safeguards.

---

## 🌟 Key Features

- **Multi-Agent Investigation Pipeline**:
  - **Incident Analyst**: Classifies service category, extracts summaries, and evaluates severity levels (Low, Medium, High, Critical) with reasoning.
  - **Knowledge Retriever (RAG)**: Automatically searches uploaded runbooks in ChromaDB for matching procedures and known issues.
  - **Root Cause Investigator**: Differentiates between evidence-backed findings and hypotheses to determine the root issue.
  - **Resolution Planner**: Formulates prioritized action items and flags system-altering commands (restarts, rollbacks, config changes) for human approval.
- **RAG Knowledge Base**: Upload PDFs, TXT, and Markdown troubleshooting guides. Chunks and embeddings are indexed persistently using ChromaDB.
- **Human-in-the-Loop Safeguards**: High-risk actions require explicit human operator approval before execution (simulated remediation mode).
- **High Performance & Rate-Limit Resilience**:
  - Optimized low-latency AI calls with Gemini structured JSON mode (`thinking_budget=0`) completing investigations in seconds.
  - Intelligent rate-limit handling that automatically adapts to per-minute rate limits and fails over to secondary models (`gemini-3.5-flash`) on quota limits.
  - Fail-safe recovery that automatically restores interrupted or orphaned tasks if the server restarts.
- **Modern Responsive Dashboard**: Clean, responsive React UI with real-time step trackers, severity badges, incident search, and audit trails.

---

## 🏗️ Architecture

```
                      ┌──────────────────────┐
                      │   React + Vite UI    │
                      │  (Incident Portal)   │
                      └──────────┬───────────┘
                                 │ HTTP / REST
                                 ▼
                      ┌──────────────────────┐
                      │   FastAPI Backend    │
                      └─────┬──────────┬─────┘
                            │          │
         ┌──────────────────┘          └──────────────────┐
         ▼                                                ▼
┌──────────────────┐                            ┌──────────────────┐
│ ChromaDB (RAG)   │                            │ AI Agent Engine  │
│ Runbook Search   │                            │ (Google Gemini)  │
└──────────────────┘                            └────────┬─────────┘
         ▲                                               │
         │ Context Injection                             │
         └───────────────────────────────────────────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ 1. Incident Analyst   │
                     │ 2. Knowledge Retrieve │
                     │ 3. Root Cause Agent   │
                     │ 4. Resolution Planner │
                     └───────────────────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │ SQLite (incidents.db) │
                     │ Audit Log & Approvals │
                     └───────────────────────┘
```

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Lucide Icons, Modern CSS
- **Backend**: Python 3.11+, FastAPI, Uvicorn, Pydantic
- **AI & Agents**: Google Gemini API (`google-genai`), CrewAI
- **Vector Search / RAG**: ChromaDB, PyPDF
- **Storage**: SQLite (incidents, approvals, and audit trail)

---

## 📁 Project Structure

```text
proj/
├── backend/
│   ├── chroma_data/          # Persistent ChromaDB vector storage
│   ├── .env.example          # Environment variables template
│   ├── incidents.db          # SQLite database (incidents, audit, approvals)
│   ├── main.py               # FastAPI application, agent logic, & API routes
│   ├── requirements.txt      # Python dependencies
│   └── test_speed.py         # AI latency and fallback verification script
├── frontend/
│   ├── src/
│   │   ├── api.js            # Frontend API client
│   │   ├── App.jsx           # Main React application & pages
│   │   ├── main.jsx          # React entrypoint
│   │   └── styles.css        # Dashboard styling & responsive layout
│   ├── index.html            # HTML template
│   ├── package.json          # Node dependencies
│   └── vite.config.js        # Vite configuration
└── README.md                 # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites

- **Python**: 3.11 or higher
- **Node.js**: v18 or higher (with npm)
- **Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/)

---

### 1. Backend Setup

Open a terminal and navigate to `backend/`:

```powershell
cd backend

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1    # On Linux/macOS: source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Create your `.env` file based on `.env.example`:

```ini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini/gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini/gemini-3.5-flash
```

Start the FastAPI server:

```powershell
python -m uvicorn main:app --reload --port 8001
```

The backend API will be available at `http://localhost:8001`.

---

### 2. Frontend Setup

In a second terminal, navigate to `frontend/`:

```powershell
cd frontend

# Install Node modules
npm install

# Start Vite development server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🔄 The 4-Stage Investigation Pipeline

When an incident is reported, the backend runs an asynchronous investigation pipeline:

| Stage | Name | Description |
|---|---|---|
| **Step 1** | **Understanding the Problem** | Analyzes the symptom description, classifies the affected service, assigns incident category, and computes severity (Low / Medium / High / Critical). |
| **Step 2** | **Searching Relevant Knowledge** | Queries ChromaDB for semantic similarity against runbooks, past incident post-mortems, and troubleshooting guides. |
| **Step 3** | **Finding Possible Causes** | Correlates user descriptions with retrieved documentation excerpts, labeling hypotheses vs. evidence-backed root causes. |
| **Step 4** | **Recommending Solutions** | Generates prioritized remediation actions. If an action mutates production state (e.g. rollback, restart, config change), it creates a pending **Human Approval** ticket. |

---

## 📡 API Reference

### Incidents
- `POST /api/incidents`: Submit a new incident for investigation.
- `GET /api/incidents`: List all recorded incidents with severity and status.
- `GET /api/incidents/{id}`: Fetch detailed investigation steps and status for an incident.
- `POST /api/incidents/{id}/retry`: Re-trigger investigation for interrupted or failed incidents.

### Approvals
- `GET /api/approvals`: List all remediation actions waiting for operator decision.
- `POST /api/incidents/{id}/approval`: Approve or reject a proposed remediation plan.

### Knowledge Base (RAG)
- `POST /api/documents`: Upload `.pdf`, `.txt`, or `.md` files to be chunked and embedded in ChromaDB.
- `GET /api/documents?q={query}`: Search or list indexed runbook chunks.
- `DELETE /api/documents/{id}`: Delete a document from the vector store.
