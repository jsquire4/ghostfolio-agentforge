# Pre-built agent image.
# Build locally first: npx nx build agent
# Then: docker build -f apps/agent/Dockerfile -t ghostfolio-agent .
FROM node:22-alpine

# Install build tools for native addons (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy the pre-built output (includes generated package.json with prod deps)
COPY dist/apps/agent/ ./

RUN npm install --omit=dev

EXPOSE 8000

CMD ["node", "main.js"]
