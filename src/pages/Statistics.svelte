<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, type GameType, GAME_CONFIGS } from '$lib/api';
  import { getPlayerImageUrl } from '$lib/playerImages';
  import { Chart, registerables } from 'chart.js';
  import Footer from '../components/Footer.svelte';

  Chart.register(...registerables);

  let { tournamentId } = $props<{ tournamentId: string }>();

  let tournamentData = $state(null) as any;
  let loading = $state(true);
  let error = $state(null) as string | null;
  let gameType = $state<GameType>('cs16');

  let progressTimelineChart = $state<HTMLCanvasElement | undefined>(undefined);
  let winsTimelineChart = $state<HTMLCanvasElement | undefined>(undefined);
  let expandedPlayers: Set<string> = $state(new Set());
  
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
  const scoreLabel = $derived(gameConfig?.groupStage.scoreLabel || 'Rounds');
  const isKillBased = $derived(gameConfig?.groupStage.scoreType === 'kills');
  const isHealthBased = $derived(gameConfig?.groupStage.scoreType === 'health');

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

  // Determine final tournament placement for a player
  function getTournamentPlacement(playerId: string, bracketMatches: any[]): number {
    // Check if player is champion (winner of finals)
    const finals = bracketMatches.find((m: any) => m.bracketType === 'finals');
    if (finals?.winnerId === playerId) return 1;
    
    // Check if player is runner-up (loser of finals)
    if (finals?.winnerId && (finals.player1Id === playerId || finals.player2Id === playerId)) {
      return 2;
    }
    
    // Check if player won 3rd place match
    const thirdPlace = bracketMatches.find((m: any) => m.bracketType === '3rd-place');
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
        
        const placement = getTournamentPlacement(player.id, bracketMatchesArr);
        
        // Game-specific calculations
        let gameSpecificStats: any = {};
        
        if (isKillBased) {
          // UT2004: Kills-based stats
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
          // Worms: HP-based stats
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
        } else {
          // CS1.6: Rounds-based stats
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
        // Tertiary: Score/kills/HP won
        const aScore = isKillBased ? a.totalKills : isHealthBased ? a.totalHP : a.totalRounds;
        const bScore = isKillBased ? b.totalKills : isHealthBased ? b.totalHP : b.totalRounds;
        return bScore - aScore;
      });
  });

  // Compute match statistics
  const matchStats = $derived.by(() => {
    if (!tournamentData) return null;
    
    const groupMatches = Array.isArray(tournamentData.matches) ? tournamentData.matches : [];
    const bracketMatchesArr = Array.isArray(tournamentData.bracketMatches) ? tournamentData.bracketMatches : [];

      // Count actual maps played in brackets (not just series count)
      let bracketMapsPlayed = 0;
      let completedBracketMaps = 0;
      bracketMatchesArr.forEach((match: any) => {
        if (match.games && Array.isArray(match.games) && match.games.length > 0) {
          // Count maps that were actually played (non-zero scores)
          const playedGames = match.games.filter((g: any) => g.player1Score > 0 || g.player2Score > 0);
          bracketMapsPlayed += playedGames.length;
          if (match.winnerId) {
            completedBracketMaps += playedGames.length;
          }
        } else if (match.winnerId) {
          // Fallback: legacy data without games array - estimate 2 maps per completed series
          bracketMapsPlayed += 2;
          completedBracketMaps += 2;
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
        if (match.result && match.completed) {
          const scores = Object.values(match.result).map((r: any) => r?.score || 0);
          if (scores.length === 2) {
            totalScorePlayed += scores[0] + scores[1];
            highestScore = Math.max(highestScore, ...scores);
            const diff = Math.abs(scores[0] - scores[1]);
            if (diff < closestMatch.diff && diff > 0) {
              closestMatch = { diff, score: `${Math.max(...scores)}-${Math.min(...scores)}` };
            }
          }
        }
      });

      bracketMatchesArr.forEach((match: any) => {
        if (match.winnerId && match.games) {
          match.games.forEach((game: any) => {
            if (game.player1Score || game.player2Score) {
              totalScorePlayed += (game.player1Score || 0) + (game.player2Score || 0);
              highestScore = Math.max(highestScore, game.player1Score || 0, game.player2Score || 0);
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
              
              // Get win rate and primary stat based on game type
              const winRate = player.winRate || player.matchWinRate || 0;
              const primaryStat = isKillBased ? player.totalKills : isHealthBased ? player.totalHP : player.totalRounds;
              
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
    if (winsTimelineChart && tournamentData && playerStats.length > 0) {
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
        
        // Calculate wins progression through each match
        const playerWins: Record<string, number[]> = {};
        const stages: string[] = ['Start'];
        
        playerStats.forEach(player => {
          playerWins[player.id] = [0];
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
              const prevWins = playerWins[player.id][playerWins[player.id].length - 1];
              let newWins = prevWins;
              
              // Check if this player won this match
              if (result[p1Id] && result[p2Id]) {
                const p1Score = result[p1Id].score;
                const p2Score = result[p2Id].score;
                
                if (player.id === p1Id && p1Score > p2Score) {
                  newWins += 1;  // Win
                } else if (player.id === p2Id && p2Score > p1Score) {
                  newWins += 1;  // Win
                }
              }
              
              playerWins[player.id].push(newWins);
            });
          }
        });
        
        // Add playoff progression - track individual games/maps
        const bracketMatches = Array.isArray(tournamentData.bracketMatches) ? tournamentData.bracketMatches : [];
        let playoffMatchNumber = 0;
        
        bracketMatches.forEach((match: any) => {
          if (match.games && Array.isArray(match.games)) {
            match.games.forEach((game: any) => {
              // Include ALL games
              playoffMatchNumber++;
              stages.push(`P${playoffMatchNumber}`);
              
              playerStats.forEach(player => {
                const prevWins = playerWins[player.id][playerWins[player.id].length - 1];
                let newWins = prevWins;
                
                // If game is complete and has a winner
                if (game.winnerId && player.id === game.winnerId) {
                  newWins += 1;
                }
                
                playerWins[player.id].push(newWins);
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
          data: playerWins[player.id],
          borderColor: colors[idx % colors.length],
          backgroundColor: colors[idx % colors.length].replace('1)', '0.1)'),
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 6,
          fill: false
        }));
        
        new Chart(ctx, {
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
                    return context.dataset.label + ': ' + context.parsed.y + ' wins';
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
                  text: 'Total Wins',
                  color: '#9ca3af',
                  font: { size: 14, weight: 'bold' }
                },
                ticks: { 
                  color: '#9ca3af',
                  font: { size: 11 },
                  stepSize: 1
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

  onMount(async () => {
    loadTournamentData();
    
    setTimeout(initializeCharts, 100);
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

      <!-- Quick Stats Overview -->
      {#if tournamentOverview && matchStats}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="glass-card rounded-xl p-4 border border-brand-cyan/20">
            <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Players</div>
            <div class="text-3xl font-black text-brand-cyan">{tournamentOverview.playerCount}</div>
          </div>
          <div class="glass-card rounded-xl p-4 border border-brand-orange/20">
            <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Matches</div>
            <div class="text-3xl font-black text-brand-orange">{matchStats.totalMatches}</div>
          </div>
          <div class="glass-card rounded-xl p-4 border border-brand-purple/20">
            <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Completed</div>
            <div class="text-3xl font-black text-brand-purple">{matchStats.completedMatches}</div>
          </div>
          <div class="glass-card rounded-xl p-4 border border-green-500/20">
            <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Progress</div>
            <div class="text-3xl font-black text-green-400">{matchStats.completionRate}%</div>
          </div>
        </div>
      {/if}

      <!-- Tournament Highlights -->
      {#if advancedStats && matchStats}
        <div class="glass-card rounded-xl p-6 mb-6 border border-brand-cyan/10">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
            </svg>
            Tournament Highlights
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <!-- Biggest Comeback -->
            {#if advancedStats.biggestComeback.deficit > 0}
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

            <!-- Most Dominant Performances -->
            {#if advancedStats.mostDominantList && advancedStats.mostDominantList.length > 0}
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

            <!-- Closest Matches -->
            {#if advancedStats.closestMatches.length > 0}
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

            <!-- Total Score Stats -->
            <div class="bg-gradient-to-br from-brand-cyan/20 to-brand-cyan/10 rounded-lg p-4 border border-brand-cyan/20">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
                <div class="text-xs font-bold text-brand-cyan uppercase">{isHealthBased ? 'Total HP' : isKillBased ? 'Total Kills' : 'Total Rounds'}</div>
              </div>
              <div class="text-white font-bold text-2xl mb-1">{matchStats.totalScorePlayed}</div>
              <div class="text-xs text-gray-400">Avg {matchStats.avgScorePerMatch} per match</div>
            </div>

            <!-- Highest Score -->
            <div class="bg-gradient-to-br from-brand-orange/20 to-brand-orange/10 rounded-lg p-4 border border-brand-orange/20">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                </svg>
                <div class="text-xs font-bold text-brand-orange uppercase">Best Performance</div>
              </div>
              <div class="text-white font-bold text-2xl mb-1">{matchStats.highestScore}</div>
              <div class="text-xs text-gray-400">{isHealthBased ? 'HP' : isKillBased ? 'Kills' : 'Rounds'} in one match</div>
            </div>

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

      <!-- Player Rankings -->
      <div class="glass-card rounded-lg p-6 mb-6">
        <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
          <svg class="w-5 h-5 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
          Final Tournament Rankings
        </h2>

        <div class="space-y-2">
          {#each playerStats as player, index}
            <div class="flex items-center gap-3 p-3 rounded-lg bg-space-700/50 hover:bg-space-700 transition-colors">
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

              {#if isKillBased}
                <!-- UT2004: Kill stats -->
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
                
                <div class="text-center px-2">
                  <div class="text-lg font-bold text-green-400">{player.winRate}%</div>
                  <div class="text-xs text-gray-400">Win Rate</div>
                </div>
                
              {:else}
                <!-- CS1.6: Round stats -->
                <div class="text-center px-2">
                  <div class="text-xl font-black text-cyan-400">{player.totalRounds}</div>
                  <div class="text-xs text-gray-400">Rounds Won</div>
                </div>
                
                <div class="text-center px-2">
                  <div class="text-lg font-bold {player.roundDiff > 0 ? 'text-green-400' : player.roundDiff < 0 ? 'text-red-400' : 'text-gray-400'}">
                    {player.roundDiff > 0 ? '+' : ''}{player.roundDiff}
                  </div>
                  <div class="text-xs text-gray-400">+/- Rounds</div>
                </div>
                
                <div class="text-center px-2">
                  <div class="text-lg font-bold text-purple-400">{player.roundWinRate}%</div>
                  <div class="text-xs text-gray-400">Round %</div>
                </div>
                
                <div class="text-center px-2">
                  <div class="text-lg font-bold text-orange-400">{player.avgRoundsPerMap}</div>
                  <div class="text-xs text-gray-400">Avg/Map</div>
                </div>
                
                <div class="text-center px-2">
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

      <!-- Points Progression Chart -->
      {#if playerStats.length > 0}
        <div class="glass-card rounded-lg p-6 mb-6">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            Wins Progression
          </h2>

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
    
  <Footer />
</div>
