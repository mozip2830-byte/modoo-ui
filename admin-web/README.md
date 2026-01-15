# Modoo Admin Console

Firebase 기반 관리자 웹 콘솔입니다.

## 실행 방법

```bash
# 의존성 설치
cd admin-web
npm install

# 개발 서버 실행 (포트 3100)
npm run dev
```

브라우저에서 http://localhost:3100 접속

## 주요 기능

### 1. 회원가입 (`/auth/signup`)
- 이메일/비밀번호로 관리자 계정 생성

### 2. 로그인 (`/auth/login`)
- 이메일/비밀번호 로그인

### 3. 메인 페이지 (`/`)
- 로그인된 사용자 정보 표시
  - 이메일
  - UID (복사 버튼)
  - Custom Claims (admin 여부)
- "토큰 새로고침" 버튼으로 claims 갱신

### 4. 운영 페이지 (`/admin`)
- `admin=true` claim이 있어야 접근 가능
- 권한 없으면 "권한 없음" 화면 표시

## 관리자 권한 부여 절차

1. `/auth/signup`에서 계정 생성
2. 메인 페이지에서 UID 복사
3. 터미널에서 admin claim 주입:
   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\keys\modoo-dev-serviceAccount.json"
   node scripts/setAdminClaim.mjs --uid <복사한_UID>
   ```
4. admin-web에서 "토큰 새로고침" 클릭 또는 로그아웃/재로그인
5. `/admin` 페이지 접근 가능

## Firebase 프로젝트

- Project ID: `modoo-dev-70c6b`
- customer/partner 앱과 동일 프로젝트 사용

## 기술 스택

- Next.js 14 (App Router)
- Firebase Auth
- TypeScript
