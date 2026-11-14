# AI Incident Assistant

## Run on Windows

Open two PowerShell terminals from the project folder.

### Backend

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Set `GEMINI_API_KEY` in `backend\.env` (see `.env.example`), then start the API:

```powershell
python -m uvicorn main:app --reload --port 8001
```

### Frontend

In the second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The frontend connects to the API on port 8001 by default. To use a different backend URL, set `VITE_API` in `frontend\.env.local`, including the `/api` suffix (for example `VITE_API=http://localhost:8000/api`).

## Changelog
- Backend now retries transient Gemini errors (503/429/timeouts) with backoff and can fall back to `GEMINI_FALLBACK_MODEL`.
- New `POST /api/incidents/{id}/retry` endpoint and a "Retry investigation" button for failed incidents.
