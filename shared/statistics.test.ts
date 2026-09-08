import { describe, it, expect } from 'vitest';
import {
  calculatePlayerScoreStats,
  calculateTeamScoreStats,
  getTournamentPlacement,
  getHeadToHead,
  calculateAdvancedStats,
  getPlayerMatchHistory,
} from './statistics.js';

// These functions used to live inside a 5,328-line Svelte component and had no
// coverage at all. Pinning them here is what makes the extraction safe.

const players = [
  { id: 'a', name: 'Ann' },
  { id: 'b', name: 'Bo' },
  { id: 'c', name: 'Cy' },
  { id: 'd', name: 'Di' },
];

/** Ann beats Bo 16-10 on de_dust2; Cy and Di draw 15-15 on de_nuke. */
const groupMatches = [
  {
    id: 'm1', round: 1, completed: true, mapName: 'de_dust2',
    player1Id: 'a', player2Id: 'b',
    result: { a: { points: 3, score: 16 }, b: { points: 0, score: 10 } },
  },
  {
    id: 'm2', round: 1, completed: true, mapName: 'de_nuke',
    player1Id: 'c', player2Id: 'd',
    result: { c: { points: 1, score: 15 }, d: { points: 1, score: 15 } },
  },
  {
    id: 'm3', round: 2, completed: false,
    player1Id: 'a', player2Id: 'c',
  },
];

/** Ann beats Cy 2-0 in the final. */
const bracketMatches = [
  {
    id: 'f1', bracketType: 'finals', round: 1,
    player1Id: 'a', player2Id: 'c', winnerId: 'a',
    player1Wins: 2, player2Wins: 0,
    games: [
      { gameNumber: 1, mapName: 'de_dust2', player1Score: 10, player2Score: 4, winnerId: 'a' },
      { gameNumber: 2, mapName: 'de_inferno', player1Score: 10, player2Score: 8, winnerId: 'a' },
    ],
  },
  {
    id: 't1', bracketType: '3rd-place', round: 1,
    player1Id: 'b', player2Id: 'd', winnerId: 'd',
    player1Wins: 0, player2Wins: 2,
    games: [
      { gameNumber: 1, mapName: 'de_train', player1Score: 6, player2Score: 10, winnerId: 'd' },
      { gameNumber: 2, mapName: 'de_nuke', player1Score: 9, player2Score: 10, winnerId: 'd' },
    ],
  },
];

describe('calculatePlayerScoreStats', () => {
  const stats = calculatePlayerScoreStats(players, groupMatches, bracketMatches);

  it('gives every player an entry, even one who has not played', () => {
    expect(Object.keys(stats).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sums scores for and against across groups and playoffs', () => {
    // Ann: 16 in groups + 10 + 10 in the final = 36 for, 10 + 4 + 8 = 22 against
    expect(stats.a.scoreWon).toBe(36);
    expect(stats.a.scoreLost).toBe(22);
  });

  it('ignores matches that were never completed', () => {
    // m3 is scheduled but unplayed, so it must not count towards Ann's tally
    expect(stats.a.matchesPlayed).toBe(1 + 2); // one group match + two final maps
  });

  it('records a draw as neither a win nor a loss', () => {
    expect(stats.c.matchesTied).toBe(1);
    expect(stats.c.matchesWon).toBe(0);
    expect(stats.c.matchesLost).toBe(2); // both maps of the final
  });

  it('tracks the single best performance', () => {
    expect(stats.a.bestPerformance).toBe(16);
  });
});

describe('getTournamentPlacement', () => {
  it('places the finals winner first and the runner-up second', () => {
    expect(getTournamentPlacement('a', bracketMatches, 4)).toBe(1);
    expect(getTournamentPlacement('c', bracketMatches, 4)).toBe(2);
  });

  it('places the 3rd-place winner third and its loser fourth', () => {
    expect(getTournamentPlacement('d', bracketMatches, 4)).toBe(3);
    expect(getTournamentPlacement('b', bracketMatches, 4)).toBe(4);
  });
});

describe('getHeadToHead', () => {
  it('counts group and playoff meetings from the first player\'s side', () => {
    // Ann v Cy: never met in groups (m3 unplayed), 2-0 in the final
    expect(getHeadToHead('a', 'c', groupMatches, bracketMatches)).toEqual({ wins: 2, losses: 0, ties: 0 });
    expect(getHeadToHead('c', 'a', groupMatches, bracketMatches)).toEqual({ wins: 0, losses: 2, ties: 0 });
  });

  it('counts a drawn group match as a tie for both sides', () => {
    expect(getHeadToHead('c', 'd', groupMatches, [])).toEqual({ wins: 0, losses: 0, ties: 1 });
  });

  it('returns an empty record for players who never met', () => {
    expect(getHeadToHead('a', 'd', groupMatches, bracketMatches)).toEqual({ wins: 0, losses: 0, ties: 0 });
  });
});

describe('calculateAdvancedStats', () => {
  const stats = calculateAdvancedStats(players, groupMatches, bracketMatches);

  it('survives a missing player list instead of throwing', () => {
    expect(() => calculateAdvancedStats(null as any, [], [])).not.toThrow();
  });

  it('tracks per-map wins and appearances', () => {
    // Ann played de_dust2 twice (a group match and final map 1) and won both
    expect(stats.mapPerformance.a['de_dust2']).toEqual({ wins: 2, total: 2 });
  });

  it('ranks the most dominant victory first', () => {
    expect(stats.mostDominant.margin).toBe(
      Math.max(...stats.mostDominantList.map((m) => m.margin)),
    );
    expect(stats.mostDominantList[0].margin).toBeGreaterThanOrEqual(
      stats.mostDominantList[stats.mostDominantList.length - 1].margin,
    );
  });

  it('records close maps as clutch wins for the winner and losses for the loser', () => {
    // Di won final-map-2 of the bronze match 10-9: a one-round margin
    expect(stats.clutchFactors.d.closeWins).toBeGreaterThan(0);
    expect(stats.clutchFactors.b.closeLosses).toBeGreaterThan(0);
  });

  it('orders closest matches by margin, narrowest first', () => {
    const margins = stats.closestMatches.map((m) => m.margin);
    expect([...margins].sort((x, y) => x - y)).toEqual(margins);
  });

  it('includes playoff maps in the consistency score, not just group matches', () => {
    // Cy scored 15 (group), then 4 and 8 in the final. Counting only the group
    // match gives a spread of zero and a perfect 100 -- which is what this did
    // before playoff maps were re-attached to their parent match.
    expect(stats.consistencyScores.c).toBeGreaterThanOrEqual(0);
    expect(stats.consistencyScores.c).toBeLessThan(100);

    // A player with identical scores everywhere is still perfectly consistent.
    const steady = calculateAdvancedStats(
      [{ id: 'z', name: 'Zoe' }],
      [{ id: 'g', completed: true, player1Id: 'z', player2Id: 'y', result: { z: { score: 10 }, y: { score: 3 } } }],
      [{ id: 'p', player1Id: 'z', player2Id: 'y', winnerId: 'z', games: [{ gameNumber: 1, player1Score: 10, player2Score: 3, winnerId: 'z' }] }],
    );
    expect(steady.consistencyScores.z).toBe(100);
  });
});

describe('getPlayerMatchHistory', () => {
  const history = getPlayerMatchHistory('a', players, groupMatches, bracketMatches);

  it('lists the group match and each playoff map separately', () => {
    expect(history).toHaveLength(3);
    expect(history.filter((h) => h.stage === 'Groups')).toHaveLength(1);
    expect(history.filter((h) => h.stage === 'Playoffs')).toHaveLength(2);
  });

  it('reports scores from the requested player\'s side', () => {
    const group = history.find((h) => h.stage === 'Groups')!;
    expect(group.playerScore).toBe(16);
    expect(group.opponentScore).toBe(10);
    expect(group.opponent).toBe('Bo');
    expect(group.result).toBe('win');
  });

  it('flips the perspective for the other player', () => {
    const bo = getPlayerMatchHistory('b', players, groupMatches, bracketMatches);
    const group = bo.find((h) => h.stage === 'Groups')!;
    expect(group.playerScore).toBe(10);
    expect(group.result).toBe('loss');
  });

  it('skips unplayed 0-0 maps in a series', () => {
    const withEmptyMap = [{
      ...bracketMatches[0],
      games: [
        ...bracketMatches[0].games,
        { gameNumber: 3, mapName: 'de_cache', player1Score: 0, player2Score: 0, winnerId: undefined },
      ],
    }];
    const h = getPlayerMatchHistory('a', players, [], withEmptyMap);
    expect(h).toHaveLength(2); // the unplayed third map is not a loss
  });
});

describe('calculateTeamScoreStats', () => {
  const teams = [
    { id: 't1', name: 'Alpha', playerIds: ['a', 'b'], points: 0, matchesPlayed: 0, wins: 0, draws: 0, losses: 0, roundsWon: 0, roundsLost: 0 },
    { id: 't2', name: 'Beta', playerIds: ['c', 'd'], points: 0, matchesPlayed: 0, wins: 0, draws: 0, losses: 0, roundsWon: 0, roundsLost: 0 },
  ];
  const teamMatches = [
    { id: 'tm1', completed: true, team1Id: 't1', team2Id: 't2', team1Score: 16, team2Score: 9, winnerId: 't1' },
  ];

  it('records rounds for and against on both sides of a match', () => {
    const stats = calculateTeamScoreStats(teams, teamMatches, []);
    expect(stats.t1.roundsWon).toBe(16);
    expect(stats.t1.roundsLost).toBe(9);
    expect(stats.t2.roundsWon).toBe(9);
    expect(stats.t2.roundsLost).toBe(16);
    expect(stats.t1.matchesWon).toBe(1);
    expect(stats.t2.matchesLost).toBe(1);
  });

  it('gives an unplayed team a zeroed entry rather than omitting it', () => {
    const stats = calculateTeamScoreStats(teams, [], []);
    expect(stats.t2).toEqual({
      roundsWon: 0, roundsLost: 0, matchesPlayed: 0,
      matchesWon: 0, matchesLost: 0, mapsWon: 0, mapsLost: 0,
    });
  });
});
