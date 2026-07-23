import { v4 as uuidv4 } from 'uuid';
import { type GameType, getGameConfig, supportsTeamMode } from '../shared/gameTypes.js';
import type { Player, Team, PlayerGameStats, TeamGameResult, GameResult, Match, Pod, BracketGameResult, BracketMatch, TeamBracketMatch, TeamMatch, TeamPod } from '../shared/types.js';
import { build3PlayerFinalsBracket, buildPlayoffBracket, reorderForCrossGroupMatchups, build3TeamFinalsBracket, buildTeamPlayoffBracket } from './brackets.js';

// Schema version for data migrations
const SCHEMA_VERSION = 2;

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

    // Fisher-Yates shuffle. Unbiased, unlike `sort(() => Math.random() - 0.5)`,
    // whose comparator is inconsistent and skews the distribution.
    private shuffle<T>(arr: T[]): T[] {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
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
        if (this.state !== 'registration') {
            throw new Error("Group stage has already started");
        }
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
        const shuffled = this.shuffle(this.players);
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

        // Rebuild aggregates from every completed match so that re-submitting or
        // editing a match is idempotent instead of double-counting (mirrors the
        // team path's recalculateTeamStats).
        this.recalculatePlayerStats();
    }

    // Recompute every player's group-stage aggregates from the completed matches.
    // These fields are owned solely by the group stage (bracket play never
    // touches them), so a full rebuild is safe, deterministic, and idempotent.
    private recalculatePlayerStats() {
        for (const player of this.players) {
            player.points = 0;
            player.matchesPlayed = 0;
            player.wins = 0;
            player.draws = 0;
            player.losses = 0;
            player.totalGameScore = 0;
            player.scoreDifferential = 0;
        }

        for (const match of this.matches) {
            if (!match.completed || !match.result) continue;
            for (const [playerId, result] of Object.entries(match.result)) {
                const player = this.players.find(p => p.id === playerId);
                if (!player) continue;
                player.matchesPlayed++;
                player.points += result.points;
                if (result.points >= 3) player.wins++; // 3 = win
                else if (result.points === 1) player.draws++;
                else player.losses++;

                // Track game-specific score (kills, rounds, etc.) for tiebreakers
                if (result.score !== undefined) {
                    player.totalGameScore += result.score;
                    const opponentId = match.player1Id === playerId ? match.player2Id : match.player1Id;
                    const opponentResult = match.result[opponentId];
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

    generateBrackets() {
        if (this.state !== 'group') {
            throw new Error("Brackets can only be generated from the group stage");
        }
        const rankings = this.getRankings();
        const numGroups = this.pods.length;
        const totalPlayers = this.players.length;
        
        // For 3-player tournaments: top 2 go to finals
        if (totalPlayers === 3) {
            this.bracketMatches = build3PlayerFinalsBracket(rankings.slice(0, 2));
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
        
        // Qualify the top-K from EACH group (K = the per-group count the sizing
        // above intends) rather than a global top-N. A global slice could let a
        // strong group's lower seed displace a weak group's higher seed and, worse,
        // hand the bracket seeder a lop-sided qualifier set (e.g. 3 from one group,
        // 1 from another) that dereferences an undefined seed and throws.
        const perGroup = Math.max(1, Math.round(numQualified / numGroups));
        const qualifiedIds = new Set<string>();
        for (const pod of this.pods) {
            const podRanked = rankings.filter(p => pod.players.includes(p.id));
            for (const p of podRanked.slice(0, perGroup)) qualifiedIds.add(p.id);
        }
        let qualifiedPlayers = rankings.filter(p => qualifiedIds.has(p.id));
        
        // Reorder to ensure cross-group matchups in first round
        qualifiedPlayers = reorderForCrossGroupMatchups(qualifiedPlayers, numGroups, (playerId) => this.getPlayerGroup(playerId));

        this.bracketMatches = buildPlayoffBracket(qualifiedPlayers, totalPlayers);
        this.state = 'playoffs';
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
        if (this.state !== 'registration') {
            throw new Error("Group stage has already started");
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

        const shuffledTeams = this.shuffle(this.teams);
        
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
        if (this.state !== 'group') {
            throw new Error("Brackets can only be generated from the group stage");
        }

        const rankings = this.getTeamRankings();
        const numTeams = this.teams.length;
        
        // For 3-team tournaments: top 2 go to finals
        if (numTeams === 3) {
            this.teamBracketMatches = build3TeamFinalsBracket(rankings.slice(0, 2));
            this.state = 'playoffs';
            return;
        }

        // Determine playoff size
        let numQualified = Math.min(4, rankings.length);
        if (rankings.length >= 8) numQualified = 8;
        else if (rankings.length >= 6) numQualified = 6;

        // Top-K from EACH group, not a global top-N (mirrors generateBrackets).
        const perGroup = Math.max(1, Math.round(numQualified / this.teamPods.length));
        const qualifiedTeamIds = new Set<string>();
        for (const pod of this.teamPods) {
            const podRanked = rankings.filter(t => pod.teams.includes(t.id));
            for (const t of podRanked.slice(0, perGroup)) qualifiedTeamIds.add(t.id);
        }
        const qualifiedTeams = rankings.filter(t => qualifiedTeamIds.has(t.id));
        this.teamBracketMatches = buildTeamPlayoffBracket(qualifiedTeams, this.teams.length, this.teamPods.length);
        this.state = 'playoffs';
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
