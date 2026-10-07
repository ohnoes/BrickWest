# Brickwest Brewmaster App — API Reference

## Base URL
```
http://localhost:3001/api
```

## Authentication
All endpoints except `/auth/*` require a Bearer token in the `Authorization` header:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## Auth Endpoints

### Register
```http
POST /auth/register
```

**Request:**
```json
{
  "email": "brewer@brickwest.com",
  "password": "secure-password",
  "name": "John Brewer",
  "role": "brewer"
}
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "email": "brewer@brickwest.com",
    "name": "John Brewer",
    "role": "brewer"
  },
  "token": "eyJhbGc..."
}
```

### Login
```http
POST /auth/login
```

**Request:**
```json
{
  "email": "brewer@brickwest.com",
  "password": "secure-password"
}
```

**Response:**
```json
{
  "user": { ... },
  "token": "eyJhbGc..."
}
```

---

## Batch Endpoints

### List Batches
```http
GET /batches?status=fermenting&limit=50&offset=0
```

**Query Parameters:**
- `status` (optional) — Filter by status
- `recipe_id` (optional) — Filter by recipe
- `limit` (optional, default: 50)
- `offset` (optional, default: 0)

**Response:**
```json
[
  {
    "id": 1,
    "recipe_id": 5,
    "batch_number": "BATCH-2024-10",
    "brew_date": "2024-10-06T00:00:00Z",
    "volume_produced": 100,
    "status": "fermenting",
    "notes": "Vigorous fermentation",
    "created_at": "2024-10-06T10:30:00Z"
  }
]
```

### Get Batch
```http
GET /batches/:id
```

**Response:**
```json
{
  "id": 1,
  "recipe_id": 5,
  "batch_number": "BATCH-2024-10",
  ...
}
```

### Create Batch
```http
POST /batches
```

**Request:**
```json
{
  "recipe_id": 5,
  "batch_number": "BATCH-2024-10",
  "brew_date": "2024-10-06",
  "volume_produced": 100,
  "notes": "Test batch"
}
```

**Response:** (201 Created)
```json
{
  "id": 1,
  "status": "milling",
  ...
}
```

### Update Batch Status
```http
PUT /batches/:id/status
```

**Request:**
```json
{
  "status": "fermenting"
}
```

Valid statuses: `milling`, `mashing`, `boiling`, `cooling`, `fermenting`, `packaging`, `complete`, `discarded`

**Response:**
```json
{
  "id": 1,
  "status": "fermenting",
  "updated_at": "2024-10-06T12:00:00Z"
}
```

### Log Fermentation Reading
```http
POST /batches/:id/logs
```

**Request:**
```json
{
  "phase": "fermenting",
  "temperature": 18.5,
  "gravity": 1.010,
  "ph": 4.2,
  "notes": "Airlock activity slowing",
  "measured_at": "2024-10-06T15:30:00Z"
}
```

**Response:** (201 Created)
```json
{
  "logged": true
}
```

### Get Batch Logs
```http
GET /batches/:id/logs
```

**Response:**
```json
[
  {
    "id": 1,
    "batch_id": 1,
    "phase": "fermenting",
    "temperature": 18.5,
    "gravity": 1.010,
    "ph": 4.2,
    "notes": "Airlock activity slowing",
    "measured_at": "2024-10-06T15:30:00Z"
  }
]
```

---

## Recipe Endpoints

### List Recipes
```http
GET /recipes?limit=50&offset=0
```

**Response:**
```json
[
  {
    "id": 5,
    "name": "Brick X Brick IPA",
    "style": "West Coast IPA",
    "target_abv": 6.2,
    "target_ibu": 45,
    "volume_liters": 100,
    "ingredients": [...],
    "version": 2
  }
]
```

### Get Recipe
```http
GET /recipes/:id
```

### Create Recipe
```http
POST /recipes
```

**Request:**
```json
{
  "name": "New IPA",
  "style": "West Coast IPA",
  "target_abv": 6.5,
  "target_ibu": 50,
  "volume_liters": 100,
  "ingredients": [
    {
      "name": "Pale Malt",
      "type": "malt",
      "amount": 15,
      "unit": "kg"
    }
  ],
  "notes": "Collaboration brew"
}
```

### Update Recipe
```http
PUT /recipes/:id
```

**Request:** (same as create, all fields optional)

### Delete Recipe
```http
DELETE /recipes/:id
```

**Response:**
```json
{
  "deleted": true
}
```

---

## WebSocket Events

### Join Batch Room
```javascript
socket.emit('join_batch', batchId);
```

### Listen for Updates
```javascript
socket.on('fermentation_update', (data) => {
  console.log(data);
  // {
  //   temperature: 18.5,
  //   gravity: 1.010,
  //   timestamp: "2024-10-06T15:30:00Z"
  // }
});
```

### Broadcast Update
```javascript
socket.emit('fermentation_update', {
  batchId: 1,
  temperature: 18.5,
  gravity: 1.010
});
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Description of what went wrong"
}
```

**Common status codes:**
- `400` — Bad request (missing/invalid fields)
- `401` — Unauthorized (no/invalid token)
- `404` — Not found
- `409` — Conflict (e.g., duplicate email)
- `500` — Server error
