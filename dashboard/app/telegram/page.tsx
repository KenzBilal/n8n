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
};

const TAB_FILTERS: Record<string, string[]> = {
  Leads:    ['PENDING'],
  Active:   ['ACTIVE'],
  Rejected: ['REJECTED', 'SKIPPED_PRIVACY'],
};

export default function TelegramPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState('Leads');
  const [approvalQueue, setApprovalQueue] = useState<Lead[]>([]);
  const [approvalIdx, setApprovalIdx] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

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
    if (!currentApproval) return;
    setActionLoading(true);
    await fetch('/api/telegram/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentApproval.id, action }),
    });
    setLeads(prev => prev.map(l =>
      l.id === currentApproval.id
        ? { ...l, status: action === 'approve' ? 'APPROVED' : 'REJECTED' }
        : l
    ));
    setApprovalIdx(i => i + 1);
    setActionLoading(false);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, height: 'calc(100vh - 96px)' }}>

      {/* ── LEFT: Leads List ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, alignSelf: 'flex-start' }}>
          {['Leads', 'Active', 'Rejected'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 18px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 500,
              background: tab === t ? 'var(--bg-elevated)' : 'transparent',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}>
              {t}
              <span style={{
                marginLeft: 7, fontSize: 11,
                color: tab === t ? 'var(--text-secondary)' : 'var(--text-muted)',
              }}>
                {leads.filter(l => (TAB_FILTERS[t] || []).includes(l.status)).length}
              </span>
            </button>
          ))}
        </div>

        {/* Cards */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
          {filtered.length === 0 && (
            <div style={{
              border: '1px dashed var(--border)', borderRadius: 12, padding: '48px 24px',
              textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
            }}>
              No {tab.toLowerCase()} yet
            </div>
          )}
          {filtered.map(lead => (
            <div key={lead.id} style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '20px 22px',
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 24px',
            }}>
              {/* Row 1 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Name</div>
                  {tab === 'Active' && lead.updated_at && (
                    <div style={{ fontSize: 9, background: 'var(--border)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                      Wait: {Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86400000)}d
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {lead.full_name || lead.username || '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Business</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {lead.category || '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Channel / Group</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {lead.source_group || '—'}
                </div>
              </div>

              {/* Row 2 */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Username</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {lead.username ? `@${lead.username}` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Phone</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {lead.phone || '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>User ID</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {lead.chat_id || '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: Stats + Approval Panel ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

        {/* Stats */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '20px 22px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        }}>
          {[
            { label: 'Total Leads', value: leads.length },
            { label: 'Active Chats', value: leads.filter(l => l.status === 'ACTIVE').length },
            { label: 'Pending Review', value: approvalQueue.length },
            { label: 'Approved', value: leads.filter(l => l.status === 'APPROVED').length },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Approval Panel */}
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '20px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16,
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Approval Queue
            </div>
            {approvalQueue.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {Math.min(approvalIdx + 1, approvalQueue.length)} / {approvalQueue.length}
              </div>
            )}
          </div>

          {!currentApproval ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, gap: 8,
            }}>
              <div style={{ fontSize: 28 }}>✓</div>
              <div>No pending approvals</div>
            </div>
          ) : (
            <>
              {/* Client Info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {currentApproval.full_name || currentApproval.username || `User ${currentApproval.chat_id}`}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Business', value: currentApproval.category },
                    { label: 'Group', value: currentApproval.source_group },
                    { label: 'Phone', value: currentApproval.phone },
                    { label: 'Username', value: currentApproval.username ? `@${currentApproval.username}` : null },
                  ].filter(r => r.value).map(({ label, value }) => (
                    <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* AI Summary */}
                {currentApproval.ai_summary && (
                  <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>What they need</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                      {currentApproval.ai_summary}
                    </div>
                  </div>
                )}

                {/* Last Message */}
                {currentApproval.chat_history?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Last message</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.5 }}>
                      "{currentApproval.chat_history[currentApproval.chat_history.length - 1]?.content?.slice(0, 120)}..."
                    </div>
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
                <button
                  onClick={() => handleAction('approve')}
                  disabled={actionLoading}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 8, border: 'none',
                    background: '#f0f0f0', color: '#0a0a0a', fontWeight: 600, fontSize: 13,
                    cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1,
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction('decline')}
                  disabled={actionLoading}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: '#ef4444', fontWeight: 600, fontSize: 13,
                    cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.6 : 1,
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  Decline
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
