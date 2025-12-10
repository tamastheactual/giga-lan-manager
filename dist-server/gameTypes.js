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
        logo: '/games/RTCW.png',
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
        logo: '/games/WolfET.png',
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
        logo: '/games/UT99.png',
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
        logo: '/games/Quake3.png',
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
        logo: '/games/HaloCE.png',
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
        logo: '/games/MOHAA.png',
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
        logo: '/games/BF1942.png',
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
        logo: '/games/BFVietnam.png',
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
        logo: '/games/SWBF1.png',
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
        logo: '/games/SWBF2.png',
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
        logo: '/games/DeltaForce.png',
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
    duke3d: {
        id: 'duke3d',
        name: 'Duke Nukem 3D',
        shortName: 'Duke3D',
        logo: '/games/Duke3D.png',
        defaultArchetype: 'kills',
        groupStage: {
            format: 'Deathmatch',
            description: 'Most frags wins',
            maxDuration: '~10 min'
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 maps',
            maxDuration: '~30 min'
        },
        rules: [
            '1v1 Deathmatch mode',
            'Frag limit or time limit',
            'DOSBox or eDuke32'
        ],
        maps: ['E1L1', 'E1L2', 'E1L3']
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
        name: 'Age of Empires 2',
        shortName: 'AoE2',
        logo: '/games/AoE2.png',
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
        logo: '/games/Warcraft3.png',
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
        logo: '/games/Stronghold.png',
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
        logo: '/games/RedAlert1.png',
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
        logo: '/games/RedAlert2.png',
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
export function getGameConfig(gameType) {
    return GAME_CONFIGS[gameType];
}
export function getAllGames() {
    return Object.values(GAME_CONFIGS);
}
// Helper to get the effective archetype for a tournament
// (allows custom points override)
export function getEffectiveArchetype(gameType, useCustomPoints) {
    if (useCustomPoints)
        return 'points';
    return GAME_CONFIGS[gameType].defaultArchetype;
}
//# sourceMappingURL=gameTypes.js.map