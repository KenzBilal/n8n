"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const STATUSES = ["NEW", "AUDITING", "PITCHED", "CLOSED"];
const STATUS_LABELS: Record<string, string> = {
  NEW: "New", AUDITING: "Auditing", PITCHED: "Pitched", CLOSED: "Closed"
};

export default function ProspectsPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [pitch, setPitch] = useState("");
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
    const { data: ctcts } = await supabase.from("contacts").select("*").eq("company_id", company.id);
    if (ctcts) setContacts(ctcts);
    const { data: audit } = await supabase.from("audits").select("id").eq("company_id", company.id).single();
    if (audit) {
      const { data: result } = await supabase.from("audit_results").select("issues_found").eq("audit_id", audit.id).eq("category", "AI_PITCH").single();
      if (result) setPitch(result.issues_found?.pitch || "");
    }
  };

  const moveStatus = async (company: any, status: string) => {
    await supabase.from("companies").update({ status }).eq("id", company.id);
    setCompanies(prev => prev.map(c => c.id === company.id ? { ...c, status } : c));
    if (selected?.id === company.id) setSelected({ ...company, status });
  };

  const deleteCompany = async () => {
    if (!selected) return;
    setDeleting(true);
    await supabase.from("audit_results").delete().in("audit_id",
      (await supabase.from("audits").select("id").eq("company_id", selected.id)).data?.map((a: any) => a.id) || []
    );
    await supabase.from("audits").delete().eq("company_id", selected.id);
    await supabase.from("contacts").delete().eq("company_id", selected.id);
    await supabase.from("companies").delete().eq("id", selected.id);
    setCompanies(prev => prev.filter(c => c.id !== selected.id));
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
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
        <div style={{ width: 360, background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 10, padding: 24, overflowY: "auto", flexShrink: 0 }}>
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

          {/* Move status */}
          <div style={{ marginBottom: 16 }}>
            <div className="section-heading">Pipeline Stage</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => moveStatus(selected, s)}
                  style={{
                    padding: "5px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: (selected.status || "NEW") === s ? "var(--text-primary)" : "var(--bg)",
                    color: (selected.status || "NEW") === s ? "#0a0a0a" : "var(--text-muted)",
                    border: "1px solid var(--border)",
                    transition: "all 0.15s",
                  }}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

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
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>LinkedIn</span>
                        <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>View ↗</a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pitch */}
          {pitch && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div className="section-heading" style={{ marginBottom: 0 }}>AI Pitch</div>
                <button
                  onClick={() => { navigator.clipboard.writeText(pitch); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="btn-primary" style={{ fontSize: 11, padding: "4px 12px" }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div style={{ background: "var(--bg)", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: 14, fontSize: 12, lineHeight: 1.7, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                {pitch}
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
