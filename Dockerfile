# Build stage
FROM node:20-slim as builder

WORKDIR /app

# pnpm 설치
RUN npm install -g pnpm@10

# workspace 파일 복사
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web/package.json ./web/

# 의존성 설치
RUN pnpm install --frozen-lockfile

# 전체 소스 복사
COPY . .

# web 패키지 빌드
RUN pnpm -F web build

# Runtime stage
FROM node:20-slim

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

# builder에서 standalone 복사
COPY --from=builder /app/web/.next/standalone/web ./
COPY --from=builder /app/web/.next/static ./.next/static
COPY --from=builder /app/web/public ./public
COPY --from=builder /app/web/standalone-server.js ./

EXPOSE 8080

CMD exec node standalone-server.js
