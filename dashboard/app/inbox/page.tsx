'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function Inbox() {
  const [filterMode, setFilterMode] = useState<'REPLIED' | 'PITCHED'>('REPLIED');
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);

  useEffect(() => {
    fetchCompanies(filterMode);
    setSelectedCompany(null);
    setThread([]);
  }, [filterMode]);

  useEffect(() => {
    if (selectedCompany) {
      fetchThread(selectedCompany.id);
    }
  }, [selectedCompany]);

  async function fetchCompanies(status: string) {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });
    if (data) setCompanies(data);
  }

  async function fetchThread(companyId: string) {
    const { data: emails } = await supabase
      .from('emails')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });

    if (emails) {
      setThread(emails);
      const emailIds = emails.map(e => e.id);
      const { data: draftsData } = await supabase
        .from('drafts')
        .select('*')
        .in('email_id', emailIds);
      if (draftsData) setDrafts(draftsData);
    }
  }

  return (
    <div className="flex h-screen bg-[#0F0F0F] text-zinc-300 font-inter">
      {/* Sidebar - Thread List */}
      <div className="w-1/3 border-r border-zinc-800/50 flex flex-col">
        <div className="p-6 border-b border-zinc-800/50">
          <div className="flex space-x-4">
            <button 
              onClick={() => setFilterMode('REPLIED')}
              className={`text-lg font-medium tracking-tight pb-1 border-b-2 ${filterMode === 'REPLIED' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              Replies
            </button>
            <button 
              onClick={() => setFilterMode('PITCHED')}
              className={`text-lg font-medium tracking-tight pb-1 border-b-2 ${filterMode === 'PITCHED' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              Sent
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {companies.length === 0 ? (
            <div className="p-6 text-zinc-500 text-sm">No {filterMode === 'REPLIED' ? 'active replies' : 'sent pitches'} yet.</div>
          ) : (
            companies.map(c => (
              <div
                key={c.id}
                onClick={() => setSelectedCompany(c)}
                className={`p-5 cursor-pointer border-b border-zinc-800/30 transition-all hover:bg-zinc-800/30 ${selectedCompany?.id === c.id ? 'bg-zinc-800/50 border-l-2 border-l-blue-500' : ''}`}
              >
                <div className="font-medium text-zinc-100">{c.name}</div>
                <div className="text-xs text-zinc-500 mt-1">{c.website_url}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content - Email Thread & Drafts */}
      <div className="flex-1 flex flex-col bg-[#141414]">
        {selectedCompany ? (
          <>
            <div className="p-6 border-b border-zinc-800/50 bg-[#0F0F0F]">
              <h1 className="text-2xl font-semibold text-white">{selectedCompany.name}</h1>
              <a href={`https://${selectedCompany.website_url}`} target="_blank" className="text-sm text-blue-400 hover:underline">
                {selectedCompany.website_url}
              </a>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {thread.map(email => (
                <div key={email.id} className={`flex flex-col ${email.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[80%] rounded-xl p-5 ${email.direction === 'outbound' ? 'bg-zinc-800/80 text-zinc-300' : 'bg-blue-900/20 border border-blue-900/40 text-blue-50'}`}>
                    <div className="text-xs font-mono mb-3 opacity-60 uppercase tracking-wider">
                      {email.direction === 'outbound' ? 'Sent Pitch' : 'Client Reply'}
                    </div>
                    <div className="font-medium text-sm mb-2">{email.subject}</div>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed opacity-90" dangerouslySetInnerHTML={{ __html: email.body_text }} />
                  </div>

                  {/* Show Gemini Draft for Inbound Emails */}
                  {email.direction === 'inbound' && drafts.find(d => d.email_id === email.id) && (
                    <div className="mt-4 w-full max-w-[80%] rounded-xl p-5 bg-emerald-900/10 border border-emerald-900/30">
                      <div className="text-xs font-mono mb-3 text-emerald-500 uppercase tracking-wider flex items-center gap-2">
                        <span>✨ AI Draft Response</span>
                      </div>
                      <textarea
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded p-4 text-sm text-zinc-300 h-40 focus:outline-none focus:border-emerald-500/50"
                        defaultValue={drafts.find(d => d.email_id === email.id)?.draft_text}
                      />
                      <div className="mt-4 flex justify-end">
                        <button className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded transition-colors">
                          Send Reply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-600">
            Select a conversation to view the thread.
          </div>
        )}
      </div>
    </div>
  );
}
