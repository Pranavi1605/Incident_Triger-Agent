import os, re, json, uuid, time, sqlite3, threading, datetime as dt
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chromadb
import json_repair
from crewai import Agent, Task, Crew, LLM

load_dotenv()
app = FastAPI(title="AI Incident Assistant")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ---------- storage (SQLite for incidents/approvals/audit, ChromaDB for knowledge) ----------
db = sqlite3.connect("incidents.db", check_same_thread=False)
db.execute("CREATE TABLE IF NOT EXISTS inc (id TEXT PRIMARY KEY, created TEXT, data TEXT)")
lock = threading.Lock()
col = chromadb.PersistentClient(path="./chroma_data").get_or_create_collection("runbooks")

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()

def recover_stuck_incidents():
    with lock:
        try:
            rows = db.execute("SELECT id, created, data FROM inc").fetchall()
            for id_val, created_val, data_str in rows:
                item = json.loads(data_str)
                if item.get("status") == "Investigating":
                    item["status"] = "Failed"
                    item["failure"] = "Investigation was interrupted or timed out. Please click Retry."
                    item["audit"].append({"ts": now(), "event": "Investigation recovered as interrupted."})
                    db.execute("REPLACE INTO inc VALUES (?,?,?)", (item["id"], item["created"], json.dumps(item)))
            db.commit()
        except Exception:
            pass

recover_stuck_incidents()

def save(i):
    with lock:
        db.execute("REPLACE INTO inc VALUES (?,?,?)", (i["id"], i["created"], json.dumps(i))); db.commit()
def load(id):
    r = db.execute("SELECT data FROM inc WHERE id=?", (id,)).fetchone()
    if not r: raise HTTPException(404, "Incident not found")
    return json.loads(r[0])

# ---------- CrewAI & LLM ----------
KEY = os.getenv("GEMINI_API_KEY")
PRIMARY = os.getenv("GEMINI_MODEL", "gemini/gemini-3.8-flash")
FALLBACK = os.getenv("GEMINI_FALLBACK_MODEL", "")
MODELS = [m for m in (PRIMARY, FALLBACK) if m]

# Initialize native Google GenAI client with thinking budget disabled for instant response
try:
    from google import genai
    from google.genai import types
    genai_client = genai.Client(api_key=KEY) if KEY else None
    thinking_cfg = types.ThinkingConfig(thinking_budget=0)
except Exception:
    genai_client = None
    types = None
    thinking_cfg = None

llms = {m: LLM(model=m, api_key=KEY, timeout=30) for m in MODELS}
TRANSIENT = ("503", "429", "unavailable", "overloaded", "high demand", "timeout", "timed out", "rate")
RULES = ("You are a careful IT incident specialist. You have NO access to live servers or logs: never claim "
         "to have run diagnostics. Label every cause as a hypothesis unless the user's text or a retrieved runbook supports it.")

def parse_json_from_llm(text: str) -> dict:
    if not text:
        raise ValueError("Empty response from AI")
    # 1. json_repair handles code fences, trailing commas, comments, unquoted keys, etc.
    try:
        data = json_repair.loads(text)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    # 2. Strip explicit markdown fences
    cleaned = re.sub(r"^```(?:json)?\s*", "", str(text).strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE).strip()
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    # 3. Search for outermost JSON object
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            data = json_repair.loads(match.group(0))
            if isinstance(data, dict):
                return data
        except Exception:
            pass
        return json.loads(match.group(0))
    raise ValueError(f"Could not parse valid JSON from AI output: {str(text)[:150]}")

# 429 that needs a brief wait (per-minute limit) vs one that needs skipping model (daily limit)
QUOTA_DAILY   = ("per day", "per_day", "requests per day", "perday")
QUOTA_MINUTE  = ("per minute", "per_minute", "requests per minute", "perminute")

def _retry_delay(err_str: str, default: float = 10.0) -> float:
    """Extract the suggested retry delay (seconds) from the error string."""
    m = re.search(r'retrydelay[^0-9]*(\d+(?:\.\d+)?)', err_str.lower())
    if m:
        return min(float(m.group(1)) + 1, 30)   # add 1s buffer, cap at 30s
    # Also check "please retry in Xs" phrasing
    m2 = re.search(r'retry in (\d+(?:\.\d+)?)s', err_str.lower())
    if m2:
        return min(float(m2.group(1)) + 1, 30)
    return default

def ask(role, prompt, attempts=3):
    """Call the LLM using native GenAI SDK (fastest path: thinking_budget=0 + JSON mode).
    - Per-MINUTE 429s  → wait the suggested delay, then retry the SAME model.
    - Per-DAY   429s   → skip immediately to the next model.
    - Transient 503s   → short backoff, then retry."""
    last = None
    system_prompt = (
        f"{RULES}\nYou are the {role}. "
        "Reply with ONLY one valid JSON object — no markdown, no explanation."
    )

    for model in MODELS:
        clean_model = model.replace("gemini/", "")
        skip_model  = False   # set True to break inner loop and go to next model

        # ── Fast path: native Google GenAI SDK (thinking_budget=0 → no thinking lag) ──
        if genai_client and types:
            for attempt in range(attempts):
                try:
                    cfg = types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        response_mime_type="application/json",
                        thinking_config=types.ThinkingConfig(thinking_budget=0),
                    )
                    res = genai_client.models.generate_content(
                        model=clean_model, contents=prompt, config=cfg,
                    )
                    if res.text:
                        return parse_json_from_llm(res.text)
                    break   # empty response → fall through to CrewAI
                except Exception as e:
                    last = e
                    err_str = str(e).lower()
                    if any(k in err_str for k in QUOTA_DAILY):
                        skip_model = True; break          # daily cap → next model
                    if any(k in err_str for k in QUOTA_MINUTE):
                        if attempt < attempts - 1:
                            wait = _retry_delay(err_str)
                            time.sleep(wait)              # wait and retry SAME model
                            continue
                        skip_model = True; break          # gave up after retries
                    if not any(k in err_str for k in TRANSIENT):
                        raise                             # unexpected error → surface
                    time.sleep(min(2 ** attempt, 8))      # 503 backoff

        if skip_model:
            continue   # outer loop → next model

        # ── Slow path: CrewAI LLM (fallback if native SDK hit a transient error) ──
        llm = llms.get(model)
        if not llm:
            continue
        for n in range(attempts):
            try:
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": prompt},
                ]
                out = None
                try:
                    out = llm.call(messages=messages)
                except Exception:
                    a   = Agent(role=role, goal=role, backstory=RULES, llm=llm, verbose=False)
                    t   = Task(description=prompt + "\nReply with ONLY one valid JSON object, no markdown.",
                               expected_output="JSON", agent=a)
                    out = Crew(agents=[a], tasks=[t], verbose=False).kickoff().raw
                if out:
                    return parse_json_from_llm(out)
            except Exception as e:
                last    = e
                err_str = str(e).lower()
                if any(k in err_str for k in QUOTA_DAILY):
                    break   # daily cap → try next model
                if any(k in err_str for k in QUOTA_MINUTE):
                    wait = _retry_delay(err_str)
                    time.sleep(wait); continue
                if not any(k in err_str for k in TRANSIENT) and not isinstance(e, (json.JSONDecodeError, ValueError)):
                    raise
                time.sleep(min(2 ** n, 5))

    raise RuntimeError(f"All models are unavailable right now. Please retry in a moment. ({last})")

def retrieve(q):
    if col.count() == 0: return []
    r = col.query(query_texts=[q], n_results=min(3, col.count()))
    return [{"title": m["title"], "excerpt": d[:400]} for d, m, x in
            zip(r["documents"][0], r["metadatas"][0], r["distances"][0]) if x < 1.3]

def step(i, n, status, data=None):
    i["steps"][n] = {"status": status, "data": data}; save(i)

def run(id):
    i = load(id)
    ctx = f"Title: {i['title']}\nDescription: {i['description']}\nService: {i['service'] or 'not given'}\nError: {i['error_message'] or 'none'}"
    try:
        step(i, "1", "running")
        s1 = ask("Incident Analyst", f"{ctx}\nReturn {{\"summary\":str,\"service\":str,\"category\":str,\"severity\":\"Low|Medium|High|Critical\",\"severity_reason\":str}}")
        i["severity"] = s1.get("severity", "Medium"); step(i, "1", "done", s1)
        step(i, "2", "running"); docs = retrieve(ctx); step(i, "2", "done", {"docs": docs})
        kb = "\n".join(f"[{d['title']}] {d['excerpt']}" for d in docs) or "NO RUNBOOK RETRIEVED."
        step(i, "3", "running")
        s3 = ask("Root Cause Investigator", f"{ctx}\nRunbook context:\n{kb}\nReturn {{\"causes\":[{{\"cause\":str,\"reasoning\":str,\"evidence\":\"text from the user's report or runbook that supports it, or empty string\"}}]}} (max 4)")
        step(i, "3", "done", s3)
        step(i, "4", "running")
        s4 = ask("Resolution Planner", f"{ctx}\nCauses: {json.dumps(s3)}\nRunbook context:\n{kb}\nReturn {{\"actions\":[{{\"step\":str,\"explanation\":str,\"risk\":str}}],\"approval\":{{\"required\":bool,\"action\":str,\"reason\":str,\"risk\":\"Low|Medium|High\"}}}}. Require approval only for actions that change systems (restart, rollback, config change).")
        s4["general"] = not docs; step(i, "4", "done", s4)
        ap = s4.get("approval") or {}
        if ap.get("required"): i["approval"] = {**ap, "status": "pending"}
        i["status"] = "Awaiting approval" if ap.get("required") else "Analyzed"
    except Exception as e:
        i["status"], i["failure"] = "Failed", str(e)
    i["audit"].append({"ts": now(), "event": f"Investigation finished: {i['status']}"}); save(i)

class New(BaseModel):
    title: str; description: str; service: str = ""; error_message: str = ""
class Decision(BaseModel):
    decision: str

@app.post("/api/incidents")
def create(b: New):
    if len(b.title.strip()) < 3 or len(b.description.strip()) < 10: raise HTTPException(422, "Please add a title and a fuller description.")
    i = {"id": uuid.uuid4().hex[:10], "created": now(), **b.model_dump(), "status": "Investigating", "severity": None,
         "steps": {}, "approval": None, "audit": [{"ts": now(), "event": "Incident submitted"}]}
    save(i); threading.Thread(target=run, args=(i["id"],), daemon=True).start(); return i
@app.get("/api/incidents")
def list_all():
    return [json.loads(r[0]) for r in db.execute("SELECT data FROM inc ORDER BY created DESC")]
@app.get("/api/incidents/{id}")
def get(id: str): return load(id)
@app.post("/api/incidents/{id}/retry")
def retry(id: str):
    i = load(id)
    if i["status"] not in ("Failed", "Investigating"): raise HTTPException(400, "Only failed or in-progress incidents can be retried")
    i.update(status="Investigating", steps={}, severity=None, approval=None); i.pop("failure", None)
    i["audit"].append({"ts": now(), "event": "Investigation retried"}); save(i)
    threading.Thread(target=run, args=(id,), daemon=True).start(); return i
@app.get("/api/approvals")
def approvals(): return [i for i in list_all() if i.get("approval") and i["approval"]["status"] == "pending"]
@app.post("/api/incidents/{id}/approval")
def decide(id: str, d: Decision):
    i = load(id)
    if not i.get("approval") or i["approval"]["status"] != "pending": raise HTTPException(400, "No pending approval")
    ok = d.decision == "approve"
    i["approval"]["status"] = "approved" if ok else "rejected"; i["status"] = "Resolved (simulated)" if ok else "Rejected"
    i["audit"].append({"ts": now(), "event": f"Action {'approved - simulated remediation only' if ok else 'rejected'}"})
    save(i); return i

# ---------- knowledge base ----------
def text_of(f: UploadFile, raw: bytes):
    if f.filename.lower().endswith(".pdf"):
        import io; from pypdf import PdfReader
        return "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(raw)).pages)
    return raw.decode("utf-8", "ignore")
@app.post("/api/documents")
async def upload(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".pdf", ".txt", ".md")): raise HTTPException(400, "Use PDF, TXT or Markdown files.")
    t = text_of(file, await file.read()).strip()
    if not t: raise HTTPException(400, "No readable text found in this file.")
    did = uuid.uuid4().hex[:10]; ch = [t[k:k + 800] for k in range(0, len(t), 700)]
    col.add(ids=[f"{did}-{k}" for k in range(len(ch))], documents=ch, metadatas=[{"doc_id": did, "title": file.filename}] * len(ch))
    return {"id": did, "title": file.filename, "chunks": len(ch)}
@app.get("/api/documents")
def docs(q: str = ""):
    if q and col.count():
        r = col.query(query_texts=[q], n_results=min(6, col.count())); seen = {}
        for d, m in zip(r["documents"][0], r["metadatas"][0]): seen.setdefault(m["doc_id"], {"id": m["doc_id"], "title": m["title"], "excerpt": d[:250]})
        return list(seen.values())
    seen = {}
    for m in col.get(include=["metadatas"])["metadatas"]:
        x = seen.setdefault(m["doc_id"], {"id": m["doc_id"], "title": m["title"], "chunks": 0}); x["chunks"] += 1
    return list(seen.values())
@app.delete("/api/documents/{id}")
def delete(id: str): col.delete(where={"doc_id": id}); return {"deleted": id}
