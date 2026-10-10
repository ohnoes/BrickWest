#!/bin/bash

set -euo pipefail

echo "🍺 Brickwest Brewmaster — Quick Start"
echo "======================================"

cd "$(dirname "$0")/../backend"

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install Node 20+ from https://nodejs.org"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL not found. Install PostgreSQL 14+ or use Docker (docker/docker-compose.yml)."
    exit 1
fi

echo "✅ Node.js $(node --version)"
echo "✅ $(psql --version)"

echo ""
echo "📦 Setting up backend..."
if [ ! -f .env ]; then
    cp .env.example .env
    # The API refuses to start without a unique JWT secret.
    SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=${SECRET}/" .env && rm -f .env.bak
    echo "   Created backend/.env with a generated JWT_SECRET"
fi
npm ci

echo ""
echo "🗄️  Initializing database..."
DB_NAME=$(grep '^DB_NAME=' .env | cut -d= -f2)
DB_USER=$(grep '^DB_USER=' .env | cut -d= -f2)
export PGPASSWORD=$(grep '^DB_PASSWORD=' .env | cut -d= -f2)
if ! psql -h localhost -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    psql -h localhost -U "$DB_USER" -d postgres -c "CREATE DATABASE \"${DB_NAME}\""
fi
npm run migrate

echo ""
echo "✨ Starting the API on http://localhost:3001 (Ctrl+C to stop)"
echo "   In another terminal, verify it with:  cd backend && npm run smoke"
echo ""
exec npm run dev
