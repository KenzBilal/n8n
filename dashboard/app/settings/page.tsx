'use client';
import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    admin_telegram_number: '',
    auto_pitch_score_threshold: '60',
    telegram_daily_limit: '20',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setSettings(prev => ({ ...prev, ...data })));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_telegram_number: settings.admin_telegram_number,
        auto_pitch_score_threshold: settings.auto_pitch_score_threshold,
        telegram_daily_limit: settings.telegram_daily_limit,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="page-title">Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
          Environment and configuration
        </p>
      </div>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Telegram Controls */}
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 16 }}>Telegram Engine</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Admin Approval Number
              </label>
              <input
                type="text"
                placeholder="+91 9876543210"
                value={settings.admin_telegram_number}
                onChange={e => setSettings(prev => ({ ...prev, admin_telegram_number: e.target.value }))}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Your personal Telegram number that receives client approval notifications.
              </p>
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Auto-Pitch Score Threshold
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="range" min="0" max="100"
                  value={settings.auto_pitch_score_threshold}
                  onChange={e => setSettings(prev => ({ ...prev, auto_pitch_score_threshold: e.target.value }))}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <span style={{
                  fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
                  minWidth: 32, textAlign: 'right',
                }}>{settings.auto_pitch_score_threshold}</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Website scores below this threshold trigger an auto email pitch.
              </p>
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Daily Cold DM Limit
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="range" min="5" max="50"
                  value={settings.telegram_daily_limit}
                  onChange={e => setSettings(prev => ({ ...prev, telegram_daily_limit: e.target.value }))}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <span style={{
                  fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
                  minWidth: 32, textAlign: 'right',
                }}>{settings.telegram_daily_limit}</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Max new cold pitches sent per day (Sniper leads can override this).
              </p>
            </div>

            <button onClick={handleSave} disabled={saving} style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: saved ? '#22c55e' : 'var(--accent)',
              color: '#fff', fontWeight: 600, fontSize: 13,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              alignSelf: 'flex-start', transition: 'background 0.3s',
            }}>
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* System Info (readonly) */}
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 12 }}>Supabase</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Project URL</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                oerdfxidukpcyyhzzdbn.supabase.co
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Status</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="status-dot active" />
                <span style={{ fontSize: 12, color: '#4ade80' }}>Connected</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="stat-label" style={{ marginBottom: 12 }}>Worker</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Process</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>n8n-engine (pm2)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Runtime</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Node.js (local)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>AI Models</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                cohere · groq · gemini
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="stat-label" style={{ marginBottom: 12 }}>Dashboard</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Hosted on</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Vercel</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Repo</span>
              <a
                href="https://github.com/KenzBilal/n8n"
                target="_blank"
                rel="noreferrer"
                className="mono"
                style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none' }}
              >
                KenzBilal/n8n ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
