FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY services/notification-service/package*.json ./services/notification-service/
RUN npm ci --workspace=services/notification-service
COPY services/notification-service ./services/notification-service
RUN npm run build --workspace=services/notification-service

FROM node:20-alpine AS runner
WORKDIR /app/services/notification-service
ENV NODE_ENV=production
COPY package*.json /app/
COPY services/notification-service/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/services/notification-service/dist ./dist
EXPOSE 4004
CMD ["node", "dist/index.js"]
