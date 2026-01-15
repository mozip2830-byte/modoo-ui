"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("이메일을 입력해 주세요.");
      return;
    }

    if (!password) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }

    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/");
    } catch (err: unknown) {
      console.error("Signup error:", err);
      const errorCode = (err as { code?: string }).code;
      switch (errorCode) {
        case "auth/email-already-in-use":
          setError("이미 사용 중인 이메일입니다.");
          break;
        case "auth/invalid-email":
          setError("유효하지 않은 이메일 형식입니다.");
          break;
        case "auth/weak-password":
          setError("비밀번호가 너무 약합니다. 더 강력한 비밀번호를 사용해 주세요.");
          break;
        default:
          setError("회원가입에 실패했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">관리자 회원가입</h1>
        <p className="subtitle">새 관리자 계정을 생성합니다</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label">이메일</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="label">비밀번호</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="label">비밀번호 확인</label>
            <input
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 재입력"
              autoComplete="new-password"
            />
          </div>

          {error && <p className="error">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary mt-16"
            disabled={loading}
          >
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <div className="link-row">
          <span>이미 계정이 있으신가요?</span>
          <Link href="/auth/login" className="link">
            로그인
          </Link>
        </div>
      </div>
    </div>
  );
}
