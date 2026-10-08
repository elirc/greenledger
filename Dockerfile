# GreenLedger — single image for web and worker (command decides).
# Deliberately boring: full dependency install + next build; worker runs via tsx.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time env placeholders (real values injected at runtime by compose)
ENV DATABASE_URL=postgres://postgres:postgres@db:5432/greenledger
ENV BETTER_AUTH_SECRET=build-placeholder-secret-0123456789abcdef
ENV BETTER_AUTH_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=http://localhost:3000
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY . .
EXPOSE 3000
CMD ["pnpm", "start"]
