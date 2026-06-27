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
    <div className="flex h-screen bg-black text-white font-inter">
      {/* Sidebar - Thread List */}
      <div className="w-1/3 border-r border-[#333333] flex flex-col bg-black">
        <div className="p-6 border-b border-[#333333]">
          <div className="flex space-x-4 mb-2">
            <button 
              onClick={() => setFilterMode('REPLIED')}
              className={`text-lg font-bold tracking-tight pb-1 border-b-2 ${filterMode === 'REPLIED' ? 'border-white text-white' : 'border-transparent text-[#808080]'}`}
            >
              Replies
            </button>
            <button 
              onClick={() => setFilterMode('PITCHED')}
              className={`text-lg font-bold tracking-tight pb-1 border-b-2 ${filterMode === 'PITCHED' ? 'border-white text-white' : 'border-transparent text-[#808080]'}`}
            >
              Sent
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {companies.length === 0 ? (
            <div className="p-6 text-[#808080] text-sm">No {filterMode === 'REPLIED' ? 'replies' : 'sent pitches'} found.</div>
          ) : (
            companies.map(c => (
              <div 
                key={c.id}
                onClick={() => setSelectedCompany(c)}
                className={`p-5 cursor-pointer border-b border-[#222222] ${selectedCompany?.id === c.id ? 'bg-[#111111] border-l-2 border-l-white' : 'hover:bg-[#0A0A0A]'}`}
              >
                <div className="font-bold text-white">{c.name}</div>
                <div className="text-sm text-[#808080] mt-1">{c.website_url}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content - Email Thread & Drafts */}
      <div className="flex-1 flex flex-col bg-black">
        {selectedCompany ? (
          <>
            <div className="p-6 border-b border-[#333333] bg-black">
              <h1 className="text-2xl font-bold text-white">{selectedCompany.name}</h1>
              <a href={`https://${selectedCompany.website_url}`} target="_blank" className="text-sm text-[#808080] hover:text-white">
                {selectedCompany.website_url}
              </a>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {thread.map(email => (
                <div key={email.id} className={`flex flex-col ${email.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[80%] p-5 ${email.direction === 'outbound' ? 'bg-[#1A1A1A] text-white border border-[#333333]' : 'bg-black border border-[#555555] text-white'}`}>
                    <div className="text-xs font-mono mb-3 text-[#808080] uppercase tracking-wider">
                      {email.direction === 'outbound' ? 'Sent Pitch' : 'Client Reply'}
                    </div>
                    <div className="font-bold text-sm mb-2">{email.subject}</div>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed text-[#CCCCCC]" dangerouslySetInnerHTML={{ __html: email.body_text }} />
                  </div>
                  
                  {/* Show Gemini Draft for Inbound Emails */}
                  {email.direction === 'inbound' && drafts.find(d => d.email_id === email.id) && (
                    <div className="mt-4 w-full max-w-[80%] p-5 bg-black border border-white">
                      <div className="text-xs font-mono mb-3 text-white uppercase tracking-wider flex items-center gap-2">
                        <span>AI Draft Response</span>
                      </div>
                      <textarea 
                        className="w-full bg-[#111111] border border-[#333333] p-4 text-sm text-white h-40 focus:outline-none focus:border-white"
                        defaultValue={drafts.find(d => d.email_id === email.id)?.draft_text}
                      />
                      <div className="mt-4 flex justify-end">
                        <button className="bg-white hover:bg-[#CCCCCC] text-black text-sm font-bold px-4 py-2 transition-colors">
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
          <div className="flex-1 flex items-center justify-center text-[#808080]">
            Select a conversation to view the thread.
          </div>
        )}
      </div>
    </div>
  );
}
