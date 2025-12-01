import { TournamentManager } from './tournament';

interface TestResult {
    playerCount: number;
    groupsValid: boolean;
    bracketsValid: boolean;
    groupErrors: string[];
    bracketErrors: string[];
}

function createAndSimulateTournament(numPlayers: number): TournamentManager {
    const tournament = new TournamentManager();
    
    // Add players
    for (let i = 1; i <= numPlayers; i++) {
        tournament.addPlayer(`Player ${i}`);
    }
    
    // Start group stage
    tournament.startGroupStage();
    
    // Simulate all group matches
    const pods = tournament.pods;
    pods.forEach((pod: any) => {
        const groupPlayers = pod.players;
        const groupMatches = tournament.matches.filter((m: any) => m.podId === pod.id);
        
        groupMatches.forEach((match: any) => {
            const p1Index = groupPlayers.indexOf(match.player1Id);
            const p2Index = groupPlayers.indexOf(match.player2Id);
            
            const results: any = {};
            if (p1Index > p2Index) {
                results[match.player1Id] = { points: 3 };
                results[match.player2Id] = { points: 0 };
            } else {
                results[match.player1Id] = { points: 0 };
                results[match.player2Id] = { points: 3 };
            }
            
            tournament.submitMatchResult(match.id, results);
        });
    });
    
    // Generate brackets
    tournament.generateBrackets();
    
    return tournament;
}

function validateGroupStage(tournament: any, numPlayers: number): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const players = tournament.players;
    const matches = tournament.matches;
    const pods = tournament.pods;
    
    // Validate each group
    pods.forEach((pod: any, groupIndex: number) => {
        const groupPlayers = pod.players;
        const groupMatches = matches.filter((m: any) => m.podId === pod.id);
        const groupSize = groupPlayers.length;
        
        const expectedMatchesPerPlayer = groupSize - 1;
        const expectedTotalMatches = (groupSize * (groupSize - 1)) / 2;
        
        // Check total matches in group
        if (groupMatches.length !== expectedTotalMatches) {
            errors.push(`Group ${groupIndex + 1}: Expected ${expectedTotalMatches} matches, got ${groupMatches.length}`);
        }
        
        // Check each player in group
        groupPlayers.forEach((playerId: string) => {
            const playerMatches = groupMatches.filter((m: any) => 
                m.player1Id === playerId || m.player2Id === playerId
            );
            
            if (playerMatches.length !== expectedMatchesPerPlayer) {
                const player = players.find((p: any) => p.id === playerId);
                errors.push(`Group ${groupIndex + 1}, ${player.name}: Expected ${expectedMatchesPerPlayer} matches, got ${playerMatches.length}`);
            }
            
            // Check for unique opponents
            const opponents = new Set<string>();
            playerMatches.forEach((m: any) => {
                const opponentId = m.player1Id === playerId ? m.player2Id : m.player1Id;
                if (opponents.has(opponentId)) {
                    errors.push(`Group ${groupIndex + 1}: Duplicate match found`);
                }
                opponents.add(opponentId);
            });
        });
    });
    
    return { valid: errors.length === 0, errors };
}

function validateBrackets(tournament: any, numPlayers: number): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const bracketMatches = tournament.bracketMatches;
    const numGroups = tournament.pods.length;
    
    // Calculate playoff players: top 2 from each group, capped at 8
    let expectedPlayoffPlayers = Math.min(numGroups * 2, 8);
    
    // Adjust to valid bracket sizes (4, 6, or 8)
    if (expectedPlayoffPlayers <= 4) {
        expectedPlayoffPlayers = Math.min(4, numPlayers);
    } else if (expectedPlayoffPlayers <= 6) {
        expectedPlayoffPlayers = 6;
    } else {
        expectedPlayoffPlayers = 8;
    }
    
    // Expected structures based on total players and playoff players
    let expectedStructure: { [key: string]: number } = {};
    
    if (numPlayers === 4 && expectedPlayoffPlayers === 4) {
        // Only exactly 4-player tournaments get direct finals
        expectedStructure = { 'finals': 1, '3rd-place': 1 };
    } else if (expectedPlayoffPlayers === 4) {
        // 4 qualifiers from multiple groups: need semifinals
        expectedStructure = { 'semifinals': 2, 'finals': 1, '3rd-place': 1 };
    } else if (expectedPlayoffPlayers === 6) {
        // 6 players advance: seeds 1&2 get byes to semifinals, seeds 3-6 play in quarterfinals
        expectedStructure = { 'quarterfinals': 2, 'semifinals': 2, 'finals': 1, '3rd-place': 1 };
    } else {
        // 8 players: full quarterfinals
        expectedStructure = { 'quarterfinals': 4, 'semifinals': 2, 'finals': 1, '3rd-place': 1 };
    }
    
    // Count unique players in brackets
    const playoffPlayers = new Set<string>();
    bracketMatches.forEach((m: any) => {
        if (m.player1Id) playoffPlayers.add(m.player1Id);
        if (m.player2Id) playoffPlayers.add(m.player2Id);
    });
    
    if (playoffPlayers.size !== expectedPlayoffPlayers) {
        errors.push(`Expected ${expectedPlayoffPlayers} playoff players, got ${playoffPlayers.size}`);
    }
    
    // Count bracket types
    const actualStructure: { [key: string]: number } = {};
    bracketMatches.forEach((m: any) => {
        actualStructure[m.bracketType] = (actualStructure[m.bracketType] || 0) + 1;
    });
    
    // Validate structure
    Object.entries(expectedStructure).forEach(([type, count]) => {
        const actual = actualStructure[type] || 0;
        if (actual !== count) {
            errors.push(`Expected ${count} ${type} matches, got ${actual}`);
        }
    });
    
    return { valid: errors.length === 0, errors };
}

function testTournament(numPlayers: number): TestResult {
    const tournament = createAndSimulateTournament(numPlayers);
    
    const groupValidation = validateGroupStage(tournament, numPlayers);
    const bracketValidation = validateBrackets(tournament, numPlayers);
    
    return {
        playerCount: numPlayers,
        groupsValid: groupValidation.valid,
        bracketsValid: bracketValidation.valid,
        groupErrors: groupValidation.errors,
        bracketErrors: bracketValidation.errors
    };
}

console.log('\n' + '='.repeat(80));
console.log('FULL TOURNAMENT TEST SUITE: 4-16 PLAYERS');
console.log('Testing both Group Stage and Playoff Brackets');
console.log('='.repeat(80) + '\n');

const results: TestResult[] = [];

for (let numPlayers = 4; numPlayers <= 16; numPlayers++) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`Testing ${numPlayers} players`);
    console.log('─'.repeat(80));
    
    const result = testTournament(numPlayers);
    results.push(result);
    
    // Display group stage results
    if (result.groupsValid) {
        console.log('✅ Group Stage: VALID');
    } else {
        console.log('❌ Group Stage: INVALID');
        result.groupErrors.forEach(err => console.log(`   - ${err}`));
    }
    
    // Display bracket results
    if (result.bracketsValid) {
        console.log('✅ Brackets: VALID');
    } else {
        console.log('❌ Brackets: INVALID');
        result.bracketErrors.forEach(err => console.log(`   - ${err}`));
    }
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80) + '\n');

console.log('Player Count | Groups | Brackets | Status');
console.log('─'.repeat(80));

let allPassed = true;
results.forEach(result => {
    const groupStatus = result.groupsValid ? '✅ PASS' : '❌ FAIL';
    const bracketStatus = result.bracketsValid ? '✅ PASS' : '❌ FAIL';
    const overallStatus = result.groupsValid && result.bracketsValid ? '✅ PASS' : '❌ FAIL';
    
    console.log(`${result.playerCount.toString().padStart(12)} | ${groupStatus} | ${bracketStatus} | ${overallStatus}`);
    
    if (!result.groupsValid || !result.bracketsValid) {
        allPassed = false;
    }
});

console.log('\n' + '='.repeat(80));
if (allPassed) {
    console.log('✅ ALL TESTS PASSED');
} else {
    console.log('❌ SOME TESTS FAILED');
}
console.log('='.repeat(80) + '\n');
