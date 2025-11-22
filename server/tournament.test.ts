import { TournamentManager } from './tournament';

interface Player {
    id: string;
    name: string;
    wins: number;
    draws: number;
    losses: number;
    points: number;
}

interface Match {
    id: string;
    podId: string;
    round: number;
    player1Id: string;
    player2Id: string;
    players: string[];
    completed: boolean;
}

function createTournament(numPlayers: number): TournamentManager {
    const tournament = new TournamentManager();
    
    for (let i = 1; i <= numPlayers; i++) {
        tournament.addPlayer(`Player ${i}`);
    }
    
    tournament.startGroupStage();
    
    return tournament;
}

function validateRoundRobin(tournament: any) {
    const players = tournament.players;
    const matches = tournament.matches;
    const pods = tournament.pods;
    
    console.log(`\n=== Testing ${players.length} Players ===`);
    console.log(`Groups: ${pods.length}`);
    
    // Count matches per player
    const playerMatchCount: Record<string, number> = {};
    const playerMatches: Record<string, Set<string>> = {};
    
    players.forEach((p: Player) => {
        playerMatchCount[p.id] = 0;
        playerMatches[p.id] = new Set();
    });
    
    matches.forEach((m: Match) => {
        playerMatchCount[m.player1Id]++;
        playerMatchCount[m.player2Id]++;
        playerMatches[m.player1Id].add(m.player2Id);
        playerMatches[m.player2Id].add(m.player1Id);
    });
    
    // Validate each group
    pods.forEach((pod: any, groupIndex: number) => {
        const groupPlayers = pod.players;
        const groupMatches = matches.filter((m: Match) => m.podId === pod.id);
        const groupSize = groupPlayers.length;
        
        console.log(`\nGroup ${groupIndex + 1}: ${groupSize} players`);
        console.log(`Expected matches per player: ${groupSize - 1}`);
        console.log(`Total matches in group: ${groupMatches.length}`);
        
        // For round-robin, each player should play against every other player in their group
        const expectedMatchesPerPlayer = groupSize - 1;
        const expectedTotalMatches = (groupSize * (groupSize - 1)) / 2;
        
        console.log(`Expected total matches: ${expectedTotalMatches}`);
        
        // Check each player in this group
        groupPlayers.forEach((playerId: string) => {
            const playerGroupMatches = groupMatches.filter((m: Match) => 
                m.player1Id === playerId || m.player2Id === playerId
            );
            
            const opponents = new Set<string>();
            playerGroupMatches.forEach((m: Match) => {
                const opponentId = m.player1Id === playerId ? m.player2Id : m.player1Id;
                opponents.add(opponentId);
            });
            
            const player = players.find((p: Player) => p.id === playerId);
            console.log(`  ${player.name}: ${playerGroupMatches.length} matches, ${opponents.size} unique opponents`);
            
            // Validation: Each player should play exactly (groupSize - 1) matches
            if (playerGroupMatches.length !== expectedMatchesPerPlayer) {
                console.error(`    ❌ ERROR: Expected ${expectedMatchesPerPlayer} matches, got ${playerGroupMatches.length}`);
                return false;
            }
            
            // Validation: Each player should face every other player in their group exactly once
            if (opponents.size !== expectedMatchesPerPlayer) {
                console.error(`    ❌ ERROR: Expected ${expectedMatchesPerPlayer} unique opponents, got ${opponents.size}`);
                return false;
            }
            
            // Check for duplicate matches
            const otherGroupPlayers = groupPlayers.filter((id: string) => id !== playerId);
            otherGroupPlayers.forEach((opponentId: string) => {
                if (!opponents.has(opponentId)) {
                    const opponent = players.find((p: Player) => p.id === opponentId);
                    console.error(`    ❌ ERROR: ${player.name} never plays against ${opponent.name}`);
                    return false;
                }
            });
        });
        
        if (groupMatches.length !== expectedTotalMatches) {
            console.error(`  ❌ ERROR: Group total matches: expected ${expectedTotalMatches}, got ${groupMatches.length}`);
            return false;
        }
    });
    
    console.log('\n✅ Validation passed!');
    return true;
}

// Run tests for different player counts
console.log('Starting Round-Robin Tournament Tests\n');
console.log('=====================================');

const testCases = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

testCases.forEach(numPlayers => {
    try {
        const tournament = createTournament(numPlayers);
        const isValid = validateRoundRobin(tournament);
        if (!isValid) {
            console.error(`\n❌ FAILED: ${numPlayers} players\n`);
        }
    } catch (error) {
        console.error(`\n❌ EXCEPTION with ${numPlayers} players:`, error);
    }
});

console.log('\n=====================================');
console.log('Tests complete\n');
