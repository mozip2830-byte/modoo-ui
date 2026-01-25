"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "관리자 메인" },
  { href: "/admin/users", label: "회원 관리" },
  { href: "/admin/support", label: "고객 지원" },
  { href: "/admin/banners", label: "홈 배너" },
  { href: "/admin/logs", label: "입찰권 로그" },
  { href: "/admin/ads", label: "광고 입찰" },
  { href: "/admin/reviews", label: "리뷰 관리" },
];

const TITLE_MAP: Record<string, string> = {
  "/admin": "관리자메인",
  "/admin/users": "회원 관리",
  "/admin/support": "고객 지원",
  "/admin/banners": "홈 배너",
  "/admin/logs": "입찰권 로그",
  "/admin/ads": "광고 입찰",
  "/admin/reviews": "리뷰 관리",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const title = TITLE_MAP[pathname] ?? "관리자메인";

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-profile">
          <div className="admin-avatar" />
          <div className="admin-name">MOD00</div>
        </div>
        <nav className="admin-nav">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-item${active ? " active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <span className="admin-topbar-burger">≡</span>
            <span className="admin-topbar-title">{title}</span>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
