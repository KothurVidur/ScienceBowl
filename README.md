# ScienceBowlOne

ScienceBowlOne is a real-time quiz platform with a Node.js backend, React frontend, MongoDB, and Socket.IO.

## Run Locally

1. Backend
```bash
cd backend
cp .env.example .env
npm install
npm run seed
npm run dev
```

2. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

3. Open `http://localhost:3000`.

## Environment-Driven Deployment

All deployment behavior is controlled by environment variables.

- Backend template: `backend/.env.example`
- Frontend template: `frontend/.env.example`
- Unified template: `.env.example`

### Single-Server Deployment (frontend + backend together)

Use these key backend vars:

```env
SERVE_STATIC_FRONTEND=true
FRONTEND_DIST_PATH=../frontend/dist
CORS_ENABLED=false
PORT=5000
MONGODB_URI=mongodb://localhost:27017/sciencebowl
```

Build frontend, then start backend:

```bash
cd frontend
npm run build

cd ../backend
npm run start
```

Backend serves the API and built frontend from one process/domain.

### Split Deployment (frontend and backend separate)

Use these key vars:

```env
CORS_ENABLED=true
CORS_ORIGINS=https://your-frontend-domain.example
VITE_API_URL=https://your-backend-domain.example/api
VITE_SOCKET_URL=https://your-backend-domain.example
```

## Docker Compose

```bash
docker-compose up -d
docker-compose logs -f
docker-compose down
```

## API Health

`GET /api/health`
