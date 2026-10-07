# Data Models

## User
```
id                SERIAL PRIMARY KEY
email             VARCHAR(255) UNIQUE NOT NULL
password_hash     VARCHAR(255) NOT NULL
name              VARCHAR(255) NOT NULL
role              VARCHAR(50) DEFAULT 'brewer'
active            BOOLEAN DEFAULT TRUE
created_at        TIMESTAMP DEFAULT NOW()
updated_at        TIMESTAMP DEFAULT NOW()
```

**Roles:**
- `brewer` — Can create/update batches and recipes
- `head_brewer` — Full access + reporting
- `admin` — User management + system configuration

---

## Recipe
```
id                SERIAL PRIMARY KEY
brewer_id         INTEGER FK users(id)
name              VARCHAR(255) NOT NULL
style             VARCHAR(100)
target_abv        DECIMAL(5, 2)
target_ibu        DECIMAL(6, 1)
volume_liters     DECIMAL(8, 2)
ingredients       JSONB
  └─ [
      {
        "name": "Pale Malt",
        "type": "malt|hop|yeast|adjunct",
        "amount": 15,
        "unit": "kg|g|oz",
        "supplier": "Briess",
        "batch_number": "2024-08"
      }
    ]
notes             TEXT
version           INTEGER DEFAULT 1
created_at        TIMESTAMP DEFAULT NOW()
updated_at        TIMESTAMP DEFAULT NOW()
deleted_at        TIMESTAMP (soft delete)
```

**IBU Calculation:** Tinseth or Rager method (auto-calculated)  
**Version Control:** Every update increments version, full history retained

---

## Batch
```
id                SERIAL PRIMARY KEY
brewer_id         INTEGER FK users(id)
recipe_id         INTEGER FK recipes(id)
batch_number      VARCHAR(50) UNIQUE NOT NULL
brew_date         DATE
volume_produced   DECIMAL(8, 2)
status            VARCHAR(50)
  └─ 'milling' → 'mashing' → 'boiling' → 'cooling' 
     → 'fermenting' → 'packaging' → 'complete' | 'discarded'
notes             TEXT
created_at        TIMESTAMP DEFAULT NOW()
updated_at        TIMESTAMP DEFAULT NOW()
deleted_at        TIMESTAMP (soft delete)
```

---

## Batch Log (Fermentation Tracking)
```
id                SERIAL PRIMARY KEY
batch_id          INTEGER FK batches(id) NOT NULL
phase             VARCHAR(50)
temperature       DECIMAL(5, 2) -- °C
gravity           DECIMAL(8, 4) -- Specific Gravity (SG)
ph                DECIMAL(3, 2) -- pH level
notes             TEXT
measured_at       TIMESTAMP DEFAULT NOW()
created_at        TIMESTAMP DEFAULT NOW()
```

**Timeseries:** 1000s of logs per batch over weeks of fermentation  
**Real-time indexing:** `idx_batch_logs_batch_id`, `idx_batch_logs_measured_at`

---

## Team Task (Future)
```
id                SERIAL PRIMARY KEY
batch_id          INTEGER FK batches(id)
assigned_to       INTEGER FK users(id)
description       TEXT
status            VARCHAR(50) -- 'pending', 'in_progress', 'complete'
due_at            TIMESTAMP
completed_at      TIMESTAMP
notes             TEXT
created_at        TIMESTAMP
```

---

## Fermentation Alerts (Future)
```
id                SERIAL PRIMARY KEY
batch_id          INTEGER FK batches(id)
alert_type        VARCHAR(50)
  └─ 'high_temp', 'low_temp', 'flat_gravity', 'ph_out_of_range'
severity          VARCHAR(20) -- 'warning', 'critical'
triggered_at      TIMESTAMP
acknowledged_at   TIMESTAMP
resolved_at       TIMESTAMP
```

