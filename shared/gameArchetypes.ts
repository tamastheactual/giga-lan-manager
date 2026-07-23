// Score Archetypes - defines how scoring works for different game types.
//
// Single source of truth shared by the client (src/**, via the `$shared` Vite
// alias) and the server (server/**, via a relative `../shared/*.js` import).
// Do not fork this file — the two former copies (src/lib/gameArchetypes.ts and
// server/gameArchetypes.ts) had already drifted apart.

export type ScoreArchetype = 'rounds' | 'kills' | 'health' | 'winonly' | 'points' | 'team-rounds' | 'team-kills';

export interface ArchetypeConfig {
  id: ScoreArchetype;
  name: string;
  description: string;
  scoreLabel: string;

  // Scoring behavior
  tiesPossible: boolean;      // Can matches end in a tie?
  loserHasScore: boolean;     // Does the loser have a meaningful score? (false for winonly/health)
  higherIsBetter: boolean;    // Is higher score better? (always true for our cases)

  // Input constraints
  requiresMaxScore: boolean;  // Does this archetype need a max score limit?
  defaultMaxScore?: number;   // Default max if required

  // Statistics
  statLabel: string;          // Label for cumulative stats (e.g., "Total Kills")
  statLabelShort: string;     // Short label (e.g., "Kills")

  // Team game properties
  isTeamBased?: boolean;      // Whether this archetype requires team mode
  trackPlayerStats?: boolean; // Whether to track individual K/D
}

export const SCORE_ARCHETYPES: Record<ScoreArchetype, ArchetypeConfig> = {
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
    tiesPossible: true,  // Ties possible in timed matches
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
    tiesPossible: true,   // 0-0 for mutual destruction
    loserHasScore: false, // Loser always has 0
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
    tiesPossible: true,  // Ties can be agreed upon in group stage
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
  },

  'team-rounds': {
    id: 'team-rounds',
    name: 'Team Rounds',
    description: 'Team-based round game (e.g., CS 5v5) with player K/D tracking',
    scoreLabel: 'Rounds Won',
    tiesPossible: true,
    loserHasScore: true,
    higherIsBetter: true,
    requiresMaxScore: true,
    defaultMaxScore: 16,
    statLabel: 'Total Rounds Won',
    statLabelShort: 'Rounds',
    isTeamBased: true,
    trackPlayerStats: true
  },

  'team-kills': {
    id: 'team-kills',
    name: 'Team Kills/Frags',
    description: 'Team deathmatch style with player K/D tracking',
    scoreLabel: 'Team Score',
    tiesPossible: true,
    loserHasScore: true,
    higherIsBetter: true,
    requiresMaxScore: false,
    statLabel: 'Total Team Score',
    statLabelShort: 'Score',
    isTeamBased: true,
    trackPlayerStats: true
  }
};

// Helper to get archetype config
export function getArchetypeConfig(archetype: ScoreArchetype): ArchetypeConfig {
  return SCORE_ARCHETYPES[archetype];
}
