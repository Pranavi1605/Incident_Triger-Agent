const B = import.meta.env.VITE_API || "http://localhost:8001/api";
async function r(p, o) {
  let res; try { res = await fetch(B + p, o); } catch { throw new Error(`Cannot reach the backend at ${B}. Is it running?`); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText);
  return res.json();
}
const J = (m, b) => ({ method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
export const api = {
  list: () => r("/incidents"), get: id => r(`/incidents/${id}`), create: b => r("/incidents", J("POST", b)),
  retry: id => r(`/incidents/${id}/retry`, { method: "POST" }),
  approvals: () => r("/approvals"), decide: (id, d) => r(`/incidents/${id}/approval`, J("POST", { decision: d })),
  docs: (q = "") => r("/documents?q=" + encodeURIComponent(q)),
  upload: f => { const fd = new FormData(); fd.append("file", f); return r("/documents", { method: "POST", body: fd }); },
  del: id => r(`/documents/${id}`, { method: "DELETE" }),
};
