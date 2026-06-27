import "./globals.css";
import type { Metadata } from "next";
import Nav from "./nav";

export const metadata: Metadata = {
  title: "n8n | Agency OS",
  description: "Lead generation and audit engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="main-content">{children}</main>
      </body>
    </html>
  );
}
