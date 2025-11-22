import { v4 as uuidv4 } from 'uuid';

export interface Player {
    id: string;
    name: string;
    points: number;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    scoreDifferential: number; // For tiebreakers
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
            score?: number; // In-game score
        }
    };
    completed: boolean;
}

export interface Pod {
    id: string;
    round: number;
    players: string[];
    matchId: string;
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
}

export class TournamentManager {
    players: Player[] = [];
    pods: Pod[] = [];
    matches: Match[] = [];
    bracketMatches: BracketMatch[] = [];
    state: 'registration' | 'group' | 'playoffs' = 'registration';

    constructor() {}

    addPlayer(name: string): Player {
        const player: Player = {
            id: uuidv4(),
            name,
            points: 0,
            matchesPlayed: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            scoreDifferential: 0
        };
        this.players.push(player);
        return player;
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

    submitMatchResult(matchId: string, results: { [playerId: string]: { points: number, score?: number } }) {
        const match = this.matches.find(m => m.id === matchId);
        if (!match) throw new Error("Match not found");

        match.result = results;
        match.completed = true;

        // Update player stats
        for (const [playerId, result] of Object.entries(results)) {
            const player = this.players.find(p => p.id === playerId);
            if (player) {
                player.matchesPlayed++;
                player.points += result.points;
                if (result.points >= 3) player.wins++; // Assuming 3 is win
                else if (result.points === 1) player.draws++;
                else player.losses++;
                // Score diff logic if needed
            }
        }
    }

    getRankings(): Player[] {
        return [...this.players].sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            // Tiebreakers
            return 0; // TODO: Add tiebreakers
        });
    }

    generateBrackets() {
        const rankings = this.getRankings();
        
        // Determine playoff size based on total players
        const totalPlayers = rankings.length;
        let numQualified: number;
        
        if (totalPlayers <= 5) {
            // 4-5 players: top 4 advance
            numQualified = Math.min(4, totalPlayers);
        } else if (totalPlayers <= 8) {
            // 6-8 players: top 4 advance (simple bracket)
            numQualified = 4;
        } else if (totalPlayers <= 13) {
            // 9-13 players: top 6 advance (quarterfinals with byes)
            numQualified = 6;
        } else {
            // 14+ players: top 8 advance
            numQualified = 8;
        }
        
        const qualifiedPlayers = rankings.slice(0, numQualified);

        this.bracketMatches = [];
        this.createPlayoffBracket(qualifiedPlayers);
        this.state = 'playoffs';
    }

    private createPlayoffBracket(players: Player[]) {
        const numPlayers = players.length;
        
        if (numPlayers === 4) {
            this.create4PlayerBracket(players);
        } else if (numPlayers === 6) {
            this.create6PlayerBracket(players);
        } else if (numPlayers === 8) {
            this.create8PlayerBracket(players);
        } else {
            // Fallback: just create semifinals with available players
            this.create4PlayerBracket(players.slice(0, 4));
        }
    }
    
    private create4PlayerBracket(players: Player[]) {
        // 4 players: 2 semifinals → finals + 3rd place
        const semi1Id = uuidv4();
        const semi2Id = uuidv4();
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();
        
        // Semifinals
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
    }
}
