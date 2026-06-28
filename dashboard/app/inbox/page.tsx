'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function Inbox() {
  const [filterMode, setFilterMode] = useState<'REPLIED' | 'PITCHED'>('REPLIED');
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [editingDrafts, setEditingDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchCompanies(filterMode);
    setSelectedCompany(null);
    setThread([]);
    setContacts([]);
    setDrafts([]);
  }, [filterMode]);

  useEffect(() => {
    if (selectedCompany) {
      fetchThread(selectedCompany.id);
      fetchContacts(selectedCompany.id);
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

  async function fetchContacts(companyId: string) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', companyId);
    if (data) setContacts(data);
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
      if (emailIds.length > 0) {
        const { data: draftsData } = await supabase
          .from('drafts')
          .select('*')
          .in('email_id', emailIds);
        if (draftsData) setDrafts(draftsData);
      }
    }
  }

  const scoreColor = (s: number) => {
    if (s < 30) return '#f87171';
    if (s < 60) return '#fb923c';
    return '#4ade80';
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 96px)', gap: 0 }}>

      {/* ── Left panel: conversation list ── */}
      <div style={{
        width: 300, flexShrink: 0,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        marginRight: 16,
      }}>
        {/* Header + tabs */}
        <div style={{ padding: '20px 20px 0', borderBottom: '1px solid var(--border)' }}>
          <h1 className="page-title" style={{ marginBottom: 16 }}>Inbox</h1>
          <div style={{ display: 'flex', gap: 0 }}>
            {(['REPLIED', 'PITCHED'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  fontSize: 12, fontWeight: 600,
                  fontFamily: 'Inter, sans-serif',
                  background: 'none', border: 'none',
                  cursor: 'pointer',
                  color: filterMode === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: filterMode === mode ? '2px solid var(--text-primary)' : '2px solid transparent',
                  transition: 'all 0.15s',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {mode === 'REPLIED' ? 'Replies' : 'Sent'}
              </button>
            ))}
          </div>
        </div>

        {/* Company list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {companies.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No {filterMode === 'REPLIED' ? 'replies' : 'sent pitches'} yet.
            </div>
          ) : (
            companies.map(c => (
              <div
                key={c.id}
                onClick={() => setSelectedCompany(c)}
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  background: selectedCompany?.id === c.id ? 'var(--bg-elevated)' : 'transparent',
                  borderLeft: selectedCompany?.id === c.id ? '2px solid var(--text-primary)' : '2px solid transparent',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (selectedCompany?.id !== c.id) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; }}
                onMouseLeave={e => { if (selectedCompany?.id !== c.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: scoreColor(c.lead_score),
                  }}>{c.lead_score}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {c.website_url}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main area ── */}
      {selectedCompany ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Company header card */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                {selectedCompany.name}
              </div>
              <a
                href={`https://${selectedCompany.website_url}`}
                target="_blank"
                rel="noreferrer"
                className="mono"
                style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
              >
                {selectedCompany.website_url} ↗
              </a>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {/* Contact chip */}
              {contacts[0]?.email && (
                <div style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 11, color: 'var(--text-secondary)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  {contacts[0].email}
                </div>
              )}
              {contacts[0]?.instagram_url && (
                <a href={contacts[0].instagram_url} target="_blank" rel="noreferrer" style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 11, color: 'var(--text-secondary)',
                  fontFamily: 'Inter, sans-serif',
                  textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  📸 Insta ↗
                </a>
              )}
              {/* Score badge */}
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '6px 14px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span className="section-heading" style={{ marginBottom: 0 }}>Score</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor(selectedCompany.lead_score), fontFamily: 'JetBrains Mono, monospace' }}>
                  {selectedCompany.lead_score}
                </span>
              </div>
            </div>
          </div>

          {/* Thread */}
          <div style={{
            flex: 1,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Thread header */}
            <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="section-heading" style={{ marginBottom: 0 }}>Email Thread — {thread.length} message{thread.length !== 1 ? 's' : ''}</div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {thread.length === 0 ? (
                <div className="empty-state">No emails in this thread yet.</div>
              ) : thread.map(email => {
                const isOut = email.direction === 'outbound';
                const draft = drafts.find(d => d.email_id === email.id);
                return (
                  <div key={email.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOut ? 'flex-end' : 'flex-start', gap: 10 }}>
                    {/* Label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: isOut ? 'var(--text-muted)' : '#60a5fa',
                      }} />
                      <span className="section-heading" style={{ marginBottom: 0, color: isOut ? 'var(--text-muted)' : '#60a5fa' }}>
                        {isOut ? 'Outbound Pitch' : 'Client Reply'} · {formatDate(email.created_at)}
                      </span>
                    </div>

                    {/* Bubble */}
                    <div style={{
                      maxWidth: '75%',
                      background: isOut ? 'var(--bg-elevated)' : 'rgba(96, 165, 250, 0.06)',
                      border: `1px solid ${isOut ? 'var(--border)' : 'rgba(96, 165, 250, 0.2)'}`,
                      borderRadius: 10,
                      padding: '16px 20px',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                        {email.subject}
                      </div>
                      <div
                        style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}
                        dangerouslySetInnerHTML={{ __html: email.body_text }}
                      />
                    </div>

                    {/* Gemini AI Draft */}
                    {!isOut && draft && (
                      <div style={{
                        width: '75%',
                        background: 'rgba(74, 222, 128, 0.04)',
                        border: '1px solid rgba(74, 222, 128, 0.15)',
                        borderRadius: 10,
                        padding: '16px 20px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
                            <span className="section-heading" style={{ marginBottom: 0, color: '#4ade80' }}>AI Draft Response</span>
                          </div>
                          <button
                            onClick={() => { navigator.clipboard.writeText(draft.draft_text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                            className="btn-primary"
                            style={{ fontSize: 11, padding: '4px 12px' }}
                          >
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <textarea
                          value={editingDrafts[draft.id] !== undefined ? editingDrafts[draft.id] : draft.draft_text}
                          onChange={(e) => setEditingDrafts(prev => ({ ...prev, [draft.id]: e.target.value }))}
                          style={{
                            width: '100%',
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '12px 14px',
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            lineHeight: 1.7,
                            height: 160,
                            resize: 'vertical',
                            outline: 'none',
                            fontFamily: 'Inter, sans-serif',
                          }}
                          onFocus={e => e.target.style.borderColor = 'var(--text-muted)'}
                          onBlur={e => e.target.style.borderColor = 'var(--border)'}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                          <button 
                            className="btn-primary" 
                            style={{ fontSize: 12 }}
                            disabled={sending}
                            onClick={async () => {
                              try {
                                setSending(true);
                                const textToSend = editingDrafts[draft.id] !== undefined ? editingDrafts[draft.id] : draft.draft_text;
                                const res = await fetch('/api/send-reply', {
                                  method: 'POST',
                                  body: JSON.stringify({ company_id: selectedCompany.id, text: textToSend }),
                                  headers: { 'Content-Type': 'application/json' }
                                });
                                if (!res.ok) throw new Error(await res.text());
                                
                                // Clean up and refresh thread
                                setEditingDrafts(prev => {
                                  const newState = { ...prev };
                                  delete newState[draft.id];
                                  return newState;
                                });
                                await fetchThread(selectedCompany.id);
                              } catch (err: any) {
                                alert("Failed to send reply: " + err.message);
                              } finally {
                                setSending(false);
                              }
                            }}
                          >
                            {sending ? 'Sending...' : 'Send Reply'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
        }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>✉️</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Select a conversation</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Click a company from the left panel</div>
          </div>
        </div>
      )}
    </div>
  );
}
