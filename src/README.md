# Frontend Source Code Documentation

This directory contains the Svelte 5 frontend application for the GIGA LAN Tournament Manager. Built with modern reactive patterns and a gaming-focused design system.

## Directory Structure

```
src/
├── app.css                 # Global styles and Tailwind imports
├── App.svelte             # Main application router and layout
├── Layout.svelte          # Navigation header with tournament links
├── main.ts               # Application entry point
├── lib/
│   └── api.ts           # API client with all backend communication
└── pages/                # Route-based page components
    ├── TournamentList.svelte     # Tournament lobby and creation
    ├── TournamentDashboard.svelte # Tournament overview and management
    ├── Groups.svelte       # Group stage match management
    ├── Brackets.svelte     # Playoff bracket display and interaction
    └── Statistics.svelte   # Tournament statistics and player rankings
```

## Core Components

### App.svelte - Main Router
**Purpose**: Handles client-side routing and tournament context
- **Routing Logic**: Parses URL paths to determine current page and tournament
- **Tournament Context**: Extracts `tournamentId` from URL for child components
- **404 Handling**: Shows not found page for invalid routes

**Key Features**:
- Dynamic route matching for `/tournament/:id/*` patterns
- Tournament state awareness for conditional rendering
- Clean separation between tournament-specific and global pages

### Layout.svelte - Navigation Header
**Purpose**: Provides consistent navigation across all tournament pages
- **Brand Identity**: GIGA LAN branding with cyber aesthetic
- **Tournament Navigation**: Dynamic links based on current tournament
- **Responsive Design**: Collapsible navigation for mobile devices

**Navigation States**:
- **Tournament Lobby**: Always available
- **Tournament Pages**: Dashboard, Groups, Brackets, Statistics (when tournament exists)

### TournamentList.svelte - Tournament Lobby
**Purpose**: Central hub for tournament management and creation
- **Tournament Creation**: Form to create new tournaments
- **Tournament Listing**: Grid of existing tournaments with status badges
- **Tournament Actions**: Enter tournament or delete tournament

**Features**:
- Real-time tournament status display
- Player count indicators
- Delete confirmation dialogs
- Responsive card-based layout

### TournamentDashboard.svelte - Tournament Overview
**Purpose**: Main tournament management interface
- **Tournament Header**: Editable tournament name with state restrictions
- **Player Management**: Add players, edit names (with phase restrictions)
- **Tournament Actions**: Start tournament, reset tournament
- **State Awareness**: Different UI based on tournament phase

**Key Interactions**:
- **Registration Phase**: Full editing capabilities
- **Active Tournament**: Restricted editing, progress indicators
- **Completed Tournament**: Read-only with celebration elements

### Groups.svelte - Group Stage Management
**Purpose**: Interactive group stage match management
- **Round Navigation**: Switch between rounds 1-3
- **Group Tables**: Live standings for each group with customizable names
- **Match Cards**: Interactive result submission for each match
- **Progress Tracking**: Visual round completion indicators

**Advanced Features**:
- **Match Selection UI**: Win/Loss/Tie buttons with visual feedback
- **Group Name Editing**: Restricted to registration phase
- **Group Reset**: Clear all results for a specific group
- **Bracket Generation**: Automatic advancement to playoffs

### Brackets.svelte - Playoff Bracket Display
**Purpose**: Interactive playoff bracket with champion celebration
- **Bracket Visualization**: Single-elimination bracket layout
- **Winner Advancement**: Click-to-advance system
- **Champion Podium**: Immersive celebration for completed tournaments
- **Match History**: Complete bracket remains viewable after completion

**Special Features**:
- **Podium Layout**: 1st, 2nd, 3rd place celebration display
- **Confetti Effects**: Animated celebration elements
- **Responsive Bracket**: Horizontal scrolling for large brackets
- **State-Aware Display**: Different UI for active vs completed tournaments

### Statistics.svelte - Tournament Statistics
**Purpose**: Comprehensive tournament statistics and player performance analysis
- **Tournament Overview**: Key metrics and completion status
- **Player Rankings**: Performance-based leaderboard with statistics
- **Match Statistics**: Win/loss/draw distribution and completion rates
- **Group Performance**: Individual group statistics and progress tracking

**Features**:
- **Real-time Updates**: Statistics update as tournament progresses
- **Player Profiles**: Profile photos in rankings and statistics
- **Performance Metrics**: Win rates, points per game, and rankings
- **Tournament Timeline**: Visual representation of tournament phases
- **Responsive Layout**: Optimized display for different screen sizes

## API Client (lib/api.ts)

### Tournament Management
```typescript
// Core tournament operations
getTournaments(): Promise<TournamentSummary[]>
createTournament(name: string): Promise<Tournament>
deleteTournament(id: string): Promise<void>

// Tournament state
getState(id: string): Promise<TournamentState>

// Player management
addPlayer(tournamentId: string, name: string): Promise<Player>
updatePlayerName(tournamentId: string, playerId: string, name: string): Promise<void>

// Tournament lifecycle
startGroupStage(tournamentId: string): Promise<void>
generateBrackets(tournamentId: string): Promise<void>
resetTournament(tournamentId: string): Promise<void>

// Match operations
submitMatch(tournamentId: string, matchId: string, results: MatchResults): Promise<void>
submitBracketWinner(tournamentId: string, matchId: string, winnerId: string): Promise<void>

updateTournamentName(tournamentId: string, name: string): Promise<void>
updateGroupName(tournamentId: string, podId: string, name: string): Promise<void>
resetGroupData(tournamentId: string, podId: string): Promise<void>
updatePlayerPhoto(tournamentId: string, playerId: string, photoData: string): Promise<void>
```

### Error Handling
- **Network Errors**: Automatic retry logic for transient failures
- **Validation Errors**: User-friendly error messages
- **State Conflicts**: Conflict resolution for concurrent modifications

## Styling System (app.css)

### Design Philosophy
- **Gaming Aesthetic**: Cyberpunk-inspired dark theme
- **Neon Accents**: Bright colors for interactive elements
- **Glass Effects**: Backdrop blur with subtle transparency
- **Responsive Design**: Mobile-first approach with desktop enhancements

### Key CSS Classes
```css
/* Glass morphism effect */
.glass {
  background: rgba(30, 36, 71, 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Gradient text effects */
.gradient-text {
  background: linear-gradient(135deg, #00ff88 0%, #00d4ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Button hover effects */
.btn-glow:hover {
  box-shadow: 0 0 30px rgba(0, 255, 136, 0.6);
  transform: translateY(-2px);
}

/* Animation classes */
.card-entrance {
  animation: cardEntrance 0.4s ease-out forwards;
}

.status-pulse {
  animation: statusPulse 2s ease-in-out infinite;
}
```

### Color Palette
- **Background**: `space-900` (#0a0e27) to `space-800` (#151937)
- **Primary Text**: `gaming-text` (#e8eef5)
- **Cyber Green**: `#00ff88` (success, wins, links)
- **Cyber Blue**: `#00d4ff` (information, accents)
- **Cyber Pink**: `#ff0080` (playoffs, highlights)

## State Management

### Svelte 5 Reactive Patterns
- **`$state()`**: Local component state with automatic reactivity
- **`$derived()`**: Computed values that update automatically
- **`$effect()`**: Side effects for logging and external updates

### Tournament State Flow
```
Registration → Group Stage → Playoffs → Completed
     ↓            ↓            ↓         ↓
   Edit All    Restricted   Interactive  Celebration
   Players     Editing      Brackets     Podium
   Names       Group Names  Winner       Full History
   Groups      Tournament   Advancement  Viewable
               Name
```

### Data Synchronization
- **Optimistic Updates**: UI updates immediately, reverts on error
- **State Refresh**: Automatic reload after successful mutations
- **Conflict Resolution**: Server state takes precedence on conflicts

## Responsive Design

### Breakpoints
- **Mobile**: < 768px (single column, stacked layout)
- **Tablet**: 768px - 1024px (two columns, compact cards)
- **Desktop**: > 1024px (multi-column, full feature set)

### Mobile Optimizations
- Touch-friendly button sizes (minimum 44px)
- Horizontal scrolling for brackets
- Collapsible navigation
- Simplified forms and dialogs

## Accessibility

### Keyboard Navigation
- **Tab Order**: Logical navigation through interactive elements
- **Enter/Space**: Activate buttons and form submissions
- **Escape**: Close modals and cancel operations

### Screen Reader Support
- **ARIA Labels**: Descriptive labels for complex interactions
- **Live Regions**: Dynamic content announcements
- **Semantic HTML**: Proper heading hierarchy and landmarks

### Visual Accessibility
- **Color Contrast**: WCAG AA compliant color ratios
- **Focus Indicators**: Visible focus rings on interactive elements
- **Reduced Motion**: Respects user's motion preferences

## Testing Strategy

### Component Testing
- **Unit Tests**: Individual component functionality
- **Integration Tests**: Component interactions
- **E2E Tests**: Full user workflows

### Test Coverage
- **API Client**: All network request/response handling
- **State Management**: Reactive updates and derived values
- **User Interactions**: Form submissions, button clicks, navigation

## Performance Optimizations

### Bundle Optimization
- **Code Splitting**: Route-based lazy loading
- **Tree Shaking**: Remove unused dependencies
- **Asset Optimization**: Compressed images and fonts

### Runtime Performance
- **Virtual Scrolling**: For large tournament lists
- **Debounced Updates**: Prevent excessive API calls
- **Memory Management**: Proper cleanup of event listeners

---

- **Code Splitting**: Route-based lazy loading
