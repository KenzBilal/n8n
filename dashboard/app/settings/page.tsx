'use client';
import { useEffect, useState } from 'react';

type Settings = {
  admin_telegram_number: string;
  auto_pitch_score_threshold: string;
  telegram_daily_limit: string;
};

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32, padding: '20px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, unit }: { value: string; onChange: (v: string) => void; min?: number; max?: number; unit?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 80, padding: '7px 12px', borderRadius: 7,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          color: 'var(--text-primary)', fontSize: 13, fontFamily: 'Inter, sans-serif',
          textAlign: 'center', outline: 'none',
          MozAppearance: 'textfield',
        } as React.CSSProperties}
      />
      {unit && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{unit}</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        width: 220, padding: '7px 12px', borderRadius: 7,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        color: 'var(--text-primary)', fontSize: 13, fontFamily: 'Inter, sans-serif',
        outline: 'none',
      }}
    />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    admin_telegram_number: '',
    auto_pitch_score_threshold: '60',
    telegram_daily_limit: '20',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setSettings(prev => ({ ...prev, ...data })))
      .catch(() => {});
  }, []);

  const update = (key: keyof Settings) => (v: string) => setSettings(prev => ({ ...prev, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 36 }}>
        <h1 className="page-title">Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
          System configuration and environment
        </p>
      </div>

      {/* ── Outreach ── */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Outreach</div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '0 22px' }}>
          <Field
            label="Auto-pitch score threshold"
            description="Websites scoring below this value are automatically sent a cold pitch email."
          >
            <NumberInput value={settings.auto_pitch_score_threshold} onChange={update('auto_pitch_score_threshold')} min={0} max={100} unit="/ 100" />
          </Field>
          <Field
            label="Daily cold DM limit"
            description="Maximum number of new cold Telegram pitches sent per day. Sniper leads can exceed this limit."
          >
            <NumberInput value={settings.telegram_daily_limit} onChange={update('telegram_daily_limit')} min={1} max={100} unit="per day" />
          </Field>
        </div>
      </section>

      {/* ── Telegram ── */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Telegram</div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '0 22px' }}>
          <Field
            label="Admin approval number"
            description="Your personal Telegram number that receives deal-ready lead notifications for approval."
          >
            <TextInput value={settings.admin_telegram_number} onChange={update('admin_telegram_number')} placeholder="+91 9876543210" />
          </Field>
        </div>
      </section>

      {/* ── Save ── */}
      <div style={{ marginBottom: 48 }}>
        <button onClick={handleSave} disabled={saving} style={{
          padding: '10px 28px', borderRadius: 8, border: 'none',
          background: saved ? '#22c55e' : 'var(--text-primary)',
          color: saved ? '#fff' : 'var(--bg)',
          fontWeight: 600, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.7 : 1, fontFamily: 'Inter, sans-serif',
          transition: 'background 0.3s',
        }}>
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save changes'}
        </button>
      </div>

      {/* ── Infrastructure ── */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Infrastructure</div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '0 22px' }}>
          <InfoRow label="Database" value="oerdfxidukpcyyhzzdbn.supabase.co" />
          <InfoRow label="Dashboard" value="Vercel (iad1)" />
          <InfoRow label="Worker" value="Node.js · PM2 · Local" />
          <InfoRow label="Repository" value="github.com/KenzBilal/n8n" />
        </div>
      </section>

      {/* ── AI Models ── */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>AI Models</div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '0 22px' }}>
          <InfoRow label="Extractor" value="Cohere · command-r-plus (via OpenRouter)" />
          <InfoRow label="Auditor" value="Cohere · command-r-plus" />
          <InfoRow label="Strategist" value="Groq · llama-3.1-8b-instant" />
          <InfoRow label="Copywriter (Email)" value="Google · gemini-2.5-flash" />
          <InfoRow label="Sales Agent (Telegram)" value="Google · gemini-2.5-flash (isolated key)" />
        </div>
      </section>
    </div>
  );
}
