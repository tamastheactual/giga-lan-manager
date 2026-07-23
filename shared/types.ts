// Core domain model for the tournament engine.
//
// Single source of truth shared by the server (server/**, via ../shared/*.js)
// and the client (src/**, via the $shared alias). The client previously kept a
// drifted, incomplete subset of these in src/lib/api.ts (e.g. Team was missing
// its standings fields). Do not fork.

export interface Player {
    id: string;
    name: string;
    points: number;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    scoreDifferential: number; // For tiebreakers (kills, rounds won, etc.)
    totalGameScore: number; // Total in-game score (kills, rounds, etc.)
    profilePhoto?: string; // Base64-encoded image data
    // Team game stats (aggregated across all matches)
    totalKills?: number;
    totalDeaths?: number;
    totalAssists?: number;
}

// Team structure for team-based games
export interface Team {
    id: string;
    name: string;
    playerIds: string[]; // References to Player IDs
    logo?: string; // Base64-encoded team logo
    // Team aggregate stats
    points: number;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    roundsWon: number;
    roundsLost: number;
}

// Player stats for a single game/map in team matches
export interface PlayerGameStats {
    playerId: string;
    kills: number;
    deaths: number;
    assists?: number;
}

// Team game result for a single map/game in a match
export interface TeamGameResult {
    gameNumber: number;
    mapName?: string;
    team1Score: number;
    team2Score: number;
    winnerTeamId: string;
    playerStats?: PlayerGameStats[];
}

// Single game result within a match (for BO3)
export interface GameResult {
    gameNumber: number; // 1, 2, or 3 for BO3
    mapName?: string;
    player1Score: number; // kills, rounds, wins depending on game
    player2Score: number;
    winnerId?: string; // Who won this specific game
}

export interface Match {
    id: string;
    podId: string;
    round: number; // Which round this match belongs to (1, 2, or 3)
    player1Id: string;
    player2Id: string;
    players: string[]; // IDs of players in this match
    mapName?: string; // Selected map for this match
    result?: {
        [playerId: string]: {
            rank?: number; // 1st, 2nd, 3rd, 4th
            points: number; // 3, 1, 0
            score?: number; // In-game score (kills, rounds won, etc.)
        }
    };
    gameResults?: GameResult[]; // Detailed results per game (for BO3 or tracking)
    completed: boolean;
}

export interface Pod {
    id: string;
    round: number;
    players: string[];
    matchId: string;
    name?: string; // Custom group name
}

// BO3 game result for bracket matches
export interface BracketGameResult {
    gameNumber: number;
    mapName?: string;
    player1Score: number;
    player2Score: number;
    winnerId: string;
}

export interface BracketMatch {
    id: string;
    round: number;
    player1Id?: string;
    player2Id?: string;
    winnerId?: string;
    nextMatchId?: string; // Where the winner goes
    nextMatchSlot?: 1 | 2; // Player 1 or Player 2 slot
    bracketType: 'quarterfinals' | 'semifinals' | 'finals' | '3rd-place';
    matchLabel?: string; // e.g., "Semifinal 1", "Grand Final"
    loserFromMatch1?: string; // For 3rd place match
    loserFromMatch2?: string; // For 3rd place match
    // BO3 tracking
    games?: BracketGameResult[];
    player1Wins?: number; // Games won in the series
    player2Wins?: number;
}

// Team bracket match for team-based tournaments
export interface TeamBracketMatch {
    id: string;
    round: number;
    team1Id?: string;
    team2Id?: string;
    winnerId?: string; // Winning team ID
    nextMatchId?: string;
    nextMatchSlot?: 1 | 2;
    bracketType: 'quarterfinals' | 'semifinals' | 'finals' | '3rd-place';
    matchLabel?: string;
    loserFromMatch1?: string;
    loserFromMatch2?: string;
    // BO3/BO5 tracking with player stats
    games?: TeamGameResult[];
    team1Wins?: number;
    team2Wins?: number;
}

// Group stage match for team tournaments
export interface TeamMatch {
    id: string;
    matchNumber: number;
    round: number;
    podId?: string; // Group/pod this match belongs to
    team1Id: string;
    team2Id: string;
    team1Score?: number;
    team2Score?: number;
    winnerId?: string;
    games?: TeamGameResult[];
    completed: boolean;
}

// Pod for team group stage
export interface TeamPod {
    id: string;
    round: number;
    teams: string[]; // Team IDs
    matchId: string;
    name?: string;
}
