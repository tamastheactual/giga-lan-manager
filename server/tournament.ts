import { v4 as uuidv4 } from 'uuid';
import { type GameType, getGameConfig } from './gameTypes.js';

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
<<<<<<< HEAD
=======
}

// BO3 game result for bracket matches
export interface BracketGameResult {
    gameNumber: number;
    mapName?: string;
    player1Score: number;
    player2Score: number;
    winnerId: string;
>>>>>>> af825c2c61492a36b9eda13c09f52ada7b5ad9c2
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

export class TournamentManager {
    id: string;
    name: string;
<<<<<<< HEAD
=======
    gameType: GameType; // Which game this tournament is for
>>>>>>> af825c2c61492a36b9eda13c09f52ada7b5ad9c2
    players: Player[] = [];
    pods: Pod[] = [];
    matches: Match[] = [];
    bracketMatches: BracketMatch[] = [];
    state: 'registration' | 'group' | 'playoffs' | 'completed' = 'registration';

<<<<<<< HEAD
    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
=======
    constructor(id: string, name: string, gameType: GameType = 'cs16') {
        this.id = id;
        this.name = name;
        this.gameType = gameType;
    }
    
    // Get game configuration
    getGameConfig() {
        return getGameConfig(this.gameType);
>>>>>>> af825c2c61492a36b9eda13c09f52ada7b5ad9c2
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

    startGroupStage() {
        if (this.players.length < 4) {
            throw new Error("Need at least 4 players");
        }
        this.state = 'group';
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
        } else if (numPlayers >= 10 && numPlayers <= 12) {
            groupSize = 4;
            numGroups = Math.ceil(numPlayers / 4);
        } else {
            // For larger numbers, try to make groups of 4
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

    submitMatchResult(matchId: string, results: { [playerId: string]: { points: number, score?: number } }, gameResults?: GameResult[]) {
        const match = this.matches.find(m => m.id === matchId);
        if (!match) throw new Error("Match not found");

        match.result = results;
        match.completed = true;
        
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

    generateBrackets() {
        const rankings = this.getRankings();
        const numGroups = this.pods.length;
        
        // Determine playoff size based on groups and players
        // Top 2 from each group qualify, capped at 8
        let numQualified = Math.min(numGroups * 2, 8);
        
        // Adjust to valid bracket sizes (4, 6, or 8)
        if (numQualified <= 4) {
            numQualified = Math.min(4, rankings.length);
        } else if (numQualified <= 6) {
            numQualified = 6;
        } else {
            numQualified = 8;
        }
        
        const qualifiedPlayers = rankings.slice(0, numQualified);

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
            }
        });

        // Reset all matches for this group
        this.matches.forEach(match => {
            if (match.podId === podId) {
                match.result = undefined;
                match.completed = false;
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

}
