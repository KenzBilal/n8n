"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ProspectsPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [pitch, setPitch] = useState<string>("");

  useEffect(() => {
    fetchCompanies();
    const ch = supabase
      .channel("prospects-live")
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

    const { data: audits } = await supabase.from("audits").select("id").eq("company_id", company.id).single();
    if (audits) {
      const { data: result } = await supabase
        .from("audit_results")
        .select("issues_found")
        .eq("audit_id", audits.id)
        .eq("category", "AI_PITCH")
        .single();
      if (result) setPitch(result.issues_found?.pitch || "");
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 70) return "#4ade80";
    if (score >= 40) return "#facc15";
    return "#f87171";
  };

  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 96px)" }}>
      {/* Left: Kanban */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Prospects</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>{companies.length} total</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {/* New */}
          <div className="kanban-col">
            <div className="kanban-col-header">New ({companies.length})</div>
            {companies.map(c => (
              <div
                key={c.id}
                className="prospect-card"
                onClick={() => selectCompany(c)}
                style={{ outline: selected?.id === c.id ? "1px solid #3a3a3a" : "none" }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>{c.name}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                    {c.website_url}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: scoreColor(c.lead_score), fontFamily: "JetBrains Mono, monospace" }}>
                    {c.lead_score}
                  </span>
                </div>
              </div>
            ))}
            {companies.length === 0 && <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", paddingTop: 40 }}>No prospects</div>}
          </div>

          <div className="kanban-col"><div className="kanban-col-header">Auditing (0)</div></div>
          <div className="kanban-col"><div className="kanban-col-header">Pitched (0)</div></div>
          <div className="kanban-col"><div className="kanban-col-header">Closed (0)</div></div>
        </div>
      </div>

      {/* Right: Detail Panel */}
      {selected && (
        <div style={{
          width: 360,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 24,
          overflowY: "auto",
          flexShrink: 0,
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{selected.name}</div>
              <a href={`https://${selected.website_url}`} target="_blank" rel="noreferrer"
                className="mono" style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none" }}>
                {selected.website_url} ↗
              </a>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          {/* Score */}
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div className="stat-label">Lead Score</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: scoreColor(selected.lead_score) }}>{selected.lead_score}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="stat-label">Industry</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{selected.industry}</div>
              </div>
            </div>
          </div>

          {/* Contacts */}
          <div style={{ marginBottom: 16 }}>
            <div className="section-heading">Contacts</div>
            {contacts.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No contacts found</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {contacts.map((c, i) => (
                  <div key={i} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}>
                    {c.email && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: c.linkedin_url ? 6 : 0 }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Email</span>
                        <a href={`mailto:${c.email}`} className="mono" style={{ fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>
                          {c.email}
                        </a>
                      </div>
                    )}
                    {c.linkedin_url && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>LinkedIn</span>
                        <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}>
                          View Profile ↗
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pitch */}
          {pitch && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div className="section-heading" style={{ marginBottom: 0 }}>AI Pitch</div>
                <button
                  onClick={() => navigator.clipboard.writeText(pitch)}
                  className="btn-primary"
                  style={{ fontSize: 11, padding: "4px 12px" }}
                >
                  Copy
                </button>
              </div>
              <div style={{
                background: "var(--bg)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 6,
                padding: 14,
                fontSize: 12,
                lineHeight: 1.7,
                color: "var(--text-secondary)",
                whiteSpace: "pre-wrap",
              }}>
                {pitch}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
