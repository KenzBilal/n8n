"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [totalProspects, setTotalProspects] = useState(0);
  const [activeAudits, setActiveAudits] = useState(0);
  const [pitchCount, setPitchCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState("");
  const [queueing, setQueueing] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    fetchAll();

    const ec = supabase.channel("ec").on("postgres_changes", { event: "UPDATE", schema: "public", table: "engine_control" }, (p) => setIsRunning(p.new.is_running)).subscribe();
    const co = supabase.channel("co").on("postgres_changes", { event: "*", schema: "public", table: "companies" }, fetchAll).subscribe();
    const jo = supabase.channel("jo").on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, fetchAll).subscribe();

    return () => { supabase.removeChannel(ec); supabase.removeChannel(co); supabase.removeChannel(jo); };
  }, []);

  const fetchAll = async () => {
    const [{ count: p }, { count: a }, { count: pi }, { data: j }] = await Promise.all([
      supabase.from("companies").select("*", { count: "exact", head: true }),
      supabase.from("audits").select("*", { count: "exact", head: true }).eq("status", "RUNNING"),
      supabase.from("audit_results").select("*", { count: "exact", head: true }).eq("category", "AI_PITCH"),
      supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(10),
    ]);
    setTotalProspects(p || 0);
    setActiveAudits(a || 0);
    setPitchCount(pi || 0);
    setJobs(j || []);

    const { data: ec } = await supabase.from("engine_control").select("is_running").eq("id", 1).single();
    if (ec) setIsRunning(ec.is_running);
  };

  const toggleEngine = async () => {
    setLoading(true);
    const next = !isRunning;
    await supabase.from("engine_control").update({ is_running: next, updated_at: new Date().toISOString() }).eq("id", 1);
    setIsRunning(next);
    setLoading(false);
  };

  const queueJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) return;
    setQueueing(true);
    await supabase.from("jobs").insert({ type: "SCRAPE", status: "PENDING", payload: { target: target.trim() } });
    setTarget("");
    setQueueing(false);
  };

  const statusColor: Record<string, string> = {
    COMPLETED: "#4ade80",
    RUNNING: "#facc15",
    PENDING: "#888888",
    FAILED: "#f87171",
    STOPPING: "#fb923c",
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 36 }}>
        <div>
          <h1 className="page-title">Overview</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span className={`status-dot ${isRunning ? "active" : "idle"}`} />
            <span className="mono" style={{ color: "var(--text-muted)", fontSize: 11 }}>
              {isRunning ? "ENGINE RUNNING" : "ENGINE IDLE"}
            </span>
          </div>
        </div>
        <button onClick={toggleEngine} disabled={loading} className={isRunning ? "btn-danger" : "btn-primary"}>
          {loading ? "..." : isRunning ? "Stop Engine" : "Start Engine"}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 36 }}>
        <div className="card">
          <div className="stat-label">Total Prospects</div>
          <div className="stat-value">{totalProspects}</div>
        </div>
        <div className="card">
          <div className="stat-label">Active Audits</div>
          <div className="stat-value">{activeAudits}</div>
        </div>
        <div className="card">
          <div className="stat-label">Pitches Ready</div>
          <div className="stat-value">{pitchCount}</div>
        </div>
      </div>

      {/* Queue a target */}
      <div style={{ marginBottom: 36 }}>
        <div className="section-heading">Add Target</div>
        <form onSubmit={queueJob} style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="example.com"
            disabled={!isRunning}
            style={{
              flex: 1,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "9px 14px",
              fontSize: 13,
              color: "var(--text-primary)",
              fontFamily: "JetBrains Mono, monospace",
              outline: "none",
              opacity: isRunning ? 1 : 0.4,
            }}
          />
          <button type="submit" disabled={!isRunning || queueing} className="btn-primary">
            {queueing ? "..." : "Queue"}
          </button>
        </form>
        {!isRunning && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Start the engine to queue targets.
          </p>
        )}
      </div>

      {/* Recent Jobs */}
      <div>
        <div className="section-heading">Recent Jobs</div>
        {jobs.length === 0 ? (
          <div className="empty-state">No jobs yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {jobs.map((job) => (
              <div key={job.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
                <div className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {job.payload?.target || job.type}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {new Date(job.created_at).toLocaleTimeString()}
                  </span>
                  <span style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${statusColor[job.status] || "#888"}33`, color: statusColor[job.status] || "#888", fontSize: 10, fontWeight: 500 }}>
                    {job.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
