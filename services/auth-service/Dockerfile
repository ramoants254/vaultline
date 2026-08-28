FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY services/auth-service/package*.json ./services/auth-service/
RUN npm ci --workspace=services/auth-service
COPY services/auth-service ./services/auth-service
RUN npm run build --workspace=services/auth-service

FROM node:20-alpine AS runner
WORKDIR /app/services/auth-service
ENV NODE_ENV=production
COPY package*.json /app/
COPY services/auth-service/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/services/auth-service/dist ./dist
COPY services/auth-service/src/db/migrations ./dist/db/migrations
EXPOSE 4001
CMD ["node", "dist/index.js"]
