## DBFlow Backend

Robust NestJS + TypeORM (PostgreSQL) backend powering DBFlow.

### Live API Docs
- Production Swagger: [https://api-dbflow.inkwhale.io.vn/api-docs](https://api-dbflow.inkwhale.io.vn/api-docs)

### Features
- NestJS 11 with modular architecture
- TypeORM 0.3.x with migrations
- JWT authentication with HTTP-only cookies
- AWS S3 file upload integration
- Centralized validation, interceptors, and exception filtering
- Swagger documentation with cookie-based auth

### Contents
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Local Development](#local-development)
- [Database Migrations](#database-migrations)
- [Testing & Linting](#testing--linting)
- [Build](#build)
- [Docker Usage](#docker-usage)
- [CI/CD](#cicd)
- [Project Structure](#project-structure)

## Prerequisites
- Node.js 20+
- Yarn 1.x
- Docker & Docker Compose (recommended for local Postgres)

## Setup
1) Install dependencies:
```bash
yarn install
```

2) Create your environment file from the example:
```bash
cp .env.example .env
```
3) Edit `.env` with your values, for example:
```ini
# Database Configuration
POSTGRES_USER=dbflow-user
POSTGRES_PASSWORD=changeme
POSTGRES_DB=db
POSTGRES_PORT=5432
POSTGRES_HOST=127.0.0.1

PORT=3000
JWT_SECRET=changeme
FRONTEND_URL=http://localhost:3001
NODE_ENV=development

# GitHub Container Registry
IMAGE=ghcr

# S3 Storage Configuration
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET_NAME=dbflow-hcmut

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=changeme

# Project Configuration
FOLDER_STORAGE_PROJECT=dbfl
```

## Local Development
- Start Postgres with Docker Compose:
```bash
docker compose up -d
```
- Run the API (watch mode):
```bash
yarn start:dev
```
- Swagger (local): `http://localhost:3000/api-docs`

## Authentication

This API uses **cookie-based JWT authentication** for enhanced security:
- JWT tokens are stored in HTTP-only cookies (not accessible via JavaScript)
- Frontend must include `credentials: 'include'` in all API requests
- CORS is configured to accept credentials from the frontend URL


## Database Migrations
The TypeORM DataSource is configured in `ormconfig.ts` and reads values from `.env`.

- Run migrations:
```bash
yarn migration:run
```
- Revert the last migration:
```bash
yarn migration:revert
```
- Show migrations status:
```bash
yarn migration:show
```
- Create an empty migration:
```bash
yarn migration:create
```
- Generate a migration from entity changes:
```bash
yarn migration:generate
```

## Testing & Linting
- Unit tests:
```bash
yarn test
```
- E2E tests:
```bash
yarn test:e2e
```
- Coverage:
```bash
yarn test:cov
```
- Lint:
```bash
yarn lint
```

## Build
- Compile TypeScript to `dist/`:
```bash
yarn build
```
- Run in production mode locally:
```bash
yarn start:prod
```

## CI/CD
Workflows are defined in `.github/workflows/`.

- CI: `ci.yml`
  - Triggers on push/PR
  - Installs deps, lints, builds, and runs tests with a Postgres service

- Deploy: `deploy.yml`
  - Triggers only after the "CI" workflow completes successfully on `main` (via `workflow_run`)
  - Builds and pushes an image to GHCR
  - Copies `docker-compose.prod.yml` to `~/dbflow/` on the server
  - Writes `.env` on the server from a single multiline GitHub Secret `ENV_FILE`
  - Runs `docker compose pull && up -d`

Required GitHub Secrets for deploy:
- SSH: `SSH_HOST`, `SSH_USER`, `SSH_KEY`, `SSH_PORT` (optional)
- ENV: `ENV_FILE` (the full production `.env` contents)
- Registry (optional): `GHCR_PAT` if not relying on `GITHUB_TOKEN`

## Project Structure
- `src/` — NestJS source code
- `src/modules/` — feature modules (auth, users, admin, ...)
- `src/migrations/` — TypeORM migrations
- `ormconfig.ts` — TypeORM DataSource config
- `docker-compose.yml` — local Docker compose (Postgres)
- `docker-compose.prod.yml` — production compose (uses prebuilt image)
