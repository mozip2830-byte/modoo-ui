FROM node:20-slim

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=512"

WORKDIR /app

# standalone 결과물 복사
COPY .next/standalone/web ./

# static과 public 디렉토리 복사
COPY .next/static ./.next/static
COPY public ./public

EXPOSE 3000

# standalone server 실행
CMD exec node server.js
