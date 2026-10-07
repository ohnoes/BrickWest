# Brickwest Brewmaster App — Complete Platform

**Production-ready brewmaster app for Brickwest Brewing** — batch tracking, fermentation logging, team collaboration, offline support.

---

## 🍺 Features

### Core
- ✅ **Recipe Management** — Version control, ingredient scaling, IBU/ABV calculations
- ✅ **Batch Tracking** — Full lifecycle (milling → fermenting → packaging)
- ✅ **Fermentation Logging** — Real-time temp, gravity, pH with timestamps
- ✅ **Mobile-First** — iOS/Android React Native app
- ✅ **Offline Support** — Queue logs, sync when online
- ✅ **Team Collaboration** — Shared batch access, notes
- ✅ **JWT Auth** — Secure brewmaster accounts

### Data
- ✅ PostgreSQL with proper indexing for time-series
- ✅ WebSocket real-time updates
- ✅ Audit trail (soft deletes, version history)
- ✅ Clean REST API (20+ endpoints)

---

## 📁 Project Structure

```
brickwest-platform/
├── backend/              # Node.js + Express API
│   ├── src/
│   │   ├── index.js      # Express server + Socket.io
│   │   ├── db.js         # PostgreSQL connection pool
│   │   ├── middleware/   # JWT auth, error handling
│   │   ├── models/       # Database queries (Batch, Recipe)
│   │   ├── routes/       # API endpoints
│   │   └── services/     # WebSocket handlers
│   ├── package.json
│   └── .env.example
│
├── mobile/               # React Native iOS/Android
│   ├── App.js            # Entry point
│   ├── src/
│   │   ├── navigation/   # Tab + stack navigation
│   │   └── screens/      # Login, Batches, Recipes, Settings
│   └── package.json
│
├── scripts/
│   ├── schema.sql        # Database DDL
│   └── quickstart.sh     # Local setup
│
├── docker/
│   ├── docker-compose.yml
│   └── Dockerfile.backend
│
├── docs/
│   ├── SETUP.md          # Local dev + Docker
│   ├── API.md            # REST API reference
│   ├── DATA_MODELS.md    # Database schema
│   └── IMPLEMENTATION.md # Architecture + roadmap
│
└── README.md (this file)
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **PostgreSQL 14+** (or Docker)
- **Xcode** (for iOS) or **Android Studio** (for Android)

### 1. Backend Setup (5 min)

```bash
cd backend
cp .env.example .env
npm install
```

**Initialize database:**
```bash
psql -U postgres -d postgres -f ../scripts/schema.sql
```

**Start API:**
```bash
npm run dev
```

API runs on `http://localhost:3001/api`

### 2. Mobile Setup (5 min)

```bash
cd mobile
npm install
```

**iOS:**
```bash
npm run ios
```

**Android:**
```bash
npm run android
```

### 3. Test Login

**Register via API:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "brewer@brickwest.com",
    "password": "test123",
    "name": "John Brewer"
  }'
```

**Login in mobile app** with those credentials.

---

## 📱 Mobile App Walkthrough

### Login Screen
- Email + password authentication
- Registration link
- JWT token stored securely

### Batches Tab
- List all active batches
- Filter by status (fermenting, complete, discarded)
- Search by batch number
- Create new batch (FAB button)

### Batch Detail Screen
- Brew date, volume, recipe, notes
- **Log Fermentation Reading** form:
  - Temperature (°C)
  - Gravity (SG)
  - pH (optional)
  - Notes
  - Auto-timestamp
- **Reading History** — All logs sorted by time with emoji indicators (🌡️🔬💧)

### Recipes Tab
- View all recipes
- Name, style, ABV, IBU, volume
- Version number
- Tap to view ingredients (future)

### Settings Tab
- User profile (name, email, role)
- App version
- API URL
- Logout button

---

## 🔌 API Endpoints

### Auth
```
POST   /api/auth/register    Register new brewmaster
POST   /api/auth/login       Get JWT token
```

### Batches
```
GET    /api/batches          List batches (filterable)
GET    /api/batches/:id      Get batch details
POST   /api/batches          Create batch
PUT    /api/batches/:id/status  Update batch phase
POST   /api/batches/:id/logs Log fermentation reading
GET    /api/batches/:id/logs Get reading history
```

### Recipes
```
GET    /api/recipes          List recipes
GET    /api/recipes/:id      Get recipe
POST   /api/recipes          Create recipe
PUT    /api/recipes/:id      Update recipe
DELETE /api/recipes/:id      Soft-delete recipe
```

**Full docs:** See `docs/API.md`

---

## 🗄️ Database

**Tables:**
- `users` — Brewmasters (email, password hash, role)
- `recipes` — Beer recipes (name, style, ABV, IBU, ingredients JSONB)
- `batches` — Production batches (recipe_id, status, brew_date, volume)
- `batch_logs` — Fermentation readings (batch_id, temperature, gravity, pH, measured_at)

**Indexes:** Optimized for time-series queries on `batch_logs`

**Schema:** `scripts/schema.sql`

---

## 🐳 Docker Deployment

```bash
docker-compose -f docker/docker-compose.yml up -d
```

Runs:
- PostgreSQL 16 (port 5432)
- Node.js API (port 3001)
- Auto-initializes database

---

## 🔐 Environment Variables

**Backend (`.env`):**
```
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=brickwest_brewmaster
JWT_SECRET=change-this-in-production
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

**Mobile (`.env`):**
```
REACT_APP_API_URL=http://localhost:3001/api
```

---

## 📊 Example Workflow

1. **Brewmaster logs in** with email + password
2. **Creates/selects a batch** linked to a recipe
3. **Logs fermentation readings** throughout fermentation:
   - Day 1: 20°C, 1.060 SG
   - Day 3: 18°C, 1.040 SG (vigorous fermentation)
   - Day 7: 16°C, 1.010 SG (activity slowing)
4. **Team views batch** in real-time via WebSocket
5. **Reads history** shows temperature/gravity progression
6. **Marks batch complete** when ready to package
7. **Offline sync** — Logs queued on no-connectivity, synced when online

---

## 🛣️ Roadmap (Phase 2+)

### Phase 2: Sensors
- [ ] BLE Tilt/iSpindel integration
- [ ] Auto-log readings every 15min
- [ ] Fermentation curve graphs (React Native Charts)
- [ ] Alerts on abnormal trends

### Phase 3: Team
- [ ] Task assignment per batch
- [ ] Shift scheduling
- [ ] In-app chat/notes
- [ ] Equipment maintenance log

### Phase 4: Analytics
- [ ] Batch success metrics
- [ ] Ingredient cost tracking
- [ ] TTB compliance audit trail
- [ ] PDF batch reports
- [ ] Inventory management

### Phase 5: Enterprise
- [ ] AR ingredient counter (iOS)
- [ ] IoT equipment integration (tanks, chillers)
- [ ] Predictive fermentation ML
- [ ] Brickwest POS integration
- [ ] Web admin dashboard

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `docs/SETUP.md` | Local dev, Docker, PostgreSQL setup |
| `docs/API.md` | Complete REST API reference |
| `docs/DATA_MODELS.md` | Database schema + relationships |
| `docs/IMPLEMENTATION.md` | Architecture, scalability, roadmap |

---

## 🛠️ Development

### Backend
```bash
cd backend
npm run dev          # Start with nodemon
npm test             # Run tests (Jest)
npm run lint         # ESLint check
```

### Mobile
```bash
cd mobile
npm start            # Metro bundler
npm run ios          # iOS simulator
npm run android      # Android emulator
npm test             # Jest tests
```

---

## 🔍 Troubleshooting

**PostgreSQL connection fails:**
- Ensure PostgreSQL is running: `psql -U postgres`
- Check `.env` credentials
- Schema initialized: `psql -U postgres -d postgres -f scripts/schema.sql`

**Mobile app can't reach API:**
- Check `REACT_APP_API_URL` in mobile `.env`
- Verify backend running: `curl http://localhost:3001/health`
- Check firewall/network

**JWT errors:**
- Token expired? Re-login
- Wrong JWT_SECRET? Check backend `.env`
- AsyncStorage cleared? Login again

---

## 📝 Notes

- **Soft deletes:** Recipes/batches use `deleted_at` timestamps (data recovery possible)
- **Version control:** Recipes track versions; batches tied to recipe version used
- **Offline:** Mobile app stores readings locally, syncs when online
- **Real-time:** WebSocket updates team when fermentation readings logged
- **Security:** Passwords hashed with bcryptjs; JWTs signed with HS256

---

## 💬 Support

- **API Issues:** Check `docs/API.md` + `npm run dev` logs
- **Database:** See `docs/DATA_MODELS.md`
- **Setup Help:** Follow `docs/SETUP.md`
- **Deployment:** See `docs/IMPLEMENTATION.md`

---

## 📄 License

Proprietary — Brickwest Brewing Co.

---

**Built for Brickwest Brewing, Spokane WA** 🍺
