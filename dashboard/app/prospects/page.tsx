import React from 'react';

export default function ProspectsPage() {
  return (
    <div className="max-w-7xl">
      <h1 className="text-3xl font-semibold mb-8 tracking-tight">Prospects</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* New Column */}
        <div className="bg-[#111111] border border-[var(--border)] rounded-xl p-4 min-h-[500px]">
          <h2 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">New (1)</h2>
          <div className="p-4 bg-[var(--muted)] rounded-lg border border-[#3f3f46] shadow-sm mb-3 cursor-pointer hover:bg-[#3f3f46] transition-colors">
            <h3 className="font-semibold text-white">example.com</h3>
            <p className="text-xs text-gray-400 mt-1">Score: 45/100</p>
          </div>
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
