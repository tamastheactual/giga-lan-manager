import { v4 as uuidv4 } from 'uuid';
import { type GameType, getGameConfig, supportsTeamMode } from './gameTypes.js';

// Schema version for data migrations
const SCHEMA_VERSION = 2;

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

export class TournamentManager {
    id: string;
    name: string;
    gameType: GameType; // Which game this tournament is for
    mapPool: string[] = []; // Optional map pool for tournaments
    players: Player[] = [];
    pods: Pod[] = [];
    matches: Match[] = [];
    bracketMatches: BracketMatch[] = [];
    state: 'registration' | 'group' | 'playoffs' | 'completed' = 'registration';
    createdAt: string;
    startedAt?: string;
    groupStageRoundLimit?: number; // Custom round limit for group stage (CS 1.6)
    playoffsRoundLimit?: number; // Custom round limit for playoffs (CS 1.6)
    useCustomPoints?: boolean; // Override default archetype with custom points
    
    // Team tournament support
    _schemaVersion: number = 1; // 1 = solo, 2 = team-capable
    isTeamBased: boolean = false;
    teams: Team[] = [];
    teamPods: TeamPod[] = [];
    teamMatches: TeamMatch[] = [];
    teamBracketMatches: TeamBracketMatch[] = [];

    constructor(id: string, name: string, gameType: GameType = 'cs16', mapPool: string[] = [], groupStageRoundLimit?: number, playoffsRoundLimit?: number, useCustomPoints?: boolean, teamMode?: boolean) {
        this.id = id;
        this.name = name;
        this.gameType = gameType;
        this.mapPool = mapPool;
        this.createdAt = new Date().toISOString();
        this.groupStageRoundLimit = groupStageRoundLimit;
        this.playoffsRoundLimit = playoffsRoundLimit;
        this.useCustomPoints = useCustomPoints;
        // Team mode is enabled via parameter (game must support it)
        this.isTeamBased = teamMode === true;
        this._schemaVersion = this.isTeamBased ? 2 : 1;
    }
    
    // Enable/disable team mode (only during registration)
    setTeamMode(enabled: boolean): void {
        if (this.state !== 'registration') {
            throw new Error("Cannot change team mode after tournament has started");
        }
        const config = this.getGameConfig();
        if (enabled && !config.supportsTeamMode) {
            throw new Error(`${config.name} does not support team mode`);
        }
        this.isTeamBased = enabled;
        this._schemaVersion = enabled ? 2 : 1;
        // Clear teams if disabling
        if (!enabled) {
            this.teams = [];
        }
    }
    
    // Get game configuration
    getGameConfig() {
        return getGameConfig(this.gameType);
    }

    // Fill in missing maps for existing matches with random selection
    fillMissingMaps() {
        const config = this.getGameConfig();
        const availableMaps = this.mapPool.length > 0 ? this.mapPool : config.maps;
        
        // Fill in missing maps for group stage matches
        this.matches.forEach(match => {
            if (!match.mapName && match.completed) {
                match.mapName = availableMaps[Math.floor(Math.random() * availableMaps.length)];
            }
        });

        // Fill in missing maps for bracket matches
        this.bracketMatches.forEach(match => {
            // Fill in missing maps in games array
            if (match.games && match.games.length > 0) {
                match.games.forEach((game: GameResult) => {
                    if (!game.mapName) {
                        game.mapName = availableMaps[Math.floor(Math.random() * availableMaps.length)];
                    }
                });
            }
        });
    }

    addPlayer(name: string): Player {
        const player: Player = {
            id: uuidv4(),
            name,
            points: 0,
            matchesPlayed: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            scoreDifferential: 0,
            totalGameScore: 0
        };
        this.players.push(player);
        return player;
    }

    removePlayer(playerId: string): void {
        if (this.state !== 'registration') {
            throw new Error("Cannot remove players after tournament has started");
        }
        const index = this.players.findIndex(p => p.id === playerId);
        if (index === -1) {
            throw new Error("Player not found");
        }
        this.players.splice(index, 1);
    }

    // Team management methods
    addTeam(name: string, playerIds: string[], logo?: string): Team {
        if (!this.isTeamBased) {
            throw new Error("Cannot add teams to a solo tournament");
        }
        
        // Check for duplicate team name
        const normalizedName = name.trim().toLowerCase();
        if (this.teams.some(t => t.name.trim().toLowerCase() === normalizedName)) {
            throw new Error(`Team name "${name}" already exists`);
        }
        
        // Validate all players exist
        for (const playerId of playerIds) {
            if (!this.players.find(p => p.id === playerId)) {
                throw new Error(`Player ${playerId} not found`);
            }
        }
        
        // Check team size limits
        const config = this.getGameConfig();
        if (config.minTeamSize !== undefined && playerIds.length < config.minTeamSize) {
            throw new Error(`Team must have at least ${config.minTeamSize} players`);
        }
        if (config.maxTeamSize !== undefined && playerIds.length > config.maxTeamSize) {
            throw new Error(`Team can have at most ${config.maxTeamSize} players`);
        }
        
        const team: Team = {
            id: uuidv4(),
            name,
            playerIds,
            logo,
            // Initialize stats
            points: 0,
            matchesPlayed: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            roundsWon: 0,
            roundsLost: 0
        };
        this.teams.push(team);
        return team;
    }

    removeTeam(teamId: string): void {
        if (this.state !== 'registration') {
            throw new Error("Cannot remove teams after tournament has started");
        }
        const index = this.teams.findIndex(t => t.id === teamId);
        if (index === -1) {
            throw new Error("Team not found");
        }
        this.teams.splice(index, 1);
    }

    updateTeam(teamId: string, updates: { name?: string; playerIds?: string[]; logo?: string }): Team {
        if (this.state !== 'registration') {
            throw new Error("Cannot update teams after tournament has started");
        }
        const team = this.teams.find(t => t.id === teamId);
        if (!team) {
            throw new Error("Team not found");
        }
        
        if (updates.name) {
            // Check for duplicate team name (excluding current team)
            const normalizedName = updates.name.trim().toLowerCase();
            if (this.teams.some(t => t.id !== teamId && t.name.trim().toLowerCase() === normalizedName)) {
                throw new Error(`Team name "${updates.name}" already exists`);
            }
            team.name = updates.name;
        }
        if (updates.logo !== undefined) team.logo = updates.logo;
        if (updates.playerIds) {
            // Validate all players exist
            for (const playerId of updates.playerIds) {
                if (!this.players.find(p => p.id === playerId)) {
                    throw new Error(`Player ${playerId} not found`);
                }
            }
            
            // Check team size limits
            const config = this.getGameConfig();
            if (config.minTeamSize !== undefined && updates.playerIds.length < config.minTeamSize) {
                throw new Error(`Team must have at least ${config.minTeamSize} players`);
            }
            if (config.maxTeamSize !== undefined && updates.playerIds.length > config.maxTeamSize) {
                throw new Error(`Team can have at most ${config.maxTeamSize} players`);
            }
            team.playerIds = updates.playerIds;
        }
        
        return team;
    }

    getTeam(teamId: string): Team | undefined {
        return this.teams.find(t => t.id === teamId);
    }

    getTeamByPlayerId(playerId: string): Team | undefined {
        return this.teams.find(t => t.playerIds.includes(playerId));
    }

    startGroupStage() {
        // Dispatch to team or solo start based on tournament type
        if (this.isTeamBased) {
            return this.startTeamGroupStage();
        }
        
        if (this.players.length < 2) {
            throw new Error("Need at least 2 players");
        }
        
        // For 2 players: skip group stage, go directly to finals
        if (this.players.length === 2) {
            this.state = 'playoffs';
            this.startedAt = new Date().toISOString();
            this.createDirectFinals2Players(this.players);
            return;
        }
        
        // For 3 players: single group round-robin, top 2 go to finals
        if (this.players.length === 3) {
            this.state = 'group';
            this.startedAt = new Date().toISOString();
            this.generate3PlayerPod();
            return;
        }
        
        // Auto-add dummy player for awkward tournament sizes
        if (this.players.length === 11) {
            // 11 → 12 (3 groups of 4)
            this.addPlayer("BYE (Dummy Player)");
        } else if (this.players.length === 13) {
            // 13 → 14 (2 groups of 7)
            this.addPlayer("BYE (Dummy Player)");
        }
        
        this.state = 'group';
        this.startedAt = new Date().toISOString();
        this.generatePods();
    }

    private generatePods() {
        const numPlayers = this.players.length;
        
        // Determine group size and count
        let groupSize = 4;
        let numGroups = 1;
        
        if (numPlayers === 4) {
            groupSize = 4;
            numGroups = 1;
        } else if (numPlayers === 5) {
            groupSize = 5;
            numGroups = 1;
        } else if (numPlayers === 6) {
            groupSize = 3;
            numGroups = 2;
        } else if (numPlayers === 7) {
            groupSize = 7;
            numGroups = 1;
        } else if (numPlayers === 8) {
            groupSize = 4;
            numGroups = 2;
        } else if (numPlayers === 9) {
            groupSize = 3;
            numGroups = 3;
        } else if (numPlayers === 10) {
            // 10 players: 2 groups of 5
            groupSize = 5;
            numGroups = 2;
        } else if (numPlayers === 11) {
            // 11 players: awkward, use 3 groups (4, 4, 3)
            groupSize = 4;
            numGroups = 3;
        } else if (numPlayers === 12) {
            // 12 players: 3 groups of 4
            groupSize = 4;
            numGroups = 3;
        } else if (numPlayers === 13) {
            // 13 players: awkward number, make uneven groups
            groupSize = 7;
            numGroups = 2; // Will be 7 and 6
        } else if (numPlayers === 14) {
            // 14 players: 2 groups of 7
            groupSize = 7;
            numGroups = 2;
        } else if (numPlayers === 15) {
            // 15 players: 3 groups of 5
            groupSize = 5;
            numGroups = 3;
        } else if (numPlayers === 16) {
            // 16 players: 4 groups of 4
            groupSize = 4;
            numGroups = 4;
        } else {
            // For larger numbers, try to make groups of 4-5
            groupSize = 4;
            numGroups = Math.ceil(numPlayers / 4);
        }
        
        // Shuffle and divide players into groups
        const shuffled = [...this.players].sort(() => Math.random() - 0.5);
        const groups: Player[][] = [];
        
        for (let g = 0; g < numGroups; g++) {
            groups.push([]);
        }
        
        // Distribute players evenly
        shuffled.forEach((player, index) => {
            groups[index % numGroups].push(player);
        });
        
        // For each group, generate complete round-robin matches
        groups.forEach((groupPlayers, groupIndex) => {
            const podId = uuidv4();
            
            // Store pod with all players in this group
            this.pods.push({
                id: podId,
                round: 1, // All belong to the same logical group
                players: groupPlayers.map(p => p.id),
                matchId: '' // Will be set later
            });
            
            // Generate complete round-robin: every player plays every other player once
            const n = groupPlayers.length;
            
            if (n < 2) return; // Need at least 2 players
            
            // For round-robin, generate all unique pairs
            const allMatches: [Player, Player][] = [];
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    allMatches.push([groupPlayers[i], groupPlayers[j]]);
                }
            }
            
            // Distribute matches across rounds to minimize conflicts
            // Use round-robin scheduling algorithm
            const totalMatches = allMatches.length;
            const matchesPerRound = Math.floor(n / 2);
            const totalRounds = n % 2 === 0 ? n - 1 : n;
            
            const schedule: [Player, Player][][] = [];
            const playersCopy = [...groupPlayers];
            
            for (let round = 0; round < totalRounds; round++) {
                const roundMatches: [Player, Player][] = [];
                
                for (let i = 0; i < matchesPerRound; i++) {
                    const p1 = playersCopy[i];
                    const p2 = playersCopy[n - 1 - i];
                    if (p1 && p2) {
                        roundMatches.push([p1, p2]);
                    }
                }
                
                schedule.push(roundMatches);
                
                // Rotate players for next round (keep first player fixed)
                if (n % 2 === 0) {
                    // For even number of players, rotate all except first
                    const last = playersCopy.pop()!;
                    playersCopy.splice(1, 0, last);
                } else {
                    // For odd number of players, rotate all
                    playersCopy.push(playersCopy.shift()!);
                }
            }
            
            // Create matches for each round
            schedule.forEach((roundMatches, roundIndex) => {
                roundMatches.forEach(([p1, p2]) => {
                    const matchId = uuidv4();
                    this.matches.push({
                        id: matchId,
                        podId,
                        round: roundIndex + 1, // Store the round number
                        player1Id: p1.id,
                        player2Id: p2.id,
                        players: [p1.id, p2.id],
                        completed: false
                    });
                });
            });
        });
    }
    
    // Create direct finals for 2 players (no group stage)
    private createDirectFinals2Players(players: Player[]) {
        const finalId = uuidv4();
        
        // Just the final match: player 1 vs player 2
        this.bracketMatches.push({
            id: finalId,
            round: 1,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
            player1Id: players[0].id,
            player2Id: players[1].id
        });
    }
    
    // Generate group stage for exactly 3 players (round-robin, top 2 to finals)
    private generate3PlayerPod() {
        const podId = uuidv4();
        const players = [...this.players];
        
        // Store pod with all 3 players
        this.pods.push({
            id: podId,
            round: 1,
            players: players.map(p => p.id),
            matchId: ''
        });
        
        // Round-robin for 3 players: 3 matches across 3 rounds
        // Round 1: P1 vs P2
        // Round 2: P1 vs P3  
        // Round 3: P2 vs P3
        const matchups: [number, number, number][] = [
            [0, 1, 1], // P1 vs P2, Round 1
            [0, 2, 2], // P1 vs P3, Round 2
            [1, 2, 3], // P2 vs P3, Round 3
        ];
        
        matchups.forEach(([i, j, round]) => {
            this.matches.push({
                id: uuidv4(),
                podId,
                round,
                player1Id: players[i].id,
                player2Id: players[j].id,
                players: [players[i].id, players[j].id],
                completed: false
            });
        });
    }
    
    // Create playoff bracket for 3-player tournament (top 2 go to finals)
    private create3PlayerFinalsBracket(players: Player[]) {
        const finalId = uuidv4();
        
        // Just the final: 1st vs 2nd from group stage
        this.bracketMatches.push({
            id: finalId,
            round: 1,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
            player1Id: players[0].id,
            player2Id: players[1].id
        });
    }

    submitMatchResult(matchId: string, results: { [playerId: string]: { points: number, score?: number } }, mapName?: string, gameResults?: GameResult[]) {
        const match = this.matches.find(m => m.id === matchId);
        if (!match) throw new Error("Match not found");

        match.result = results;
        match.completed = true;
        
        // Store map name if provided
        if (mapName) {
            match.mapName = mapName;
        }
        
        // Store detailed game results if provided
        if (gameResults) {
            match.gameResults = gameResults;
        }

        // Update player stats
        for (const [playerId, result] of Object.entries(results)) {
            const player = this.players.find(p => p.id === playerId);
            if (player) {
                player.matchesPlayed++;
                player.points += result.points;
                if (result.points >= 3) player.wins++; // 3 = win
                else if (result.points === 1) player.draws++;
                else player.losses++;
                
                // Track game-specific score (kills, rounds, etc.) for tiebreakers
                if (result.score !== undefined) {
                    player.totalGameScore += result.score;
                    
                    // Calculate score differential against opponent
                    const opponentId = match.player1Id === playerId ? match.player2Id : match.player1Id;
                    const opponentResult = results[opponentId];
                    if (opponentResult?.score !== undefined) {
                        player.scoreDifferential += (result.score - opponentResult.score);
                    }
                }
            }
        }
    }

    // Submit BO3 bracket match game result
    submitBracketGameResult(matchId: string, gameResult: BracketGameResult) {
        const match = this.bracketMatches.find(m => m.id === matchId);
        if (!match) throw new Error("Bracket match not found");
        
        if (!match.games) {
            match.games = [];
            match.player1Wins = 0;
            match.player2Wins = 0;
        }
        
        // Don't allow more than 3 games
        if (match.games.length >= 3) {
            throw new Error("BO3 match already has 3 games");
        }
        
        // Add the game result
        match.games.push(gameResult);
        
        // Update win counts
        if (gameResult.winnerId === match.player1Id) {
            match.player1Wins = (match.player1Wins || 0) + 1;
        } else if (gameResult.winnerId === match.player2Id) {
            match.player2Wins = (match.player2Wins || 0) + 1;
        }
        
        // Check if match is won (first to 2)
        if ((match.player1Wins || 0) >= 2) {
            this.submitBracketWinner(matchId, match.player1Id!);
        } else if ((match.player2Wins || 0) >= 2) {
            this.submitBracketWinner(matchId, match.player2Id!);
        }
    }

    getRankings(): Player[] {
        return [...this.players].sort((a, b) => {
            // Primary: Points
            if (b.points !== a.points) return b.points - a.points;
            
            // Tiebreaker 1: Total game score (rounds won for CS, kills for UT, etc.)
            if ((b.totalGameScore || 0) !== (a.totalGameScore || 0)) {
                return (b.totalGameScore || 0) - (a.totalGameScore || 0);
            }
            
            // Tiebreaker 2: Head-to-head result (only for 2-way tie)
            const h2hResult = this.getHeadToHeadResult(a.id, b.id);
            if (h2hResult !== 0) return h2hResult;
            
            // Tiebreaker 3: More wins
            if (b.wins !== a.wins) return b.wins - a.wins;
            
            // Tiebreaker 4: Fewer losses
            if (a.losses !== b.losses) return a.losses - b.losses;
            
            // Tiebreaker 5: Score differential (if tracked)
            if (b.scoreDifferential !== a.scoreDifferential) {
                return b.scoreDifferential - a.scoreDifferential;
            }
            
            // Tiebreaker 6: Alphabetical by name (deterministic fallback)
            return a.name.localeCompare(b.name);
        });
    }

    // Get head-to-head result between two players
    // Returns: positive if player B won, negative if player A won, 0 if no direct match or tie
    private getHeadToHeadResult(playerAId: string, playerBId: string): number {
        const directMatch = this.matches.find(m => 
            m.completed && 
            ((m.player1Id === playerAId && m.player2Id === playerBId) ||
             (m.player1Id === playerBId && m.player2Id === playerAId))
        );
        
        if (!directMatch || !directMatch.result) return 0;
        
        const aPoints = directMatch.result[playerAId]?.points || 0;
        const bPoints = directMatch.result[playerBId]?.points || 0;
        
        // Return positive if B won (B should rank higher), negative if A won
        return bPoints - aPoints;
    }

    // Get which group/pod a player belongs to
    private getPlayerGroup(playerId: string): string | null {
        const pod = this.pods.find(p => p.players.includes(playerId));
        return pod ? pod.id : null;
    }

    // Reorder qualified players to avoid same-group matchups in brackets
    private reorderForCrossGroupMatchups(players: Player[]): Player[] {
        const numGroups = this.pods.length;
        
        // Only reorder for multi-group tournaments
        if (numGroups <= 1) return players;
        
        // Group players by their pod and maintain ranking within groups
        const playersByGroup: Map<string, Player[]> = new Map();
        players.forEach(player => {
            const groupId = this.getPlayerGroup(player.id);
            if (groupId) {
                if (!playersByGroup.has(groupId)) {
                    playersByGroup.set(groupId, []);
                }
                playersByGroup.get(groupId)!.push(player);
            }
        });
        
        const groups = Array.from(playersByGroup.values());
        
        // Handle different scenarios
        if (numGroups === 2) {
            // 2 groups: Interleave to ensure cross-group matchups
            // Result: G1-1st, G2-1st, G1-2nd, G2-2nd, G1-3rd, G2-3rd, G1-4th, G2-4th
            const reordered: Player[] = [];
            const maxGroupSize = Math.max(...groups.map(g => g.length));
            for (let i = 0; i < maxGroupSize; i++) {
                for (const group of groups) {
                    if (i < group.length) {
                        reordered.push(group[i]);
                    }
                }
            }
            return reordered;
        } else if (numGroups === 3 && players.length === 6) {
            // 3 groups, 6 players (top 2 from each)
            // Bracket structure: Seeds 1-2 get byes, Seeds 3-6 play QFs
            // QF1: Seed 3 vs Seed 6 → Winner plays Seed 2 in SF2
            // QF2: Seed 4 vs Seed 5 → Winner plays Seed 1 in SF1
            // 
            // To avoid same-group matchups in semifinals:
            // - Seed 1 and Seed 2 should be from different groups (guaranteed by ranking)
            // - QF1 winner should not be from same group as Seed 2
            // - QF2 winner should not be from same group as Seed 1
            //
            // Strategy: Place 1st from each group in seeds 1-3, then distribute 2nds carefully
            // Seed 1: G1-1st (bye) → will face QF2 winner
            // Seed 2: G2-1st (bye) → will face QF1 winner
            // Seed 3: G3-1st → QF1 vs Seed 6
            // Seed 4: G2-2nd → QF2 vs Seed 5
            // Seed 5: G3-2nd → QF2 vs Seed 4
            // Seed 6: G1-2nd → QF1 vs Seed 3
            //
            // Verification:
            // QF1: G3-1st vs G1-2nd ✓ different
            // QF2: G2-2nd vs G3-2nd ✓ different
            // SF1: G1-1st vs (G2-2nd or G3-2nd) ✓ different from G1
            // SF2: G2-1st vs (G3-1st or G1-2nd) ✓ different from G2
            const reordered: Player[] = [
                groups[0][0], // G1-1st (Seed 1)
                groups[1][0], // G2-1st (Seed 2)
                groups[2][0], // G3-1st (Seed 3)
                groups[1][1], // G2-2nd (Seed 4)
                groups[2][1], // G3-2nd (Seed 5)
                groups[0][1], // G1-2nd (Seed 6)
            ];
            return reordered;
        } else if (numGroups >= 3) {
            // 3+ groups: Distribute to avoid same-group matchups
            // Strategy: Round-robin distribution across groups
            const reordered: Player[] = [];
            const maxGroupSize = Math.max(...groups.map(g => g.length));
            for (let i = 0; i < maxGroupSize; i++) {
                for (const group of groups) {
                    if (i < group.length) {
                        reordered.push(group[i]);
                    }
                }
            }
            return reordered;
        }
        
        return players;
    }

    generateBrackets() {
        const rankings = this.getRankings();
        const numGroups = this.pods.length;
        const totalPlayers = this.players.length;
        
        // For 3-player tournaments: top 2 go to finals
        if (totalPlayers === 3) {
            const qualifiedPlayers = rankings.slice(0, 2);
            this.bracketMatches = [];
            this.create3PlayerFinalsBracket(qualifiedPlayers);
            this.state = 'playoffs';
            return;
        }
        
        // Determine playoff size based on group size and count
        let numQualified: number;
        
        if (numGroups === 1) {
            // Single group: top 4 advance (unless fewer than 6 total players)
            numQualified = Math.min(4, totalPlayers);
        } else if (numGroups === 2) {
            // Two groups: determine based on group size
            const avgGroupSize = totalPlayers / 2;
            if (avgGroupSize >= 5) {
                // Large groups (5-7+ players): top 4 from each group = 8 total
                numQualified = 8;
            } else {
                // Small groups (3-4 players): top 2 from each = 4 total
                numQualified = 4;
            }
        } else if (numGroups === 3) {
            // Three groups: top 2 from each = 6 total
            numQualified = 6;
        } else {
            // Four+ groups: top 2 from each, capped at 8
            numQualified = Math.min(numGroups * 2, 8);
        }
        
        // Ensure we don't exceed available players
        numQualified = Math.min(numQualified, rankings.length);
        
        let qualifiedPlayers = rankings.slice(0, numQualified);
        
        // Reorder to ensure cross-group matchups in first round
        qualifiedPlayers = this.reorderForCrossGroupMatchups(qualifiedPlayers);

        this.bracketMatches = [];
        this.createPlayoffBracket(qualifiedPlayers);
        this.state = 'playoffs';
    }

    private createPlayoffBracket(players: Player[]) {
        const numPlayers = players.length;
        const totalTournamentPlayers = this.players.length;
        
        // Only use direct finals for exactly 4-player tournaments
        // (everyone played everyone in groups, no need for semifinals)
        // For 5+ players, always use semifinals even if single group
        if (totalTournamentPlayers === 4 && numPlayers === 4) {
            this.createDirectFinalsBracket(players);
        } else if (numPlayers === 4) {
            this.create4PlayerSemifinalsBracket(players);
        } else if (numPlayers === 6) {
            this.create6PlayerBracket(players);
        } else if (numPlayers === 8) {
            this.create8PlayerBracket(players);
        } else {
            // Fallback: create semifinals with top 4 players
            this.create4PlayerSemifinalsBracket(players.slice(0, 4));
        }
    }
    
    // For single group tournaments where everyone has played each other
    private createDirectFinalsBracket(players: Player[]) {
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();
        
        // Third place match: 3rd seed vs 4th seed
        this.bracketMatches.push({
            id: thirdPlaceId,
            round: 1,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            player1Id: players[2]?.id,
            player2Id: players[3]?.id
        });
        
        // Final: 1st seed vs 2nd seed
        this.bracketMatches.push({
            id: finalId,
            round: 1,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
            player1Id: players[0].id,
            player2Id: players[1].id
        });
    }
    
    // For multi-group tournaments - standard semifinals bracket
    private create4PlayerSemifinalsBracket(players: Player[]) {
        // 4 players from multiple groups: need semifinals since they haven't all played
        const semi1Id = uuidv4();
        const semi2Id = uuidv4();
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();
        
        // Semifinals: 1v4, 2v3
        this.bracketMatches.push({
            id: semi1Id,
            round: 1,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            player1Id: players[0].id, // 1st seed
            player2Id: players[3].id, // 4th seed
            nextMatchId: finalId,
            nextMatchSlot: 1
        });
        
        this.bracketMatches.push({
            id: semi2Id,
            round: 1,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            player1Id: players[1].id, // 2nd seed
            player2Id: players[2].id, // 3rd seed
            nextMatchId: finalId,
            nextMatchSlot: 2
        });
        
        // Third place match
        this.bracketMatches.push({
            id: thirdPlaceId,
            round: 2,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id
        });
        
        // Final
        this.bracketMatches.push({
            id: finalId,
            round: 2,
            bracketType: 'finals',
            matchLabel: 'Grand Final'
        });
    }
    
    private create6PlayerBracket(players: Player[]) {
        // 6 players: 2 quarterfinals → 2 semifinals → finals + 3rd place
        // Seeds 1 and 2 get automatic advancement to semifinals (no bye matches shown)
        // Seeds 3-6 play in quarterfinals
        
        const quarter1Id = uuidv4();
        const quarter2Id = uuidv4();
        const semi1Id = uuidv4();
        const semi2Id = uuidv4();
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();
        
        // Quarterfinals (2 matches)
        // Match 1: 3rd vs 6th → winner plays 2nd seed
        this.bracketMatches.push({
            id: quarter1Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 1',
            player1Id: players[2].id, // 3rd seed
            player2Id: players[5].id, // 6th seed
            nextMatchId: semi2Id,
            nextMatchSlot: 2
        });
        
        // Match 2: 4th vs 5th → winner plays 1st seed
        this.bracketMatches.push({
            id: quarter2Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 2',
            player1Id: players[3].id, // 4th seed
            player2Id: players[4].id, // 5th seed
            nextMatchId: semi1Id,
            nextMatchSlot: 2
        });
        
        // Semifinals (2 matches)
        // Semi 1: 1st seed (bye) vs winner of QF2
        this.bracketMatches.push({
            id: semi1Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            player1Id: players[0].id, // 1st seed (bye)
            // player2Id filled by QF2 winner
            nextMatchId: finalId,
            nextMatchSlot: 1
        });
        
        // Semi 2: 2nd seed (bye) vs winner of QF1
        this.bracketMatches.push({
            id: semi2Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            player1Id: players[1].id, // 2nd seed (bye)
            // player2Id filled by QF1 winner
            nextMatchId: finalId,
            nextMatchSlot: 2
        });
        
        // Third place match
        this.bracketMatches.push({
            id: thirdPlaceId,
            round: 3,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id
        });
        
        // Final
        this.bracketMatches.push({
            id: finalId,
            round: 3,
            bracketType: 'finals',
            matchLabel: 'Grand Final'
        });
    }
    
    private create8PlayerBracket(players: Player[]) {
        // 8 players: 4 quarterfinals → 2 semifinals → finals + 3rd place
        
        const quarter1Id = uuidv4();
        const quarter2Id = uuidv4();
        const quarter3Id = uuidv4();
        const quarter4Id = uuidv4();
        const semi1Id = uuidv4();
        const semi2Id = uuidv4();
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();
        
        // Quarterfinals (4 matches)
        this.bracketMatches.push({
            id: quarter1Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 1',
            player1Id: players[0].id, // 1st vs 8th
            player2Id: players[7].id,
            nextMatchId: semi1Id,
            nextMatchSlot: 1
        });
        
        this.bracketMatches.push({
            id: quarter2Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 2',
            player1Id: players[3].id, // 4th vs 5th
            player2Id: players[4].id,
            nextMatchId: semi1Id,
            nextMatchSlot: 2
        });
        
        this.bracketMatches.push({
            id: quarter3Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 3',
            player1Id: players[1].id, // 2nd vs 7th
            player2Id: players[6].id,
            nextMatchId: semi2Id,
            nextMatchSlot: 1
        });
        
        this.bracketMatches.push({
            id: quarter4Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 4',
            player1Id: players[2].id, // 3rd vs 6th
            player2Id: players[5].id,
            nextMatchId: semi2Id,
            nextMatchSlot: 2
        });
        
        // Semifinals (2 matches)
        this.bracketMatches.push({
            id: semi1Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            nextMatchId: finalId,
            nextMatchSlot: 1
        });
        
        this.bracketMatches.push({
            id: semi2Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            nextMatchId: finalId,
            nextMatchSlot: 2
        });
        
        // Third place match
        this.bracketMatches.push({
            id: thirdPlaceId,
            round: 3,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id
        });
        
        // Final
        this.bracketMatches.push({
            id: finalId,
            round: 3,
            bracketType: 'finals',
            matchLabel: 'Grand Final'
        });
    }

    submitBracketWinner(matchId: string, winnerId: string) {
        const match = this.bracketMatches.find(m => m.id === matchId);
        if (!match) throw new Error("Match not found");

        if (match.player1Id !== winnerId && match.player2Id !== winnerId) {
            throw new Error("Winner must be one of the players in the match");
        }

        match.winnerId = winnerId;
        const loserId = match.player1Id === winnerId ? match.player2Id : match.player1Id;

        // Advance winner to next match
        if (match.nextMatchId) {
            const nextMatch = this.bracketMatches.find(m => m.id === match.nextMatchId);
            if (nextMatch) {
                if (match.nextMatchSlot === 1) {
                    nextMatch.player1Id = winnerId;
                } else {
                    nextMatch.player2Id = winnerId;
                }
            }
        }

        // If this is a semifinal, send loser to third place match
        if (match.bracketType === 'semifinals') {
            const thirdPlaceMatch = this.bracketMatches.find(m => m.bracketType === '3rd-place');
            if (thirdPlaceMatch && loserId) {
                // Add loser to third place match
                if (!thirdPlaceMatch.player1Id) {
                    thirdPlaceMatch.player1Id = loserId;
                } else if (!thirdPlaceMatch.player2Id) {
                    thirdPlaceMatch.player2Id = loserId;
                }
            }
        }

        // Check if all bracket matches are completed
        const allBracketMatchesCompleted = this.bracketMatches.every(m => m.winnerId);
        if (allBracketMatchesCompleted) {
            this.state = 'completed';
        }
    }

    // Update tournament name
    updateTournamentName(name: string) {
        if (!name?.trim()) {
            throw new Error("Tournament name cannot be empty");
        }
        this.name = name.trim();
    }

    // Update group name
    updateGroupName(podId: string, name: string) {
        const pod = this.pods.find(p => p.id === podId);
        if (!pod) throw new Error("Group not found");

        pod.name = name.trim() || undefined;
    }

    // Reset group data (clear all match results for players in this group)
    resetGroupData(podId: string) {
        // Check if it's a team tournament
        if (this.isTeamBased) {
            const teamPod = this.teamPods.find(p => p.id === podId);
            if (!teamPod) throw new Error("Team group not found");

            // Reset team stats for teams in this group
            teamPod.teams.forEach(teamId => {
                const team = this.teams.find(t => t.id === teamId);
                if (team) {
                    team.points = 0;
                    team.matchesPlayed = 0;
                    team.wins = 0;
                    team.draws = 0;
                    team.losses = 0;
                    team.roundsWon = 0;
                    team.roundsLost = 0;
                }
            });

            // Reset all team matches for this group
            this.teamMatches.forEach(match => {
                if (match.podId === podId) {
                    match.team1Score = undefined;
                    match.team2Score = undefined;
                    match.winnerId = undefined;
                    match.games = undefined;
                    match.completed = false;
                }
            });
            return;
        }

        // Solo tournament
        const pod = this.pods.find(p => p.id === podId);
        if (!pod) throw new Error("Group not found");

        // Reset player stats for players in this group
        pod.players.forEach(playerId => {
            const player = this.players.find(p => p.id === playerId);
            if (player) {
                player.points = 0;
                player.matchesPlayed = 0;
                player.wins = 0;
                player.draws = 0;
                player.losses = 0;
                player.scoreDifferential = 0;
                player.totalGameScore = 0;
            }
        });

        // Reset all matches for this group
        this.matches.forEach(match => {
            if (match.podId === podId) {
                match.result = undefined;
                match.completed = false;
                match.mapName = undefined;
            }
        });
    }

    // Update player name
    updatePlayerName(playerId: string, name: string) {
        if (!name || !name.trim()) throw new Error('Name cannot be empty');
        const p = this.players.find(pl => pl.id === playerId);
        if (!p) throw new Error('Player not found');
        p.name = name.trim();
    }

    // Update player photo
    updatePlayerPhoto(playerId: string, photo: string) {
        const p = this.players.find(pl => pl.id === playerId);
        if (!p) throw new Error('Player not found');
        p.profilePhoto = photo;
    }

    // Get the tournament champion (winner of finals)
    getChampion(): Player | null {
        if (this.state !== 'completed') return null;
        const finals = this.bracketMatches.find(m => m.bracketType === 'finals');
        if (!finals?.winnerId) return null;
        return this.players.find(p => p.id === finals.winnerId) || null;
    }

    // ========================================
    // TEAM TOURNAMENT METHODS
    // ========================================

    // Get the winning team (winner of finals)
    getChampionTeam(): Team | null {
        if (!this.isTeamBased) return null;
        if (this.state !== 'completed') return null;
        const finals = this.teamBracketMatches.find(m => m.bracketType === 'finals');
        if (!finals?.winnerId) return null;
        return this.teams.find(t => t.id === finals.winnerId) || null;
    }

    // Start team group stage
    startTeamGroupStage() {
        if (!this.isTeamBased) {
            throw new Error("Cannot start team group stage for solo tournament");
        }
        if (this.teams.length < 2) {
            throw new Error("Need at least 2 teams");
        }
        
        // For 2 teams: skip group stage, go directly to finals
        if (this.teams.length === 2) {
            this.state = 'playoffs';
            this.startedAt = new Date().toISOString();
            this.createDirectTeamFinals2Teams(this.teams);
            return;
        }
        
        // For 3 teams: single group round-robin, top 2 go to finals
        if (this.teams.length === 3) {
            this.state = 'group';
            this.startedAt = new Date().toISOString();
            this.generate3TeamPod();
            return;
        }
        
        this.state = 'group';
        this.startedAt = new Date().toISOString();
        this.generateTeamPods();
    }

    // Generate team pods for group stage
    private generateTeamPods() {
        const numTeams = this.teams.length;
        
        // Determine group size and count (same logic as solo)
        let groupSize = 4;
        let numGroups = 1;
        
        if (numTeams === 4) {
            groupSize = 4;
            numGroups = 1;
        } else if (numTeams === 5) {
            groupSize = 5;
            numGroups = 1;
        } else if (numTeams === 6) {
            groupSize = 6;
            numGroups = 1;
        } else if (numTeams === 7) {
            groupSize = 7;
            numGroups = 1;
        } else if (numTeams === 8) {
            groupSize = 4;
            numGroups = 2;
        } else if (numTeams >= 9 && numTeams <= 12) {
            groupSize = Math.ceil(numTeams / 3);
            numGroups = 3;
        } else {
            groupSize = Math.ceil(numTeams / 4);
            numGroups = 4;
        }

        const shuffledTeams = [...this.teams].sort(() => Math.random() - 0.5);
        
        // Distribute teams into groups
        const groups: string[][] = Array.from({ length: numGroups }, () => []);
        shuffledTeams.forEach((team, i) => {
            groups[i % numGroups].push(team.id);
        });

        // Create team pods and round-robin matches
        groups.forEach((groupTeams, groupIndex) => {
            const podId = uuidv4();
            const pod: TeamPod = {
                id: podId,
                round: 1,
                teams: groupTeams,
                matchId: '',
                name: `Group ${String.fromCharCode(65 + groupIndex)}`
            };
            this.teamPods.push(pod);

            // Generate proper round-robin schedule for this group
            const n = groupTeams.length;
            if (n < 2) return;

            // Use round-robin scheduling algorithm (same as 1v1 tournaments)
            const matchesPerRound = Math.floor(n / 2);
            const totalRounds = n % 2 === 0 ? n - 1 : n;
            
            const teamsCopy = [...groupTeams];
            
            for (let round = 0; round < totalRounds; round++) {
                for (let i = 0; i < matchesPerRound; i++) {
                    const t1 = teamsCopy[i];
                    const t2 = teamsCopy[n - 1 - i];
                    if (t1 && t2) {
                        const match: TeamMatch = {
                            id: uuidv4(),
                            matchNumber: this.teamMatches.length + 1,
                            round: round + 1, // Proper round number
                            podId: podId,
                            team1Id: t1,
                            team2Id: t2,
                            completed: false
                        };
                        this.teamMatches.push(match);
                        if (!pod.matchId) pod.matchId = match.id;
                    }
                }
                
                // Rotate teams for next round (keep first team fixed for even, rotate all for odd)
                if (n % 2 === 0) {
                    const last = teamsCopy.pop()!;
                    teamsCopy.splice(1, 0, last);
                } else {
                    teamsCopy.push(teamsCopy.shift()!);
                }
            }
        });
    }
    
    // Create direct finals for 2 teams (no group stage)
    private createDirectTeamFinals2Teams(teams: Team[]) {
        const finalId = uuidv4();
        
        // Just the final match: team 1 vs team 2
        this.teamBracketMatches.push({
            id: finalId,
            round: 1,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
            team1Id: teams[0].id,
            team2Id: teams[1].id
        });
    }
    
    // Generate group stage for exactly 3 teams (round-robin, top 2 to finals)
    private generate3TeamPod() {
        const podId = uuidv4();
        const teams = [...this.teams];
        
        // Store pod with all 3 teams
        const pod: TeamPod = {
            id: podId,
            round: 1,
            teams: teams.map(t => t.id),
            matchId: '',
            name: 'Group A'
        };
        this.teamPods.push(pod);
        
        // Round-robin for 3 teams: 3 matches across 3 rounds
        // Round 1: T1 vs T2
        // Round 2: T1 vs T3  
        // Round 3: T2 vs T3
        const matchups: [number, number, number][] = [
            [0, 1, 1], // T1 vs T2, Round 1
            [0, 2, 2], // T1 vs T3, Round 2
            [1, 2, 3], // T2 vs T3, Round 3
        ];
        
        matchups.forEach(([i, j, round], idx) => {
            const match: TeamMatch = {
                id: uuidv4(),
                matchNumber: idx + 1,
                round,
                podId,
                team1Id: teams[i].id,
                team2Id: teams[j].id,
                completed: false
            };
            this.teamMatches.push(match);
            if (!pod.matchId) pod.matchId = match.id;
        });
    }
    
    // Create playoff bracket for 3-team tournament (top 2 go to finals)
    private create3TeamFinalsBracket(teams: Team[]) {
        const finalId = uuidv4();
        
        // Just the final: 1st vs 2nd from group stage
        this.teamBracketMatches.push({
            id: finalId,
            round: 1,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
            team1Id: teams[0].id,
            team2Id: teams[1].id
        });
    }

    // Submit a team match result (group stage)
    submitTeamMatchResult(matchId: string, team1Score: number, team2Score: number, games?: TeamGameResult[]) {
        const match = this.teamMatches.find(m => m.id === matchId);
        if (!match) throw new Error("Team match not found");

        match.team1Score = team1Score;
        match.team2Score = team2Score;
        match.games = games;
        match.completed = true;

        // Determine winner
        if (team1Score > team2Score) {
            match.winnerId = match.team1Id;
        } else if (team2Score > team1Score) {
            match.winnerId = match.team2Id;
        }
        // Note: For team games, draws are rare but possible

        // Update team stats
        this.recalculateTeamStats();
    }

    // Recalculate all team stats from completed matches
    recalculateTeamStats() {
        // Reset all team stats
        this.teams.forEach(team => {
            team.points = 0;
            team.matchesPlayed = 0;
            team.wins = 0;
            team.draws = 0;
            team.losses = 0;
            team.roundsWon = 0;
            team.roundsLost = 0;
        });

        // Calculate from completed team matches
        this.teamMatches.filter(m => m.completed).forEach(match => {
            const team1 = this.teams.find(t => t.id === match.team1Id);
            const team2 = this.teams.find(t => t.id === match.team2Id);
            
            if (!team1 || !team2) return;

            team1.matchesPlayed++;
            team2.matchesPlayed++;
            team1.roundsWon += match.team1Score || 0;
            team1.roundsLost += match.team2Score || 0;
            team2.roundsWon += match.team2Score || 0;
            team2.roundsLost += match.team1Score || 0;

            if (match.winnerId === team1.id) {
                team1.wins++;
                team1.points += 3;
                team2.losses++;
            } else if (match.winnerId === team2.id) {
                team2.wins++;
                team2.points += 3;
                team1.losses++;
            } else {
                // Draw
                team1.draws++;
                team2.draws++;
                team1.points += 1;
                team2.points += 1;
            }
        });
    }

    // Submit a single game result for a team bracket match (BO3/BO5)
    submitTeamBracketGameResult(matchId: string, gameResult: TeamGameResult) {
        const match = this.teamBracketMatches.find(m => m.id === matchId);
        if (!match) throw new Error("Team bracket match not found");

        if (!match.games) {
            match.games = [];
            match.team1Wins = 0;
            match.team2Wins = 0;
        }

        // Don't allow more than 5 games (BO5 max)
        if (match.games.length >= 5) {
            throw new Error("BO5 match already has 5 games");
        }

        match.games.push(gameResult);

        // Update win counts
        if (gameResult.winnerTeamId === match.team1Id) {
            match.team1Wins = (match.team1Wins || 0) + 1;
        } else if (gameResult.winnerTeamId === match.team2Id) {
            match.team2Wins = (match.team2Wins || 0) + 1;
        }

        // Check if match is won (BO3: first to 2, BO5: first to 3)
        const winsNeeded = match.games.length > 3 ? 3 : 2; // Detect BO5 vs BO3
        if ((match.team1Wins || 0) >= winsNeeded) {
            this.submitTeamBracketWinner(matchId, match.team1Id!);
        } else if ((match.team2Wins || 0) >= winsNeeded) {
            this.submitTeamBracketWinner(matchId, match.team2Id!);
        }
    }

    // Submit the winner of a team bracket match
    submitTeamBracketWinner(matchId: string, winnerTeamId: string) {
        const match = this.teamBracketMatches.find(m => m.id === matchId);
        if (!match) throw new Error("Team bracket match not found");

        if (match.team1Id !== winnerTeamId && match.team2Id !== winnerTeamId) {
            throw new Error("Winner must be one of the teams in the match");
        }

        match.winnerId = winnerTeamId;
        const loserId = match.team1Id === winnerTeamId ? match.team2Id : match.team1Id;

        // Advance winner to next match
        if (match.nextMatchId) {
            const nextMatch = this.teamBracketMatches.find(m => m.id === match.nextMatchId);
            if (nextMatch) {
                if (match.nextMatchSlot === 1) {
                    nextMatch.team1Id = winnerTeamId;
                } else {
                    nextMatch.team2Id = winnerTeamId;
                }
            }
        }

        // If this is a semifinal, send loser to third place match
        if (match.bracketType === 'semifinals') {
            const thirdPlaceMatch = this.teamBracketMatches.find(m => m.bracketType === '3rd-place');
            if (thirdPlaceMatch && loserId) {
                if (!thirdPlaceMatch.team1Id) {
                    thirdPlaceMatch.team1Id = loserId;
                } else if (!thirdPlaceMatch.team2Id) {
                    thirdPlaceMatch.team2Id = loserId;
                }
            }
        }

        // Check if all bracket matches are completed
        const allCompleted = this.teamBracketMatches.every(m => m.winnerId);
        if (allCompleted) {
            this.state = 'completed';
        }
    }

    // Generate team brackets (playoffs)
    generateTeamBrackets() {
        if (!this.isTeamBased) {
            throw new Error("Cannot generate team brackets for solo tournament");
        }

        const rankings = this.getTeamRankings();
        const numTeams = this.teams.length;
        
        // For 3-team tournaments: top 2 go to finals
        if (numTeams === 3) {
            const qualifiedTeams = rankings.slice(0, 2);
            this.teamBracketMatches = [];
            this.create3TeamFinalsBracket(qualifiedTeams);
            this.state = 'playoffs';
            return;
        }

        // Determine playoff size
        let numQualified = Math.min(4, rankings.length);
        if (rankings.length >= 8) numQualified = 8;
        else if (rankings.length >= 6) numQualified = 6;

        const qualifiedTeams = rankings.slice(0, numQualified);
        this.teamBracketMatches = [];
        this.createTeamPlayoffBracket(qualifiedTeams);
        this.state = 'playoffs';
    }

    // Create team playoff bracket
    private createTeamPlayoffBracket(teams: Team[]) {
        const numTeams = teams.length;
        const totalTournamentTeams = this.teams.length;

        // Only use direct finals for exactly 4-team tournaments in a single group
        // (everyone played everyone in groups, no need for semifinals)
        if (totalTournamentTeams === 4 && numTeams === 4 && this.teamPods.length === 1) {
            this.createDirectTeamFinalsBracket(teams);
        } else if (numTeams === 4) {
            this.create4TeamBracket(teams);
        } else if (numTeams === 6) {
            this.create6TeamBracket(teams);
        } else if (numTeams === 8) {
            this.create8TeamBracket(teams);
        } else {
            // Fallback to top 4
            this.create4TeamBracket(teams.slice(0, 4));
        }
    }

    // For single group team tournaments where everyone has played each other
    private createDirectTeamFinalsBracket(teams: Team[]) {
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();
        
        // Third place match: 3rd seed vs 4th seed
        this.teamBracketMatches.push({
            id: thirdPlaceId,
            round: 1,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            team1Id: teams[2]?.id,
            team2Id: teams[3]?.id
        });
        
        // Final: 1st seed vs 2nd seed
        this.teamBracketMatches.push({
            id: finalId,
            round: 1,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
            team1Id: teams[0].id,
            team2Id: teams[1].id
        });
    }

    private create4TeamBracket(teams: Team[]) {
        const semi1Id = uuidv4();
        const semi2Id = uuidv4();
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();

        // Semifinals: 1v4, 2v3
        this.teamBracketMatches.push({
            id: semi1Id,
            round: 1,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            team1Id: teams[0].id,
            team2Id: teams[3].id,
            nextMatchId: finalId,
            nextMatchSlot: 1
        });

        this.teamBracketMatches.push({
            id: semi2Id,
            round: 1,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            team1Id: teams[1].id,
            team2Id: teams[2].id,
            nextMatchId: finalId,
            nextMatchSlot: 2
        });

        // Third place match
        this.teamBracketMatches.push({
            id: thirdPlaceId,
            round: 2,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id
        });

        // Final
        this.teamBracketMatches.push({
            id: finalId,
            round: 2,
            bracketType: 'finals',
            matchLabel: 'Grand Final'
        });
    }

    private create6TeamBracket(teams: Team[]) {
        const qf1Id = uuidv4();
        const qf2Id = uuidv4();
        const semi1Id = uuidv4();
        const semi2Id = uuidv4();
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();

        // Quarter-finals (seeds 3-6 play)
        this.teamBracketMatches.push({
            id: qf1Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 1',
            team1Id: teams[2].id, // 3rd seed
            team2Id: teams[5].id, // 6th seed
            nextMatchId: semi2Id,
            nextMatchSlot: 2
        });

        this.teamBracketMatches.push({
            id: qf2Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 2',
            team1Id: teams[3].id, // 4th seed
            team2Id: teams[4].id, // 5th seed
            nextMatchId: semi1Id,
            nextMatchSlot: 2
        });

        // Semifinals (seeds 1-2 have byes)
        this.teamBracketMatches.push({
            id: semi1Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            team1Id: teams[0].id, // 1st seed (bye)
            nextMatchId: finalId,
            nextMatchSlot: 1
        });

        this.teamBracketMatches.push({
            id: semi2Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            team1Id: teams[1].id, // 2nd seed (bye)
            nextMatchId: finalId,
            nextMatchSlot: 2
        });

        // Third place
        this.teamBracketMatches.push({
            id: thirdPlaceId,
            round: 3,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id
        });

        // Final
        this.teamBracketMatches.push({
            id: finalId,
            round: 3,
            bracketType: 'finals',
            matchLabel: 'Grand Final'
        });
    }

    private create8TeamBracket(teams: Team[]) {
        const qf1Id = uuidv4();
        const qf2Id = uuidv4();
        const qf3Id = uuidv4();
        const qf4Id = uuidv4();
        const semi1Id = uuidv4();
        const semi2Id = uuidv4();
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();

        // Quarter-finals: 1v8, 4v5, 2v7, 3v6
        this.teamBracketMatches.push({
            id: qf1Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 1',
            team1Id: teams[0].id,
            team2Id: teams[7].id,
            nextMatchId: semi1Id,
            nextMatchSlot: 1
        });

        this.teamBracketMatches.push({
            id: qf2Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 2',
            team1Id: teams[3].id,
            team2Id: teams[4].id,
            nextMatchId: semi1Id,
            nextMatchSlot: 2
        });

        this.teamBracketMatches.push({
            id: qf3Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 3',
            team1Id: teams[1].id,
            team2Id: teams[6].id,
            nextMatchId: semi2Id,
            nextMatchSlot: 1
        });

        this.teamBracketMatches.push({
            id: qf4Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 4',
            team1Id: teams[2].id,
            team2Id: teams[5].id,
            nextMatchId: semi2Id,
            nextMatchSlot: 2
        });

        // Semifinals
        this.teamBracketMatches.push({
            id: semi1Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            nextMatchId: finalId,
            nextMatchSlot: 1
        });

        this.teamBracketMatches.push({
            id: semi2Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            nextMatchId: finalId,
            nextMatchSlot: 2
        });

        // Third place
        this.teamBracketMatches.push({
            id: thirdPlaceId,
            round: 3,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id
        });

        // Final
        this.teamBracketMatches.push({
            id: finalId,
            round: 3,
            bracketType: 'finals',
            matchLabel: 'Grand Final'
        });
    }

    // Get team rankings based on group stage performance
    getTeamRankings(): Team[] {
        // Build stats from team matches
        const teamStats: Map<string, { points: number; wins: number; roundsWon: number; roundsDiff: number }> = new Map();
        
        this.teams.forEach(team => {
            teamStats.set(team.id, { points: 0, wins: 0, roundsWon: 0, roundsDiff: 0 });
        });

        this.teamMatches.filter(m => m.completed).forEach(match => {
            const stats1 = teamStats.get(match.team1Id)!;
            const stats2 = teamStats.get(match.team2Id)!;

            const score1 = match.team1Score || 0;
            const score2 = match.team2Score || 0;

            stats1.roundsWon += score1;
            stats1.roundsDiff += score1 - score2;
            stats2.roundsWon += score2;
            stats2.roundsDiff += score2 - score1;

            if (match.winnerId === match.team1Id) {
                stats1.points += 3;
                stats1.wins += 1;
            } else if (match.winnerId === match.team2Id) {
                stats2.points += 3;
                stats2.wins += 1;
            } else {
                // Draw
                stats1.points += 1;
                stats2.points += 1;
            }
        });

        return [...this.teams].sort((a, b) => {
            const statsA = teamStats.get(a.id)!;
            const statsB = teamStats.get(b.id)!;

            // Primary: Points
            if (statsB.points !== statsA.points) return statsB.points - statsA.points;
            // Tiebreaker 1: Round differential
            if (statsB.roundsDiff !== statsA.roundsDiff) return statsB.roundsDiff - statsA.roundsDiff;
            // Tiebreaker 2: Rounds won
            if (statsB.roundsWon !== statsA.roundsWon) return statsB.roundsWon - statsA.roundsWon;
            // Tiebreaker 3: More wins
            if (statsB.wins !== statsA.wins) return statsB.wins - statsA.wins;
            // Final: Alphabetical
            return a.name.localeCompare(b.name);
        });
    }

    // Get player stats aggregated from all team matches
    getPlayerStatistics(): Map<string, { kills: number; deaths: number; kdRatio: number; gamesPlayed: number }> {
        const playerStats: Map<string, { kills: number; deaths: number; gamesPlayed: number }> = new Map();

        // Initialize stats for all players
        this.players.forEach(p => {
            playerStats.set(p.id, { kills: 0, deaths: 0, gamesPlayed: 0 });
        });

        // Aggregate from group stage team matches
        this.teamMatches.filter(m => m.completed && m.games).forEach(match => {
            match.games!.forEach(game => {
                game.playerStats?.forEach((ps: PlayerGameStats) => {
                    const stats = playerStats.get(ps.playerId);
                    if (stats) {
                        stats.kills += ps.kills;
                        stats.deaths += ps.deaths;
                        stats.gamesPlayed += 1;
                    }
                });
            });
        });

        // Aggregate from bracket matches
        this.teamBracketMatches.filter(m => m.games).forEach(match => {
            match.games!.forEach(game => {
                game.playerStats?.forEach((ps: PlayerGameStats) => {
                    const stats = playerStats.get(ps.playerId);
                    if (stats) {
                        stats.kills += ps.kills;
                        stats.deaths += ps.deaths;
                        stats.gamesPlayed += 1;
                    }
                });
            });
        });

        // Calculate K/D ratios
        const result: Map<string, { kills: number; deaths: number; kdRatio: number; gamesPlayed: number }> = new Map();
        playerStats.forEach((stats, playerId) => {
            result.set(playerId, {
                ...stats,
                kdRatio: stats.deaths > 0 ? stats.kills / stats.deaths : stats.kills
            });
        });

        return result;
    }

}
