import { useState, useEffect, useCallback } from "react";
import { House, PlusCircle, FolderOpen, BookOpen, ShieldCheck, Compass, Menu, Search, Upload, Trash2, Check, X, Loader2, Sparkles, FileText, MessageSquareText, Lightbulb, ArrowRight } from "lucide-react";
import { api } from "./api";

const NAV = [["home", "Home", House], ["new", "New Incident", PlusCircle], ["list", "My Incidents", FolderOpen], ["kb", "Knowledge Base", BookOpen], ["approvals", "Approvals", ShieldCheck], ["how", "How It Works", Compass]];
const fmt = d => new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const Empty = ({ icon: I, title, text, action }) => (
  <div className="card empty"><div className="icon"><I /></div><h2>{title}</h2><p className="mut" style={{ margin: "6px 0 18px" }}>{text}</p>{action}</div>);

export default function App() {
  const [page, setPage] = useState({ name: "home" }); const [open, setOpen] = useState(false);
  const go = (name, id) => { setPage({ name, id }); setOpen(false); window.scrollTo(0, 0); };
  const P = page.name;
  return (<>
    <button className="menu" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
    <aside className={"side" + (open ? " open" : "")}>
      <div className="brand"><div className="logo"><Sparkles size={20} /></div><div><b>AI Incident Assistant</b><small>Intelligent Problem Investigation</small></div></div>
      {NAV.map(([k, l, I]) => <button key={k} className={"nav" + (P === k || (P === "result" && k === "list") ? " on" : "")} onClick={() => go(k)}><I size={19} />{l}</button>)}
    </aside>
    <main><div className="wrap" key={P + (page.id || "")}>
      {P === "home" && <HomePage go={go} />}{P === "new" && <NewPage go={go} />}{P === "list" && <ListPage go={go} />}
      {P === "result" && <ResultPage id={page.id} go={go} />}{P === "kb" && <KBPage />}{P === "approvals" && <ApprovalsPage go={go} />}{P === "how" && <HowPage />}
    </div></main></>);
}

function HomePage({ go }) {
  const cards = [[MessageSquareText, "Describe the Problem", "Tell us what went wrong in simple words."], [Search, "AI Investigates", "Specialized AI agents analyze the issue and search relevant knowledge."], [Lightbulb, "Get Clear Solutions", "Understand possible causes, suggested actions, and whether approval is needed."]];
  return (<div className="stack" style={{ gap: 36 }}>
    <div style={{ padding: "24px 0 8px", maxWidth: 680 }}><h1>Every problem has a solution. <span style={{ color: "var(--pri)" }}>Let's find yours.</span></h1>
      <p className="mut" style={{ fontSize: "1.1rem", margin: "20px 0 28px" }}>Describe a technical issue, and our AI agents will investigate the problem, search relevant troubleshooting knowledge, and recommend what to do next.</p>
      <button className="btn" onClick={() => go("new")}>Start an Investigation <ArrowRight size={18} /></button></div>
    <div className="grid">{cards.map(([I, t, d], n) => <div className="card" key={t}><div className={"icon" + (n === 1 ? " g" : "")}><I /></div><h3>{t}</h3><p className="mut" style={{ marginTop: 6 }}>{d}</p></div>)}</div></div>);
}

function NewPage({ go }) {
  const [f, setF] = useState({ title: "", description: "", service: "", error_message: "" }); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault();
    if (f.title.trim().length < 3) return setErr("Please give your problem a short title.");
    if (f.description.trim().length < 20) return setErr("Please describe the problem in a little more detail (at least a sentence or two).");
    setBusy(true); setErr("");
    try { const i = await api.create(f); go("result", i.id); } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (<form className="stack" onSubmit={submit}>
    <div><h1>What seems to be the problem?</h1><p className="mut" style={{ marginTop: 12 }}>Tell us what happened. You don't need technical expertise — just describe the issue you're experiencing.</p></div>
    <div className="card stack">
      <div><label>Problem Title</label><input value={f.title} onChange={set("title")} placeholder="Give your problem a short title..." /></div>
      <div><label>Describe Your Problem</label><textarea value={f.description} onChange={set("description")} placeholder="What were you trying to do? What stopped working? Did you notice any errors?" /></div>
      <div className="grid"><div><label>Affected Service <span className="mut">(Optional)</span></label><input value={f.service} onChange={set("service")} placeholder="Which application or service is affected?" /></div>
        <div><label>Error Message <span className="mut">(Optional)</span></label><input value={f.error_message} onChange={set("error_message")} placeholder="Paste the error message, if any..." /></div></div>
      {err && <div className="err">{err}</div>}
      <div><button className="btn" disabled={busy}>{busy ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />} Analyze My Problem</button></div></div></form>);
}

const STEPS = [["Understanding the Problem", "Our AI is analyzing your description to identify the issue, affected service, and severity."], ["Searching Relevant Knowledge", "Our AI is searching troubleshooting documents for information related to your problem."], ["Finding Possible Causes", "Our AI is evaluating possible causes based on your description and available evidence."], ["Recommending Solutions", "Our AI is preparing troubleshooting steps and determining whether human approval is required."]];
const Sev = ({ s }) => <span className={"chip " + s}>{s}</span>;
const Docs = ({ d }) => !d?.docs?.length ? <div className="note">No relevant runbook was found in your knowledge base.</div> : d.docs.map((x, i) => <div className="doc" key={i}><h3>{x.title}</h3><p>"{x.excerpt}…"</p></div>);
const Causes = ({ d }) => (d?.causes || []).map((c, i) => <div key={i} style={{ marginTop: 12 }}><div className="row" style={{ gap: 8 }}><h3>{c.cause}</h3><span className={"chip " + (c.evidence ? "approved" : "pending")}>{c.evidence ? "Supported by evidence" : "Hypothesis"}</span></div>
  <p className="mut">{c.reasoning}</p>{c.evidence && <p style={{ fontSize: ".9rem" }}>Evidence: <i>{c.evidence}</i></p>}</div>);
const Actions = ({ d }) => <ol className="a">{(d?.actions || []).map((a, i) => <li key={i}><h3>{a.step}</h3><p className="mut">{a.explanation}</p>{a.risk && <p style={{ fontSize: ".88rem", color: "#9a6a1f" }}>Risk: {a.risk}</p>}</li>)}</ol>;

function ApprovalBox({ inc, onDone }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const a = inc.approval;
  const act = async d => { setBusy(true); try { await api.decide(inc.id, d); onDone(); } catch (e) { setErr(e.message); setBusy(false); } };
  return (<div className="stack" style={{ gap: 12 }}>
    <div><span className="chip" style={{ marginRight: 8 }}>Proposed action</span><b>{a.action}</b></div>
    <p><b>Why approval is needed:</b> <span className="mut">{a.reason}</span></p><div>Risk level: <Sev s={a.risk || "Medium"} /></div>
    <div className="note">Approving authorizes a <b>simulated</b> remediation action only. No real production infrastructure will be changed.</div>
    {err && <div className="err">{err}</div>}
    <div className="row"><button className="btn sage" disabled={busy} onClick={() => act("approve")}><Check size={17} />Approve</button><button className="btn ghost" disabled={busy} onClick={() => act("reject")}><X size={17} />Reject</button></div></div>);
}

function ResultPage({ id, go }) {
  const [inc, setInc] = useState(null); const [err, setErr] = useState("");
  const load = useCallback(() => api.get(id).then(setInc).catch(e => setErr(e.message)), [id]);
  const running = !inc || inc.status === "Investigating";
  useEffect(() => { load(); if (!running) return; const t = setInterval(load, 1500); return () => clearInterval(t); }, [load, running]);
  if (err) return <div className="err">{err}</div>; if (!inc) return <p className="mut">Loading…</p>;
  const S = n => inc.steps[n] || { status: "pending" }; const s1 = S("1").data, s4 = S("4").data;
  return (<div className="stack">
    <div><h1>{running ? "Investigating your problem…" : inc.status === "Failed" ? "We couldn't finish the investigation." : "Here's what we found."}</h1><p className="mut" style={{ marginTop: 10 }}>{inc.title}</p></div>
    {(running || inc.status === "Failed") && <div className="card">{STEPS.map(([t, d], i) => { const st = S(String(i + 1)); const dn = st.status === "done";
      return (<div className="st" key={t}><div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><div className={"dot " + st.status}>{dn ? <Check size={17} /> : st.status === "running" ? <Loader2 size={17} className="spin" /> : i + 1}</div>{i < 3 && <div style={{ width: 2, flex: 1, background: "var(--line)", margin: "4px 0" }} />}</div>
        <div className="sb"><h3>{t}</h3><p className="mut" style={{ fontSize: ".92rem" }}>{d}</p>
          {dn && i === 0 && <p style={{ marginTop: 8 }}>{st.data.summary} <Sev s={st.data.severity} /></p>}{dn && i === 1 && <Docs d={st.data} />}{dn && i === 2 && <Causes d={st.data} />}</div></div>); })}
      {inc.failure && <div className="err" style={{ marginTop: 8 }}>{inc.failure}</div>}
      {(inc.status === "Failed" || running) && <button className="btn" style={{ marginTop: 10 }} onClick={() => api.retry(inc.id).then(setInc).catch(e => setErr(e.message))}>{inc.status === "Failed" ? "Retry investigation" : "Taking too long? Restart investigation"}</button>}</div>}
    {inc.status !== "Investigating" && inc.status !== "Failed" && s1 && <>
      <div className="card"><h2>Problem Summary</h2><p style={{ margin: "10px 0" }}>{s1.summary}</p><div className="row"><span className="chip">Service: {s1.service || inc.service || "Not specified"}</span><span className="chip">Category: {s1.category}</span></div></div>
      <div className="card"><h2>Severity</h2><div style={{ margin: "10px 0" }}><Sev s={s1.severity} /></div><p className="mut">{s1.severity_reason}</p></div>
      <div className="card"><h2>Possible Root Causes</h2><p className="mut" style={{ fontSize: ".9rem" }}>Causes are hypotheses unless backed by evidence. No live diagnostics were run.</p><Causes d={S("3").data} /></div>
      <div className="card"><h2>Knowledge Retrieved</h2><Docs d={S("2").data} /></div>
      <div className="card"><h2>Recommended Actions</h2>{s4?.general && <div className="note" style={{ margin: "10px 0" }}>No supporting runbook was retrieved, so these are general troubleshooting suggestions.</div>}<Actions d={s4} /></div>
      {inc.approval && <div className="card"><h2 style={{ marginBottom: 12 }}>Human Approval {inc.approval.status !== "pending" && <span className={"chip " + inc.approval.status}>{inc.approval.status}</span>}</h2>
        {inc.approval.status === "pending" ? <ApprovalBox inc={inc} onDone={load} /> : <p className="mut">Decision recorded (simulated action only). Action: {inc.approval.action}</p>}</div>}</>}
    {!running && <div><button className="btn ghost" onClick={() => go("list")}>Back to My Incidents</button></div>}</div>);
}

function ListPage({ go }) {
  const [items, setItems] = useState(null); const [q, setQ] = useState(""); const [sev, setSev] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { api.list().then(setItems).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="err">{err}</div>; if (!items) return <p className="mut">Loading…</p>;
  const shown = items.filter(i => i.title.toLowerCase().includes(q.toLowerCase()) && (!sev || i.severity === sev));
  return (<div className="stack"><h1>My Incidents</h1>
    {!items.length ? <Empty icon={FolderOpen} title="No incidents yet" text="When you submit a problem, it will appear here." action={<button className="btn" onClick={() => go("new")}>Report a problem</button>} /> : <>
      <div className="row"><input style={{ flex: 1, minWidth: 200 }} placeholder="Search incidents…" value={q} onChange={e => setQ(e.target.value)} />
        <select style={{ width: 160 }} value={sev} onChange={e => setSev(e.target.value)}><option value="">All severities</option>{["Low", "Medium", "High", "Critical"].map(s => <option key={s}>{s}</option>)}</select></div>
      {shown.map(i => <div className="card row" key={i.id} style={{ justifyContent: "space-between" }}><div><h3>{i.title}</h3><p className="mut" style={{ fontSize: ".88rem" }}>{fmt(i.created)}</p></div>
        <div className="row">{i.severity && <Sev s={i.severity} />}<span className="chip">{i.status}</span><button className="btn sm ghost" onClick={() => go("result", i.id)}>View Analysis</button></div></div>)}
      {!shown.length && <p className="mut">No incidents match your search.</p>}</>}</div>);
}

function KBPage() {
  const [docs, setDocs] = useState(null); const [q, setQ] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.docs(q).then(setDocs).catch(e => setErr(e.message)), [q]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);
  const up = async e => { const f = e.target.files[0]; if (!f) return; setBusy(true); setErr(""); try { await api.upload(f); await load(); } catch (x) { setErr(x.message); } setBusy(false); e.target.value = ""; };
  const del = async d => { if (!window.confirm(`Delete "${d.title}" from the knowledge base?`)) return; try { await api.del(d.id); load(); } catch (x) { setErr(x.message); } };
  return (<div className="stack"><div className="row" style={{ justifyContent: "space-between" }}><h1>Knowledge Base</h1>
    <label className="btn" style={{ margin: 0 }}>{busy ? <Loader2 size={18} className="spin" /> : <Upload size={18} />} Upload document<input type="file" accept=".pdf,.txt,.md" hidden onChange={up} /></label></div>
    {err && <div className="err">{err}</div>}
    {docs && (docs.length || q) ? <><input placeholder="Search your documents…" value={q} onChange={e => setQ(e.target.value)} />
      {docs.map(d => <div className="card row" key={d.id} style={{ justifyContent: "space-between" }}><div className="row"><div className="icon g" style={{ margin: 0 }}><FileText /></div><div><h3>{d.title}</h3><p className="mut" style={{ fontSize: ".88rem" }}>{d.excerpt ? `"${d.excerpt}…"` : `${d.chunks} indexed sections`}</p></div></div>
        <button className="btn sm ghost" onClick={() => del(d)}><Trash2 size={15} />Delete</button></div>)}{!docs.length && <p className="mut">No documents match.</p>}</>
      : docs && <Empty icon={BookOpen} title="Your knowledge base is empty." text="Upload troubleshooting guides to help the AI provide more context-aware recommendations." />}</div>);
}

function ApprovalsPage({ go }) {
  const [items, setItems] = useState(null); const [err, setErr] = useState("");
  const load = useCallback(() => api.approvals().then(setItems).catch(e => setErr(e.message)), []); useEffect(() => { load(); }, [load]);
  if (err) return <div className="err">{err}</div>; if (!items) return <p className="mut">Loading…</p>;
  return (<div className="stack"><div><h1>Approvals</h1><p className="mut" style={{ marginTop: 10 }}>Approving authorizes a simulated remediation action, not a real production change. Every decision is logged.</p></div>
    {!items.length ? <Empty icon={ShieldCheck} title="Nothing waiting for approval" text="When the AI proposes an action that needs a human decision, it will show up here." action={<button className="btn" onClick={() => go("new")}>Report a problem</button>} />
      : items.map(i => <div className="card stack" key={i.id}><div className="row" style={{ justifyContent: "space-between" }}><h2>{i.title}</h2><button className="btn sm ghost" onClick={() => go("result", i.id)}>View Analysis</button></div><ApprovalBox inc={i} onDone={load} /></div>)}</div>);
}

function HowPage() {
  const T = [["React + JavaScript", "Creates the interactive user interface."], ["Python + FastAPI", "Handles requests and connects the frontend with the AI backend."], ["CrewAI", "Coordinates specialized AI agents to investigate incidents."], ["Google Gemini", "Provides AI reasoning and recommendations."], ["ChromaDB", "Stores document embeddings and retrieves relevant troubleshooting knowledge."], ["RAG", "Combines retrieved documents with AI reasoning to generate more context-aware responses."]];
  const N = ({ c, children }) => <div className={"node " + (c || "")}>{children}</div>; const Ar = () => <ArrowRight size={18} color="#B77958" />;
  return (<div className="stack"><div><h1>How It Works</h1><p className="mut" style={{ marginTop: 10 }}>A quick tour of what happens between your question and the answer.</p></div>
    <div className="card stack"><h2>Architecture</h2><div className="arch"><N>You<br /><small className="mut">React app</small></N><Ar /><N c="p">FastAPI<br /><small>Python backend</small></N><Ar />
      <div className="stack" style={{ gap: 8 }}><N c="s">CrewAI agents<br /><small>Analyst → Investigator → Planner</small></N><N>ChromaDB<br /><small className="mut">Runbook search (RAG)</small></N></div><Ar /><N>Gemini<br /><small className="mut">Reasoning</small></N></div>
      <p className="mut" style={{ fontSize: ".92rem" }}>Retrieved runbook excerpts are handed to the agents together with your description, so answers are grounded in your own documents. Incidents, approvals and an audit trail are stored in SQLite.</p></div>
    <div className="grid">{T.map(([t, d], n) => <div className="card" key={t}><div className={"icon" + (n % 2 ? " g" : "")}><Sparkles size={20} /></div><h3>{t}</h3><p className="mut">{d}</p></div>)}</div></div>);
}
