<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, type GameType, GAME_CONFIGS } from '$lib/api';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  let { tournamentId } = $props<{ tournamentId: string }>();

  let tournamentData = $state(null) as any;
  let loading = $state(true);
  let error = $state(null) as string | null;
  let gameType = $state<GameType>('cs16');

  let playerPerformanceChart = $state<HTMLCanvasElement | undefined>(undefined);
  let scoreDistributionChart = $state<HTMLCanvasElement | undefined>(undefined);
  let winLossChart = $state<HTMLCanvasElement | undefined>(undefined);
  let progressTimelineChart = $state<HTMLCanvasElement | undefined>(undefined);

  // Reactive statements to compute statistics
  let playerStats: any[] = $state([]);
  let matchStats: any = $state(null);
  let groupStats: any[] = $state([]);
  let tournamentOverview: any = $state(null);

  // Game-specific labels
  const gameConfig = $derived(GAME_CONFIGS[gameType]);
  const scoreLabel = $derived(gameConfig?.groupStage.scoreLabel || 'Rounds');
  const isKillBased = $derived(gameConfig?.groupStage.scoreType === 'kills');
  const isHealthBased = $derived(gameConfig?.groupStage.scoreType === 'health');

  // Calculate total score (rounds/kills) per player across entire tournament
  function calculatePlayerScoreStats(players: any[], matches: any[], bracketMatches: any[]) {
    const scoreStats: Record<string, { scoreWon: number; scoreLost: number; matchesPlayed: number; bestMatch: number; worstMatch: number; mapsWon: number }> = {};
    
    // Initialize stats for all players
    players.forEach((p: any) => {
      scoreStats[p.id] = { scoreWon: 0, scoreLost: 0, matchesPlayed: 0, bestMatch: 0, worstMatch: Infinity, mapsWon: 0 };
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
          scoreStats[p1Id].bestMatch = Math.max(scoreStats[p1Id].bestMatch, p1Result.score);
          scoreStats[p1Id].worstMatch = Math.min(scoreStats[p1Id].worstMatch, p1Result.score);
          // Track map/match wins
          if (p1Result.score > p2Result.score) scoreStats[p1Id].mapsWon++;
        }
        
        // Track for player 2
        if (scoreStats[p2Id]) {
          scoreStats[p2Id].scoreWon += p2Result.score;
          scoreStats[p2Id].scoreLost += p1Result.score;
          scoreStats[p2Id].bestMatch = Math.max(scoreStats[p2Id].bestMatch, p2Result.score);
          scoreStats[p2Id].worstMatch = Math.min(scoreStats[p2Id].worstMatch, p2Result.score);
          // Track map/match wins
          if (p2Result.score > p1Result.score) scoreStats[p2Id].mapsWon++;
        }
      }
    });

    // Bracket matches (BO3 - each MAP counts as a match, not each series)
    bracketMatches.forEach((match: any) => {
      if (!match.winnerId) return;
      
      const p1Id = match.player1Id;
      const p2Id = match.player2Id;
      
      // Count each map/game as a separate match
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
              scoreStats[p1Id].bestMatch = Math.max(scoreStats[p1Id].bestMatch, game.player1Score);
              scoreStats[p1Id].worstMatch = Math.min(scoreStats[p1Id].worstMatch, game.player1Score);
              // Track map wins
              if (game.player1Score > game.player2Score) scoreStats[p1Id].mapsWon++;
            }
            if (scoreStats[p2Id]) {
              scoreStats[p2Id].scoreWon += game.player2Score;
              scoreStats[p2Id].scoreLost += game.player1Score;
              scoreStats[p2Id].matchesPlayed++;
              scoreStats[p2Id].bestMatch = Math.max(scoreStats[p2Id].bestMatch, game.player2Score);
              scoreStats[p2Id].worstMatch = Math.min(scoreStats[p2Id].worstMatch, game.player2Score);
              // Track map wins
              if (game.player2Score > game.player1Score) scoreStats[p2Id].mapsWon++;
            }
          }
        });
      } else {
        // Fallback: if no games array, count series as 2 maps (minimum for BO3 winner)
        // This is an estimate for legacy data without detailed map scores
        if (scoreStats[p1Id]) scoreStats[p1Id].matchesPlayed += 2;
        if (scoreStats[p2Id]) scoreStats[p2Id].matchesPlayed += 2;
      }
    });

    // Clean up worstMatch for players with no matches
    Object.values(scoreStats).forEach(stats => {
      if (stats.worstMatch === Infinity) stats.worstMatch = 0;
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

  // Update computed values when tournamentData changes
  $effect(() => {
    if (tournamentData?.players && Array.isArray(tournamentData.players)) {
      // Set gameType from tournament data
      gameType = tournamentData.gameType || 'cs16';
      
      const groupMatches = Array.isArray(tournamentData.matches) ? tournamentData.matches : [];
      const bracketMatchesArr = Array.isArray(tournamentData.bracketMatches) ? tournamentData.bracketMatches : [];
      const scoreStats = calculatePlayerScoreStats(tournamentData.players, groupMatches, bracketMatchesArr);

      playerStats = tournamentData.players.map((player: any) => {
        const stats = scoreStats[player.id] || { scoreWon: 0, scoreLost: 0, matchesPlayed: 0, bestMatch: 0, worstMatch: 0, mapsWon: 0 };
        const totalScore = stats.scoreWon + stats.scoreLost;
        const scoreWinRate = totalScore > 0 ? (stats.scoreWon / totalScore) * 100 : 0;
        const avgScorePerMatch = stats.matchesPlayed > 0 ? stats.scoreWon / stats.matchesPlayed : 0;
        // For health-based games: average HP per win (only count wins, not all matches)
        const avgScorePerWin = stats.mapsWon > 0 ? stats.scoreWon / stats.mapsWon : 0;
        const scoreDiff = stats.scoreWon - stats.scoreLost;
        const placement = getTournamentPlacement(player.id, bracketMatchesArr);
        // For health-based games: calculate actual match win rate
        const matchWinRate = stats.matchesPlayed > 0 ? (stats.mapsWon / stats.matchesPlayed) * 100 : 0;

        return {
          ...player,
          scoreWon: stats.scoreWon,
          scoreLost: stats.scoreLost,
          scoreDiff,
          matchesPlayed: stats.matchesPlayed,
          scoreWinRate: Math.round(scoreWinRate * 10) / 10,
          matchWinRate: Math.round(matchWinRate * 10) / 10,
          avgScorePerMatch: Math.round(avgScorePerMatch * 10) / 10,
          avgScorePerWin: Math.round(avgScorePerWin * 10) / 10,
          bestMatch: stats.bestMatch,
          worstMatch: stats.worstMatch,
          mapsWon: stats.mapsWon,
          placement
        };
      }).sort((a: any, b: any) => {
        // Primary: Tournament placement (1st, 2nd, 3rd, etc.)
        if (a.placement !== b.placement) return a.placement - b.placement;
        // Secondary: Points (group stage ranking)
        if (b.points !== a.points) return b.points - a.points;
        // Tertiary: Score won
        return b.scoreWon - a.scoreWon;
      });
    } else {
      playerStats = [];
    }
  });

  $effect(() => {
    if (tournamentData) {
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

      matchStats = {
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
    } else {
      matchStats = null;
    }
  });

  $effect(() => {
    if (tournamentData?.pods && Array.isArray(tournamentData.pods) && tournamentData.players && Array.isArray(tournamentData.players)) {
      groupStats = tournamentData.pods.map((pod: any) => {
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
    } else {
      groupStats = [];
    }
  });

  $effect(() => {
    if (tournamentData) {
      tournamentOverview = {
        name: tournamentData.name || 'Unknown Tournament',
        state: tournamentData.state || 'unknown',
        playerCount: Array.isArray(tournamentData.players) ? tournamentData.players.length : 0,
        groupCount: Array.isArray(tournamentData.pods) ? tournamentData.pods.length : 0,
        gameType: tournamentData.gameType || 'cs16',
        isCompleted: tournamentData.state === 'completed'
      };
    } else {
      tournamentOverview = null;
    }
  });

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

    if (playerPerformanceChart) {
      const ctx = playerPerformanceChart.getContext('2d');
      if (ctx) {
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: playerStats.map(p => p.name),
            datasets: [
              {
                label: 'Points',
                data: playerStats.map(p => p.points),
                backgroundColor: 'rgba(6, 182, 212, 0.8)',
                borderColor: 'rgba(6, 182, 212, 1)',
                borderWidth: 2,
                shadowOffsetX: 0,
                shadowOffsetY: 0,
                shadowBlur: 15,
                shadowColor: 'rgba(6, 182, 212, 0.7)'
              },
              {
                label: 'Wins',
                data: playerStats.map(p => p.wins),
                backgroundColor: 'rgba(34, 197, 94, 0.8)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 2,
                shadowOffsetX: 0,
                shadowOffsetY: 0,
                shadowBlur: 15,
                shadowColor: 'rgba(34, 197, 94, 0.7)'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: { 
                  color: '#fff',
                  font: { size: 14, weight: 'bold' },
                  padding: 15
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { color: '#9ca3af', font: { size: 12 } },
                grid: { color: 'rgba(156, 163, 175, 0.1)' }
              },
              x: {
                ticks: { color: '#9ca3af', font: { size: 12 } },
                grid: { color: 'rgba(156, 163, 175, 0.1)' }
              }
            }
          }
        });
      }
    }

    if (scoreDistributionChart) {
      const ctx = scoreDistributionChart.getContext('2d');
      if (ctx) {
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: playerStats.map(p => p.name),
            datasets: [
              {
                label: `${scoreLabel} Won`,
                data: playerStats.map(p => p.scoreWon || 0),
                borderColor: 'rgba(34, 197, 94, 1)',
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                tension: 0.4,
                fill: true,
                borderWidth: 3,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: 'rgba(34, 197, 94, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                shadowOffsetX: 0,
                shadowOffsetY: 0,
                shadowBlur: 20,
                shadowColor: 'rgba(34, 197, 94, 0.8)'
              },
              {
                label: `${scoreLabel} Lost`,
                data: playerStats.map(p => p.scoreLost || 0),
                borderColor: 'rgba(239, 68, 68, 1)',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                tension: 0.4,
                fill: true,
                borderWidth: 3,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: 'rgba(239, 68, 68, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                shadowOffsetX: 0,
                shadowOffsetY: 0,
                shadowBlur: 20,
                shadowColor: 'rgba(239, 68, 68, 0.8)'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: { 
                  color: '#fff',
                  font: { size: 14, weight: 'bold' },
                  padding: 15
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { color: '#9ca3af', font: { size: 12 } },
                grid: { color: 'rgba(156, 163, 175, 0.1)' }
              },
              x: {
                ticks: { color: '#9ca3af', font: { size: 12 } },
                grid: { color: 'rgba(156, 163, 175, 0.1)' }
              }
            }
          }
        });
      }
    }

    if (winLossChart) {
      const ctx = winLossChart.getContext('2d');
      if (ctx) {
        const totalWins = playerStats.reduce((sum, p) => sum + p.wins, 0);
        const totalDraws = playerStats.reduce((sum, p) => sum + p.draws, 0);
        const totalLosses = playerStats.reduce((sum, p) => sum + p.losses, 0);

        new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Wins', 'Draws', 'Losses'],
            datasets: [{
              data: [totalWins, totalDraws, totalLosses],
              backgroundColor: [
                'rgba(34, 197, 94, 0.9)',
                'rgba(251, 191, 36, 0.9)',
                'rgba(239, 68, 68, 0.9)'
              ],
              borderColor: [
                'rgba(34, 197, 94, 1)',
                'rgba(251, 191, 36, 1)',
                'rgba(239, 68, 68, 1)'
              ],
              borderWidth: 3,
              hoverOffset: 25, 
              offset: 10, 
              shadowOffsetX: 0,
              shadowOffsetY: 0,
              shadowBlur: 25,
              shadowColor: 'rgba(255, 255, 255, 0.5)'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%', 
            plugins: {
              legend: {
                position: 'bottom',
                labels: { 
                  color: '#fff',
                  font: { size: 14, weight: 'bold' },
                  padding: 20,
                  usePointStyle: true,
                  pointStyle: 'circle'
                }
              },
              tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: 'rgba(6, 182, 212, 0.5)',
                borderWidth: 2,
                padding: 12,
                cornerRadius: 8,
                displayColors: true
              }
            }
          }
        });
      }
    }

    if (progressTimelineChart && playerStats.length > 0) {
      const ctx = progressTimelineChart.getContext('2d');
      if (ctx) {
        const topPlayers = playerStats.slice(0, Math.min(5, playerStats.length));
        
        new Chart(ctx, {
          type: 'radar',
          data: {
            labels: ['Points', 'Wins', 'Win Rate %', `${scoreLabel} Won`, 'Matches Played'],
            datasets: topPlayers.map((player, index) => {
              const colors = [
                { bg: 'rgba(6, 182, 212, 0.3)', border: 'rgba(6, 182, 212, 1)', glow: 'rgba(6, 182, 212, 0.8)' },
                { bg: 'rgba(34, 197, 94, 0.3)', border: 'rgba(34, 197, 94, 1)', glow: 'rgba(34, 197, 94, 0.8)' },
                { bg: 'rgba(251, 191, 36, 0.3)', border: 'rgba(251, 191, 36, 1)', glow: 'rgba(251, 191, 36, 0.8)' },
                { bg: 'rgba(236, 72, 153, 0.3)', border: 'rgba(236, 72, 153, 1)', glow: 'rgba(236, 72, 153, 0.8)' },
                { bg: 'rgba(168, 85, 247, 0.3)', border: 'rgba(168, 85, 247, 1)', glow: 'rgba(168, 85, 247, 0.8)' }
              ];
              const color = colors[index % colors.length];
              return {
                label: player.name,
                data: [
                  player.points,
                  player.wins * 3,
                  player.scoreWinRate || 0,
                  (player.scoreWon || 0) / 10,
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
                  font: { size: 12, weight: 'bold' },
                  padding: 15,
                  usePointStyle: true
                }
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
                  font: { size: 13, weight: 'bold' }
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

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 text-gaming-text px-3 py-3">
  <div class="max-w-7xl mx-auto">

    <!-- Header -->
    <div class="flex justify-between items-center mb-6">
      <div>
        <a href={`/tournament/${tournamentId}`} class="text-gray-400 hover:text-cyber-green transition-colors mb-1 inline-block text-xs flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back to Dashboard
        </a>
        <h1 class="text-2xl font-black gradient-text flex items-center gap-2">
          <svg class="w-6 h-6 text-cyber-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          TOURNAMENT STATISTICS
        </h1>
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

      <!-- Tournament Overview -->
      {#if tournamentOverview}
        {@const overview = tournamentOverview}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="glass rounded-lg p-4 text-center">
            <div class="text-2xl font-black text-cyber-green mb-1">{overview.playerCount}</div>
            <div class="text-xs text-gray-400 uppercase tracking-wide">Total Players</div>
          </div>
          <div class="glass rounded-lg p-4 text-center">
            <div class="text-2xl font-black text-cyber-blue mb-1">{overview.groupCount}</div>
            <div class="text-xs text-gray-400 uppercase tracking-wide">Groups</div>
          </div>
          <div class="glass rounded-lg p-4 text-center">
            <div class="text-2xl font-black text-cyber-pink mb-1">{overview.state}</div>
            <div class="text-xs text-gray-400 uppercase tracking-wide">Current Phase</div>
          </div>
          <div class="glass rounded-lg p-4 text-center">
            <div class="text-2xl font-black text-yellow-400 mb-1">{matchStats?.completionRate || 0}%</div>
            <div class="text-xs text-gray-400 uppercase tracking-wide">Complete</div>
          </div>
        </div>
      {/if}

      <!-- Match Statistics -->
      {#if matchStats}
        {@const stats = matchStats}
        <div class="glass rounded-lg p-6 mb-6">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-cyber-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
            Match Statistics
          </h2>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div class="text-center">
              <div class="text-3xl font-black text-cyber-green">{stats.totalMatches}</div>
              <div class="text-xs text-gray-400">Total Maps</div>
            </div>
            <div class="text-center">
              <div class="text-3xl font-black text-cyber-blue">{stats.completedMatches}</div>
              <div class="text-xs text-gray-400">Completed</div>
            </div>
            <div class="text-center">
              <div class="text-3xl font-black text-cyber-pink">{stats.groupMatches}</div>
              <div class="text-xs text-gray-400">Group Stage</div>
            </div>
            <div class="text-center">
              <div class="text-3xl font-black text-yellow-400">{stats.bracketMatches}</div>
              <div class="text-xs text-gray-400">Playoff Maps</div>
            </div>
          </div>

          <!-- Score Statistics (Rounds/Kills/HP based on game) -->
          <div class="mb-4">
            <h3 class="text-sm font-bold text-gray-300 mb-2">{isHealthBased ? 'Health' : isKillBased ? 'Kill' : 'Round'} Statistics</h3>
            <div class="flex gap-2">
              <div class="flex-1 bg-cyan-900/30 rounded p-3 text-center">
                <div class="text-2xl font-black text-cyan-400">{stats.totalScorePlayed}</div>
                <div class="text-xs text-gray-400">Total {isHealthBased ? 'HP' : isKillBased ? 'Kills' : 'Rounds'}</div>
              </div>
              <div class="flex-1 bg-purple-900/30 rounded p-3 text-center">
                <div class="text-2xl font-black text-purple-400">{stats.avgScorePerMatch}</div>
                <div class="text-xs text-gray-400">Avg/Match</div>
              </div>
              <div class="flex-1 bg-orange-900/30 rounded p-3 text-center">
                <div class="text-2xl font-black text-orange-400">{stats.highestScore}</div>
                <div class="text-xs text-gray-400">Best Score</div>
              </div>
              <div class="flex-1 bg-green-900/30 rounded p-3 text-center">
                <div class="text-2xl font-black text-green-400">{stats.closestMatch}</div>
                <div class="text-xs text-gray-400">Closest</div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Player Performance Rankings (CS-Focused: Rounds Won) -->
      <div class="glass rounded-lg p-6 mb-6">
        <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
          <svg class="w-5 h-5 text-cyber-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                {#if player.profilePhoto}
                  <img src={player.profilePhoto} alt="Profile" class="w-10 h-10 rounded-full object-cover" />
                {:else}
                  <div class="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                  </div>
                {/if}
              </div>

              <!-- Player Info -->
              <div class="flex-1 min-w-0">
                <div class="font-bold text-white truncate">{player.name}</div>
                <div class="text-xs text-gray-400">
                  {player.matchesPlayed} matches • Best: {player.bestMatch}
                </div>
              </div>

              <!-- Score Won (Primary Stat - Kills/Rounds/HP based on game) -->
              <div class="text-center px-2">
                <div class="text-xl font-black text-cyan-400">{player.scoreWon}</div>
                <div class="text-xs text-gray-400">{isHealthBased ? 'Total HP' : isKillBased ? 'Total Kills' : 'Rounds Won'}</div>
              </div>

              <!-- Score Difference (K/D for kills, +/- for rounds) - Hidden for health-based games -->
              {#if !isHealthBased}
              <div class="text-center px-2">
                <div class="text-lg font-bold {player.scoreDiff > 0 ? 'text-green-400' : player.scoreDiff < 0 ? 'text-red-400' : 'text-gray-400'}">
                  {player.scoreDiff > 0 ? '+' : ''}{player.scoreDiff}
                </div>
                <div class="text-xs text-gray-400">{isKillBased ? 'K/D Diff' : '+/- Rounds'}</div>
              </div>
              {/if}

              <!-- Win Rate -->
              <div class="text-center px-2">
                <div class="text-lg font-bold text-purple-400">{isHealthBased ? player.matchWinRate : player.scoreWinRate}%</div>
                <div class="text-xs text-gray-400">{isHealthBased ? 'Win Rate' : isKillBased ? 'K/D %' : 'Win %'}</div>
              </div>

              <!-- Avg Score/Match (Avg HP per Win for Worms) -->
              <div class="text-center px-2">
                <div class="text-lg font-bold text-orange-400">{isHealthBased ? player.avgScorePerWin : player.avgScorePerMatch}</div>
                <div class="text-xs text-gray-400">{isHealthBased ? 'Avg HP/Win' : 'Avg/Match'}</div>
              </div>
              
              <!-- Maps/Rounds Won (important for UT2004 and Worms) -->
              {#if isKillBased || isHealthBased}
              <div class="text-center px-2">
                <div class="text-lg font-bold text-yellow-400">{player.mapsWon}</div>
                <div class="text-xs text-gray-400">{isHealthBased ? 'Rounds Won' : 'Maps Won'}</div>
              </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Group Performance -->
      {#if groupStats.length > 0}
        <div class="glass rounded-lg p-6 mb-6">
          <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
            Group Performance ({isHealthBased ? 'HP' : isKillBased ? 'Kills' : 'Rounds'})
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {#each groupStats as group}
              <div class="bg-space-700/50 rounded-lg p-4">
                <div class="flex justify-between items-start mb-2">
                  <h3 class="font-bold text-white">{group.name || `Group ${group.id.slice(-1)}`}</h3>
                  <div class="text-sm text-gray-400">{group.players.length} players</div>
                </div>

                <div class="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div class="text-lg font-bold text-cyber-green">{group.totalMatches}</div>
                    <div class="text-xs text-gray-400">Matches</div>
                  </div>
                  <div>
                    <div class="text-lg font-bold text-cyan-400">{group.totalScore}</div>
                    <div class="text-xs text-gray-400">{isHealthBased ? 'HP' : isKillBased ? 'Kills' : 'Rounds'}</div>
                  </div>
                  <div>
                    <div class="text-lg font-bold text-purple-400">{group.avgScorePerMatch}</div>
                    <div class="text-xs text-gray-400">Avg/Match</div>
                  </div>
                </div>

                <!-- Progress Bar -->
                <div class="mt-3">
                  <div class="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>{group.completionRate}%</span>
                  </div>
                  <div class="w-full bg-space-600 rounded-full h-2">
                    <div
                      class="bg-gradient-to-r from-cyber-green to-cyber-blue h-2 rounded-full transition-all duration-300"
                      style="width: {group.completionRate}%"
                    ></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Tournament Timeline -->
      <div class="glass rounded-lg p-6">
        <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
          <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Tournament Timeline
        </h2>

        <div class="space-y-4">
          <!-- Registration Phase -->
          <div class="flex items-center gap-4">
            <div class="w-4 h-4 rounded-full bg-cyber-green flex-shrink-0"></div>
            <div class="flex-1">
              <div class="font-bold text-white">Registration Phase</div>
              <div class="text-sm text-gray-400">
                {tournamentData.players?.length || 0} players registered
                {#if tournamentData.state === 'registration'}
                  <span class="text-cyber-green font-bold">(Current Phase)</span>
                {/if}
              </div>
            </div>
          </div>

          <!-- Group Stage -->
          <div class="flex items-center gap-4">
            <div class="w-4 h-4 rounded-full
              {tournamentData.state === 'group' || tournamentData.state === 'playoffs' || tournamentData.state === 'completed' ?
                'bg-cyber-blue' : 'bg-gray-600'} flex-shrink-0"></div>
            <div class="flex-1">
              <div class="font-bold text-white">Group Stage</div>
              <div class="text-sm text-gray-400">
                {tournamentData.matches?.filter((m: any) => m.completed).length || 0} of {tournamentData.matches?.length || 0} matches completed
                {#if tournamentData.state === 'group'}
                  <span class="text-cyber-blue font-bold">(Current Phase)</span>
                {/if}
              </div>
            </div>
          </div>

          <!-- Playoffs -->
          <div class="flex items-center gap-4">
            <div class="w-4 h-4 rounded-full
              {tournamentData.state === 'playoffs' || tournamentData.state === 'completed' ?
                'bg-cyber-pink' : 'bg-gray-600'} flex-shrink-0"></div>
            <div class="flex-1">
              <div class="font-bold text-white">Playoffs</div>
              <div class="text-sm text-gray-400">
                {tournamentData.bracketMatches?.filter((m: any) => m.winnerId).length || 0} of {tournamentData.bracketMatches?.length || 0} matches completed
                {#if tournamentData.state === 'playoffs'}
                  <span class="text-cyber-pink font-bold">(Current Phase)</span>
                {/if}
              </div>
            </div>
          </div>

          <!-- Completion -->
          <div class="flex items-center gap-4">
            <div class="w-4 h-4 rounded-full
              {tournamentData.state === 'completed' ? 'bg-yellow-400' : 'bg-gray-600'} flex-shrink-0"></div>
            <div class="flex-1">
              <div class="font-bold text-white">Tournament Complete</div>
              <div class="text-sm text-gray-400">
                {#if tournamentData.state === 'completed'}
                  <span class="text-yellow-400 font-bold">🏆 Champion crowned!</span>
                {:else}
                  Not yet completed
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="glass rounded-lg p-6 mb-6">
        <h2 class="text-2xl font-bold mb-6 text-white flex items-center gap-2">
          <svg class="w-6 h-6 text-cyber-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          Tournament Charts & Analytics
        </h2>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Player Performance Chart -->
          <div class="bg-space-700/50 rounded-lg p-4">
            <h3 class="text-lg font-bold text-white mb-4">Player Performance</h3>
            <div class="h-80">
              <canvas bind:this={playerPerformanceChart}></canvas>
            </div>
          </div>

          <!-- Score Distribution Chart -->
          <div class="bg-space-700/50 rounded-lg p-4">
            <h3 class="text-lg font-bold text-white mb-4">{scoreLabel} Distribution</h3>
            <div class="h-80">
              <canvas bind:this={scoreDistributionChart}></canvas>
            </div>
          </div>

          <!-- Win/Loss Distribution -->
          <div class="bg-space-700/50 rounded-lg p-4">
            <h3 class="text-lg font-bold text-white mb-4">Match Results Distribution</h3>
            <div class="h-80 flex items-center justify-center">
              <canvas bind:this={winLossChart}></canvas>
            </div>
          </div>

          <!-- Player Comparison Radar -->
          <div class="bg-space-700/50 rounded-lg p-4">
            <h3 class="text-lg font-bold text-white mb-4">Top 5 Players Comparison</h3>
            <div class="h-80">
              <canvas bind:this={progressTimelineChart}></canvas>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="glass rounded-lg p-12 text-center">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p class="text-gray-400">No tournament data available</p>
      </div>
    {/if}
  </div>
</div>
