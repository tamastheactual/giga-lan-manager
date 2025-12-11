const API_URL = 'http://localhost:3000/api';

import { type ScoreArchetype, SCORE_ARCHETYPES, getArchetypeConfig } from './gameArchetypes';

// All supported game types
export type GameType = 
  | 'cs16' 
  | 'ut2004' 
  | 'ut99'
  | 'worms' 
  | 'quake3'
  | 'halo'
  | 'mohaa'
  | 'rtcw'
  | 'wolfet'
  | 'bf1942'
  | 'bfvietnam'
  | 'swbf1'
  | 'swbf2'
  | 'deltaforce'
  | 'aoe2'
  | 'warcraft3'
  | 'stronghold'
  | 'cncra1'
  | 'cncra2';

export interface GameConfig {
    id: GameType;
    name: string;
    shortName: string;
    logo: string;
    defaultArchetype: ScoreArchetype;
    
    // Team mode settings - can play in team mode if supportsTeamMode is true
    supportsTeamMode?: boolean;   // Can this game be played in team mode?
    isTeamGame?: boolean;         // Legacy: Whether this is always a team-based game
    defaultTeamSize?: number;     // Default team size (e.g., 5 for CS)
    minTeamSize?: number;         // Minimum team size
    maxTeamSize?: number;         // Maximum team size
    
    groupStage: {
        format: string;
        description: string;
        maxDuration: string;
        maxScore?: number;
        // Extended properties for team games
        maxRounds?: number;
        tieAllowed?: boolean;
        scoreType?: 'rounds' | 'kills' | 'health' | 'time' | 'points';
    };
    playoffs: {
        format: string;
        mapsPerMatch: number;
        description: string;
        maxDuration: string;
        maxScorePerMap?: number;
        // Extended properties for team games
        roundsPerMap?: number;
        scoreType?: 'rounds' | 'kills' | 'health' | 'time' | 'points';
    };
    rules: string[];
    maps: string[];
}

// Client-side game configs (should match server)
export const GAME_CONFIGS: Record<GameType, GameConfig> = {
    // ==================== ROUNDS-BASED GAMES ====================
    cs16: {
        id: 'cs16',
        name: 'Counter-Strike 1.6',
        shortName: 'CS 1.6',
        logo: '/games/CounterStrike.png',
        defaultArchetype: 'rounds',
        // Team mode support
        supportsTeamMode: true,
        defaultTeamSize: 5,
        minTeamSize: 2,
        maxTeamSize: 5,
        groupStage: {
            format: 'MR15 (30 rounds)',
            description: 'First to 16 wins, 15-15 tie possible',
            maxDuration: '~30 min',
            maxScore: 16
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'MR9 per map (first to 10)',
            maxDuration: '~90 min',
            maxScorePerMap: 10
        },
        rules: [
            'Group Stage: MR15 (first to 16 wins, tie at 15-15)',
            'Playoffs: MR9 per map (first to 10 wins)',
            'Tiebreaker: Total rounds won',
            'Default configs + movement binds allowed',
            'No scripts or cheats'
        ],
        maps: ['aim_sOt', 'aim_dust2', 'aim_deathmatch_2012']
    },
    
    rtcw: {
        id: 'rtcw',
        name: 'Return to Castle Wolfenstein',
        shortName: 'RtCW',
        logo: '/games/wolfenstein.png',
        defaultArchetype: 'rounds',
        groupStage: {
            format: 'Objective-based',
            description: 'Complete objectives or eliminate enemy',
            maxDuration: '~20 min',
            maxScore: 5
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~60 min',
            maxScorePerMap: 5
        },
        rules: [
            'Objective-based gameplay',
            'Attack/Defend rounds',
            'Default settings'
        ],
        maps: ['mp_beach', 'mp_assault', 'mp_village']
    },
    
    wolfet: {
        id: 'wolfet',
        name: 'Wolfenstein: Enemy Territory',
        shortName: 'W:ET',
        logo: '/games/wolfenstein-enemy.png',
        defaultArchetype: 'rounds',
        groupStage: {
            format: 'Objective-based',
            description: 'Complete objectives within time limit',
            maxDuration: '~20 min',
            maxScore: 5
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~60 min',
            maxScorePerMap: 5
        },
        rules: [
            'Objective-based gameplay',
            '6v6 or smaller teams',
            'Stopwatch mode for competitive'
        ],
        maps: ['goldrush', 'radar', 'oasis']
    },
    
    // ==================== KILLS-BASED GAMES ====================
    ut2004: {
        id: 'ut2004',
        name: 'Unreal Tournament 2004',
        shortName: 'UT2004',
        logo: '/games/UT2004.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'Deathmatch (8 min)',
            description: 'Most kills wins, ties possible',
            maxDuration: '8 min'
        },
        playoffs: {
            format: 'BO3 (6-min maps)',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~20 min'
        },
        rules: [
            '1v1 Deathmatch mode',
            'Group Stage: 8-minute time limit',
            'Playoffs: 6 minutes per map',
            'Most kills wins the map'
        ],
        maps: ['DM-1on1-Mixer', 'DM-1on1-Albatross', 'DM-1on1-Crash']
    },
    
    ut99: {
        id: 'ut99',
        name: 'Unreal Tournament 99',
        shortName: 'UT99',
        logo: '/games/ut1999.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'Deathmatch (10 min)',
            description: 'Most kills wins, ties possible',
            maxDuration: '10 min'
        },
        playoffs: {
            format: 'BO3 (8-min maps)',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~25 min'
        },
        rules: [
            '1v1 Deathmatch mode',
            'Group Stage: 10-minute time limit',
            'Playoffs: 8 minutes per map',
            'Most kills wins the map'
        ],
        maps: ['DM-Morpheus', 'DM-Deck16][', 'DM-Turbine']
    },
    
    quake3: {
        id: 'quake3',
        name: 'Quake III Arena',
        shortName: 'Q3A',
        logo: '/games/quake3.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'Deathmatch (10 min)',
            description: 'Most frags wins',
            maxDuration: '10 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~30 min'
        },
        rules: [
            '1v1 Deathmatch mode',
            '10-minute time limit',
            'Frag limit can be set',
            'Most frags wins'
        ],
        maps: ['q3dm6', 'q3dm17', 'q3tourney2']
    },
    
    halo: {
        id: 'halo',
        name: 'Halo: Combat Evolved',
        shortName: 'Halo CE',
        logo: '/games/halo.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'Slayer (10 min)',
            description: 'Most kills wins',
            maxDuration: '10 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~30 min'
        },
        rules: [
            '1v1 or 2v2 Slayer mode',
            'Kill limit or time limit',
            'No vehicles in small maps'
        ],
        maps: ['Hang Em High', 'Battle Creek', 'Wizard']
    },
    
    mohaa: {
        id: 'mohaa',
        name: 'Medal of Honor: Allied Assault',
        shortName: 'MoH:AA',
        logo: '/games/mohaa.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'Deathmatch/TDM',
            description: 'Most kills wins',
            maxDuration: '~15 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~45 min'
        },
        rules: [
            'Deathmatch or Team Deathmatch',
            'Kill limit or time limit',
            'Standard weapons allowed'
        ],
        maps: ['dm/mohdm1', 'dm/mohdm2', 'dm/mohdm6']
    },
    
    bf1942: {
        id: 'bf1942',
        name: 'Battlefield 1942',
        shortName: 'BF1942',
        logo: '/games/battlefield1942.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'Conquest/TDM',
            description: 'Score-based or kills',
            maxDuration: '~20 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~60 min'
        },
        rules: [
            'Conquest or TDM mode',
            'Ticket-based or kill-based',
            'Vehicle rules vary by tournament'
        ],
        maps: ['Wake Island', 'El Alamein', 'Stalingrad']
    },
    
    bfvietnam: {
        id: 'bfvietnam',
        name: 'Battlefield Vietnam',
        shortName: 'BF:V',
        logo: '/games/battlefieldvietnam.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'Conquest/TDM',
            description: 'Score-based or kills',
            maxDuration: '~20 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~60 min'
        },
        rules: [
            'Conquest or TDM mode',
            'Ticket-based or kill-based',
            'Vietnam-era equipment'
        ],
        maps: ['Hue', 'Ho Chi Minh Trail', 'Operation Flaming Dart']
    },
    
    swbf1: {
        id: 'swbf1',
        name: 'Star Wars Battlefront',
        shortName: 'SWBF1',
        logo: '/games/battlefront.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'Conquest',
            description: 'Reinforcement-based',
            maxDuration: '~15 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~45 min'
        },
        rules: [
            'Conquest mode',
            'Reinforcement tickets',
            'Heroes may be disabled'
        ],
        maps: ['Kashyyyk', 'Geonosis', 'Hoth']
    },
    
    swbf2: {
        id: 'swbf2',
        name: 'Star Wars Battlefront 2',
        shortName: 'SWBF2',
        logo: '/games/battlefront2.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'Conquest',
            description: 'Reinforcement-based',
            maxDuration: '~15 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~45 min'
        },
        rules: [
            'Conquest mode',
            'Reinforcement tickets',
            'Heroes may be enabled/disabled'
        ],
        maps: ['Mos Eisley', 'Kashyyyk', 'Utapau']
    },
    
    deltaforce: {
        id: 'deltaforce',
        name: 'Delta Force: Black Hawk Down',
        shortName: 'DF:BHD',
        logo: '/games/blackhawkdawn.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'TDM/Deathmatch',
            description: 'Kill-based scoring',
            maxDuration: '~15 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~45 min'
        },
        rules: [
            'Team Deathmatch or Deathmatch',
            'Kill limit or time limit',
            'Standard loadouts'
        ],
        maps: ['Mogadishu Mile', 'Lost Village', 'Radio Tower']
    },
    
    // ==================== HEALTH-BASED GAMES ====================
    worms: {
        id: 'worms',
        name: 'Worms Armageddon',
        shortName: 'Worms',
        logo: '/games/WormsArmageddon.png',
        defaultArchetype: 'health',
        groupStage: {
            format: 'Single Round',
            description: 'Last worm standing, track HP remaining',
            maxDuration: '~15 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 rounds',
            maxDuration: '~45 min'
        },
        rules: [
            '5 worms per player (100 HP each, 500 total)',
            '45-second turn time',
            'Winner: Record HP remaining',
            'Loser: Record 0 HP (0-0 if mutual kill)',
            'Sudden Death after 8 min'
        ],
        maps: ['Rocky', 'Witch', 'Kermit']
    },
    
    // ==================== WIN-ONLY GAMES ====================
    aoe2: {
        id: 'aoe2',
        name: 'Age of Empires 2 HD',
        shortName: 'AoE2 HD',
        logo: '/games/aoe2.png',
        defaultArchetype: 'winonly',
        groupStage: {
            format: '1v1 Random Map',
            description: 'Win or lose (no score)',
            maxDuration: '~30-60 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 games',
            maxDuration: '~2-3 hours'
        },
        rules: [
            '1v1 Random Map',
            'Standard victory conditions',
            'Civilization pick/ban optional'
        ],
        maps: ['Arabia', 'Arena', 'Black Forest']
    },
    
    warcraft3: {
        id: 'warcraft3',
        name: 'Warcraft III',
        shortName: 'WC3',
        logo: '/games/warcraft3.png',
        defaultArchetype: 'winonly',
        groupStage: {
            format: '1v1',
            description: 'Win or lose (no score)',
            maxDuration: '~20-40 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 games',
            maxDuration: '~1-2 hours'
        },
        rules: [
            '1v1 Melee mode',
            'Standard victory conditions',
            'Race pick order decided by coin flip'
        ],
        maps: ['Echo Isles', 'Twisted Meadows', 'Terenas Stand']
    },
    
    stronghold: {
        id: 'stronghold',
        name: 'Stronghold Crusader HD',
        shortName: 'Stronghold',
        logo: '/games/stronghold.png',
        defaultArchetype: 'winonly',
        groupStage: {
            format: '1v1 Skirmish',
            description: 'Win or lose (no score)',
            maxDuration: '~20-40 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 games',
            maxDuration: '~1-2 hours'
        },
        rules: [
            '1v1 Skirmish mode',
            'Destroy enemy Lord to win',
            'Starting resources agreed upon'
        ],
        maps: ['Forgotten Valley', 'Desert Heat', 'The Crossing']
    },
    
    cncra1: {
        id: 'cncra1',
        name: 'C&C: Red Alert',
        shortName: 'RA1',
        logo: '/games/cc1.png',
        defaultArchetype: 'winonly',
        groupStage: {
            format: '1v1',
            description: 'Win or lose (no score)',
            maxDuration: '~20-30 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 games',
            maxDuration: '~1-2 hours'
        },
        rules: [
            '1v1 Skirmish',
            'Destroy enemy base to win',
            'Faction pick allowed'
        ],
        maps: ['Tournament Arena', 'Jungle', 'Coastal Influence']
    },
    
    cncra2: {
        id: 'cncra2',
        name: "C&C: Red Alert 2",
        shortName: 'RA2',
        logo: '/games/cc2.png',
        defaultArchetype: 'winonly',
        groupStage: {
            format: '1v1',
            description: 'Win or lose (no score)',
            maxDuration: '~20-30 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 games',
            maxDuration: '~1-2 hours'
        },
        rules: [
            '1v1 Skirmish',
            'Destroy enemy base to win',
            'Faction pick allowed (Soviet/Allied)'
        ],
        maps: ['Urban Rush', 'Dry Heat', 'Little Big Lake']
    }
};

// Helper to get the effective archetype for a tournament
export function getEffectiveArchetype(
    gameType: GameType, 
    useCustomPoints?: boolean
): ScoreArchetype {
    if (useCustomPoints) return 'points';
    return GAME_CONFIGS[gameType].defaultArchetype;
}

// Get archetype-aware score label
export function getScoreLabel(gameType: GameType, useCustomPoints?: boolean): string {
    const archetype = getEffectiveArchetype(gameType, useCustomPoints);
    return getArchetypeConfig(archetype).scoreLabel;
}

// Check if ties are possible
export function tiesPossible(gameType: GameType, useCustomPoints?: boolean): boolean {
    const archetype = getEffectiveArchetype(gameType, useCustomPoints);
    return getArchetypeConfig(archetype).tiesPossible;
}

// Check if score tracking is needed
export function needsScoreTracking(gameType: GameType, useCustomPoints?: boolean): boolean {
    const archetype = getEffectiveArchetype(gameType, useCustomPoints);
    return getArchetypeConfig(archetype).tracksScore;
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

export interface Team {
    id: string;
    name: string;
    playerIds: string[];
    logo?: string;
}

export interface PlayerGameStats {
    playerId: string;
    kills: number;
    deaths: number;
}

export interface TeamGameResult {
    gameNumber: number;
    mapName?: string;
    team1Score: number;
    team2Score: number;
    winnerTeamId: string;
    playerStats?: PlayerGameStats[];
}

export interface TeamMatch {
    id: string;
    matchNumber: number;
    round: number;
    team1Id: string;
    team2Id: string;
    team1Score?: number;
    team2Score?: number;
    winnerId?: string;
    games?: TeamGameResult[];
    completed: boolean;
}

export interface TeamPod {
    id: string;
    round: number;
    teams: string[];
    matchId: string;
    name?: string;
}

export interface TeamBracketMatch {
    id: string;
    round: number;
    team1Id?: string;
    team2Id?: string;
    winnerId?: string;
    nextMatchId?: string;
    nextMatchSlot?: 1 | 2;
    bracketType: 'quarterfinals' | 'semifinals' | 'finals' | '3rd-place';
    matchLabel?: string;
    loserFromMatch1?: string;
    loserFromMatch2?: string;
    games?: TeamGameResult[];
    team1Wins?: number;
    team2Wins?: number;
}

export interface PlayerStats {
    playerId: string;
    kills: number;
    deaths: number;
    kdRatio: number;
    gamesPlayed: number;
}

// Helper to check if a game type is team-based
export function isTeamGame(gameType: GameType): boolean {
    const config = GAME_CONFIGS[gameType];
    return config?.isTeamBased === true;
}

// Get all team games
export function getTeamGameConfigs(): GameConfig[] {
    return Object.values(GAME_CONFIGS).filter(config => config.isTeamBased);
}

// Get team games from server
export async function getTeamGames(): Promise<GameConfig[]> {
    const res = await fetch(`${API_URL}/team-games`);
    return res.json();
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

// Update team logo
export async function updateTeamLogo(tournamentId: string, teamId: string, logo: string): Promise<void> {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/team/${teamId}/logo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo })
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update team logo');
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
