# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S dewa && adduser -S dewa -G dewa
COPY --from=build --chown=dewa:dewa /app/node_modules ./node_modules
COPY --from=build --chown=dewa:dewa /app/dist ./dist
COPY --chown=dewa:dewa drizzle ./drizzle
COPY --chown=dewa:dewa package.json ./
USER dewa
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
# Apply pending migrations, then start the API.
CMD ["sh", "-c", "node dist/database/migrate.js && node dist/main.js"]
