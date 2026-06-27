"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function ProspectsPage() {
  const [companies, setCompanies] = useState<any[]>([]);

  useEffect(() => {
    // Initial fetch
    fetchCompanies();

    // Realtime subscription
    const channel = supabase
      .channel('public:companies')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, (payload) => {
        console.log('Change received!', payload);
        fetchCompanies(); // Simple refetch on any change
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setCompanies(data);
  };

  return (
    <div className="max-w-7xl">
      <h1 className="text-3xl font-semibold mb-8 tracking-tight">Prospects</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* New Column */}
        <div className="bg-[#111111] border border-[var(--border)] rounded-xl p-4 min-h-[500px]">
          <h2 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">New ({companies.length})</h2>
          {companies.map(company => (
            <div key={company.id} className="p-4 bg-[var(--muted)] rounded-lg border border-[#3f3f46] shadow-sm mb-3 cursor-pointer hover:bg-[#3f3f46] transition-colors">
              <h3 className="font-semibold text-white">{company.name}</h3>
              <p className="text-xs text-gray-400 mt-1">Score: {company.lead_score}/100</p>
              <p className="text-xs text-gray-500 mt-1 truncate">{company.website_url}</p>
            </div>
          ))}
        </div>

        {/* Auditing Column */}
        <div className="bg-[#111111] border border-[var(--border)] rounded-xl p-4 min-h-[500px]">
          <h2 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Auditing (0)</h2>
        </div>

        {/* Pitched Column */}
        <div className="bg-[#111111] border border-[var(--border)] rounded-xl p-4 min-h-[500px]">
          <h2 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Pitched (0)</h2>
        </div>

        {/* Closed Column */}
        <div className="bg-[#111111] border border-[var(--border)] rounded-xl p-4 min-h-[500px]">
          <h2 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Closed (0)</h2>
        </div>

      </div>
    </div>
  );
}
