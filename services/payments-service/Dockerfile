FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY services/payments-service/package*.json ./services/payments-service/
RUN npm ci --workspace=services/payments-service
COPY services/payments-service ./services/payments-service
RUN npm run build --workspace=services/payments-service

FROM node:20-alpine AS runner
WORKDIR /app/services/payments-service
ENV NODE_ENV=production
COPY package*.json /app/
COPY services/payments-service/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/services/payments-service/dist ./dist
EXPOSE 4003
CMD ["node", "dist/main.js"]
