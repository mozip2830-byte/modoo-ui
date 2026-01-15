"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/");
    } catch (err: unknown) {
      console.error("Login error:", err);
      const errorCode = (err as { code?: string }).code;
      switch (errorCode) {
        case "auth/user-not-found":
        case "auth/wrong-password":
        case "auth/invalid-credential":
          setError("이메일 또는 비밀번호가 올바르지 않습니다.");
          break;
        case "auth/invalid-email":
          setError("유효하지 않은 이메일 형식입니다.");
          break;
        case "auth/too-many-requests":
          setError("너무 많은 시도가 있었습니다. 잠시 후 다시 시도해 주세요.");
          break;
        default:
          setError("로그인에 실패했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">관리자 로그인</h1>
        <p className="subtitle">Modoo Admin Console</p>

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
              placeholder="비밀번호"
              autoComplete="current-password"
            />
          </div>

          {error && <p className="error">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary mt-16"
            disabled={loading}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className="link-row">
          <span>계정이 없으신가요?</span>
          <Link href="/auth/signup" className="link">
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}
