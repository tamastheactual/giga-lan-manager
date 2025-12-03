import { TournamentManager } from './tournament';

// Test: 4 players, 3 with equal points (2W-1L each = 6pts), 1 with 0 wins
const tm = new TournamentManager('test', 'Tiebreaker Test');

// Add 4 players
const p1 = tm.addPlayer('Alice');
const p2 = tm.addPlayer('Bob');
const p3 = tm.addPlayer('Charlie');
const p4 = tm.addPlayer('Dave');

tm.startGroupStage();

console.log('=== Group Setup ===');
console.log('Players:', tm.players.map(p => p.name));
console.log('Matches:', tm.matches.length);

// Simulate results to create the tie scenario:
// Alice beats Bob (3-0)
// Bob beats Charlie (3-0)
// Charlie beats Alice (3-0) 
// Dave loses to all (0-3 each)

const matches = tm.matches;
console.log('\n=== Match Assignments ===');
matches.forEach((m, i) => {
  const p1Name = tm.players.find(p => p.id === m.player1Id)?.name;
  const p2Name = tm.players.find(p => p.id === m.player2Id)?.name;
  console.log(`Match ${i+1}: ${p1Name} vs ${p2Name}`);
});

// Submit specific results to create the 3-way tie
matches.forEach(match => {
  const p1Name = tm.players.find(p => p.id === match.player1Id)?.name;
  const p2Name = tm.players.find(p => p.id === match.player2Id)?.name;
  
  let winnerId: string;
  let loserId: string;
  
  // Create the circular tie: Alice > Bob > Charlie > Alice
  // Everyone beats Dave
  if (p1Name === 'Dave' || p2Name === 'Dave') {
    // Dave always loses
    winnerId = p1Name === 'Dave' ? match.player2Id : match.player1Id;
    loserId = p1Name === 'Dave' ? match.player1Id : match.player2Id;
  } else if ((p1Name === 'Alice' && p2Name === 'Bob') || (p1Name === 'Bob' && p2Name === 'Alice')) {
    // Alice beats Bob
    winnerId = tm.players.find(p => p.name === 'Alice')!.id;
    loserId = tm.players.find(p => p.name === 'Bob')!.id;
  } else if ((p1Name === 'Bob' && p2Name === 'Charlie') || (p1Name === 'Charlie' && p2Name === 'Bob')) {
    // Bob beats Charlie
    winnerId = tm.players.find(p => p.name === 'Bob')!.id;
    loserId = tm.players.find(p => p.name === 'Charlie')!.id;
  } else if ((p1Name === 'Charlie' && p2Name === 'Alice') || (p1Name === 'Alice' && p2Name === 'Charlie')) {
    // Charlie beats Alice
    winnerId = tm.players.find(p => p.name === 'Charlie')!.id;
    loserId = tm.players.find(p => p.name === 'Alice')!.id;
  } else {
    console.log('Unexpected match:', p1Name, 'vs', p2Name);
    return;
  }
  
  tm.submitMatchResult(match.id, {
    [winnerId]: { points: 3 },
    [loserId]: { points: 0 }
  });
});

console.log('\n=== Final Standings ===');
const rankings = tm.getRankings();
rankings.forEach((p, i) => {
  console.log(`${i+1}. ${p.name}: ${p.points}pts (W${p.wins} D${p.draws} L${p.losses})`);
});

console.log('\n=== Problem Analysis ===');
const tied = rankings.filter(p => p.points === 6);
console.log(`Players tied at 6 points: ${tied.map(p => p.name).join(', ')}`);
console.log('Tiebreaker order: 1) Head-to-head, 2) More wins, 3) Fewer losses, 4) Score diff, 5) Alphabetical');
console.log('\nIn a 3-way circular tie (A>B>C>A), head-to-head cannot break the tie,');
console.log('so it falls to alphabetical order as the final deterministic tiebreaker.');

// Run multiple times to show ranking stability
console.log('\n=== Running 5 more times to show ranking STABILITY ===');
for (let run = 1; run <= 5; run++) {
  const tm2 = new TournamentManager('test' + run, 'Test ' + run);
  tm2.addPlayer('Alice');
  tm2.addPlayer('Bob');
  tm2.addPlayer('Charlie');
  tm2.addPlayer('Dave');
  tm2.startGroupStage();
  
  // Same results
  tm2.matches.forEach(match => {
    const p1Name = tm2.players.find(p => p.id === match.player1Id)?.name;
    const p2Name = tm2.players.find(p => p.id === match.player2Id)?.name;
    
    let winnerId: string;
    let loserId: string;
    
    if (p1Name === 'Dave' || p2Name === 'Dave') {
      winnerId = p1Name === 'Dave' ? match.player2Id : match.player1Id;
      loserId = p1Name === 'Dave' ? match.player1Id : match.player2Id;
    } else if ((p1Name === 'Alice' && p2Name === 'Bob') || (p1Name === 'Bob' && p2Name === 'Alice')) {
      winnerId = tm2.players.find(p => p.name === 'Alice')!.id;
      loserId = tm2.players.find(p => p.name === 'Bob')!.id;
    } else if ((p1Name === 'Bob' && p2Name === 'Charlie') || (p1Name === 'Charlie' && p2Name === 'Bob')) {
      winnerId = tm2.players.find(p => p.name === 'Bob')!.id;
      loserId = tm2.players.find(p => p.name === 'Charlie')!.id;
    } else if ((p1Name === 'Charlie' && p2Name === 'Alice') || (p1Name === 'Alice' && p2Name === 'Charlie')) {
      winnerId = tm2.players.find(p => p.name === 'Charlie')!.id;
      loserId = tm2.players.find(p => p.name === 'Alice')!.id;
    } else {
      return;
    }
    
    tm2.submitMatchResult(match.id, {
      [winnerId]: { points: 3 },
      [loserId]: { points: 0 }
    });
  });
  
  const r = tm2.getRankings();
  console.log(`Run ${run}: ${r.slice(0, 3).map(p => p.name).join(', ')}`);
}

// Test 2: Head-to-head tiebreaker working (2-way tie)
console.log('\n\n========================================');
console.log('=== TEST 2: Head-to-Head Tiebreaker ===');
console.log('========================================\n');

const tm3 = new TournamentManager('h2h-test', 'H2H Test');
tm3.addPlayer('Zack');  // Will have 6 pts but lost to Yolanda
tm3.addPlayer('Yolanda'); // Will have 6 pts and beat Zack
tm3.addPlayer('Xavier');
tm3.addPlayer('Wendy');

tm3.startGroupStage();

// Create scenario: Zack and Yolanda both get 6 pts (2W-1L), but Yolanda beat Zack directly
// Yolanda: beats Zack, beats Xavier, loses to Wendy = 6 pts
// Zack: loses to Yolanda, beats Xavier, beats Wendy = 6 pts
// Xavier: loses to both, beats Wendy = 3 pts  
// Wendy: loses to Zack, loses to Xavier, beats Yolanda = 3 pts

tm3.matches.forEach(match => {
  const p1Name = tm3.players.find(p => p.id === match.player1Id)?.name;
  const p2Name = tm3.players.find(p => p.id === match.player2Id)?.name;
  
  let winnerId: string;
  let loserId: string;
  
  const getPlayerId = (name: string) => tm3.players.find(p => p.name === name)!.id;
  
  // Determine winner based on our scenario
  const matchup = [p1Name, p2Name].sort().join('-');
  
  switch(matchup) {
    case 'Yolanda-Zack':
      winnerId = getPlayerId('Yolanda');
      loserId = getPlayerId('Zack');
      break;
    case 'Xavier-Yolanda':
      winnerId = getPlayerId('Yolanda');
      loserId = getPlayerId('Xavier');
      break;
    case 'Wendy-Yolanda':
      winnerId = getPlayerId('Wendy'); // Wendy upsets Yolanda!
      loserId = getPlayerId('Yolanda');
      break;
    case 'Xavier-Zack':
      winnerId = getPlayerId('Zack');
      loserId = getPlayerId('Xavier');
      break;
    case 'Wendy-Zack':
      winnerId = getPlayerId('Zack');
      loserId = getPlayerId('Wendy');
      break;
    case 'Wendy-Xavier':
      winnerId = getPlayerId('Xavier');
      loserId = getPlayerId('Wendy');
      break;
    default:
      console.log('Unexpected matchup:', matchup);
      return;
  }
  
  tm3.submitMatchResult(match.id, {
    [winnerId]: { points: 3 },
    [loserId]: { points: 0 }
  });
});

console.log('Scenario: Yolanda and Zack both have 6 points (2W-1L)');
console.log('But Yolanda beat Zack in their direct match');
console.log('\n=== Final Standings ===');
const rankings3 = tm3.getRankings();
rankings3.forEach((p, i) => {
  console.log(`${i+1}. ${p.name}: ${p.points}pts (W${p.wins} D${p.draws} L${p.losses})`);
});

const yolanda = rankings3.find(p => p.name === 'Yolanda')!;
const zack = rankings3.find(p => p.name === 'Zack')!;
const yolandaRank = rankings3.indexOf(yolanda) + 1;
const zackRank = rankings3.indexOf(zack) + 1;

console.log('\n=== Head-to-Head Tiebreaker Result ===');
if (yolanda.points === zack.points) {
  console.log(`Both have ${yolanda.points} points - TIE!`);
  if (yolandaRank < zackRank) {
    console.log('✅ SUCCESS: Yolanda ranks higher than Zack (beat him in H2H)');
  } else {
    console.log('❌ FAIL: Zack should not rank higher than Yolanda');
  }
} else {
  console.log('Not a tie scenario - different points');
}
