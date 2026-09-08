import { v4 as uuidv4 } from 'uuid';
import { type GameType, getGameConfig, getEffectiveArchetype } from '../shared/gameTypes.js';
import { validateMatchResult, validateTeamMatchResult } from '../shared/validation.js';
import { generateJoinCode, generateAdminKey, hashAdminKey, verifyAdminKey } from '../shared/access.js';
import type { Player, Team, PlayerGameStats, TeamGameResult, GameResult, Match, Pod, BracketGameResult, BracketMatch, TeamBracketMatch, TeamMatch, TeamPod } from '../shared/types.js';
import { build3PlayerFinalsBracket, buildPlayoffBracket, reorderForCrossGroupMatchups, build3TeamFinalsBracket, buildTeamPlayoffBracket } from './brackets.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB decoded

// Accept a bundled-asset path (e.g. /players/Cat.jpg) or a bounded data:image
// URL. Rejects oversized or non-image blobs so a client cannot inflate a stored
// record — every save serializes the whole tournament into one Redis value.
function validateImage(value: string | undefined, field: string): void {
    if (!value) return; // undefined/empty clears the image
    if (value.startsWith('/')) {
        if (value.length > 512) throw new Error(`Invalid ${field} path`);
        return;
    }
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(value)) {
        throw new Error(`${field} must be a PNG, JPEG, WebP, or GIF data URL`);
    }
    if (value.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 64) {
        throw new Error(`${field} exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit`);
    }
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

    // Per-tournament access. The join code is a short read-only credential meant
    // to be shared; the admin key is a 128-bit write credential stored only as a
    // hash and shown to its creator exactly once.
    joinCode: string = '';
    adminKeyHash: string = '';
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
    
    /**
     * Give this tournament a fresh join code and admin key, returning the
     * plaintext admin key ONCE. The key itself is never stored.
     *
     * `joinCode` may be supplied by the caller, which owns collision checking
     * against the other tournaments it knows about.
     */
    async issueAccess(joinCode?: string): Promise<string> {
        this.joinCode = joinCode ?? generateJoinCode();
        const adminKey = generateAdminKey();
        this.adminKeyHash = await hashAdminKey(adminKey);
        return adminKey;
    }

    /** Does this key grant write access to this tournament? */
    async isAdminKey(key: string): Promise<boolean> {
        return verifyAdminKey(key, this.adminKeyHash);
    }

    // Get game configuration
    getGameConfig() {
        return getGameConfig(this.gameType);
    }

    // Scoring archetype in force for this tournament (a custom-points override wins).
    getArchetype() {
        return getEffectiveArchetype(this.gameType, this.useCustomPoints);
    }

    // Back-fill a map name onto completed matches recorded before maps were
    // tracked, so old tournaments still render a map instead of a blank.
    //
    // The choice is DERIVED FROM THE MATCH ID, not random: this runs on every
    // boot and its result used not to be saved, so a random pick meant the match
    // history and the per-map statistics changed every time the server restarted.
    // Returns true when something was filled, so the caller can persist it.
    fillMissingMaps(): boolean {
        const config = this.getGameConfig();
        const availableMaps = this.mapPool.length > 0 ? this.mapPool : config.maps;
        if (availableMaps.length === 0) return false;
        let changed = false;

        // Stable, dependency-free string hash (FNV-1a) -> index into the map pool.
        const mapFor = (seed: string): string => {
            let h = 0x811c9dc5;
            for (let i = 0; i < seed.length; i++) {
                h ^= seed.charCodeAt(i);
                h = Math.imul(h, 0x01000193) >>> 0;
            }
            return availableMaps[h % availableMaps.length];
        };

        for (const match of this.matches) {
            if (!match.mapName && match.completed) {
                match.mapName = mapFor(match.id);
                changed = true;
            }
        }

        for (const match of this.bracketMatches) {
            for (const game of match.games ?? []) {
                if (!game.mapName) {
                    game.mapName = mapFor(`${match.id}:${game.gameNumber}`);
                    changed = true;
                }
            }
        }

        return changed;
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
        if (this.state !== 'registration') {
            throw new Error("Cannot add players after the group stage has started");
        }
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
        // Drop the id from any roster too, or the team keeps a dangling member
        // and its size check stops reflecting reality.
        for (const team of this.teams) {
            team.playerIds = team.playerIds.filter(id => id !== playerId);
        }
    }

    // Team management methods
    addTeam(name: string, playerIds: string[], logo?: string): Team {
        if (!this.isTeamBased) {
            throw new Error("Cannot add teams to a solo tournament");
        }
        
        // Check for duplicate team name
        validateImage(logo, 'logo');
        const normalizedName = name.trim().toLowerCase();
        if (this.teams.some(t => t.name.trim().toLowerCase() === normalizedName)) {
            throw new Error(`Team name "${name}" already exists`);
        }
        
        // Validate all players exist, and that nobody is already rostered
        // elsewhere -- a player on two teams corrupts every per-player stat.
        for (const playerId of playerIds) {
            const player = this.players.find(p => p.id === playerId);
            if (!player) {
                throw new Error(`Player ${playerId} not found`);
            }
            const other = this.teams.find(t => t.playerIds.includes(playerId));
            if (other) {
                throw new Error(`${player.name} is already on team "${other.name}"`);
            }
        }
        if (new Set(playerIds).size !== playerIds.length) {
            throw new Error('A player cannot be listed twice on the same team');
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
        if (updates.logo !== undefined) { validateImage(updates.logo, 'logo'); team.logo = updates.logo; }
        if (updates.playerIds) {
            // Validate all players exist and are not rostered on another team.
            for (const playerId of updates.playerIds) {
                const player = this.players.find(p => p.id === playerId);
                if (!player) {
                    throw new Error(`Player ${playerId} not found`);
                }
                const other = this.teams.find(t => t.id !== teamId && t.playerIds.includes(playerId));
                if (other) {
                    throw new Error(`${player.name} is already on team "${other.name}"`);
                }
            }
            if (new Set(updates.playerIds).size !== updates.playerIds.length) {
                throw new Error('A player cannot be listed twice on the same team');
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

    // Group counts the LAN has actually run. Note that 11 and 13 never reach
    // here: startGroupStage() adds a BYE player first, so they arrive as 12/14.
    private static readonly GROUP_COUNTS: Record<number, number> = {
        4: 1, 5: 1, 6: 2, 7: 1, 8: 2, 9: 3, 10: 2, 12: 3, 14: 2, 15: 3, 16: 4,
    };

    private generatePods() {
        const numPlayers = this.players.length;
        // Larger fields fall back to groups of about four.
        const numGroups = TournamentManager.GROUP_COUNTS[numPlayers] ?? Math.ceil(numPlayers / 4);

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
        // Group results are only meaningful while the group stage is running.
        // Editing one after the bracket is seeded silently rewrites the standings
        // the bracket was built from, leaving the podium and the group table
        // disagreeing with no way to tell which is right.
        if (this.state !== 'group') {
            throw new Error("Match results can only be submitted during the group stage");
        }
        const match = this.matches.find(m => m.id === matchId);
        if (!match) throw new Error("Match not found");

        validateMatchResult(results, [match.player1Id, match.player2Id], this.getArchetype());

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

    // Maps per playoff series, from the game config (BO3 for every shipped game).
    // Never infer this from how many games happen to be recorded so far: a BO5
    // read that way looks like a BO3 for its first three maps and ends 2-0.
    private getMapsPerMatch(): number {
        return this.getGameConfig().playoffs.mapsPerMatch || 3;
    }

    // Submit one map of a playoff series. Upserts by gameNumber and rebuilds the
    // series score from the games array, so resubmitting or correcting a map
    // replaces it instead of counting it twice (same rebuild-don't-increment
    // rule as recalculatePlayerStats).
    submitBracketGameResult(matchId: string, gameResult: BracketGameResult) {
        const match = this.bracketMatches.find(m => m.id === matchId);
        if (!match) throw new Error("Bracket match not found");

        const maxGames = this.getMapsPerMatch();
        if (!Number.isInteger(gameResult.gameNumber) || gameResult.gameNumber < 1 || gameResult.gameNumber > maxGames) {
            throw new Error(`Game number must be between 1 and ${maxGames}`);
        }

        if (!match.games) match.games = [];
        const existing = match.games.findIndex(g => g.gameNumber === gameResult.gameNumber);
        if (existing === -1) match.games.push(gameResult);
        else match.games[existing] = gameResult;
        match.games.sort((a, b) => a.gameNumber - b.gameNumber);

        match.player1Wins = match.games.filter(g => g.winnerId && g.winnerId === match.player1Id).length;
        match.player2Wins = match.games.filter(g => g.winnerId && g.winnerId === match.player2Id).length;

        const winsNeeded = Math.ceil(maxGames / 2);
        if (match.player1Wins >= winsNeeded) {
            this.submitBracketWinner(matchId, match.player1Id!);
        } else if (match.player2Wins >= winsNeeded) {
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

        // Re-declaring the same winner is a no-op. The playoff UI submits the
        // series games (which already decide the winner) and then calls this
        // again; without the guard the second pass seeded the SAME loser into
        // both slots of the 3rd-place match.
        if (match.winnerId === winnerId) return;

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
            const alreadySeeded = thirdPlaceMatch?.player1Id === loserId || thirdPlaceMatch?.player2Id === loserId;
            if (thirdPlaceMatch && loserId && !alreadySeeded) {
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
    // Reset the whole tournament back to registration, clearing BOTH solo and
    // team data. The /reset route used to clear only the solo arrays, leaving a
    // team tournament in an inconsistent, half-wiped state.
    reset(): void {
        this.players = [];
        this.pods = [];
        this.matches = [];
        this.bracketMatches = [];
        this.teams = [];
        this.teamPods = [];
        this.teamMatches = [];
        this.teamBracketMatches = [];
        this.state = 'registration';
    }

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
        validateImage(photo, 'photo');
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
        // One group up to 7 teams, two at 8, three to 12, four beyond.
        const numGroups =
            numTeams <= 7 ? 1 :
            numTeams === 8 ? 2 :
            numTeams <= 12 ? 3 : 4;

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
        if (this.state !== 'group') {
            throw new Error("Match results can only be submitted during the group stage");
        }
        const match = this.teamMatches.find(m => m.id === matchId);
        if (!match) throw new Error("Team match not found");

        validateTeamMatchResult(team1Score, team2Score, this.getArchetype());

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

    // Submit one map of a team playoff series. Upsert + rebuild, exactly like the
    // solo path, and the series length comes from the config rather than from the
    // number of maps recorded so far.
    submitTeamBracketGameResult(matchId: string, gameResult: TeamGameResult) {
        const match = this.teamBracketMatches.find(m => m.id === matchId);
        if (!match) throw new Error("Team bracket match not found");

        const maxGames = this.getMapsPerMatch();
        if (!Number.isInteger(gameResult.gameNumber) || gameResult.gameNumber < 1 || gameResult.gameNumber > maxGames) {
            throw new Error(`Game number must be between 1 and ${maxGames}`);
        }

        if (!match.games) match.games = [];
        const existing = match.games.findIndex(g => g.gameNumber === gameResult.gameNumber);
        if (existing === -1) match.games.push(gameResult);
        else match.games[existing] = gameResult;
        match.games.sort((a, b) => a.gameNumber - b.gameNumber);

        match.team1Wins = match.games.filter(g => g.winnerTeamId && g.winnerTeamId === match.team1Id).length;
        match.team2Wins = match.games.filter(g => g.winnerTeamId && g.winnerTeamId === match.team2Id).length;

        const winsNeeded = Math.ceil(maxGames / 2);
        if (match.team1Wins >= winsNeeded) {
            this.submitTeamBracketWinner(matchId, match.team1Id!);
        } else if (match.team2Wins >= winsNeeded) {
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

        // Same no-op guard as the solo path -- this is where the duplicated
        // 3rd-place seeding actually bit, because the team modal always made a
        // redundant winner call after submitting the series games.
        if (match.winnerId === winnerTeamId) return;

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
            const alreadySeeded = thirdPlaceMatch?.team1Id === loserId || thirdPlaceMatch?.team2Id === loserId;
            if (thirdPlaceMatch && loserId && !alreadySeeded) {
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
        let qualifiedTeams = rankings.filter(t => qualifiedTeamIds.has(t.id));

        // Seed across groups, exactly as the solo path does. Without this the
        // first round could be an intra-group rematch of a game already played.
        qualifiedTeams = reorderForCrossGroupMatchups(
            qualifiedTeams,
            this.teamPods.length,
            (teamId) => this.teamPods.find(p => p.teams.includes(teamId))?.id ?? null,
        );

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
