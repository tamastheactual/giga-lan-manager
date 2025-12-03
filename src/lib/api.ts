const API_URL = 'http://localhost:3000/api';

// Game types
export type GameType = 'cs16' | 'ut2004' | 'worms';

export interface GameConfig {
    id: GameType;
    name: string;
    shortName: string;
    logo: string;
    groupStage: {
        format: string;
        description: string;
        maxDuration: string;
        tiesPossible: boolean;
        scoreType: 'rounds' | 'kills' | 'health';
        scoreLabel: string;
        maxScore?: number;
        maxRounds?: number;
        tieAllowed?: boolean;
    };
    playoffs: {
        format: string;
        mapsPerMatch: number;
        description: string;
        maxDuration: string;
        scoreType: 'rounds' | 'kills' | 'health';
        scoreLabel: string;
        maxScorePerMap?: number;
        roundsPerMap?: number;
    };
    rules: string[];
    maps: string[];
}

// Client-side game configs (should match server)
export const GAME_CONFIGS: Record<GameType, GameConfig> = {
    cs16: {
        id: 'cs16',
        name: 'Counter-Strike 1.6',
        shortName: 'CS 1.6',
        logo: '/games/CounterStrike.png',
        groupStage: {
            format: 'MR15 (30 rounds max)',
            description: 'Best of 30 rounds, first to 16 wins or 15-15 tie',
            maxDuration: '~30 minutes',
            tiesPossible: true,
            scoreType: 'rounds',
            scoreLabel: 'Rounds Won',
            maxScore: 16,
            maxRounds: 30,
            tieAllowed: true
        },
        playoffs: {
            format: 'Best of 3 maps (BO3)',
            mapsPerMatch: 3,
            description: 'MR9 per map (first to 10 wins)',
            maxDuration: '~90 minutes',
            scoreType: 'rounds',
            scoreLabel: 'Rounds Won',
            maxScorePerMap: 10,
            roundsPerMap: 19
        },
        rules: [
            'Group Stage: 1 random map per match',
            'Playoffs: All 3 maps played in player-decided order',
            'Group Stage: MR15 (first to 16 wins, tie at 15-15)',
            'Playoffs: MR9 per map (first to 10 wins)',
            'Tiebreaker: Total rounds won across all matches',
            'Top 4 advance to playoffs (varies by tournament size)',
            'Default configs + movement binds allowed',
            'No scripts or cheats',
            'Maximum 60 Hz monitor (external or laptop)'
        ],
        maps: ['aim_sOt', 'aim_dust2', 'aim_deathmatch_2012']
    },
    ut2004: {
        id: 'ut2004',
        name: 'Unreal Tournament 2004',
        shortName: 'UT2004',
        logo: '/games/UT2004.png',
        groupStage: {
            format: '8-minute Deathmatch',
            description: 'Timed deathmatch, most kills wins',
            maxDuration: '8 minutes',
            tiesPossible: true,
            scoreType: 'kills',
            scoreLabel: 'Kills',
            maxRounds: 1,
            tieAllowed: true
        },
        playoffs: {
            format: 'Best of 3 (6-min maps)',
            mapsPerMatch: 3,
            description: 'First to win 2 maps advances',
            maxDuration: '~20 minutes',
            scoreType: 'kills',
            scoreLabel: 'Kills',
            roundsPerMap: 1
        },
        rules: [
            '1v1 Deathmatch mode',
            'Group Stage: 8-minute time limit, random map',
            'Playoffs: Best of 3 maps (6 min each), first to win 2 advances',
            'Player with most kills wins the map',
            'Ties possible in group stage',
            'Map order decided by players in playoffs',
            'Default configs + movement binds allowed',
            'No scripts or cheats',
            'Maximum 60 Hz monitor (external or laptop)'
        ],
        maps: ['DM-1on1-Mixer', 'DM-1on1-Albatross', 'DM-1on1-Crash']
    },
    worms: {
        id: 'worms',
        name: 'Worms Armageddon',
        shortName: 'Worms',
        logo: '/games/WormsArmageddon.png',
        groupStage: {
            format: '1 Round Match',
            description: 'Last worm standing wins, track remaining HP',
            maxDuration: '~15 minutes',
            tiesPossible: true,
            scoreType: 'health',
            scoreLabel: 'HP Remaining',
            maxRounds: 1,
            tieAllowed: true
        },
        playoffs: {
            format: 'Best of 3 rounds (BO3)',
            mapsPerMatch: 3,
            description: 'First to win 2 rounds advances',
            maxDuration: '~45 minutes',
            scoreType: 'health',
            scoreLabel: 'HP Remaining',
            roundsPerMap: 1
        },
        rules: [
            '5 worms per player (100 HP each, 500 HP total)',
            '45-second turn time',
            'Winner: Record total HP remaining',
            'Loser: Record 0 HP (0-0 if mutual kill/tie)',
            'Tiebreaker: Total HP across all matches',
            'Sudden Death after 8 minutes: 1 HP + water rises',
            'Standard Intermediate scheme'
        ],
        maps: ['Rocky', 'Witch', 'Kermit']
    }
};

export async function getGames(): Promise<GameConfig[]> {
    const res = await fetch(`${API_URL}/games`);
    return res.json();
}

export async function getTournaments() {
    const res = await fetch(`${API_URL}/tournaments`);
    return res.json();
}

export async function createTournament(name: string, gameType: GameType) {
    const res = await fetch(`${API_URL}/tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, gameType })
    });
    return res.json();
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

export async function submitMatch(tournamentId: string, id: string, results: any) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/match/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results })
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
export async function submitBracketGameResult(
    tournamentId: string, 
    matchId: string, 
    gameResult: {
        gameNumber: number;
        mapName?: string;
        player1Score: number;
        player2Score: number;
        winnerId: string;
    }
) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/bracket-match/${matchId}/game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameResult)
    });
    return res.json();
}
