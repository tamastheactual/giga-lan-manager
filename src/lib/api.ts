const API_URL = 'http://localhost:3000/api';

import { getArchetypeConfig } from '$shared/gameArchetypes';
import { getEffectiveArchetype, type GameType, type GameConfig } from '$shared/gameTypes';
import type { Team, PlayerGameStats, TeamGameResult, TeamMatch, TeamPod, TeamBracketMatch } from '$shared/types';

// Game types, configs, and pure helpers are the shared single source of truth,
// re-exported so existing `$lib/api` imports keep working unchanged.
export { GAME_CONFIGS, getGameConfig, getAllGames, getTeamModeGames, supportsTeamMode, getEffectiveArchetype } from '$shared/gameTypes';
export type { GameType, GameConfig } from '$shared/gameTypes';

// Check if ties are possible
export function tiesPossible(gameType: GameType, useCustomPoints?: boolean): boolean {
    const archetype = getEffectiveArchetype(gameType, useCustomPoints);
    return getArchetypeConfig(archetype).tiesPossible;
}

export async function getGames(): Promise<GameConfig[]> {
    const res = await fetch(`${API_URL}/games`);
    return res.json();
}

export async function getTournaments() {
    const res = await fetch(`${API_URL}/tournaments`);
    return res.json();
}

export async function createTournament(
    name: string, 
    gameType: GameType, 
    mapPool: string[] = [], 
    groupStageRoundLimit?: number, 
    playoffsRoundLimit?: number,
    useCustomPoints?: boolean,
    teamMode?: boolean
) {
    const res = await fetch(`${API_URL}/tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, gameType, mapPool, groupStageRoundLimit, playoffsRoundLimit, useCustomPoints, teamMode })
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || 'Failed to create tournament');
    }
    return data;
}

export async function deleteTournament(tournamentId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}`, {
        method: 'DELETE'
    });
    return res.json();
}

export async function importTournament(tournamentData: any) {
    const res = await fetch(`${API_URL}/tournaments/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tournamentData)
    });
    return res.json();
}

export async function getState(tournamentId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/state`);
    return res.json();
}

export async function addPlayer(tournamentId: string, name: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return res.json();
}

export async function startGroupStage(tournamentId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/start`, { method: 'POST' });
    return res.json();
}

export async function submitMatch(tournamentId: string, id: string, results: any, mapName?: string) {
    const body: any = { results };
    if (mapName) body.mapName = mapName;
    
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/match/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

export async function generateBrackets(tournamentId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/brackets`, { method: 'POST' });
    return res.json();
}

export async function resetTournament(tournamentId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/reset`, { method: 'POST' });
    return res.json();
}

export async function submitBracketWinner(tournamentId: string, id: string, winnerId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/bracket-match/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId })
    });
    return res.json();
}

export async function updateGroupName(tournamentId: string, podId: string, name: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/group/${podId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return res.json();
}

export async function resetGroupData(tournamentId: string, podId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/group/${podId}/reset`, {
        method: 'POST'
    });
    return res.json();
}

export async function updateTournamentName(tournamentId: string, name: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return res.json();
}

export async function updatePlayerName(tournamentId: string, playerId: string, name: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/player/${playerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return res.json();
}

export async function updatePlayerPhoto(tournamentId: string, playerId: string, photo: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/player/${playerId}/photo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo })
    });
    return res.json();
}

export async function removePlayer(tournamentId: string, playerId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/player/${playerId}`, {
        method: 'DELETE'
    });
    return res.json();
}

// Submit a single game result for BO3 bracket match
export async function submitBracketGameResult(tournamentId: string, matchId: string, gameResult: any) {
    const response = await fetch(`/api/tournament/${tournamentId}/bracket-match/${matchId}/game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameResult)
    });
    if (!response.ok) throw new Error('Failed to submit game result');
    return response.json();
}

export async function updateBracketMatch(tournamentId: string, matchId: string, winnerId: string, games: any) {
    const response = await fetch(`/api/tournament/${tournamentId}/bracket-match/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId, games })
    });
    if (!response.ok) throw new Error('Failed to update bracket match');
    return response.json();
}

// ========================================
// TEAM TOURNAMENT TYPES & API
// ========================================

// The domain model lives in the shared single source of truth (shared/types.ts);
// re-exported here so the pages can keep importing these from `$lib/api`.
export type { Team, PlayerGameStats, TeamGameResult, TeamMatch, TeamPod, TeamBracketMatch };

export interface PlayerStats {
    playerId: string;
    kills: number;
    deaths: number;
    kdRatio: number;
    gamesPlayed: number;
}


// Add a team to a tournament
export async function addTeam(tournamentId: string, name: string, playerIds: string[], logo?: string): Promise<Team> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, playerIds, logo })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add team');
    return data;
}

// Update a team
export async function updateTeam(tournamentId: string, teamId: string, updates: { name?: string; playerIds?: string[]; logo?: string }): Promise<Team> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/team/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update team');
    return data;
}

// Remove a team
export async function removeTeam(tournamentId: string, teamId: string): Promise<void> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/team/${teamId}`, {
        method: 'DELETE'
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove team');
    }
}


// Start team group stage
export async function startTeamGroupStage(tournamentId: string): Promise<void> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/start-team`, {
        method: 'POST'
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start team group stage');
    }
}

// Submit team match result (group stage)
export async function submitTeamMatchResult(
    tournamentId: string, 
    matchId: string, 
    team1Score: number, 
    team2Score: number, 
    games?: TeamGameResult[]
): Promise<void> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/team-match/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team1Score, team2Score, games })
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit team match result');
    }
}

// Generate team brackets
export async function generateTeamBrackets(tournamentId: string): Promise<void> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/team-brackets`, {
        method: 'POST'
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate team brackets');
    }
}

// Submit team bracket winner
export async function submitTeamBracketWinner(tournamentId: string, matchId: string, winnerId: string): Promise<void> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/team-bracket-match/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId })
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit team bracket winner');
    }
}

// Submit a single game result for team bracket match
export async function submitTeamBracketGameResult(
    tournamentId: string, 
    matchId: string, 
    gameResult: TeamGameResult
): Promise<void> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/team-bracket-match/${matchId}/game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameResult)
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit team bracket game result');
    }
}

// Get player statistics for team tournament
export async function getPlayerStats(tournamentId: string): Promise<PlayerStats[]> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/player-stats`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get player stats');
    return data;
}

// Get team rankings
export async function getTeamRankings(tournamentId: string): Promise<Team[]> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/team-rankings`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to get team rankings');
    return data;
}
