FROM node:20-slim

ENV NODE_ENV=production
ENV PORT=8080
ENV NODE_OPTIONS="--max-old-space-size=512"

WORKDIR /app

# standalone 결과물 복사 (모노레포와 단일 구조 모두 지원)
COPY .next/standalone/web ./

# static과 public 디렉토리 복사 (존재하지 않으면 무시)
COPY .next/static ./.next/static
COPY public ./public

# 서버 래퍼 복사
COPY server.mjs ./server.mjs

EXPOSE 8080

# 포트 명시적 전달로 서버 실행
CMD exec node server.mjs
