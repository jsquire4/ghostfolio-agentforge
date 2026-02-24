FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npx nx run agent:build:production

# ---- Runtime ----
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist/apps/agent ./dist
COPY --from=builder /app/dist/apps/agent/package.json ./package.json

RUN npm install --omit=dev --ignore-scripts

EXPOSE 8000

CMD ["node", "dist/main.js"]
