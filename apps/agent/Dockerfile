# Stage 1: Build — compile TypeScript and bundle with webpack
FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx nx build agent --configuration=production

# Stage 2: Deps — install production dependencies from built output
FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY --from=build /app/dist/apps/agent/ ./
RUN npm install --omit=dev

# Stage 3: Runtime — clean image without build tools
FROM node:22-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=deps /app ./
USER appuser
EXPOSE 8000
CMD ["node", "main.js"]
