FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY gateway/package*.json ./gateway/
RUN npm ci --workspace=gateway
COPY gateway ./gateway
RUN npm run build --workspace=gateway

FROM node:20-alpine AS runner
WORKDIR /app/gateway
ENV NODE_ENV=production
COPY package*.json /app/
COPY gateway/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/gateway/dist ./dist
EXPOSE 8000
CMD ["node", "dist/index.js"]
