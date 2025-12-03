<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, updateBracketMatch, submitBracketGameResult, type GameType, GAME_CONFIGS } from '$lib/api';
  import Confetti from '../components/Confetti.svelte';

  let { tournamentId } = $props<{ tournamentId: string }>();

  // Add missing state variables
  let tournamentData = $state(null) as any;
  let loading = $state(true);
  let error = $state(null) as string | null;

  let bracketMatches = $state([]) as any[];
  let groupMatches = $state([]) as any[];
  let players = $state([]) as any[];
  let tournamentState = $state('');
  let champion = $state(null) as any;
  let gameType = $state<GameType | null>(null);

  // BO3 match editing state
  let editingMatchId = $state<string | null>(null);
  let mapScores = $state<{ player1Score: number; player2Score: number }[]>([]);

  // Confetti state
  let showConfetti = $state(false);
  let winnerName = $state('');
  let tournamentComplete = $state(false);

  // Derived game config
  const gameConfig = $derived(gameType ? GAME_CONFIGS[gameType] : null);
  const mapsPerMatch = $derived(gameConfig?.playoffs.mapsPerMatch || 3);
  const maxScorePerMap = $derived(gameConfig?.playoffs.maxScorePerMap || gameConfig?.groupStage.maxScore);
  const scoreLabel = $derived(gameConfig?.playoffs.scoreLabel || 'Rounds');
  const isKillBased = $derived(gameConfig?.groupStage.scoreType === 'kills');
  const isHealthBased = $derived(gameConfig?.groupStage.scoreType === 'health');

  // Add helper functions
  function getPlayer(playerId: string) {
    return players.find(p => p.id === playerId);
  }

  function getPlayerName(playerId: string) {
    return getPlayer(playerId)?.name || 'TBD';
  }

  function getRunnerUp() {
    const finals = bracketMatches.find((m: any) => m.bracketType === 'finals');
    if (!finals || !finals.winnerId) return null;
    const loserId = finals.player1Id === finals.winnerId ? finals.player2Id : finals.player1Id;
    return getPlayer(loserId);
  }

  function getThirdPlace() {
    const thirdPlaceMatch = bracketMatches.find((m: any) => m.bracketType === '3rd-place');
    if (!thirdPlaceMatch || !thirdPlaceMatch.winnerId) return null;
    return getPlayer(thirdPlaceMatch.winnerId);
  }

  // Calculate total score (rounds/kills) for a player (group stage + bracket matches)
  function getPlayerTotalScore(playerId: string): number {
    let totalScore = 0;
    
    // Group stage matches
    groupMatches.forEach((match: any) => {
      if (!match.result || !match.completed) return;
      const result = match.result[playerId];
      if (result?.score !== undefined) {
        totalScore += result.score;
      }
    });
    
    // Bracket matches (BO3 - each map counts)
    bracketMatches.forEach((match: any) => {
      if (!match.winnerId) return;
      if (match.player1Id !== playerId && match.player2Id !== playerId) return;
      
      if (match.games && Array.isArray(match.games)) {
        match.games.forEach((game: any) => {
          if (game.player1Score === 0 && game.player2Score === 0) return;
          if (match.player1Id === playerId) {
            totalScore += game.player1Score || 0;
          } else if (match.player2Id === playerId) {
            totalScore += game.player2Score || 0;
          }
        });
      }
    });
    
    return totalScore;
  }
  
  // Get total maps won for a player
  function getPlayerMapsWon(playerId: string): number {
    let mapsWon = 0;
    
    // Group stage matches - each match is 1 map
    groupMatches.forEach((match: any) => {
      if (!match.result || !match.completed) return;
      const playerResult = match.result[playerId];
      const opponentId = match.player1Id === playerId ? match.player2Id : match.player1Id;
      const opponentResult = match.result[opponentId];
      if (playerResult?.score !== undefined && opponentResult?.score !== undefined) {
        if (playerResult.score > opponentResult.score) {
          mapsWon++;
        }
      }
    });
    
    // Bracket matches (BO3)
    bracketMatches.forEach((match: any) => {
      if (!match.winnerId) return;
      if (match.player1Id !== playerId && match.player2Id !== playerId) return;
      
      if (match.games && Array.isArray(match.games)) {
        match.games.forEach((game: any) => {
          if (game.player1Score === 0 && game.player2Score === 0) return;
          const isPlayer1 = match.player1Id === playerId;
          const playerScore = isPlayer1 ? game.player1Score : game.player2Score;
          const opponentScore = isPlayer1 ? game.player2Score : game.player1Score;
          if (playerScore > opponentScore) {
            mapsWon++;
          }
        });
      }
    });
    
    return mapsWon;
  }

  async function loadState() {
    try {
      loading = true;
      error = null;
      tournamentData = await getState(tournamentId);
      
      // Extract data from tournamentData
      bracketMatches = tournamentData.bracketMatches || [];
      groupMatches = tournamentData.matches || [];
      players = tournamentData.players || [];
      tournamentState = tournamentData.state || '';
      champion = tournamentData.champion || null;
      gameType = tournamentData.gameType || 'cs16';
      
      // Check if tournament is complete and champion is declared
      checkForChampion();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load bracket data';
      console.error('Error loading bracket data:', err);
    } finally {
      loading = false;
    }
  }

  function checkForChampion() {
    if (!tournamentData?.bracketMatches) return;

    // Find the finals match
    const finals = tournamentData.bracketMatches.find((m: any) => m.bracketType === 'finals');
    
    if (finals?.winnerId) {
      // Tournament champion declared
      tournamentComplete = true;
      const championPlayer = finals.player1Id === finals.winnerId 
        ? getPlayer(finals.player1Id) 
        : getPlayer(finals.player2Id);
      
      if (championPlayer) {
        winnerName = championPlayer.name;
        champion = championPlayer;
        // Show confetti after a brief delay for page load
        setTimeout(() => {
          showConfetti = true;
        }, 500);
      }
    } else {
      tournamentComplete = false;
      showConfetti = false;
    }
  }

async function handleDeclareWinner(matchId: string, winnerId: string) {
  if (!confirm('Are you sure you want to declare this player as the winner?')) return;
  
  try {
    await updateBracketMatch(tournamentId, matchId, winnerId, null);
    
    // Find winner name for confetti
    const match = bracketMatches.find(m => m.id === matchId); // Changed from allMatches
    const winner = match?.player1Id === winnerId 
      ? getPlayer(match.player1Id) 
      : match?.player2Id === winnerId 
        ? getPlayer(match.player2Id) 
        : null;
    
    if (winner) {
      winnerName = winner.name;
      showConfetti = true;
    }
    
    await loadState();
  } catch (error) {
    console.error('Failed to declare winner:', error);
    alert('Failed to declare winner');
  }
}

  // BO3 Functions
  function startEditingMatch(matchId: string) {
    const match = bracketMatches.find(m => m.id === matchId);
    if (!match || match.winnerId) return;
    
    editingMatchId = matchId;
    // Initialize with existing scores or empty
    if (match.games && match.games.length > 0) {
      mapScores = match.games.map((g: any) => ({
        player1Score: g.player1Score || 0,
        player2Score: g.player2Score || 0
      }));
    } else {
      mapScores = Array(mapsPerMatch).fill(null).map(() => ({ player1Score: 0, player2Score: 0 }));
    }
  }

  function cancelEditingMatch() {
    editingMatchId = null;
    mapScores = [];
  }

  function updateMapScore(mapIndex: number, player: 'player1' | 'player2', value: number) {
    if (!mapScores[mapIndex]) {
      mapScores[mapIndex] = { player1Score: 0, player2Score: 0 };
    }
    const newValue = maxScorePerMap !== undefined ? Math.max(0, Math.min(value, maxScorePerMap)) : Math.max(0, value);
    if (player === 'player1') {
      mapScores[mapIndex].player1Score = newValue;
    } else {
      mapScores[mapIndex].player2Score = newValue;
    }
    // Force reactivity
    mapScores = [...mapScores];
  }

  function getMapWinner(mapIndex: number): 'player1' | 'player2' | null {
    const scores = mapScores[mapIndex];
    if (!scores) return null;
    
    // For CS16 playoffs: winner must have exactly 10 rounds, loser max 9
    if (gameType === 'cs16') {
      const winScore = 10;
      const maxLoserScore = 9;
      
      if (scores.player1Score === winScore && scores.player2Score <= maxLoserScore) {
        return 'player1';
      }
      if (scores.player2Score === winScore && scores.player1Score <= maxLoserScore) {
        return 'player2';
      }
      // Invalid score or incomplete
      return null;
    }
    
    // For other games, just compare scores
    if (scores.player1Score > scores.player2Score) return 'player1';
    if (scores.player2Score > scores.player1Score) return 'player2';
    return null;
  }

  function getSeriesScore(): { player1Wins: number; player2Wins: number } {
    let player1Wins = 0;
    let player2Wins = 0;
    mapScores.forEach((_, idx) => {
      const winner = getMapWinner(idx);
      if (winner === 'player1') player1Wins++;
      if (winner === 'player2') player2Wins++;
    });
    return { player1Wins, player2Wins };
  }

  function getSeriesWinner(): 'player1' | 'player2' | null {
    const { player1Wins, player2Wins } = getSeriesScore();
    const winsNeeded = Math.ceil(mapsPerMatch / 2); // 2 for BO3
    if (player1Wins >= winsNeeded) return 'player1';
    if (player2Wins >= winsNeeded) return 'player2';
    return null;
  }

  function canSubmitSeries(): boolean {
    // Must have a series winner
    if (getSeriesWinner() === null) return false;
    
    // For CS16, validate all maps that have scores are valid
    if (gameType === 'cs16') {
      const winScore = 10;
      const maxLoserScore = 9;
      
      for (let i = 0; i < mapsPerMatch; i++) {
        const scores = mapScores[i];
        if (!scores) continue;
        if (scores.player1Score === 0 && scores.player2Score === 0) continue;
        
        // If map has scores, it must be valid
        const isValidMap = 
          (scores.player1Score === winScore && scores.player2Score <= maxLoserScore) ||
          (scores.player2Score === winScore && scores.player1Score <= maxLoserScore);
        
        if (!isValidMap) return false;
      }
    }
    
    return true;
  }

  function getMapValidationError(mapIndex: number): string | null {
    const scores = mapScores[mapIndex];
    if (!scores) return null;
    if (scores.player1Score === 0 && scores.player2Score === 0) return null;
    
    if (gameType === 'cs16') {
      const winScore = 10;
      const maxLoserScore = 9;
      const { player1Score, player2Score } = scores;
      
      // Check for tie
      if (player1Score === player2Score) {
        return 'No ties';
      }
      
      // Check winner has exactly 10
      if (player1Score > player2Score) {
        if (player1Score !== winScore) {
          return `Winner needs ${winScore}`;
        }
        if (player2Score > maxLoserScore) {
          return `Loser max ${maxLoserScore}`;
        }
      } else {
        if (player2Score !== winScore) {
          return `Winner needs ${winScore}`;
        }
        if (player1Score > maxLoserScore) {
          return `Loser max ${maxLoserScore}`;
        }
      }
    }
    
    return null;
  }

  async function submitBO3Result() {
    if (!editingMatchId) return;
    const match = bracketMatches.find(m => m.id === editingMatchId);
    if (!match) return;

    const seriesWinner = getSeriesWinner();
    if (!seriesWinner) return;

    // Submit each game result with scores
    for (let i = 0; i < mapScores.length; i++) {
      const scores = mapScores[i];
      if (!scores || (scores.player1Score === 0 && scores.player2Score === 0)) continue;
      
      const gameWinner = getMapWinner(i);
      if (!gameWinner) continue;
      
      const winnerId = gameWinner === 'player1' ? match.player1Id : match.player2Id;
      const mapName = gameConfig?.maps?.[i] || `Map ${i + 1}`;
      
      await submitBracketGameResult(tournamentId, editingMatchId, {
        gameNumber: i + 1,
        mapName,
        player1Score: scores.player1Score,
        player2Score: scores.player2Score,
        winnerId
      });
    }
    
    // The server will automatically determine the series winner after game submissions
    // But we need to reload state to see the updated match
    await loadState();
    cancelEditingMatch();
  }

  function getRounds() {
      const rounds = [...new Set(bracketMatches.map(m => m.round))].sort((a, b) => a - b);
      return rounds;
  }

  function getMatchesForRound(round: number) {
      return bracketMatches.filter(m => m.round === round);
  }

  function getRoundLabel(round: number, totalRounds: number) {
    const roundMatches = getMatchesForRound(round);
    const hasThirdPlace = roundMatches.some(m => m.bracketType === '3rd-place');
    
    // Check bracket types in this round
    if (roundMatches.some(m => m.bracketType === 'finals')) {
      return 'Finals';
    }
    if (roundMatches.some(m => m.bracketType === 'semifinals')) {
      return 'Semifinals';
    }
    if (roundMatches.some(m => m.bracketType === 'quarterfinals')) {
      return 'Quarterfinals';
    }
    if (hasThirdPlace) {
      return '3rd Place';
    }
    return `Round ${round}`;
  }

  onMount(loadState);
</script>

<!-- Update the template to include loading/error states -->
<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 text-gaming-text px-3 py-3">
  <div class="max-w-[1800px] mx-auto">
    
    <!-- Header -->
    <div class="flex justify-between items-center mb-3">
      <div>
        <a href={`/tournament/${tournamentId}/groups`} class="text-gray-400 hover:text-cyber-green transition-colors mb-1 inline-block text-xs flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back
        </a>
        <h1 class="text-xl font-black gradient-text flex items-center gap-1.5">
          <svg class="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
          PLAYOFFS BRACKET
        </h1>
      </div>
    </div>

    {#if loading}
      <div class="glass rounded-lg p-8 text-center">
        <div class="animate-spin w-12 h-12 border-4 border-cyber-blue border-t-transparent rounded-full mx-auto mb-4"></div>
        <p class="text-gray-400">Loading bracket data...</p>
      </div>
    {:else if error}
      <div class="glass rounded-lg p-8 text-center">
        <svg class="w-12 h-12 mx-auto mb-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-red-400">{error}</p>
      </div>
    {:else if tournamentState !== 'playoffs' && tournamentState !== 'completed'}
      <div class="glass rounded-lg p-8 text-center">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <p class="text-base text-gray-400 mb-1">Playoffs have not started yet</p>
        <p class="text-gray-500 text-xs">Complete the group stage to generate brackets</p>
      </div>
    {:else}
      
      <!-- Immersive Champion Podium -->
      {#if champion}
        <div class="mb-6">
          <!-- Trophy Header -->
          <div class="text-center mb-4">
            <div class="relative inline-block">
              <div class="w-20 h-20 mx-auto mb-2 rounded-full bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 flex items-center justify-center shadow-xl ring-4 ring-yellow-400/30">
                <span class="text-4xl">🏆</span>
              </div>
            </div>
            <h2 class="text-2xl font-black mb-2 bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500 bg-clip-text text-transparent">
              TOURNAMENT CHAMPION
            </h2>
          </div>

          <!-- Podium Layout -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl mx-auto">
            <!-- 2nd Place (Left) -->
            {#if getRunnerUp()}
              {@const runnerUp = getRunnerUp()}
              <div class="order-2 md:order-1 relative">
                <div class="glass rounded-lg p-4 text-center relative overflow-hidden transform hover:scale-105 transition-all duration-300">
                  <div class="absolute inset-0 bg-gradient-to-br from-gray-400/20 via-gray-300/20 to-gray-400/20"></div>
                  <div class="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-gray-400 to-gray-500"></div>
                  <div class="relative z-10">
                    <div class="text-4xl mb-1">🥈</div>
                    <div class="w-12 h-12 mx-auto mb-2 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shadow-lg">
                      {#if runnerUp.profilePhoto}
                        <img src={runnerUp.profilePhoto} alt="2nd Place" class="w-12 h-12 rounded-full object-cover" />
                      {:else}
                        <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                      {/if}
                    </div>
                    <h3 class="text-sm font-black text-gray-300 mb-1">2ND PLACE</h3>
                    <div class="text-lg font-black text-white mb-1">{runnerUp.name}</div>
                    <div class="text-gray-400 text-xs font-bold">
                      {#if isHealthBased}
                        {getPlayerTotalScore(runnerUp.id)} HP • {getPlayerMapsWon(runnerUp.id)} Rounds
                      {:else if isKillBased}
                        {getPlayerTotalScore(runnerUp.id)} Kills • {getPlayerMapsWon(runnerUp.id)} Maps
                      {:else}
                        {getPlayerTotalScore(runnerUp.id)} Rounds Won
                      {/if}
                    </div>
                  </div>
                </div>
                <!-- Podium height indicator -->
                <div class="h-4 bg-gradient-to-r from-gray-400 to-gray-500 rounded-b-lg mx-2"></div>
              </div>
            {/if}

            <!-- 1st Place (Center) -->
            <div class="order-1 md:order-2 relative">
              <div class="glass rounded-lg p-6 text-center relative overflow-hidden transform hover:scale-105 transition-all duration-300 shadow-2xl">
                <div class="absolute inset-0 bg-gradient-to-br from-yellow-500/20 via-yellow-400/20 to-yellow-500/20"></div>
                <div class="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600"></div>
                <div class="relative z-10">
                  <div class="text-5xl mb-2">👑</div>
                  <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-xl ring-4 ring-yellow-400/30">
                    {#if champion.profilePhoto}
                      <img src={champion.profilePhoto} alt="Champion" class="w-16 h-16 rounded-full object-cover" />
                    {:else}
                      <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                    {/if}
                  </div>
                  <h3 class="text-lg font-black bg-gradient-to-r from-yellow-400 to-yellow-500 bg-clip-text text-transparent mb-2">CHAMPION</h3>
                  <div class="text-2xl font-black text-white mb-2">{champion.name}</div>
                  <div class="text-cyber-green text-sm font-bold">
                    {#if isHealthBased}
                      {getPlayerTotalScore(champion.id)} HP • {getPlayerMapsWon(champion.id)} Rounds Won
                    {:else if isKillBased}
                      {getPlayerTotalScore(champion.id)} Kills • {getPlayerMapsWon(champion.id)} Maps Won
                    {:else}
                      {getPlayerTotalScore(champion.id)} Rounds Won
                    {/if}
                  </div>
                  <div class="mt-2 px-3 py-1 bg-yellow-500/20 rounded-full text-yellow-400 text-xs font-bold">🏆 VICTORIOUS 🏆</div>
                </div>
              </div>
              <!-- Podium height indicator -->
              <div class="h-8 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 rounded-b-lg mx-2"></div>
            </div>

            <!-- 3rd Place (Right) -->
            {#if getThirdPlace()}
              {@const thirdPlace = getThirdPlace()}
              <div class="order-3 relative">
                <div class="glass rounded-lg p-4 text-center relative overflow-hidden transform hover:scale-105 transition-all duration-300">
                  <div class="absolute inset-0 bg-gradient-to-br from-orange-500/20 via-orange-400/20 to-orange-500/20"></div>
                  <div class="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-orange-400 to-orange-500"></div>
                  <div class="relative z-10">
                    <div class="text-4xl mb-1">🥉</div>
                    <div class="w-12 h-12 mx-auto mb-2 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
                      {#if thirdPlace.profilePhoto}
                        <img src={thirdPlace.profilePhoto} alt="3rd Place" class="w-12 h-12 rounded-full object-cover" />
                      {:else}
                        <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                      {/if}
                    </div>
                    <h3 class="text-sm font-black text-orange-400 mb-1">3RD PLACE</h3>
                    <div class="text-lg font-black text-white mb-1">{thirdPlace.name}</div>
                    <div class="text-orange-400 text-xs font-bold">
                      {#if isHealthBased}
                        {getPlayerTotalScore(thirdPlace.id)} HP • {getPlayerMapsWon(thirdPlace.id)} Rounds
                      {:else if isKillBased}
                        {getPlayerTotalScore(thirdPlace.id)} Kills • {getPlayerMapsWon(thirdPlace.id)} Maps
                      {:else}
                        {getPlayerTotalScore(thirdPlace.id)} Rounds Won
                      {/if}
                    </div>
                  </div>
                </div>
            <!-- Podium height indicator -->
            <div class="h-2 bg-gradient-to-r from-orange-400 to-orange-500 rounded-b-lg mx-2"></div>
              </div>
            {/if}
          </div>
          
          <!-- View Statistics Button -->
          <div class="text-center mt-6">
            <a 
              href={`/tournament/${tournamentId}/statistics`}
              class="bg-gradient-to-r from-brand-orange to-brand-purple text-white font-bold text-sm py-2 px-6 rounded-lg shadow-glow-orange hover:scale-105 transition-transform inline-flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
              View Full Statistics
            </a>
          </div>
        </div>
      {/if}      <div class="space-y-6">
        
        <!-- Playoff Bracket -->
        <div class="glass rounded-lg p-3">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-1 h-4 bg-gradient-to-b from-cyber-green to-cyber-blue rounded-full"></div>
            <h2 class="text-base font-black text-white">PLAYOFF BRACKET</h2>
            <div class="text-xs px-2 py-0.5 bg-cyber-green/20 text-cyber-green rounded-full font-bold">Single Elimination</div>
          </div>
          
          <div class="relative">
            <div class="flex gap-4 overflow-x-auto pb-2">
              {#each getRounds() as round, roundIndex}
                {@const roundMatches = getMatchesForRound(round)}
                {@const totalRounds = getRounds().length}
                <div class="flex-shrink-0 w-64 flex flex-col justify-around gap-3 relative">
                  <div class="text-center mb-2">
                    <h3 class="font-black text-sm text-cyber-blue">
                      {getRoundLabel(round, totalRounds)}
                    </h3>
                  </div>
                  
                  {#each roundMatches as match, matchIndex}
                    {@const player1 = getPlayer(match.player1Id)}
                    {@const player2 = getPlayer(match.player2Id)}
                    {@const isEditing = editingMatchId === match.id}
                    
                    <div class="relative">
                      {#if roundIndex < totalRounds - 1 && match.bracketType !== 'third-place'}
                        <svg class="absolute left-full top-1/2 w-4 h-12 -translate-y-1/2 pointer-events-none z-0" style="margin-left: -1px;">
                          <path d="M 0 0 L 16 0" stroke="#334155" stroke-width="1" fill="none"/>
                        </svg>
                      {/if}

                      <div class="glass rounded-lg overflow-hidden relative z-10">
                        <div class="bg-gradient-to-r from-space-700 to-space-800 px-2 py-1 flex items-center justify-between">
                          <span class="text-xs font-bold text-gray-400">{match.matchLabel || `M${matchIndex + 1}`}</span>
                          <span class="text-xs font-bold text-brand-cyan">BO{mapsPerMatch}</span>
                        </div>

                        {#if isEditing}
                          <!-- BO3 Editing Mode -->
                          <div class="p-2 space-y-2">
                            <!-- Player Names Header -->
                            <div class="flex items-center justify-between text-xs">
                              <div class="flex items-center gap-1.5 flex-1">
                                {#if player1?.profilePhoto}
                                  <img src={player1.profilePhoto} alt="Profile" class="w-5 h-5 rounded-full object-cover" />
                                {:else}
                                  <div class="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                                    <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                                  </div>
                                {/if}
                                <span class="font-bold text-white truncate">{getPlayerName(match.player1Id)}</span>
                              </div>
                              <div class="px-2 text-gray-500 font-bold">vs</div>
                              <div class="flex items-center gap-1.5 flex-1 justify-end">
                                <span class="font-bold text-white truncate">{getPlayerName(match.player2Id)}</span>
                                {#if player2?.profilePhoto}
                                  <img src={player2.profilePhoto} alt="Profile" class="w-5 h-5 rounded-full object-cover" />
                                {:else}
                                  <div class="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                                  </div>
                                {/if}
                              </div>
                            </div>

                            <!-- Series Score Display -->
                            <div class="flex justify-center items-center gap-3 py-1">
                              <span class="text-xl font-black {getSeriesScore().player1Wins >= Math.ceil(mapsPerMatch/2) ? 'text-cyber-green' : 'text-white'}">{getSeriesScore().player1Wins}</span>
                              <span class="text-gray-500 text-sm">-</span>
                              <span class="text-xl font-black {getSeriesScore().player2Wins >= Math.ceil(mapsPerMatch/2) ? 'text-cyber-green' : 'text-white'}">{getSeriesScore().player2Wins}</span>
                            </div>

                            <!-- Map Score Inputs -->
                            {#each Array(mapsPerMatch) as _, mapIdx}
                              {@const mapWinner = getMapWinner(mapIdx)}
                              {@const mapScore = mapScores[mapIdx] || { player1Score: 0, player2Score: 0 }}
                              {@const mapError = getMapValidationError(mapIdx)}
                              <div class="space-y-1">
                                <div class="flex items-center gap-2 p-1.5 rounded bg-space-700/50 {mapWinner ? (mapWinner === 'player1' ? 'border-l-2 border-cyan-500' : 'border-r-2 border-purple-500') : mapError ? 'border border-red-500/50' : ''}">
                                  <span class="text-xs text-gray-500 w-12">Map {mapIdx + 1}</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max={maxScorePerMap || undefined}
                                    value={mapScore.player1Score}
                                    oninput={(e) => updateMapScore(mapIdx, 'player1', parseInt((e.target as HTMLInputElement).value) || 0)}
                                    class="w-12 text-center text-sm font-bold bg-space-600 border border-space-500 rounded py-1 text-white focus:outline-none focus:ring-1 focus:ring-brand-cyan appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] {mapWinner === 'player1' ? 'ring-1 ring-cyber-green' : ''}"
                                  />
                                  <span class="text-gray-500">-</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max={maxScorePerMap || undefined}
                                    value={mapScore.player2Score}
                                    oninput={(e) => updateMapScore(mapIdx, 'player2', parseInt((e.target as HTMLInputElement).value) || 0)}
                                    class="w-12 text-center text-sm font-bold bg-space-600 border border-space-500 rounded py-1 text-white focus:outline-none focus:ring-1 focus:ring-brand-cyan appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] {mapWinner === 'player2' ? 'ring-1 ring-cyber-green' : ''}"
                                  />
                                  />
                                </div>
                                {#if mapError}
                                  <div class="text-xs text-red-400 text-center">{mapError}</div>
                                {/if}
                              </div>
                            {/each}

                            <!-- Action Buttons -->
                            <div class="flex gap-2 pt-1">
                              <button
                                onclick={cancelEditingMatch}
                                class="flex-1 py-1.5 text-xs font-bold bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onclick={submitBO3Result}
                                disabled={!canSubmitSeries()}
                                class="flex-1 py-1.5 text-xs font-bold rounded transition-all {canSubmitSeries() ? 'bg-gradient-to-r from-cyber-green to-emerald-500 text-space-900 hover:scale-105' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
                              >
                                {canSubmitSeries() ? `Submit (${getSeriesScore().player1Wins}-${getSeriesScore().player2Wins})` : 'Need Winner'}
                              </button>
                            </div>
                          </div>
                        {:else}
                          <!-- Normal View / Click to Edit -->
                          {#if !match.winnerId && match.player1Id && match.player2Id}
                            <button
                              type="button"
                              class="w-full p-2 text-center text-xs text-brand-cyan hover:bg-brand-cyan/10 transition-colors"
                              onclick={() => startEditingMatch(match.id)}
                            >
                              Click to enter scores
                            </button>
                          {/if}

                          <!-- Player 1 -->
                          <div 
                            class="w-full text-left px-2 py-1.5 border-b border-space-600 transition-all {match.winnerId === match.player1Id ? 'bg-cyber-green/20 ring-1 ring-cyber-green' : ''} {match.winnerId && match.winnerId !== match.player1Id ? 'opacity-40' : ''}"
                          >
                            <div class="flex items-center justify-between">
                              <div class="flex items-center gap-1.5">
                                {#if player1?.profilePhoto}
                                  <img src={player1.profilePhoto} alt="Profile" class="w-5 h-5 rounded-full object-cover" />
                                {:else}
                                  <div class="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                                    <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                                  </div>
                                {/if}
                                <div>
                                  <div class="font-bold text-xs text-white">{getPlayerName(match.player1Id)}</div>
                                </div>
                              </div>
                              {#if match.winnerId === match.player1Id}
                                <svg class="w-4 h-4 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                              {/if}
                            </div>
                          </div>
                          
                          <!-- Player 2 -->
                          <div 
                            class="w-full text-left px-2 py-1.5 transition-all {match.winnerId === match.player2Id ? 'bg-cyber-green/20 ring-1 ring-cyber-green' : ''} {match.winnerId && match.winnerId !== match.player2Id ? 'opacity-40' : ''}"
                          >
                            <div class="flex items-center justify-between">
                              <div class="flex items-center gap-1.5">
                                {#if player2?.profilePhoto}
                                  <img src={player2.profilePhoto} alt="Profile" class="w-5 h-5 rounded-full object-cover" />
                                {:else}
                                  <div class="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                                  </div>
                                {/if}
                                <div>
                                  <div class="font-bold text-xs text-white">{getPlayerName(match.player2Id)}</div>
                                </div>
                              </div>
                              {#if match.winnerId === match.player2Id}
                                <svg class="w-4 h-4 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                              {/if}
                            </div>
                          </div>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Confetti (shows on champion declaration) -->
<Confetti bind:show={showConfetti} duration={5000} />
