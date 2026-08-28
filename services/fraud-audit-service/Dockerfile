FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY services/fraud-audit-service/package*.json ./services/fraud-audit-service/
RUN npm ci --workspace=services/fraud-audit-service
COPY services/fraud-audit-service ./services/fraud-audit-service
RUN npm run build --workspace=services/fraud-audit-service

FROM node:20-alpine AS runner
WORKDIR /app/services/fraud-audit-service
ENV NODE_ENV=production
COPY package*.json /app/
COPY services/fraud-audit-service/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/services/fraud-audit-service/dist ./dist
COPY services/fraud-audit-service/src/db/migrations ./dist/db/migrations
EXPOSE 4005
CMD ["node", "dist/index.js"]
