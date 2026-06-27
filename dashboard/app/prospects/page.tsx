"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ProspectsPage() {
  const [companies, setCompanies] = useState<any[]>([]);

  useEffect(() => {
    fetchCompanies();

    const channel = supabase
      .channel("public:companies")
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, () => {
        fetchCompanies();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchCompanies = async () => {
    const { data } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
    if (data) setCompanies(data);
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="page-title">Prospects</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
          {companies.length} total prospects
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {/* New */}
        <div className="kanban-col">
          <div className="kanban-col-header">New ({companies.length})</div>
          {companies.map(company => (
            <div key={company.id} className="prospect-card">
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
                {company.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }} className="mono">
                Score: {company.lead_score}/100
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company.website_url}
              </div>
            </div>
          ))}
          {companies.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>
              No prospects yet
            </div>
          )}
        </div>

        {/* Auditing */}
        <div className="kanban-col">
          <div className="kanban-col-header">Auditing (0)</div>
        </div>

        {/* Pitched */}
        <div className="kanban-col">
          <div className="kanban-col-header">Pitched (0)</div>
        </div>

        {/* Closed */}
        <div className="kanban-col">
          <div className="kanban-col-header">Closed (0)</div>
        </div>
      </div>
    </div>
  );
}
