FROM node:20-slim

ENV NODE_ENV=production
ENV PORT=8080
ENV NODE_OPTIONS="--max-old-space-size=512"

WORKDIR /app

# standalone 결과물 복사
COPY .next/standalone/web ./

# static과 public 디렉토리 복사
COPY .next/static ./.next/static
COPY public ./public

# 서버 래퍼 복사
COPY standalone-server.js ./standalone-server.js

EXPOSE 8080

# PORT 환경 변수를 읽는 래퍼를 통해 실행
CMD exec node standalone-server.js
