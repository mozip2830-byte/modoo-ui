import Link from "next/link";

import { Header } from "@/components/ui/Header";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function HomePage() {
  return (
    <div className="page">
      <Header />

      <section className="hero">
        <div className="container hero-grid">
          <div className="stack">
            <span className="pill">모두의집 · 프리미엄 홈서비스</span>
            <h1 className="headline">
              견적 요청은 빠르게,
              <br />
              파트너 매칭은 정확하게.
            </h1>
            <p className="subtitle">
              원하는 서비스를 선택하고 간편하게 견적을 요청하세요. 신뢰할 수 있는 파트너가
              제안합니다. 더 많은 기능은 앱에서 제공합니다.
            </p>
            <div className="cta-row">
              <Link href="/quote">
                <Button>간편견적 요청</Button>
              </Link>
              <Link href="#apps">
                <Button variant="outline">앱으로 계속하기</Button>
              </Link>
            </div>
            <div className="meta-row">
              <div className="kpi">
                <strong>1분</strong>
                <span className="muted">평균 견적 요청 시간</span>
              </div>
              <div className="kpi">
                <strong>실시간</strong>
                <span className="muted">파트너 응답</span>
              </div>
              <div className="kpi">
                <strong>검증</strong>
                <span className="muted">사업자 인증 파트너</span>
              </div>
            </div>
          </div>

          <Card className="feature-card">
            <h3>간편견적 MVP</h3>
            <p className="muted">
              웹에서는 간편견적 요청까지만 제공됩니다. 채팅, 상세 매칭, 결제/관리 등은 앱에서
              이어집니다.
            </p>
            <ul className="muted">
              <li>필수 정보만 입력</li>
              <li>빠른 요청 생성</li>
              <li>앱으로 이어지는 견적 관리</li>
            </ul>
          </Card>
        </div>
      </section>

      <section id="features" className="section">
        <div className="container grid-3">
          <Card className="feature-card">
            <h3>정돈된 견적 요청</h3>
            <p className="muted">
              서비스 유형과 세부 요청을 명확하게 기록해 파트너가 빠르게 파악할 수 있습니다.
            </p>
          </Card>
          <Card className="feature-card">
            <h3>검증 파트너 매칭</h3>
            <p className="muted">
              사업자 인증과 리뷰 기반 신뢰 지표로 안심하고 선택하세요.
            </p>
          </Card>
          <Card className="feature-card">
            <h3>앱 연동</h3>
            <p className="muted">
              견적 수락, 채팅, 결제는 앱에서 안전하게 이어집니다.
            </p>
          </Card>
        </div>
      </section>

      <section id="apps" className="section">
        <div className="container app-strip">
          <div className="stack">
            <h2>앱에서 더 많은 기능을 확인하세요</h2>
            <p className="muted">
              견적 비교, 실시간 채팅, 결제와 리뷰까지 모두의집 앱에서 제공합니다.
            </p>
          </div>
          <div className="cta-row">
            <Button variant="outline">앱 다운로드</Button>
            <Link href="/partner/login">
              <Button>파트너 로그인</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
