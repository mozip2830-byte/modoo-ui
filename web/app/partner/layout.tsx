"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PartnerGuard } from "@/components/PartnerGuard";
import { Button } from "@/components/ui/Button";

const navItems = [
  { href: "/partner", label: "대시보드" },
  { href: "/partner/requests", label: "요청관리" },
  { href: "/partner/chats", label: "채팅" },
  { href: "/partner/points", label: "포인트" },
  { href: "/partner/settings", label: "설정" }
];

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <PartnerGuard>
      <div className="partner-shell">
        <aside className="partner-sidebar">
          <Link href="/" className="brand">
            모두의집 Partner
          </Link>
          <nav className="partner-nav">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`partner-link ${pathname === item.href ? "active" : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="partner-main">
          <div className="topbar">
            <h2>파트너 콘솔</h2>
            <Button variant="soft">알림</Button>
          </div>
          {children}
        </main>
      </div>
    </PartnerGuard>
  );
}
