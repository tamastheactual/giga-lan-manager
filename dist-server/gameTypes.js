// Game type definitions for the tournament system
export const GAME_CONFIGS = {
    cs16: {
        id: 'cs16',
        name: 'Counter-Strike 1.6',
        shortName: 'CS 1.6',
        logo: '/src/assets/games/CounterStrike.png',
        groupStage: {
            format: 'BO1',
            description: '30-round max (first to 16, tie at 15-15)',
            maxDuration: '~30 min',
            tiesPossible: true,
            scoreType: 'rounds',
            scoreLabel: 'Rounds',
            maxScore: 16
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: '19-round max per map (first to 10)',
            maxDuration: '~45 min',
            scoreType: 'rounds',
            scoreLabel: 'Rounds',
            maxScorePerMap: 10
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
        logo: '/src/assets/games/UT2004.png',
        groupStage: {
            format: 'BO1',
            description: '8-minute deathmatch (most kills, ties possible)',
            maxDuration: '8 min',
            tiesPossible: true,
            scoreType: 'kills',
            scoreLabel: 'Kills',
        },
        playoffs: {
            format: 'BO3 (6-min maps)',
            mapsPerMatch: 3,
            description: 'First to win 2 maps advances',
            maxDuration: '~20 min',
            scoreType: 'kills',
            scoreLabel: 'Kills',
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
        logo: '/src/assets/games/WormsArmageddon.png',
        groupStage: {
            format: 'BO1',
            description: 'Last worm standing, track remaining HP for tiebreaker',
            maxDuration: '~15 min',
            tiesPossible: true,
            scoreType: 'health',
            scoreLabel: 'HP Remaining',
        },
        playoffs: {
            format: 'BO3',
            mapsPerMatch: 3,
            description: 'First to win 2 rounds advances',
            maxDuration: '~45 min',
            scoreType: 'health',
            scoreLabel: 'HP Remaining',
        },
        rules: [
            '5 worms per player (100 HP each, 500 total)',
            '45-second turn time',
            'Winner: Record total HP remaining',
            'Loser: Record 0 HP (0-0 if mutual kill)',
            'Tiebreaker: Total HP across matches',
            'Sudden Death after 8 min: 1 HP + water rises',
            'Standard Intermediate scheme'
        ],
        maps: ['Rocky', 'Witch', 'Kermit']
    }
};
export function getGameConfig(gameType) {
    return GAME_CONFIGS[gameType];
}
export function getAllGames() {
    return Object.values(GAME_CONFIGS);
}
//# sourceMappingURL=gameTypes.js.map