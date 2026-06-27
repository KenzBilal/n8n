export default function SettingsPage() {
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 className="page-title">Settings</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>
          Environment and configuration
        </p>
      </div>

      <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 12 }}>Supabase</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Project URL</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                oerdfxidukpcyyhzzdbn.supabase.co
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Status</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="status-dot active" />
                <span style={{ fontSize: 12, color: "#4ade80" }}>Connected</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="stat-label" style={{ marginBottom: 12 }}>Worker</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Process</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>n8n-engine (pm2)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Runtime</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>Node.js (local)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>AI Model</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>gemini-2.5-flash</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="stat-label" style={{ marginBottom: 12 }}>Dashboard</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Hosted on</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>Vercel</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Repo</span>
              <a
                href="https://github.com/KenzBilal/n8n"
                target="_blank"
                rel="noreferrer"
                className="mono"
                style={{ fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}
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
