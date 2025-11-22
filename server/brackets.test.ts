import { TournamentManager } from './tournament';

interface BracketMatch {
    id: string;
    bracketType: string;
    player1Id: string;
    player2Id: string;
    winnerId?: string;
    completed: boolean;
}

function createTournamentWithGroupResults(numPlayers: number): TournamentManager {
    const tournament = new TournamentManager();
    
    // Add players
    for (let i = 1; i <= numPlayers; i++) {
        tournament.addPlayer(`Player ${i}`);
    }
    
    // Start group stage
    tournament.startGroupStage();
    
    // Simulate all group matches with predetermined results
    // Top players in each group get more points
    const pods = tournament.pods;
    
    pods.forEach((pod: any) => {
        const groupPlayers = pod.players;
        const groupMatches = tournament.matches.filter((m: any) => m.podId === pod.id);
        
        // Simulate results: higher index players win against lower index
        groupMatches.forEach((match: any) => {
            const p1Index = groupPlayers.indexOf(match.player1Id);
            const p2Index = groupPlayers.indexOf(match.player2Id);
            
            const results: any = {};
            if (p1Index > p2Index) {
                // Player 1 wins
                results[match.player1Id] = { points: 3 };
                results[match.player2Id] = { points: 0 };
            } else {
                // Player 2 wins
                results[match.player1Id] = { points: 0 };
                results[match.player2Id] = { points: 3 };
            }
            
            tournament.submitMatchResult(match.id, results);
        });
    });
    
    return tournament;
}

function analyzePlayoffStructure(tournament: any, numPlayers: number) {
    const bracketMatches = tournament.bracketMatches;
    const players = tournament.players;
    
    console.log(`\n=== Testing ${numPlayers} Players - Playoff Structure ===`);
    
    // Sort players by points to see who advanced
    const sortedPlayers = [...players].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return 0;
    });
    
    console.log('\nGroup Stage Results (Top players):');
    sortedPlayers.slice(0, 8).forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.name}: ${p.points} pts (W${p.wins} D${p.draws} L${p.losses})`);
    });
    
    // Analyze bracket structure
    const bracketTypes: Record<string, number> = {};
    bracketMatches.forEach((m: BracketMatch) => {
        bracketTypes[m.bracketType] = (bracketTypes[m.bracketType] || 0) + 1;
    });
    
    console.log('\nBracket Structure:');
    Object.entries(bracketTypes).forEach(([type, count]) => {
        console.log(`  ${type}: ${count} matches`);
    });
    
    // Count unique players in playoffs
    const playoffPlayers = new Set<string>();
    bracketMatches.forEach((m: BracketMatch) => {
        if (m.player1Id) playoffPlayers.add(m.player1Id);
        if (m.player2Id) playoffPlayers.add(m.player2Id);
    });
    
    console.log(`\nPlayers in playoffs: ${playoffPlayers.size}`);
    
    return {
        numPlayers,
        playoffPlayers: playoffPlayers.size,
        bracketTypes,
        totalMatches: bracketMatches.length
    };
}

function validateBracketStructure(numPlayers: number, expectedStructure: {
    playoffPlayers: number;
    rounds: { type: string; count: number }[];
    description: string;
}) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing ${numPlayers} players`);
    console.log(`Expected: ${expectedStructure.description}`);
    console.log(`${'='.repeat(60)}`);
    
    const tournament = createTournamentWithGroupResults(numPlayers);
    tournament.generateBrackets();
    
    const result = analyzePlayoffStructure(tournament, numPlayers);
    
    // Validate
    let isValid = true;
    
    if (result.playoffPlayers !== expectedStructure.playoffPlayers) {
        console.error(`❌ ERROR: Expected ${expectedStructure.playoffPlayers} playoff players, got ${result.playoffPlayers}`);
        isValid = false;
    } else {
        console.log(`✅ Correct number of playoff players: ${result.playoffPlayers}`);
    }
    
    expectedStructure.rounds.forEach(round => {
        const actual = result.bracketTypes[round.type] || 0;
        if (actual !== round.count) {
            console.error(`❌ ERROR: Expected ${round.count} ${round.type} matches, got ${actual}`);
            isValid = false;
        } else {
            console.log(`✅ Correct ${round.type}: ${actual} matches`);
        }
    });
    
    if (isValid) {
        console.log('\n✅ PASSED\n');
    } else {
        console.log('\n❌ FAILED\n');
    }
    
    return isValid;
}

console.log('Starting Bracket Structure Tests\n');
console.log('='.repeat(70));

// Test cases based on your requirements
const testCases = [
    {
        numPlayers: 4,
        expectedStructure: {
            playoffPlayers: 4,
            rounds: [
                { type: 'semifinals', count: 2 },
                { type: 'finals', count: 1 },
                { type: '3rd-place', count: 1 }
            ],
            description: 'All 4 → Semis (2) → Finals (1) + 3rd place (1)'
        }
    },
    {
        numPlayers: 6,
        expectedStructure: {
            playoffPlayers: 4,
            rounds: [
                { type: 'semifinals', count: 2 },
                { type: 'finals', count: 1 },
                { type: '3rd-place', count: 1 }
            ],
            description: 'Top 4 from 2 groups → Semis (2) → Finals (1) + 3rd place (1)'
        }
    },
    {
        numPlayers: 7,
        expectedStructure: {
            playoffPlayers: 4,
            rounds: [
                { type: 'semifinals', count: 2 },
                { type: 'finals', count: 1 },
                { type: '3rd-place', count: 1 }
            ],
            description: 'Top 4 from 1 group → Semis (2) → Finals (1) + 3rd place (1)'
        }
    },
    {
        numPlayers: 8,
        expectedStructure: {
            playoffPlayers: 4,
            rounds: [
                { type: 'semifinals', count: 2 },
                { type: 'finals', count: 1 },
                { type: '3rd-place', count: 1 }
            ],
            description: 'Top 4 from 2 groups → Semis (2) → Finals (1) + 3rd place (1)'
        }
    },
    {
        numPlayers: 9,
        expectedStructure: {
            playoffPlayers: 6,
            rounds: [
                { type: 'quarterfinals', count: 2 },
                { type: 'semifinals', count: 2 },
                { type: 'finals', count: 1 },
                { type: '3rd-place', count: 1 }
            ],
            description: 'Top 6 from 3 groups → Quarters (2) → Semis (2, seeds 1&2 advance directly) → Finals + 3rd'
        }
    },
    {
        numPlayers: 12,
        expectedStructure: {
            playoffPlayers: 6,
            rounds: [
                { type: 'quarterfinals', count: 2 },
                { type: 'semifinals', count: 2 },
                { type: 'finals', count: 1 },
                { type: '3rd-place', count: 1 }
            ],
            description: 'Top 6 from 3 groups → Quarters (2) → Semis (2, seeds 1&2 advance directly) → Finals + 3rd'
        }
    },
    {
        numPlayers: 16,
        expectedStructure: {
            playoffPlayers: 8,
            rounds: [
                { type: 'quarterfinals', count: 4 },
                { type: 'semifinals', count: 2 },
                { type: 'finals', count: 1 },
                { type: '3rd-place', count: 1 }
            ],
            description: 'Top 8 from 4 groups → Quarters (4) → Semis (2) → Finals + 3rd'
        }
    }
];

let allPassed = true;

testCases.forEach(testCase => {
    const passed = validateBracketStructure(testCase.numPlayers, testCase.expectedStructure);
    if (!passed) allPassed = false;
});

console.log('='.repeat(70));
if (allPassed) {
    console.log('✅ ALL TESTS PASSED');
} else {
    console.log('❌ SOME TESTS FAILED');
}
console.log('='.repeat(70));
