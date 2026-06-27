"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AuditsPage() {
  const [audits, setAudits] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [issues, setIssues] = useState<any[]>([]);

  useEffect(() => {
    fetchAudits();
    const ch = supabase
      .channel("audits-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "audits" }, fetchAudits)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchAudits = async () => {
    const { data } = await supabase
      .from("audits")
      .select("*, companies(name, website_url)")
      .order("created_at", { ascending: false });
    if (data) setAudits(data);
  };

  const selectAudit = async (audit: any) => {
    setSelected(audit);
    setIssues([]);
    const { data } = await supabase
      .from("audit_results")
      .select("issues_found, raw_data")
      .eq("audit_id", audit.id)
      .eq("category", "AI_PITCH")
      .single();
    if (data?.issues_found?.issues) setIssues(data.issues_found.issues);
  };

  const severityColor: Record<string, string> = {
    high: "#f87171",
    medium: "#facc15",
    low: "#888888",
  };

  const statusColor: Record<string, string> = {
    COMPLETED: "#4ade80",
    RUNNING: "#facc15",
    PENDING: "#888",
    FAILED: "#f87171",
  };

  const scoreColor = (s: number) => s >= 70 ? "#4ade80" : s >= 40 ? "#facc15" : "#f87171";

  return (
    <div style={{ display: "flex", gap: 20, height: "calc(100vh - 96px)" }}>
      {/* Left: Audit list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Audits</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>{audits.length} total</p>
        </div>

        {audits.length === 0 ? (
          <div className="empty-state">No audits yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {audits.map((audit) => (
              <div
                key={audit.id}
                className="card"
                onClick={() => selectAudit(audit)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", outline: selected?.id === audit.id ? "1px solid #3a3a3a" : "none" }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{audit.companies?.name}</div>
                  <div className="mono" style={{ color: "var(--text-muted)", fontSize: 11 }}>{audit.companies?.website_url}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Score</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: scoreColor(audit.total_score || 0) }}>
                      {audit.total_score ?? "—"}
                    </div>
                  </div>
                  <div style={{ padding: "3px 10px", borderRadius: 4, border: `1px solid ${statusColor[audit.status]}33`, color: statusColor[audit.status], fontSize: 10, fontWeight: 600 }}>
                    {audit.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Issues Panel */}
      {selected && (
        <div style={{
          width: 380,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 24,
          overflowY: "auto",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{selected.companies?.name}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{selected.companies?.website_url}</div>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          {/* Score summary */}
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div className="stat-label">Score</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: scoreColor(selected.total_score || 0) }}>
                  {selected.total_score ?? "—"}<span style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 400 }}>/100</span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="stat-label">Issues</div>
                <div style={{ fontSize: 32, fontWeight: 700 }}>{issues.length}</div>
              </div>
            </div>
          </div>

          {/* Issues by severity */}
          {["high", "medium", "low"].map(sev => {
            const filtered = issues.filter(i => i.severity === sev);
            if (!filtered.length) return null;
            return (
              <div key={sev} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: severityColor[sev], textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                  {sev} ({filtered.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {filtered.map((issue, i) => (
                    <div key={i} style={{
                      background: "var(--bg)",
                      border: `1px solid ${severityColor[sev]}22`,
                      borderLeft: `2px solid ${severityColor[sev]}`,
                      borderRadius: 6,
                      padding: "10px 12px",
                    }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2, fontWeight: 500 }}>{issue.category}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{issue.issue}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {issues.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", paddingTop: 20 }}>
              No issues data. Re-queue this site for a fresh audit.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
