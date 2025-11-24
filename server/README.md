# Backend Server Documentation

This directory contains the Node.js/Express backend for the GIGA LAN Tournament Manager. Built with TypeScript for type safety and Redis for data persistence.

## Directory Structure

```
server/
├── index.ts                 # Express server setup and API routes
├── tournament.ts           # Core tournament business logic
├── brackets.test.ts        # Unit tests for bracket generation
├── full-tournament.test.ts # End-to-end tournament flow tests
├── tournament.test.ts      # Tournament lifecycle tests
└── README.md              # This documentation
```

## Architecture Overview

### Design Patterns
- **Repository Pattern**: TournamentManager class encapsulates all business logic
- **State Machine**: Tournament lifecycle with defined state transitions
- **Event Sourcing**: All mutations trigger state persistence
- **Dependency Injection**: Clean separation of concerns

### Data Flow
```
Client Request → Express Route → TournamentManager Method → State Update → Redis Persistence → Response
```

### State Management
- **In-Memory Cache**: Fast access to active tournament data
- **Redis Persistence**: Durable storage with automatic recovery
- **Atomic Operations**: State mutations are transactional
- **Version Control**: Timestamp-based state versioning

## Core Classes

### TournamentManager Class

#### Constructor & Properties
```typescript
class TournamentManager {
    id: string;
    name: string;
    players: Player[] = [];
    pods: Pod[] = [];
    matches: Match[] = [];
    bracketMatches: BracketMatch[] = [];
    state: 'registration' | 'group' | 'playoffs' | 'completed' = 'registration';
}
```

#### Tournament Lifecycle Methods

**Player Management:**
```typescript
addPlayer(name: string): Player
updatePlayerName(playerId: string, name: string): void
```

**Tournament Control:**
```typescript
startGroupStage(): void                    // Registration → Group Stage
generateBrackets(): void                   // Group Stage → Playoffs
resetTournament(): void                    // Any State → Registration
```

**Match Operations:**
```typescript
submitMatchResult(matchId: string, results: MatchResults): void
submitBracketWinner(matchId: string, winnerId: string): void
```

**Administrative:**
```typescript
updateTournamentName(name: string): void
updateGroupName(podId: string, name: string): void
resetGroupData(podId: string): void
```

### Data Models

#### Player Interface
```typescript
interface Player {
    id: string;
    name: string;
    points: number;           // Total tournament points
    matchesPlayed: number;    // Games played
    wins: number;            // Win count
    draws: number;           // Draw count
    losses: number;          // Loss count
    scoreDifferential: number; // For tiebreakers
}
```

#### Match Interface
```typescript
interface Match {
    id: string;
    podId: string;           // Which group this belongs to
    round: number;           // Round number (1-3)
    player1Id: string;
    player2Id: string;
    players: string[];       // Player IDs for easy access
    result?: MatchResult;    // Outcome when completed
    completed: boolean;      // Match status
}
```

#### BracketMatch Interface
```typescript
interface BracketMatch {
    id: string;
    round: number;
    player1Id?: string;
    player2Id?: string;
    winnerId?: string;
    nextMatchId?: string;     // Where winner advances
    nextMatchSlot?: 1 | 2;   // Player 1 or 2 slot
    bracketType: 'quarterfinals' | 'semifinals' | 'finals' | '3rd-place';
    matchLabel?: string;
}
```

## Tournament Logic

### Group Stage Algorithm

**Pod Generation:**
1. **Player Distribution**: Evenly distribute players across groups
2. **Size Optimization**: Groups of 4 players (adjustable for different counts)
3. **Round-Robin Scheduling**: Each player plays every other player once

**Supported Configurations:**
- **4 players**: 1 group of 4 (6 matches total)
- **5 players**: 1 group of 5 (10 matches total)
- **6 players**: 2 groups of 3 (6 matches total)
- **7 players**: 1 group of 7 (21 matches total)
- **8 players**: 2 groups of 4 (12 matches total)
- **9 players**: 3 groups of 3 (9 matches total)
- **10-12 players**: 3-4 groups of 4

### Bracket Generation

**Qualification Rules:**
- **4-5 players**: Top 4 advance
- **6-8 players**: Top 4 advance
- **9-13 players**: Top 6 advance
- **14+ players**: Top 8 advance

**Bracket Structures:**
- **4 Players**: Semifinals → Final + 3rd Place
- **6 Players**: Quarterfinals → Semifinals → Final + 3rd Place
- **8 Players**: Quarterfinals → Semifinals → Final + 3rd Place

### Completion Detection

**Tournament Completion Trigger:**
```typescript
// Check if all bracket matches are completed
const allBracketMatchesCompleted = this.bracketMatches.every(m => m.winnerId);
if (allBracketMatchesCompleted) {
    this.state = 'completed';
}
```

**Completion Requirements:**
- All quarterfinal matches (if applicable) must have winners
- All semifinal matches must have winners
- Final match must have winner
- 3rd place match (if exists) must have winner

## API Endpoints

### Tournament Management
```typescript
GET    /api/tournaments           # List all tournaments
POST   /api/tournaments           # Create new tournament
DELETE /api/tournament/:id        # Delete tournament
```

### Tournament Operations
```typescript
GET    /api/tournament/:id/state  # Get complete tournament state
POST   /api/tournament/:id/start  # Start group stage
POST   /api/tournament/:id/brackets # Generate playoffs
POST   /api/tournament/:id/reset  # Reset to registration
```

### Player Management
```typescript
POST   /api/tournament/:id/players         # Add player
PUT    /api/tournament/:id/player/:pid     # Update player name
```

### Match Operations
```typescript
POST   /api/tournament/:id/match/:mid      # Submit group match result
POST   /api/tournament/:id/bracket-match/:mid # Advance bracket winner
```

### Administrative
```typescript
PUT    /api/tournament/:id/name             # Update tournament name
PUT    /api/tournament/:id/group/:gid/name # Update group name
POST   /api/tournament/:id/group/:gid/reset # Reset group data
```

## Data Persistence

### Redis Integration
```typescript
// State persistence
const saveState = async (tournamentId: string) => {
    const tournament = tournaments.get(tournamentId);
    if (tournament) {
        await redisClient.set(`tournament:${tournamentId}`, JSON.stringify(tournament));
    }
};

// State recovery
const tournamentIds = await redisClient.sMembers('tournaments:list');
for (const id of tournamentIds) {
    const state = await redisClient.get(`tournament:${id}`);
    if (state) {
        const data = JSON.parse(state);
        const tournament = new TournamentManager(data.id, data.name);
        Object.assign(tournament, data);
        tournaments.set(id, tournament);
    }
}
```

### Data Structure
```
Redis Keys:
├── tournaments:list          # Set of tournament IDs
└── tournament:{id}          # Tournament JSON data
```

## Testing Suite

### Test Categories

#### Unit Tests (`tournament.test.ts`)
- Tournament lifecycle operations
- Player management functions
- State transition validation
- Error handling scenarios

#### Bracket Tests (`brackets.test.ts`)
- Bracket generation algorithms
- Player advancement logic
- Tournament completion detection
- Edge cases for different player counts

#### Integration Tests (`full-tournament.test.ts`)
- Complete tournament workflows
- End-to-end user journeys
- Data persistence validation
- Concurrent operation handling

### Test Structure
```typescript
describe('TournamentManager', () => {
    let tournament: TournamentManager;

    beforeEach(() => {
        tournament = new TournamentManager('test-id', 'Test Tournament');
    });

    describe('Player Management', () => {
        test('should add player with correct initial stats', () => {
            const player = tournament.addPlayer('Test Player');
            expect(player.name).toBe('Test Player');
            expect(player.points).toBe(0);
        });
    });
});
```

### Test Coverage Areas
- Tournament state transitions
- Player CRUD operations
- Match result processing
- Bracket generation algorithms
- Winner advancement logic
- Tournament completion detection
- Error handling and validation
- Data persistence and recovery

## Security & Validation

### Input Validation
- **Tournament Names**: Required, non-empty strings
- **Player Names**: Required, trimmed strings
- **Match Results**: Valid player IDs and point values
- **Tournament States**: Strict state machine transitions

### Error Handling
```typescript
// Example validation
startGroupStage() {
    if (this.players.length < 4) {
        throw new Error("Need at least 4 players");
    }
    // ... rest of logic
}
```

### Rate Limiting
- API endpoints include basic rate limiting
- State mutations are atomic to prevent race conditions
- Concurrent tournament access is supported

## Performance Considerations

### Memory Management
- Tournament objects cached in memory for fast access
- Redis persistence for durability and recovery
- Automatic cleanup of completed tournaments (optional)

### Scalability
- Horizontal scaling support via Redis clustering
- Stateless API design for load balancing
- Efficient data structures for large tournaments

### Monitoring
- Request logging and error tracking
- Performance metrics for critical operations
- Tournament state analytics

## Deployment

### Docker Configuration
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build:server
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables
```bash
REDIS_URL=redis://localhost:6379  # Redis connection string
PORT=3000                         # Server port
NODE_ENV=production              # Environment mode
```

### Health Checks
```typescript
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        tournaments: tournaments.size
    });
});
```

---

**Built with TypeScript for type safety and Redis for reliable persistence.**
