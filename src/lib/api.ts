// Relative base so every LAN client talks to the origin that served the app:
// in dev, Vite proxies /api -> the API server; in prod, Express serves both the
// SPA and /api from the same origin. (A hardcoded host broke all non-host clients.)
const API_URL = '/api';

import { getArchetypeConfig } from '$shared/gameArchetypes';
import { getEffectiveArchetype, type GameType, type GameConfig } from '$shared/gameTypes';
import { normalizeCode } from '$shared/access';
import type { Team, PlayerGameStats, TeamGameResult, TeamMatch, TeamPod, TeamBracketMatch } from '$shared/types';

// Game types, configs, and pure helpers are the shared single source of truth,
// re-exported so existing `$lib/api` imports keep working unchanged.
export { GAME_CONFIGS, getGameConfig, getAllGames, getTeamModeGames, supportsTeamMode, getEffectiveArchetype } from '$shared/gameTypes';
export type { GameType, GameConfig } from '$shared/gameTypes';
export { normalizeCode, formatKeyForDisplay, JOIN_CODE_LENGTH } from '$shared/access';

// ---------------------------------------------------------------------------
// Per-tournament admin keys
//
// A tournament's admin key is the only thing that grants writes to it. The
// server stores just a hash, so this browser's copy is the only one there is:
// losing it means losing control of that tournament. Kept per tournament id so
// one browser can administer several.
// ---------------------------------------------------------------------------

const ADMIN_KEY_STORE = 'gigalan.adminKeys';
const ADMIN_TOKEN_STORE = 'gigalan.adminToken';

// ---------------------------------------------------------------------------
// The instance admin token
//
// One secret, held only by whoever runs this server, that permits creating
// tournaments. Sent as X-Admin-Token on every request: there is no login
// session and no cookie, so nothing to expire and nothing to store server-side.
// ---------------------------------------------------------------------------

export function getOwnerToken(): string | null {
    try {
        return localStorage.getItem(ADMIN_TOKEN_STORE);
    } catch {
        return null;
    }
}

export function setOwnerToken(token: string): void {
    try {
        localStorage.setItem(ADMIN_TOKEN_STORE, token.trim());
    } catch {
        /* storage unavailable */
    }
}

export function clearOwnerToken(): void {
    try {
        localStorage.removeItem(ADMIN_TOKEN_STORE);
    } catch {
        /* storage unavailable */
    }
}

function readAdminKeys(): Record<string, string> {
    try {
        const raw = localStorage.getItem(ADMIN_KEY_STORE);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {}; // private mode, cleared storage, corrupt value -- treat as none
    }
}

function writeAdminKeys(keys: Record<string, string>): void {
    try {
        localStorage.setItem(ADMIN_KEY_STORE, JSON.stringify(keys));
    } catch {
        /* storage unavailable: the key simply is not remembered */
    }
}

export function getAdminKey(tournamentId: string): string | null {
    return readAdminKeys()[tournamentId] ?? null;
}

export function rememberAdminKey(tournamentId: string, adminKey: string): void {
    const keys = readAdminKeys();
    keys[tournamentId] = normalizeCode(adminKey);
    writeAdminKeys(keys);
}

export function forgetAdminKey(tournamentId: string): void {
    const keys = readAdminKeys();
    delete keys[tournamentId];
    writeAdminKeys(keys);
}

/** Tournament ids this browser holds an admin key for. */
export function administeredTournamentIds(): string[] {
    return Object.keys(readAdminKeys());
}

// ---------------------------------------------------------------------------
// One request helper for every call
//
// Replaces ~25 hand-written fetches whose error handling had drifted apart:
// some threw on !res.ok, some returned the error body as if it were a result,
// most did neither. All of them now fail the same way, which matters more since
// the server validates results and can legitimately reject a submission.
// ---------------------------------------------------------------------------

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    /** Attach this tournament's admin key, if this browser holds one. */
    tournamentId?: string;
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, tournamentId } = options;

    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    // The instance token goes on everything: it authorises creating, and it also
    // lets the operator manage a tournament whose own admin key they mislaid.
    const ownerToken = getOwnerToken();
    if (ownerToken) headers['X-Admin-Token'] = ownerToken;

    if (tournamentId) {
        const adminKey = getAdminKey(tournamentId);
        if (adminKey) headers['X-Admin-Key'] = adminKey;
    }

    const res = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data as T;
}

// Check if ties are possible
export function tiesPossible(gameType: GameType, useCustomPoints?: boolean): boolean {
    const archetype = getEffectiveArchetype(gameType, useCustomPoints);
    return getArchetypeConfig(archetype).tiesPossible;
}

// ---------------------------------------------------------------------------
// Sessions: joining by code, and instance-owner status
// ---------------------------------------------------------------------------

export interface JoinInfo {
    id: string;
    name: string;
    gameType: GameType;
    state: string;
    joinCode: string;
    isTeamBased: boolean;
    playerCount: number;
}

/** Resolve a shared join code to the tournament it opens. View access only. */
export async function joinByCode(code: string): Promise<JoinInfo> {
    return request<JoinInfo>(`/join/${encodeURIComponent(normalizeCode(code))}`);
}

export interface AdminStatus {
    authRequired: boolean;
    isAdmin: boolean;
    isOwner: boolean;
}

export async function getAdminStatus(): Promise<AdminStatus> {
    return request<AdminStatus>('/admin/status');
}

/**
 * Check a token with the server before storing it, so a mistyped token fails
 * here with a clear message instead of silently on the next create.
 */
export async function verifyOwnerToken(token: string): Promise<void> {
    const res = await fetch(`${API_URL}/admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'That admin token is not valid');
    setOwnerToken(token);
}

export function signOutOwner(): void {
    clearOwnerToken();
}

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

export async function getGames(): Promise<GameConfig[]> {
    return request<GameConfig[]>('/games');
}

/** The instance owner's list. Throws 401 for anyone else. */
export async function getTournaments() {
    return request('/tournaments');
}

export interface CreatedTournament {
    id: string;
    name: string;
    joinCode: string;
    /** Shown once, never retrievable again. */
    adminKey: string;
    isTeamBased: boolean;
}

export async function createTournament(
    name: string,
    gameType: GameType,
    mapPool: string[] = [],
    groupStageRoundLimit?: number,
    playoffsRoundLimit?: number,
    useCustomPoints?: boolean,
    teamMode?: boolean
): Promise<CreatedTournament> {
    const created = await request<CreatedTournament>('/tournaments', {
        method: 'POST',
        body: { name, gameType, mapPool, groupStageRoundLimit, playoffsRoundLimit, useCustomPoints, teamMode },
    });
    // The key exists only in this response -- keep it before anything can throw.
    if (created?.id && created?.adminKey) rememberAdminKey(created.id, created.adminKey);
    return created;
}

export async function deleteTournament(tournamentId: string) {
    const result = await request(`/tournament/${tournamentId}`, { method: 'DELETE', tournamentId });
    forgetAdminKey(tournamentId);
    return result;
}

export async function importTournament(tournamentData: any) {
    const result = await request<{ success: boolean; id: string; name: string; joinCode: string; adminKey: string }>(
        '/tournaments/import',
        { method: 'POST', body: tournamentData },
    );
    if (result?.id && result?.adminKey) rememberAdminKey(result.id, result.adminKey);
    return result;
}

export async function getState(tournamentId: string) {
    return request(`/tournament/${tournamentId}/state`, { tournamentId });
}

export async function updateTournamentName(tournamentId: string, name: string) {
    return request(`/tournament/${tournamentId}/name`, { method: 'PUT', body: { name }, tournamentId });
}

export async function resetTournament(tournamentId: string) {
    return request(`/tournament/${tournamentId}/reset`, { method: 'POST', tournamentId });
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export async function addPlayer(tournamentId: string, name: string) {
    return request(`/tournament/${tournamentId}/players`, { method: 'POST', body: { name }, tournamentId });
}

export async function updatePlayerName(tournamentId: string, playerId: string, name: string) {
    return request(`/tournament/${tournamentId}/player/${playerId}`, { method: 'PUT', body: { name }, tournamentId });
}

export async function updatePlayerPhoto(tournamentId: string, playerId: string, photo: string) {
    return request(`/tournament/${tournamentId}/player/${playerId}/photo`, { method: 'PUT', body: { photo }, tournamentId });
}

export async function removePlayer(tournamentId: string, playerId: string) {
    return request(`/tournament/${tournamentId}/player/${playerId}`, { method: 'DELETE', tournamentId });
}

// ---------------------------------------------------------------------------
// Group stage
// ---------------------------------------------------------------------------

export async function startGroupStage(tournamentId: string) {
    return request(`/tournament/${tournamentId}/start`, { method: 'POST', tournamentId });
}

export async function submitMatch(tournamentId: string, id: string, results: any, mapName?: string) {
    const body: any = { results };
    if (mapName) body.mapName = mapName;
    return request(`/tournament/${tournamentId}/match/${id}`, { method: 'POST', body, tournamentId });
}

export async function updateGroupName(tournamentId: string, podId: string, name: string) {
    return request(`/tournament/${tournamentId}/group/${podId}/name`, { method: 'PUT', body: { name }, tournamentId });
}

export async function resetGroupData(tournamentId: string, podId: string) {
    return request(`/tournament/${tournamentId}/group/${podId}/reset`, { method: 'POST', tournamentId });
}

// ---------------------------------------------------------------------------
// Playoffs
// ---------------------------------------------------------------------------

export async function generateBrackets(tournamentId: string) {
    return request(`/tournament/${tournamentId}/brackets`, { method: 'POST', tournamentId });
}

export async function submitBracketWinner(tournamentId: string, id: string, winnerId: string) {
    return request(`/tournament/${tournamentId}/bracket-match/${id}`, { method: 'POST', body: { winnerId }, tournamentId });
}

export async function submitBracketGameResult(tournamentId: string, matchId: string, gameResult: any) {
    return request(`/tournament/${tournamentId}/bracket-match/${matchId}/game`, { method: 'POST', body: gameResult, tournamentId });
}

// ---------------------------------------------------------------------------
// Teams
//
// The domain model lives in the shared single source of truth (shared/types.ts);
// re-exported here so the pages can keep importing these from `$lib/api`.
// ---------------------------------------------------------------------------

export type { Team, PlayerGameStats, TeamGameResult, TeamMatch, TeamPod, TeamBracketMatch };

export interface PlayerStats {
    playerId: string;
    kills: number;
    deaths: number;
    kdRatio: number;
    gamesPlayed: number;
}

export async function addTeam(tournamentId: string, name: string, playerIds: string[], logo?: string): Promise<Team> {
    return request<Team>(`/tournament/${tournamentId}/teams`, { method: 'POST', body: { name, playerIds, logo }, tournamentId });
}

export async function updateTeam(
    tournamentId: string,
    teamId: string,
    updates: { name?: string; playerIds?: string[]; logo?: string }
): Promise<Team> {
    return request<Team>(`/tournament/${tournamentId}/team/${teamId}`, { method: 'PUT', body: updates, tournamentId });
}

export async function removeTeam(tournamentId: string, teamId: string): Promise<void> {
    await request(`/tournament/${tournamentId}/team/${teamId}`, { method: 'DELETE', tournamentId });
}

export async function startTeamGroupStage(tournamentId: string): Promise<void> {
    await request(`/tournament/${tournamentId}/start-team`, { method: 'POST', tournamentId });
}

export async function submitTeamMatchResult(
    tournamentId: string,
    matchId: string,
    team1Score: number,
    team2Score: number,
    games?: TeamGameResult[]
): Promise<void> {
    await request(`/tournament/${tournamentId}/team-match/${matchId}`, {
        method: 'POST',
        body: { team1Score, team2Score, games },
        tournamentId,
    });
}

export async function generateTeamBrackets(tournamentId: string): Promise<void> {
    await request(`/tournament/${tournamentId}/team-brackets`, { method: 'POST', tournamentId });
}

export async function submitTeamBracketWinner(tournamentId: string, matchId: string, winnerId: string): Promise<void> {
    await request(`/tournament/${tournamentId}/team-bracket-match/${matchId}`, { method: 'POST', body: { winnerId }, tournamentId });
}

export async function submitTeamBracketGameResult(
    tournamentId: string,
    matchId: string,
    gameResult: TeamGameResult
): Promise<void> {
    await request(`/tournament/${tournamentId}/team-bracket-match/${matchId}/game`, { method: 'POST', body: gameResult, tournamentId });
}

export async function getPlayerStats(tournamentId: string): Promise<PlayerStats[]> {
    return request<PlayerStats[]>(`/tournament/${tournamentId}/player-stats`, { tournamentId });
}

export async function getTeamRankings(tournamentId: string): Promise<Team[]> {
    return request<Team[]>(`/tournament/${tournamentId}/team-rankings`, { tournamentId });
}
