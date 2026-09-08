// Tournament statistics: pure aggregation over players, matches and brackets.
//
// Extracted from src/pages/Statistics.svelte, which had grown to 5,328 lines and
// carried every outstanding type error in the project. Nothing here touches
// Svelte or the DOM, so it lives in shared/ where it can be unit-tested and
// reused; the Statistics page now imports these and only renders.
//
// `matches` / `bracketMatches` stay loosely typed on purpose: they run over
// whatever /state returned, including tournaments saved by older versions with
// fields that no longer exist.

import type { Team } from './types.js';

/** Per-player aggregate over the whole tournament (group stage + playoffs). */
export interface PlayerScoreStats {
  scoreWon: number;
  scoreLost: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesTied: number;
  bestPerformance: number;
  mapsWon: number;
  mapsLost: number;
}

/** Per-team equivalent, for team tournaments. */
export interface TeamScoreStats {
  roundsWon: number;
  roundsLost: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  mapsWon: number;
  mapsLost: number;
}

/** A win/loss/tie record between two players, from the first one's side. */
export interface HeadToHead {
  wins: number;
  losses: number;
  ties: number;
}

/** A decisive result, behind the "most dominant" highlight cards. */
export interface NotableMatch {
  player: string;
  opponent: string;
  margin: number;
  score: string;
  stage: string;
  mapName: string;
}

/** A narrow result, behind the "closest match" cards. */
export interface ClosestMatch {
  winner: string;
  loser: string;
  player1: string;
  player2: string;
  score: string;
  margin: number;
  mapName: string;
}

/** Wins and maps played for one player on one map. */
export interface MapRecord {
  wins: number;
  total: number;
}

/**
 * A map record shaped for display: derived from MapRecord plus the player's
 * average score on that map.
 */
export interface PlayerMapRecord {
  wins: number;
  losses: number;
  winRate: number;
  avgScore: number;
}

export interface AdvancedStats {
  mostDominant: NotableMatch;
  mostDominantList: NotableMatch[];
  closestMatches: ClosestMatch[];
  /** playerId -> mapName -> record */
  mapPerformance: Record<string, Record<string, MapRecord>>;
  clutchFactors: Record<string, { closeWins: number; closeLosses: number }>;
  consistencyScores: Record<string, number>;
}

/** One row of a player's history: a group match, or one map of a playoff series. */
export interface MatchHistoryEntry {
  opponent: string;
  opponentId: string;
  playerScore: number;
  opponentScore: number;
  result: 'win' | 'loss' | 'tie';
  stage: 'Groups' | 'Playoffs';
  round: string;
  isSeries: boolean;
  mapName?: string;
  gameNumber?: number;
  seriesScore?: string;
}

// Calculate total score (rounds/kills) per player across entire tournament
export function calculatePlayerScoreStats(
  players: any[],
  matches: any[],
  bracketMatches: any[],
): Record<string, PlayerScoreStats> {
  const scoreStats: Record<string, PlayerScoreStats> = {};
  
  // Initialize stats for all players
  players.forEach((p: any) => {
    scoreStats[p.id] = { 
      scoreWon: 0, 
      scoreLost: 0, 
      matchesPlayed: 0, 
      matchesWon: 0,
      matchesLost: 0,
      matchesTied: 0,
      bestPerformance: 0, 
      mapsWon: 0,
      mapsLost: 0
    };
  });

  // Group stage matches
  matches.forEach((match: any) => {
    if (!match.result || !match.completed) return;
    
    const p1Id = match.player1Id;
    const p2Id = match.player2Id;
    const p1Result = match.result[p1Id];
    const p2Result = match.result[p2Id];
    
    // Always count the match as played
    if (scoreStats[p1Id]) scoreStats[p1Id].matchesPlayed++;
    if (scoreStats[p2Id]) scoreStats[p2Id].matchesPlayed++;
    
    // Track scores if available
    if (p1Result?.score !== undefined && p2Result?.score !== undefined) {
      // Track for player 1
      if (scoreStats[p1Id]) {
        scoreStats[p1Id].scoreWon += p1Result.score;
        scoreStats[p1Id].scoreLost += p2Result.score;
        scoreStats[p1Id].bestPerformance = Math.max(scoreStats[p1Id].bestPerformance, p1Result.score);
        
        // Track match outcome
        if (p1Result.score > p2Result.score) {
          scoreStats[p1Id].matchesWon++;
          scoreStats[p1Id].mapsWon++;
        } else if (p1Result.score < p2Result.score) {
          scoreStats[p1Id].matchesLost++;
          scoreStats[p1Id].mapsLost++;
        } else {
          scoreStats[p1Id].matchesTied++;
        }
      }
      
      // Track for player 2
      if (scoreStats[p2Id]) {
        scoreStats[p2Id].scoreWon += p2Result.score;
        scoreStats[p2Id].scoreLost += p1Result.score;
        scoreStats[p2Id].bestPerformance = Math.max(scoreStats[p2Id].bestPerformance, p2Result.score);
        
        // Track match outcome
        if (p2Result.score > p1Result.score) {
          scoreStats[p2Id].matchesWon++;
          scoreStats[p2Id].mapsWon++;
        } else if (p2Result.score < p1Result.score) {
          scoreStats[p2Id].matchesLost++;
          scoreStats[p2Id].mapsLost++;
        } else {
          scoreStats[p2Id].matchesTied++;
        }
      }
    }
  });

  // Bracket matches (BO3 - each MAP counts)
  bracketMatches.forEach((match: any) => {
    if (!match.winnerId) return;
    
    const p1Id = match.player1Id;
    const p2Id = match.player2Id;
    
    // Count each map/game
    if (match.games && Array.isArray(match.games)) {
      match.games.forEach((game: any) => {
        if (game.player1Score !== undefined && game.player2Score !== undefined) {
          // Only count maps that were actually played
          if (game.player1Score === 0 && game.player2Score === 0) return;
          
          // Each map is a match
          if (scoreStats[p1Id]) {
            scoreStats[p1Id].scoreWon += game.player1Score;
            scoreStats[p1Id].scoreLost += game.player2Score;
            scoreStats[p1Id].matchesPlayed++;
            scoreStats[p1Id].bestPerformance = Math.max(scoreStats[p1Id].bestPerformance, game.player1Score);
            
            // Track map outcome
            if (game.winnerId === p1Id) {
              scoreStats[p1Id].mapsWon++;
              scoreStats[p1Id].matchesWon++;
            } else {
              scoreStats[p1Id].mapsLost++;
              scoreStats[p1Id].matchesLost++;
            }
          }
          
          if (scoreStats[p2Id]) {
            scoreStats[p2Id].scoreWon += game.player2Score;
            scoreStats[p2Id].scoreLost += game.player1Score;
            scoreStats[p2Id].matchesPlayed++;
            scoreStats[p2Id].bestPerformance = Math.max(scoreStats[p2Id].bestPerformance, game.player2Score);
            
            // Track map outcome
            if (game.winnerId === p2Id) {
              scoreStats[p2Id].mapsWon++;
              scoreStats[p2Id].matchesWon++;
            } else {
              scoreStats[p2Id].mapsLost++;
              scoreStats[p2Id].matchesLost++;
            }
          }
        }
      });
    }
  });

  return scoreStats;
}

// Calculate team stats from group and bracket matches
export function calculateTeamScoreStats(
  teams: Team[],
  matches: any[],
  bracketMatches: any[],
): Record<string, TeamScoreStats> {
  const teamStats: Record<string, TeamScoreStats> = {};
  
  // Initialize stats for all teams
  teams.forEach((t: Team) => {
    teamStats[t.id] = { 
      roundsWon: 0, 
      roundsLost: 0, 
      matchesPlayed: 0, 
      matchesWon: 0,
      matchesLost: 0,
      mapsWon: 0,
      mapsLost: 0
    };
  });

  // Group stage matches (team-based) - uses teamMatches structure
  matches.forEach((match: any) => {
    if (!match.completed) return;
    
    const t1Id = match.team1Id;
    const t2Id = match.team2Id;
    if (!t1Id || !t2Id) return; // Skip non-team matches
    
    const team1Score = match.team1Score ?? 0;
    const team2Score = match.team2Score ?? 0;
    
    // Always count the match as played
    if (teamStats[t1Id]) teamStats[t1Id].matchesPlayed++;
    if (teamStats[t2Id]) teamStats[t2Id].matchesPlayed++;
    
    // Track scores
    // Track for team 1
    if (teamStats[t1Id]) {
      teamStats[t1Id].roundsWon += team1Score;
      teamStats[t1Id].roundsLost += team2Score;
      
      // Track match outcome
      if (team1Score > team2Score) {
        teamStats[t1Id].matchesWon++;
        teamStats[t1Id].mapsWon++;
      } else if (team1Score < team2Score) {
        teamStats[t1Id].matchesLost++;
        teamStats[t1Id].mapsLost++;
      }
    }
    
    // Track for team 2
    if (teamStats[t2Id]) {
      teamStats[t2Id].roundsWon += team2Score;
      teamStats[t2Id].roundsLost += team1Score;
      
      // Track match outcome
      if (team2Score > team1Score) {
        teamStats[t2Id].matchesWon++;
        teamStats[t2Id].mapsWon++;
      } else if (team2Score < team1Score) {
        teamStats[t2Id].matchesLost++;
        teamStats[t2Id].mapsLost++;
      }
    }
  });

  // Bracket matches (BO3 - each MAP counts)
  bracketMatches.forEach((match: any) => {
    const winnerId = match.winnerTeamId || match.winnerId;
    if (!winnerId) return;
    
    const t1Id = match.team1Id;
    const t2Id = match.team2Id;
    if (!t1Id || !t2Id) return; // Skip non-team matches
    
    // Count the series
    if (teamStats[t1Id]) teamStats[t1Id].matchesPlayed++;
    if (teamStats[t2Id]) teamStats[t2Id].matchesPlayed++;
    
    // Track series win/loss
    if (winnerId === t1Id) {
      if (teamStats[t1Id]) teamStats[t1Id].matchesWon++;
      if (teamStats[t2Id]) teamStats[t2Id].matchesLost++;
    } else if (winnerId === t2Id) {
      if (teamStats[t2Id]) teamStats[t2Id].matchesWon++;
      if (teamStats[t1Id]) teamStats[t1Id].matchesLost++;
    }
    
    // Count each map/game
    if (match.games && Array.isArray(match.games)) {
      match.games.forEach((game: any) => {
        const team1Score = game.team1Score ?? game.player1Score ?? 0;
        const team2Score = game.team2Score ?? game.player2Score ?? 0;
        const gameWinnerId = game.winnerTeamId || game.winnerId;
        
        // Only count maps that were actually played
        if (team1Score === 0 && team2Score === 0) return;
        
        // Track for team 1
        if (teamStats[t1Id]) {
          teamStats[t1Id].roundsWon += team1Score;
          teamStats[t1Id].roundsLost += team2Score;
          
          // Track map outcome
          if (gameWinnerId === t1Id) {
            teamStats[t1Id].mapsWon++;
          } else if (gameWinnerId === t2Id) {
            teamStats[t1Id].mapsLost++;
          }
        }
        
        // Track for team 2
        if (teamStats[t2Id]) {
          teamStats[t2Id].roundsWon += team2Score;
          teamStats[t2Id].roundsLost += team1Score;
          
          // Track map outcome
          if (gameWinnerId === t2Id) {
            teamStats[t2Id].mapsWon++;
          } else if (gameWinnerId === t1Id) {
            teamStats[t2Id].mapsLost++;
          }
        }
      });
    }
  });

  return teamStats;
}

// Determine final tournament placement for a player
export function getTournamentPlacement(playerId: string, bracketMatches: any[], totalPlayers: number = 0): number {
  // Check if player is champion (winner of finals)
  const finals = bracketMatches.find((m: any) => m.bracketType === 'finals');
  if (finals?.winnerId === playerId) return 1;
  
  // Check if player is runner-up (loser of finals)
  if (finals?.winnerId && (finals.player1Id === playerId || finals.player2Id === playerId)) {
    return 2;
  }
  
  // For 3-player tournaments: no 3rd place match, the player who didn't make finals is 3rd
  // Check if there's no 3rd place match and player is not in finals
  const thirdPlace = bracketMatches.find((m: any) => m.bracketType === '3rd-place');
  
  if (!thirdPlace && totalPlayers === 3) {
    // No 3rd place match and exactly 3 players - the remaining player is 3rd
    if (finals && finals.player1Id !== playerId && finals.player2Id !== playerId) {
      return 3;
    }
  }
  
  // Check if player won 3rd place match
  if (thirdPlace?.winnerId === playerId) return 3;
  
  // Check if player lost 3rd place match (4th place)
  if (thirdPlace?.winnerId && (thirdPlace.player1Id === playerId || thirdPlace.player2Id === playerId)) {
    return 4;
  }
  
  // Check semifinals losers (5th-6th)
  const semis = bracketMatches.filter((m: any) => m.bracketType === 'semifinals');
  for (const semi of semis) {
    if (semi.winnerId && (semi.player1Id === playerId || semi.player2Id === playerId) && semi.winnerId !== playerId) {
      return 5;
    }
  }
  
  // Check quarterfinals losers (7th-8th)
  const quarters = bracketMatches.filter((m: any) => m.bracketType === 'quarterfinals');
  for (const quarter of quarters) {
    if (quarter.winnerId && (quarter.player1Id === playerId || quarter.player2Id === playerId) && quarter.winnerId !== playerId) {
      return 7;
    }
  }
  
  // Player didn't make playoffs - use group stage rank (high number)
  return 100;
}

// Calculate head-to-head record between two players
export function getHeadToHead(
  p1Id: string,
  p2Id: string,
  groupMatches: any[],
  bracketMatches: any[],
): HeadToHead {
  let wins = 0, losses = 0, ties = 0;
  
  // Check group matches
  groupMatches.forEach((match: any) => {
    if (match.completed && ((match.player1Id === p1Id && match.player2Id === p2Id) || (match.player1Id === p2Id && match.player2Id === p1Id))) {
      const p1Result = match.result?.[p1Id];
      const p2Result = match.result?.[p2Id];
      if (p1Result?.score !== undefined && p2Result?.score !== undefined) {
        if (p1Result.score > p2Result.score) wins++;
        else if (p1Result.score < p2Result.score) losses++;
        else ties++;
      }
    }
  });
  
  // Check bracket matches (count each map)
  bracketMatches.forEach((match: any) => {
    if ((match.player1Id === p1Id && match.player2Id === p2Id) || (match.player1Id === p2Id && match.player2Id === p1Id)) {
      const isPlayer1 = match.player1Id === p1Id;
      match.games?.forEach((game: any) => {
        if (game.winnerId === p1Id) wins++;
        else if (game.winnerId === p2Id) losses++;
      });
    }
  });
  
  return { wins, losses, ties };
}

// Calculate advanced statistics
export function calculateAdvancedStats(
  players: any[],
  groupMatches: any[],
  bracketMatches: any[],
): AdvancedStats {
  const stats: AdvancedStats = {
    mostDominant: { player: '', opponent: '', margin: 0, score: '', stage: '', mapName: '' },
    mostDominantList: [],
    closestMatches: [],
    mapPerformance: {},
    clutchFactors: {},
    consistencyScores: {},
  };
  
  // Initialize player stats - with safety check
  if (!players || !Array.isArray(players)) {
    return stats;
  }
  
  players.forEach(p => {
    if (p && p.id) {
      stats.clutchFactors[p.id] = { closeWins: 0, closeLosses: 0 };
      stats.mapPerformance[p.id] = {};
    }
  });
  
  // Analyze all matches - group matches and flattened bracket games
  const allMatches = [...groupMatches];
  
  // Add bracket match games with proper player IDs
  bracketMatches.forEach((bm: any) => {
    if (bm.games && Array.isArray(bm.games)) {
      bm.games.forEach((g: any) => {
        if (g.player1Score !== undefined && g.player2Score !== undefined) {
          allMatches.push({
            player1Id: bm.player1Id,
            player2Id: bm.player2Id,
            player1Score: g.player1Score,
            player2Score: g.player2Score,
            completed: !!bm.winnerId,
            bracketType: bm.bracketType,
            mapName: g.mapName,
            winnerId: g.winnerId
          });
        }
      });
    }
  });
  
  allMatches.forEach((match: any) => {
    if (!match.completed && !match.player1Score && !match.player2Score) return;
    if (!match.player1Id || !match.player2Id) return;
    
    const p1Score = match.result?.[match.player1Id]?.score ?? match.player1Score ?? 0;
    const p2Score = match.result?.[match.player2Id]?.score ?? match.player2Score ?? 0;
    const margin = Math.abs(p1Score - p2Score);
    const total = p1Score + p2Score;
    const mapName = match.mapName || 'Unknown';
    
    // Track map performance - with safety checks
    if (stats.mapPerformance[match.player1Id]) {
      if (!stats.mapPerformance[match.player1Id][mapName]) {
        stats.mapPerformance[match.player1Id][mapName] = { wins: 0, total: 0 };
      }
      stats.mapPerformance[match.player1Id][mapName].total++;
    }
    
    if (stats.mapPerformance[match.player2Id]) {
      if (!stats.mapPerformance[match.player2Id][mapName]) {
        stats.mapPerformance[match.player2Id][mapName] = { wins: 0, total: 0 };
      }
      stats.mapPerformance[match.player2Id][mapName].total++;
    }
    
    const winnerId = p1Score > p2Score ? match.player1Id : p2Score > p1Score ? match.player2Id : null;
    if (winnerId && stats.mapPerformance[winnerId] && stats.mapPerformance[winnerId][mapName]) {
      stats.mapPerformance[winnerId][mapName].wins++;
    }
    
    // Close match tracking (margin <= 2 for rounds/kills, or within 10% for health)
    const isClose = margin <= 2 || (total > 0 && margin / total <= 0.1);
    if (isClose && winnerId && stats.clutchFactors[winnerId]) {
      stats.clutchFactors[winnerId].closeWins++;
      const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
      if (stats.clutchFactors[loserId]) stats.clutchFactors[loserId].closeLosses++;
      
      const winnerName = players.find(p => p.id === winnerId)?.name || 'Unknown';
      const loserName = players.find(p => p.id === loserId)?.name || 'Unknown';
      
      stats.closestMatches.push({
        winner: winnerName,
        loser: loserName,
        player1: winnerName,
        player2: loserName,
        score: `${Math.max(p1Score, p2Score)}-${Math.min(p1Score, p2Score)}`,
        margin,
        mapName
      });
    }
    
    // Most dominant victory
    if (margin > 0 && winnerId) {
      stats.mostDominantList.push({
        player: players.find(p => p.id === winnerId)?.name || 'Unknown',
        opponent: players.find(p => p.id === (winnerId === match.player1Id ? match.player2Id : match.player1Id))?.name || 'Unknown',
        margin,
        score: `${Math.max(p1Score, p2Score)}-${Math.min(p1Score, p2Score)}`,
        stage: match.bracketType ? 'Playoffs' : 'Groups',
        mapName
      });
      
      if (margin > stats.mostDominant.margin) {
        stats.mostDominant = stats.mostDominantList[stats.mostDominantList.length - 1];
      }
    }
    
  });
  
  // Sort closest matches and dominant performances
  stats.closestMatches.sort((a: any, b: any) => a.margin - b.margin);
  stats.mostDominantList.sort((a: any, b: any) => b.margin - a.margin);
  
  // Calculate consistency (standard deviation of scores)
  //
  // Playoff maps have to be re-attached to their parent match first: a game
  // object holds only scores and a winner, never player1Id/player2Id. Flattening
  // bm.games directly (as this did) meant no branch below ever matched a playoff
  // map, so "consistency" was silently computed from group-stage scores alone.
  const playoffRows = bracketMatches.flatMap((bm: any) =>
    (bm.games || []).map((g: any) => ({
      player1Id: bm.player1Id,
      player2Id: bm.player2Id,
      player1Score: g.player1Score,
      player2Score: g.player2Score,
    })),
  );

  players.forEach(player => {
    const scores: number[] = [];
    [...groupMatches, ...playoffRows].forEach((match: any) => {
      if (match.player1Id === player.id && match.result?.[player.id]?.score !== undefined) {
        scores.push(match.result[player.id].score);
      } else if (match.player2Id === player.id && match.result?.[player.id]?.score !== undefined) {
        scores.push(match.result[player.id].score);
      } else if (match.player1Id === player.id && match.player1Score !== undefined) {
        scores.push(match.player1Score);
      } else if (match.player2Id === player.id && match.player2Score !== undefined) {
        scores.push(match.player2Score);
      }
    });
    
    if (scores.length > 0) {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);
      // Consistency score: inverse of coefficient of variation (lower stdDev = more consistent)
      stats.consistencyScores[player.id] = mean > 0 ? Math.max(0, 100 - (stdDev / mean * 100)) : 0;
    }
  });
  
  return stats;
}

export function getPlayerMatchHistory(
  playerId: string,
  players: any[],
  groupMatches: any[],
  bracketMatches: any[],
): MatchHistoryEntry[] {
  const history: MatchHistoryEntry[] = [];
  
  // Process group matches (single games)
  for (const match of groupMatches) {
    if (!match.completed) continue;
    
    let opponentId = '';
    let playerScore = 0;
    let opponentScore = 0;
    
    if (match.player1Id === playerId) {
      opponentId = match.player2Id;
      const p1Result = match.result?.[match.player1Id];
      const p2Result = match.result?.[match.player2Id];
      playerScore = p1Result?.score || 0;
      opponentScore = p2Result?.score || 0;
    } else if (match.player2Id === playerId) {
      opponentId = match.player1Id;
      const p1Result = match.result?.[match.player1Id];
      const p2Result = match.result?.[match.player2Id];
      playerScore = p2Result?.score || 0;
      opponentScore = p1Result?.score || 0;
    } else {
      continue;
    }
    
    const opponent = players.find((p: any) => p.id === opponentId);
    if (!opponent) continue;
    
    const result = playerScore > opponentScore ? 'win' : playerScore < opponentScore ? 'loss' : 'tie';
    
    history.push({
      opponent: opponent.name,
      opponentId,
      playerScore,
      opponentScore,
      result,
      stage: 'Groups',
      round: 'group',
      isSeries: false,
      mapName: match.mapName // Include group stage map if available
    });
  }
  
  // Process bracket matches (BO3 series - show each game)
  for (const match of bracketMatches) {
    if (!match.winnerId || !match.games || match.games.length === 0) continue;
    
    let opponentId = '';
    const isPlayer1 = match.player1Id === playerId;
    
    if (match.player1Id === playerId) {
      opponentId = match.player2Id;
    } else if (match.player2Id === playerId) {
      opponentId = match.player1Id;
    } else {
      continue;
    }
    
    const opponent = players.find((p: any) => p.id === opponentId);
    if (!opponent) continue;
    
    // Add each game in the series
    for (const game of match.games) {
      // Skip unplayed maps (an empty BO-series slot is 0-0 with no winner) so
      // they are not recorded as losses in the player's history.
      if (!game.winnerId && (game.player1Score || 0) === 0 && (game.player2Score || 0) === 0) continue;
      const playerGameScore = isPlayer1 ? game.player1Score : game.player2Score;
      const opponentGameScore = isPlayer1 ? game.player2Score : game.player1Score;
      const gameResult = game.winnerId === playerId ? 'win' : 'loss';
      
      history.push({
        opponent: opponent.name,
        opponentId,
        playerScore: playerGameScore,
        opponentScore: opponentGameScore,
        result: gameResult,
        stage: 'Playoffs',
        round: match.bracketType || 'playoff',
        isSeries: true,
        gameNumber: game.gameNumber,
        mapName: game.mapName,
        seriesScore: `${isPlayer1 ? match.player1Wins : match.player2Wins}-${isPlayer1 ? match.player2Wins : match.player1Wins}`
      });
    }
  }
  
  return history;
}
