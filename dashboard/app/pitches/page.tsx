"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function PitchesPage() {
  const [pitches, setPitches] = useState<any[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchPitches();
    const ch = supabase
      .channel("pitches-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_results" }, fetchPitches)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchPitches = async () => {
    const { data } = await supabase
      .from("audit_results")
      .select("*, audits(company_id, companies(name, website_url))")
      .eq("category", "AI_PITCH")
      .order("created_at", { ascending: false });
    if (data) setPitches(data);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="page-title">Pitches</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>
          AI-generated outreach ready to send
        </p>
      </div>

      {pitches.length === 0 ? (
        <div className="empty-state">No pitches yet. Run an audit to generate outreach.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {pitches.map((p) => {
            const company = p.audits?.companies;
            const pitch = p.issues_found?.pitch || "";
            return (
              <div key={p.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{company?.name}</div>
                    <div className="mono" style={{ color: "var(--text-muted)" }}>{company?.website_url}</div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(pitch, p.id)}
                    className="btn-primary"
                    style={{ fontSize: 12, padding: "6px 14px" }}
                  >
                    {copied === p.id ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 6,
                  padding: 16,
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: "var(--text-secondary)",
                  whiteSpace: "pre-wrap",
                }}>
                  {pitch}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
