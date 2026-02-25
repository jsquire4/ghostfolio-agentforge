#!/bin/sh

set -ex

echo "Running database migrations"
npx prisma migrate deploy

echo "Seeding the database"
npx prisma db seed

echo "Starting the agent"
mkdir -p /ghostfolio/apps/agent/data
AGENT_DB_PATH=/ghostfolio/apps/agent/data/insights.db node /ghostfolio/apps/agent/main.js 2>&1 &

echo "Starting the server"
exec node main
