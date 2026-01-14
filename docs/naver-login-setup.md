# 네이버 로그인 설정 안내

이 문서는 네이버 로그인 연동을 위해 필요한 최소 설정을 정리합니다.

## 1) 네이버 개발자 콘솔 설정
1. 네이버 개발자센터에서 애플리케이션을 생성합니다.
2. 서비스 URL과 로그인 오픈 API를 활성화합니다.
3. Callback URL(리다이렉트 URI)을 등록합니다.

## 2) 필요한 환경 변수
아래 환경 변수를 `.env` 또는 배포 환경에 등록합니다.
- `EXPO_PUBLIC_NAVER_CLIENT_ID`
- `EXPO_PUBLIC_NAVER_CLIENT_SECRET` (필요 시)
- `EXPO_PUBLIC_NAVER_REDIRECT_URI`

## 3) 리다이렉트 URI 예시
- 개발(Expo Go): `https://auth.expo.io/@{expoAccount}/{appSlug}`
- 웹: `https://your-domain.com/auth/callback`
- 네이티브: 앱 스킴 기반 URI

## 4) 테스트 체크리스트
1. 네이버 로그인 버튼 클릭 시 인증 페이지가 열린다.
2. 로그인 완료 후 앱으로 복귀한다.
3. 고객/파트너 각 앱에서 사용자 문서가 생성된다.

## 5) 현재 상태
네이버 로그인은 UI/안내는 완료되었고, 실제 OAuth 연동을 위해 위 설정이 필요합니다.
