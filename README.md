# ScienceBowlOne

ScienceBowlOne is a real-time quiz platform with a React frontend, Node.js backend, MongoDB, and Socket.IO.

## Production Deployment

This project uses one root-level `.env` file for the whole app.

This repository is set up for a single Dockerized application server that serves both the frontend and backend from the same origin.

That means:

- No frontend/backend split deployment is required
- No CORS configuration is required for the default production path
- Most hosting services only need environment variable changes and a normal Docker build

### Required Environment Variables

Start from `.env.example` and change only the values that matter for your host:

```env
MONGODB_URI=your-database-connection-string
JWT_SECRET=your-long-random-secret
PUBLIC_APP_URL=https://your-domain.example
```

Everything else already defaults to the single-server production setup:

- `SERVE_STATIC_FRONTEND=true`
- `CORS_ENABLED=false`
- Frontend API calls use same-origin `/api`
- Socket.IO connects back to the same host automatically

### Build and Run With Docker

```bash
docker build -t sciencebowlone .
docker run --env-file .env -p 5000:5000 sciencebowlone
```

The app will be available on `http://localhost:5000`.

### Run With Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
docker compose logs -f
docker compose down
```

The included compose file starts:

- `app`: the combined frontend + backend container
- `mongodb`: a local MongoDB container for self-hosting

## Local Development

Create one env file at the repository root:

```bash
cp .env.example .env
```

That same file is used by:

- the backend server
- the frontend Vite dev/build config
- Docker and Docker Compose

### Backend

```bash
cd backend
npm install
npm run seed
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Useful Commands

```bash
npm run install:all
npm run build
npm run start
```

## Health Check

`GET /api/health`
