<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, getPlayerStats, type GameType, type Team, type PlayerStats, GAME_CONFIGS, getEffectiveArchetype } from '$lib/api';
  import { getPlayerImageUrl } from '$lib/playerImages';
  import { Chart, registerables } from 'chart.js';
  import { getArchetypeConfig, type ScoreArchetype } from '$lib/gameArchetypes';
  import Footer from '../components/Footer.svelte';
  import logoImg from '../assets/logo.png';

  Chart.register(...registerables);

  let { tournamentId } = $props<{ tournamentId: string }>();

  let tournamentData = $state(null) as any;
  let loading = $state(true);
  let error = $state(null) as string | null;
  let gameType = $state<GameType>('cs16');

  // Team tournament state
  let isTeamBased = $state(false);
  let teams = $state<Team[]>([]);
  let teamPlayerStats = $state<PlayerStats[]>([]);
  let statsView = $state<'teams' | 'players'>('teams'); // Toggle between team stats and player K/D

  let progressTimelineChart = $state<HTMLCanvasElement | undefined>(undefined);
  let winsTimelineChart = $state<HTMLCanvasElement | undefined>(undefined);
  let winsChartInstance = $state<Chart | null>(null);
  let teamKDChart = $state<HTMLCanvasElement | undefined>(undefined);
  let teamKDChartInstance = $state<Chart | null>(null);
  let teamRoundsChart = $state<HTMLCanvasElement | undefined>(undefined);
  let teamRoundsChartInstance = $state<Chart | null>(null);
  let teamProgressionMetric = $state<'wins' | 'rounds'>('rounds');
  let progressionMetric = $state<'wins' | 'cumulative'>('wins');
  let expandedPlayers: Set<string> = $state(new Set());
  
  // Shareable stat card state
  let showShareModal = $state(false);
  let selectedShareCard = $state<string | null>(null);
  let shareCardRef = $state<HTMLDivElement | null>(null);
  let shareImageUrl = $state<string | null>(null);
  
  function togglePlayerExpanded(playerId: string) {
    const newExpanded = new Set(expandedPlayers);
    if (newExpanded.has(playerId)) {
      newExpanded.delete(playerId);
    } else {
      newExpanded.add(playerId);
    }
    expandedPlayers = newExpanded;
  }

  // Game-specific labels - derived from tournamentData
  const gameConfig = $derived(tournamentData?.gameType ? GAME_CONFIGS[tournamentData.gameType as GameType] : GAME_CONFIGS['cs16']);
  const useCustomPoints = $derived(tournamentData?.useCustomPoints || false);
  const effectiveArchetype = $derived<ScoreArchetype>(getEffectiveArchetype(tournamentData?.gameType || 'cs16', useCustomPoints));
  const archetypeConfig = $derived(getArchetypeConfig(effectiveArchetype));
  
  // Derived archetype flags
  const isKillBased = $derived(effectiveArchetype === 'kills');
  const isHealthBased = $derived(effectiveArchetype === 'health');
  const isWinOnly = $derived(effectiveArchetype === 'winonly');
  const isPointsBased = $derived(effectiveArchetype === 'points');
  const isRoundsBased = $derived(effectiveArchetype === 'rounds');
  const scoreLabel = $derived(archetypeConfig.scoreLabel);
  const statLabel = $derived(archetypeConfig.statLabel);
  const statLabelShort = $derived(archetypeConfig.statLabelShort);
  
  // Progression metric options based on game type
  const progressionMetricOptions = $derived(() => {
    const options: { value: 'wins' | 'cumulative'; label: string }[] = [
      { value: 'wins', label: 'Wins (Maps/Matches Won)' }
    ];
    
    // For win-only games, cumulative stats don't make sense
    if (!isWinOnly) {
      options.push({ value: 'cumulative', label: statLabel });
    }
    
    return options;
  });
  
  // Get the Y-axis label based on selected metric
  const progressionYAxisLabel = $derived(() => {
    if (progressionMetric === 'wins') return 'Total Wins';
    return statLabel;
  });
  
  // Get tooltip suffix based on metric
  const progressionTooltipSuffix = $derived(() => {
    if (progressionMetric === 'wins') return ' wins';
    return ` ${statLabelShort.toLowerCase()}`;
  });

  // Calculate total score (rounds/kills) per player across entire tournament
  function calculatePlayerScoreStats(players: any[], matches: any[], bracketMatches: any[]) {
    const scoreStats: Record<string, { 
      scoreWon: number; 
      scoreLost: number; 
      matchesPlayed: number; 
      matchesWon: number;
      matchesLost: number;
      matchesTied: number;
      bestPerformance: number; 
      mapsWon: number;
      mapsLost: number;
    }> = {};
    
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
  function calculateTeamScoreStats(teams: Team[], matches: any[], bracketMatches: any[]) {
    const teamStats: Record<string, { 
      roundsWon: number; 
      roundsLost: number; 
      matchesPlayed: number; 
      matchesWon: number;
      matchesLost: number;
      mapsWon: number;
      mapsLost: number;
    }> = {};
    
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
  function getTournamentPlacement(playerId: string, bracketMatches: any[], totalPlayers: number = 0): number {
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
  function getHeadToHead(p1Id: string, p2Id: string, groupMatches: any[], bracketMatches: any[]): { wins: number; losses: number; ties: number } {
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
  function calculateAdvancedStats(players: any[], groupMatches: any[], bracketMatches: any[]) {
    const stats: any = {
      biggestComeback: { player: '', opponent: '', deficit: 0, finalScore: '', stage: '', mapName: '' },
      mostDominant: { player: '', opponent: '', margin: 0, score: '', stage: '', mapName: '' },
      mostDominantList: [] as any[],
      closestMatches: [] as any[],
      mapPerformance: {} as Record<string, Record<string, { wins: number; total: number }>>,
      clutchFactors: {} as Record<string, { closeWins: number; closeLosses: number }>,
      consistencyScores: {} as Record<string, number>
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
      
      // Comeback detection (loser had more than 60% at some theoretical point)
      // For now we approximate by checking if winner had significantly fewer points
      if (winnerId && p1Score !== p2Score) {
        const winnerScore = winnerId === match.player1Id ? p1Score : p2Score;
        const loserScore = winnerId === match.player1Id ? p2Score : p1Score;
        const deficit = loserScore - winnerScore;
        if (deficit > stats.biggestComeback.deficit && deficit > 3) {
          stats.biggestComeback = {
            player: players.find(p => p.id === winnerId)?.name || 'Unknown',
            opponent: players.find(p => p.id === (winnerId === match.player1Id ? match.player2Id : match.player1Id))?.name || 'Unknown',
            deficit,
            finalScore: `${winnerScore}-${loserScore}`,
            stage: match.bracketType ? 'Playoffs' : 'Groups',
            mapName
          };
        }
      }
    });
    
    // Sort closest matches and dominant performances
    stats.closestMatches.sort((a: any, b: any) => a.margin - b.margin);
    stats.mostDominantList.sort((a: any, b: any) => b.margin - a.margin);
    
    // Calculate consistency (standard deviation of scores)
    players.forEach(player => {
      const scores: number[] = [];
      [...groupMatches, ...bracketMatches.flatMap((bm: any) => bm.games || [])].forEach((match: any) => {
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

  let selectedPlayerForH2H = $state<string | null>(null);
  let selectedPlayer2ForH2H = $state<string | null>(null);

  function getPlayerMatchHistory(playerId: string, players: any[], groupMatches: any[], bracketMatches: any[]) {
    const history: any[] = [];
    
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

  // Compute advanced stats
  const advancedStats = $derived.by(() => {
    if (!tournamentData?.players || !Array.isArray(tournamentData.players)) return null;
    const groupMatches = Array.isArray(tournamentData.matches) ? tournamentData.matches : [];
    const bracketMatchesArr = Array.isArray(tournamentData.bracketMatches) ? tournamentData.bracketMatches : [];
    return calculateAdvancedStats(tournamentData.players, groupMatches, bracketMatchesArr);
  });

  // Compute player statistics
  const playerStats = $derived.by(() => {
    if (!tournamentData?.players || !Array.isArray(tournamentData.players)) return [];
    
    const groupMatches = Array.isArray(tournamentData.matches) ? tournamentData.matches : [];
    const bracketMatchesArr = Array.isArray(tournamentData.bracketMatches) ? tournamentData.bracketMatches : [];
    const scoreStats = calculatePlayerScoreStats(tournamentData.players, groupMatches, bracketMatchesArr);

    return tournamentData.players.map((player: any) => {
        const stats = scoreStats[player.id] || { 
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
        
        const placement = getTournamentPlacement(player.id, bracketMatchesArr, tournamentData.players.length);
        
        // Game-specific calculations based on archetype
        let gameSpecificStats: any = {};
        
        if (isWinOnly) {
          // Win-only games (Stronghold, RTS): Only track wins/losses
          gameSpecificStats = {
            matchesWon: stats.matchesWon,
            matchesLost: stats.matchesLost,
            totalMatches: stats.matchesPlayed,
            winRate: stats.matchesPlayed > 0 ? Math.round((stats.matchesWon / stats.matchesPlayed) * 100) : 0
          };
        } else if (isKillBased) {
          // Kills-based stats (UT, Quake, etc.)
          const killDiff = stats.scoreWon - stats.scoreLost;
          const killDeathRatio = stats.scoreLost > 0 ? (stats.scoreWon / stats.scoreLost) : stats.scoreWon;
          const avgKillsPerMap = stats.matchesPlayed > 0 ? stats.scoreWon / stats.matchesPlayed : 0;
          
          gameSpecificStats = {
            totalKills: stats.scoreWon,
            totalDeaths: stats.scoreLost,
            killDiff,
            kdRatio: Math.round(killDeathRatio * 100) / 100,
            avgKillsPerMap: Math.round(avgKillsPerMap * 10) / 10,
            bestGame: stats.bestPerformance,
            mapsWon: stats.mapsWon,
            winRate: stats.matchesPlayed > 0 ? Math.round((stats.mapsWon / stats.matchesPlayed) * 100) : 0
          };
        } else if (isHealthBased) {
          // HP-based stats (Worms)
          const avgHPPerWin = stats.mapsWon > 0 ? stats.scoreWon / stats.mapsWon : 0;
          const totalHP = stats.scoreWon;
          
          gameSpecificStats = {
            totalHP,
            roundsWon: stats.mapsWon,
            roundsLost: stats.mapsLost,
            avgHPPerWin: Math.round(avgHPPerWin),
            bestRound: stats.bestPerformance,
            winRate: stats.matchesPlayed > 0 ? Math.round((stats.mapsWon / stats.matchesPlayed) * 100) : 0
          };
        } else if (isPointsBased) {
          // Custom points stats
          const pointsDiff = stats.scoreWon - stats.scoreLost;
          const pointsWinRate = (stats.scoreWon + stats.scoreLost) > 0 ? 
            (stats.scoreWon / (stats.scoreWon + stats.scoreLost)) * 100 : 0;
          const avgPointsPerMatch = stats.matchesPlayed > 0 ? stats.scoreWon / stats.matchesPlayed : 0;
          
          gameSpecificStats = {
            totalPoints: stats.scoreWon,
            pointsAgainst: stats.scoreLost,
            pointsDiff,
            pointsWinRate: Math.round(pointsWinRate),
            avgPointsPerMatch: Math.round(avgPointsPerMatch * 10) / 10,
            bestMatch: stats.bestPerformance,
            mapsWon: stats.mapsWon,
            matchWinRate: stats.matchesPlayed > 0 ? Math.round((stats.mapsWon / stats.matchesPlayed) * 100) : 0
          };
        } else {
          // Rounds-based stats (CS, RtCW, Wolf:ET)
          const roundDiff = stats.scoreWon - stats.scoreLost;
          const roundWinRate = (stats.scoreWon + stats.scoreLost) > 0 ? 
            (stats.scoreWon / (stats.scoreWon + stats.scoreLost)) * 100 : 0;
          const avgRoundsPerMap = stats.matchesPlayed > 0 ? stats.scoreWon / stats.matchesPlayed : 0;
          
          gameSpecificStats = {
            totalRounds: stats.scoreWon,
            roundsLost: stats.scoreLost,
            roundDiff,
            roundWinRate: Math.round(roundWinRate),
            avgRoundsPerMap: Math.round(avgRoundsPerMap * 10) / 10,
            bestMatch: stats.bestPerformance,
            mapsWon: stats.mapsWon,
            matchWinRate: stats.matchesPlayed > 0 ? Math.round((stats.mapsWon / stats.matchesPlayed) * 100) : 0
          };
        }

        const matchHistory = getPlayerMatchHistory(player.id, tournamentData.players, groupMatches, bracketMatchesArr);
        
        // Add advanced stats for this player - with safety checks
        const clutchFactor = (advancedStats && advancedStats.clutchFactors && advancedStats.clutchFactors[player.id]) 
          ? advancedStats.clutchFactors[player.id] 
          : { closeWins: 0, closeLosses: 0 };
        const clutchRate = (clutchFactor.closeWins + clutchFactor.closeLosses) > 0 
          ? Math.round((clutchFactor.closeWins / (clutchFactor.closeWins + clutchFactor.closeLosses)) * 100) 
          : 0;
        const consistencyScore = (advancedStats && advancedStats.consistencyScores) 
          ? Math.round(advancedStats.consistencyScores[player.id] || 0) 
          : 0;
        
        // Get map performance for this player
        const playerMapPerformance: Record<string, { wins: number; losses: number; winRate: number; avgScore: number }> = {};
        if (advancedStats && advancedStats.mapPerformance && advancedStats.mapPerformance[player.id]) {
          // Calculate average score per map from match history
          const mapScores: Record<string, number[]> = {};
          
          matchHistory.forEach((match: any) => {
            if (match.mapName) {
              if (!mapScores[match.mapName]) {
                mapScores[match.mapName] = [];
              }
              mapScores[match.mapName].push(match.playerScore);
            }
          });
          
          Object.entries(advancedStats.mapPerformance[player.id]).forEach(([mapName, mapData]: [string, any]) => {
            const scores = mapScores[mapName] || [];
            const avgScore = scores.length > 0 
              ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 
              : 0;
            
            playerMapPerformance[mapName] = {
              wins: mapData.wins,
              losses: mapData.total - mapData.wins,
              winRate: mapData.total > 0 ? Math.round((mapData.wins / mapData.total) * 100) : 0,
              avgScore
            };
          });
        }
        
        return {
          ...player,
          ...gameSpecificStats,
          matchesPlayed: stats.matchesPlayed,
          matchesWon: stats.matchesWon,
          matchesLost: stats.matchesLost,
          matchesTied: stats.matchesTied,
          placement,
          matchHistory,
          clutchRate,
          consistencyScore,
          closeWins: clutchFactor.closeWins,
          closeLosses: clutchFactor.closeLosses,
          mapPerformance: playerMapPerformance
        };
      }).sort((a: any, b: any) => {
        // Primary: Tournament placement (1st, 2nd, 3rd, etc.)
        if (a.placement !== b.placement) return a.placement - b.placement;
        // Secondary: Points (group stage ranking)
        if (b.points !== a.points) return b.points - a.points;
        // Tertiary: Score/kills/HP/points won (based on archetype)
        const aScore = isWinOnly ? a.matchesWon : isKillBased ? a.totalKills : isHealthBased ? a.totalHP : isPointsBased ? a.totalPoints : a.totalRounds;
        const bScore = isWinOnly ? b.matchesWon : isKillBased ? b.totalKills : isHealthBased ? b.totalHP : isPointsBased ? b.totalPoints : b.totalRounds;
        return bScore - aScore;
      });
  });

  // Compute player highlights for solo tournaments (similar to team mvpHighlights)
  const soloPlayerHighlights = $derived.by(() => {
    if (isTeamBased || !playerStats || playerStats.length === 0) return null;
    
    // Champion - 1st place
    const champion = playerStats.find((p: any) => p.placement === 1);
    
    // Runner Up - 2nd place
    const runnerUp = playerStats.find((p: any) => p.placement === 2);
    
    // Most Dominant - highest win rate with minimum games
    const minGames = Math.max(2, Math.floor(playerStats.length / 2));
    const sortedByWinRate = [...playerStats]
      .filter((p: any) => p.matchesPlayed >= minGames)
      .sort((a: any, b: any) => {
        const aRate = a.matchesPlayed > 0 ? a.matchesWon / a.matchesPlayed : 0;
        const bRate = b.matchesPlayed > 0 ? b.matchesWon / b.matchesPlayed : 0;
        return bRate - aRate;
      });
    const mostDominant = sortedByWinRate[0];
    
    // Mr. Consistent - highest consistency score
    const sortedByConsistency = [...playerStats]
      .filter((p: any) => p.consistencyScore !== undefined && p.matchesPlayed >= 2)
      .sort((a: any, b: any) => b.consistencyScore - a.consistencyScore);
    const mostConsistent = sortedByConsistency[0];
    
    // Clutch Master - highest clutch rate with minimum close games
    const sortedByClutch = [...playerStats]
      .filter((p: any) => (p.closeWins + p.closeLosses) >= 2)
      .sort((a: any, b: any) => b.clutchRate - a.clutchRate);
    const clutchMaster = sortedByClutch[0];
    
    // Top Scorer - highest total score (rounds/kills/HP/points based on archetype)
    const sortedByScore = [...playerStats].sort((a: any, b: any) => {
      const aScore = isKillBased ? a.totalKills : isHealthBased ? a.totalHP : isPointsBased ? a.totalPoints : a.totalRounds || a.roundsWon || 0;
      const bScore = isKillBased ? b.totalKills : isHealthBased ? b.totalHP : isPointsBased ? b.totalPoints : b.totalRounds || b.roundsWon || 0;
      return bScore - aScore;
    });
    const topScorer = sortedByScore[0];
    
    // Best Single Performance - highest score in one match
    let bestSingleGame = { playerId: '', playerName: '', score: 0, opponent: '', mapName: '' };
    playerStats.forEach((player: any) => {
      if (player.matchHistory) {
        player.matchHistory.forEach((match: any) => {
          if (match.playerScore > bestSingleGame.score) {
            bestSingleGame = {
              playerId: player.id,
              playerName: player.name,
              score: match.playerScore,
              opponent: match.opponent,
              mapName: match.mapName || 'Unknown'
            };
          }
        });
      }
    });
    
    // Underdog / Dark Horse - player who beat higher-ranked opponents
    // (simplified: player with worst seed who made it furthest)
    const sortedByPlacement = [...playerStats].sort((a: any, b: any) => a.placement - b.placement);
    const topPerformers = sortedByPlacement.slice(0, 4);
    
    return {
      champion: champion ? {
        id: champion.id,
        name: champion.name,
        matchesWon: champion.matchesWon,
        matchesLost: champion.matchesLost,
        winRate: champion.matchesPlayed > 0 ? Math.round((champion.matchesWon / champion.matchesPlayed) * 100) : 0
      } : null,
      runnerUp: runnerUp ? {
        id: runnerUp.id,
        name: runnerUp.name,
        matchesWon: runnerUp.matchesWon,
        matchesLost: runnerUp.matchesLost
      } : null,
      mostDominant: mostDominant ? {
        id: mostDominant.id,
        name: mostDominant.name,
        matchesWon: mostDominant.matchesWon,
        matchesLost: mostDominant.matchesLost,
        winRate: mostDominant.matchesPlayed > 0 ? Math.round((mostDominant.matchesWon / mostDominant.matchesPlayed) * 100) : 0
      } : null,
      mostConsistent: mostConsistent ? {
        id: mostConsistent.id,
        name: mostConsistent.name,
        consistencyScore: mostConsistent.consistencyScore,
        matchesPlayed: mostConsistent.matchesPlayed
      } : null,
      clutchMaster: clutchMaster ? {
        id: clutchMaster.id,
        name: clutchMaster.name,
        clutchRate: clutchMaster.clutchRate,
        closeWins: clutchMaster.closeWins,
        closeLosses: clutchMaster.closeLosses
      } : null,
      topScorer: topScorer ? {
        id: topScorer.id,
        name: topScorer.name,
        score: isKillBased ? topScorer.totalKills : isHealthBased ? topScorer.totalHP : isPointsBased ? topScorer.totalPoints : topScorer.totalRounds || topScorer.roundsWon || 0,
        matchesPlayed: topScorer.matchesPlayed
      } : null,
      bestSingleGame: bestSingleGame.score > 0 ? bestSingleGame : null,
      // Survivor (only for score-based) - best average score per game (efficiency)
      survivor: (() => {
        if (isWinOnly) return null;
        const sorted = [...playerStats]
          .filter((p: any) => p.matchesPlayed >= 2)
          .map((p: any) => {
            const totalScore = isKillBased ? p.totalKills : isHealthBased ? p.totalHP : isPointsBased ? p.totalPoints : p.totalRounds || p.roundsWon || 0;
            return { ...p, avgScore: totalScore / p.matchesPlayed };
          })
          .sort((a, b) => b.avgScore - a.avgScore);
        const best = sorted[0];
        return best ? {
          id: best.id,
          name: best.name,
          avgScore: Math.round(best.avgScore * 10) / 10,
          matchesPlayed: best.matchesPlayed
        } : null;
      })(),
      // Worst Performer (Sacrificial Lamb) - lowest win rate with min games
      worstPerformer: (() => {
        const minGamesForWorst = Math.max(2, Math.floor(playerStats.length / 3));
        const sorted = [...playerStats]
          .filter((p: any) => p.matchesPlayed >= minGamesForWorst)
          .sort((a: any, b: any) => {
            const aRate = a.matchesPlayed > 0 ? a.matchesWon / a.matchesPlayed : 0;
            const bRate = b.matchesPlayed > 0 ? b.matchesWon / b.matchesPlayed : 0;
            return aRate - bRate;
          });
        const worst = sorted[0];
        return worst ? {
          id: worst.id,
          name: worst.name,
          matchesWon: worst.matchesWon,
          matchesLost: worst.matchesLost,
          winRate: worst.matchesPlayed > 0 ? Math.round((worst.matchesWon / worst.matchesPlayed) * 100) : 0
        } : null;
      })()
    };
  });

  // Compute team champion (winner of final bracket match)
  const teamChampion = $derived.by(() => {
    if (!isTeamBased || !tournamentData) return null;
    
    const teamBracketMatchesArr = Array.isArray(tournamentData.teamBracketMatches) ? tournamentData.teamBracketMatches : [];
    if (teamBracketMatchesArr.length === 0) return null;
    
    // Find the final match (highest round, lowest match number in that round)
    const sortedByRound = [...teamBracketMatchesArr].sort((a, b) => {
      if (b.round !== a.round) return b.round - a.round;
      return a.match - b.match;
    });
    
    const finals = sortedByRound[0];
    if (!finals || !finals.winnerTeamId) return null;
    
    const winnerTeam = teams.find(t => t.id === finals.winnerTeamId);
    const runnerUpTeamId = finals.team1Id === finals.winnerTeamId ? finals.team2Id : finals.team1Id;
    const runnerUpTeam = teams.find(t => t.id === runnerUpTeamId);
    
    // Get final score from games
    let team1Score = 0;
    let team2Score = 0;
    if (finals.games && finals.games.length > 0) {
      finals.games.forEach((game: any) => {
        if (game.winnerTeamId === finals.team1Id) team1Score++;
        else if (game.winnerTeamId === finals.team2Id) team2Score++;
      });
    }
    
    return winnerTeam ? {
      team: winnerTeam,
      runnerUp: runnerUpTeam,
      finalsScore: `${Math.max(team1Score, team2Score)}-${Math.min(team1Score, team2Score)}`
    } : null;
  });

  // Compute team standings for team tournaments
  const teamStandings = $derived.by(() => {
    if (!isTeamBased || !tournamentData || teams.length === 0) return [];
    
    // Use teamMatches and teamBracketMatches for team tournaments
    const teamGroupMatches = Array.isArray(tournamentData.teamMatches) ? tournamentData.teamMatches : [];
    const teamBracketMatchesArr = Array.isArray(tournamentData.teamBracketMatches) ? tournamentData.teamBracketMatches : [];
    const teamStats = calculateTeamScoreStats(teams, teamGroupMatches, teamBracketMatchesArr);
    
    return teams.map((team: Team) => {
      const stats = teamStats[team.id] || {
        roundsWon: 0,
        roundsLost: 0,
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        mapsWon: 0,
        mapsLost: 0
      };
      
      const roundDiff = stats.roundsWon - stats.roundsLost;
      const roundWinRate = (stats.roundsWon + stats.roundsLost) > 0 
        ? Math.round((stats.roundsWon / (stats.roundsWon + stats.roundsLost)) * 100) 
        : 0;
      const matchWinRate = stats.matchesPlayed > 0 
        ? Math.round((stats.matchesWon / stats.matchesPlayed) * 100) 
        : 0;
      
      return {
        ...team,
        roundsWon: stats.roundsWon,
        roundsLost: stats.roundsLost,
        roundDiff,
        roundWinRate,
        matchesPlayed: stats.matchesPlayed,
        matchesWon: stats.matchesWon,
        matchesLost: stats.matchesLost,
        mapsWon: stats.mapsWon,
        mapsLost: stats.mapsLost,
        matchWinRate
      };
    }).sort((a, b) => {
      // Primary: Matches won
      if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
      // Secondary: Round difference
      if (b.roundDiff !== a.roundDiff) return b.roundDiff - a.roundDiff;
      // Tertiary: Rounds won
      return b.roundsWon - a.roundsWon;
    });
  });

  // Compute MVP and highlight stats for team tournaments
  const mvpHighlights = $derived.by(() => {
    if (!isTeamBased || !tournamentData || teamPlayerStats.length === 0) return null;
    
    const players = tournamentData.players || [];
    const teamGroupMatches = Array.isArray(tournamentData.teamMatches) ? tournamentData.teamMatches : [];
    const teamBracketMatchesArr = Array.isArray(tournamentData.teamBracketMatches) ? tournamentData.teamBracketMatches : [];
    
    // Find MVP (best overall K/D)
    const sortedByKD = [...teamPlayerStats].sort((a, b) => b.kdRatio - a.kdRatio);
    const mvpPlayer = sortedByKD[0];
    const mvpPlayerData = players.find((p: any) => p.id === mvpPlayer?.playerId);
    const mvpTeam = teams.find(t => t.playerIds.includes(mvpPlayer?.playerId || ''));
    
    // Find Most Kills
    const sortedByKills = [...teamPlayerStats].sort((a, b) => b.kills - a.kills);
    const topKiller = sortedByKills[0];
    const topKillerData = players.find((p: any) => p.id === topKiller?.playerId);
    const topKillerTeam = teams.find(t => t.playerIds.includes(topKiller?.playerId || ''));
    
    // Find highest single-game K/D (best performance in a match)
    let bestSingleGame = { playerId: '', kills: 0, deaths: 0, kd: 0, mapName: '', matchInfo: '' };
    
    // Check all games from matches
    const allMatches = [...teamGroupMatches, ...teamBracketMatchesArr];
    allMatches.forEach((match: any) => {
      const games = match.games || [];
      games.forEach((game: any) => {
        const playerStats = game.playerStats || [];
        playerStats.forEach((ps: any) => {
          const kills = ps.kills || 0;
          const deaths = ps.deaths || 0;
          const kd = deaths > 0 ? kills / deaths : kills;
          if (kd > bestSingleGame.kd && kills >= 3) { // Minimum 3 kills to count
            const team1 = teams.find(t => t.id === match.team1Id);
            const team2 = teams.find(t => t.id === match.team2Id);
            bestSingleGame = {
              playerId: ps.playerId,
              kills,
              deaths,
              kd,
              mapName: game.mapName || 'Unknown Map',
              matchInfo: `${team1?.name || '?'} vs ${team2?.name || '?'}`
            };
          }
        });
      });
    });
    
    const bestGamePlayerData = players.find((p: any) => p.id === bestSingleGame.playerId);
    const bestGameTeam = teams.find(t => t.playerIds.includes(bestSingleGame.playerId));
    
    // Find best player per map
    const mapPlayerStats: Record<string, { playerId: string; kills: number; deaths: number; games: number }[]> = {};
    
    allMatches.forEach((match: any) => {
      const games = match.games || [];
      games.forEach((game: any) => {
        const mapName = game.mapName || 'Unknown';
        if (!mapPlayerStats[mapName]) mapPlayerStats[mapName] = [];
        
        const playerStats = game.playerStats || [];
        playerStats.forEach((ps: any) => {
          let existing = mapPlayerStats[mapName].find(s => s.playerId === ps.playerId);
          if (!existing) {
            existing = { playerId: ps.playerId, kills: 0, deaths: 0, games: 0 };
            mapPlayerStats[mapName].push(existing);
          }
          existing.kills += ps.kills || 0;
          existing.deaths += ps.deaths || 0;
          existing.games++;
        });
      });
    });
    
    // Get top player for each map (by K/D ratio, min 1 game)
    const mapMVPs: { mapName: string; playerId: string; playerName: string; teamName: string; kills: number; deaths: number; kd: number }[] = [];
    Object.entries(mapPlayerStats).forEach(([mapName, stats]) => {
      if (mapName === 'Unknown') return;
      const sorted = stats
        .filter(s => s.games >= 1 && s.kills >= 2)
        .sort((a, b) => {
          const kdA = a.deaths > 0 ? a.kills / a.deaths : a.kills;
          const kdB = b.deaths > 0 ? b.kills / b.deaths : b.kills;
          return kdB - kdA;
        });
      
      if (sorted.length > 0) {
        const top = sorted[0];
        const playerData = players.find((p: any) => p.id === top.playerId);
        const team = teams.find(t => t.playerIds.includes(top.playerId));
        const kd = top.deaths > 0 ? top.kills / top.deaths : top.kills;
        mapMVPs.push({
          mapName,
          playerId: top.playerId,
          playerName: playerData?.name || 'Unknown',
          teamName: team?.name || '?',
          kills: top.kills,
          deaths: top.deaths,
          kd: Math.round(kd * 100) / 100
        });
      }
    });
    
    // Find most consistent player (lowest K/D variance)
    // For now, use player with most games and positive K/D
    const consistentPlayers = [...teamPlayerStats]
      .filter(p => p.gamesPlayed >= 2 && p.kdRatio >= 1)
      .sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    const mostConsistent = consistentPlayers[0];
    const consistentPlayerData = players.find((p: any) => p.id === mostConsistent?.playerId);
    const consistentTeam = teams.find(t => t.playerIds.includes(mostConsistent?.playerId || ''));
    
    return {
      mvp: mvpPlayer ? {
        playerId: mvpPlayer.playerId,
        name: mvpPlayerData?.name || 'Unknown',
        team: mvpTeam?.name || '?',
        kills: mvpPlayer.kills,
        deaths: mvpPlayer.deaths,
        kd: mvpPlayer.kdRatio,
        games: mvpPlayer.gamesPlayed
      } : null,
      topKiller: topKiller ? {
        playerId: topKiller.playerId,
        name: topKillerData?.name || 'Unknown',
        team: topKillerTeam?.name || '?',
        kills: topKiller.kills,
        deaths: topKiller.deaths,
        games: topKiller.gamesPlayed
      } : null,
      bestSingleGame: bestSingleGame.playerId ? {
        playerId: bestSingleGame.playerId,
        name: bestGamePlayerData?.name || 'Unknown',
        team: bestGameTeam?.name || '?',
        kills: bestSingleGame.kills,
        deaths: bestSingleGame.deaths,
        kd: Math.round(bestSingleGame.kd * 100) / 100,
        mapName: bestSingleGame.mapName,
        matchInfo: bestSingleGame.matchInfo
      } : null,
      mapMVPs: mapMVPs.slice(0, 5), // Top 5 maps
      mostConsistent: mostConsistent ? {
        playerId: mostConsistent.playerId,
        name: consistentPlayerData?.name || 'Unknown',
        team: consistentTeam?.name || '?',
        kd: mostConsistent.kdRatio,
        games: mostConsistent.gamesPlayed,
        variance: 0.15 // Placeholder - lower is more consistent
      } : null,
      // Clutch Performer - best K/D in close games (round margin <= 3)
      clutchPerformer: (() => {
        const allMatches = [...teamGroupMatches, ...teamBracketMatchesArr];
        const clutchStats: Record<string, { kills: number; deaths: number; games: number }> = {};
        
        allMatches.forEach((match: any) => {
          const games = match.games || [];
          games.forEach((game: any) => {
            // Check if this was a close game (round margin <= 3)
            const score1 = game.team1Score || game.player1Score || 0;
            const score2 = game.team2Score || game.player2Score || 0;
            const margin = Math.abs(score1 - score2);
            
            if (margin <= 3 && (score1 > 0 || score2 > 0)) {
              const playerStats = game.playerStats || [];
              playerStats.forEach((ps: any) => {
                if (!clutchStats[ps.playerId]) {
                  clutchStats[ps.playerId] = { kills: 0, deaths: 0, games: 0 };
                }
                clutchStats[ps.playerId].kills += ps.kills || 0;
                clutchStats[ps.playerId].deaths += ps.deaths || 0;
                clutchStats[ps.playerId].games++;
              });
            }
          });
        });
        
        // Find player with best K/D in clutch situations (min 2 close games)
        const candidates = Object.entries(clutchStats)
          .filter(([_, stats]) => stats.games >= 2)
          .map(([playerId, stats]) => ({
            playerId,
            ...stats,
            kd: stats.deaths > 0 ? stats.kills / stats.deaths : stats.kills
          }))
          .sort((a, b) => b.kd - a.kd);
        
        if (candidates.length === 0) return null;
        
        const top = candidates[0];
        const playerData = players.find((p: any) => p.id === top.playerId);
        const team = teams.find(t => t.playerIds.includes(top.playerId));
        
        return {
          playerId: top.playerId,
          name: playerData?.name || 'Unknown',
          team: team?.name || '?',
          kills: top.kills,
          deaths: top.deaths,
          kd: Math.round(top.kd * 100) / 100,
          clutchGames: top.games
        };
      })(),
      // Additional individual stats
      survivor: (() => {
        // Player with lowest deaths per game (min 2 games)
        const candidates = teamPlayerStats.filter(p => p.gamesPlayed >= 2);
        if (candidates.length === 0) return null;
        const sorted = [...candidates].sort((a, b) => 
          (a.deaths / a.gamesPlayed) - (b.deaths / b.gamesPlayed)
        );
        const top = sorted[0];
        const playerData = players.find((p: any) => p.id === top.playerId);
        const team = teams.find(t => t.playerIds.includes(top.playerId));
        return {
          playerId: top.playerId,
          name: playerData?.name || 'Unknown',
          team: team?.name || '?',
          deaths: top.deaths,
          games: top.gamesPlayed,
          avgDeaths: Math.round((top.deaths / top.gamesPlayed) * 10) / 10
        };
      })(),
      worstKD: (() => {
        // Player with lowest K/D (min 2 games) - for fun/banter
        const candidates = teamPlayerStats.filter(p => p.gamesPlayed >= 2);
        if (candidates.length === 0) return null;
        const sorted = [...candidates].sort((a, b) => a.kdRatio - b.kdRatio);
        const bottom = sorted[0];
        const playerData = players.find((p: any) => p.id === bottom.playerId);
        const team = teams.find(t => t.playerIds.includes(bottom.playerId));
        return {
          playerId: bottom.playerId,
          name: playerData?.name || 'Unknown',
          team: team?.name || '?',
          kills: bottom.kills,
          deaths: bottom.deaths,
          kd: bottom.kdRatio,
          games: bottom.gamesPlayed
        };
      })(),
      killsPerGame: (() => {
        // Highest kills per game average
        const candidates = teamPlayerStats.filter(p => p.gamesPlayed >= 2);
        if (candidates.length === 0) return null;
        const sorted = [...candidates].sort((a, b) => 
          (b.kills / b.gamesPlayed) - (a.kills / a.gamesPlayed)
        );
        const top = sorted[0];
        const playerData = players.find((p: any) => p.id === top.playerId);
        const team = teams.find(t => t.playerIds.includes(top.playerId));
        return {
          playerId: top.playerId,
          name: playerData?.name || 'Unknown',
          team: team?.name || '?',
          kills: top.kills,
          games: top.gamesPlayed,
          avg: Math.round((top.kills / top.gamesPlayed) * 10) / 10
        };
      })(),
      teamKillLeaders: (() => {
        // Top killer from each team
        const leaders: { teamName: string; playerName: string; playerId: string; kills: number; kd: number }[] = [];
        teams.forEach(team => {
          const teamPlayers = teamPlayerStats.filter(p => team.playerIds.includes(p.playerId));
          if (teamPlayers.length === 0) return;
          const topPlayer = [...teamPlayers].sort((a, b) => b.kills - a.kills)[0];
          const playerData = players.find((p: any) => p.id === topPlayer.playerId);
          leaders.push({
            teamName: team.name,
            playerName: playerData?.name || 'Unknown',
            playerId: topPlayer.playerId,
            kills: topPlayer.kills,
            kd: topPlayer.kdRatio
          });
        });
        return leaders.sort((a, b) => b.kills - a.kills);
      })()
    };
  });

  // Compute comprehensive team analysis
  const teamAnalysis = $derived.by(() => {
    if (!isTeamBased || !tournamentData) return null;
    
    const teams: any[] = tournamentData.teams || [];
    const teamMatches: any[] = tournamentData.teamMatches || [];
    const teamBracketMatches: any[] = tournamentData.teamBracketMatches || [];
    
    if (teams.length === 0) return null;
    
    // Collect all matches including bracket games
    const allMatches: any[] = [...teamMatches];
    teamBracketMatches.forEach((series: any) => {
      if (series.games && Array.isArray(series.games)) {
        series.games.forEach((game: any, idx: number) => {
          if ((game.team1Score > 0 || game.team2Score > 0)) {
            allMatches.push({
              ...game,
              team1Id: series.team1Id,
              team2Id: series.team2Id,
              mapName: game.mapName || `Game ${idx + 1}`,
              isBracket: true
            });
          }
        });
      }
    });
    
    if (allMatches.length === 0) return null;
    
    // === Head-to-Head Analysis ===
    const headToHead: { team1: string; team2: string; team1Name: string; team2Name: string; team1Wins: number; team2Wins: number; totalGames: number }[] = [];
    const h2hMap = new Map<string, { team1Wins: number; team2Wins: number; games: number }>();
    
    allMatches.forEach((match: any) => {
      const t1 = match.team1Id;
      const t2 = match.team2Id;
      if (!t1 || !t2) return;
      
      const key = [t1, t2].sort().join('|');
      const existing = h2hMap.get(key) || { team1Wins: 0, team2Wins: 0, games: 0 };
      existing.games++;
      
      const score1 = match.team1Score ?? 0;
      const score2 = match.team2Score ?? 0;
      
      if (score1 > score2) {
        if ([t1, t2].sort()[0] === t1) existing.team1Wins++;
        else existing.team2Wins++;
      } else if (score2 > score1) {
        if ([t1, t2].sort()[0] === t1) existing.team2Wins++;
        else existing.team1Wins++;
      }
      
      h2hMap.set(key, existing);
    });
    
    h2hMap.forEach((data, key) => {
      const [t1Id, t2Id] = key.split('|');
      const team1 = teams.find(t => t.id === t1Id);
      const team2 = teams.find(t => t.id === t2Id);
      headToHead.push({
        team1: t1Id,
        team2: t2Id,
        team1Name: team1?.name || 'Unknown',
        team2Name: team2?.name || 'Unknown',
        team1Wins: data.team1Wins,
        team2Wins: data.team2Wins,
        totalGames: data.games
      });
    });
    
    // Sort by most games played
    headToHead.sort((a, b) => b.totalGames - a.totalGames);
    
    // === Map Performance Analysis ===
    const mapStats = new Map<string, Map<string, { wins: number; losses: number; roundsFor: number; roundsAgainst: number }>>();
    
    allMatches.forEach((match: any) => {
      const mapName = match.mapName || 'Unknown Map';
      const t1 = match.team1Id;
      const t2 = match.team2Id;
      const score1 = match.team1Score ?? 0;
      const score2 = match.team2Score ?? 0;
      
      if (!mapStats.has(mapName)) {
        mapStats.set(mapName, new Map());
      }
      const mapTeams = mapStats.get(mapName)!;
      
      [{ id: t1, for: score1, against: score2, won: score1 > score2 },
       { id: t2, for: score2, against: score1, won: score2 > score1 }].forEach(({ id, for: f, against: a, won }) => {
        if (!id) return;
        const existing = mapTeams.get(id) || { wins: 0, losses: 0, roundsFor: 0, roundsAgainst: 0 };
        existing.roundsFor += f;
        existing.roundsAgainst += a;
        if (won) existing.wins++;
        else if (a > f) existing.losses++;
        mapTeams.set(id, existing);
      });
    });
    
    // Find best team per map
    const bestOnMap: { mapName: string; teamName: string; teamId: string; wins: number; losses: number; winRate: number }[] = [];
    mapStats.forEach((teamData, mapName) => {
      let bestTeam = { teamId: '', wins: 0, losses: 0, winRate: 0 };
      teamData.forEach((stats, teamId) => {
        const total = stats.wins + stats.losses;
        const winRate = total > 0 ? (stats.wins / total) * 100 : 0;
        if (total >= 1 && (winRate > bestTeam.winRate || (winRate === bestTeam.winRate && stats.wins > bestTeam.wins))) {
          bestTeam = { teamId, wins: stats.wins, losses: stats.losses, winRate };
        }
      });
      if (bestTeam.teamId) {
        const team = teams.find(t => t.id === bestTeam.teamId);
        bestOnMap.push({
          mapName,
          teamName: team?.name || 'Unknown',
          teamId: bestTeam.teamId,
          wins: bestTeam.wins,
          losses: bestTeam.losses,
          winRate: Math.round(bestTeam.winRate)
        });
      }
    });
    
    // === Closest Matches (smallest margin) ===
    const matchesWithMargin = allMatches.map((match: any) => {
      const score1 = match.team1Score ?? 0;
      const score2 = match.team2Score ?? 0;
      const margin = Math.abs(score1 - score2);
      const total = score1 + score2;
      const team1 = teams.find(t => t.id === match.team1Id);
      const team2 = teams.find(t => t.id === match.team2Id);
      return {
        team1Name: team1?.name || 'Unknown',
        team2Name: team2?.name || 'Unknown',
        score1,
        score2,
        margin,
        totalRounds: total,
        mapName: match.mapName || 'Unknown',
        winnerId: score1 > score2 ? match.team1Id : match.team2Id
      };
    }).filter(m => m.totalRounds > 0);
    
    const closestMatches = [...matchesWithMargin]
      .sort((a, b) => a.margin - b.margin || b.totalRounds - a.totalRounds)
      .slice(0, 5);
    
    // === Most Dominant Victories ===
    const dominantWins = [...matchesWithMargin]
      .sort((a, b) => b.margin - a.margin || b.totalRounds - a.totalRounds)
      .slice(0, 5);
    
    // === Team Round Efficiency (rounds won per match) ===
    const teamEfficiency: { teamId: string; teamName: string; avgRoundsWon: number; avgRoundsLost: number; matchCount: number; efficiency: number }[] = [];
    const efficiencyMap = new Map<string, { roundsWon: number; roundsLost: number; matches: number }>();
    
    allMatches.forEach((match: any) => {
      const t1 = match.team1Id;
      const t2 = match.team2Id;
      const score1 = match.team1Score ?? 0;
      const score2 = match.team2Score ?? 0;
      
      if (t1) {
        const existing = efficiencyMap.get(t1) || { roundsWon: 0, roundsLost: 0, matches: 0 };
        existing.roundsWon += score1;
        existing.roundsLost += score2;
        existing.matches++;
        efficiencyMap.set(t1, existing);
      }
      if (t2) {
        const existing = efficiencyMap.get(t2) || { roundsWon: 0, roundsLost: 0, matches: 0 };
        existing.roundsWon += score2;
        existing.roundsLost += score1;
        existing.matches++;
        efficiencyMap.set(t2, existing);
      }
    });
    
    efficiencyMap.forEach((data, teamId) => {
      const team = teams.find(t => t.id === teamId);
      const avgWon = data.matches > 0 ? data.roundsWon / data.matches : 0;
      const avgLost = data.matches > 0 ? data.roundsLost / data.matches : 0;
      const efficiency = avgLost > 0 ? avgWon / avgLost : avgWon;
      teamEfficiency.push({
        teamId,
        teamName: team?.name || 'Unknown',
        avgRoundsWon: Math.round(avgWon * 10) / 10,
        avgRoundsLost: Math.round(avgLost * 10) / 10,
        matchCount: data.matches,
        efficiency: Math.round(efficiency * 100) / 100
      });
    });
    
    teamEfficiency.sort((a, b) => b.efficiency - a.efficiency);
    
    // === Winning/Losing Streaks ===
    const teamStreaks = new Map<string, { current: number; best: number; worst: number; lastResult: 'W' | 'L' | null }>();
    
    // Sort matches by some order if available (for now, process in order)
    allMatches.forEach((match: any) => {
      const t1 = match.team1Id;
      const t2 = match.team2Id;
      const score1 = match.team1Score ?? 0;
      const score2 = match.team2Score ?? 0;
      
      const processTeam = (teamId: string, won: boolean) => {
        if (!teamId) return;
        const streak = teamStreaks.get(teamId) || { current: 0, best: 0, worst: 0, lastResult: null };
        
        if (won) {
          if (streak.lastResult === 'W') streak.current++;
          else streak.current = 1;
          streak.lastResult = 'W';
          if (streak.current > streak.best) streak.best = streak.current;
        } else {
          if (streak.lastResult === 'L') streak.current--;
          else streak.current = -1;
          streak.lastResult = 'L';
          if (streak.current < streak.worst) streak.worst = streak.current;
        }
        
        teamStreaks.set(teamId, streak);
      };
      
      if (score1 > score2) {
        processTeam(t1, true);
        processTeam(t2, false);
      } else if (score2 > score1) {
        processTeam(t1, false);
        processTeam(t2, true);
      }
    });
    
    const streakLeaders: { teamName: string; bestStreak: number; worstStreak: number; currentStreak: number }[] = [];
    teamStreaks.forEach((data, teamId) => {
      const team = teams.find(t => t.id === teamId);
      streakLeaders.push({
        teamName: team?.name || 'Unknown',
        bestStreak: data.best,
        worstStreak: Math.abs(data.worst),
        currentStreak: data.current
      });
    });
    streakLeaders.sort((a, b) => b.bestStreak - a.bestStreak);
    
    return {
      headToHead: headToHead.slice(0, 10),
      bestOnMap,
      closestMatches,
      dominantWins,
      teamEfficiency: teamEfficiency.slice(0, 10),
      streakLeaders: streakLeaders.slice(0, 5),
      totalMapsPlayed: allMatches.length
    };
  });

  // Compute match statistics
  const matchStats = $derived.by(() => {
    if (!tournamentData) return null;
    
    // Use appropriate data source based on tournament type
    const groupMatches = isTeamBased 
      ? (Array.isArray(tournamentData.teamMatches) ? tournamentData.teamMatches : [])
      : (Array.isArray(tournamentData.matches) ? tournamentData.matches : []);
    const bracketMatchesArr = isTeamBased
      ? (Array.isArray(tournamentData.teamBracketMatches) ? tournamentData.teamBracketMatches : [])
      : (Array.isArray(tournamentData.bracketMatches) ? tournamentData.bracketMatches : []);

      // Count actual maps played in brackets (not just series count)
      let bracketMapsPlayed = 0;
      let completedBracketMaps = 0;
      bracketMatchesArr.forEach((match: any) => {
        if (match.games && Array.isArray(match.games) && match.games.length > 0) {
          // Count maps that were actually played (non-zero scores)
          const playedGames = match.games.filter((g: any) => {
            const score1 = g.team1Score ?? g.player1Score ?? 0;
            const score2 = g.team2Score ?? g.player2Score ?? 0;
            return score1 > 0 || score2 > 0;
          });
          bracketMapsPlayed += playedGames.length;
          const winnerId = match.winnerTeamId || match.winnerId;
          if (winnerId) {
            completedBracketMaps += playedGames.length;
          }
        } else {
          const winnerId = match.winnerTeamId || match.winnerId;
          if (winnerId) {
            // Fallback: legacy data without games array - estimate 2 maps per completed series
            bracketMapsPlayed += 2;
            completedBracketMaps += 2;
          }
        }
      });

      const totalMatches = groupMatches.length + bracketMapsPlayed;
      const completedGroupMatches = groupMatches.filter((m: any) => m.completed === true).length;
      const totalCompleted = completedGroupMatches + completedBracketMaps;

      // Calculate total score (rounds/kills) played in tournament
      let totalScorePlayed = 0;
      let highestScore = 0;
      let closestMatch = { diff: Infinity, score: '' };

      groupMatches.forEach((match: any) => {
        if (match.completed) {
          // Team matches have team1Score/team2Score directly
          // Player matches have result[playerId].score
          let score1 = 0, score2 = 0;
          
          if (isTeamBased) {
            score1 = match.team1Score ?? 0;
            score2 = match.team2Score ?? 0;
          } else if (match.result) {
            const scores = Object.values(match.result).map((r: any) => r?.score || 0);
            if (scores.length === 2) {
              score1 = scores[0];
              score2 = scores[1];
            }
          }
          
          if (score1 > 0 || score2 > 0) {
            totalScorePlayed += score1 + score2;
            highestScore = Math.max(highestScore, score1, score2);
            const diff = Math.abs(score1 - score2);
            if (diff < closestMatch.diff && diff > 0) {
              closestMatch = { diff, score: `${Math.max(score1, score2)}-${Math.min(score1, score2)}` };
            }
          }
        }
      });

      bracketMatchesArr.forEach((match: any) => {
        const winnerId = match.winnerTeamId || match.winnerId;
        if (winnerId && match.games) {
          match.games.forEach((game: any) => {
            const score1 = game.team1Score ?? game.player1Score ?? 0;
            const score2 = game.team2Score ?? game.player2Score ?? 0;
            if (score1 > 0 || score2 > 0) {
              totalScorePlayed += score1 + score2;
              highestScore = Math.max(highestScore, score1, score2);
            }
          });
        }
      });

      return {
        totalMatches,
        completedMatches: totalCompleted,
        completionRate: totalMatches > 0 ? Math.round((totalCompleted / totalMatches) * 100) : 0,
        groupMatches: groupMatches.length,
        bracketMatches: bracketMapsPlayed,
        bracketSeries: bracketMatchesArr.length,
        totalScorePlayed,
        avgScorePerMatch: totalCompleted > 0 ? Math.round(totalScorePlayed / totalCompleted * 10) / 10 : 0,
        highestScore,
        closestMatch: closestMatch.diff < Infinity ? closestMatch.score : 'N/A'
      };
  });

  // Compute group statistics
  const groupStats = $derived.by(() => {
    if (!tournamentData?.pods || !Array.isArray(tournamentData.pods) || !tournamentData.players || !Array.isArray(tournamentData.players)) {
      return [];
    }
    
    return tournamentData.pods.map((pod: any) => {
        const podMatches = Array.isArray(tournamentData.matches) ? tournamentData.matches.filter((m: any) => m.podId === pod.id) : [];
        const completedMatches = podMatches.filter((m: any) => m.completed === true).length;
        
        // Calculate total score (rounds/kills) in this group
        let totalScore = 0;
        podMatches.forEach((match: any) => {
          if (match.result && match.completed) {
            Object.values(match.result).forEach((r: any) => {
              totalScore += r?.score || 0;
            });
          }
        });

        return {
          ...pod,
          totalMatches: podMatches.length,
          completedMatches,
          completionRate: podMatches.length > 0 ? Math.round((completedMatches / podMatches.length) * 100) : 0,
          totalScore,
          avgScorePerMatch: completedMatches > 0 ? Math.round(totalScore / completedMatches * 10) / 10 : 0
        };
      });
  });

  // Compute tournament overview
  const tournamentOverview = $derived(tournamentData ? {
    name: tournamentData.name || 'Unknown Tournament',
    state: tournamentData.state || 'unknown',
    playerCount: Array.isArray(tournamentData.players) ? tournamentData.players.length : 0,
    groupCount: Array.isArray(tournamentData.pods) ? tournamentData.pods.length : 0,
    gameType: tournamentData.gameType || 'cs16',
    isCompleted: tournamentData.state === 'completed'
  } : null);

  async function loadTournamentData() {
    try {
      loading = true;
      error = null;
      tournamentData = await getState(tournamentId);
      
      // Load team-specific data
      isTeamBased = tournamentData.isTeamBased || false;
      teams = tournamentData.teams || [];
      
      // Load player K/D stats for team tournaments
      if (isTeamBased) {
        try {
          teamPlayerStats = await getPlayerStats(tournamentId);
        } catch (e) {
          console.log('Player stats not available yet');
          teamPlayerStats = [];
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load tournament data';
      console.error('Error loading tournament data:', err);
    } finally {
      loading = false;
    }
  }

  // Export tournament data as JSON file
  function exportTournamentData() {
    if (!tournamentData) return;
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      tournamentId,
      ...tournamentData
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tournament-${tournamentData.name?.replace(/[^a-z0-9]/gi, '-') || tournamentId}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Open share modal for a specific card type (team tournaments)
  function openShareModal(cardType: string) {
    selectedShareCard = cardType;
    showShareModal = true;
  }

  // Close share modal
  function closeShareModal() {
    showShareModal = false;
    selectedShareCard = null;
    shareImageUrl = null;
    isSoloShare = false;
  }

  // Open share modal for solo player highlights (reuses same modal)
  let isSoloShare = $state(false);
  
  function openSoloShareModal(cardType: string) {
    selectedShareCard = cardType;
    isSoloShare = true;
    showShareModal = true;
  }

  // Copy share card to clipboard (works for both team and solo)
  async function copyShareCard() {
    if (!selectedShareCard) return;
    
    // Get correct data source based on mode
    const cardData = isSoloShare 
      ? (soloPlayerHighlights as any)?.[selectedShareCard]
      : (mvpHighlights as any)?.[selectedShareCard];
    
    if (!cardData) return;
    
    let text = `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⚡ AI DEPARTMENT LAN SERIES\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `🏆 ${tournamentData?.name || 'Tournament'}\n\n`;
    
    const soloCardTitles: Record<string, string> = {
      champion: '👑 TOURNAMENT CHAMPION',
      runnerUp: '🥈 RUNNER UP',
      mostConsistent: '📊 MR. CONSISTENT',
      clutchMaster: '⏱️ CLUTCH KING',
      topScorer: '🔥 TOP SCORER',
      bestSingleGame: '📈 BEST SINGLE GAME',
      mostDominant: '💪 MOST DOMINANT',
      survivor: '🛡️ SURVIVOR',
      worstPerformer: '😅 SACRIFICIAL LAMB'
    };
    
    const teamCardTitles: Record<string, string> = {
      mvp: '⭐ TOURNAMENT MVP',
      topKiller: '🔥 TOP FRAGGER',
      killsPerGame: '💀 THE TERMINATOR',
      survivor: '🛡️ THE SURVIVOR',
      clutchPerformer: '⏱️ CLUTCH KING',
      bestSingleGame: '📈 BEST SINGLE GAME',
      mostConsistent: '📊 MR. CONSISTENT',
      worstKD: '😅 NEEDS PRACTICE'
    };
    
    const cardTitles = isSoloShare ? soloCardTitles : teamCardTitles;
    
    text += `${cardTitles[selectedShareCard] || selectedShareCard}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    if (isSoloShare) {
      // Solo player stats
      if (selectedShareCard === 'bestSingleGame') {
        text += `👤 ${cardData.playerName}\n\n`;
        text += `🎯 Score: ${cardData.score}\n`;
        text += `⚔️ vs ${cardData.opponent}\n`;
        text += `🗺️ Map: ${cardData.mapName}\n`;
      } else {
        text += `👤 ${cardData.name}\n\n`;
        if (cardData.winRate !== undefined) text += `📊 Win Rate: ${cardData.winRate}%\n`;
        if (cardData.matchesWon !== undefined) text += `✅ Wins: ${cardData.matchesWon}\n`;
        if (cardData.matchesLost !== undefined) text += `❌ Losses: ${cardData.matchesLost}\n`;
        if (cardData.score !== undefined) text += `🔥 Total Score: ${cardData.score}\n`;
        if (cardData.consistencyScore !== undefined) text += `📊 Consistency: ${Math.round(cardData.consistencyScore / 10)}/10\n`;
        if (cardData.clutchRate !== undefined) text += `⚡ Clutch Rate: ${cardData.clutchRate}%\n`;
        if (cardData.closeWins !== undefined) text += `🏆 Close Game Wins: ${cardData.closeWins}\n`;
        if (cardData.avgScore !== undefined) text += `📈 Avg Score/Game: ${cardData.avgScore}\n`;
        if (cardData.matchesPlayed !== undefined) text += `🎮 Games Played: ${cardData.matchesPlayed}\n`;
      }
    } else {
      // Team player stats
      text += `👤 ${cardData.name}\n`;
      text += `🎮 ${cardData.team}\n\n`;
      
      if (cardData.kd !== undefined) text += `📊 K/D Ratio: ${typeof cardData.kd === 'number' ? cardData.kd.toFixed(2) : cardData.kd}\n`;
      if (cardData.kills !== undefined) text += `💀 Kills: ${cardData.kills}\n`;
      if (cardData.deaths !== undefined) text += `☠️ Deaths: ${cardData.deaths}\n`;
      if (cardData.games !== undefined) text += `🎯 Games: ${cardData.games}\n`;
      if (cardData.clutchGames !== undefined) text += `⚡ Clutch Games: ${cardData.clutchGames}\n`;
      if (cardData.avg !== undefined) text += `🔥 Kills/Game: ${cardData.avg.toFixed(1)}\n`;
      if (cardData.avgDeaths !== undefined) text += `🛡️ Deaths/Game: ${cardData.avgDeaths.toFixed(1)}\n`;
    }
    
    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⚡ Powered by AI Department\n`;
    text += `   giga-lan-manager`;
    
    try {
      await navigator.clipboard.writeText(text);
      alert('Stats copied to clipboard!');
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  }

  // Download share card as PNG image using Canvas API
  async function downloadShareCard() {
    if (!selectedShareCard) return;
    
    // Get correct data source based on mode
    const cardData = isSoloShare 
      ? (soloPlayerHighlights as any)?.[selectedShareCard]
      : (mvpHighlights as any)?.[selectedShareCard];
    if (!cardData) return;
    
    // Match the exact card config from the preview - supports both team and solo modes
    // Tailwind color hex values: yellow-500=#eab308, amber-600=#d97706, red-500=#ef4444, orange-600=#ea580c
    // orange-500=#f97316, red-600=#dc2626, blue-500=#3b82f6, cyan-600=#0891b2, purple-500=#a855f7
    // pink-600=#db2777, cyan-500=#06b6d4, emerald-500=#10b981, teal-600=#0d9488, gray-500=#6b7280, gray-600=#4b5563
    const teamConfigs: Record<string, { title: string; gradientColors: string[]; iconType: string }> = {
      mvp: { title: 'TOURNAMENT MVP', gradientColors: ['#eab308', '#d97706'], iconType: 'star' },           // yellow-500 to amber-600
      topKiller: { title: 'TOP FRAGGER', gradientColors: ['#ef4444', '#ea580c'], iconType: 'lightning' },   // red-500 to orange-600
      killsPerGame: { title: 'THE TERMINATOR', gradientColors: ['#f97316', '#dc2626'], iconType: 'fire' },  // orange-500 to red-600
      survivor: { title: 'THE SURVIVOR', gradientColors: ['#3b82f6', '#0891b2'], iconType: 'shield' },      // blue-500 to cyan-600
      clutchPerformer: { title: 'CLUTCH KING', gradientColors: ['#a855f7', '#db2777'], iconType: 'clock' }, // purple-500 to pink-600
      bestSingleGame: { title: 'BEST SINGLE GAME', gradientColors: ['#06b6d4', '#3b82f6'], iconType: 'trending' }, // cyan-500 to blue-600
      mostConsistent: { title: 'MR. CONSISTENT', gradientColors: ['#10b981', '#0d9488'], iconType: 'chart' }, // emerald-500 to teal-600
      worstKD: { title: 'NEEDS PRACTICE', gradientColors: ['#6b7280', '#4b5563'], iconType: 'sad' }         // gray-500 to gray-600
    };
    
    const soloConfigs: Record<string, { title: string; gradientColors: string[]; iconType: string }> = {
      champion: { title: 'TOURNAMENT CHAMPION', gradientColors: ['#eab308', '#d97706'], iconType: 'star' },   // yellow-500 to amber-600
      runnerUp: { title: 'RUNNER UP', gradientColors: ['#9ca3af', '#6b7280'], iconType: 'star' },             // gray-400 to gray-500
      mostConsistent: { title: 'MR. CONSISTENT', gradientColors: ['#10b981', '#0d9488'], iconType: 'chart' }, // emerald-500 to teal-600
      clutchMaster: { title: 'CLUTCH KING', gradientColors: ['#a855f7', '#db2777'], iconType: 'clock' },      // purple-500 to pink-600
      topScorer: { title: 'TOP SCORER', gradientColors: ['#ef4444', '#ea580c'], iconType: 'fire' },           // red-500 to orange-600
      bestSingleGame: { title: 'BEST SINGLE GAME', gradientColors: ['#06b6d4', '#3b82f6'], iconType: 'trending' }, // cyan-500 to blue-600
      mostDominant: { title: 'MOST DOMINANT', gradientColors: ['#ef4444', '#ea580c'], iconType: 'fire' },     // red-500 to orange-600
      survivor: { title: 'SURVIVOR', gradientColors: ['#3b82f6', '#0891b2'], iconType: 'shield' },            // blue-500 to cyan-600
      worstPerformer: { title: 'SACRIFICIAL LAMB', gradientColors: ['#6b7280', '#4b5563'], iconType: 'sad' }  // gray-500 to gray-600
    };
    
    const config = isSoloShare 
      ? (soloConfigs[selectedShareCard] || soloConfigs.champion)
      : (teamConfigs[selectedShareCard] || teamConfigs.mvp);
    
    // Match exact preview dimensions - wider card for better readability
    const cardWidth = 400;
    const cardHeight = 360; // Slightly taller to accommodate wider card
    const scale = 4; // High resolution for crisp output
    
    // Load images
    const loadImage = (src: string): Promise<HTMLImageElement | null> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    };
    
    const [logoImage, playerImage] = await Promise.all([
      loadImage(logoImg),
      loadImage(getPlayerImageUrl(isSoloShare 
        ? (selectedShareCard === 'bestSingleGame' ? cardData.playerName : cardData.name)
        : cardData.playerId))
    ]);
    
    const canvas = document.createElement('canvas');
    canvas.width = cardWidth * scale;
    canvas.height = cardHeight * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    
    // Background - match from-space-900 via-space-800 to-space-900
    const bgGrad = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
    bgGrad.addColorStop(0, '#0a0e1a');   // space-900
    bgGrad.addColorStop(0.5, '#121830'); // space-800
    bgGrad.addColorStop(1, '#0a0e1a');   // space-900
    ctx.fillStyle = bgGrad;
    roundRect(ctx, 0, 0, cardWidth, cardHeight, 12);
    ctx.fill();
    
    // Top gradient bar (h-1.5 = 6px)
    const topBarGrad = ctx.createLinearGradient(0, 0, cardWidth, 0);
    topBarGrad.addColorStop(0, config.gradientColors[0]);
    topBarGrad.addColorStop(1, config.gradientColors[1]);
    ctx.save();
    roundRect(ctx, 0, 0, cardWidth, 12, { tl: 12, tr: 12, bl: 0, br: 0 });
    ctx.clip();
    ctx.fillStyle = topBarGrad;
    ctx.fillRect(0, 0, cardWidth, 6);
    ctx.restore();
    
    // Header section (px-5 pt-4 pb-3 = padding 20px, top 16px, bottom 12px)
    let y = 6; // After top bar
    
    // Logo (h-8 w-8 = 32px) - maintain aspect ratio
    const logoX = 20;
    const logoY = y + 16;
    if (logoImage) {
      // Maintain aspect ratio of logo
      const logoSize = 32;
      const aspectRatio = logoImage.width / logoImage.height;
      let drawWidth = logoSize;
      let drawHeight = logoSize;
      if (aspectRatio > 1) {
        drawHeight = logoSize / aspectRatio;
      } else {
        drawWidth = logoSize * aspectRatio;
      }
      const offsetX = (logoSize - drawWidth) / 2;
      const offsetY = (logoSize - drawHeight) / 2;
      ctx.drawImage(logoImage, logoX + offsetX, logoY + offsetY, drawWidth, drawHeight);
    }
    
    // "AI DEPARTMENT" - gradient-text (brand-cyan to brand-blue gradient)
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    const gradText = ctx.createLinearGradient(logoX + 40, 0, logoX + 140, 0);
    gradText.addColorStop(0, '#23B7D1'); // brand-cyan
    gradText.addColorStop(1, '#385C94'); // brand-blue
    ctx.fillStyle = gradText;
    ctx.fillText('AI DEPARTMENT', logoX + 40, logoY + 14);
    
    // "LAN SERIES" - text-cyber-green (which is actually cyan #23B7D1)
    ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#23B7D1'; // cyber-green (actually cyan)
    ctx.fillText('LAN SERIES', logoX + 40, logoY + 28);
    
    // Right side - Tournament label and name
    ctx.textAlign = 'right';
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#6b7280'; // gray-500
    ctx.fillText('TOURNAMENT', cardWidth - 20, logoY + 10);
    
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    const tourneyName = tournamentData?.name || 'Tournament';
    ctx.fillText(tourneyName.length > 16 ? tourneyName.substring(0, 16) + '...' : tourneyName, cardWidth - 20, logoY + 26);
    ctx.textAlign = 'left';
    
    // Border line after header
    y = logoY + 44;
    ctx.strokeStyle = '#1e1e3a50'; // space-700/50
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cardWidth, y);
    ctx.stroke();
    
    // Role Badge (px-5 pt-4 = 20px padding, 16px top)
    y += 16;
    const badgeGrad = ctx.createLinearGradient(20, y, 200, y);
    badgeGrad.addColorStop(0, config.gradientColors[0]);
    badgeGrad.addColorStop(1, config.gradientColors[1]);
    
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    const titleWidth = ctx.measureText(config.title).width;
    const badgeWidth = titleWidth + 40;
    const badgeHeight = 26;
    
    // Badge shadow/glow
    ctx.shadowColor = config.gradientColors[0];
    ctx.shadowBlur = 8;
    ctx.fillStyle = badgeGrad;
    roundRect(ctx, 20, y, badgeWidth, badgeHeight, 13);
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Badge icon - draw actual SVG paths
    const iconX = 28;
    const iconY = y + 5;
    const iconSize = 16;
    ctx.save();
    ctx.translate(iconX, iconY);
    ctx.scale(iconSize / 24, iconSize / 24); // Scale from 24x24 viewBox
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (config.iconType === 'star') {
      // Star icon (filled) - M9.049 2.927c.3-.921...
      ctx.beginPath();
      ctx.moveTo(10, 2);
      ctx.lineTo(12.09, 7.26);
      ctx.lineTo(17.82, 7.63);
      ctx.lineTo(13.48, 11.41);
      ctx.lineTo(14.82, 17);
      ctx.lineTo(10, 14.27);
      ctx.lineTo(5.18, 17);
      ctx.lineTo(6.52, 11.41);
      ctx.lineTo(2.18, 7.63);
      ctx.lineTo(7.91, 7.26);
      ctx.closePath();
      ctx.fill();
    } else if (config.iconType === 'lightning') {
      // Lightning bolt - M13 10V3L4 14h7v7l9-11h-7z
      ctx.beginPath();
      ctx.moveTo(13, 10);
      ctx.lineTo(13, 3);
      ctx.lineTo(4, 14);
      ctx.lineTo(11, 14);
      ctx.lineTo(11, 21);
      ctx.lineTo(20, 10);
      ctx.lineTo(13, 10);
      ctx.stroke();
    } else if (config.iconType === 'fire') {
      // Fire - simplified flame shape
      ctx.beginPath();
      ctx.moveTo(12, 2);
      ctx.bezierCurveTo(12, 6, 16, 8, 16, 12);
      ctx.bezierCurveTo(16, 16, 13, 18, 12, 20);
      ctx.bezierCurveTo(11, 18, 8, 16, 8, 12);
      ctx.bezierCurveTo(8, 8, 12, 6, 12, 2);
      ctx.stroke();
    } else if (config.iconType === 'shield') {
      // Shield with checkmark
      ctx.beginPath();
      ctx.moveTo(12, 2);
      ctx.lineTo(20, 6);
      ctx.lineTo(20, 12);
      ctx.bezierCurveTo(20, 17, 12, 22, 12, 22);
      ctx.bezierCurveTo(12, 22, 4, 17, 4, 12);
      ctx.lineTo(4, 6);
      ctx.lineTo(12, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(9, 12);
      ctx.lineTo(11, 14);
      ctx.lineTo(15, 10);
      ctx.stroke();
    } else if (config.iconType === 'clock') {
      // Clock - circle with hands
      ctx.beginPath();
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12, 8);
      ctx.lineTo(12, 12);
      ctx.lineTo(15, 15);
      ctx.stroke();
    } else if (config.iconType === 'trending') {
      // Trending up arrow - M13 7h8m0 0v8m0-8l-8 8-4-4-6 6
      ctx.beginPath();
      ctx.moveTo(13, 7);
      ctx.lineTo(21, 7);
      ctx.lineTo(21, 15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(21, 7);
      ctx.lineTo(13, 15);
      ctx.lineTo(9, 11);
      ctx.lineTo(3, 17);
      ctx.stroke();
    } else if (config.iconType === 'chart') {
      // Bar chart
      ctx.beginPath();
      ctx.moveTo(4, 20);
      ctx.lineTo(4, 14);
      ctx.lineTo(8, 14);
      ctx.lineTo(8, 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, 20);
      ctx.lineTo(10, 10);
      ctx.lineTo(14, 10);
      ctx.lineTo(14, 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(16, 20);
      ctx.lineTo(16, 6);
      ctx.lineTo(20, 6);
      ctx.lineTo(20, 20);
      ctx.stroke();
    } else if (config.iconType === 'sad') {
      // Sad face
      ctx.beginPath();
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(9, 10, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(15, 10, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(12, 18, 4, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    }
    ctx.restore();
    
    // Badge title
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(config.title, 48, y + 18);
    
    // Player section (px-5 py-4 = 20px horizontal, 16px vertical)
    y += badgeHeight + 16;
    
    // Player avatar (w-20 h-20 = 80px, but let's use 70px to fit better)
    const avatarSize = 70;
    const avatarX = 20;
    const avatarY = y;
    
    // Avatar glow effect
    ctx.shadowColor = config.gradientColors[0];
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Avatar border
    ctx.strokeStyle = '#ffffff33'; // white/20
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw player image or fallback
    const displayName = isSoloShare 
      ? (selectedShareCard === 'bestSingleGame' ? cardData.playerName : cardData.name)
      : cardData.name;
    if (playerImage) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2 - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(playerImage, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } else {
      // Fallback initials
      const initials = displayName?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || '?';
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(initials, avatarX + avatarSize/2, avatarY + avatarSize/2 + 8);
      ctx.textAlign = 'left';
    }
    
    // Player name (text-2xl font-black = ~24px bold)
    const nameX = avatarX + avatarSize + 16;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    const playerName = displayName || 'Player';
    ctx.fillText(playerName.length > 12 ? playerName.substring(0, 12) + '...' : playerName, nameX, avatarY + 30);
    
    // Team name / Mode (text-sm text-gray-400)
    ctx.fillStyle = '#9ca3af'; // gray-400
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    const teamY = avatarY + 50;
    
    if (isSoloShare) {
      // For solo mode, show "1v1 Tournament" without team icon
      ctx.fillText('1v1 Tournament', nameX, teamY);
    } else {
      // Draw team icon SVG path (users icon from the preview)
      ctx.save();
      ctx.translate(nameX, teamY - 12);
      ctx.scale(14 / 24, 14 / 24); // Scale from 24x24 to 14px
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Center figure
      ctx.beginPath();
      ctx.arc(12, 7, 3, 0, Math.PI * 2);
      ctx.stroke();
      // Left figure head
      ctx.beginPath();
      ctx.arc(5, 9, 2, 0, Math.PI * 2);
      ctx.stroke();
      // Right figure head
      ctx.beginPath();
      ctx.arc(19, 9, 2, 0, Math.PI * 2);
      ctx.stroke();
      // Bodies (simplified arcs)
      ctx.beginPath();
      ctx.moveTo(7, 20);
      ctx.lineTo(7, 18);
      ctx.bezierCurveTo(7, 14, 17, 14, 17, 18);
      ctx.lineTo(17, 20);
      ctx.stroke();
      ctx.restore();
      
      ctx.fillText(cardData.team || 'Team', nameX + 18, teamY);
    }
    
    // Stats Grid (px-5 pb-4 = 20px padding, grid-cols-3 gap-2)
    y = avatarY + avatarSize + 16;
    const stats: { value: string; label: string; color: string }[] = [];
    
    if (isSoloShare) {
      // Solo mode stats - colors MUST match tailwind classes in preview:
      // text-cyber-green = #23B7D1, text-brand-orange = #FF914D, text-emerald-400 = #34d399
      // text-purple-400 = #c084fc, text-brand-cyan = #23B7D1, text-blue-400 = #60a5fa
      if (selectedShareCard === 'bestSingleGame') {
        if (cardData.score !== undefined) stats.push({ value: String(cardData.score), label: 'SCORE', color: '#23B7D1' }); // brand-cyan
        if (cardData.opponent) stats.push({ value: cardData.opponent.length > 8 ? cardData.opponent.substring(0, 8) + '..' : cardData.opponent, label: 'VS', color: '#ffffff' });
      } else {
        if (cardData.winRate !== undefined) stats.push({ value: `${cardData.winRate}%`, label: 'WIN RATE', color: '#23B7D1' }); // cyber-green
        if (cardData.matchesWon !== undefined) stats.push({ value: String(cardData.matchesWon), label: 'WINS', color: '#23B7D1' }); // cyber-green
        if (cardData.matchesLost !== undefined) stats.push({ value: String(cardData.matchesLost), label: 'LOSSES', color: '#FF914D' }); // brand-orange
        if (cardData.consistencyScore !== undefined && stats.length < 3) stats.push({ value: `${Math.round(cardData.consistencyScore / 10)}/10`, label: 'CONSISTENCY', color: '#34d399' }); // emerald-400
        if (cardData.clutchRate !== undefined && stats.length < 3) stats.push({ value: `${cardData.clutchRate}%`, label: 'CLUTCH', color: '#c084fc' }); // purple-400
        if (cardData.closeWins !== undefined && stats.length < 3) stats.push({ value: String(cardData.closeWins), label: 'CLOSE WINS', color: '#c084fc' }); // purple-400
        if (cardData.score !== undefined && stats.length < 3) stats.push({ value: String(cardData.score), label: 'TOTAL SCORE', color: '#23B7D1' }); // brand-cyan
        if (cardData.avgScore !== undefined && stats.length < 3) stats.push({ value: String(cardData.avgScore), label: 'AVG/GAME', color: '#60a5fa' }); // blue-400
        if (cardData.matchesPlayed !== undefined && stats.length < 3) stats.push({ value: String(cardData.matchesPlayed), label: 'GAMES', color: '#ffffff' });
      }
    } else {
      // Team mode stats - colors MUST match tailwind classes in preview:
      // text-brand-cyan = #23B7D1, text-brand-orange = #FF914D, text-purple-400 = #c084fc
      // text-orange-400 = #fb923c, text-blue-400 = #60a5fa
      if (cardData.kd !== undefined) stats.push({ 
        value: typeof cardData.kd === 'number' ? cardData.kd.toFixed(2) : String(cardData.kd), 
        label: 'K/D RATIO', 
        color: '#ffffff' 
      });
      if (cardData.kills !== undefined) stats.push({ value: String(cardData.kills), label: 'KILLS', color: '#23B7D1' }); // brand-cyan
      if (cardData.deaths !== undefined) stats.push({ value: String(cardData.deaths), label: 'DEATHS', color: '#FF914D' }); // brand-orange
      if (cardData.games !== undefined && !cardData.kd) stats.push({ value: String(cardData.games), label: 'GAMES', color: '#ffffff' });
      if (cardData.clutchGames !== undefined) stats.push({ value: String(cardData.clutchGames), label: 'CLUTCH', color: '#c084fc' }); // purple-400
      if (cardData.avg !== undefined) stats.push({ value: cardData.avg.toFixed(1), label: 'K/GAME', color: '#fb923c' }); // orange-400
      if (cardData.avgDeaths !== undefined) stats.push({ value: cardData.avgDeaths.toFixed(1), label: 'D/GAME', color: '#60a5fa' }); // blue-400
    }
    
    const numStats = Math.min(stats.length, 3);
    const gridWidth = cardWidth - 40;
    const boxGap = 8;
    const boxWidth = (gridWidth - (numStats - 1) * boxGap) / numStats;
    const boxHeight = 54;
    
    stats.slice(0, 3).forEach((stat, i) => {
      const x = 20 + i * (boxWidth + boxGap);
      
      // Box background - bg-space-800/80
      ctx.fillStyle = '#151527cc';
      roundRect(ctx, x, y, boxWidth, boxHeight, 8);
      ctx.fill();
      
      // Box border - border-space-700/50
      ctx.strokeStyle = '#1e1e3a80';
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, boxWidth, boxHeight, 8);
      ctx.stroke();
      
      // Stat value (text-xl font-black) - properly centered
      ctx.fillStyle = stat.color;
      ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stat.value, x + boxWidth/2, y + boxHeight/2 - 8);
      
      // Stat label (text-[10px] text-gray-500 uppercase) - properly centered
      ctx.fillStyle = '#6b7280';
      ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
      ctx.fillText(stat.label, x + boxWidth/2, y + boxHeight/2 + 12);
      ctx.textBaseline = 'alphabetic';
    });
    ctx.textAlign = 'left';
    
    // Footer (px-5 py-3 = 20px horizontal, 12px vertical, bg-space-800/50)
    const footerHeight = 36;
    const footerY = cardHeight - footerHeight;
    
    ctx.fillStyle = '#15152780';
    roundRect(ctx, 0, footerY, cardWidth, footerHeight, { tl: 0, tr: 0, bl: 12, br: 12 });
    ctx.fill();
    
    // Footer top border
    ctx.strokeStyle = '#1e1e3a50';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, footerY);
    ctx.lineTo(cardWidth, footerY);
    ctx.stroke();
    
    // Footer left - game name and tournament type
    ctx.fillStyle = '#9ca3af';
    ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
    const gameName = gameConfig?.name || 'Game';
    ctx.fillText(gameName, 20, footerY + 22);
    
    const gameNameWidth = ctx.measureText(gameName).width;
    ctx.fillStyle = '#4b5563'; // gray-600 for bullet
    ctx.fillText(' • ', 20 + gameNameWidth, footerY + 22);
    
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.fillText(isTeamBased ? 'Team Tournament' : '1v1 Tournament', 20 + gameNameWidth + 14, footerY + 22);
    
    // Footer right - logo and "AI Department"
    ctx.textAlign = 'right';
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.fillText('AI Department', cardWidth - 20, footerY + 22);
    
    if (logoImage) {
      const targetHeight = 14;
      const footerHeight = 32;
      // Calculate aspect ratio to maintain proper proportions
      const logoAspectRatio = logoImage.width / logoImage.height;
      const drawHeight = targetHeight;
      const drawWidth = targetHeight * logoAspectRatio;
      
      // Position: before "AI Department" text, centered vertically in footer
      const logoX = cardWidth - 20 - ctx.measureText('AI Department').width - drawWidth - 6;
      const logoY = footerY + (footerHeight - drawHeight) / 2;
      
      ctx.globalAlpha = 0.7;
      ctx.drawImage(logoImage, logoX, logoY, drawWidth, drawHeight);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
    
    // Download
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = displayName?.replace(/[^a-z0-9]/gi, '-') || 'player';
      a.download = `${config.title.replace(/\s+/g, '_')}-${fileName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png', 1.0);
  }
  
  // Helper function for rounded rectangles
  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | { tl: number; tr: number; bl: number; br: number }) {
    const radii = typeof r === 'number' ? { tl: r, tr: r, bl: r, br: r } : r;
    ctx.beginPath();
    ctx.moveTo(x + radii.tl, y);
    ctx.lineTo(x + w - radii.tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radii.tr);
    ctx.lineTo(x + w, y + h - radii.br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radii.br, y + h);
    ctx.lineTo(x + radii.bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radii.bl);
    ctx.lineTo(x, y + radii.tl);
    ctx.quadraticCurveTo(x, y, x + radii.tl, y);
    ctx.closePath();
  }

  function initializeCharts() {
    if (!tournamentData || !playerStats || playerStats.length === 0) return;

    // Only initialize the Top Players Comparison radar chart
    if (progressTimelineChart && playerStats.length > 0) {
      const ctx = progressTimelineChart.getContext('2d');
      if (ctx) {
        const topPlayers = playerStats.slice(0, Math.min(5, playerStats.length));
        
        const primaryStatLabel = isKillBased ? 'Kills' : isHealthBased ? 'HP' : 'Rounds';
        
        new Chart(ctx, {
          type: 'radar',
          data: {
            labels: ['Points', 'Maps Won', 'Win Rate %', `${primaryStatLabel}`, 'Maps Played'],
            datasets: topPlayers.map((player, index) => {
              const colors = [
                { bg: 'rgba(6, 182, 212, 0.3)', border: 'rgba(6, 182, 212, 1)', glow: 'rgba(6, 182, 212, 0.8)' },
                { bg: 'rgba(34, 197, 94, 0.3)', border: 'rgba(34, 197, 94, 1)', glow: 'rgba(34, 197, 94, 0.8)' },
                { bg: 'rgba(251, 191, 36, 0.3)', border: 'rgba(251, 191, 36, 1)', glow: 'rgba(251, 191, 36, 0.8)' },
                { bg: 'rgba(236, 72, 153, 0.3)', border: 'rgba(236, 72, 153, 1)', glow: 'rgba(236, 72, 153, 0.8)' },
                { bg: 'rgba(168, 85, 247, 0.3)', border: 'rgba(168, 85, 247, 1)', glow: 'rgba(168, 85, 247, 0.8)' }
              ];
              const color = colors[index % colors.length];
              
              // Get win rate and primary stat based on archetype
              const winRate = player.winRate || player.matchWinRate || 0;
              const primaryStat = isWinOnly ? player.matchesWon : isKillBased ? player.totalKills : isHealthBased ? player.totalHP : isPointsBased ? player.totalPoints : player.totalRounds;
              
              return {
                label: player.name,
                data: [
                  player.points,
                  player.matchesWon * 3,
                  winRate,
                  (primaryStat || 0) / 10,
                  player.matchesPlayed * 2
                ],
                backgroundColor: color.bg,
                borderColor: color.border,
                borderWidth: 3,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: color.border,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                shadowOffsetX: 0,
                shadowOffsetY: 0,
                shadowBlur: 20,
                shadowColor: color.glow
              };
            })
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { 
                  color: '#fff',
                  font: { size: 14, weight: 'bold' },
                  padding: 20,
                  usePointStyle: true
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: 'rgba(6, 182, 212, 0.5)',
                borderWidth: 2,
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 13 }
              }
            },
            scales: {
              r: {
                beginAtZero: true,
                ticks: { 
                  color: '#9ca3af',
                  backdropColor: 'transparent',
                  font: { size: 11 }
                },
                grid: { 
                  color: 'rgba(156, 163, 175, 0.2)',
                  circular: true
                },
                pointLabels: { 
                  color: '#fff',
                  font: { size: 14, weight: 'bold' }
                }
              }
            }
          }
        });
      }
    }
    
    // Initialize Points Progression Chart
    initializeProgressionChart();
  }
  
  // Separate function to initialize/update progression chart
  function initializeProgressionChart() {
    if (winsTimelineChart && tournamentData && playerStats.length > 0) {
      // Destroy existing chart if any
      if (winsChartInstance) {
        winsChartInstance.destroy();
        winsChartInstance = null;
      }
      
      const ctx = winsTimelineChart.getContext('2d');
      if (ctx) {
        // Collect ALL group matches and sort them properly by round and index
        const groupMatches = Array.isArray(tournamentData.matches) ? tournamentData.matches : [];
        
        // Create indexed matches with their original position
        const indexedMatches = groupMatches.map((match: any, index: number) => ({
          match,
          originalIndex: index,
          round: match.round || 1
        }));
        
        // Sort by round first, then by original index
        indexedMatches.sort((a, b) => {
          if (a.round !== b.round) return a.round - b.round;
          return a.originalIndex - b.originalIndex;
        });
        
        // Calculate progression through each match based on selected metric
        const playerData: Record<string, number[]> = {};
        const stages: string[] = ['Start'];
        
        playerStats.forEach(player => {
          playerData[player.id] = [0];
        });
        
        // Track match count per round for labeling
        const matchCountPerRound: Record<number, number> = {};
        
        // Process each match in sorted order
        indexedMatches.forEach(({ match, round }) => {
          // Only process completed matches
          if (match.completed && match.result) {
            matchCountPerRound[round] = (matchCountPerRound[round] || 0) + 1;
            const matchLabel = `${round}/${matchCountPerRound[round]}`;
            stages.push(matchLabel);
            
            const result = match.result;
            const p1Id = match.player1Id;
            const p2Id = match.player2Id;
            
            playerStats.forEach(player => {
              const prevValue = playerData[player.id][playerData[player.id].length - 1];
              let newValue = prevValue;
              
              if (result[p1Id] && result[p2Id]) {
                const p1Score = result[p1Id].score;
                const p2Score = result[p2Id].score;
                
                if (progressionMetric === 'wins') {
                  // Count wins
                  if (player.id === p1Id && p1Score > p2Score) {
                    newValue += 1;
                  } else if (player.id === p2Id && p2Score > p1Score) {
                    newValue += 1;
                  }
                } else if (progressionMetric === 'cumulative') {
                  // Cumulative score (rounds/kills/HP)
                  if (player.id === p1Id) {
                    newValue += p1Score;
                  } else if (player.id === p2Id) {
                    newValue += p2Score;
                  }
                }
              }
              
              playerData[player.id].push(newValue);
            });
          }
        });
        
        // Add playoff progression - track individual games/maps
        const bracketMatches = Array.isArray(tournamentData.bracketMatches) ? tournamentData.bracketMatches : [];
        let playoffMatchNumber = 0;
        
        bracketMatches.forEach((match: any) => {
          if (match.games && Array.isArray(match.games)) {
            match.games.forEach((game: any) => {
              playoffMatchNumber++;
              stages.push(`P${playoffMatchNumber}`);
              
              playerStats.forEach(player => {
                const prevValue = playerData[player.id][playerData[player.id].length - 1];
                let newValue = prevValue;
                
                const isPlayer1 = match.player1Id === player.id;
                const isPlayer2 = match.player2Id === player.id;
                
                if (progressionMetric === 'wins') {
                  if (game.winnerId && player.id === game.winnerId) {
                    newValue += 1;
                  }
                } else if (progressionMetric === 'cumulative') {
                  if (isPlayer1 && game.player1Score !== undefined) {
                    newValue += game.player1Score;
                  } else if (isPlayer2 && game.player2Score !== undefined) {
                    newValue += game.player2Score;
                  }
                }
                
                playerData[player.id].push(newValue);
              });
            });
          }
        });
        
        // Prepare datasets for ALL players
        const colors = [
          'rgba(35, 183, 209, 1)',   // brand-cyan
          'rgba(255, 145, 77, 1)',   // brand-orange
          'rgba(74, 83, 148, 1)',    // brand-purple
          'rgba(34, 197, 94, 1)',    // green
          'rgba(251, 191, 36, 1)',   // yellow
          'rgba(239, 68, 68, 1)',    // red
          'rgba(168, 85, 247, 1)',   // purple
          'rgba(59, 130, 246, 1)',   // blue
          'rgba(236, 72, 153, 1)',   // pink
          'rgba(14, 165, 233, 1)',   // sky
          'rgba(249, 115, 22, 1)',   // orange-alt
          'rgba(20, 184, 166, 1)'    // teal
        ];
        
        const datasets = playerStats.map((player, idx) => ({
          label: player.name,
          data: playerData[player.id],
          borderColor: colors[idx % colors.length],
          backgroundColor: colors[idx % colors.length].replace('1)', '0.1)'),
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 6,
          fill: false
        }));
        
        const tooltipSuffix = progressionTooltipSuffix();
        const yAxisLabel = progressionYAxisLabel();
        
        winsChartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels: stages,
            datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: 'nearest',
              intersect: true,
              axis: 'x'
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: '#fff',
                  padding: 12,
                  font: { size: 11 },
                  usePointStyle: true
                },
                onHover: (event: any, legendItem: any, legend: any) => {
                  const chart = legend.chart;
                  chart.data.datasets.forEach((dataset: any, i: number) => {
                    if (i === legendItem.datasetIndex) {
                      dataset.borderWidth = 4;
                    } else {
                      dataset.borderWidth = 1;
                    }
                  });
                  chart.update();
                },
                onLeave: (event: any, legendItem: any, legend: any) => {
                  const chart = legend.chart;
                  chart.data.datasets.forEach((dataset: any) => {
                    dataset.borderWidth = 2;
                  });
                  chart.update();
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: 'rgba(35, 183, 209, 0.5)',
                borderWidth: 2,
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                titleFont: { size: 14, weight: 'bold' },
                bodyFont: { size: 13 },
                callbacks: {
                  label: function(context: any) {
                    const value = context.parsed.y;
                    if (isNaN(value)) return context.dataset.label + ': not playing';
                    return context.dataset.label + ': ' + value + tooltipSuffix;
                  }
                }
              }
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: 'Tournament Progress',
                  color: '#9ca3af',
                  font: { size: 14, weight: 'bold' }
                },
                ticks: { 
                  color: '#9ca3af',
                  font: { size: 9 },
                  maxRotation: 90,
                  minRotation: 90,
                  autoSkip: false
                },
                grid: { 
                  color: 'rgba(156, 163, 175, 0.1)'
                }
              },
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: yAxisLabel,
                  color: '#9ca3af',
                  font: { size: 14, weight: 'bold' }
                },
                ticks: { 
                  color: '#9ca3af',
                  font: { size: 11 },
                  stepSize: progressionMetric === 'wins' ? 1 : undefined
                },
                grid: { 
                  color: 'rgba(156, 163, 175, 0.1)'
                }
              }
            }
          }
        });
      }
    }
  }
  
  // Initialize Team K/D Progression Chart
  function initializeTeamKDChart() {
    if (!teamKDChart || !isTeamBased || !tournamentData || teamPlayerStats.length === 0) return;
    
    // Destroy existing chart
    if (teamKDChartInstance) {
      teamKDChartInstance.destroy();
      teamKDChartInstance = null;
    }
    
    const ctx = teamKDChart.getContext('2d');
    if (!ctx) return;
    
    const players = tournamentData.players || [];
    const teamGroupMatches = Array.isArray(tournamentData.teamMatches) ? tournamentData.teamMatches : [];
    const teamBracketMatchesArr = Array.isArray(tournamentData.teamBracketMatches) ? tournamentData.teamBracketMatches : [];
    const allMatches = [...teamGroupMatches, ...teamBracketMatchesArr];
    
    // Track cumulative K/D per player per game
    const playerKDData: Record<string, { kills: number; deaths: number; kd: number[] }> = {};
    const stages: string[] = ['Start'];
    
    // Get top 8 players by total kills
    const topPlayers = [...teamPlayerStats]
      .sort((a, b) => b.kills - a.kills)
      .slice(0, 8);
    
    topPlayers.forEach(p => {
      playerKDData[p.playerId] = { kills: 0, deaths: 0, kd: [0] };
    });
    
    let gameIndex = 0;
    allMatches.forEach((match: any, matchIdx: number) => {
      const games = match.games || [];
      games.forEach((game: any, gIdx: number) => {
        gameIndex++;
        stages.push(`G${gameIndex}`);
        
        const playerStats = game.playerStats || [];
        topPlayers.forEach(p => {
          const stats = playerStats.find((ps: any) => ps.playerId === p.playerId);
          if (stats) {
            playerKDData[p.playerId].kills += stats.kills || 0;
            playerKDData[p.playerId].deaths += stats.deaths || 0;
          }
          const cumKills = playerKDData[p.playerId].kills;
          const cumDeaths = playerKDData[p.playerId].deaths;
          const kd = cumDeaths > 0 ? cumKills / cumDeaths : cumKills;
          playerKDData[p.playerId].kd.push(Math.round(kd * 100) / 100);
        });
      });
    });
    
    const colors = [
      'rgba(35, 183, 209, 1)',
      'rgba(255, 145, 77, 1)',
      'rgba(74, 83, 148, 1)',
      'rgba(34, 197, 94, 1)',
      'rgba(251, 191, 36, 1)',
      'rgba(239, 68, 68, 1)',
      'rgba(168, 85, 247, 1)',
      'rgba(59, 130, 246, 1)'
    ];
    
    const datasets = topPlayers.map((player, idx) => {
      const playerData = players.find((p: any) => p.id === player.playerId);
      return {
        label: playerData?.name || 'Unknown',
        data: playerKDData[player.playerId].kd,
        borderColor: colors[idx % colors.length],
        backgroundColor: colors[idx % colors.length].replace('1)', '0.1)'),
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 6,
        fill: false
      };
    });
    
    teamKDChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: stages,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          intersect: true,
          axis: 'x'
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#fff',
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle'
            },
            onHover: (event: any, legendItem: any, legend: any) => {
              const chart = legend.chart;
              chart.data.datasets.forEach((dataset: any, i: number) => {
                if (i === legendItem.datasetIndex) {
                  dataset.borderWidth = 4;
                } else {
                  dataset.borderWidth = 1;
                }
              });
              chart.update();
            },
            onLeave: (event: any, legendItem: any, legend: any) => {
              const chart = legend.chart;
              chart.data.datasets.forEach((dataset: any) => {
                dataset.borderWidth = 2;
              });
              chart.update();
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(35, 183, 209, 0.5)',
            borderWidth: 1,
            callbacks: {
              label: (context: any) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} K/D`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: '#9ca3af' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: '#9ca3af' },
            title: {
              display: true,
              text: 'Cumulative K/D Ratio',
              color: '#9ca3af'
            }
          }
        }
      }
    });
  }
  
  // Initialize Team Rounds Won Progression Chart
  function initializeTeamRoundsChart() {
    if (!teamRoundsChart || !isTeamBased || !tournamentData || teams.length === 0) return;
    
    // Destroy existing chart
    if (teamRoundsChartInstance) {
      teamRoundsChartInstance.destroy();
      teamRoundsChartInstance = null;
    }
    
    const ctx = teamRoundsChart.getContext('2d');
    if (!ctx) return;
    
    const teamGroupMatches = Array.isArray(tournamentData.teamMatches) ? tournamentData.teamMatches : [];
    const teamBracketMatchesArr = Array.isArray(tournamentData.teamBracketMatches) ? tournamentData.teamBracketMatches : [];
    const allMatches = [...teamGroupMatches, ...teamBracketMatchesArr];
    
    // Track cumulative data per team per match
    const teamData: Record<string, number[]> = {};
    const stages: string[] = ['Start'];
    
    // Initialize all teams
    teams.forEach(team => {
      teamData[team.id] = [0];
    });
    
    let matchIndex = 0;
    allMatches.forEach((match: any) => {
      matchIndex++;
      const isPlayoff = teamBracketMatchesArr.includes(match);
      stages.push(isPlayoff ? `P${matchIndex - teamGroupMatches.length}` : `M${matchIndex}`);
      
      const t1Id = match.team1Id;
      const t2Id = match.team2Id;
      const score1 = match.team1Score ?? 0;
      const score2 = match.team2Score ?? 0;
      
      // Determine winner for 'wins' mode
      const winnerId = score1 > score2 ? t1Id : score2 > score1 ? t2Id : null;
      
      teams.forEach(team => {
        const prevValue = teamData[team.id][teamData[team.id].length - 1];
        let newValue = prevValue;
        
        if (teamProgressionMetric === 'wins') {
          // Count match wins
          if (team.id === winnerId) {
            newValue += 1;
          }
        } else {
          // Count rounds/maps won
          if (team.id === t1Id) {
            newValue += score1;
          } else if (team.id === t2Id) {
            newValue += score2;
          }
        }
        
        teamData[team.id].push(newValue);
      });
    });
    
    const colors = [
      'rgba(35, 183, 209, 1)',   // brand-cyan
      'rgba(255, 145, 77, 1)',   // brand-orange
      'rgba(74, 83, 148, 1)',    // brand-purple
      'rgba(34, 197, 94, 1)',    // green
      'rgba(251, 191, 36, 1)',   // yellow
      'rgba(239, 68, 68, 1)',    // red
      'rgba(168, 85, 247, 1)',   // purple
      'rgba(59, 130, 246, 1)',   // blue
      'rgba(236, 72, 153, 1)',   // pink
      'rgba(14, 165, 233, 1)',   // sky
      'rgba(249, 115, 22, 1)',   // orange-alt
      'rgba(20, 184, 166, 1)'    // teal
    ];
    
    // Sort teams by final value for better visualization
    const sortedTeams = [...teams].sort((a, b) => {
      const aFinal = teamData[a.id]?.[teamData[a.id].length - 1] || 0;
      const bFinal = teamData[b.id]?.[teamData[b.id].length - 1] || 0;
      return bFinal - aFinal;
    });
    
    const datasets = sortedTeams.map((team, idx) => ({
      label: team.name,
      data: teamData[team.id],
      borderColor: colors[idx % colors.length],
      backgroundColor: colors[idx % colors.length].replace('1)', '0.1)'),
      tension: 0.3,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 6,
      fill: false
    }));
    
    const yAxisLabel = teamProgressionMetric === 'wins' ? 'Cumulative Matches Won' : `Cumulative ${scoreLabel}`;
    const tooltipSuffix = teamProgressionMetric === 'wins' ? ' wins' : ` ${scoreLabel.toLowerCase()}`;
    
    teamRoundsChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: stages,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          intersect: true,
          axis: 'x'
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#fff',
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle'
            },
            onHover: (event: any, legendItem: any, legend: any) => {
              const chart = legend.chart;
              chart.data.datasets.forEach((dataset: any, i: number) => {
                if (i === legendItem.datasetIndex) {
                  dataset.borderWidth = 4;
                } else {
                  dataset.borderWidth = 1;
                }
              });
              chart.update();
            },
            onLeave: (event: any, legendItem: any, legend: any) => {
              const chart = legend.chart;
              chart.data.datasets.forEach((dataset: any) => {
                dataset.borderWidth = 2;
              });
              chart.update();
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(35, 183, 209, 0.5)',
            borderWidth: 1,
            callbacks: {
              label: (context: any) => `${context.dataset.label}: ${context.parsed.y}${tooltipSuffix}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { color: '#9ca3af' }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: { 
              color: '#9ca3af',
              stepSize: teamProgressionMetric === 'wins' ? 1 : undefined
            },
            title: {
              display: true,
              text: yAxisLabel,
              color: '#9ca3af'
            }
          }
        }
      }
    });
  }
  
  // Watch for team metric changes and reinitialize chart
  function handleTeamMetricChange(newMetric: 'wins' | 'rounds') {
    teamProgressionMetric = newMetric;
    initializeTeamRoundsChart();
  }
  
  // Watch for metric changes and reinitialize chart
  function handleMetricChange(newMetric: 'wins' | 'cumulative') {
    progressionMetric = newMetric;
    initializeProgressionChart();
  }

  // Reactive effect to initialize team charts when canvas becomes available
  $effect(() => {
    if (teamKDChart && isTeamBased && teamPlayerStats.length > 0 && !teamKDChartInstance) {
      // Small delay to ensure canvas is fully rendered
      setTimeout(initializeTeamKDChart, 50);
    }
  });
  
  $effect(() => {
    if (teamRoundsChart && isTeamBased && teams.length > 0 && !teamRoundsChartInstance) {
      setTimeout(initializeTeamRoundsChart, 50);
    }
  });

  onMount(async () => {
    await loadTournamentData();
    
    // Initialize charts after data is loaded and DOM is updated
    setTimeout(() => {
      initializeCharts();
      initializeTeamKDChart();
      initializeTeamRoundsChart();
    }, 100);
  });

</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 text-gaming-text px-3 py-3 flex flex-col">
  <div class="max-w-6xl mx-auto w-full">

    <!-- Header -->
    <div class="flex justify-between items-center mb-6">
      <div>
        <a href={`/tournament/${tournamentId}`} class="text-gray-400 hover:text-cyber-green transition-colors mb-1 inline-block text-xs flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back to Dashboard
        </a>
        <div>
          <div class="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            Statistics
          </div>
          <h1 class="text-2xl font-black gradient-text flex items-center gap-2">
            {tournamentData?.name || 'Tournament'}
          </h1>
        </div>
      </div>
      
      <!-- Export Button -->
      {#if tournamentData}
        <button
          onclick={exportTournamentData}
          class="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyber-green to-brand-cyan text-space-900 font-bold rounded-lg hover:opacity-90 transition-opacity shadow-lg"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          Export JSON
        </button>
      {/if}
    </div>

    {#if loading}
      <div class="flex justify-center items-center py-20">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-cyber-green"></div>
      </div>
    {:else if error}
      <div class="glass rounded-lg p-6 text-center">
        <svg class="w-12 h-12 mx-auto mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-red-400 font-bold">Error loading statistics</p>
        <p class="text-gray-400 text-sm mt-1">{error}</p>
      </div>
    {:else if tournamentData}

      <!-- Team Tournament View Toggle -->
      {#if isTeamBased}
        <div class="flex gap-2 mb-6">
          <button
            onclick={() => statsView = 'teams'}
            class="flex-1 px-4 py-3 rounded-lg font-bold transition-all {statsView === 'teams' ? 'bg-gradient-to-r from-brand-orange to-brand-purple text-white shadow-glow-orange' : 'bg-space-700 text-gray-400 hover:bg-space-600'}"
          >
            <div class="flex items-center justify-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              Team Stats
            </div>
          </button>
          <button
            onclick={() => statsView = 'players'}
            class="flex-1 px-4 py-3 rounded-lg font-bold transition-all {statsView === 'players' ? 'bg-gradient-to-r from-brand-cyan to-cyber-green text-white shadow-glow-cyan' : 'bg-space-700 text-gray-400 hover:bg-space-600'}"
          >
            <div class="flex items-center justify-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
              Individual Stats
            </div>
          </button>
        </div>
      {/if}

      <!-- Individual Stats (Team Tournaments) -->
      {#if isTeamBased && statsView === 'players'}
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-cyan/10">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-6 h-6 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            Individual Player Statistics
          </h2>
          
          {#if teamPlayerStats.length > 0}
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-space-600 text-xs text-gray-400 uppercase">
                    <th class="text-left py-2 px-2">#</th>
                    <th class="text-left py-2 px-2">Player</th>
                    <th class="text-left py-2 px-2">Team</th>
                    <th class="text-center py-2 px-2">Kills</th>
                    <th class="text-center py-2 px-2">Deaths</th>
                    <th class="text-center py-2 px-2">K/D</th>
                    <th class="text-center py-2 px-2">Games</th>
                  </tr>
                </thead>
                <tbody>
                  {#each [...teamPlayerStats].sort((a, b) => b.kdRatio - a.kdRatio) as stat, index}
                    {@const player = tournamentData.players?.find((p: any) => p.id === stat.playerId)}
                    {@const team = teams.find(t => t.playerIds.includes(stat.playerId))}
                    <tr class="border-b border-space-700/50 hover:bg-space-700/30 transition-colors">
                      <td class="py-3 px-2">
                        <div class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm
                          {index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-space-900' :
                           index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-space-900' :
                           index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-space-900' :
                           'bg-space-600 text-gray-400'}">
                          {index + 1}
                        </div>
                      </td>
                      <td class="py-3 px-2">
                        <div class="flex items-center gap-2">
                          <img 
                            src={getPlayerImageUrl(player?.name || 'Unknown')} 
                            alt={player?.name || 'Unknown'} 
                            class="w-8 h-8 rounded-full object-cover border-2 {index === 0 ? 'border-yellow-500' : index === 1 ? 'border-gray-400' : index === 2 ? 'border-orange-500' : 'border-space-500'}"
                          />
                          <span class="font-bold text-white">{player?.name || 'Unknown'}</span>
                        </div>
                      </td>
                      <td class="py-3 px-2">
                        <span class="text-sm text-gray-400">{team?.name || '-'}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="font-bold text-cyber-green">{stat.kills}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="font-bold text-red-400">{stat.deaths}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="font-black {stat.kdRatio >= 1.5 ? 'text-cyber-green' : stat.kdRatio >= 1 ? 'text-yellow-400' : 'text-red-400'}">{stat.kdRatio.toFixed(2)}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="text-gray-400">{stat.gamesPlayed}</span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="text-center py-8 text-gray-400">
              <svg class="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
              <p>No player stats recorded yet</p>
              <p class="text-sm text-gray-500 mt-1">K/D stats will appear after matches are played</p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Team Analysis (Team Tournaments - Team Stats view) -->
      {#if isTeamBased && statsView === 'teams' && teamAnalysis}
        
        <!-- Team Champion Banner (shown when tournament has a winner) -->
        {#if teamChampion}
          <div class="glass-card rounded-xl p-6 mb-6 border-2 border-yellow-500/30 bg-gradient-to-br from-yellow-900/20 via-space-800 to-orange-900/20 relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-transparent to-orange-500/5"></div>
            <div class="relative flex items-center gap-6 flex-wrap">
              <!-- Trophy Icon -->
              <div class="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-yellow-500/30">
                <svg class="w-10 h-10 text-space-900" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 3h14v2h-1v1c0 2.21-1.79 4-4 4h-4c-2.21 0-4-1.79-4-4V5H5V3zm2 3h10V5H7v1zm8 7c.55 0 1 .45 1 1v2h-1v4h-6v-4H8v-2c0-.55.45-1 1-1h6zM4 8h2v1c0 1.66 1.34 3 3 3h6c1.66 0 3-1.34 3-3V8h2v3c0 1.66-1.34 3-3 3h-1v2c0 1.1-.9 2-2 2h-4c-1.1 0-2-.9-2-2v-2H7c-1.66 0-3-1.34-3-3V8z"/>
                </svg>
              </div>
              
              <!-- Champion Info -->
              <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                  </svg>
                  Tournament Champions
                </div>
                <h2 class="text-3xl font-black text-white mb-2">{teamChampion.team.name}</h2>
                <div class="flex items-center gap-4 flex-wrap">
                  {#if teamChampion.runnerUp}
                    <div class="text-sm text-gray-400">
                      Defeated <span class="text-gray-200 font-bold">{teamChampion.runnerUp.name}</span> in Finals
                      {#if teamChampion.finalsScore !== '0-0'}
                        <span class="text-yellow-400 font-bold ml-1">({teamChampion.finalsScore})</span>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
              
              <!-- Team Members -->
              <div class="flex -space-x-2">
                {#each teamChampion.team.playerIds?.slice(0, 5) || [] as playerId}
                  {@const player = tournamentData?.players?.find((p: any) => p.id === playerId)}
                  {#if player}
                    <img 
                      src={getPlayerImageUrl(player.name)} 
                      alt={player.name}
                      title={player.name}
                      class="w-10 h-10 rounded-full border-2 border-yellow-500/50 object-cover"
                      onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(player?.name || '?')}&background=random`; }}
                    />
                  {/if}
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- Tournament Overview for Teams -->
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-orange/10">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-6 h-6 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            Team Tournament Overview
          </h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div class="bg-gradient-to-br from-brand-orange/20 to-brand-orange/10 rounded-lg p-4 text-center border border-brand-orange/30">
              <div class="text-3xl font-black text-brand-orange">{tournamentData?.teams?.length || 0}</div>
              <div class="text-xs text-gray-400 uppercase tracking-wider">Teams</div>
            </div>
            <div class="bg-gradient-to-br from-brand-cyan/20 to-brand-cyan/10 rounded-lg p-4 text-center border border-brand-cyan/30">
              <div class="text-3xl font-black text-brand-cyan">{tournamentOverview?.playerCount || 0}</div>
              <div class="text-xs text-gray-400 uppercase tracking-wider">Players</div>
            </div>
            <div class="bg-gradient-to-br from-brand-purple/20 to-brand-purple/10 rounded-lg p-4 text-center border border-brand-purple/30">
              <div class="text-3xl font-black text-brand-purple">{teamAnalysis.totalMapsPlayed}</div>
              <div class="text-xs text-gray-400 uppercase tracking-wider">Maps Played</div>
            </div>
            <div class="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-lg p-4 text-center border border-green-500/30">
              <div class="text-3xl font-black text-green-400">{matchStats?.completionRate || 0}%</div>
              <div class="text-xs text-gray-400 uppercase tracking-wider">Complete</div>
            </div>
          </div>
          <!-- Secondary Stats Row -->
          <div class="grid grid-cols-3 gap-3">
            <div class="bg-space-700/50 rounded-lg p-3 text-center">
              <div class="text-xl font-bold text-yellow-400">{teamAnalysis.headToHead.length}</div>
              <div class="text-xs text-gray-400">Matchups</div>
            </div>
            <div class="bg-space-700/50 rounded-lg p-3 text-center">
              <div class="text-xl font-bold text-cyan-400">{teamAnalysis.bestOnMap.length}</div>
              <div class="text-xs text-gray-400">Unique Maps</div>
            </div>
            <div class="bg-space-700/50 rounded-lg p-3 text-center">
              <div class="text-xl font-bold text-purple-400">{tournamentData?.teamBracketMatches?.length || 0}</div>
              <div class="text-xs text-gray-400">Playoff Matches</div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Tournament Highlights (for team stats view) -->
      {#if isTeamBased && statsView === 'teams' && advancedStats && matchStats}
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-cyan/10">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
            </svg>
            Team Highlights
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- Best Team (by win rate) -->
            {#if teamStandings.length > 0}
              <div class="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 rounded-lg p-4 border border-yellow-500/20">
                <div class="flex items-center gap-2 mb-2">
                  <svg class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                  </svg>
                  <div class="text-xs font-bold text-yellow-400 uppercase">Top Team</div>
                </div>
                <div class="text-white font-bold text-lg mb-1">{teamStandings[0].name}</div>
                <div class="flex gap-3 text-sm">
                  <span class="text-yellow-400 font-bold">{teamStandings[0].matchWinRate}% Win</span>
                  <span class="text-gray-400">{teamStandings[0].matchesWon}W-{teamStandings[0].matchesLost}L</span>
                </div>
              </div>
            {/if}

            <!-- Total Rounds Played -->
            <div class="bg-gradient-to-br from-cyan-900/30 to-cyan-800/20 rounded-lg p-4 border border-cyan-500/20">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                <div class="text-xs font-bold text-cyan-400 uppercase">Total {scoreLabel}s</div>
              </div>
              <div class="text-3xl font-black text-white">{matchStats.totalScorePlayed}</div>
              <div class="text-xs text-gray-400">Avg {(matchStats.totalScorePlayed / (matchStats.completedMatches || 1)).toFixed(1)} per match</div>
            </div>

            <!-- Best Series Performance -->
            <div class="bg-gradient-to-br from-red-900/30 to-red-800/20 rounded-lg p-4 border border-red-500/20">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                </svg>
                <div class="text-xs font-bold text-red-400 uppercase">Best Performance</div>
              </div>
              <div class="text-3xl font-black text-white">{matchStats.highestScore}</div>
              <div class="text-xs text-gray-400">{scoreLabel}s in one map</div>
            </div>

            <!-- Closest Head-to-Head -->
            {#if teamAnalysis && teamAnalysis.headToHead.length > 0}
              {@const closestH2H = [...teamAnalysis.headToHead].sort((a, b) => {
                const aDiff = Math.abs(a.team1Wins - a.team2Wins);
                const bDiff = Math.abs(b.team1Wins - b.team2Wins);
                return aDiff - bDiff;
              })[0]}
              {#if closestH2H && closestH2H.team1Wins + closestH2H.team2Wins > 0}
                <div class="bg-gradient-to-br from-orange-900/30 to-orange-800/20 rounded-lg p-4 border border-orange-500/20">
                  <div class="flex items-center gap-2 mb-2">
                    <svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <div class="text-xs font-bold text-orange-400 uppercase">Closest Rivalry</div>
                  </div>
                  <div class="text-white font-bold text-sm mb-1">
                    {closestH2H.team1Name} vs {closestH2H.team2Name}
                  </div>
                  <div class="text-xs text-gray-400">{closestH2H.team1Wins}-{closestH2H.team2Wins} series</div>
                </div>
              {/if}
            {/if}

            <!-- Group Stage Summary -->
            {#if (tournamentData?.teamMatches?.length || 0) > 0}
              <div class="bg-gradient-to-br from-emerald-900/30 to-emerald-800/20 rounded-lg p-4 border border-emerald-500/20">
                <div class="flex items-center gap-2 mb-2">
                  <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                  </svg>
                  <div class="text-xs font-bold text-emerald-400 uppercase">Group Stage</div>
                </div>
                <div class="text-3xl font-black text-white">{tournamentData?.teamMatches?.length || 0}</div>
                <div class="text-xs text-gray-400">matches played</div>
              </div>
            {/if}

            <!-- Playoff Bracket -->
            {#if (tournamentData?.teamBracketMatches?.length || 0) > 0}
              <div class="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-lg p-4 border border-purple-500/20">
                <div class="flex items-center gap-2 mb-2">
                  <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                  </svg>
                  <div class="text-xs font-bold text-purple-400 uppercase">Playoffs</div>
                </div>
                <div class="text-3xl font-black text-white">{tournamentData?.teamBracketMatches?.length || 0}</div>
                <div class="text-xs text-gray-400">bracket matches</div>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Team Standings (Team Tournaments - Team Stats view) -->
      {#if isTeamBased && statsView === 'teams'}
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-orange/10">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-6 h-6 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            Team Standings
          </h2>
          
          {#if teamStandings.length > 0}
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-space-600 text-xs text-gray-400 uppercase">
                    <th class="text-left py-2 px-2">#</th>
                    <th class="text-left py-2 px-2">Team</th>
                    <th class="text-center py-2 px-2">W</th>
                    <th class="text-center py-2 px-2">L</th>
                    <th class="text-center py-2 px-2">Win%</th>
                    <th class="text-center py-2 px-2">{scoreLabel} Won</th>
                    <th class="text-center py-2 px-2">{scoreLabel} Lost</th>
                    <th class="text-center py-2 px-2">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {#each teamStandings as team, index}
                    <tr class="border-b border-space-700/50 hover:bg-space-700/30 transition-colors">
                      <td class="py-3 px-2">
                        <div class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm
                          {index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-space-900' :
                           index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-space-900' :
                           index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-space-900' :
                           'bg-space-600 text-gray-400'}">
                          {index + 1}
                        </div>
                      </td>
                      <td class="py-3 px-2">
                        <div class="flex items-center gap-2">
                          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-brand-orange to-brand-purple flex items-center justify-center text-white font-bold text-sm">
                            {team.name?.charAt(0) || '?'}
                          </div>
                          <span class="font-bold text-white">{team.name}</span>
                        </div>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="font-bold text-cyber-green">{team.matchesWon}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="font-bold text-red-400">{team.matchesLost}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="font-black {team.matchWinRate >= 60 ? 'text-cyber-green' : team.matchWinRate >= 40 ? 'text-yellow-400' : 'text-red-400'}">{team.matchWinRate}%</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="text-cyber-green">{team.roundsWon}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="text-red-400">{team.roundsLost}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="font-bold {team.roundDiff > 0 ? 'text-cyber-green' : team.roundDiff < 0 ? 'text-red-400' : 'text-gray-400'}">
                          {team.roundDiff > 0 ? '+' : ''}{team.roundDiff}
                        </span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <div class="text-center py-8 text-gray-400">
              <svg class="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <p>No team stats recorded yet</p>
              <p class="text-sm text-gray-500 mt-1">Team stats will appear after matches are played</p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Team Progression Chart (Team Tournaments - Team Stats view) -->
      {#if isTeamBased && statsView === 'teams' && teams.length > 0}
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-cyan/10">
          <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 class="text-xl font-bold text-white flex items-center gap-2">
              <svg class="w-6 h-6 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
              Team Progression
            </h2>
            
            <!-- Metric Selector -->
            <div class="flex items-center gap-2">
              <label for="team-progression-metric" class="text-sm text-gray-400">Show:</label>
              <select
                id="team-progression-metric"
                class="bg-space-700 border border-space-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 focus:border-brand-cyan"
                value={teamProgressionMetric}
                onchange={(e) => handleTeamMetricChange((e.target as HTMLSelectElement).value as 'wins' | 'rounds')}
              >
                <option value="wins">Matches Won</option>
                <option value="rounds">{scoreLabel}</option>
              </select>
            </div>
          </div>
          <div class="bg-space-700/50 rounded-lg p-6">
            <div class="h-[350px]">
              <canvas bind:this={teamRoundsChart}></canvas>
            </div>
          </div>
        </div>
      {/if}

      <!-- Additional Team Analysis (Team Tournaments - Team Stats view) -->
      {#if isTeamBased && statsView === 'teams' && teamAnalysis}
        <!-- Head-to-Head Records -->
        {#if teamAnalysis.headToHead.length > 0}
          <div class="glass-card rounded-xl p-6 mb-6 border border-cyan-500/10">
            <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <svg class="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/>
              </svg>
              Head-to-Head Records
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              {#each teamAnalysis.headToHead as h2h}
                <div class="bg-space-700/50 rounded-lg p-4 border border-space-600">
                  <div class="flex items-center justify-between">
                    <div class="flex-1 text-center">
                      <span class="font-bold text-white text-sm">{h2h.team1Name}</span>
                      <div class="text-2xl font-black {h2h.team1Wins > h2h.team2Wins ? 'text-cyber-green' : h2h.team1Wins < h2h.team2Wins ? 'text-red-400' : 'text-yellow-400'}">{h2h.team1Wins}</div>
                    </div>
                    <div class="px-4 text-gray-500 text-sm">vs</div>
                    <div class="flex-1 text-center">
                      <span class="font-bold text-white text-sm">{h2h.team2Name}</span>
                      <div class="text-2xl font-black {h2h.team2Wins > h2h.team1Wins ? 'text-cyber-green' : h2h.team2Wins < h2h.team1Wins ? 'text-red-400' : 'text-yellow-400'}">{h2h.team2Wins}</div>
                    </div>
                  </div>
                  <div class="text-center text-xs text-gray-500 mt-2">{h2h.totalGames} game{h2h.totalGames !== 1 ? 's' : ''} played</div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Team Round Efficiency -->
        {#if teamAnalysis.teamEfficiency.length > 0}
          <div class="glass-card rounded-xl p-6 mb-6 border border-green-500/10">
            <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <svg class="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
              Round Efficiency
            </h2>
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-space-600 text-xs text-gray-400 uppercase">
                    <th class="text-left py-2 px-2">#</th>
                    <th class="text-left py-2 px-2">Team</th>
                    <th class="text-center py-2 px-2">Avg {scoreLabel} Won</th>
                    <th class="text-center py-2 px-2">Avg {scoreLabel} Lost</th>
                    <th class="text-center py-2 px-2">Efficiency</th>
                    <th class="text-center py-2 px-2">Games</th>
                  </tr>
                </thead>
                <tbody>
                  {#each teamAnalysis.teamEfficiency as team, index}
                    <tr class="border-b border-space-700/50 hover:bg-space-700/30 transition-colors">
                      <td class="py-3 px-2">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs
                          {index === 0 ? 'bg-gradient-to-br from-green-400 to-green-600 text-space-900' :
                           'bg-space-600 text-gray-400'}">
                          {index + 1}
                        </div>
                      </td>
                      <td class="py-3 px-2">
                        <span class="font-bold text-white">{team.teamName}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="text-cyber-green font-bold">{team.avgRoundsWon}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="text-red-400 font-bold">{team.avgRoundsLost}</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="font-black {team.efficiency >= 1.5 ? 'text-cyber-green' : team.efficiency >= 1 ? 'text-yellow-400' : 'text-red-400'}">{team.efficiency}x</span>
                      </td>
                      <td class="py-3 px-2 text-center">
                        <span class="text-gray-400">{team.matchCount}</span>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        <!-- Map Dominance -->
        {#if teamAnalysis.bestOnMap.length > 0}
          <div class="glass-card rounded-xl p-6 mb-6 border border-purple-500/10">
            <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <svg class="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
              </svg>
              Map Specialists
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {#each teamAnalysis.bestOnMap as mapData}
                <div class="bg-space-700/50 rounded-lg p-4 border border-purple-500/20">
                  <div class="text-xs text-purple-400 font-bold uppercase tracking-wider mb-1">{mapData.mapName}</div>
                  <div class="text-white font-bold">{mapData.teamName}</div>
                  <div class="flex items-center gap-2 mt-2 text-sm">
                    <span class="text-cyber-green">{mapData.wins}W</span>
                    <span class="text-gray-500">/</span>
                    <span class="text-red-400">{mapData.losses}L</span>
                    <span class="text-gray-500">|</span>
                    <span class="font-bold {mapData.winRate >= 75 ? 'text-cyber-green' : mapData.winRate >= 50 ? 'text-yellow-400' : 'text-red-400'}">{mapData.winRate}%</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Win Streaks -->
        {#if teamAnalysis.streakLeaders.length > 0}
          <div class="glass-card rounded-xl p-6 mb-6 border border-orange-500/10">
            <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
              <svg class="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/>
              </svg>
              Win Streaks
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {#each teamAnalysis.streakLeaders as team}
                <div class="bg-space-700/50 rounded-lg p-4 border border-orange-500/20">
                  <div class="text-white font-bold mb-2">{team.teamName}</div>
                  <div class="flex items-center gap-4 text-sm">
                    <div>
                      <span class="text-gray-400 text-xs">Best</span>
                      <div class="text-cyber-green font-bold">{team.bestStreak}W</div>
                    </div>
                    <div>
                      <span class="text-gray-400 text-xs">Worst</span>
                      <div class="text-red-400 font-bold">{team.worstStreak}L</div>
                    </div>
                    <div>
                      <span class="text-gray-400 text-xs">Current</span>
                      <div class="font-bold {team.currentStreak > 0 ? 'text-cyber-green' : team.currentStreak < 0 ? 'text-red-400' : 'text-gray-400'}">
                        {team.currentStreak > 0 ? `${team.currentStreak}W` : team.currentStreak < 0 ? `${Math.abs(team.currentStreak)}L` : '-'}
                      </div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/if}

      <!-- MVP & Player Highlights (Team Tournaments - Individual Stats view) -->
      {#if isTeamBased && statsView === 'players' && mvpHighlights}
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-purple/10">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-6 h-6 text-brand-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
            Player Highlights
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <!-- Tournament MVP -->
            {#if mvpHighlights.mvp}
              <div class="bg-gradient-to-br from-yellow-900/40 to-yellow-800/20 rounded-lg p-4 border border-yellow-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openShareModal('mvp')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-yellow-500/20 text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-yellow-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(mvpHighlights.mvp.playerId)} 
                    alt={mvpHighlights.mvp.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-yellow-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(mvpHighlights.mvp?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                      <span class="text-xs font-bold text-yellow-400 uppercase tracking-wider">MVP</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{mvpHighlights.mvp.name}</div>
                    <div class="text-xs text-gray-400 truncate">{mvpHighlights.mvp.team}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-yellow-500/20">
                  <span class="text-yellow-400 font-bold">{mvpHighlights.mvp.kd.toFixed(2)} K/D</span>
                  <span class="text-gray-400">{mvpHighlights.mvp.kills}K / {mvpHighlights.mvp.deaths}D</span>
                </div>
              </div>
            {/if}

            <!-- Top Fragger -->
            {#if mvpHighlights.topKiller}
              <div class="bg-gradient-to-br from-red-900/40 to-red-800/20 rounded-lg p-4 border border-red-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openShareModal('topKiller')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(mvpHighlights.topKiller.playerId)} 
                    alt={mvpHighlights.topKiller.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-red-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(mvpHighlights.topKiller?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                      </svg>
                      <span class="text-xs font-bold text-red-400 uppercase tracking-wider">Top Fragger</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{mvpHighlights.topKiller.name}</div>
                    <div class="text-xs text-gray-400 truncate">{mvpHighlights.topKiller.team}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-red-500/20">
                  <span class="text-red-400 font-bold">{mvpHighlights.topKiller.kills} Kills</span>
                  <span class="text-gray-400">in {mvpHighlights.topKiller.games} games</span>
                </div>
              </div>
            {/if}

            <!-- The Terminator - Kills Per Game -->
            {#if mvpHighlights.killsPerGame}
              <div class="bg-gradient-to-br from-orange-900/40 to-orange-800/20 rounded-lg p-4 border border-orange-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openShareModal('killsPerGame')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-orange-500/20 text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-orange-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(mvpHighlights.killsPerGame.playerId)} 
                    alt={mvpHighlights.killsPerGame.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-orange-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(mvpHighlights.killsPerGame?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/>
                      </svg>
                      <span class="text-xs font-bold text-orange-400 uppercase tracking-wider">Terminator</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{mvpHighlights.killsPerGame.name}</div>
                    <div class="text-xs text-gray-400 truncate">{mvpHighlights.killsPerGame.team}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-orange-500/20">
                  <span class="text-orange-400 font-bold">{mvpHighlights.killsPerGame.avg.toFixed(1)} K/G</span>
                  <span class="text-gray-400">{mvpHighlights.killsPerGame.kills} in {mvpHighlights.killsPerGame.games}g</span>
                </div>
              </div>
            {/if}

            <!-- The Survivor -->
            {#if mvpHighlights.survivor}
              <div class="bg-gradient-to-br from-blue-900/40 to-blue-800/20 rounded-lg p-4 border border-blue-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openShareModal('survivor')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-blue-500/20 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(mvpHighlights.survivor.playerId)} 
                    alt={mvpHighlights.survivor.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-blue-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(mvpHighlights.survivor?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                      </svg>
                      <span class="text-xs font-bold text-blue-400 uppercase tracking-wider">Survivor</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{mvpHighlights.survivor.name}</div>
                    <div class="text-xs text-gray-400 truncate">{mvpHighlights.survivor.team}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-blue-500/20">
                  <span class="text-blue-400 font-bold">{mvpHighlights.survivor.avgDeaths.toFixed(1)} D/G</span>
                  <span class="text-gray-400">{mvpHighlights.survivor.deaths}D in {mvpHighlights.survivor.games}g</span>
                </div>
              </div>
            {/if}

            <!-- Clutch Performer -->
            {#if mvpHighlights.clutchPerformer}
              <div class="bg-gradient-to-br from-purple-900/40 to-purple-800/20 rounded-lg p-4 border border-purple-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openShareModal('clutchPerformer')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-purple-500/20 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-purple-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(mvpHighlights.clutchPerformer.playerId)} 
                    alt={mvpHighlights.clutchPerformer.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-purple-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(mvpHighlights.clutchPerformer?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span class="text-xs font-bold text-purple-400 uppercase tracking-wider">Clutch King</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{mvpHighlights.clutchPerformer.name}</div>
                    <div class="text-xs text-gray-400 truncate">{mvpHighlights.clutchPerformer.team}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-purple-500/20">
                  <span class="text-purple-400 font-bold">{mvpHighlights.clutchPerformer.kd} K/D</span>
                  <span class="text-gray-400">{mvpHighlights.clutchPerformer.clutchGames} close games</span>
                </div>
              </div>
            {/if}

            <!-- Best Single Game Performance -->
            {#if mvpHighlights.bestSingleGame}
              <div class="bg-gradient-to-br from-cyan-900/40 to-cyan-800/20 rounded-lg p-4 border border-cyan-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openShareModal('bestSingleGame')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-cyan-500/20 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-cyan-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(mvpHighlights.bestSingleGame.playerId)} 
                    alt={mvpHighlights.bestSingleGame.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-cyan-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(mvpHighlights.bestSingleGame?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                      </svg>
                      <span class="text-xs font-bold text-cyan-400 uppercase tracking-wider">Best Game</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{mvpHighlights.bestSingleGame.name}</div>
                    <div class="text-xs text-gray-400 truncate">{mvpHighlights.bestSingleGame.team} • {mvpHighlights.bestSingleGame.mapName}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-cyan-500/20">
                  <span class="text-cyan-400 font-bold">{mvpHighlights.bestSingleGame.kills}-{mvpHighlights.bestSingleGame.deaths}</span>
                  <span class="text-gray-400">({mvpHighlights.bestSingleGame.kd} K/D)</span>
                </div>
              </div>
            {/if}

            <!-- Most Consistent -->
            {#if mvpHighlights.mostConsistent}
              <div class="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 rounded-lg p-4 border border-emerald-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openShareModal('mostConsistent')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-emerald-500/20 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-emerald-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(mvpHighlights.mostConsistent.playerId)} 
                    alt={mvpHighlights.mostConsistent.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-emerald-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(mvpHighlights.mostConsistent?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                      </svg>
                      <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider">Consistent</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{mvpHighlights.mostConsistent.name}</div>
                    <div class="text-xs text-gray-400 truncate">{mvpHighlights.mostConsistent.team}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-emerald-500/20">
                  <span class="text-emerald-400 font-bold">{mvpHighlights.mostConsistent.kd.toFixed(2)} K/D</span>
                  <span class="text-gray-400">{mvpHighlights.mostConsistent.games} games</span>
                </div>
              </div>
            {/if}

            <!-- Sacrificial Lamb (Worst K/D) -->
            {#if mvpHighlights.worstKD}
              <div class="bg-gradient-to-br from-gray-800/60 to-gray-700/40 rounded-lg p-4 border border-gray-600/30 relative overflow-hidden group">
                <button 
                  onclick={() => openShareModal('worstKD')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-gray-500/20 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(mvpHighlights.worstKD.playerId)} 
                    alt={mvpHighlights.worstKD.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-gray-500/50 shadow-lg grayscale opacity-80"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(mvpHighlights.worstKD?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Needs Practice</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{mvpHighlights.worstKD.name}</div>
                    <div class="text-xs text-gray-400 truncate">{mvpHighlights.worstKD.team}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-gray-600/30">
                  <span class="text-gray-400 font-bold">{mvpHighlights.worstKD.kd.toFixed(2)} K/D</span>
                  <span class="text-gray-500">{mvpHighlights.worstKD.kills}K / {mvpHighlights.worstKD.deaths}D</span>
                </div>
              </div>
            {/if}
          </div>

          <!-- Map MVPs -->
          {#if mvpHighlights.mapMVPs && mvpHighlights.mapMVPs.length > 0}
            <div class="mt-6">
              <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
                </svg>
                Best Player Per Map
              </h3>
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {#each mvpHighlights.mapMVPs as mapMVP}
                  <div class="bg-space-700/50 rounded-lg p-3 border border-space-600">
                    <div class="text-xs font-bold text-brand-cyan mb-1 truncate">{mapMVP.mapName}</div>
                    <div class="text-white font-bold text-sm truncate">{mapMVP.playerName}</div>
                    <div class="text-xs text-gray-500 truncate">{mapMVP.teamName}</div>
                    <div class="text-xs text-brand-purple font-bold mt-1">{mapMVP.kd} K/D ({mapMVP.kills}-{mapMVP.deaths})</div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Team Kill Leaders -->
          {#if mvpHighlights.teamKillLeaders && mvpHighlights.teamKillLeaders.length > 0}
            <div class="mt-6">
              <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
                Top Fragger Per Team
              </h3>
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {#each mvpHighlights.teamKillLeaders as leader, i}
                  <div class="bg-space-700/50 rounded-lg p-3 border border-space-600 hover:border-brand-cyan/30 transition-colors">
                    <div class="flex items-center gap-2 mb-2">
                      <img 
                        src={getPlayerImageUrl(leader.playerId)} 
                        alt={leader.playerName}
                        class="w-8 h-8 rounded-full object-cover border border-brand-cyan/30"
                        onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(leader.playerName)}&background=random&size=32`; }}
                      />
                      <span class="text-xs font-bold text-brand-cyan bg-brand-cyan/10 px-2 py-0.5 rounded">#{i + 1}</span>
                    </div>
                    <div class="text-xs font-bold text-gray-400 truncate mb-1">{leader.teamName}</div>
                    <div class="text-white font-bold text-sm truncate">{leader.playerName}</div>
                    <div class="flex items-center gap-2 mt-2">
                      <span class="text-lg font-black text-brand-orange">{leader.kills}</span>
                      <span class="text-xs text-gray-500">kills</span>
                      <span class="text-xs text-brand-purple ml-auto">{leader.kd.toFixed(2)} K/D</span>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- K/D Progression Chart for Team Games -->
          {#if teamPlayerStats.length > 0}
            <div class="mt-6">
              <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                Player K/D Progression
              </h3>
              <div class="bg-space-700/50 rounded-lg p-6">
                <div class="h-[350px]">
                  <canvas bind:this={teamKDChart}></canvas>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Solo Champion Banner (shown for 1v1 tournaments with a winner) -->
      {#if !isTeamBased && soloPlayerHighlights?.champion}
        <div class="glass-card rounded-xl p-6 mb-6 border-2 border-yellow-500/30 bg-gradient-to-br from-yellow-900/20 via-space-800 to-orange-900/20 relative overflow-hidden">
          <div class="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-transparent to-orange-500/5"></div>
          <div class="relative flex items-center gap-6 flex-wrap">
            <!-- Champion Avatar -->
            <div class="relative">
              <img 
                src={getPlayerImageUrl(soloPlayerHighlights.champion.name)} 
                alt={soloPlayerHighlights.champion.name}
                class="w-20 h-20 rounded-full object-cover border-4 border-yellow-500/50 shadow-lg shadow-yellow-500/30"
                onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(soloPlayerHighlights.champion?.name || '?')}&background=random&size=160`; }}
              />
              <div class="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg">
                <svg class="w-4 h-4 text-space-900" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
              </div>
            </div>
            
            <!-- Champion Info -->
            <div class="flex-1 min-w-0">
              <div class="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 3h14v2h-1v1c0 2.21-1.79 4-4 4h-4c-2.21 0-4-1.79-4-4V5H5V3zm2 3h10V5H7v1zm8 7c.55 0 1 .45 1 1v2h-1v4h-6v-4H8v-2c0-.55.45-1 1-1h6z"/>
                </svg>
                Tournament Champion
              </div>
              <h2 class="text-3xl font-black text-white mb-2">{soloPlayerHighlights.champion.name}</h2>
              <div class="flex items-center gap-4 flex-wrap">
                <span class="text-yellow-400 font-bold">{soloPlayerHighlights.champion.winRate}% Win Rate</span>
                <span class="text-gray-400">{soloPlayerHighlights.champion.matchesWon}W - {soloPlayerHighlights.champion.matchesLost}L</span>
                {#if soloPlayerHighlights.runnerUp}
                  <span class="text-gray-500">|</span>
                  <span class="text-gray-400">
                    Defeated <span class="text-gray-200 font-bold">{soloPlayerHighlights.runnerUp.name}</span> in Finals
                  </span>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Tournament Overview (shown for solo tournaments only) -->
      {#if !isTeamBased && tournamentOverview && matchStats}
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-cyan/10">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-6 h-6 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Tournament Overview
          </h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-space-700/50 rounded-lg p-4 text-center border border-brand-cyan/20">
              <div class="text-3xl font-black text-brand-cyan">{tournamentOverview.playerCount}</div>
              <div class="text-xs text-gray-400 uppercase tracking-wider">Players</div>
            </div>
            <div class="bg-space-700/50 rounded-lg p-4 text-center border border-brand-orange/20">
              <div class="text-3xl font-black text-brand-orange">{matchStats.totalMatches}</div>
              <div class="text-xs text-gray-400 uppercase tracking-wider">Total Matches</div>
            </div>
            <div class="bg-space-700/50 rounded-lg p-4 text-center border border-brand-purple/20">
              <div class="text-3xl font-black text-brand-purple">{matchStats.completedMatches}</div>
              <div class="text-xs text-gray-400 uppercase tracking-wider">Completed</div>
            </div>
            <div class="bg-space-700/50 rounded-lg p-4 text-center border border-green-500/20">
              <div class="text-3xl font-black text-green-400">{matchStats.completionRate}%</div>
              <div class="text-xs text-gray-400 uppercase tracking-wider">Progress</div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Tournament Highlights (shown for solo tournaments only - team tournaments show this at top) -->
      {#if !isTeamBased && advancedStats && matchStats}
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-cyan/10">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
            </svg>
            Tournament Highlights
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- Biggest Comeback - not relevant for win-only games -->
            {#if !isWinOnly && advancedStats.biggestComeback.deficit > 0}
              <div class="bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-lg p-4 border border-green-500/20">
                <div class="flex items-center gap-2 mb-2">
                  <svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                  </svg>
                  <div class="text-xs font-bold text-green-400 uppercase">Biggest Comeback</div>
                </div>
                <div class="text-white font-bold text-sm mb-1">{advancedStats.biggestComeback.player}</div>
                <div class="text-xs text-gray-400">
                  vs {advancedStats.biggestComeback.opponent} • {advancedStats.biggestComeback.finalScore}
                </div>
                <div class="text-xs text-green-400 mt-1">Down by {advancedStats.biggestComeback.deficit}</div>
              </div>
            {/if}

            <!-- Most Dominant Performances - not relevant for win-only games -->
            {#if !isWinOnly && advancedStats.mostDominantList && advancedStats.mostDominantList.length > 0}
              <div class="bg-gradient-to-br from-red-900/30 to-red-800/20 rounded-lg p-3 border border-red-500/20">
                <div class="flex items-center gap-2 mb-2">
                  <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  <div class="text-xs font-bold text-red-400 uppercase">Most Dominant Performances</div>
                </div>
                <div class="space-y-1">
                  {#each advancedStats.mostDominantList.slice(0, 5) as performance}
                    <div class="flex items-center justify-between bg-red-900/20 rounded px-2 py-0.5">
                      <div class="text-white text-xs truncate flex-1">
                        {performance.player} vs {performance.opponent}
                      </div>
                      <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="text-xs text-gray-400">{performance.score}</span>
                        <span class="text-xs text-red-400 font-bold">+{performance.margin}</span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Closest Matches - not relevant for win-only games -->
            {#if !isWinOnly && advancedStats.closestMatches.length > 0}
              <div class="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 rounded-lg p-3 border border-yellow-500/20">
                <div class="flex items-center gap-2 mb-2">
                  <svg class="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <div class="text-xs font-bold text-yellow-400 uppercase">Closest Matches</div>
                </div>
                <div class="space-y-1">
                  {#each advancedStats.closestMatches.slice(0, 5) as match}
                    <div class="flex items-center justify-between bg-yellow-900/20 rounded px-2 py-0.5">
                      <div class="text-white text-xs truncate flex-1">
                        {match.winner} vs {match.loser}
                      </div>
                      <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="text-xs text-gray-400">{match.score}</span>
                        <span class="text-xs text-yellow-400 font-bold">±{match.margin}</span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Total Score Stats - not relevant for win-only games -->
            {#if !isWinOnly}
            <div class="bg-gradient-to-br from-brand-cyan/20 to-brand-cyan/10 rounded-lg p-4 border border-brand-cyan/20">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                <div class="text-xs font-bold text-brand-cyan uppercase">{isHealthBased ? 'Total HP' : isKillBased ? 'Total Kills' : isPointsBased ? 'Total Points' : 'Total Rounds'}</div>
              </div>
              <div class="text-white font-bold text-2xl mb-1">{matchStats.totalScorePlayed}</div>
              <div class="text-xs text-gray-400">Avg {matchStats.avgScorePerMatch} per match</div>
            </div>
            {/if}

            <!-- Highest Score - not relevant for win-only games -->
            {#if !isWinOnly}
            <div class="bg-gradient-to-br from-brand-orange/20 to-brand-orange/10 rounded-lg p-4 border border-brand-orange/20">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                </svg>
                <div class="text-xs font-bold text-brand-orange uppercase">Best Performance</div>
              </div>
              <div class="text-white font-bold text-2xl mb-1">{matchStats.highestScore}</div>
              <div class="text-xs text-gray-400">{isHealthBased ? 'HP' : isKillBased ? 'Kills' : isPointsBased ? 'Points' : 'Rounds'} in one match</div>
            </div>
            {/if}

            <!-- Bracket Stats -->
            <div class="bg-gradient-to-br from-brand-purple/20 to-brand-purple/10 rounded-lg p-4 border border-brand-purple/20">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-brand-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                </svg>
                <div class="text-xs font-bold text-brand-purple uppercase">Playoffs</div>
              </div>
              <div class="text-white font-bold text-2xl mb-1">{matchStats.bracketSeries || 0}</div>
              <div class="text-xs text-gray-400">{matchStats.bracketMatches || 0} maps played</div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Player Highlights (solo tournaments only) -->
      {#if !isTeamBased && soloPlayerHighlights}
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-purple/10">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-6 h-6 text-brand-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
            Player Highlights
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <!-- Champion -->
            {#if soloPlayerHighlights.champion}
              <div class="bg-gradient-to-br from-yellow-900/40 to-yellow-800/20 rounded-lg p-4 border border-yellow-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openSoloShareModal('champion')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-yellow-500/20 text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-yellow-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(soloPlayerHighlights.champion.name)} 
                    alt={soloPlayerHighlights.champion.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-yellow-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(soloPlayerHighlights.champion?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                      <span class="text-xs font-bold text-yellow-400 uppercase tracking-wider">Champion</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{soloPlayerHighlights.champion.name}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-yellow-500/20">
                  <span class="text-yellow-400 font-bold">{soloPlayerHighlights.champion.winRate}% Win Rate</span>
                  <span class="text-gray-400">{soloPlayerHighlights.champion.matchesWon}W-{soloPlayerHighlights.champion.matchesLost}L</span>
                </div>
              </div>
            {/if}

            <!-- Runner Up -->
            {#if soloPlayerHighlights.runnerUp}
              <div class="bg-gradient-to-br from-gray-700/40 to-gray-600/20 rounded-lg p-4 border border-gray-400/30 relative overflow-hidden group">
                <button 
                  onclick={() => openSoloShareModal('runnerUp')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-gray-500/20 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(soloPlayerHighlights.runnerUp.name)} 
                    alt={soloPlayerHighlights.runnerUp.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-gray-400/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(soloPlayerHighlights.runnerUp?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                      </svg>
                      <span class="text-xs font-bold text-gray-300 uppercase tracking-wider">Runner Up</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{soloPlayerHighlights.runnerUp.name}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-gray-500/20">
                  <span class="text-gray-300 font-bold">2nd Place</span>
                  <span class="text-gray-400">{soloPlayerHighlights.runnerUp.matchesWon}W-{soloPlayerHighlights.runnerUp.matchesLost}L</span>
                </div>
              </div>
            {/if}

            <!-- Most Consistent -->
            {#if soloPlayerHighlights.mostConsistent}
              <div class="bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 rounded-lg p-4 border border-emerald-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openSoloShareModal('mostConsistent')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-emerald-500/20 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-emerald-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(soloPlayerHighlights.mostConsistent.name)} 
                    alt={soloPlayerHighlights.mostConsistent.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-emerald-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(soloPlayerHighlights.mostConsistent?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                      </svg>
                      <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider">Mr. Consistent</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{soloPlayerHighlights.mostConsistent.name}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-emerald-500/20">
                  <span class="text-emerald-400 font-bold">{Math.round(soloPlayerHighlights.mostConsistent.consistencyScore / 10)}/10 Score</span>
                  <span class="text-gray-400">{soloPlayerHighlights.mostConsistent.matchesPlayed} games</span>
                </div>
              </div>
            {/if}

            <!-- Clutch Master -->
            {#if soloPlayerHighlights.clutchMaster}
              <div class="bg-gradient-to-br from-purple-900/40 to-purple-800/20 rounded-lg p-4 border border-purple-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openSoloShareModal('clutchMaster')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-purple-500/20 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-purple-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(soloPlayerHighlights.clutchMaster.name)} 
                    alt={soloPlayerHighlights.clutchMaster.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-purple-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(soloPlayerHighlights.clutchMaster?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span class="text-xs font-bold text-purple-400 uppercase tracking-wider">Clutch King</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{soloPlayerHighlights.clutchMaster.name}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-purple-500/20">
                  <span class="text-purple-400 font-bold">{soloPlayerHighlights.clutchMaster.clutchRate}% Clutch</span>
                  <span class="text-gray-400">{soloPlayerHighlights.clutchMaster.closeWins}W in close games</span>
                </div>
              </div>
            {/if}

            <!-- Top Scorer (only for score-based games) -->
            {#if !isWinOnly && soloPlayerHighlights.topScorer}
              <div class="bg-gradient-to-br from-red-900/40 to-red-800/20 rounded-lg p-4 border border-red-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openSoloShareModal('topScorer')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(soloPlayerHighlights.topScorer.name)} 
                    alt={soloPlayerHighlights.topScorer.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-red-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(soloPlayerHighlights.topScorer?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/>
                      </svg>
                      <span class="text-xs font-bold text-red-400 uppercase tracking-wider">Top Scorer</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{soloPlayerHighlights.topScorer.name}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-red-500/20">
                  <span class="text-red-400 font-bold">{soloPlayerHighlights.topScorer.score} {isKillBased ? 'Kills' : isHealthBased ? 'HP' : isPointsBased ? 'Pts' : 'Rounds'}</span>
                  <span class="text-gray-400">in {soloPlayerHighlights.topScorer.matchesPlayed} games</span>
                </div>
              </div>
            {/if}

            <!-- Best Single Game (only for score-based games) -->
            {#if !isWinOnly && soloPlayerHighlights.bestSingleGame}
              <div class="bg-gradient-to-br from-cyan-900/40 to-cyan-800/20 rounded-lg p-4 border border-cyan-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openSoloShareModal('bestSingleGame')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-cyan-500/20 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-cyan-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(soloPlayerHighlights.bestSingleGame.playerName)} 
                    alt={soloPlayerHighlights.bestSingleGame.playerName}
                    class="w-14 h-14 rounded-full object-cover border-2 border-cyan-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(soloPlayerHighlights.bestSingleGame?.playerName || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                      </svg>
                      <span class="text-xs font-bold text-cyan-400 uppercase tracking-wider">Best Game</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{soloPlayerHighlights.bestSingleGame.playerName}</div>
                  </div>
                </div>
                <div class="flex flex-col gap-1 text-sm mt-3 pt-2 border-t border-cyan-500/20">
                  <span class="text-cyan-400 font-bold">{soloPlayerHighlights.bestSingleGame.score} {isKillBased ? 'Kills' : isHealthBased ? 'HP' : isPointsBased ? 'Pts' : 'Rounds'}</span>
                  <span class="text-gray-400 text-xs truncate">vs {soloPlayerHighlights.bestSingleGame.opponent} on {soloPlayerHighlights.bestSingleGame.mapName}</span>
                </div>
              </div>
            {/if}

            <!-- Most Dominant (for win-only games, show this instead of Top Scorer) -->
            {#if isWinOnly && soloPlayerHighlights.mostDominant}
              <div class="bg-gradient-to-br from-red-900/40 to-red-800/20 rounded-lg p-4 border border-red-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openSoloShareModal('mostDominant')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(soloPlayerHighlights.mostDominant.name)} 
                    alt={soloPlayerHighlights.mostDominant.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-red-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(soloPlayerHighlights.mostDominant?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/>
                      </svg>
                      <span class="text-xs font-bold text-red-400 uppercase tracking-wider">Most Dominant</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{soloPlayerHighlights.mostDominant.name}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-red-500/20">
                  <span class="text-red-400 font-bold">{soloPlayerHighlights.mostDominant.winRate}% Win Rate</span>
                  <span class="text-gray-400">{soloPlayerHighlights.mostDominant.matchesWon}W-{soloPlayerHighlights.mostDominant.matchesLost}L</span>
                </div>
              </div>
            {/if}

            <!-- Survivor - Best average score per game (only for score-based games) -->
            {#if !isWinOnly && soloPlayerHighlights.survivor}
              <div class="bg-gradient-to-br from-blue-900/40 to-blue-800/20 rounded-lg p-4 border border-blue-500/30 relative overflow-hidden group">
                <button 
                  onclick={() => openSoloShareModal('survivor')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-blue-500/20 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-500/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(soloPlayerHighlights.survivor.name)} 
                    alt={soloPlayerHighlights.survivor.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-blue-500/50 shadow-lg"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(soloPlayerHighlights.survivor?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                      </svg>
                      <span class="text-xs font-bold text-blue-400 uppercase tracking-wider">Survivor</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{soloPlayerHighlights.survivor.name}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-blue-500/20">
                  <span class="text-blue-400 font-bold">{soloPlayerHighlights.survivor.avgScore} avg {isKillBased ? 'K' : isHealthBased ? 'HP' : isPointsBased ? 'pts' : 'rds'}/game</span>
                  <span class="text-gray-400">{soloPlayerHighlights.survivor.matchesPlayed} games</span>
                </div>
              </div>
            {/if}

            <!-- Worst Performer (Sacrificial Lamb) -->
            {#if soloPlayerHighlights.worstPerformer}
              <div class="bg-gradient-to-br from-gray-800/60 to-gray-700/40 rounded-lg p-4 border border-gray-600/30 relative overflow-hidden group">
                <button 
                  onclick={() => openSoloShareModal('worstPerformer')}
                  class="absolute top-2 right-2 p-1.5 rounded-full bg-gray-600/20 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600/30"
                  title="Share this card"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                  </svg>
                </button>
                <div class="flex items-start gap-3">
                  <img 
                    src={getPlayerImageUrl(soloPlayerHighlights.worstPerformer.name)} 
                    alt={soloPlayerHighlights.worstPerformer.name}
                    class="w-14 h-14 rounded-full object-cover border-2 border-gray-500/50 shadow-lg grayscale opacity-80"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(soloPlayerHighlights.worstPerformer?.name || '?')}&background=random`; }}
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Sacrificial Lamb</span>
                    </div>
                    <div class="text-white font-bold text-lg truncate">{soloPlayerHighlights.worstPerformer.name}</div>
                  </div>
                </div>
                <div class="flex gap-3 text-sm mt-3 pt-2 border-t border-gray-600/20">
                  <span class="text-gray-400 font-bold">{soloPlayerHighlights.worstPerformer.winRate}% Win Rate</span>
                  <span class="text-gray-500">{soloPlayerHighlights.worstPerformer.matchesWon}W-{soloPlayerHighlights.worstPerformer.matchesLost}L</span>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Player Rankings (solo tournaments only - team tournaments have separate Player K/D tab) -->
      {#if !isTeamBased}
      <div class="glass-card rounded-xl p-6 mb-6 border border-brand-orange/10">
        <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
          <svg class="w-6 h-6 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
          Player Standings
        </h2>

        <div class="space-y-2">
          {#each playerStats as player, index}
            <div class="flex items-center gap-3 p-3 rounded-lg bg-space-700/50 hover:bg-space-700 transition-colors border border-space-600/50">
              <!-- Rank -->
              <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0
                {index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-space-900' :
                 index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-space-900' :
                 index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-space-900' :
                 'bg-space-600 text-gray-400'}">
                {index + 1}
              </div>

              <!-- Player Avatar -->
              <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                <img src={getPlayerImageUrl(player.name)} alt="Profile" class="w-10 h-10 rounded-full object-cover" />
              </div>

              <!-- Player Info and Match History Button -->
              <div class="flex-1 min-w-0 flex items-center gap-3">
                <div class="flex-1 min-w-0 space-y-1">
                  <div class="font-bold text-white truncate">{player.name}</div>
                  <div class="text-xs text-gray-400">
                    {player.matchesPlayed} maps • 
                    {#if isKillBased}
                      {player.matchesWon}W-{player.matchesLost}L
                    {:else if isHealthBased}
                      {player.roundsWon} wins
                    {:else}
                      {player.matchesWon}W-{player.matchesLost}L{player.matchesTied > 0 ? `-${player.matchesTied}T` : ''}
                    {/if}
                  </div>
                  <!-- Advanced Stats Pills -->
                  <div class="flex gap-2 flex-wrap">
                    {#if player.clutchRate !== undefined}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-orange/20 text-brand-orange border border-brand-orange/30">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                        {player.clutchRate}% Clutch
                      </span>
                    {/if}
                    {#if player.consistencyScore !== undefined}
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-purple/20 text-brand-purple border border-brand-purple/30">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                        </svg>
                        {Math.round(player.consistencyScore / 10)}/10 Consistency
                      </span>
                    {/if}
                  </div>
                </div>
                
                <!-- Match History Toggle Button -->
                <div class="flex-shrink-0">
                  {#if player.matchHistory && player.matchHistory.length > 0}
                    <button 
                      onclick={() => togglePlayerExpanded(player.id)}
                      class="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold text-brand-cyan hover:text-brand-cyan/80 bg-brand-cyan/10 hover:bg-brand-cyan/20 transition-colors border border-brand-cyan/30"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      History
                      <svg class="w-3 h-3 transform transition-transform {expandedPlayers.has(player.id) ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                  {/if}
                </div>
              </div>

              {#if isWinOnly}
                <!-- Win-only games: Simple win/loss stats -->
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-xl font-black text-green-400">{player.matchesWon}</div>
                  <div class="text-xs text-gray-400">Wins</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-xl font-black text-red-400">{player.matchesLost}</div>
                  <div class="text-xs text-gray-400">Losses</div>
                </div>
                
                <div class="text-center w-24 flex-shrink-0">
                  <div class="text-lg font-bold text-cyan-400">{player.totalMatches}</div>
                  <div class="text-xs text-gray-400">Total Matches</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold text-yellow-400">{player.winRate}%</div>
                  <div class="text-xs text-gray-400">Win Rate</div>
                </div>
                
              {:else if isKillBased}
                <!-- Kill-based: Kill stats -->
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-xl font-black text-cyan-400">{player.totalKills}</div>
                  <div class="text-xs text-gray-400">Kills</div>
                </div>
                
                <div class="text-center w-16 flex-shrink-0">
                  <div class="text-lg font-bold {player.killDiff > 0 ? 'text-green-400' : player.killDiff < 0 ? 'text-red-400' : 'text-gray-400'}">
                    {player.killDiff > 0 ? '+' : ''}{player.killDiff}
                  </div>
                  <div class="text-xs text-gray-400">K/D</div>
                </div>
                
                <div class="text-center w-16 flex-shrink-0">
                  <div class="text-lg font-bold text-purple-400">{player.kdRatio}</div>
                  <div class="text-xs text-gray-400">Ratio</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold text-orange-400">{player.avgKillsPerMap}</div>
                  <div class="text-xs text-gray-400">Avg/Map</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold text-yellow-400">{player.winRate}%</div>
                  <div class="text-xs text-gray-400">Win Rate</div>
                </div>
                
              {:else if isHealthBased}
                <!-- Worms: HP stats -->
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-xl font-black text-cyan-400">{player.totalHP}</div>
                  <div class="text-xs text-gray-400">Total HP</div>
                </div>
                
                <div class="text-center w-16 flex-shrink-0">
                  <div class="text-lg font-bold text-yellow-400">{player.roundsWon}</div>
                  <div class="text-xs text-gray-400">Wins</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold text-purple-400">{player.avgHPPerWin}</div>
                  <div class="text-xs text-gray-400">Avg HP/Win</div>
                </div>
                
                <div class="text-center w-16 flex-shrink-0">
                  <div class="text-lg font-bold text-orange-400">{player.bestRound}</div>
                  <div class="text-xs text-gray-400">Best</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold text-green-400">{player.winRate}%</div>
                  <div class="text-xs text-gray-400">Win Rate</div>
                </div>
                
              {:else if isPointsBased}
                <!-- Custom points stats -->
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-xl font-black text-cyan-400">{player.totalPoints}</div>
                  <div class="text-xs text-gray-400">Total Points</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold {player.pointsDiff > 0 ? 'text-green-400' : player.pointsDiff < 0 ? 'text-red-400' : 'text-gray-400'}">
                    {player.pointsDiff > 0 ? '+' : ''}{player.pointsDiff}
                  </div>
                  <div class="text-xs text-gray-400">+/- Points</div>
                </div>
                
                <div class="text-center w-16 flex-shrink-0">
                  <div class="text-lg font-bold text-purple-400">{player.pointsWinRate}%</div>
                  <div class="text-xs text-gray-400">Pts %</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold text-orange-400">{player.avgPointsPerMatch}</div>
                  <div class="text-xs text-gray-400">Avg/Match</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold text-yellow-400">{player.matchWinRate}%</div>
                  <div class="text-xs text-gray-400">Match Win %</div>
                </div>
                
              {:else}
                <!-- Rounds-based stats -->
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-xl font-black text-cyan-400">{player.totalRounds}</div>
                  <div class="text-xs text-gray-400">Rounds Won</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold {player.roundDiff > 0 ? 'text-green-400' : player.roundDiff < 0 ? 'text-red-400' : 'text-gray-400'}">
                    {player.roundDiff > 0 ? '+' : ''}{player.roundDiff}
                  </div>
                  <div class="text-xs text-gray-400">+/- Rounds</div>
                </div>
                
                <div class="text-center w-16 flex-shrink-0">
                  <div class="text-lg font-bold text-purple-400">{player.roundWinRate}%</div>
                  <div class="text-xs text-gray-400">Round %</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold text-orange-400">{player.avgRoundsPerMap}</div>
                  <div class="text-xs text-gray-400">Avg/Map</div>
                </div>
                
                <div class="text-center w-20 flex-shrink-0">
                  <div class="text-lg font-bold text-yellow-400">{player.matchWinRate}%</div>
                  <div class="text-xs text-gray-400">Map Win %</div>
                </div>
              {/if}
            </div>
            
            <!-- Expanded Match History -->
            {#if player.matchHistory && player.matchHistory.length > 0 && expandedPlayers.has(player.id)}
              <div class="col-span-full mt-2 pt-3 border-t border-gray-700">
                  <!-- Map Performance -->
                  {#if player.mapPerformance && Object.keys(player.mapPerformance).length > 0}
                    <div class="mb-4">
                      <h4 class="text-sm font-bold text-brand-cyan mb-2 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
                        </svg>
                        Map Performance
                      </h4>
                      <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {#each Object.entries(player.mapPerformance) as [mapName, mapStats]}
                          <div class="glass-card rounded-lg p-3">
                            <div class="text-xs font-semibold text-brand-cyan mb-1 truncate">{mapName}</div>
                            <div class="flex items-center justify-between">
                              <div class="text-lg font-bold text-white">{mapStats.wins}-{mapStats.losses}</div>
                              <div class="text-xs text-gray-400">{mapStats.winRate}%</div>
                            </div>
                            <div class="text-xs text-gray-400 mt-1">
                              Avg: {mapStats.avgScore} {isHealthBased ? 'HP' : isKillBased ? 'K' : 'R'}
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  
                  <div class="mt-3 space-y-2 max-h-64 overflow-y-auto">
                    {#each player.matchHistory as match}
                      <div class="bg-space-800/80 rounded-lg p-3">
                        <div class="flex items-center justify-between">
                          <div class="flex-1">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="text-xs font-bold uppercase {match.stage === 'Playoffs' ? 'text-purple-400' : 'text-blue-400'}">
                                {match.stage}
                              </span>
                              <span class="text-white font-semibold">vs {match.opponent}</span>
                              {#if match.isSeries}
                                <span class="text-xs text-gray-500">• Game {match.gameNumber}</span>
                              {/if}
                              {#if match.mapName}
                                <span class="text-xs text-cyan-400">• {match.mapName}</span>
                              {/if}
                            </div>
                            <div class="text-xs text-gray-400 mt-1 flex items-center gap-2">
                              <span>{match.round === 'group' ? 'Group Stage' : match.round.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                              {#if match.isSeries && match.seriesScore}
                                <span class="text-purple-400 font-bold">• Series: {match.seriesScore}</span>
                              {/if}
                            </div>
                          </div>
                          <div class="flex items-center gap-3">
                            <div class="text-right">
                              <div class="text-lg font-bold {match.result === 'win' ? 'text-green-400' : match.result === 'loss' ? 'text-red-400' : 'text-yellow-400'}">
                                {match.playerScore} - {match.opponentScore}
                              </div>
                              <div class="text-xs text-gray-400">
                                {isHealthBased ? 'HP' : isKillBased ? 'Kills' : 'Rounds'}
                              </div>
                            </div>
                            <div class="w-16 text-center flex-shrink-0">
                              {#if match.result === 'win'}
                                <span class="inline-block px-2 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/50">
                                  WIN
                                </span>
                              {:else if match.result === 'loss'}
                                <span class="inline-block px-2 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/50">
                                  LOSS
                                </span>
                              {:else}
                                <span class="inline-block px-2 py-1 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/50">
                                  TIE
                                </span>
                              {/if}
                            </div>
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
      {/if}

      <!-- Points Progression Chart (solo tournaments only) -->
      {#if !isTeamBased && playerStats.length > 0}
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-purple/10">
          <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 class="text-xl font-bold text-white flex items-center gap-2">
              <svg class="w-6 h-6 text-brand-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
              Player Progression
            </h2>
            
            <!-- Metric Selector -->
            <div class="flex items-center gap-2">
              <label for="progression-metric" class="text-sm text-gray-400">Show:</label>
              <select
                id="progression-metric"
                class="bg-space-700 border border-space-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 focus:border-brand-cyan"
                value={progressionMetric}
                onchange={(e) => handleMetricChange((e.target as HTMLSelectElement).value as 'wins' | 'cumulative')}
              >
                {#each progressionMetricOptions() as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="bg-space-700/50 rounded-lg p-6">
            <div class="h-[400px]">
              <canvas bind:this={winsTimelineChart}></canvas>
            </div>
          </div>
        </div>
      {/if}
    {:else}
      <div class="glass rounded-lg p-12 text-center">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p class="text-gray-400">No tournament data available</p>
      </div>
    {/if}
  </div>

  <!-- Share Modal (works for both team and solo highlights) -->
  {#if showShareModal && selectedShareCard && (mvpHighlights || soloPlayerHighlights)}
    {@const cardData = isSoloShare ? (soloPlayerHighlights as any)?.[selectedShareCard] : (mvpHighlights as any)?.[selectedShareCard]}
    {@const soloCardConfigs: Record<string, any> = {
      champion: { title: 'TOURNAMENT CHAMPION', color: 'from-yellow-500 to-amber-600', accent: 'yellow', glow: 'shadow-yellow-500/30', iconType: 'star' },
      runnerUp: { title: 'RUNNER UP', color: 'from-gray-400 to-gray-500', accent: 'gray', glow: 'shadow-gray-400/30', iconType: 'medal' },
      mostConsistent: { title: 'MR. CONSISTENT', color: 'from-emerald-500 to-teal-600', accent: 'emerald', glow: 'shadow-emerald-500/30', iconType: 'chart' },
      clutchMaster: { title: 'CLUTCH KING', color: 'from-purple-500 to-pink-600', accent: 'purple', glow: 'shadow-purple-500/30', iconType: 'clock' },
      topScorer: { title: 'TOP SCORER', color: 'from-red-500 to-orange-600', accent: 'red', glow: 'shadow-red-500/30', iconType: 'fire' },
      bestSingleGame: { title: 'BEST SINGLE GAME', color: 'from-cyan-500 to-blue-600', accent: 'cyan', glow: 'shadow-cyan-500/30', iconType: 'trending' },
      mostDominant: { title: 'MOST DOMINANT', color: 'from-red-500 to-orange-600', accent: 'red', glow: 'shadow-red-500/30', iconType: 'fire' },
      survivor: { title: 'SURVIVOR', color: 'from-blue-500 to-cyan-600', accent: 'blue', glow: 'shadow-blue-500/30', iconType: 'shield' },
      worstPerformer: { title: 'SACRIFICIAL LAMB', color: 'from-gray-500 to-gray-600', accent: 'gray', glow: 'shadow-gray-500/30', iconType: 'sad' }
    }}
    {@const teamCardConfigs: Record<string, any> = {
      mvp: { title: 'TOURNAMENT MVP', color: 'from-yellow-500 to-amber-600', accent: 'yellow', glow: 'shadow-yellow-500/30', iconType: 'star' },
      topKiller: { title: 'TOP FRAGGER', color: 'from-red-500 to-orange-600', accent: 'red', glow: 'shadow-red-500/30', iconType: 'lightning' },
      killsPerGame: { title: 'THE TERMINATOR', color: 'from-orange-500 to-red-600', accent: 'orange', glow: 'shadow-orange-500/30', iconType: 'fire' },
      survivor: { title: 'THE SURVIVOR', color: 'from-blue-500 to-cyan-600', accent: 'blue', glow: 'shadow-blue-500/30', iconType: 'shield' },
      clutchPerformer: { title: 'CLUTCH KING', color: 'from-purple-500 to-pink-600', accent: 'purple', glow: 'shadow-purple-500/30', iconType: 'clock' },
      bestSingleGame: { title: 'BEST SINGLE GAME', color: 'from-cyan-500 to-blue-600', accent: 'cyan', glow: 'shadow-cyan-500/30', iconType: 'trending' },
      mostConsistent: { title: 'MR. CONSISTENT', color: 'from-emerald-500 to-teal-600', accent: 'emerald', glow: 'shadow-emerald-500/30', iconType: 'chart' },
      worstKD: { title: 'NEEDS PRACTICE', color: 'from-gray-500 to-gray-600', accent: 'gray', glow: 'shadow-gray-500/30', iconType: 'sad' }
    }}
    {@const cardConfig = (isSoloShare ? soloCardConfigs[selectedShareCard] : teamCardConfigs[selectedShareCard]) || { title: 'PLAYER STATS', color: 'from-cyan-500 to-blue-600', accent: 'cyan', glow: 'shadow-cyan-500/30', iconType: 'star' }}
    <div 
      class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onclick={closeShareModal}
      onkeydown={(e) => e.key === 'Escape' && closeShareModal()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div 
        class="bg-space-900 rounded-2xl border border-space-700 shadow-2xl max-w-xl w-full overflow-hidden"
        onclick={(e) => e.stopPropagation()}
      >
        <!-- Modal Header -->
        <div class="p-4 border-b border-space-700 bg-space-800/50">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-bold text-white flex items-center gap-2">
              <svg class="w-5 h-5 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
              </svg>
              Share Stats Card
            </h3>
            <button 
              onclick={closeShareModal}
              class="p-1.5 rounded-lg hover:bg-space-600 transition-colors text-gray-400 hover:text-white"
              aria-label="Close share modal"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Shareable Card Preview -->
        {#if cardData}
          {@const previewStats = (() => {
            const stats: Array<{value: string, label: string, colorClass: string}> = [];
            if (isSoloShare) {
              if (selectedShareCard === 'bestSingleGame') {
                if (cardData.score !== undefined) stats.push({ value: String(cardData.score), label: 'Score', colorClass: 'text-brand-cyan' });
                if (cardData.opponent) stats.push({ value: cardData.opponent, label: 'Opponent', colorClass: 'text-white' });
              } else {
                if (cardData.winRate !== undefined) stats.push({ value: `${cardData.winRate}%`, label: 'Win Rate', colorClass: 'text-cyber-green' });
                if (cardData.matchesWon !== undefined) stats.push({ value: String(cardData.matchesWon), label: 'Wins', colorClass: 'text-cyber-green' });
                if (cardData.matchesLost !== undefined) stats.push({ value: String(cardData.matchesLost), label: 'Losses', colorClass: 'text-brand-orange' });
                if (cardData.consistencyScore !== undefined && stats.length < 3) stats.push({ value: `${Math.round(cardData.consistencyScore / 10)}/10`, label: 'Consistency', colorClass: 'text-emerald-400' });
                if (cardData.clutchRate !== undefined && stats.length < 3) stats.push({ value: `${cardData.clutchRate}%`, label: 'Clutch', colorClass: 'text-purple-400' });
                if (cardData.closeWins !== undefined && stats.length < 3) stats.push({ value: String(cardData.closeWins), label: 'Close Wins', colorClass: 'text-purple-400' });
                if (cardData.score !== undefined && stats.length < 3) stats.push({ value: String(cardData.score), label: 'Total Score', colorClass: 'text-brand-cyan' });
                if (cardData.avgScore !== undefined && stats.length < 3) stats.push({ value: String(cardData.avgScore), label: 'Avg/Game', colorClass: 'text-blue-400' });
                if (cardData.matchesPlayed !== undefined && stats.length < 3) stats.push({ value: String(cardData.matchesPlayed), label: 'Games', colorClass: 'text-white' });
              }
            } else {
              if (cardData.kd !== undefined) stats.push({ value: typeof cardData.kd === 'number' ? cardData.kd.toFixed(2) : String(cardData.kd), label: 'K/D Ratio', colorClass: 'text-white' });
              if (cardData.kills !== undefined) stats.push({ value: String(cardData.kills), label: 'Kills', colorClass: 'text-brand-cyan' });
              if (cardData.deaths !== undefined) stats.push({ value: String(cardData.deaths), label: 'Deaths', colorClass: 'text-brand-orange' });
              if (cardData.games !== undefined && !cardData.kd && stats.length < 3) stats.push({ value: String(cardData.games), label: 'Games', colorClass: 'text-white' });
              if (cardData.clutchGames !== undefined && stats.length < 3) stats.push({ value: String(cardData.clutchGames), label: 'Clutch', colorClass: 'text-purple-400' });
              if (cardData.avg !== undefined && stats.length < 3) stats.push({ value: cardData.avg.toFixed(1), label: 'K/Game', colorClass: 'text-orange-400' });
              if (cardData.avgDeaths !== undefined && stats.length < 3) stats.push({ value: cardData.avgDeaths.toFixed(1), label: 'D/Game', colorClass: 'text-blue-400' });
            }
            return stats.slice(0, 3);
          })()}
          <div class="p-5 flex justify-center">
            <div 
              bind:this={shareCardRef}
              class="relative bg-gradient-to-br from-space-900 via-space-800 to-space-900 rounded-xl overflow-hidden shadow-2xl {cardConfig.glow}"
              style="width: 400px;"
            >
              <!-- Decorative top gradient bar -->
              <div class="h-1.5 bg-gradient-to-r {cardConfig.color}"></div>
              
              <!-- Card Header with Branding -->
              <div class="px-5 pt-4 pb-3 border-b border-space-700/50">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <img src={logoImg} alt="AI Department" class="h-8 w-8 object-contain" />
                    <div>
                      <div class="text-xs font-black gradient-text leading-tight">AI DEPARTMENT</div>
                      <div class="text-[10px] text-cyber-green font-bold tracking-wider">LAN SERIES</div>
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-[10px] text-gray-500 uppercase tracking-wider">Tournament</div>
                    <div class="text-xs text-white font-semibold truncate max-w-[120px]">{tournamentData?.name || 'Tournament'}</div>
                  </div>
                </div>
              </div>
              
              <!-- Role Badge -->
              <div class="px-5 pt-4">
                <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r {cardConfig.color} rounded-full shadow-lg {cardConfig.glow}">
                  {#if cardConfig.iconType === 'star'}
                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                  {:else if cardConfig.iconType === 'lightning'}
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                  {:else if cardConfig.iconType === 'fire'}
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/>
                    </svg>
                  {:else if cardConfig.iconType === 'shield'}
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                  {:else if cardConfig.iconType === 'clock'}
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  {:else if cardConfig.iconType === 'trending'}
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                    </svg>
                  {:else if cardConfig.iconType === 'chart'}
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                  {:else if cardConfig.iconType === 'sad'}
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  {/if}
                  <span class="text-xs font-black text-white tracking-wider">{cardConfig.title}</span>
                </div>
              </div>
              
              <!-- Player Info -->
              <div class="px-5 py-4 flex items-center gap-4">
                <div class="relative">
                  <div class="absolute inset-0 bg-gradient-to-r {cardConfig.color} rounded-full blur-md opacity-50"></div>
                  <img 
                    src={getPlayerImageUrl(isSoloShare ? (selectedShareCard === 'bestSingleGame' ? cardData.playerName : cardData.name) : cardData.playerId)} 
                    alt={isSoloShare ? (selectedShareCard === 'bestSingleGame' ? cardData.playerName : cardData.name) : cardData.name}
                    class="relative w-20 h-20 rounded-full object-cover border-2 border-white/20 shadow-xl"
                    onerror={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent((isSoloShare ? (selectedShareCard === 'bestSingleGame' ? cardData.playerName : cardData.name) : cardData.name) || '?')}&background=1a1a2e&color=23b7d1&bold=true&size=200`; }}
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-2xl font-black text-white truncate">{isSoloShare && selectedShareCard === 'bestSingleGame' ? cardData.playerName : cardData.name}</div>
                  {#if isSoloShare}
                    <div class="text-sm text-gray-400 flex items-center gap-1.5">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                      1v1 Tournament
                    </div>
                  {:else}
                    <div class="text-sm text-gray-400 flex items-center gap-1.5">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                      {cardData.team}
                    </div>
                  {/if}
                </div>
              </div>
              
              <!-- Stats Grid -->
              <div class="px-5 pb-4">
                <div class="grid gap-2 {previewStats.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}">
                  {#each previewStats as stat}
                    <div class="bg-space-800/80 rounded-lg p-3 text-center border border-space-700/50">
                      <div class="text-xl font-black {stat.colorClass} truncate">{stat.value}</div>
                      <div class="text-[10px] text-gray-500 uppercase tracking-wider font-bold">{stat.label}</div>
                    </div>
                  {/each}
                </div>
              </div>
              
              <!-- Footer -->
              <div class="px-5 py-3 bg-space-800/50 border-t border-space-700/30 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-gray-400 font-semibold">{gameConfig?.name || 'Game'}</span>
                  <span class="text-gray-600">•</span>
                  <span class="text-[10px] text-gray-500">{isTeamBased ? 'Team Tournament' : '1v1 Tournament'}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <img src={logoImg} alt="AI Dept" class="w-3.5 h-3.5 opacity-70" />
                  <span class="text-[10px] text-gray-500">AI Department</span>
                </div>
              </div>
            </div>
          </div>
        {/if}
        
        <!-- Action Buttons -->
        <div class="p-4 border-t border-space-700 bg-space-800/30 flex gap-3">
          <button 
            onclick={copyShareCard}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-brand-cyan to-brand-blue hover:from-brand-cyan/90 hover:to-brand-blue/90 text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-cyan/20 hover:shadow-brand-cyan/30 hover:scale-[1.02]"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
            </svg>
            Copy Stats
          </button>
          <button 
            onclick={downloadShareCard}
            class="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-space-700 hover:bg-space-600 text-white rounded-xl font-bold transition-all hover:scale-[1.02]"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Download
          </button>
        </div>
      </div>
    </div>
  {/if}

  <Footer />
</div>
