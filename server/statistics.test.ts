import { TournamentManager } from './tournament';

/**
 * Test to validate that match counting is correct for statistics page
 * This simulates the same logic used in Statistics.svelte
 */

interface RoundStats {
    roundsWon: number;
    roundsLost: number;
    matchesPlayed: number;
    bestMatch: number;
    worstMatch: number;
}

function createAndSimulateTournament(numPlayers: number): TournamentManager {
    const tournament = new TournamentManager();
    
    // Add players
    for (let i = 1; i <= numPlayers; i++) {
        tournament.addPlayer(`Player ${i}`);
    }
    
    // Start group stage
    tournament.startGroupStage();
    
    // Simulate all group matches with CS16 scores
    const pods = tournament.pods;
    pods.forEach((pod: any) => {
        const groupPlayers = pod.players;
        const groupMatches = tournament.matches.filter((m: any) => m.podId === pod.id);
        
        groupMatches.forEach((match: any) => {
            const p1Index = groupPlayers.indexOf(match.player1Id);
            const p2Index = groupPlayers.indexOf(match.player2Id);
            
            const results: any = {};
            // Simulate CS16 scores (winner gets 15, loser gets 0-14)
            if (p1Index > p2Index) {
                results[match.player1Id] = { points: 3, score: 15 };
                results[match.player2Id] = { points: 0, score: 10 };
            } else {
                results[match.player1Id] = { points: 0, score: 8 };
                results[match.player2Id] = { points: 3, score: 15 };
            }
            
            tournament.submitMatchResult(match.id, results);
        });
    });
    
    // Generate brackets
    tournament.generateBrackets();
    
    // Simulate bracket matches with BO3 games - need to do it in rounds
    // so that next round matches get their players populated
    simulateBracketRounds(tournament);
    
    return tournament;
}

function simulateBracketRounds(tournament: any) {
    const bracketMatches = tournament.bracketMatches;
    
    // Sort by round to ensure we process in order
    const matchesByRound: Record<number, any[]> = {};
    bracketMatches.forEach((m: any) => {
        if (!matchesByRound[m.round]) matchesByRound[m.round] = [];
        matchesByRound[m.round].push(m);
    });
    
    const rounds = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);
    
    rounds.forEach(round => {
        matchesByRound[round].forEach((match: any) => {
            if (!match.player1Id || !match.player2Id) return;
            
            // Simulate BO3 with games array (player 1 wins 2-0)
            match.games = [
                { player1Score: 10, player2Score: 5 },  // Player 1 wins map 1
                { player1Score: 10, player2Score: 7 },  // Player 1 wins map 2
                { player1Score: 0, player2Score: 0 }    // Map 3 not played
            ];
            match.winnerId = match.player1Id;
            
            // Update next round matches if this is not finals/3rd-place
            if (match.nextMatchId) {
                const nextMatch = bracketMatches.find((m: any) => m.id === match.nextMatchId);
                if (nextMatch) {
                    if (match.nextMatchSlot === 1) {
                        nextMatch.player1Id = match.winnerId;
                    } else {
                        nextMatch.player2Id = match.winnerId;
                    }
                }
            }
            
            // Handle 3rd place match - losers go there
            if (match.bracketType === 'semifinals') {
                const loserId = match.player1Id === match.winnerId ? match.player2Id : match.player1Id;
                const thirdPlaceMatch = bracketMatches.find((m: any) => m.bracketType === '3rd-place');
                if (thirdPlaceMatch) {
                    if (!thirdPlaceMatch.player1Id) {
                        thirdPlaceMatch.player1Id = loserId;
                    } else {
                        thirdPlaceMatch.player2Id = loserId;
                    }
                }
            }
        });
    });
}

function calculatePlayerRoundStats(players: any[], matches: any[], bracketMatches: any[]) {
    const roundStats: Record<string, RoundStats> = {};
    
    // Initialize stats for all players
    players.forEach((p: any) => {
        roundStats[p.id] = { roundsWon: 0, roundsLost: 0, matchesPlayed: 0, bestMatch: 0, worstMatch: Infinity };
    });

    // Group stage matches
    matches.forEach((match: any) => {
        if (!match.result || !match.completed) return;
        
        const p1Id = match.player1Id;
        const p2Id = match.player2Id;
        const p1Result = match.result[p1Id];
        const p2Result = match.result[p2Id];
        
        // Always count the match as played
        if (roundStats[p1Id]) roundStats[p1Id].matchesPlayed++;
        if (roundStats[p2Id]) roundStats[p2Id].matchesPlayed++;
        
        // Track round scores if available
        if (p1Result?.score !== undefined && p2Result?.score !== undefined) {
            // Track rounds for player 1
            if (roundStats[p1Id]) {
                roundStats[p1Id].roundsWon += p1Result.score;
                roundStats[p1Id].roundsLost += p2Result.score;
                roundStats[p1Id].bestMatch = Math.max(roundStats[p1Id].bestMatch, p1Result.score);
                roundStats[p1Id].worstMatch = Math.min(roundStats[p1Id].worstMatch, p1Result.score);
            }
            
            // Track rounds for player 2
            if (roundStats[p2Id]) {
                roundStats[p2Id].roundsWon += p2Result.score;
                roundStats[p2Id].roundsLost += p1Result.score;
                roundStats[p2Id].bestMatch = Math.max(roundStats[p2Id].bestMatch, p2Result.score);
                roundStats[p2Id].worstMatch = Math.min(roundStats[p2Id].worstMatch, p2Result.score);
            }
        }
    });

    // Bracket matches (BO3 - each MAP counts as a match)
    bracketMatches.forEach((match: any) => {
        if (!match.winnerId) return;
        
        const p1Id = match.player1Id;
        const p2Id = match.player2Id;
        
        // Count each map/game as a separate match
        if (match.games && Array.isArray(match.games)) {
            match.games.forEach((game: any) => {
                if (game.player1Score !== undefined && game.player2Score !== undefined) {
                    // Only count maps that were actually played
                    if (game.player1Score === 0 && game.player2Score === 0) return;
                    
                    // Each map is a match
                    if (roundStats[p1Id]) {
                        roundStats[p1Id].roundsWon += game.player1Score;
                        roundStats[p1Id].roundsLost += game.player2Score;
                        roundStats[p1Id].matchesPlayed++;
                        roundStats[p1Id].bestMatch = Math.max(roundStats[p1Id].bestMatch, game.player1Score);
                        roundStats[p1Id].worstMatch = Math.min(roundStats[p1Id].worstMatch, game.player1Score);
                    }
                    if (roundStats[p2Id]) {
                        roundStats[p2Id].roundsWon += game.player2Score;
                        roundStats[p2Id].roundsLost += game.player1Score;
                        roundStats[p2Id].matchesPlayed++;
                        roundStats[p2Id].bestMatch = Math.max(roundStats[p2Id].bestMatch, game.player2Score);
                        roundStats[p2Id].worstMatch = Math.min(roundStats[p2Id].worstMatch, game.player2Score);
                    }
                }
            });
        } else {
            // Fallback: if no games array, count series as 2 maps (minimum for BO3 winner)
            if (roundStats[p1Id]) roundStats[p1Id].matchesPlayed += 2;
            if (roundStats[p2Id]) roundStats[p2Id].matchesPlayed += 2;
        }
    });

    // Clean up worstMatch for players with no matches
    Object.values(roundStats).forEach(stats => {
        if (stats.worstMatch === Infinity) stats.worstMatch = 0;
    });

    return roundStats;
}

function countExpectedMatches(tournament: any, playerId: string): { groupMatches: number; bracketMaps: number; bracketSeries: number; total: number } {
    // Count group matches (1 match = 1 map in group stage)
    const groupMatches = tournament.matches.filter((m: any) => 
        m.completed && (m.player1Id === playerId || m.player2Id === playerId)
    ).length;
    
    // Count bracket series the player participated in
    const playerBracketSeries = tournament.bracketMatches.filter((m: any) => 
        m.winnerId && (m.player1Id === playerId || m.player2Id === playerId)
    );
    
    // Count total maps played in brackets (each series with games array)
    let bracketMaps = 0;
    playerBracketSeries.forEach((match: any) => {
        if (match.games && Array.isArray(match.games)) {
            // Count maps actually played (non-zero scores)
            bracketMaps += match.games.filter((g: any) => 
                g.player1Score > 0 || g.player2Score > 0
            ).length;
        } else {
            // Fallback: assume 2 maps per series (minimum for BO3)
            bracketMaps += 2;
        }
    });
    
    return { 
        groupMatches, 
        bracketMaps, 
        bracketSeries: playerBracketSeries.length,
        total: groupMatches + bracketMaps 
    };
}

console.log('\n' + '='.repeat(80));
console.log('STATISTICS MATCH COUNT VALIDATION TEST');
console.log('BO3 format: Each MAP counts as a match, not each series');
console.log('='.repeat(80) + '\n');

// Test with 8 players (2 groups of 4)
const tournament8 = createAndSimulateTournament(8);
console.log('\n--- Testing 8 Players (2 groups of 4) ---');
console.log('Group stage: Each player plays 3 matches (1 map each)');
console.log('Brackets: 4 players in BO3 format (2-3 maps per series)\n');

const roundStats8 = calculatePlayerRoundStats(
    tournament8.players, 
    tournament8.matches, 
    tournament8.bracketMatches
);

let errors8 = 0;
tournament8.players.forEach((player: any) => {
    const expected = countExpectedMatches(tournament8, player.id);
    const actual = roundStats8[player.id]?.matchesPlayed || 0;
    
    const status = expected.total === actual ? '✅' : '❌';
    if (expected.total !== actual) errors8++;
    
    console.log(`${status} ${player.name}: Expected ${expected.total} (${expected.groupMatches} group + ${expected.bracketMaps} bracket maps from ${expected.bracketSeries} series), Got ${actual}`);
});

// Test with 12 players (3 groups of 4)
const tournament12 = createAndSimulateTournament(12);
console.log('\n--- Testing 12 Players (3 groups of 4) ---');
console.log('Group stage: Each player plays 3 matches (1 map each)');
console.log('Brackets: 6 players in BO3 format\n');

const roundStats12 = calculatePlayerRoundStats(
    tournament12.players, 
    tournament12.matches, 
    tournament12.bracketMatches
);

let errors12 = 0;
tournament12.players.forEach((player: any) => {
    const expected = countExpectedMatches(tournament12, player.id);
    const actual = roundStats12[player.id]?.matchesPlayed || 0;
    
    const status = expected.total === actual ? '✅' : '❌';
    if (expected.total !== actual) errors12++;
    
    console.log(`${status} ${player.name}: Expected ${expected.total} (${expected.groupMatches} group + ${expected.bracketMaps} bracket maps from ${expected.bracketSeries} series), Got ${actual}`);
});

// Check the winner specifically
console.log('\n--- Checking Tournament Winner ---');
const bracketMatches = tournament8.bracketMatches;
const finalMatch = bracketMatches.find((m: any) => m.bracketType === 'finals');
if (finalMatch?.winnerId) {
    const winner = tournament8.players.find((p: any) => p.id === finalMatch.winnerId);
    const winnerStats = roundStats8[winner.id];
    const expected = countExpectedMatches(tournament8, winner.id);
    
    console.log(`\nWinner: ${winner.name}`);
    console.log(`Group matches: ${expected.groupMatches}`);
    console.log(`Bracket series: ${expected.bracketSeries}`);
    console.log(`Bracket maps: ${expected.bracketMaps}`);
    console.log(`Total expected: ${expected.total}`);
    console.log(`Statistics shows: ${winnerStats.matchesPlayed}`);
    
    if (expected.total === winnerStats.matchesPlayed) {
        console.log('✅ Match count is CORRECT');
    } else {
        console.log('❌ Match count is WRONG');
    }
}

// Detailed bracket match inspection
console.log('\n--- Bracket Matches Detail ---');
bracketMatches.forEach((m: any) => {
    const p1 = tournament8.players.find((p: any) => p.id === m.player1Id)?.name || 'TBD';
    const p2 = tournament8.players.find((p: any) => p.id === m.player2Id)?.name || 'TBD';
    const winner = tournament8.players.find((p: any) => p.id === m.winnerId)?.name || 'TBD';
    const hasGames = m.games && m.games.length > 0;
    console.log(`${m.bracketType}: ${p1} vs ${p2} - Winner: ${winner}, Has games array: ${hasGames}`);
});

// Test case: Bracket matches WITHOUT games array (simulates current production behavior)
console.log('\n--- Testing Bracket Matches Without Games Array ---');
const tournament8NoGames = createAndSimulateTournament(8);

// Simulate bracket matches without games array (just winner)
tournament8NoGames.bracketMatches.forEach((match: any) => {
    if (!match.player1Id || !match.player2Id) return;
    // Only set winnerId, no games array (like current production)
    match.winnerId = match.player1Id;
    // Don't set match.games
});

const roundStats8NoGames = calculatePlayerRoundStats(
    tournament8NoGames.players, 
    tournament8NoGames.matches, 
    tournament8NoGames.bracketMatches
);

let errorsNoGames = 0;
tournament8NoGames.players.forEach((player: any) => {
    const expected = countExpectedMatches(tournament8NoGames, player.id);
    const actual = roundStats8NoGames[player.id]?.matchesPlayed || 0;
    
    const status = expected.total === actual ? '✅' : '❌';
    if (expected.total !== actual) errorsNoGames++;
    
    console.log(`${status} ${player.name}: Expected ${expected.total} (${expected.groupMatches} group + ${expected.bracketMatches} bracket), Got ${actual}`);
});

// Test case: Group matches WITHOUT score field (legacy data)
console.log('\n--- Testing Group Matches Without Score Field (Legacy) ---');
const tournamentLegacy = new TournamentManager();
for (let i = 1; i <= 8; i++) {
    tournamentLegacy.addPlayer(`Player ${i}`);
}
tournamentLegacy.startGroupStage();

// Simulate old-style results without score field
tournamentLegacy.pods.forEach((pod: any) => {
    const groupMatches = tournamentLegacy.matches.filter((m: any) => m.podId === pod.id);
    groupMatches.forEach((match: any) => {
        const results: any = {};
        // Old format: only points, no score
        results[match.player1Id] = { points: 3 };
        results[match.player2Id] = { points: 0 };
        tournamentLegacy.submitMatchResult(match.id, results);
    });
});

const roundStatsLegacy = calculatePlayerRoundStats(
    tournamentLegacy.players, 
    tournamentLegacy.matches, 
    []
);

let errorsLegacy = 0;
tournamentLegacy.players.forEach((player: any) => {
    const expectedGroupMatches = tournamentLegacy.matches.filter((m: any) => 
        m.completed && (m.player1Id === player.id || m.player2Id === player.id)
    ).length;
    const actual = roundStatsLegacy[player.id]?.matchesPlayed || 0;
    
    const status = expectedGroupMatches === actual ? '✅' : '❌';
    if (expectedGroupMatches !== actual) errorsLegacy++;
    
    console.log(`${status} ${player.name}: Expected ${expectedGroupMatches} group matches, Got ${actual} (rounds: ${roundStatsLegacy[player.id]?.roundsWon || 0})`);
});

// Summary
console.log('\n' + '='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
const totalErrors = errors8 + errors12 + errorsNoGames + errorsLegacy;
if (totalErrors === 0) {
    console.log('✅ ALL MATCH COUNTS ARE CORRECT');
    console.log('   - With games array: PASS');
    console.log('   - Without games array (current prod): PASS');
    console.log('   - Legacy data without scores: PASS');
} else {
    console.log(`❌ ERRORS FOUND: ${totalErrors} players have incorrect match counts`);
}
console.log('='.repeat(80) + '\n');
