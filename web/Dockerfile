# Build stage
FROM node:20-slim as builder

WORKDIR /app

# pnpm 설치
RUN npm install -g pnpm

# 의존성 파일 복사
COPY package.json pnpm-lock.yaml ./

# 의존성 설치
RUN pnpm install --frozen-lockfile

# 소스 코드 복사
COPY . .

# 빌드
RUN pnpm build

# Runtime stage
FROM node:20-slim

ENV NODE_ENV=production
ENV PORT=8080
ENV NODE_OPTIONS="--max-old-space-size=512"

WORKDIR /app

# builder stage에서 standalone 결과물 복사
COPY --from=builder /app/.next/standalone/web ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/web/standalone-server.js ./standalone-server.js

EXPOSE 8080

CMD exec node standalone-server.js
