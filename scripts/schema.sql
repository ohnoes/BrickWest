-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'brewer',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recipes table
CREATE TABLE recipes (
  id SERIAL PRIMARY KEY,
  brewer_id INTEGER REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  style VARCHAR(100),
  target_abv DECIMAL(5, 2),
  target_ibu DECIMAL(6, 1),
  volume_liters DECIMAL(8, 2),
  ingredients JSONB,
  notes TEXT,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Batches table
CREATE TABLE batches (
  id SERIAL PRIMARY KEY,
  brewer_id INTEGER REFERENCES users(id),
  recipe_id INTEGER REFERENCES recipes(id),
  batch_number VARCHAR(50) UNIQUE NOT NULL,
  brew_date DATE,
  volume_produced DECIMAL(8, 2),
  status VARCHAR(50) DEFAULT 'milling',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- Batch logs (fermentation tracking)
CREATE TABLE batch_logs (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES batches(id) NOT NULL,
  phase VARCHAR(50),
  temperature DECIMAL(5, 2),
  gravity DECIMAL(8, 4),
  ph DECIMAL(3, 2),
  notes TEXT,
  measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_batches_brewer_id ON batches(brewer_id);
CREATE INDEX idx_batches_recipe_id ON batches(recipe_id);
CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_batch_logs_batch_id ON batch_logs(batch_id);
CREATE INDEX idx_batch_logs_measured_at ON batch_logs(measured_at);
CREATE INDEX idx_recipes_brewer_id ON recipes(brewer_id);
