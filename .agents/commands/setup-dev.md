# Setup Dev Environment

Sets up the local development environment for the superset fork, including dependencies, environment variables, and database initialization.

## Usage

```
setup-dev [--fresh] [--skip-db] [--skip-frontend]
```

## Options

- `--fresh`: Wipe existing environment and start clean
- `--skip-db`: Skip database initialization steps
- `--skip-frontend`: Skip frontend dependency installation

## Steps

### 1. Prerequisites Check

Verify the following are installed and meet minimum version requirements:
- Python >= 3.9
- Node.js >= 16
- npm >= 8
- Docker & Docker Compose (for local services)
- pyenv or virtualenv

```bash
python --version
node --version
npm --version
docker --version
```

### 2. Python Virtual Environment

```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Linux/macOS
# .\venv\Scripts\activate  # Windows

# Install Python dependencies
pip install -r requirements/development.txt
pip install -e ".[postgres]"
```

### 3. Environment Variables

Copy the example env file and fill in required values:

```bash
cp .env.example .env
```

Required variables to configure in `.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `SECRET_KEY` — Flask secret key (generate with `openssl rand -base64 42`)
- `REDIS_URL` — Redis connection string for caching/celery
- `SUPERSET_ENV` — Set to `development`

### 4. Start Local Services

```bash
# Start PostgreSQL and Redis via Docker Compose
docker compose -f docker-compose.dev.yml up -d postgres redis

# Wait for services to be healthy
docker compose -f docker-compose.dev.yml ps
```

### 5. Database Initialization

```bash
# Run migrations
superset db upgrade

# Create default roles and permissions
superset init

# (Optional) Load example data
superset load-examples
```

### 6. Frontend Dependencies

```bash
cd superset-frontend
npm ci
cd ..
```

### 7. Create Admin User

```bash
superset fab create-admin \
  --username admin \
  --firstname Admin \
  --lastname User \
  --email admin@example.com \
  --password admin
```

### 8. Verify Setup

```bash
# Start backend dev server
superset run -p 8088 --with-threads --reload --debugger &

# Start frontend dev server
cd superset-frontend && npm run dev-server &

# Check health endpoint
curl http://localhost:8088/health
```

Expected response: `OK`

## Troubleshooting

### Port already in use
```bash
lsof -ti:8088 | xargs kill -9
```

### Database connection refused
- Ensure Docker services are running: `docker compose -f docker-compose.dev.yml ps`
- Check `DATABASE_URL` in `.env` matches the Docker service config

### Frontend build errors
- Clear node_modules: `rm -rf superset-frontend/node_modules && npm ci`
- Ensure Node version matches `.nvmrc`: `nvm use`

### Migration errors
- Check for pending migrations: `superset db heads`
- Resolve conflicts before running `superset db upgrade`
