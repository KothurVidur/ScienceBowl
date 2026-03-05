# Science Bowl Online

A real-time competitive Science Bowl platform where players can compete head-to-head in science trivia matches, following the rules of the DOE National Science Bowl.

![Science Bowl Online](https://img.shields.io/badge/Science%20Bowl-Online-6366f1?style=for-the-badge)

## Features

### Core Gameplay
- **Real-time Multiplayer** - Compete head-to-head with players worldwide
- **Authentic Science Bowl Rules** - 10 questions per game, buzz-in system, tossup format
- **8 Science Categories** - Biology, Chemistry, Physics, Math, Earth Science, Astronomy, Energy, Computer Science
- **Multiple Choice & Short Answer** - Both question formats supported

### Competitive System
- **ELO Rating System** - Climb the ranks with our competitive rating system
- **Global Leaderboards** - See how you stack up against the best players
- **Detailed Statistics** - Track your accuracy, win rate, and category performance
- **Rating History** - Visualize your rating progression over time

### Game Modes
- **Ranked Match** - Play against real players for rating
- **AI Opponents** - Practice against AI with 4 difficulty levels
- **Private Matches** - Create custom games with friends
- **Practice Mode** - Study at your own pace with no pressure

### User Experience
- **Modern UI** - Beautiful, science-themed interface with 3D elements
- **User Profiles** - Customize your profile and showcase your stats
- **Responsive Design** - Play on desktop or mobile

## Tech Stack

### Backend
- **Node.js** with Express.js
- **MongoDB** for data storage
- **Socket.io** for real-time communication
- **JWT** for authentication
- **bcrypt** for password hashing

### Frontend
- **React 18** with Vite
- **React Router** for navigation
- **Framer Motion** for animations
- **Recharts** for data visualization
- **Socket.io Client** for real-time features

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB 6+
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/sciencebowl-online.git
cd sciencebowl-online
```

2. **Set up the backend**
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
npm install
npm run seed  # Seed the question database
npm run dev
```

3. **Set up the frontend**
```bash
cd frontend
npm install
npm run dev
```

4. **Open your browser**
Navigate to `http://localhost:3000`

### Environment Variables

Backend (`.env`):
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/sciencebowl
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=7d
FRONTEND_URL=http://localhost:3000
```

## Docker Deployment

Deploy the entire stack with Docker Compose:

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- MongoDB: localhost:27017

## API Documentation

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |
| PUT | `/api/auth/password` | Change password |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/leaderboard` | Get leaderboard |
| GET | `/api/users/:username` | Get user profile |
| GET | `/api/users/:username/stats` | Get user statistics |
| GET | `/api/users/:username/games` | Get user's game history |
| PUT | `/api/users/profile` | Update profile |

### Games
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/games` | Create new game |
| GET | `/api/games/code/:code` | Get game by code |
| POST | `/api/games/:code/join` | Join a game |
| GET | `/api/games/stats` | Get game statistics |

### Questions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/questions/practice` | Get practice question |
| POST | `/api/questions/:id/check` | Check answer |
| GET | `/api/questions/categories` | Get all categories |

## WebSocket Events

### Matchmaking
- `matchmaking:join` - Join matchmaking queue
- `matchmaking:leave` - Leave matchmaking queue
- `matchmaking:matched` - Match found

### Game
- `game:create` - Create game room
- `game:join` - Join game room
- `game:ready` - Player ready
- `game:start` - Game starting
- `game:question` - New question
- `game:buzz` - Player buzzed
- `game:answer` - Submit answer
- `game:answerResult` - Answer result
- `game:end` - Game complete

## Project Structure

```
ScienceBowlOnline/
├── backend/
│   ├── src/
│   │   ├── config/         # Database configuration
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── models/         # MongoDB models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── socket/         # Socket.io handlers
│   │   └── utils/          # Utilities
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── context/        # React context providers
│   │   ├── hooks/          # Custom hooks
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   └── styles/         # Global styles
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Rating System

The platform uses an ELO-based rating system:

| Rating | Title |
|--------|-------|
| 2400+ | Grandmaster |
| 2200-2399 | Master |
| 2000-2199 | Expert |
| 1800-1999 | Class A |
| 1600-1799 | Class B |
| 1400-1599 | Class C |
| 1200-1399 | Class D |
| <1200 | Beginner |

New players start at 1200 rating.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by the [DOE National Science Bowl](https://science.osti.gov/wdts/nsb)
- Questions based on official Science Bowl format
- Not affiliated with the Department of Energy

---

Built with ❤️ for science enthusiasts everywhere
