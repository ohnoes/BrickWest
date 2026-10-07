#!/bin/bash

set -e

echo "🍺 Brickwest Brewmaster — Quick Start"
echo "======================================"

# Check prerequisites
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Install from https://nodejs.org"
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL not found. Install PostgreSQL 14+ or use Docker."
    exit 1
fi

echo "✅ Node.js $(node --version)"
echo "✅ PostgreSQL $(psql --version)"

# Setup backend
echo ""
echo "📦 Setting up backend..."
cd backend
cp .env.example .env
npm install

# Initialize database
echo ""
echo "🗄️  Initializing database..."
psql -U postgres -d postgres -f ../scripts/schema.sql

# Start backend
echo ""
echo "🚀 Starting API server..."
npm run dev &
API_PID=$!

# Wait for API to be ready
sleep 3

# Setup mobile
echo ""
echo "📱 Mobile app setup:"
echo "   cd mobile"
echo "   npm install"
echo "   npm run ios    # or android"

echo ""
echo "✨ Brewmaster API running on http://localhost:3001"
echo "   API Docs: /docs/API.md"
echo ""
echo "Press Ctrl+C to stop"

wait $API_PID
