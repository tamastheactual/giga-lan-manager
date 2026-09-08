import { describe, it, expect } from 'vitest';
import { TournamentManager } from './tournament';

// Regression tests for the defects found in the September 2026 review. Each one
// fails against the code as it stood before the fix.

function solo(n: number): TournamentManager {
  const t = new TournamentManager('s', 'S', 'cs16');
  for (let i = 1; i <= n; i++) t.addPlayer(`P${i}`);
  t.startGroupStage();
  return t;
}

function playGroups(t: TournamentManager): void {
  for (const m of t.matches) {
    t.submitMatchResult(m.id, {
      [m.player1Id]: { points: 3, score: 16 },
      [m.player2Id]: { points: 0, score: 10 },
    });
  }
}

function teamTournament(numTeams: number): TournamentManager {
  const t = new TournamentManager('t', 'T', 'cs16', [], undefined, undefined, undefined, true);
  const pids: string[] = [];
  for (let i = 1; i <= numTeams * 3; i++) pids.push(t.addPlayer(`P${i}`).id);
  for (let k = 0; k < numTeams; k++) t.addTeam(`Team ${k + 1}`, pids.slice(k * 3, k * 3 + 3));
  t.startGroupStage();
  return t;
}

describe('3rd-place seeding', () => {
  // The playoff modal submits the series games (which already decide the winner)
  // and THEN calls the winner endpoint. The second pass used to seed the same
  // loser into both bronze slots, and the other semifinal's loser vanished.
  it('team: two different losers reach the 3rd-place match', () => {
    const t = teamTournament(8);
    for (const m of t.teamMatches) t.submitTeamMatchResult(m.id, 16, 10);
    t.generateTeamBrackets();

    for (let guard = 0; guard < 20; guard++) {
      const m = t.teamBracketMatches.find((mm) => mm.team1Id && mm.team2Id && !mm.winnerId);
      if (!m) break;
      t.submitTeamBracketGameResult(m.id, { gameNumber: 1, team1Score: 16, team2Score: 10, winnerTeamId: m.team1Id! });
      t.submitTeamBracketGameResult(m.id, { gameNumber: 2, team1Score: 16, team2Score: 10, winnerTeamId: m.team1Id! });
      t.submitTeamBracketWinner(m.id, m.team1Id!); // the redundant call the UI makes
    }

    const third = t.teamBracketMatches.find((m) => m.bracketType === '3rd-place')!;
    expect(third.team1Id).toBeTruthy();
    expect(third.team2Id).toBeTruthy();
    expect(third.team1Id).not.toBe(third.team2Id);
  });

  it('solo: re-declaring the same winner does not seed the loser twice', () => {
    const t = solo(8);
    playGroups(t);
    t.generateBrackets();
    const sf = t.bracketMatches.find((m) => m.bracketType === 'semifinals' && m.player1Id && m.player2Id)!;
    t.submitBracketWinner(sf.id, sf.player1Id!);
    t.submitBracketWinner(sf.id, sf.player1Id!); // repeat
    const third = t.bracketMatches.find((m) => m.bracketType === '3rd-place')!;
    expect(third.player2Id).toBeUndefined();
  });
});

describe('bracket series are rebuilt, not accumulated', () => {
  it('resubmitting a map replaces it instead of counting it twice', () => {
    const t = solo(8);
    playGroups(t);
    t.generateBrackets();
    const sf = t.bracketMatches.find((m) => m.player1Id && m.player2Id && !m.winnerId)!;
    const game = { gameNumber: 1, player1Score: 10, player2Score: 5, winnerId: sf.player1Id! };
    t.submitBracketGameResult(sf.id, game);
    t.submitBracketGameResult(sf.id, game); // double-click / reopened modal
    expect(sf.games!.length).toBe(1);
    expect(sf.player1Wins).toBe(1);
    expect(sf.winnerId).toBeUndefined(); // one map cannot win a BO3
  });

  it('correcting a map result flips the series score', () => {
    const t = solo(8);
    playGroups(t);
    t.generateBrackets();
    const sf = t.bracketMatches.find((m) => m.player1Id && m.player2Id && !m.winnerId)!;
    t.submitBracketGameResult(sf.id, { gameNumber: 1, player1Score: 10, player2Score: 5, winnerId: sf.player1Id! });
    t.submitBracketGameResult(sf.id, { gameNumber: 1, player1Score: 5, player2Score: 10, winnerId: sf.player2Id! });
    expect(sf.games!.length).toBe(1);
    expect(sf.player1Wins).toBe(0);
    expect(sf.player2Wins).toBe(1);
  });

  it('rejects a map number outside the configured series length', () => {
    const t = solo(8);
    playGroups(t);
    t.generateBrackets();
    const sf = t.bracketMatches.find((m) => m.player1Id && m.player2Id && !m.winnerId)!;
    expect(() =>
      t.submitBracketGameResult(sf.id, { gameNumber: 4, player1Score: 10, player2Score: 5, winnerId: sf.player1Id! }),
    ).toThrow(/between 1 and 3/);
  });

  it('a team series needs the configured number of map wins, not two', () => {
    const t = teamTournament(4);
    for (const m of t.teamMatches) t.submitTeamMatchResult(m.id, 16, 10);
    t.generateTeamBrackets();
    const final = t.teamBracketMatches.find((m) => m.bracketType === 'finals')!;
    t.submitTeamBracketGameResult(final.id, { gameNumber: 1, team1Score: 16, team2Score: 4, winnerTeamId: final.team1Id! });
    expect(final.winnerId).toBeUndefined(); // BO3: one map is not enough
    t.submitTeamBracketGameResult(final.id, { gameNumber: 2, team1Score: 16, team2Score: 4, winnerTeamId: final.team1Id! });
    expect(final.winnerId).toBe(final.team1Id);
  });
});

describe('result validation is enforced by the engine, not just the UI', () => {
  it('rejects group results once the group stage is over', () => {
    const t = solo(8);
    playGroups(t);
    t.generateBrackets();
    const m = t.matches[0];
    expect(() =>
      t.submitMatchResult(m.id, { [m.player1Id]: { points: 0 }, [m.player2Id]: { points: 3 } }),
    ).toThrow(/group stage/);
  });

  it('rejects arbitrary point values', () => {
    const t = solo(4);
    const m = t.matches[0];
    expect(() =>
      t.submitMatchResult(m.id, { [m.player1Id]: { points: 9999 }, [m.player2Id]: { points: 0 } }),
    ).toThrow(/Points must be/);
  });

  it('rejects a result naming a player who was not in the match', () => {
    const t = solo(4);
    const m = t.matches[0];
    const outsider = t.players.find((p) => p.id !== m.player1Id && p.id !== m.player2Id)!;
    expect(() =>
      t.submitMatchResult(m.id, {
        [m.player1Id]: { points: 3 },
        [m.player2Id]: { points: 0 },
        [outsider.id]: { points: 3 },
      }),
    ).toThrow(/exactly the two players/);
  });

  it('rejects a winner who scored fewer rounds than the loser', () => {
    const t = solo(4);
    const m = t.matches[0];
    expect(() =>
      t.submitMatchResult(m.id, {
        [m.player1Id]: { points: 3, score: 4 },
        [m.player2Id]: { points: 0, score: 16 },
      }),
    ).toThrow(/lower score/);
  });

  it('still accepts a legitimate 15-15 draw for a rounds game', () => {
    const t = solo(4);
    const m = t.matches[0];
    expect(() =>
      t.submitMatchResult(m.id, {
        [m.player1Id]: { points: 1, score: 15 },
        [m.player2Id]: { points: 1, score: 15 },
      }),
    ).not.toThrow();
  });

  it('rejects a 0-0 team match instead of scoring it as a draw', () => {
    const t = teamTournament(4);
    expect(() => t.submitTeamMatchResult(t.teamMatches[0].id, 0, 0)).toThrow(/0-0/);
  });
});

describe('map back-fill is stable across restarts', () => {
  it('assigns the same map every time it runs', () => {
    const t = solo(4);
    t.mapPool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    playGroups(t);

    const runs = new Set<string>();
    for (let i = 0; i < 8; i++) {
      t.matches.forEach((m) => (m.mapName = undefined));
      expect(t.fillMissingMaps()).toBe(true);
      runs.add(t.matches.map((m) => m.mapName).join(','));
    }
    expect(runs.size).toBe(1);
    expect(t.fillMissingMaps()).toBe(false); // nothing left to fill
  });
});

describe('team roster integrity', () => {
  it('refuses to roster a player who is already on another team', () => {
    const t = new TournamentManager('r', 'R', 'cs16', [], undefined, undefined, undefined, true);
    const pids: string[] = [];
    for (let i = 1; i <= 6; i++) pids.push(t.addPlayer(`P${i}`).id);
    t.addTeam('A', [pids[0], pids[1]]);
    expect(() => t.addTeam('B', [pids[0], pids[2]])).toThrow(/already on team/);
  });

  it('refuses to list the same player twice on one team', () => {
    const t = new TournamentManager('r', 'R', 'cs16', [], undefined, undefined, undefined, true);
    const pids: string[] = [];
    for (let i = 1; i <= 6; i++) pids.push(t.addPlayer(`P${i}`).id);
    expect(() => t.addTeam('A', [pids[0], pids[0]])).toThrow(/twice/);
  });

  it('removing a player also removes them from their team', () => {
    const t = new TournamentManager('r', 'R', 'cs16', [], undefined, undefined, undefined, true);
    const pids: string[] = [];
    for (let i = 1; i <= 6; i++) pids.push(t.addPlayer(`P${i}`).id);
    t.addTeam('A', [pids[0], pids[1]]);
    t.removePlayer(pids[0]);
    expect(t.teams[0].playerIds).not.toContain(pids[0]);
    expect(t.teams[0].playerIds).toEqual([pids[1]]);
  });
});
