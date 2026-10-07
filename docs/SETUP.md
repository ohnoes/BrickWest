# Brewmaster App — Setup & Deployment

## Local Development

### Backend

1. **Clone & install**
   ```bash
   cd backend
   npm install
   ```

2. **Environment setup**
   ```bash
   cat > .env << EOF
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=brickwest_brewmaster
   JWT_SECRET=your-secret-key-change-in-production
   PORT=3001
   FRONTEND_URL=http://localhost:3000
   EOF
   ```

3. **Database**
   ```bash
   psql -U postgres -d postgres -f ../scripts/schema.sql
   ```

4. **Run**
   ```bash
   npm run dev
   ```

API runs on `http://localhost:3001`

### Mobile App

1. **Install dependencies**
   ```bash
   cd mobile
   npm install
   ```

2. **Environment**
   Create `.env`:
   ```
   REACT_APP_API_URL=http://localhost:3001/api
   ```

3. **iOS**
   ```bash
   npm run ios
   ```

4. **Android**
   ```bash
   npm run android
   ```

## Docker Deployment

```bash
docker-compose -f docker/docker-compose.yml up -d
```

Services:
- **PostgreSQL**: `localhost:5432`
- **API**: `localhost:3001`

## API Endpoints

### Authentication
- `POST /api/auth/register` — Register new brewmaster
- `POST /api/auth/login` — Login

### Batches
- `GET /api/batches` — List batches (filters: status, recipe_id)
- `GET /api/batches/:id` — Get batch details
- `POST /api/batches` — Create batch
- `PUT /api/batches/:id/status` — Update batch status
- `POST /api/batches/:id/logs` — Log fermentation reading
- `GET /api/batches/:id/logs` — Get batch logs

### Recipes
- `GET /api/recipes` — List recipes
- `GET /api/recipes/:id` — Get recipe
- `POST /api/recipes` — Create recipe
- `PUT /api/recipes/:id` — Update recipe
- `DELETE /api/recipes/:id` — Archive recipe

## Mobile Features

- **Batches Tab**: View, filter, and manage active batches
- **Batch Detail**: Log fermentation readings (temp, gravity, pH) in real-time
- **Reading History**: Graph fermentation curves
- **Recipes Tab**: Reference recipes during brew day
- **Settings**: User profile, logout

## Offline Support

The mobile app automatically syncs readings when connectivity returns. All fermentation data is cached locally using AsyncStorage.

## Next Steps

1. **Sensor Integration**: Connect real-time temperature/gravity probes via BLE or WiFi
2. **Notifications**: Alert on abnormal fermentation curves
3. **Team Tasks**: Assign shift responsibilities, track completion
4. **Analytics**: Batch success rates, ingredient cost tracking
5. **Export**: Generate PDF reports per batch for compliance
