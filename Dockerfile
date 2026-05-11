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
RUN npx prisma generate
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
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/env.js ./src/env.js
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/public/pictures/placeholder.jpg /opt/default-assets/placeholder.jpg
COPY --from=builder /app/public/favicon.ico /opt/default-assets/favicon.ico
COPY --from=builder /app/public/icons/microsoft-icon.png /opt/default-assets/microsoft-icon.png
COPY --from=builder /app/public/images/htl-login-background.jpg /opt/default-assets/htl-login-background.jpg

# Persist files written to /public (e.g. uploads)
VOLUME ["/app/public"]

RUN mkdir -p /app/public/data \
  && chown -R nextjs:nodejs /app \
  && chmod -R 775 /app/public/data
USER nextjs

EXPOSE 3000
CMD ["sh", "-c", "mkdir -p /app/public/pictures /app/public/icons /app/public/images && [ -f /app/public/pictures/placeholder.jpg ] || cp /opt/default-assets/placeholder.jpg /app/public/pictures/placeholder.jpg; [ -f /app/public/favicon.ico ] || cp /opt/default-assets/favicon.ico /app/public/favicon.ico; [ -f /app/public/icons/microsoft-icon.png ] || cp /opt/default-assets/microsoft-icon.png /app/public/icons/microsoft-icon.png; [ -f /app/public/images/htl-login-background.jpg ] || cp /opt/default-assets/htl-login-background.jpg /app/public/images/htl-login-background.jpg; npm run db:migrate && npx prisma generate && npm run start"]
