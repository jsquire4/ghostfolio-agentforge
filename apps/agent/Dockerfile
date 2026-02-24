# Stage 1: Builder — compile native addons
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY dist/apps/agent/ ./
RUN npm install --omit=dev

# Stage 2: Runtime — clean image without build tools
FROM node:22-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app ./
USER appuser
EXPOSE 8000
CMD ["node", "main.js"]
