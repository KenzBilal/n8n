'use client';
import { useEffect, useState } from 'react';

type Lead = {
  id: string;
  chat_id: number;
  username: string;
  full_name: string;
  phone: string;
  email: string;
  instagram: string;
  location: string;
  website: string;
  source_group: string;
  category: string;
  status: string;
  chat_history: { role: string; content: string }[];
  ai_summary: string;
  pitch_sent_at: string;
  created_at: string;
  updated_at: string;
};

const TAB_FILTERS: Record<string, string[]> = {
  Leads:     ['PENDING'],
  Active:    ['ACTIVE'],
  Confirmed: ['APPROVED'],
  Rejected:  ['REJECTED', 'SKIPPED_PRIVACY'],
};

const TABS = ['Leads', 'Active', 'Confirmed', 'Rejected'];

const TAB_ACCENT: Record<string, string> = {
  Leads: 'var(--text-primary)',
  Active: '#60a5fa',
  Confirmed: '#4ade80',
  Rejected: '#f87171',
};

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function InfoCell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: value ? 500 : 400 }}>
        {value || '—'}
      </div>
    </div>
  );
}

export default function TelegramPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState('Leads');
  const [approvalQueue, setApprovalQueue] = useState<Lead[]>([]);
  const [approvalIdx, setApprovalIdx] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [animating, setAnimating] = useState<'approve' | 'decline' | null>(null);

  useEffect(() => {
    fetch('/api/telegram/leads')
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setLeads(arr);
        setApprovalQueue(arr.filter((l: Lead) => l.status === 'NEEDS_APPROVAL'));
      })
      .catch(() => {});
  }, []);

  const filtered = leads.filter(l => (TAB_FILTERS[tab] || []).includes(l.status));
  const currentApproval = approvalQueue[approvalIdx] ?? null;

  const handleAction = async (action: 'approve' | 'decline') => {
    if (!currentApproval || actionLoading) return;
    setActionLoading(true);
    setAnimating(action);

    fetch('/api/telegram/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentApproval.id, action }),
    });

    setTimeout(() => {
      setLeads(prev => prev.map(l =>
        l.id === currentApproval.id
          ? { ...l, status: action === 'approve' ? 'APPROVED' : 'REJECTED' }
          : l
      ));
      setApprovalIdx(i => i + 1);
      setAnimating(null);
      setActionLoading(false);
    }, 320);
  };

  const stats = [
    { label: 'Total Leads', value: leads.length, color: 'var(--text-primary)' },
    { label: 'Active', value: leads.filter(l => l.status === 'ACTIVE').length, color: '#60a5fa' },
    { label: 'Pending Review', value: approvalQueue.length, color: '#facc15' },
    { label: 'Confirmed', value: leads.filter(l => l.status === 'APPROVED').length, color: '#4ade80' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, height: 'calc(100vh - 96px)' }}>

      {/* ── LEFT PANEL ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {TABS.map(t => {
            const count = leads.filter(l => (TAB_FILTERS[t] || []).includes(l.status)).length;
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '10px 20px', border: 'none', background: 'transparent',
                fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? TAB_ACCENT[t] : 'var(--text-muted)',
                cursor: 'pointer', position: 'relative',
                borderBottom: active ? `2px solid ${TAB_ACCENT[t]}` : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s ease',
              }}>
                {t}
                {count > 0 && (
                  <span style={{
                    marginLeft: 6, fontSize: 11, fontWeight: 600,
                    background: active ? TAB_ACCENT[t] + '22' : 'var(--bg-secondary)',
                    color: active ? TAB_ACCENT[t] : 'var(--text-muted)',
                    padding: '1px 6px', borderRadius: 99,
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Cards */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
          {filtered.length === 0 && (
            <div style={{
              border: '1px dashed var(--border)', borderRadius: 12, padding: '56px 24px',
              textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
            }}>
              No {tab.toLowerCase()} yet
            </div>
          )}

          {/* ── CONFIRMED CARDS ── */}
          {tab === 'Confirmed' && filtered.map(lead => (
            <div key={lead.id} style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderLeft: '3px solid #4ade80', borderRadius: 12, padding: '20px 22px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: '#16a34a22', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#4ade80', flexShrink: 0,
                }}>
                  {initials(lead.full_name || lead.username || '?')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                      {lead.full_name || lead.username || `User ${lead.chat_id}`}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', fontFamily: 'monospace', letterSpacing: '0.05em', background: '#16a34a11', padding: '2px 6px', borderRadius: 6, border: '1px solid #16a34a22' }}>
                      CLI-{lead.id.substring(0, 6).toUpperCase()}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {lead.category || 'Unknown Category'} · {lead.source_group || '—'}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: '#4ade80',
                  background: '#16a34a18', padding: '4px 10px', borderRadius: 99,
                }}>
                  Confirmed
                </div>
              </div>

              {/* Contact details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 24px', padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 10 }}>
                <InfoCell label="Username" value={lead.username ? `@${lead.username}` : null} />
                <InfoCell label="Phone" value={lead.phone} />
                <InfoCell label="Email" value={lead.email} />
                <InfoCell label="Instagram" value={lead.instagram} />
                <InfoCell label="Location" value={lead.location} />
                <InfoCell label="Website" value={lead.website} />
              </div>

              {/* AI Summary */}
              {lead.ai_summary && (
                <div style={{ background: '#16a34a0d', border: '1px solid #16a34a28', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    What they need
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                    {lead.ai_summary}
                  </div>
                </div>
              )}

              {/* Chat history */}
              {lead.chat_history?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                    Conversation · {lead.chat_history.length} messages
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                    {lead.chat_history.map((msg, i) => (
                      <div key={i} style={{
                        padding: '8px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.55,
                        background: msg.role === 'assistant' ? 'var(--bg-elevated)' : '#16a34a12',
                        color: 'var(--text-primary)', maxWidth: '85%',
                        alignSelf: msg.role === 'assistant' ? 'flex-start' : 'flex-end',
                      }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>
                          {msg.role === 'assistant' ? 'Webcord' : 'Client'}
                        </div>
                        {msg.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                Confirmed {new Date(lead.updated_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          ))}

          {/* ── STANDARD CARDS (Leads / Active / Rejected) ── */}
          {tab !== 'Confirmed' && filtered.map(lead => {
            const days = lead.updated_at ? daysSince(lead.updated_at) : null;
            const accent = tab === 'Rejected' ? '#f87171' : tab === 'Active' ? '#60a5fa' : 'var(--text-muted)';
            return (
              <div key={lead.id} style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${accent}`,
                borderRadius: 12, padding: '18px 20px',
                display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.15s',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: tab === 'Rejected' ? '#f8717122' : tab === 'Active' ? '#60a5fa22' : 'var(--bg-elevated)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: accent,
                }}>
                  {initials(lead.full_name || lead.username || '?')}
                </div>

                {/* Main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lead.full_name || lead.username || `User ${lead.chat_id}`}
                    </div>
                    {lead.username && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>
                        @{lead.username}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {lead.category && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 99 }}>
                        {lead.category}
                      </span>
                    )}
                    {lead.source_group && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        · {lead.source_group}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side */}
                <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  {tab === 'Active' && days !== null && (
                    <div style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                      background: days >= 5 ? '#ef444420' : days >= 3 ? '#f9731620' : 'var(--bg-elevated)',
                      color: days >= 5 ? '#f87171' : days >= 3 ? '#fb923c' : 'var(--text-muted)',
                    }}>
                      {days === 0 ? 'Today' : `${days}d ago`}
                    </div>
                  )}
                  {lead.phone && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lead.phone}</div>
                  )}
                  {tab === 'Rejected' && (
                    <div style={{ fontSize: 11, color: '#f87171', fontWeight: 500 }}>Declined</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflow: 'hidden' }}>

        {/* Stats */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '16px 20px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px',
        }}>
          {stats.map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Approval Queue */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Queue header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Approval Queue
            </div>
            {approvalQueue.length > 0 && (
              <div style={{
                fontSize: 11, fontWeight: 600, color: '#facc15',
                background: '#facc1518', padding: '3px 10px', borderRadius: 99,
              }}>
                {Math.min(approvalIdx + 1, approvalQueue.length)} / {approvalQueue.length}
              </div>
            )}
          </div>

          {!currentApproval ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, gap: 10,
            }}>
              <div style={{ fontSize: 32, opacity: 0.4 }}>✓</div>
              <div>Queue is empty</div>
            </div>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', flex: 1, gap: 14, overflowY: 'auto',
              transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.4,0,0.2,1)',
              opacity: animating ? 0 : 1,
              transform: animating === 'approve'
                ? 'translateX(24px)'
                : animating === 'decline'
                ? 'translateX(-24px)'
                : 'translateX(0)',
            }}>

              {/* Lead header in queue */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  background: '#facc1518', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#facc15',
                }}>
                  {initials(currentApproval.full_name || currentApproval.username || '?')}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {currentApproval.full_name || currentApproval.username || `User ${currentApproval.chat_id}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {currentApproval.category || '—'}
                  </div>
                </div>
              </div>

              {/* Details grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Group', value: currentApproval.source_group },
                  { label: 'Username', value: currentApproval.username ? `@${currentApproval.username}` : null },
                  { label: 'Phone', value: currentApproval.phone },
                  { label: 'Email', value: currentApproval.email },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 12, color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {value || '—'}
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Summary */}
              {currentApproval.ai_summary && (
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>
                    What they need
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.65 }}>
                    {currentApproval.ai_summary}
                  </div>
                </div>
              )}

              {/* Last message */}
              {currentApproval.chat_history?.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>
                    Last Message
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
                    &ldquo;{currentApproval.chat_history[currentApproval.chat_history.length - 1]?.content?.slice(0, 140)}&rdquo;
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 'auto', paddingTop: 4 }}>
                <button
                  onClick={() => handleAction('approve')}
                  disabled={actionLoading}
                  style={{
                    padding: '11px 0', borderRadius: 8, border: 'none',
                    background: '#16a34a', color: '#fff',
                    fontWeight: 600, fontSize: 13, cursor: actionLoading ? 'not-allowed' : 'pointer',
                    opacity: actionLoading ? 0.6 : 1, fontFamily: 'inherit',
                    transition: 'opacity 0.15s',
                  }}
                >
                  Confirm
                </button>
                <button
                  onClick={() => handleAction('decline')}
                  disabled={actionLoading}
                  style={{
                    padding: '11px 0', borderRadius: 8,
                    border: '1px solid #f8717140', background: '#f8717108',
                    color: '#f87171', fontWeight: 600, fontSize: 13,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                    opacity: actionLoading ? 0.6 : 1, fontFamily: 'inherit',
                    transition: 'opacity 0.15s',
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
