# GIGA LAN Tournament Manager

A modern, self-hosted web application for managing competitive LAN party tournaments with an immersive gaming aesthetic. Features a Swiss-lite group stage system and single-elimination playoffs with interactive bracket management.

## Features

### Tournament Management
- **Multi-Tournament Support**: Create and manage multiple tournaments simultaneously
- **Real-time State Management**: Live updates of tournament progress and standings
- **Tournament Completion**: Automatic completion detection with celebration podium

### Player Management
- **Dynamic Registration**: Add players during registration phase
- **Player Name Editing**: Edit player names throughout tournament (with restrictions)
- **Live Standings**: Real-time player statistics and rankings

### Group Stage (Swiss-lite)
- **Automated Pod Generation**: Smart grouping based on player count
- **Round-Robin Matches**: Complete round-robin within each group
- **Flexible Scoring**: Win (3pts), Draw (1pt), Loss (0pts)
- **Group Name Customization**: Edit group names during registration
- **Match Result Submission**: Interactive result entry with validation

### Playoffs & Brackets
- **Single Elimination**: Traditional bracket format
- **Interactive Advancement**: Click-to-advance bracket system
- **Multiple Bracket Sizes**: 4, 6, or 8 player playoffs
- **3rd Place Matches**: Consolation bracket for comprehensive placement
- **Champion Celebration**: Immersive podium with trophy and confetti effects

### User Experience
- **Gaming Aesthetic**: Cyberpunk-inspired dark theme with neon accents
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Smooth Animations**: Card entrance effects and hover transitions
- **Accessibility**: Keyboard navigation and screen reader support

## Architecture & Tech Stack

### Frontend
- **Framework**: Svelte 5 with modern reactivity (`$state`, `$derived`, `$effect`)
- **Build Tool**: Vite for fast development and optimized production builds
- **Styling**: Tailwind CSS with custom gaming-themed design system
- **Icons**: Heroicons and custom SVG graphics
- **State Management**: Svelte's built-in reactive state system

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript for type safety
- **API**: RESTful endpoints with proper error handling
- **Validation**: Input validation and sanitization

### Database & Persistence
- **Database**: Redis for fast, in-memory data storage
- **Serialization**: JSON-based data persistence
- **Backup**: Automatic state saving on all mutations

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Development**: Hot reload for both frontend and backend
- **Production**: Optimized builds with static file serving

## Project Structure

```
giga-lan-manager/
├── src/                          # Frontend Source
│   ├── app.css                  # Global styles and Tailwind imports
│   ├── App.svelte               # Main application router
│   ├── Layout.svelte            # Navigation and layout wrapper
│   ├── main.ts                  # Application entry point
│   ├── lib/
│   │   └── api.ts              # API client functions
│   └── pages/                   # Route components
│       ├── TournamentList.svelte    # Tournament lobby
│       ├── TournamentDashboard.svelte # Tournament overview
│       ├── Groups.svelte        # Group stage management
│       └── Brackets.svelte      # Playoff bracket display
├── server/                      # Backend Source
│   ├── index.ts                # Express server setup
│   └── tournament.ts           # Tournament business logic
├── public/                      # Static assets
├── tests/                       # Test files
├── docker-compose.yml          # Docker orchestration
├── Dockerfile                  # Container build instructions
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── README.md                   # This file
```

## Tournament Flow & Rules

### 1. Registration Phase
- **Duration**: Unlimited time
- **Actions Allowed**:
  - Add/remove players
  - Edit player names
  - Edit tournament name
  - Edit group names
- **Minimum Players**: 4 players required to start

### 2. Group Stage
- **Format**: Swiss-lite with randomized pods
- **Rounds**: 3 rounds total
- **Match Format**: 1v1 matches within each group
- **Scoring**:
  - Win: 3 points
  - Draw: 1 point
  - Loss: 0 points
- **Advancement**: Top players advance to playoffs

### 3. Playoffs
- **Format**: Single-elimination bracket
- **Bracket Sizes**: 4, 6, or 8 players
- **Match Types**:
  - Quarterfinals (6+ players)
  - Semifinals
  - Finals
  - 3rd Place Match (consolation)
- **Advancement**: Click winner to advance to next round

### 4. Completion
- **Trigger**: All playoff matches completed
- **Celebration**: Champion podium with trophy effects
- **History**: Full bracket and results remain viewable

## Getting Started

### Prerequisites
- **Docker & Docker Compose** (recommended)
- **Node.js 18+** (for local development)
- **Git** (for cloning)

### Quick Start with Docker (Recommended)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/giga-lan-manager.git
   cd giga-lan-manager
   ```

2. **Start the application**:
   ```bash
   docker-compose up --build
   ```

3. **Open your browser**:
   - Navigate to [http://localhost:3000](http://localhost:3000)
   - Start creating tournaments!

### Local Development Setup

1. **Start Redis**:
   ```bash
   docker run -d -p 6379:6379 redis:alpine
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development servers**:
   ```bash
   # Terminal 1: Backend
   npm run dev:server

   # Terminal 2: Frontend
   npm run dev:client
   ```

4. **Access the application**:
   - Frontend: [http://localhost:5173](http://localhost:5173)
   - Backend API: [http://localhost:3000](http://localhost:3000)

## API Documentation

### Tournament Management

#### `GET /api/tournaments`
Get list of all tournaments
```json
[
  {
    "id": "tournament-uuid",
    "name": "Summer LAN 2024",
    "state": "registration",
    "playerCount": 8
  }
]
```

#### `POST /api/tournaments`
Create a new tournament
```json
// Request
{
  "name": "Tournament Name"
}

// Response
{
  "id": "tournament-uuid",
  "name": "Tournament Name"
}
```

#### `DELETE /api/tournament/:tournamentId`
Delete a tournament

### Tournament Operations

#### `GET /api/tournament/:tournamentId/state`
Get complete tournament state
```json
{
  "id": "tournament-uuid",
  "name": "Tournament Name",
  "players": [...],
  "pods": [...],
  "matches": [...],
  "bracketMatches": [...],
  "state": "playoffs"
}
```

#### `POST /api/tournament/:tournamentId/players`
Add a player
```json
// Request
{
  "name": "Player Name"
}

// Response
{
  "id": "player-uuid",
  "name": "Player Name",
  "points": 0,
  "matchesPlayed": 0,
  "wins": 0,
  "draws": 0,
  "losses": 0,
  "scoreDifferential": 0
}
```

#### `PUT /api/tournament/:tournamentId/player/:playerId`
Update player name
```json
// Request
{
  "name": "New Player Name"
}
```

#### `POST /api/tournament/:tournamentId/start`
Start the group stage (requires minimum 4 players)

#### `POST /api/tournament/:tournamentId/match/:matchId`
Submit match results
```json
// Request
{
  "results": {
    "player1-id": { "points": 3 },
    "player2-id": { "points": 0 }
  }
}
```

#### `POST /api/tournament/:tournamentId/brackets`
Generate playoff brackets (requires all group matches completed)

#### `POST /api/tournament/:tournamentId/bracket-match/:matchId`
Advance bracket winner
```json
// Request
{
  "winnerId": "player-uuid"
}
```

#### `PUT /api/tournament/:tournamentId/name`
Update tournament name
```json
// Request
{
  "name": "New Tournament Name"
}
```

#### `PUT /api/tournament/:tournamentId/group/:podId/name`
Update group name
```json
// Request
{
  "name": "New Group Name"
}
```

#### `POST /api/tournament/:tournamentId/group/:podId/reset`
Reset group match results

#### `POST /api/tournament/:tournamentId/reset`
Reset entire tournament to registration state

## Design System

### Color Palette
- **Primary Background**: `space-900` to `space-800` gradient
- **Accent Colors**:
  - Cyber Green: `#00ff88` (success, wins)
  - Cyber Blue: `#00d4ff` (information, links)
  - Cyber Pink: `#ff0080` (accent, playoffs)
  - Gaming Text: `#e8eef5` (primary text)

### Typography
- **Primary Font**: Inter (system-ui fallback)
- **Weights**: 400 (normal), 700 (bold), 900 (black)
- **Sizes**: Responsive scaling from mobile to desktop

### Components
- **Glass Effect**: Backdrop blur with subtle borders
- **Card Entrance**: Smooth slide-in animations
- **Hover Effects**: Scale transforms and glow effects
- **Status Indicators**: Color-coded badges and rings

## Development

### Available Scripts
```bash
# Development
npm run dev              # Start both frontend and backend
npm run dev:client       # Frontend only (Vite)
npm run dev:server       # Backend only (ts-node)

# Building
npm run build           # Build for production
npm run build:server    # Build backend only

# Testing
npm test                # Run test suite
npm run test:watch      # Watch mode testing

# Docker
docker-compose up       # Start all services
docker-compose down     # Stop all services
docker-compose logs     # View logs
```

### Environment Variables
```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Server Configuration
PORT=3000
NODE_ENV=development
```

### Code Quality
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting and formatting
- **Prettier**: Automatic code formatting
- **Testing**: Jest test framework

## Deployment

### Docker Production Build
```bash
# Build and run in production mode
docker-compose -f docker-compose.yml up --build -d

# Scale the application
docker-compose up -d --scale app=3
```

### Manual Deployment
1. **Build the application**:
   ```bash
   npm run build
   npm run build:server
   ```

2. **Configure environment**:
   ```bash
   export REDIS_URL=redis://your-redis-instance:6379
   export NODE_ENV=production
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

### Nginx Configuration (Example)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:3000/api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Contributing

### Development Workflow
1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes** with proper TypeScript types
4. **Add tests** for new functionality
5. **Run the linter**: `npm run lint`
6. **Test your changes**: `npm test`
7. **Submit a pull request**

### Code Standards
- **TypeScript**: Use strict typing and avoid `any` types
- **Svelte**: Follow Svelte 5 best practices with `$state` and `$derived`
- **Commits**: Use conventional commit format
- **Documentation**: Update README for new features

### Testing
```bash
# Run all tests
npm test

# Run specific test file
npm test -- tournament.test.ts

# Run with coverage
npm run test:coverage
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Svelte** for the amazing reactive framework
- **Tailwind CSS** for the utility-first styling approach
- **Redis** for reliable data persistence
- **Docker** for containerization excellence

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/giga-lan-manager/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/giga-lan-manager/discussions)
- **Documentation**: [Wiki](https://github.com/yourusername/giga-lan-manager/wiki)

---

**Made with for the LAN gaming community**
