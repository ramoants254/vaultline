FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY web/package*.json ./web/
RUN npm ci --workspace=web
COPY web ./web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=web

FROM node:20-alpine AS runner
WORKDIR /app/web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json /app/
COPY web/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/web/.next ./.next
COPY --from=builder /app/web/public ./public
COPY --from=builder /app/web/next.config.ts ./
EXPOSE 3000
CMD ["npx", "next", "start"]
