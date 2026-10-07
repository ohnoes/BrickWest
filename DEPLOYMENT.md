# Brickwest Brewmaster — Deployment Guide

## Environment Constraints

This Raspberry Pi runs Hermes but **lacks Node.js, npm, and Docker** for local compilation. 

**Solution:** Build on a dev machine or cloud container, then deploy pre-built artifacts.

---

## Option 1: Build on Development Machine (Recommended)

### Prerequisites
- **Node.js 18+** (`node --version`)
- **PostgreSQL 14+** (`psql --version`)
- **Git**

### Steps

#### 1. Clone & Setup Backend
```bash
cd /path/to/brickwest-platform/backend
cp .env.example .env

# Edit .env with your database credentials
nano .env
```

#### 2. Install Dependencies
```bash
npm install
```

#### 3. Create PostgreSQL Database
```bash
psql -U postgres -c "CREATE DATABASE brickwest_brewmaster;"
psql -U postgres -d brickwest_brewmaster -f ../scripts/schema.sql
```

#### 4. Test Backend
```bash
npm run dev
# API should start on http://localhost:3001
# Press Ctrl+C to stop
```

#### 5. Build Production Backend
```bash
# Create production-ready bundle
npm run build  # (if you add a build step)
# or just commit the src/ directory as-is (Node doesn't need compilation)
```

#### 6. Setup Mobile App
```bash
cd /path/to/brickwest-platform/mobile
npm install
```

#### 7. Build Mobile for iOS/Android
```bash
# iOS
npm run ios

# Android
npm run android
```

---

## Option 2: Deploy via Cloud (Heroku, Railway, AWS, DigitalOcean)

### Using Railway (Easiest)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy backend
cd backend
railway up

# Deploy mobile separately (iOS/Android builds)
```

### Using Heroku
```bash
# Create app
heroku create brickwest-brewmaster

# Set environment variables
heroku config:set JWT_SECRET=your-production-secret
heroku config:set DB_HOST=your-postgres-host

# Deploy
git push heroku main
```

---

## Option 3: Pre-Built Artifacts (No Dependencies)

For the Raspberry Pi without Node.js installed:

### Build on Another Machine
```bash
# On a dev machine with Node.js installed:
npm install
npm run build  # Creates dist/

# Create tarball
tar -czf brickwest-backend.tar.gz dist/ node_modules/ package*.json

# Transfer to Pi
scp brickwest-backend.tar.gz hermes@raspberrypi:/home/hermes/
```

### Deploy on Raspberry Pi
```bash
# Extract
tar -xzf brickwest-backend.tar.gz -C /home/hermes/brickwest-platform/backend

# Start (assuming Node.js installed separately)
cd /home/hermes/brickwest-platform/backend
node src/index.js
```

---

## Option 4: Docker Deployment (If Docker Becomes Available)

```bash
docker-compose -f docker/docker-compose.yml up -d
```

This will:
1. Start PostgreSQL 16
2. Create database
3. Initialize schema
4. Run Node.js API on port 3001

---

## Production Checklist

- [ ] Change `JWT_SECRET` in `.env`
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS (let's Encrypt + nginx)
- [ ] Configure `FRONTEND_URL` correctly
- [ ] Set up database backups
- [ ] Enable error logging (Sentry, LogRocket)
- [ ] Rate limit API endpoints
- [ ] Use strong database password
- [ ] Enable CORS appropriately (not `*`)

---

## API Health Check

```bash
curl http://localhost:3001/health
# Response: {"status": "ok", "timestamp": "..."}
```

---

## Mobile App Store Deployment

### iOS (App Store)
```bash
cd mobile
npm run ios -- --configuration Release
# Use Xcode to sign and submit to App Store
```

### Android (Google Play)
```bash
cd mobile
npm run android -- --variant release
# Sign with your keystore
# Upload to Google Play Console
```

---

## Database Migrations (Future)

When adding new tables/columns:

1. Create migration file: `scripts/migrate_YYYY_MM_DD.sql`
2. Run: `psql -d brickwest_brewmaster -f scripts/migrate_YYYY_MM_DD.sql`
3. Test thoroughly
4. Commit to git

---

## Monitoring & Logging

### Backend Logs
```bash
# Development
npm run dev

# Production (with PM2)
pm2 start src/index.js --name "brewmaster-api"
pm2 logs brewmaster-api
```

### Database Logs
```bash
psql -d brickwest_brewmaster -c "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `npm: command not found` | Install Node.js from nodejs.org |
| `psql: command not found` | Install PostgreSQL |
| `Port 3001 already in use` | `lsof -i :3001` and kill process or use different port |
| `Connection refused` | Check PostgreSQL is running, database exists |
| `JWT errors` | Verify `JWT_SECRET` matches frontend/mobile |
| `CORS errors` | Update `FRONTEND_URL` in `.env` |

---

## Next: Automated CI/CD

Once deployed, set up GitHub Actions for:
1. Automated tests on push
2. Build & push Docker image
3. Deploy to production on tag
4. Database migrations

See `.github/workflows/` for templates.
