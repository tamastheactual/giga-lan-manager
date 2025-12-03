<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, submitMatch, generateBrackets, updateGroupName, resetGroupData, resetTournament, type GameType, GAME_CONFIGS } from '$lib/api';

  let { tournamentId } = $props<{ tournamentId: string }>();

  let pods = $state([]) as any[];
  let matches = $state([]) as any[];
  let players = $state([]) as any[];
  let tournamentState = $state('');
  let currentRound = $state(1);
  let gameType = $state<GameType | null>(null);

  // Score-based input state (player1Score, player2Score per match)
  let matchScores = $state({}) as Record<string, { player1Score: number; player2Score: number }>;

  // Group editing state
  let editingGroupId = $state(null) as string | null;
  let editingGroupName = $state('');

  // Popup state
  let showErrorPopup = $state(false);
  let errorMessage = $state('');
  let showConfirmPopup = $state(false);
  let confirmMessage = $state('');
  let confirmTitle = $state('');
  let confirmButtonText = $state('Confirm');
  let pendingAction = $state<(() => Promise<void>) | null>(null);

  // Derived game config
  const gameConfig = $derived(gameType ? GAME_CONFIGS[gameType] : null);
  const scoreLabel = $derived(gameConfig?.groupStage.scoreLabel || 'Score');
  const maxScore = $derived(gameConfig?.groupStage.maxScore); // undefined = no limit
  const tieAllowed = $derived(gameConfig?.groupStage.tieAllowed ?? true);

  // Popup helper functions
  function showError(message: string) {
    errorMessage = message;
    showErrorPopup = true;
  }

  async function executeConfirmedAction() {
    if (pendingAction) {
      await pendingAction();
    }
    showConfirmPopup = false;
    pendingAction = null;
  }

  function cancelConfirmation() {
    showConfirmPopup = false;
    pendingAction = null;
  }

  // Group name editing functions
  function startEditingGroup(groupId: string, currentName: string) {
    editingGroupId = groupId;
    editingGroupName = currentName || `Group ${groupId}`;
  }

  function cancelEditingGroup() {
    editingGroupId = null;
    editingGroupName = '';
  }

  async function saveGroupName(groupId: string) {
    try {
      await updateGroupName(tournamentId, groupId, editingGroupName.trim());
      await loadState();
      editingGroupId = null;
      editingGroupName = '';
    } catch (error) {
      console.error('Failed to update group name:', error);
      showError('Failed to update group name');
    }
  }

  function handleResetGroup(groupId: string) {
    confirmTitle = 'Reset Group';
    confirmMessage = 'Reset all match results for this group? This will clear all player stats in this group.';
    confirmButtonText = 'Reset';
    pendingAction = async () => {
      try {
        await resetGroupData(tournamentId, groupId);
        await loadState();
      } catch (error) {
        console.error('Failed to reset group data:', error);
        showError('Failed to reset group data');
      }
    };
    showConfirmPopup = true;
  }

  function handleResetTournament() {
    confirmTitle = 'Reset Tournament';
    confirmMessage = 'Reset the entire tournament? This will delete ALL tournament data including players, groups, matches, and brackets. This action cannot be undone.';
    confirmButtonText = 'Reset';
    pendingAction = async () => {
      try {
        await resetTournament(tournamentId);
        window.location.href = '/';
      } catch (error) {
        console.error('Failed to reset tournament:', error);
        showError('Failed to reset tournament');
      }
    };
    showConfirmPopup = true;
  }

  function getGroupDisplayName(groupId: string) {
    const pod = pods.find(p => p.id === groupId);
    return pod?.name || `Group ${groupId}`;
  }
  
  // Reactive derived values using $derived
  let currentRoundMatches = $derived(getMatchesForRound(currentRound));
  let groupsWithPlayers = $derived(getGroupsWithPlayers());
  let availableRounds = $derived([...new Set(matches.map(m => m.round))].sort((a, b) => a - b));
  
  // Debug logging with $effect
  $effect(() => {
    console.log('[Groups] Reactive update - currentRound:', currentRound);
    console.log('[Groups] Reactive update - matches count:', matches.length);
    console.log('[Groups] Reactive update - currentRoundMatches count:', currentRoundMatches.length);
    console.log('[Groups] Reactive update - matchScores:', matchScores);
    console.log('[Groups] Reactive update - pods:', pods.length);
  });

  // Track if we've done initial auto-advance
  let hasAutoAdvanced = $state(false);

  // Auto-advance to the first incomplete round on initial load only
  $effect(() => {
    if (!hasAutoAdvanced && matches.length > 0) {
      // Find the first incomplete round
      const maxRound = Math.max(...availableRounds);
      for (let round = 1; round <= maxRound; round++) {
        if (!isRoundComplete(round)) {
          if (round !== currentRound) {
            console.log(`[Groups] Initial load: advancing to first incomplete round ${round}`);
            currentRound = round;
          }
          break;
        }
      }
      hasAutoAdvanced = true;
    }
  });

  async function loadState() {
    console.log('[Groups] loadState() called');
    const data = await getState(tournamentId);
    console.log('[Groups] loadState() received data:', {
      podsCount: data.pods.length,
      matchesCount: data.matches.length,
      playersCount: data.players.length,
      state: data.state
    });

    // With $state, direct assignment triggers reactivity
    pods = data.pods;
    matches = data.matches;
    players = data.players;
    tournamentState = data.state;
    gameType = data.gameType || 'cs16';

    // Initialize scores from existing results
    matches.forEach(m => {
        if (m.result) {
            // Try to get stored scores, or calculate from points
            const p1Result = m.result[m.player1Id];
            const p2Result = m.result[m.player2Id];
            matchScores[m.id] = {
                player1Score: p1Result?.score ?? (p1Result?.points === 3 ? 16 : p1Result?.points === 1 ? 15 : 0),
                player2Score: p2Result?.score ?? (p2Result?.points === 3 ? 16 : p2Result?.points === 1 ? 15 : 0)
            };
        }
    });

    console.log('[Groups] loadState() complete - matchScores:', matchScores);
  }

  function getPlayerName(id: string) {
    return players.find(p => p.id === id)?.name || 'Unknown';
  }

  function getPlayer(id: string) {
    return players.find(p => p.id === id);
  }

  function getMatchForPod(podId: string) {
    return matches.find(m => m.podId === podId);
  }
  
  function getMatchesForPod(podId: string) {
    return matches.filter(m => m.podId === podId);
  }
  
  function getMatchesForRound(round: number) {
    return matches.filter(m => m.round === round);
  }
  
  function isRoundComplete(round: number) {
    const roundMatches = getMatchesForRound(round);
    return roundMatches.length > 0 && roundMatches.every(m => m.completed);
  }
  
  function getMatchStatus(match: any) {
    if (!match) return 'pending';
    if (match.completed) return 'complete';
    if (matchScores[match.id] && (matchScores[match.id].player1Score > 0 || matchScores[match.id].player2Score > 0)) return 'live';
    return 'pending';
  }

  function updateScore(matchId: string, player: 'player1' | 'player2', value: number) {
    if (!matchScores[matchId]) {
      matchScores[matchId] = { player1Score: 0, player2Score: 0 };
    }
    // Clamp value between 0 and maxScore (if maxScore is defined)
    const clampedValue = maxScore !== undefined ? Math.max(0, Math.min(value, maxScore)) : Math.max(0, value);
    if (player === 'player1') {
      matchScores[matchId].player1Score = clampedValue;
    } else {
      matchScores[matchId].player2Score = clampedValue;
    }
  }

  function getMatchResult(matchId: string) {
    const scores = matchScores[matchId];
    if (!scores) return null;
    const { player1Score, player2Score } = scores;
    if (player1Score > player2Score) return 'player1';
    if (player2Score > player1Score) return 'player2';
    // For health-based games (Worms), 0-0 is a valid tie (mutual kill)
    if (player1Score === player2Score && (player1Score > 0 || (tieAllowed && gameConfig?.groupStage.scoreType === 'health'))) return 'tie';
    return null;
  }

  function isValidScore(matchId: string) {
    const scores = matchScores[matchId];
    if (!scores) return false;
    const { player1Score, player2Score } = scores;
    // For health-based games (Worms), 0-0 is valid (mutual kill/tie)
    const isHealthBased = gameConfig?.groupStage.scoreType === 'health';
    // Need at least one score, unless it's a health-based game where 0-0 tie is valid
    if (player1Score === 0 && player2Score === 0 && !isHealthBased) return false;
    // For games that don't allow ties, scores must be different
    if (!tieAllowed && player1Score === player2Score) return false;
    
    // CS16 specific: MR15 format (first to 15 rounds wins)
    // Valid results: 15-X where X is 0-14, or 15-15 (tie)
    if (gameType === 'cs16') {
      const winScore = 15;
      const maxLoserScore = 14; // In regulation, loser can have max 14
      
      if (player1Score > player2Score) {
        // Player 1 wins - must have exactly 15, loser max 14
        if (player1Score !== winScore || player2Score > maxLoserScore) return false;
      } else if (player2Score > player1Score) {
        // Player 2 wins - must have exactly 15, loser max 14
        if (player2Score !== winScore || player1Score > maxLoserScore) return false;
      } else {
        // Tie - only valid at 15-15
        if (player1Score !== 15) return false;
      }
    }
    return true;
  }

  function getValidationError(matchId: string): string | null {
    const scores = matchScores[matchId];
    if (!scores) return null;
    const { player1Score, player2Score } = scores;
    
    if (player1Score === 0 && player2Score === 0) return null;
    
    if (!tieAllowed && player1Score === player2Score) {
      return 'Ties not allowed - scores must be different';
    }
    
    if (gameType === 'cs16') {
      const winScore = 15;
      const maxLoserScore = 14;
      
      if (player1Score > player2Score) {
        if (player1Score !== winScore) {
          return `Winner must have exactly ${winScore} rounds`;
        }
        if (player2Score > maxLoserScore) {
          return `Loser cannot have more than ${maxLoserScore} rounds`;
        }
      } else if (player2Score > player1Score) {
        if (player2Score !== winScore) {
          return `Winner must have exactly ${winScore} rounds`;
        }
        if (player1Score > maxLoserScore) {
          return `Loser cannot have more than ${maxLoserScore} rounds`;
        }
      } else if (player1Score !== 15) {
        return 'Ties only valid at 15-15';
      }
    }
    
    return null;
  }

  async function submitMatchResult(matchId: string, match: any) {
      console.log('[Groups] submitMatchResult called:', matchId);
      const scores = matchScores[matchId];
      if (!scores || !isValidScore(matchId)) return;

      const { player1Score, player2Score } = scores;
      const result = getMatchResult(matchId);
      
      const results: any = {};
      if (result === 'player1') {
        results[match.player1Id] = { points: 3, score: player1Score };
        results[match.player2Id] = { points: 0, score: player2Score };
      } else if (result === 'player2') {
        results[match.player1Id] = { points: 0, score: player1Score };
        results[match.player2Id] = { points: 3, score: player2Score };
      } else if (result === 'tie') {
        results[match.player1Id] = { points: 1, score: player1Score };
        results[match.player2Id] = { points: 1, score: player2Score };
      }

      console.log('[Groups] submitMatchResult - submitting results:', results);
      await submitMatch(tournamentId, matchId, results);
      console.log('[Groups] submitMatchResult - match submitted, reloading state');
      await loadState();
      console.log('[Groups] submitMatchResult complete');
  }

  function handleGenerateBrackets() {
    confirmTitle = 'Generate Brackets';
    confirmMessage = 'Finish Group Stage and Generate Brackets? This will advance the tournament to the playoffs.';
    confirmButtonText = 'Generate';
    pendingAction = async () => {
      try {
        console.log('[Groups] Generating brackets...');
        await generateBrackets(tournamentId);
        console.log('[Groups] Brackets generated, redirecting...');
        window.location.href = `/tournament/${tournamentId}/brackets`;
      } catch (error) {
        console.error('[Groups] Error generating brackets:', error);
        showError('Failed to generate brackets. Check console for details.');
      }
    };
    showConfirmPopup = true;
  }

  function getStandings() {
    return [...players].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      // Tiebreaker: total game score (rounds for CS, kills for UT, etc.)
      if ((b.totalGameScore || 0) !== (a.totalGameScore || 0)) return (b.totalGameScore || 0) - (a.totalGameScore || 0);
      // Then wins
      if (b.wins !== a.wins) return b.wins - a.wins;
      return 0;
    });
  }

  // Group players by their pod/group
  function getGroupsWithPlayers() {
    // Get unique pod IDs for round 1 to determine groups
    const round1Pods = pods.filter(p => p.round === 1);
    const groups: Record<string, any[]> = {};
    
    round1Pods.forEach(pod => {
      const groupKey = pod.id;
      if (!groups[groupKey]) groups[groupKey] = [];
      
      // Get players directly from pod.players
      pod.players.forEach((pid: string) => {
        const player = getPlayer(pid);
        if (player && !groups[groupKey].find(p => p.id === pid)) {
          groups[groupKey].push(player);
        }
      });
    });
    
    // Sort players within each group by standings
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        // Tiebreaker: total game score (rounds for CS, kills for UT, etc.)
        if ((b.totalGameScore || 0) !== (a.totalGameScore || 0)) return (b.totalGameScore || 0) - (a.totalGameScore || 0);
        if (b.wins !== a.wins) return b.wins - a.wins;
        return 0;
      });
    });
    
    return groups;
  }

  onMount(loadState);
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 text-gaming-text px-3 py-3">
  <div class="max-w-7xl mx-auto">
    
    <!-- Header -->
    <div class="flex justify-between items-center mb-3">
      <div>
        <a href={`/tournament/${tournamentId}`} class="text-gray-400 hover:text-cyber-green transition-colors mb-1 inline-block text-xs flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back
        </a>
        <h1 class="text-xl font-black gradient-text flex items-center gap-1.5">
          <svg class="w-5 h-5 text-cyber-pink" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clip-rule="evenodd"/></svg>
          GROUP STAGE • R{currentRound}/3
        </h1>
      </div>
      
      {#if tournamentState === 'group' && matches.every(m => m.completed)}
        <button 
          onclick={handleGenerateBrackets}
          class="bg-gradient-to-r from-brand-orange to-brand-purple text-white font-bold text-xs py-1.5 px-4 rounded-lg shadow-glow-orange hover:scale-105 transition-transform flex items-center gap-1.5"
        >
          Playoffs
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </button>
      {/if}
    </div>

    <!-- Round Progress -->
    <div class="glass rounded-lg p-2 mb-3">
      <div class="flex items-center gap-2">
        {#each availableRounds as round}
          <button 
            onclick={() => currentRound = round}
            class="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded {currentRound === round ? 'bg-brand-cyan/20 text-brand-cyan' : 'text-gray-500 hover:bg-space-700'} transition-all"
          >
            <div class="w-6 h-6 rounded-full border {isRoundComplete(round) ? 'bg-brand-cyan border-brand-cyan text-space-900' : currentRound === round ? 'border-brand-cyan' : 'border-gray-600'} flex items-center justify-center font-bold text-xs">
              {#if isRoundComplete(round)}
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
              {:else}
                {round}
              {/if}
            </div>
            <span class="font-bold text-xs">R{round}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Group Tables Section -->
    <div class="mb-4">
      <h2 class="text-base font-bold mb-2 text-white flex items-center gap-1.5">
        <svg class="w-4 h-4 text-cyber-blue" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
        Group Tables
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#each Object.entries(groupsWithPlayers) as [groupId, groupPlayers] (groupId)}
          <div class="glass rounded-lg p-2">
            <!-- Group Header with Edit and Reset -->
            <div class="flex items-center justify-between mb-1.5 px-2">
              {#if editingGroupId === groupId}
                <div class="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    bind:value={editingGroupName}
                    class="flex-1 px-2 py-1 text-xs bg-space-700 border border-cyber-blue rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-cyber-green"
                    placeholder="Group name..."
                    onkeydown={(e) => {
                      if (e.key === 'Enter') saveGroupName(groupId);
                      if (e.key === 'Escape') cancelEditingGroup();
                    }}
                  />
                  <button
                    onclick={() => saveGroupName(groupId)}
                    class="px-2 py-1 text-xs bg-brand-purple text-white rounded font-bold hover:bg-brand-cyan transition-colors"
                  >
                    ✓
                  </button>
                  <button
                    onclick={cancelEditingGroup}
                    class="px-2 py-1 text-xs bg-gray-600 text-white rounded font-bold hover:bg-gray-500"
                  >
                    ✕
                  </button>
                </div>
              {:else}
                <div class="flex items-center gap-2 flex-1">
                  <span class="text-xs font-bold text-cyber-blue hover:text-cyber-green transition-colors">
                    {getGroupDisplayName(groupId)}
                  </span>
                  {#if tournamentState === 'registration'}
                    <button
                      class="ml-2 px-2 py-1 text-xs bg-brand-purple text-white rounded hover:bg-brand-cyan transition-colors"
                      onclick={() => startEditingGroup(groupId, getGroupDisplayName(groupId))}
                    >
                      Edit
                    </button>
                  {/if}
                </div>
              {/if}
              <button
                onclick={() => handleResetGroup(groupId)}
                class="px-2 py-1 text-xs bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-lg font-bold shadow-md shadow-red-500/20 hover:shadow-red-500/40 hover:scale-105 transition-all duration-300 border border-red-400/30"
                title="Reset group data"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </button>
            </div>
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-space-600">
                  <th class="text-left py-1 px-1 text-gray-400 font-bold text-xs">#</th>
                  <th class="text-left py-1 px-1 text-gray-400 font-bold text-xs">Player</th>
                  <th class="text-center py-1 px-1 text-gray-400 font-bold text-xs">P</th>
                  <th class="text-center py-1 px-1 text-gray-400 font-bold text-xs">W</th>
                  <th class="text-center py-1 px-1 text-gray-400 font-bold text-xs">D</th>
                  <th class="text-center py-1 px-1 text-gray-400 font-bold text-xs">L</th>
                  <th class="text-center py-1 px-1 text-gray-400 font-bold text-xs" title="{scoreLabel} - Tiebreaker">{gameType === 'cs16' ? 'Rds' : gameType === 'ut2004' ? 'K' : 'HP'}</th>
                  <th class="text-center py-1 px-1 text-gray-400 font-bold text-xs">Pts</th>
                </tr>
              </thead>
              <tbody>
                {#each groupPlayers as player, index (player.id)}
                  <tr class="border-b border-space-700/50 hover:bg-space-700/30 transition-colors">
                    <td class="py-1 px-1">
                      <div class="w-4 h-4 rounded-full flex items-center justify-center font-bold text-xs {index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-space-900' : index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-space-900' : 'bg-space-600 text-gray-400'}">
                        {index + 1}
                      </div>
                    </td>
                    <td class="py-1 px-1 font-bold text-white text-xs flex items-center gap-2">
                      {#if player.profilePhoto}
                        <img src={player.profilePhoto} alt="Profile" class="w-6 h-6 rounded-full object-cover inline-block" />
                      {/if}
                      {player.name}
                    </td>                    
                    <td class="text-center py-1 px-1 text-gray-400">{(player.wins || 0) + (player.draws || 0) + (player.losses || 0)}</td>
                    <td class="text-center py-1 px-1 text-cyber-green font-bold">{player.wins || 0}</td>
                    <td class="text-center py-1 px-1 text-yellow-500 font-bold">{player.draws || 0}</td>
                    <td class="text-center py-1 px-1 text-red-400 font-bold">{player.losses || 0}</td>
                    <td class="text-center py-1 px-1 text-brand-cyan font-bold" title="{scoreLabel}">{player.totalGameScore || 0}</td>
                    <td class="text-center py-1 px-1 text-cyber-green font-black">{player.points || 0}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/each}
      </div>
        </div>
    <!-- Matches Section -->
    <div>
      <h2 class="text-base font-bold mb-2 text-white">Round {currentRound} Matches</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {#each currentRoundMatches as match (match.id)}
          {@const player1 = getPlayer(match.player1Id)}
          {@const player2 = getPlayer(match.player2Id)}
          {@const status = getMatchStatus(match)}
          {@const result = getMatchResult(match.id)}
          {@const scores = matchScores[match.id] || { player1Score: 0, player2Score: 0 }}
            
            <div class="glass rounded-lg overflow-hidden">
              <!-- Header with status -->
              <div class="bg-space-700/80 px-3 py-1.5 flex items-center justify-between border-b border-space-600">
                <span class="text-xs font-bold text-gray-400">{scoreLabel}</span>
                <div class="flex items-center gap-1 text-xs font-bold {status === 'complete' ? 'text-brand-cyan' : status === 'live' ? 'text-yellow-500' : 'text-gray-500'}">
                  {#if status === 'complete'}
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                  {:else if status === 'live'}
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
                  {/if}
                  {status === 'complete' ? 'Done' : status === 'live' ? 'Live' : 'Pending'}
                </div>
              </div>

              <!-- Match Content -->
              <div class="p-3">
                <!-- Score Display Row -->
                <div class="flex items-center justify-center gap-3 mb-3">
                  <!-- Player 1 Score -->
                  <div class="flex-1 text-center">
                    {#if !match.completed}
                      <input
                        type="number"
                        min="0"
                        max={maxScore || undefined}
                        value={scores.player1Score || ''}
                        placeholder="0"
                        oninput={(e) => updateScore(match.id, 'player1', parseInt((e.target as HTMLInputElement).value) || 0)}
                        class="w-full text-center text-3xl font-black bg-space-600 border-2 {result === 'player1' ? 'border-cyber-green' : 'border-space-500'} rounded-lg py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-cyan appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                      />
                    {:else}
                      <div class="text-3xl font-black {result === 'player1' ? 'text-cyber-green' : result === 'player2' ? 'text-gray-500' : 'text-yellow-500'}">{scores.player1Score}</div>
                    {/if}
                  </div>
                  
                  <!-- VS / Result -->
                  <div class="flex-shrink-0 w-12 text-center">
                    {#if result === 'tie'}
                      <span class="text-yellow-500 font-black text-sm">TIE</span>
                    {:else if match.completed}
                      <span class="text-gray-600 font-bold text-lg">:</span>
                    {:else}
                      <span class="text-gray-500 font-bold text-sm">VS</span>
                    {/if}
                  </div>
                  
                  <!-- Player 2 Score -->
                  <div class="flex-1 text-center">
                    {#if !match.completed}
                      <input
                        type="number"
                        min="0"
                        max={maxScore || undefined}
                        value={scores.player2Score || ''}
                        placeholder="0"
                        oninput={(e) => updateScore(match.id, 'player2', parseInt((e.target as HTMLInputElement).value) || 0)}
                        class="w-full text-center text-3xl font-black bg-space-600 border-2 {result === 'player2' ? 'border-cyber-green' : 'border-space-500'} rounded-lg py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-cyan appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                      />
                    {:else}
                      <div class="text-3xl font-black {result === 'player2' ? 'text-cyber-green' : result === 'player1' ? 'text-gray-500' : 'text-yellow-500'}">{scores.player2Score}</div>
                    {/if}
                  </div>
                </div>

                <!-- Player Names Row -->
                <div class="flex items-center justify-between gap-3">
                  <!-- Player 1 Info -->
                  <div class="flex-1 flex items-center gap-2 {result === 'player2' ? 'opacity-50' : ''}">
                    {#if player1?.profilePhoto}
                      <img src={player1.profilePhoto} alt="Profile" class="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    {:else}
                      <div class="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                      </div>
                    {/if}
                    <span class="font-bold text-xs text-white truncate">{player1?.name || 'Unknown'}</span>
                    {#if result === 'player1'}
                      <svg class="w-4 h-4 text-cyber-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    {/if}
                  </div>
                  
                  <!-- Spacer -->
                  <div class="w-12"></div>
                  
                  <!-- Player 2 Info -->
                  <div class="flex-1 flex items-center justify-end gap-2 {result === 'player1' ? 'opacity-50' : ''}">
                    {#if result === 'player2'}
                      <svg class="w-4 h-4 text-cyber-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    {/if}
                    <span class="font-bold text-xs text-white truncate">{player2?.name || 'Unknown'}</span>
                    {#if player2?.profilePhoto}
                      <img src={player2.profilePhoto} alt="Profile" class="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    {:else}
                      <div class="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                      </div>
                    {/if}
                  </div>
                </div>

                <!-- Submit Button -->
                {#if !match.completed && isValidScore(match.id)}
                  <div class="mt-3 pt-3 border-t border-space-600">
                    <button 
                      onclick={() => submitMatchResult(match.id, match)}
                      class="w-full bg-gradient-to-r from-brand-cyan to-cyber-blue text-white font-bold py-2 px-3 rounded-lg text-sm hover:scale-102 transition-all shadow-lg shadow-brand-cyan/20"
                    >
                      Submit Result ({scores.player1Score} - {scores.player2Score})
                    </button>
                  </div>
                {:else if !match.completed && (scores.player1Score > 0 || scores.player2Score > 0)}
                  {@const validationError = getValidationError(match.id)}
                  {#if validationError}
                    <div class="mt-3 pt-3 border-t border-space-600 text-center text-xs text-yellow-500">
                      {validationError}
                    </div>
                  {/if}
                {/if}
              </div>
            </div>
        {/each}
      </div>
    </div>

    <!-- Full Tournament Reset Button -->
    <div class="text-center pt-8 border-t border-space-600 mt-8">
      <button
        onclick={() => handleResetTournament()}
        class="bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white font-bold text-sm px-6 py-2.5 rounded-xl shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:scale-105 transition-all duration-300 border border-red-400/30"
      >
        <svg class="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        Reset Tournament Data
      </button>
    </div>
  </div>
</div>

<!-- Error Popup Modal -->
{#if showErrorPopup}
  <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="glass rounded-xl max-w-md w-full shadow-2xl border border-red-500/30">
      <div class="flex items-center gap-3 p-6 border-b border-space-600">
        <div class="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Error</h2>
          <p class="text-gray-400 text-sm">Something went wrong</p>
        </div>
      </div>
      <div class="p-6">
        <p class="text-gray-300 mb-6">{errorMessage}</p>
        <div class="flex justify-end">
          <button
            onclick={() => showErrorPopup = false}
            class="bg-gradient-to-r from-brand-purple to-brand-cyan text-white font-bold px-6 py-2 rounded-lg shadow-glow-cyan hover:scale-105 transition-all duration-300"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Confirmation Popup Modal -->
{#if showConfirmPopup}
  <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="glass rounded-xl max-w-md w-full shadow-2xl border border-brand-cyan/30">
      <div class="flex items-center gap-3 p-6 border-b border-space-600">
        <div class="w-12 h-12 rounded-full bg-brand-cyan/20 flex items-center justify-center">
          <svg class="w-6 h-6 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">{confirmTitle}</h2>
          <p class="text-gray-400 text-sm">Please confirm</p>
        </div>
      </div>
      <div class="p-6">
        <p class="text-gray-300 mb-6">{confirmMessage}</p>
        <div class="flex justify-end gap-3">
          <button
            onclick={cancelConfirmation}
            class="bg-gray-600 hover:bg-gray-500 text-white font-bold px-4 py-2 rounded-lg transition-all duration-300"
          >
            Cancel
          </button>
          <button
            onclick={executeConfirmedAction}
            class="bg-gradient-to-r from-brand-purple to-brand-cyan text-white font-bold px-6 py-2 rounded-lg shadow-lg hover:scale-105 transition-all duration-300"
          >
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
