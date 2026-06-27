"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const STATUSES = ["NEW", "PITCHED", "REJECTED"];
const STATUS_LABELS: Record<string, string> = {
  NEW: "New", PITCHED: "Pitched", REJECTED: "Archived"
};

export default function ProspectsPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [pitch, setPitch] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [activeTab, setActiveTab] = useState<'PITCH' | 'SUGGESTIONS'>('PITCH');
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCompanies();
    const ch = supabase.channel("prospects-live2")
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, fetchCompanies)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchCompanies = async () => {
    const { data } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
    if (data) setCompanies(data);
  };

  const selectCompany = async (company: any) => {
    setSelected(company);
    setContacts([]);
    setPitch("");
    setSuggestions("");
    setRejectionReason("");
    setActiveTab('PITCH');
    const { data: ctcts } = await supabase.from("contacts").select("*").eq("company_id", company.id);
    if (ctcts) setContacts(ctcts);
    const { data: audit } = await supabase.from("audits").select("id").eq("company_id", company.id).single();
    if (audit) {
      const { data: results } = await supabase.from("audit_results").select("*").eq("audit_id", audit.id);
      if (results) {
        const pitchRes = results.find(r => r.category === "AI_PITCH");
        if (pitchRes) {
          setPitch(pitchRes.issues_found?.pitch || "");
          setSuggestions(pitchRes.issues_found?.suggestions || "");
        }
        const rejRes = results.find(r => r.category === "REJECTED");
        if (rejRes) setRejectionReason(rejRes.issues_found?.rejection_reason || "");
      }
    }
  };

  // Manual status moves are no longer allowed in UI. Everything is autonomous.

  const deleteCompany = async () => {
    if (!selected) return;
    setDeleting(true);
    await fetch('/api/reject', {
      method: 'POST',
      body: JSON.stringify({ id: selected.id }),
      headers: { 'Content-Type': 'application/json' }
    });
    setCompanies(prev => prev.map(c => c.id === selected.id ? { ...c, status: 'REJECTED' } : c));
    setSelected(null);
    setDeleting(false);
  };

  const scoreColor = (s: number) => s >= 70 ? "#4ade80" : s >= 40 ? "#facc15" : "#f87171";

  const filtered = companies.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.website_url?.toLowerCase().includes(search.toLowerCase())
  );

  const byStatus = (status: string) => filtered.filter(c => (c.status || "NEW") === status);

  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 96px)" }}>
      {/* Left: Kanban */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 className="page-title">Prospects</h1>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>{companies.length} total</p>
          </div>
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 6,
              padding: "7px 14px", fontSize: 13, color: "var(--text-primary)", fontFamily: "Inter, sans-serif",
              outline: "none", width: 200,
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {STATUSES.map(status => (
            <div key={status} className="kanban-col">
              <div className="kanban-col-header">{STATUS_LABELS[status]} ({byStatus(status).length})</div>
              {byStatus(status).map(c => (
                <div
                  key={c.id}
                  className="prospect-card"
                  onClick={() => selectCompany(c)}
                  style={{ outline: selected?.id === c.id ? "1px solid #444" : "none" }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5 }}>{c.name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                      {c.website_url}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor(c.lead_score), fontFamily: "JetBrains Mono, monospace" }}>
                      {c.lead_score}
                    </span>
                  </div>
                </div>
              ))}
              {byStatus(status).length === 0 && (
                <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", paddingTop: 32 }}>Empty</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right: Detail Panel */}
      {selected && (
        <div style={{ width: 500, background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10, padding: 32, overflowY: "auto", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{selected.name}</div>
              <a href={`https://${selected.website_url}`} target="_blank" rel="noreferrer" className="mono"
                style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none" }}>
                {selected.website_url} ↗
              </a>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>

          {/* Score + Industry */}
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div className="stat-label">Score</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: scoreColor(selected.lead_score) }}>{selected.lead_score}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="stat-label">Industry</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{selected.industry}</div>
              </div>
            </div>
          </div>

          {/* Rejection Reason (If Archived) */}
          {selected.status === 'REJECTED' && rejectionReason && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#3f1111', border: '1px solid #7f1d1d', borderRadius: 6 }}>
              <div className="section-heading" style={{ color: '#fca5a5', marginBottom: 4 }}>Archived Reason</div>
              <div style={{ fontSize: 13, color: '#fee2e2' }}>{rejectionReason}</div>
            </div>
          )}

          {/* Contacts */}
          <div style={{ marginBottom: 16 }}>
            <div className="section-heading">Contacts</div>
            {contacts.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No contacts found</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {contacts.map((c, i) => (
                  <div key={i} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}>
                    {c.email && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: c.linkedin_url ? 6 : 0 }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Email</span>
                        <a href={`mailto:${c.email}`} className="mono" style={{ fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>{c.email}</a>
                      </div>
                    )}
                    {c.linkedin_url && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: c.instagram_url ? 6 : 0 }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>LinkedIn</span>
                        <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>View ↗</a>
                      </div>
                    )}
                    {c.instagram_url && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Instagram</span>
                        <a href={c.instagram_url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>View ↗</a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pitch & Suggestions */}
          {(pitch || suggestions) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: "flex", gap: 16 }}>
                  <button 
                    onClick={() => setActiveTab('PITCH')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 8, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: activeTab === 'PITCH' ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: activeTab === 'PITCH' ? '2px solid var(--text-primary)' : '2px solid transparent' }}
                  >Pitch</button>
                  <button 
                    onClick={() => setActiveTab('SUGGESTIONS')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 8, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: activeTab === 'SUGGESTIONS' ? 'var(--text-primary)' : 'var(--text-muted)', borderBottom: activeTab === 'SUGGESTIONS' ? '2px solid var(--text-primary)' : '2px solid transparent' }}
                  >Suggestions</button>
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(activeTab === 'PITCH' ? pitch : suggestions); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="btn-primary" style={{ fontSize: 11, padding: "4px 12px", marginBottom: 8 }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div style={{ background: "var(--bg)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 20, fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                {activeTab === 'PITCH' ? pitch : (suggestions || 'No internal suggestions generated.')}
              </div>
            </div>
          )}

          {/* Delete */}
          <button onClick={deleteCompany} disabled={deleting} className="btn-danger" style={{ width: "100%", marginTop: 8 }}>
            {deleting ? "Deleting..." : "Delete Prospect"}
          </button>
        </div>
      )}
    </div>
  );
}
