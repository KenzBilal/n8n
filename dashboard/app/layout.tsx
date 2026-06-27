import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "n8n | Agency OS",
  description: "Lead generation and audit engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <aside className="sidebar">
          <div className="sidebar-logo">n8n Engine</div>

          <div className="sidebar-label">Main</div>
          <Link href="/" className="sidebar-link active">Overview</Link>
          <Link href="/prospects" className="sidebar-link">Prospects</Link>
          <Link href="/audits" className="sidebar-link">Audits</Link>

          <div className="sidebar-label">Output</div>
          <Link href="/pitches" className="sidebar-link">Pitches</Link>

          <div style={{ marginTop: 'auto', paddingTop: 24 }}>
            <Link href="/settings" className="sidebar-link">Settings</Link>
          </div>
        </aside>

        <main className="main-content">
          {children}
        </main>
      </body>
    </html>
  );
}
