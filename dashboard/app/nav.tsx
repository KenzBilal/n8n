"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, Users, Mail, FileText, BarChart3, Settings } from "lucide-react";

const links = [
  { href: "/", label: "Overview", group: "Main", icon: Globe },
  { href: "/prospects", label: "Prospects", group: "Main", icon: Users },
  { href: "/inbox", label: "Inbox", group: "Main", icon: Mail },
  { href: "/audits", label: "Audits", group: "Main", icon: BarChart3 },
  { href: "/pitches", label: "Pitches", group: "Output", icon: FileText },
  { href: "/settings", label: "Settings", group: null, icon: Settings },
];

export default function Nav() {
  const path = usePathname();

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  const mainLinks = links.filter(l => l.group === "Main");
  const outputLinks = links.filter(l => l.group === "Output");
  const bottomLinks = links.filter(l => l.group === null);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">Webcord</div>

      <div className="sidebar-label">Main</div>
      {mainLinks.map(l => (
        <Link key={l.href} href={l.href} className={`sidebar-link ${isActive(l.href) ? "active" : ""}`}>
          {l.label}
        </Link>
      ))}

      <div className="sidebar-label">Output</div>
      {outputLinks.map(l => (
        <Link key={l.href} href={l.href} className={`sidebar-link ${isActive(l.href) ? "active" : ""}`}>
          {l.label}
        </Link>
      ))}

      <div style={{ marginTop: "auto", paddingTop: 24 }}>
        {bottomLinks.map(l => (
          <Link key={l.href} href={l.href} className={`sidebar-link ${isActive(l.href) ? "active" : ""}`}>
            {l.label}
          </Link>
        ))}
      </div>
    </aside>
  );
}
