"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [totalProspects, setTotalProspects] = useState(0);
  const [activeAudits, setActiveAudits] = useState(0);
  const [pitchCount, setPitchCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  // Single domain queue
  const [target, setTarget] = useState("");
  const [queueing, setQueueing] = useState(false);

  // Discovery
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    fetchAll();
    const ec = supabase.channel("ec2").on("postgres_changes", { event: "UPDATE", schema: "public", table: "engine_control" }, (p) => setIsRunning(p.new.is_running)).subscribe();
    const jo = supabase.channel("jo2").on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, fetchAll).subscribe();
    const co = supabase.channel("co2").on("postgres_changes", { event: "*", schema: "public", table: "companies" }, fetchAll).subscribe();
    return () => { supabase.removeChannel(ec); supabase.removeChannel(jo); supabase.removeChannel(co); };
  }, []);

  const fetchAll = async () => {
    const [{ count: p }, { count: a }, { count: pi }, { data: j }, { data: ec }] = await Promise.all([
      supabase.from("companies").select("*", { count: "exact", head: true }),
      supabase.from("audits").select("*", { count: "exact", head: true }).eq("status", "RUNNING"),
      supabase.from("audit_results").select("*", { count: "exact", head: true }).eq("category", "AI_PITCH"),
      supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(12),
      supabase.from("engine_control").select("is_running").eq("id", 1).single(),
    ]);
    setTotalProspects(p || 0);
    setActiveAudits(a || 0);
    setPitchCount(pi || 0);
    setJobs(j || []);
    if (ec) setIsRunning(ec.is_running);
  };

  const toggleEngine = async () => {
    setLoading(true);
    const next = !isRunning;
    await supabase.from("engine_control").update({ is_running: next, updated_at: new Date().toISOString() }).eq("id", 1);
    setIsRunning(next);
    setLoading(false);
  };

  const queueSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) return;
    setQueueing(true);
    await supabase.from("jobs").insert({ type: "SCRAPE", status: "PENDING", payload: { target: target.trim() } });
    setTarget("");
    setQueueing(false);
  };

  const queueDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !location.trim()) return;
    setDiscovering(true);
    await supabase.from("jobs").insert({ type: "DISCOVER", status: "PENDING", payload: { keyword: keyword.trim(), location: location.trim() } });
    setKeyword("");
    setLocation("");
    setDiscovering(false);
  };

  const statusColor: Record<string, string> = {
    COMPLETED: "#4ade80", RUNNING: "#facc15", PENDING: "#888", FAILED: "#f87171",
  };

  const disabled = !isRunning;

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
        <div className="card"><div className="stat-label">Total Prospects</div><div className="stat-value">{totalProspects}</div></div>
        <div className="card"><div className="stat-label">Active Audits</div><div className="stat-value">{activeAudits}</div></div>
        <div className="card"><div className="stat-label">Pitches Ready</div><div className="stat-value">{pitchCount}</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 36 }}>
        {/* Auto Discovery */}
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 12 }}>Auto Discovery</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
            Find businesses on Google Maps by keyword + city. Auto-audits and pitches all of them.
          </p>
          <form onSubmit={queueDiscovery} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)}
              placeholder='Keyword (e.g. "plumbers")'
              disabled={disabled}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 14px", fontSize: 13, color: "var(--text-primary)", fontFamily: "Inter, sans-serif", outline: "none", opacity: disabled ? 0.4 : 1 }}
            />
            <input
              type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder='Location (e.g. "Manchester")'
              disabled={disabled}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 14px", fontSize: 13, color: "var(--text-primary)", fontFamily: "Inter, sans-serif", outline: "none", opacity: disabled ? 0.4 : 1 }}
            />
            <button type="submit" disabled={disabled || discovering} className="btn-primary" style={{ marginTop: 4 }}>
              {discovering ? "Queued!" : "Find Leads"}
            </button>
          </form>
          {disabled && <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Start engine first.</p>}
        </div>

        {/* Single Target */}
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 12 }}>Single Target</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
            Audit a specific domain manually. Gets full issue report and AI pitch.
          </p>
          <form onSubmit={queueSingle} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text" value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder="example.com"
              disabled={disabled}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 14px", fontSize: 13, color: "var(--text-primary)", fontFamily: "JetBrains Mono, monospace", outline: "none", opacity: disabled ? 0.4 : 1 }}
            />
            <button type="submit" disabled={disabled || queueing} className="btn-primary" style={{ marginTop: 4 }}>
              {queueing ? "Queued!" : "Audit Site"}
            </button>
          </form>
          {disabled && <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>Start engine first.</p>}
        </div>
      </div>

      {/* Job Feed */}
      <div className="section-heading">Job Feed</div>
      {jobs.length === 0 ? (
        <div className="empty-state">No jobs yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {jobs.map((job) => (
            <div key={job.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: job.type === "DISCOVER" ? "#1a1a3a" : "#1a1a1a", color: job.type === "DISCOVER" ? "#818cf8" : "var(--text-muted)", fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                  {job.type}
                </span>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {job.type === "DISCOVER"
                    ? `${job.payload?.keyword} · ${job.payload?.location}`
                    : job.payload?.target}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {new Date(job.created_at).toLocaleTimeString()}
                </span>
                <span style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${statusColor[job.status]}33`, color: statusColor[job.status], fontSize: 10, fontWeight: 600 }}>
                  {job.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
