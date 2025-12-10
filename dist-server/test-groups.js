import { TournamentManager } from './tournament.js';
// Test 14 players group generation
const tournament = new TournamentManager('test-id', 'Test Tournament', 'cs16');
// Add 14 players
for (let i = 1; i <= 14; i++) {
    tournament.addPlayer(`Player ${i}`);
}
// Start group stage
tournament.startGroupStage();
// Check groups
const groupSizes = tournament.pods.map(pod => pod.players.length);
console.log('14 players - Group sizes:', groupSizes);
console.log('Expected: [7, 7]');
console.log('Pass:', groupSizes.length === 2 && groupSizes[0] === 7 && groupSizes[1] === 7);
// Test other player counts
const testCases = [
    { players: 4, expected: [4] },
    { players: 6, expected: [3, 3] },
    { players: 8, expected: [4, 4] },
    { players: 10, expected: [4, 3, 3] },
    { players: 12, expected: [4, 4, 4] },
    { players: 13, expected: [7, 6] },
    { players: 14, expected: [7, 7] },
    { players: 15, expected: [5, 5, 5] },
    { players: 16, expected: [4, 4, 4, 4] }
];
console.log('\n--- Testing all group generation cases ---');
for (const testCase of testCases) {
    const t = new TournamentManager('test', 'Test', 'cs16');
    for (let i = 1; i <= testCase.players; i++) {
        t.addPlayer(`P${i}`);
    }
    t.startGroupStage();
    const sizes = t.pods.map(pod => pod.players.length).sort((a, b) => b - a);
    const expectedSorted = [...testCase.expected].sort((a, b) => b - a);
    const pass = JSON.stringify(sizes) === JSON.stringify(expectedSorted);
    console.log(`${testCase.players} players: ${sizes.join(', ')} ${pass ? '✓' : '✗ Expected: ' + expectedSorted.join(', ')}`);
}
//# sourceMappingURL=test-groups.js.map