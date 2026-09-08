// Result validation, shared by the server (server/**, via ../shared/*.js) and the
// client (src/**, via the $shared alias).
//
// These rules previously lived ONLY in the Svelte components, so the API happily
// accepted a 9999-point win, a result for a player who was not in the match, and
// a 0-0 team match that the standings then scored as a draw. The archetype
// config already describes each game's scoring, so the rules are derived from it
// rather than restated per game.

import { getArchetypeConfig, type ScoreArchetype } from './gameArchetypes.js';

export const WIN_POINTS = 3;
export const DRAW_POINTS = 1;
export const LOSS_POINTS = 0;

const VALID_POINTS: number[] = [LOSS_POINTS, DRAW_POINTS, WIN_POINTS];

export interface SubmittedResult {
    points: number;
    score?: number;
    rank?: number;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validate a 1v1 group-stage result. `participants` are the two player ids the
 * match was actually scheduled for. Throws with a message fit to show a user.
 */
export function validateMatchResult(
    results: Record<string, SubmittedResult> | undefined | null,
    participants: [string, string],
    archetype: ScoreArchetype,
): void {
    if (!results || typeof results !== 'object') {
        throw new Error('A match result is required');
    }

    const [p1, p2] = participants;
    const keys = Object.keys(results);
    if (keys.length !== 2 || !keys.includes(p1) || !keys.includes(p2)) {
        throw new Error('Result must name exactly the two players in this match');
    }

    const cfg = getArchetypeConfig(archetype);

    for (const id of keys) {
        const r = results[id];
        if (!r || !isFiniteNumber(r.points)) {
            throw new Error('Each player needs a points value');
        }
        if (!VALID_POINTS.includes(r.points)) {
            throw new Error(`Points must be ${WIN_POINTS} (win), ${DRAW_POINTS} (draw) or ${LOSS_POINTS} (loss)`);
        }
        if (r.score !== undefined) {
            if (!isFiniteNumber(r.score)) throw new Error('Score must be a number');
            // Only deathmatch scoring goes negative -- a suicide costs a frag.
            if (r.score < 0 && archetype !== 'kills') throw new Error('Score cannot be negative');
        }
    }

    const a = results[p1].points;
    const b = results[p2].points;
    const isDraw = a === DRAW_POINTS && b === DRAW_POINTS;
    const isDecided =
        (a === WIN_POINTS && b === LOSS_POINTS) || (a === LOSS_POINTS && b === WIN_POINTS);

    if (!isDraw && !isDecided) {
        throw new Error('A match must be a win for one player or a draw for both');
    }
    if (isDraw && !cfg.tiesPossible) {
        throw new Error(`${cfg.name} matches cannot end in a draw`);
    }

    // Where the loser records a real score, it has to agree with who won.
    const sa = results[p1].score;
    const sb = results[p2].score;
    if (cfg.loserHasScore && isFiniteNumber(sa) && isFiniteNumber(sb)) {
        if (a === WIN_POINTS && sa < sb) throw new Error('The winner cannot have the lower score');
        if (b === WIN_POINTS && sb < sa) throw new Error('The winner cannot have the lower score');
        if (isDraw && sa !== sb) throw new Error('A drawn match must have equal scores');
    }
}

/** Validate a team group-stage result. */
export function validateTeamMatchResult(
    team1Score: number,
    team2Score: number,
    archetype: ScoreArchetype,
): void {
    if (!isFiniteNumber(team1Score) || !isFiniteNumber(team2Score)) {
        throw new Error('Both team scores are required');
    }
    if (!Number.isInteger(team1Score) || !Number.isInteger(team2Score)) {
        throw new Error('Team scores must be whole numbers');
    }
    if (team1Score < 0 || team2Score < 0) {
        throw new Error('Team scores cannot be negative');
    }
    if (team1Score === 0 && team2Score === 0) {
        // Stored as completed-with-no-winner, which the standings then score as a
        // draw worth a point to each side -- never what an unplayed match means.
        throw new Error('A team match cannot be recorded as 0-0');
    }
    if (team1Score === team2Score && !getArchetypeConfig(archetype).tiesPossible) {
        throw new Error('This game cannot end in a draw');
    }
}
