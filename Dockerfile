FROM node:24-alpine AS deps
WORKDIR /app

# Prisma on Alpine needs OpenSSL at runtime/build time
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app

ENV SKIP_ENV_VALIDATION=1

RUN apk add --no-cache openssl libc6-compat

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV SKIP_ENV_VALIDATION=1

RUN apk add --no-cache openssl libc6-compat \
  && addgroup -S nodejs \
  && adduser -S nextjs -G nodejs

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/src/env.js ./src/env.js
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

# Persist files written to /public (e.g. uploads)
VOLUME ["/app/public"]

RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
CMD ["npm", "run", "start"]
