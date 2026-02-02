# Firebase App Hosting 배포 체크리스트

## 🔧 수정된 사항

### 1. Firebase 설정 (firebase.json)
- ✅ `apphosting` 섹션 추가됨
- ✅ 배포 위치: `asia-northeast3`

### 2. Docker 설정
- ✅ 루트 디렉토리 Dockerfile 생성 (멀티스테이지 빌드)
- ✅ web/Dockerfile 개선 (헬스체크, 환경변수, 소스맵)
- ✅ .dockerignore 파일 생성

### 3. 빌드 스크립트
- ✅ web/scripts/postbuild-standalone.mjs 개선
  - 빌드 디렉토리 검증 강화
  - server.js 존재 확인
  - 에러 메시지 명확화

### 4. Package.json 설정
- ✅ start 스크립트에 소스맵 활성화
- ✅ start:prod 스크립트 추가

## 📋 배포 전 필수 설정

### Firebase 콘솔에서 환경변수 설정 필요:

#### 서버 환경변수 (Runtime)
```
FIREBASE_ADMIN_PROJECT_ID = modoo-dev-70c6b
FIREBASE_ADMIN_CLIENT_EMAIL = firebase-adminsdk-xxx@modoo-dev-70c6b.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY = -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

#### 클라이언트 환경변수 (Public)
```
NEXT_PUBLIC_FIREBASE_API_KEY = xxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = modoo-dev-70c6b.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID = modoo-dev-70c6b
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = modoo-dev-70c6b.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = xxx
NEXT_PUBLIC_FIREBASE_APP_ID = xxx
```

### Firebase 콘솔 설정 단계:

1. **Firebase Console** → **App Hosting** 섹션 열기
2. **Create web service** 또는 기존 서비스 선택
3. **Environment variables** 탭에서:
   - 위의 모든 환경변수 추가
   - 서버 변수와 공개 변수 구분

4. **Deploy** 버튼으로 배포 시작

## 🐛 배포 오류 발생 시 확인사항

### 포트 이슈 (PORT=8080)
✅ **해결됨:**
- Dockerfile에서 `PORT=8080` 설정
- 헬스체크 추가로 포트 바인딩 검증
- `sh -c` 사용으로 환경변수 전달 보장

### 빌드 실패
✅ **확인:**
- postbuild-standalone.mjs에서 server.js 존재 확인
- standalone 디렉토리 구조 검증
- 자세한 에러 로그 출력

### 환경변수 누락
✅ **확인할 항목:**
- Firebase Admin SDK 환경변수 설정 여부
- 모든 `NEXT_PUBLIC_*` 변수 설정 여부
- Firebase Console에서 Runtime 환경변수 설정 여부

## 📊 배포 프로세스

```
1. GitHub에 코드 푸시
   ↓
2. Firebase App Hosting 자동 감지
   ↓
3. 루트 Dockerfile 빌드 시작
   ├─ Builder 단계: Node 20-slim에서 pnpm install & build
   └─ Runtime 단계: 빌드 결과물 복사 및 서버 시작
   ↓
4. Cloud Run에 배포
   ├─ PORT=8080 수신 대기
   └─ 헬스체크 검증 (40초 타임아웃)
   ↓
5. 배포 완료
```

## 🔍 배포 후 검증

배포 완료 후:
1. Cloud Run 리비전 상태 확인 (Ready 상태 확인)
2. 헬스체크 통과 확인
3. App Hosting URL로 접속 테스트
4. API 라우트 테스트 (예: `/api/points/balance`)

## 🚀 수동 배포 명령어

로컬에서 테스트:
```bash
# 루트 디렉토리에서
docker build -t modoo-ui:latest .
docker run -p 8080:8080 \
  -e FIREBASE_ADMIN_PROJECT_ID=modoo-dev-70c6b \
  -e FIREBASE_ADMIN_CLIENT_EMAIL=... \
  -e FIREBASE_ADMIN_PRIVATE_KEY=... \
  -e NEXT_PUBLIC_FIREBASE_API_KEY=... \
  modoo-ui:latest
```

Firebase에 배포:
```bash
firebase deploy --only apphosting
```

## ⚠️ 알려진 제한사항

- **빌드 타임**: 초기 빌드는 5-10분 소요 가능
- **메모리**: NODE_OPTIONS="--max-old-space-size=512" 설정
- **소스맵**: `--enable-source-maps` 활성화로 디버깅 지원
