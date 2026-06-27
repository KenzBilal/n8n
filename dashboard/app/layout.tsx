import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agency OS | n8n",
  description: "Professional Lead Generation Engine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <div className="flex flex-1">
          <aside className="w-64 border-r border-[var(--border)] p-4 flex flex-col gap-4">
            <h1 className="font-bold text-xl tracking-tight">n8n Engine</h1>
            <nav className="flex flex-col gap-2 mt-8">
              <a href="#" className="px-3 py-2 bg-[var(--muted)] rounded-md font-medium text-sm">Overview</a>
              <a href="#" className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-white transition-colors">Prospects</a>
              <a href="#" className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-white transition-colors">Audits</a>
            </nav>
          </aside>
          <main className="flex-1 p-8 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
