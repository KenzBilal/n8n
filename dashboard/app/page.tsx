"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [totalProspects, setTotalProspects] = useState(0);
  const [activeAudits, setActiveAudits] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch initial state
    fetchStats();
    fetchEngineStatus();

    // Realtime: engine control
    const engineChannel = supabase
      .channel("engine_control")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "engine_control" }, (payload) => {
        setIsRunning(payload.new.is_running);
      })
      .subscribe();

    // Realtime: companies count
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
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{isRunning ? "Engine running" : "Engine idle"}</span>
          <button
            onClick={toggleEngine}
            disabled={loading}
            className={`px-5 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
              isRunning
                ? "bg-white text-black hover:bg-red-100 hover:text-red-700"
                : "bg-white text-black hover:bg-gray-200"
            } disabled:opacity-40`}
          >
            {loading ? "..." : isRunning ? "Stop Engine" : "Start Engine"}
          </button>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-8">
        <div className={`w-2 h-2 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
        <span className="text-xs text-gray-400 font-mono">{isRunning ? "ACTIVE" : "IDLE"}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <div className="p-6 border border-[var(--border)] rounded-xl">
          <h3 className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wider">Total Prospects</h3>
          <p className="text-4xl font-bold">{totalProspects}</p>
        </div>
        <div className="p-6 border border-[var(--border)] rounded-xl">
          <h3 className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wider">Active Audits</h3>
          <p className="text-4xl font-bold">{activeAudits}</p>
        </div>
        <div className="p-6 border border-[var(--border)] rounded-xl">
          <h3 className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wider">Pitches Ready</h3>
          <p className="text-4xl font-bold">0</p>
        </div>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-4">Recent Activity</h2>
      <div className="border border-[var(--border)] rounded-xl p-10 text-center text-gray-600 text-sm">
        No activity yet. Start the engine to begin.
      </div>
    </div>
  );
}
