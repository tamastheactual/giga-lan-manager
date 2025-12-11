// Game type definitions for the tournament system
import { SCORE_ARCHETYPES } from './gameArchetypes.js';
export const GAME_CONFIGS = {
    // ==================== ROUNDS-BASED GAMES ====================
    cs16: {
        id: 'cs16',
        name: 'Counter-Strike 1.6',
        shortName: 'CS 1.6',
        logo: '/games/CounterStrike.png',
        defaultArchetype: 'rounds',
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
    },
    // ==================== TEAM-BASED GAMES ====================
    cs16_team: {
        id: 'cs16_team',
        name: 'Counter-Strike 1.6 (Team)',
        shortName: 'CS 1.6 Team',
        logo: '/games/CounterStrike.png',
        defaultArchetype: 'team-rounds',
        isTeamGame: true,
        defaultTeamSize: 5,
        minTeamSize: 3,
        maxTeamSize: 5,
        groupStage: {
            format: 'MR15 (30 rounds)',
            description: 'First to 16 wins, 15-15 tie possible',
            maxDuration: '~45 min',
            maxScore: 16
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'MR15 per map (first to 16)',
            maxDuration: '~2.5 hours',
            maxScorePerMap: 16
        },
        rules: [
            'Team-based 5v5 (or 4v4/3v3)',
            'MR15 format (first to 16 wins)',
            'Track individual K/D per map',
            'Tiebreaker: Round difference',
            'Standard competitive configs'
        ],
        maps: ['de_dust2', 'de_inferno', 'de_nuke', 'de_train', 'de_mirage']
    },
    cs2_team: {
        id: 'cs2_team',
        name: 'Counter-Strike 2 (Team)',
        shortName: 'CS2 Team',
        logo: '/games/cs2.png',
        defaultArchetype: 'team-rounds',
        isTeamGame: true,
        defaultTeamSize: 5,
        minTeamSize: 3,
        maxTeamSize: 5,
        groupStage: {
            format: 'MR12 (24 rounds)',
            description: 'First to 13 wins, overtime if tied',
            maxDuration: '~40 min',
            maxScore: 13
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'MR12 per map (first to 13)',
            maxDuration: '~2 hours',
            maxScorePerMap: 13
        },
        rules: [
            'Team-based 5v5 (or smaller)',
            'MR12 format (first to 13 wins)',
            'Overtime: MR3 until winner',
            'Track individual K/D per map',
            'Premier/Competitive settings'
        ],
        maps: ['de_dust2', 'de_inferno', 'de_mirage', 'de_anubis', 'de_ancient', 'de_nuke', 'de_vertigo']
    },
    valorant_team: {
        id: 'valorant_team',
        name: 'Valorant (Team)',
        shortName: 'Valorant',
        logo: '/games/valorant.png',
        defaultArchetype: 'team-rounds',
        isTeamGame: true,
        defaultTeamSize: 5,
        minTeamSize: 3,
        maxTeamSize: 5,
        groupStage: {
            format: 'First to 13',
            description: '24 rounds max, overtime if tied',
            maxDuration: '~40 min',
            maxScore: 13
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to 13 per map',
            maxDuration: '~2 hours',
            maxScorePerMap: 13
        },
        rules: [
            'Team-based 5v5',
            'First to 13 rounds wins',
            'Overtime if 12-12',
            'Track individual K/D per map',
            'Agent selection allowed'
        ],
        maps: ['Bind', 'Haven', 'Split', 'Ascent', 'Icebox', 'Breeze', 'Lotus']
    },
    cod4_team: {
        id: 'cod4_team',
        name: 'Call of Duty 4 (Team)',
        shortName: 'CoD4 Team',
        logo: '/games/cod4.png',
        defaultArchetype: 'team-rounds',
        isTeamGame: true,
        defaultTeamSize: 5,
        minTeamSize: 3,
        maxTeamSize: 5,
        groupStage: {
            format: 'Search & Destroy',
            description: 'First to 6 or 10 rounds',
            maxDuration: '~30 min',
            maxScore: 6
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'S&D - First to 6 per map',
            maxDuration: '~1.5 hours',
            maxScorePerMap: 6
        },
        rules: [
            'Team-based S&D',
            'Promod settings',
            'Track individual K/D per map',
            'Standard competitive configs'
        ],
        maps: ['mp_backlot', 'mp_crash', 'mp_crossfire', 'mp_citystreets', 'mp_strike']
    }
};
export function getGameConfig(gameType) {
    return GAME_CONFIGS[gameType];
}
export function getAllGames() {
    return Object.values(GAME_CONFIGS);
}
// Get only solo games (non-team)
export function getSoloGames() {
    return Object.values(GAME_CONFIGS).filter(g => !g.isTeamGame);
}
// Get only team games
export function getTeamGames() {
    return Object.values(GAME_CONFIGS).filter(g => g.isTeamGame);
}
// Check if a game type is team-based
export function isTeamGame(gameType) {
    return GAME_CONFIGS[gameType]?.isTeamGame === true;
}
// Helper to get the effective archetype for a tournament
// (allows custom points override)
export function getEffectiveArchetype(gameType, useCustomPoints) {
    if (useCustomPoints)
        return 'points';
    return GAME_CONFIGS[gameType].defaultArchetype;
}
//# sourceMappingURL=gameTypes.js.map