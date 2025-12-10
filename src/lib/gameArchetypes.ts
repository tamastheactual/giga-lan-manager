// Score Archetypes - defines how scoring works for different game types

export type ScoreArchetype = 'rounds' | 'kills' | 'health' | 'winonly' | 'points';

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
  }
};

// Helper to get archetype config
export function getArchetypeConfig(archetype: ScoreArchetype): ArchetypeConfig {
  return SCORE_ARCHETYPES[archetype];
}

// Helper to check if a score is valid for the archetype
export function isValidScore(
  archetype: ScoreArchetype, 
  score: number, 
  isWinner: boolean,
  maxScore?: number
): boolean {
  const config = SCORE_ARCHETYPES[archetype];
  
  // Score must be non-negative
  if (score < 0) return false;
  
  // For winonly, we don't use scores
  if (archetype === 'winonly') return true;
  
  // For health, loser must be 0 (except for 0-0 ties)
  if (archetype === 'health' && !isWinner && score !== 0) return false;
  
  // Check max score if specified
  if (maxScore !== undefined && score > maxScore) return false;
  
  return true;
}

// Helper to determine match result
export function getMatchResult(
  archetype: ScoreArchetype,
  score1: number,
  score2: number
): 'player1' | 'player2' | 'tie' {
  if (archetype === 'winonly') {
    // For winonly, one player must be marked as winner (score 1) and loser (score 0)
    if (score1 === 1 && score2 === 0) return 'player1';
    if (score2 === 1 && score1 === 0) return 'player2';
    return 'tie'; // Shouldn't happen in winonly
  }
  
  if (score1 > score2) return 'player1';
  if (score2 > score1) return 'player2';
  return 'tie';
}
