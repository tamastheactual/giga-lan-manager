<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, submitMatch, generateBrackets, updateGroupName, resetGroupData, resetTournament } from '$lib/api';

  let { tournamentId } = $props<{ tournamentId: string }>();

  let pods = $state([]) as any[];
  let matches = $state([]) as any[];
  let players = $state([]) as any[];
  let tournamentState = $state('');
  let currentRound = $state(1);

  // Local state to track UI selections before submission
  let matchSelections = $state({}) as Record<string, { [pid: string]: 'win' | 'loss' | 'tie' }>;

  // Group editing state
  let editingGroupId = $state(null) as string | null;
  let editingGroupName = $state('');

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
      alert('Failed to update group name');
    }
  }

  async function handleResetGroup(groupId: string) {
    if (confirm('Reset all match results for this group? This will clear all player stats in this group.')) {
      try {
        await resetGroupData(tournamentId, groupId);
        await loadState();
      } catch (error) {
        console.error('Failed to reset group data:', error);
        alert('Failed to reset group data');
      }
    }
  }

  async function handleResetTournament() {
    if (confirm('Reset the entire tournament? This will delete ALL tournament data including players, groups, matches, and brackets. This action cannot be undone.')) {
      try {
        await resetTournament(tournamentId);
        window.location.href = '/';
      } catch (error) {
        console.error('Failed to reset tournament:', error);
        alert('Failed to reset tournament');
      }
    }
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
    console.log('[Groups] Reactive update - matchSelections:', matchSelections);
    console.log('[Groups] Reactive update - pods:', pods.length);
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

    // Initialize selections from existing results
    matches.forEach(m => {
        if (m.result) {
            matchSelections[m.id] = {};
            Object.entries(m.result).forEach(([pid, res]: [string, any]) => {
                if (res.points === 3) matchSelections[m.id][pid] = 'win';
                else if (res.points === 1) matchSelections[m.id][pid] = 'tie';
                else matchSelections[m.id][pid] = 'loss';
            });
        }
    });

    console.log('[Groups] loadState() complete - matchSelections:', matchSelections);
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
    if (matchSelections[match.id]) return 'live';
    return 'pending';
  }

  function setWinner(matchId: string, winnerId: string, loserId: string) {
      console.log('[Groups] setWinner called:', { matchId, winnerId, loserId });
      matchSelections[matchId] = {
          [winnerId]: 'win',
          [loserId]: 'loss'
      };
      console.log('[Groups] setWinner complete - matchSelections:', matchSelections);
  }

  function setTie(matchId: string, p1Id: string, p2Id: string) {
      console.log('[Groups] setTie called:', { matchId, p1Id, p2Id });
      matchSelections[matchId] = {
          [p1Id]: 'tie',
          [p2Id]: 'tie'
      };
      console.log('[Groups] setTie complete - matchSelections:', matchSelections);
  }

  async function submitMatchResult(matchId: string) {
      console.log('[Groups] submitMatchResult called:', matchId);
      const selection = matchSelections[matchId];
      if (!selection) return;

      const results: any = {};
      Object.entries(selection).forEach(([pid, status]) => {
          let points = 0;
          if (status === 'win') points = 3;
          if (status === 'tie') points = 1;
          results[pid] = { points };
      });

      console.log('[Groups] submitMatchResult - submitting results:', results);
      // FIX: include tournamentId as first arg
      await submitMatch(tournamentId, matchId, results);
      console.log('[Groups] submitMatchResult - match submitted, reloading state');
      await loadState();
      console.log('[Groups] submitMatchResult complete');
  }

  async function handleGenerateBrackets() {
      if (confirm('Finish Group Stage and Generate Brackets?')) {
          try {
              console.log('[Groups] Generating brackets...');
              await generateBrackets(tournamentId);
              console.log('[Groups] Brackets generated, redirecting...');
              window.location.href = `/tournament/${tournamentId}/brackets`;
          } catch (error) {
              console.error('[Groups] Error generating brackets:', error);
              alert('Failed to generate brackets. Check console for details.');
          }
      }
  }

  function getStandings() {
    return [...players].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      // Tiebreaker: goal difference, then wins
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
          class="bg-gradient-to-r from-cyber-pink to-purple-600 text-white font-bold text-xs py-1.5 px-4 rounded-lg shadow-glow-pink hover:scale-105 transition-transform flex items-center gap-1.5"
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
            class="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded {currentRound === round ? 'bg-cyber-green/20 text-cyber-green' : 'text-gray-500 hover:bg-space-700'} transition-all"
          >
            <div class="w-6 h-6 rounded-full border {isRoundComplete(round) ? 'bg-cyber-green border-cyber-green text-space-900' : currentRound === round ? 'border-cyber-green' : 'border-gray-600'} flex items-center justify-center font-bold text-xs">
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
                    class="px-2 py-1 text-xs bg-cyber-green text-space-900 rounded font-bold hover:bg-cyber-green/80"
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
                      class="ml-2 px-2 py-1 text-xs bg-cyber-green text-black rounded hover:bg-cyber-green/80"
                      onclick={() => startEditingGroup(groupId, getGroupDisplayName(groupId))}
                    >
                      Edit
                    </button>
                  {/if}
                </div>
              {/if}
              <button
                onclick={() => handleResetGroup(groupId)}
                class="px-2 py-1 text-xs bg-red-600 text-white rounded font-bold hover:bg-red-500 transition-colors"
                title="Reset group data"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
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
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {#each currentRoundMatches as match (match.id)}
          {@const player1 = getPlayer(match.player1Id)}
          {@const player2 = getPlayer(match.player2Id)}
          {@const status = getMatchStatus(match)}
            
            <div class="glass rounded-lg p-2 relative">
              <!-- Status Badge -->
              <div class="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold {status === 'complete' ? 'bg-cyber-green/20 text-cyber-green' : status === 'live' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-gray-500/20 text-gray-400'}">
                {#if status === 'complete'}
                  <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                  Done
                {:else if status === 'live'}
                  <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
                  Live
                {:else}
                  Pending
                {/if}
              </div>

              <div class="space-y-1.5">
                <!-- Player 1 -->
                <div class="p-2 rounded bg-space-700/50 {matchSelections[match.id]?.[match.player1Id] === 'win' ? 'ring-1 ring-cyber-green' : matchSelections[match.id]?.[match.player1Id] === 'loss' ? 'opacity-60' : ''} transition-all">
                  <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center gap-2">
                      {#if player1?.profilePhoto}
                        <img src={player1.profilePhoto} alt="Profile" class="w-6 h-6 rounded-full object-cover" />
                      {:else}
                        <div class="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                          <svg class="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                        </div>
                      {/if}
                      <div>
                        <div class="font-bold text-xs text-white">{player1?.name || 'Unknown'}</div>
                        <div class="text-xs text-gray-400">{player1?.points || 0}pts</div>
                      </div>
                    </div>
                    {#if matchSelections[match.id]?.[match.player1Id] === 'win'}
                      <svg class="w-4 h-4 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    {/if}
                  </div>
                  
                  {#if !match.completed}
                    <button 
                      onclick={() => setWinner(match.id, match.player1Id, match.player2Id)}
                      class="w-full py-1 px-2 text-xs rounded font-bold transition-all {matchSelections[match.id]?.[match.player1Id] === 'win' ? 'bg-gradient-to-r from-cyber-green to-emerald-500 text-space-900' : 'bg-space-600 hover:bg-cyber-green/20 text-gray-300 hover:text-cyber-green'}"
                    >
                      {matchSelections[match.id]?.[match.player1Id] === 'win' ? '✓ Winner' : 'Winner'}
                    </button>
                  {/if}
                </div>

                <!-- Tie Button -->
                {#if !match.completed}
                  <button 
                    onclick={() => setTie(match.id, match.player1Id, match.player2Id)}
                    class="w-full py-0.5 text-xs rounded font-bold transition-all {matchSelections[match.id]?.[match.player1Id] === 'tie' ? 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-space-900' : 'bg-space-700 hover:bg-yellow-500/20 text-gray-300 hover:text-yellow-500'}"
                  >
                    {matchSelections[match.id]?.[match.player1Id] === 'tie' ? '✓ Tie' : 'Tie'}
                  </button>
                {/if}

                <!-- Player 2 -->
                <div class="p-2 rounded bg-space-700/50 {matchSelections[match.id]?.[match.player2Id] === 'win' ? 'ring-1 ring-cyber-green' : matchSelections[match.id]?.[match.player2Id] === 'loss' ? 'opacity-60' : ''} transition-all">
                  <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center gap-2">
                      {#if player2?.profilePhoto}
                        <img src={player2.profilePhoto} alt="Profile" class="w-6 h-6 rounded-full object-cover" />
                      {:else}
                        <div class="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                          <svg class="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                        </div>
                      {/if}
                      <div>
                        <div class="font-bold text-xs text-white">{player2?.name || 'Unknown'}</div>
                        <div class="text-xs text-gray-400">{player2?.points || 0}pts</div>
                      </div>
                    </div>
                    {#if matchSelections[match.id]?.[match.player2Id] === 'win'}
                      <svg class="w-4 h-4 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    {/if}
                  </div>
                  
                  {#if !match.completed}
                    <button 
                      onclick={() => setWinner(match.id, match.player2Id, match.player1Id)}
                      class="w-full py-1 px-2 text-xs rounded font-bold transition-all {matchSelections[match.id]?.[match.player2Id] === 'win' ? 'bg-gradient-to-r from-cyber-green to-emerald-500 text-space-900' : 'bg-space-600 hover:bg-cyber-green/20 text-gray-300 hover:text-cyber-green'}"
                    >
                      {matchSelections[match.id]?.[match.player2Id] === 'win' ? '✓ Winner' : 'Winner'}
                    </button>
                  {/if}
                </div>
              </div>

              <!-- Submit Button -->
              {#if !match.completed && (matchSelections[match.id]?.[match.player1Id] || matchSelections[match.id]?.[match.player2Id])}
                <div class="mt-1.5">
                  <button 
                    onclick={() => submitMatchResult(match.id)}
                    class="w-full bg-gradient-to-r from-cyber-blue to-blue-600 text-white font-bold py-1.5 px-3 rounded text-xs hover:scale-102 transition-all"
                  >
                    Submit Result
                  </button>
                </div>
              {/if}
            </div>
        {/each}
    </div>

    <!-- Full Tournament Reset Button -->
    <div class="text-center pt-8 border-t border-space-600 mt-8">
      <button
        onclick={() => handleResetTournament()}
        class="text-red-400/70 hover:text-red-400 text-base font-semibold transition-colors hover:underline"
      >
        <svg class="w-4 h-4 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        Reset Entire Tournament
      </button>
    </div>
  </div>
</div>
</div>
