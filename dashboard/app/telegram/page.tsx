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

const STATUS_COLORS: Record<string, string> = {
  NEEDS_APPROVAL: '#f59e0b',
  ACTIVE: '#3b82f6',
  PENDING: '#6b7280',
  APPROVED: '#22c55e',
  HUMAN_TAKEOVER: '#a855f7',
};

export default function TelegramPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetch('/api/telegram/leads')
      .then(r => r.json())
      .then(data => {
        setLeads(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (action: string) => {
    if (!selected) return;
    setActionLoading(true);
    await fetch('/api/telegram/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, action }),
    });
    setLeads(prev => action === 'decline'
      ? prev.filter(l => l.id !== selected.id)
      : prev.map(l => l.id === selected.id ? {
          ...l,
          status: action === 'approve' ? 'APPROVED' : 'HUMAN_TAKEOVER'
        } : l)
    );
    if (action === 'decline') setSelected(null);
    setActionLoading(false);
  };

  const filtered = filter === 'ALL' ? leads : leads.filter(l => l.status === filter);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">Leads</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
          Contacts discovered and managed by the Webcord outreach engine
        </p>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {['ALL', 'NEEDS_APPROVAL', 'ACTIVE', 'PENDING', 'APPROVED', 'HUMAN_TAKEOVER'].map(s => {
          const count = s === 'ALL' ? leads.length : leads.filter(l => l.status === s).length;
          const labels: Record<string, string> = {
            ALL: 'All', NEEDS_APPROVAL: 'Needs Approval', ACTIVE: 'Active',
            PENDING: 'Pending', APPROVED: 'Approved', HUMAN_TAKEOVER: 'Taken Over',
          };
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              background: filter === s ? '#f0f0f0' : 'var(--bg-secondary)',
              border: `1px solid ${filter === s ? '#f0f0f0' : 'var(--border)'}`,
              borderRadius: 8, padding: '6px 14px', fontSize: 12,
              color: filter === s ? '#0a0a0a' : 'var(--text-secondary)',
              cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span>{labels[s]}</span>
              <span style={{
                background: filter === s ? 'rgba(0,0,0,0.15)' : 'var(--bg-elevated)',
                borderRadius: 10, padding: '1px 7px', fontSize: 11,
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '340px 1fr' : '1fr', gap: 16 }}>
        {/* Lead List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Loading leads...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>
              No leads yet. The Telegram Hunter is searching...
            </div>
          )}
          {filtered.map(lead => (
            <div key={lead.id} onClick={() => setSelected(lead)} style={{
              background: selected?.id === lead.id ? 'var(--bg-elevated)' : 'var(--bg-secondary)',
              border: `1px solid ${selected?.id === lead.id ? '#f0f0f0' : 'var(--border)'}`,
              borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              transition: 'all 0.15s',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {lead.full_name || lead.username || `@user_${lead.chat_id}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {lead.category || 'Uncategorized'} · {lead.source_group || 'Unknown Group'}
                </div>
              </div>
              <div style={{
                fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 6,
                background: (STATUS_COLORS[lead.status] || '#6b7280') + '22',
                color: STATUS_COLORS[lead.status] || '#6b7280',
                whiteSpace: 'nowrap',
              }}>
                {lead.status?.replace(/_/g, ' ')}
              </div>
            </div>
          ))}
        </div>

        {/* Detail Panel */}
        {selected && (
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 20,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {selected.full_name || selected.username || `@user_${selected.chat_id}`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {selected.category} · {selected.source_group}
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '4px 10px', fontSize: 12,
                color: 'var(--text-muted)', cursor: 'pointer',
              }}>✕</button>
            </div>

            {/* AI Summary */}
            {selected.ai_summary && (
              <div style={{
                background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: 8, padding: 14,
              }}>
                <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, marginBottom: 6 }}>AI SUMMARY</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  {selected.ai_summary}
                </div>
              </div>
            )}

            {/* Contact Card */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>CONTACT INFO</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Username', value: selected.username ? `@${selected.username}` : null },
                  { label: 'Phone', value: selected.phone },
                  { label: 'Email', value: selected.email },
                  { label: 'Instagram', value: selected.instagram },
                  { label: 'Location', value: selected.location },
                  { label: 'Website', value: selected.website },
                ].map(({ label, value }) => value ? (
                  <div key={label} style={{
                    background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px',
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{value}</div>
                  </div>
                ) : null)}
              </div>
            </div>

            {/* Chat Transcript */}
            {selected.chat_history && selected.chat_history.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 10 }}>CONVERSATION</div>
                <div style={{
                  maxHeight: 300, overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 8,
                  padding: '4px 0',
                }}>
                  {selected.chat_history.map((msg, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: msg.role === 'assistant' ? 'flex-start' : 'flex-end',
                    }}>
                      <div style={{
                        maxWidth: '80%', padding: '8px 12px', borderRadius: 10,
                        background: msg.role === 'assistant' ? 'var(--bg-elevated)' : '#f0f0f0',
                        color: msg.role === 'assistant' ? 'var(--text-primary)' : '#0a0a0a',
                        fontSize: 12, lineHeight: 1.5,
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {selected.status === 'NEEDS_APPROVAL' && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => handleAction('approve')} disabled={actionLoading} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                  background: '#22c55e', color: '#fff', fontWeight: 600, fontSize: 13,
                  cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1,
                }}>
                  ✓ Approve
                </button>
                <button onClick={() => handleAction('takeover')} disabled={actionLoading} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: '1px solid #a855f7', background: 'transparent',
                  color: '#a855f7', fontWeight: 600, fontSize: 13,
                  cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1,
                }}>
                  ↗ Take Over
                </button>
                <button onClick={() => handleAction('decline')} disabled={actionLoading} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: '#ef4444', fontWeight: 600, fontSize: 13,
                  cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading ? 0.7 : 1,
                }}>
                  ✕ Decline
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
