"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AuditsPage() {
  const [audits, setAudits] = useState<any[]>([]);

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

  const statusColor: Record<string, string> = {
    COMPLETED: "#4ade80",
    RUNNING: "#facc15",
    PENDING: "#888",
    FAILED: "#f87171",
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="page-title">Audits</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>
          {audits.length} total audits
        </p>
      </div>

      {audits.length === 0 ? (
        <div className="empty-state">No audits yet. Start the engine and queue a target.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {audits.map((audit) => (
            <div key={audit.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
                  {audit.companies?.name || "Unknown"}
                </div>
                <div className="mono" style={{ color: "var(--text-muted)" }}>
                  {audit.companies?.website_url}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Score</div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{audit.total_score ?? "—"}</div>
                </div>
                <div style={{ padding: "4px 10px", borderRadius: 4, border: `1px solid ${statusColor[audit.status] || "#888"}33`, color: statusColor[audit.status] || "#888", fontSize: 11, fontWeight: 500 }}>
                  {audit.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
