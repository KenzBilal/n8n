"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [totalProspects, setTotalProspects] = useState(0);
  const [activeAudits, setActiveAudits] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchEngineStatus();

    const engineChannel = supabase
      .channel("engine_control")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "engine_control" }, (payload) => {
        setIsRunning(payload.new.is_running);
      })
      .subscribe();

    const companiesChannel = supabase
      .channel("companies_count")
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(engineChannel);
      supabase.removeChannel(companiesChannel);
    };
  }, []);

  const fetchEngineStatus = async () => {
    const { data } = await supabase.from("engine_control").select("is_running").eq("id", 1).single();
    if (data) setIsRunning(data.is_running);
  };

  const fetchStats = async () => {
    const { count: prospects } = await supabase.from("companies").select("*", { count: "exact", head: true });
    const { count: audits } = await supabase.from("audits").select("*", { count: "exact", head: true }).eq("status", "RUNNING");
    setTotalProspects(prospects || 0);
    setActiveAudits(audits || 0);
  };

  const toggleEngine = async () => {
    setLoading(true);
    const next = !isRunning;
    await supabase.from("engine_control").update({ is_running: next, updated_at: new Date().toISOString() }).eq("id", 1);
    setIsRunning(next);
    setLoading(false);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
        <div>
          <h1 className="page-title">Overview</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span className={`status-dot ${isRunning ? 'active' : 'idle'}`} />
            <span className="mono" style={{ color: 'var(--text-muted)' }}>
              {isRunning ? 'ENGINE RUNNING' : 'ENGINE IDLE'}
            </span>
          </div>
        </div>
        <button
          onClick={toggleEngine}
          disabled={loading}
          className={isRunning ? 'btn-danger' : 'btn-primary'}
        >
          {loading ? '...' : isRunning ? 'Stop Engine' : 'Start Engine'}
        </button>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 40 }}>
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
          <div className="stat-value">0</div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="section-heading">Recent Activity</div>
      <div className="empty-state">
        No activity yet. Start the engine to begin.
      </div>
    </div>
  );
}
