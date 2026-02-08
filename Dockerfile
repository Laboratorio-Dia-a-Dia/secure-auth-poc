# ========================================
# Stage 1: Builder
# ========================================
FROM node:25-alpine AS builder

WORKDIR /app

# Copia arquivos de dependências
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Instala dependências
RUN npm ci

# Copia o código fonte
COPY . .

# Gera Prisma Client
RUN npx prisma generate

# Build do TypeScript
RUN npm run build

# ========================================
# Stage 2: Runtime
# ========================================
FROM node:25-alpine

# Install wget for healthchecks
RUN apk add --no-cache wget

# Adiciona usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Copia apenas o necessário do builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Copia script de entrypoint
COPY --chown=nodejs:nodejs docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Muda para usuário não-root
USER nodejs

EXPOSE 3000

ENV NODE_ENV=production

# Healthcheck
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --spider -q http://localhost:3000/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
