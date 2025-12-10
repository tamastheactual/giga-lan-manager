// Score Archetypes - defines how scoring works for different game types
// Server-side version (mirrors src/lib/gameArchetypes.ts)
export const SCORE_ARCHETYPES = {
    rounds: {
        id: 'rounds',
        name: 'Rounds',
        description: 'Play to a round limit (e.g., first to 16)',
        scoreLabel: 'Rounds Won',
        tiesPossible: true,
        loserHasScore: true,
        higherIsBetter: true,
        requiresMaxScore: true,
        defaultMaxScore: 16,
        statLabel: 'Total Rounds Won',
        statLabelShort: 'Rounds'
    },
    kills: {
        id: 'kills',
        name: 'Kills/Frags',
        description: 'Deathmatch-style, most kills wins',
        scoreLabel: 'Kills',
        tiesPossible: true,
        loserHasScore: true,
        higherIsBetter: true,
        requiresMaxScore: false,
        statLabel: 'Total Kills',
        statLabelShort: 'Kills'
    },
    health: {
        id: 'health',
        name: 'HP Remaining',
        description: 'Winner records remaining HP, loser records 0',
        scoreLabel: 'HP Remaining',
        tiesPossible: true,
        loserHasScore: false,
        higherIsBetter: true,
        requiresMaxScore: false,
        statLabel: 'Total HP Remaining',
        statLabelShort: 'HP'
    },
    winonly: {
        id: 'winonly',
        name: 'Win/Loss Only',
        description: 'Only track who won, no score needed',
        scoreLabel: 'Result',
        tiesPossible: false,
        loserHasScore: false,
        higherIsBetter: true,
        requiresMaxScore: false,
        statLabel: 'Total Wins',
        statLabelShort: 'Wins'
    },
    points: {
        id: 'points',
        name: 'Custom Points',
        description: 'Custom scoring - enter any point values',
        scoreLabel: 'Points',
        tiesPossible: true,
        loserHasScore: true,
        higherIsBetter: true,
        requiresMaxScore: false,
        statLabel: 'Total Points',
        statLabelShort: 'Points'
    }
};
export function getArchetypeConfig(archetype) {
    return SCORE_ARCHETYPES[archetype];
}
//# sourceMappingURL=gameArchetypes.js.map