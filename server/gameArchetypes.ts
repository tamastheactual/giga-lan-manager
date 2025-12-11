// Score Archetypes - defines how scoring works for different game types
// Server-side version (mirrors src/lib/gameArchetypes.ts)

export type ScoreArchetype = 'rounds' | 'kills' | 'health' | 'winonly' | 'points' | 'team-rounds';

export interface ArchetypeConfig {
  id: ScoreArchetype;
  name: string;
  description: string;
  scoreLabel: string;
  tiesPossible: boolean;
  loserHasScore: boolean;
  higherIsBetter: boolean;
  requiresMaxScore: boolean;
  defaultMaxScore?: number;
  statLabel: string;
  statLabelShort: string;
  isTeamBased?: boolean;  // Whether this archetype requires team mode
  trackPlayerStats?: boolean;  // Whether to track individual K/D
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
  }
};

export function getArchetypeConfig(archetype: ScoreArchetype): ArchetypeConfig {
  return SCORE_ARCHETYPES[archetype];
}
