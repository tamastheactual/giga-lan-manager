import { describe, it, expect } from 'vitest';
import { TournamentManager } from './tournament';

/**
 * Characterization tests for the tournament engine.
 *
 * These lock the engine's CURRENT behavior so any refactor (e.g. splitting the
 * god-files) is caught the moment it changes an observable output. Some
 * assertions document the status quo rather than the ideal -- a 4-player single
 * group goes straight to a final instead of playing semifinals, and 13 players
 * gets a BYE up to two groups of 7. Those are deliberate, not oversights.
 *
 * Defect fixes live alongside them in fixes.test.ts.
 *
 * They replace six console.log scripts that never asserted anything (always
 * exited 0), re-implemented the code they "tested", or hard-coded stale values.
 */

// ---------- helpers ----------
function soloTournament(numPlayers: number): TournamentManager {
  const t = new TournamentManager('c', 'C', 'cs16');
  for (let i = 1; i <= numPlayers; i++) t.addPlayer(`P${i}`);
  t.startGroupStage();
  return t;
}

// Play every group match; the higher-seeded player (later in the pod) wins.
function playGroups(t: TournamentManager): void {
  for (const pod of t.pods) {
    const gp = pod.players;
    for (const m of t.matches.filter((mm) => mm.podId === pod.id)) {
      const p1Wins = gp.indexOf(m.player1Id) > gp.indexOf(m.player2Id);
      t.submitMatchResult(m.id, {
        [m.player1Id]: { points: p1Wins ? 3 : 0 },
        [m.player2Id]: { points: p1Wins ? 0 : 3 },
      });
    }
  }
}

function bracketBreakdown(matches: { bracketType: string; player1Id?: string; player2Id?: string }[]) {
  const types: Record<string, number> = {};
  const players = new Set<string>();
  for (const m of matches) {
    types[m.bracketType] = (types[m.bracketType] || 0) + 1;
    if (m.player1Id) players.add(m.player1Id);
    if (m.player2Id) players.add(m.player2Id);
  }
  return { types, players: players.size, total: matches.length };
}

// Advance a single-elimination bracket to completion by always picking slot 1.
// `slots` extracts the two participant ids (player1/2 for solo, team1/2 for team).
function advance(
  all: () => { id: string; winnerId?: string }[],
  slots: (m: any) => [string | undefined, string | undefined],
  submit: (id: string, winnerId: string) => void,
) {
  for (let guard = 0; guard < 50; guard++) {
    const next = all().find((m) => {
      const [a, b] = slots(m);
      return a && b && !m.winnerId;
    });
    if (!next) break;
    submit(next.id, slots(next)[0]!);
  }
}

// ---------- group stage ----------
describe('group stage — pod sizes (characterization)', () => {
  const expected: Record<number, number[]> = {
    4: [4], 5: [5], 6: [3, 3], 7: [7], 8: [4, 4], 9: [3, 3, 3], 10: [5, 5],
    11: [4, 4, 4], 12: [4, 4, 4], 13: [7, 7], 14: [7, 7], 15: [5, 5, 5], 16: [4, 4, 4, 4],
  };
  for (const [n, sizes] of Object.entries(expected)) {
    it(`${n} players → pods ${JSON.stringify(sizes)}`, () => {
      const t = soloTournament(Number(n));
      expect(t.pods.map((p) => p.players.length).sort((a, b) => b - a)).toEqual(sizes);
    });
  }
});

describe('group stage — round-robin completeness (invariant)', () => {
  for (const n of [4, 6, 8, 9, 12, 16]) {
    it(`${n} players: each player faces every group-mate exactly once`, () => {
      const t = soloTournament(n);
      for (const pod of t.pods) {
        const groupMatches = t.matches.filter((m) => m.podId === pod.id);
        expect(groupMatches.length).toBe((pod.players.length * (pod.players.length - 1)) / 2);
        for (const pid of pod.players) {
          const opponents = new Set<string>();
          for (const m of groupMatches) {
            if (m.player1Id === pid) opponents.add(m.player2Id);
            else if (m.player2Id === pid) opponents.add(m.player1Id);
          }
          expect(opponents.has(pid)).toBe(false);
          expect(opponents.size).toBe(pod.players.length - 1);
        }
      }
    });
  }
});

// ---------- playoffs ----------
describe('playoffs — bracket structure (characterization)', () => {
  const expected: Record<number, { players: number; types: Record<string, number>; total: number }> = {
    4:  { players: 4, types: { finals: 1, '3rd-place': 1 }, total: 2 },
    6:  { players: 4, types: { semifinals: 2, finals: 1, '3rd-place': 1 }, total: 4 },
    7:  { players: 4, types: { semifinals: 2, finals: 1, '3rd-place': 1 }, total: 4 },
    8:  { players: 4, types: { semifinals: 2, finals: 1, '3rd-place': 1 }, total: 4 },
    9:  { players: 6, types: { quarterfinals: 2, semifinals: 2, finals: 1, '3rd-place': 1 }, total: 6 },
    12: { players: 6, types: { quarterfinals: 2, semifinals: 2, finals: 1, '3rd-place': 1 }, total: 6 },
    16: { players: 8, types: { quarterfinals: 4, semifinals: 2, finals: 1, '3rd-place': 1 }, total: 8 },
  };
  for (const [n, exp] of Object.entries(expected)) {
    it(`${n} players → ${exp.players} playoff players in ${exp.total} matches`, () => {
      const t = soloTournament(Number(n));
      playGroups(t);
      t.generateBrackets();
      const b = bracketBreakdown(t.bracketMatches);
      expect(b.total).toBe(exp.total);
      expect(b.players).toBe(exp.players);
      expect(b.types).toEqual(exp.types);
    });
  }
});

describe('playoffs — end to end produces a champion', () => {
  it('an 8-player tournament plays to completion', () => {
    const t = soloTournament(8);
    playGroups(t);
    t.generateBrackets();
    advance(() => t.bracketMatches, (m) => [m.player1Id, m.player2Id], (id, w) => t.submitBracketWinner(id, w));
    expect(t.state).toBe('completed');
    expect(t.getChampion()).not.toBeNull();
  });
});

// ---------- standings & tiebreakers ----------
describe('standings & tiebreakers', () => {
  it('awards 3 points and a win for a decided match', () => {
    const t = soloTournament(4);
    const m = t.matches[0];
    t.submitMatchResult(m.id, { [m.player1Id]: { points: 3 }, [m.player2Id]: { points: 0 } });
    const p1 = t.players.find((p) => p.id === m.player1Id)!;
    expect(p1.points).toBe(3);
    expect(p1.wins).toBe(1);
  });

  // Build a 4-player single group with an explicit result table.
  function fourPlayerGroup(names: string[], wins: [string, string][]): TournamentManager {
    const t = new TournamentManager('tb', 'TB');
    names.forEach((n) => t.addPlayer(n));
    t.startGroupStage();
    const id = (name: string) => t.players.find((p) => p.name === name)!.id;
    for (const [winner, loser] of wins) {
      const m = t.matches.find((mm) =>
        (mm.player1Id === id(winner) && mm.player2Id === id(loser)) ||
        (mm.player1Id === id(loser) && mm.player2Id === id(winner)))!;
      t.submitMatchResult(m.id, { [id(winner)]: { points: 3 }, [id(loser)]: { points: 0 } });
    }
    return t;
  }

  it('head-to-head breaks a 2-way tie (the winner ranks higher)', () => {
    // Yolanda & Zack both finish 2W-1L; Yolanda beat Zack head-to-head.
    const t = fourPlayerGroup(['Zack', 'Yolanda', 'Xavier', 'Wendy'], [
      ['Yolanda', 'Zack'], ['Yolanda', 'Xavier'], ['Wendy', 'Yolanda'],
      ['Zack', 'Xavier'], ['Zack', 'Wendy'], ['Xavier', 'Wendy'],
    ]);
    const r = t.getRankings();
    const yolanda = r.findIndex((p) => p.name === 'Yolanda');
    const zack = r.findIndex((p) => p.name === 'Zack');
    expect(r[yolanda].points).toBe(r[zack].points);
    expect(yolanda).toBeLessThan(zack);
  });

  it('resolves a 3-way circular tie deterministically and stably', () => {
    // Alice>Bob>Charlie>Alice; all three beat Dave.
    const order = () => fourPlayerGroup(['Alice', 'Bob', 'Charlie', 'Dave'], [
      ['Alice', 'Bob'], ['Bob', 'Charlie'], ['Charlie', 'Alice'],
      ['Alice', 'Dave'], ['Bob', 'Dave'], ['Charlie', 'Dave'],
    ]).getRankings().map((p) => p.name);
    const first = order();
    expect(first[3]).toBe('Dave');
    expect(order()).toEqual(first);
    expect(order()).toEqual(first);
  });
});

// ---------- team mode (previously ZERO coverage) ----------
describe('team mode', () => {
  function teamTournament(numTeams: number): TournamentManager {
    const t = new TournamentManager('t', 'T', 'cs16', [], undefined, undefined, undefined, true);
    const pids: string[] = [];
    for (let i = 1; i <= numTeams * 3; i++) pids.push(t.addPlayer(`P${i}`).id);
    for (let k = 0; k < numTeams; k++) t.addTeam(`Team ${k + 1}`, pids.slice(k * 3, k * 3 + 3));
    t.startGroupStage();
    return t;
  }

  it('constructs a team tournament (schema v2)', () => {
    const t = teamTournament(4);
    expect(t.isTeamBased).toBe(true);
    expect(t._schemaVersion).toBe(2);
  });

  it.each([
    { teams: 4, pods: [4], matches: 6 },
    { teams: 6, pods: [6], matches: 15 },
    { teams: 8, pods: [4, 4], matches: 12 },
  ])('$teams teams → pods $pods, $matches round-robin matches', ({ teams, pods, matches }) => {
    const t = teamTournament(teams);
    expect(t.teamPods.map((p) => p.teams.length).sort((a, b) => b - a)).toEqual(pods);
    expect(t.teamMatches.length).toBe(matches);
  });

  it('ranks teams, builds a bracket, and plays to a champion', () => {
    const t = teamTournament(4);
    for (const m of t.teamMatches) t.submitTeamMatchResult(m.id, 16, 10); // team1 wins each
    const ranks = t.getTeamRankings();
    expect(ranks.length).toBe(4);
    expect(ranks.reduce((s, x) => s + x.points, 0)).toBe(18); // 6 matches × 3 pts
    for (let i = 1; i < ranks.length; i++) expect(ranks[i - 1].points).toBeGreaterThanOrEqual(ranks[i].points);

    t.generateTeamBrackets();
    expect(bracketBreakdown(t.teamBracketMatches).types).toEqual({ finals: 1, '3rd-place': 1 });
    advance(() => t.teamBracketMatches, (m) => [m.team1Id, m.team2Id], (id, w) => t.submitTeamBracketWinner(id, w));
    expect(t.state).toBe('completed');
    expect(t.getChampionTeam()).not.toBeNull();
  });
});

// ---------- correctness fixes (behavior intentionally changed vs the old code) ----------
describe('phase guards & idempotency (fixes)', () => {
  it('re-submitting a match result is idempotent (no double-counting)', () => {
    const t = soloTournament(4);
    const m = t.matches[0];
    const result = { [m.player1Id]: { points: 3 }, [m.player2Id]: { points: 0 } };
    t.submitMatchResult(m.id, result);
    t.submitMatchResult(m.id, result); // resubmit (double-click / retry)
    t.submitMatchResult(m.id, result); // and again
    const p1 = t.players.find((p) => p.id === m.player1Id)!;
    expect(p1.points).toBe(3);
    expect(p1.wins).toBe(1);
    expect(p1.matchesPlayed).toBe(1);
  });

  it('editing a match result recomputes rather than accumulating', () => {
    const t = soloTournament(4);
    const m = t.matches[0];
    t.submitMatchResult(m.id, { [m.player1Id]: { points: 3 }, [m.player2Id]: { points: 0 } });
    // Correct a mistake: the other player actually won.
    t.submitMatchResult(m.id, { [m.player1Id]: { points: 0 }, [m.player2Id]: { points: 3 } });
    const p1 = t.players.find((p) => p.id === m.player1Id)!;
    const p2 = t.players.find((p) => p.id === m.player2Id)!;
    expect([p1.points, p1.wins, p1.losses]).toEqual([0, 0, 1]);
    expect([p2.points, p2.wins, p2.losses]).toEqual([3, 1, 0]);
  });

  it('startGroupStage cannot run twice', () => {
    const t = soloTournament(4); // already started
    expect(() => t.startGroupStage()).toThrow();
  });

  it('generateBrackets cannot run outside the group stage', () => {
    const t = soloTournament(8);
    playGroups(t);
    t.generateBrackets(); // ok: group -> playoffs
    expect(() => t.generateBrackets()).toThrow(); // second call: state is 'playoffs'
  });

  it('team brackets cannot be generated twice, and the team stage cannot restart', () => {
    const t = new TournamentManager('tg', 'TG', 'cs16', [], undefined, undefined, undefined, true);
    const pids: string[] = [];
    for (let i = 1; i <= 12; i++) pids.push(t.addPlayer(`P${i}`).id);
    for (let k = 0; k < 4; k++) t.addTeam(`Team ${k + 1}`, pids.slice(k * 3, k * 3 + 3));
    t.startGroupStage();
    for (const m of t.teamMatches) t.submitTeamMatchResult(m.id, 16, 10);
    t.generateTeamBrackets();
    expect(() => t.generateTeamBrackets()).toThrow();
    expect(() => t.startGroupStage()).toThrow();
  });
});

// ---------- qualification is per-group, not a global top-N ----------
describe('playoff qualification (top-K per group)', () => {
  it('advances exactly the per-group count from each pod (12 players -> 2 per pod)', () => {
    const t = soloTournament(12); // 3 pods of 4
    playGroups(t);
    t.generateBrackets();
    const qualified = new Set<string>();
    for (const m of t.bracketMatches) {
      if (m.player1Id) qualified.add(m.player1Id);
      if (m.player2Id) qualified.add(m.player2Id);
    }
    for (const pod of t.pods) {
      expect(pod.players.filter((pid) => qualified.has(pid)).length).toBe(2);
    }
  });
});

// ---------- reset & registration guard (fixes) ----------
describe('reset & registration guard (fixes)', () => {
  it('reset() clears BOTH solo and team data and returns to registration', () => {
    const t = new TournamentManager('r', 'R', 'cs16', [], undefined, undefined, undefined, true);
    const pids: string[] = [];
    for (let i = 1; i <= 12; i++) pids.push(t.addPlayer(`P${i}`).id);
    for (let k = 0; k < 4; k++) t.addTeam(`Team ${k + 1}`, pids.slice(k * 3, k * 3 + 3));
    t.startGroupStage();
    for (const m of t.teamMatches) t.submitTeamMatchResult(m.id, 16, 10);
    t.generateTeamBrackets();

    t.reset();
    expect(t.state).toBe('registration');
    const allArrays = [t.players, t.teams, t.teamMatches, t.teamBracketMatches, t.teamPods, t.pods, t.matches, t.bracketMatches];
    expect(allArrays.every((arr) => arr.length === 0)).toBe(true);
  });

  it('addPlayer is rejected once the group stage has started', () => {
    const t = soloTournament(4); // already started
    expect(() => t.addPlayer('Latecomer')).toThrow();
  });
});

// ---------- image upload validation (fix #10) ----------
describe('image upload validation', () => {
  it('accepts asset paths and small data URLs, rejects oversized/non-image blobs', () => {
    const t = soloTournament(4);
    const pid = t.players[0].id;
    expect(() => t.updatePlayerPhoto(pid, '/players/Cat.jpg')).not.toThrow();
    expect(() => t.updatePlayerPhoto(pid, 'data:image/png;base64,AAAA')).not.toThrow();
    expect(() => t.updatePlayerPhoto(pid, 'data:text/html;base64,AAAA')).toThrow();
    const huge = 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024); // ~3 MB > 2 MB cap
    expect(() => t.updatePlayerPhoto(pid, huge)).toThrow();
  });
});

// ---------- Rainbow Six Siege (team game) ----------
describe('Rainbow Six Siege', () => {
  it('runs as a 5v5 team tournament to a champion', () => {
    const t = new TournamentManager('r6', 'R6 Cup', 'r6siege', [], undefined, undefined, undefined, true);
    expect(t.isTeamBased).toBe(true);
    const pids: string[] = [];
    for (let i = 1; i <= 12; i++) pids.push(t.addPlayer(`P${i}`).id);
    for (let k = 0; k < 4; k++) t.addTeam(`Team ${k + 1}`, pids.slice(k * 3, k * 3 + 3));
    t.startGroupStage();
    expect(t.teamMatches.length).toBe(6); // 4-team round robin
    for (const m of t.teamMatches) t.submitTeamMatchResult(m.id, 7, 5); // MR12: first to 7
    t.generateTeamBrackets();
    advance(() => t.teamBracketMatches, (m) => [m.team1Id, m.team2Id], (id, w) => t.submitTeamBracketWinner(id, w));
    expect(t.getChampionTeam()).not.toBeNull();
  });
});
