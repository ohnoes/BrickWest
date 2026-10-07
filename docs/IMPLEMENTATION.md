# Brickwest Brewmaster App — Implementation Guide

## Overview

Full-stack brewmaster production app for Brickwest Brewing:
- **Backend API** (Node.js + Express + PostgreSQL) 
- **Mobile App** (React Native iOS/Android)
- **Real-time fermentation tracking** with graphs & alerts
- **Team collaboration** tools
- **Offline support** with sync

---

## What's Built

### Backend (`/backend`)
- ✅ Express API with JWT auth
- ✅ PostgreSQL schema (recipes, batches, fermentation logs)
- ✅ REST endpoints for batch/recipe management
- ✅ WebSocket real-time updates
- ✅ Docker setup

**Key Files:**
- `src/index.js` — Express server + Socket.io
- `src/routes/` — API endpoints
- `src/models/` — Database queries (Batch, Recipe)
- `src/middleware/auth.js` — JWT verification
- `scripts/schema.sql` — Database tables + indexes

### Mobile App (`/mobile`)
- ✅ React Native navigation (tabs + stack)
- ✅ Login/Register screens
- ✅ **Batches screen** — List, filter, search
- ✅ **Batch detail** — Fermentation logging form
- ✅ **Reading history** — Chronological logs with timestamps
- ✅ **Recipes screen** — Reference recipes
- ✅ **Settings** — User profile, logout
- ✅ Offline caching with AsyncStorage

**Key Files:**
- `App.js` — Entry point
- `src/navigation/RootNavigator.js` — Tab navigation
- `src/screens/` — UI screens
- `package.json` — React Native dependencies

### Documentation
- ✅ `docs/SETUP.md` — Local dev + Docker deployment
- ✅ `docs/API.md` — Complete API reference
- ✅ `docs/DATA_MODELS.md` — Database schema

---

## Quick Start

### 1. Backend (5 min)
```bash
cd backend
cp .env.example .env
npm install
psql -U postgres -d postgres -f ../scripts/schema.sql
npm run dev
```

API runs on `http://localhost:3001`

### 2. Mobile (5 min)
```bash
cd mobile
npm install
npm run ios      # or 'android'
```

### 3. Test Login
Use the API to register:
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "brewer@brickwest.com",
    "password": "test123",
    "name": "Test Brewer"
  }'
```

Then login in the app.

---

## Next Priorities

### Phase 2: Sensor Integration
- [ ] BLE temperature/gravity sensors (Tilt, iSpindel)
- [ ] Auto-log readings every 15min
- [ ] Real-time fermentation curve graphs
- [ ] Abnormal trend alerts

### Phase 3: Team Features
- [ ] Task assignment per batch
- [ ] Shift scheduling
- [ ] In-app messaging
- [ ] Equipment log (cleaning, maintenance)

### Phase 4: Analytics & Compliance
- [ ] Batch success metrics
- [ ] Ingredient cost tracking
- [ ] Regulatory audit trail (TTB compliance)
- [ ] PDF batch reports
- [ ] Inventory management

### Phase 5: Advanced
- [ ] AR ingredient counter (iOS)
- [ ] Equipment IoT integration (tanks, chillers)
- [ ] Predictive fermentation models
- [ ] Recipe similarity/cloning
- [ ] Integration with Brickwest POS

---

## Architecture Notes

**Authentication:** JWT tokens stored in AsyncStorage (mobile), secure HttpOnly cookies (future web)

**Real-time:** WebSocket (Socket.io) for live fermentation updates across team

**Offline:** Mobile app queues logs locally, syncs when connectivity returns

**Database:** PostgreSQL with proper indexes on `batch_logs.measured_at` and `batch_id` for time-series queries

**Scalability:** Fermentation logs table grows ~100 rows/batch/week — partition by batch_id for 1000+ batches

---

## File Structure
```
brickwest-platform/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express + Socket.io server
│   │   ├── db.js                 # PostgreSQL pool
│   │   ├── middleware/auth.js    # JWT verification
│   │   ├── models/               # Data access (Batch, Recipe)
│   │   ├── routes/               # API endpoints
│   │   └── services/websocket.js # Real-time updates
│   ├── package.json
│   └── .env.example
│
├── mobile/
│   ├── App.js                    # React Native entry
│   ├── src/
│   │   ├── navigation/RootNavigator.js
│   │   └── screens/
│   │       ├── LoginScreen.js
│   │       ├── BatchesScreen.js
│   │       ├── BatchDetailScreen.js
│   │       ├── RecipesScreen.js
│   │       └── SettingsScreen.js
│   └── package.json
│
├── scripts/
│   ├── schema.sql        # Database initialization
│   └── quickstart.sh     # Setup script
│
├── docker/
│   ├── docker-compose.yml
│   └── Dockerfile.backend
│
└── docs/
    ├── SETUP.md          # Local dev + deployment
    ├── API.md            # Complete API reference
    └── DATA_MODELS.md    # Database schema
```

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | Create brewmaster account |
| POST | `/api/auth/login` | Get JWT token |
| GET | `/api/batches` | List batches (filterable) |
| POST | `/api/batches` | Create batch |
| PUT | `/api/batches/:id/status` | Update batch phase |
| POST | `/api/batches/:id/logs` | Log fermentation reading |
| GET | `/api/batches/:id/logs` | Get reading history |
| GET | `/api/recipes` | List recipes |
| POST | `/api/recipes` | Create recipe |
| PUT | `/api/recipes/:id` | Update recipe |

---

## Environment Variables

**Backend:**
```
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=brickwest_brewmaster
JWT_SECRET=your-secret-key-change-in-production
PORT=3001
FRONTEND_URL=http://localhost:3000
```

**Mobile:**
```
REACT_APP_API_URL=http://localhost:3001/api
```

---

## Testing Workflow

1. **Register brewmaster** via API or mobile app
2. **Login** with credentials
3. **Create recipe** (API endpoint or future UI)
4. **Create batch** linked to recipe
5. **Log fermentation readings** (temp, gravity, pH) every session
6. **View batch history** in app

---

## Deployment

### Docker (production-ready)
```bash
docker-compose -f docker/docker-compose.yml up -d
```

Runs:
- PostgreSQL 16
- Node.js API server
- All auto-initialized

### Mobile App Store
- Build signed APK (Android)
- Build signed IPA (iOS)
- Submit to Google Play / Apple App Store

---

## Support

- API Docs: `docs/API.md`
- Setup Help: `docs/SETUP.md`
- Database: `docs/DATA_MODELS.md`

For issues, logs are in `backend` container or `npm run dev` terminal.
