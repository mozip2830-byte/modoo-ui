# 구글 로그인 설정 안내

## 1) 환경변수 위치
- 루트: `C:\modoo-ui\.env.example` 참고
- 앱별 로컬: `apps/customer/.env.local`, `apps/partner/.env.local`

## 2) 설정 키
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

## 3) 동작 규칙
- 웹: `webClientId`가 없으면 구글 로그인 버튼이 비활성/숨김 처리됨
- 모바일: 플랫폼에 맞는 clientId가 없으면 안내 문구만 표시됨

## 4) 확인 포인트
- 웹 로그인 화면에서 크래시 없이 렌더링
- webClientId가 있으면 구글 로그인 버튼이 노출됨
