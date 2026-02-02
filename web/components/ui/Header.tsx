import Link from "next/link";

import { Button } from "@/components/ui/Button";

type Props = {
  variant?: "customer" | "partner";
};

export function Header({ variant = "customer" }: Props) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          모두의집
        </Link>
        <nav className="nav-links">
          {variant === "customer" ? (
            <>
              <Link href="/quote">간편견적</Link>
              <Link href="#features">서비스</Link>
              <Link href="#apps">앱 설치</Link>
            </>
          ) : null}
        </nav>
        <div className="header-cta">
          <Link href="/partner/login">
            <Button variant="outline">파트너 로그인</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
