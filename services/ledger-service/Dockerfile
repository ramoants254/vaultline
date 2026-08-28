FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY services/ledger-service/package*.json ./services/ledger-service/
RUN npm ci --workspace=services/ledger-service
COPY services/ledger-service ./services/ledger-service
RUN npm run build --workspace=services/ledger-service

FROM node:20-alpine AS runner
WORKDIR /app/services/ledger-service
ENV NODE_ENV=production
COPY package*.json /app/
COPY services/ledger-service/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/services/ledger-service/dist ./dist
COPY services/ledger-service/src/database/migrations ./dist/database/migrations
EXPOSE 4002
CMD ["node", "dist/main.js"]
