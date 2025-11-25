<script lang="ts">
  import { onMount } from 'svelte';
  import { getState } from '$lib/api';

  let { tournamentId } = $props<{ tournamentId: string }>();

  let tournamentData = $state(null) as any;
  let loading = $state(true);
  let error = $state(null) as string | null;

  // Reactive statements to compute statistics
  let playerStats: any[] = $state([]);
  let matchStats: any = $state(null);
  let groupStats: any[] = $state([]);
  let tournamentOverview: any = $state(null);

  // Update computed values when tournamentData changes
  $effect(() => {
    if (tournamentData?.players && Array.isArray(tournamentData.players)) {
      playerStats = tournamentData.players.map((player: any) => {
        const totalGames = (player.wins || 0) + (player.draws || 0) + (player.losses || 0);
        const winRate = totalGames > 0 ? ((player.wins || 0) / totalGames) * 100 : 0;
        const avgPoints = totalGames > 0 ? (player.points || 0) / totalGames : 0;

        return {
          ...player,
          totalGames,
          winRate: Math.round(winRate * 10) / 10,
          avgPoints: Math.round(avgPoints * 10) / 10,
          performance: (player.points || 0) + ((player.wins || 0) * 2) + (player.draws || 0) // Custom performance metric
        };
      }).sort((a: any, b: any) => (b.performance || 0) - (a.performance || 0));
    } else {
      playerStats = [];
    }
  });

  $effect(() => {
    if (tournamentData) {
      const groupMatches = Array.isArray(tournamentData.matches) ? tournamentData.matches : [];
      const bracketMatches = Array.isArray(tournamentData.bracketMatches) ? tournamentData.bracketMatches : [];

      const totalMatches = groupMatches.length + bracketMatches.length;
      const completedGroupMatches = groupMatches.filter((m: any) => m.completed === true).length;
      const completedBracketMatches = bracketMatches.filter((m: any) => m.winnerId).length;
      const totalCompleted = completedGroupMatches + completedBracketMatches;

      // Calculate win/draw/loss distribution
      let totalWins = 0, totalDraws = 0, totalLosses = 0;

      groupMatches.forEach((match: any) => {
        if (match.result && typeof match.result === 'object') {
          Object.values(match.result).forEach((result: any) => {
            if (result && typeof result === 'object' && result.points === 3) totalWins++;
            else if (result && typeof result === 'object' && result.points === 1) totalDraws++;
            else totalLosses++;
          });
        }
      });

      bracketMatches.forEach((match: any) => {
        if (match.winnerId) totalWins++; // Each bracket match produces one winner
      });

      matchStats = {
        totalMatches,
        completedMatches: totalCompleted,
        completionRate: totalMatches > 0 ? Math.round((totalCompleted / totalMatches) * 100) : 0,
        groupMatches: groupMatches.length,
        bracketMatches: bracketMatches.length,
        totalWins,
        totalDraws,
        totalLosses,
        avgPointsPerMatch: totalMatches > 0 ? Math.round((totalWins * 3 + totalDraws * 1) / totalMatches * 10) / 10 : 0
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
        const totalPoints = Array.isArray(pod.players) ? pod.players.reduce((sum: number, playerId: string) => {
          const player = tournamentData.players.find((p: any) => p.id === playerId);
          return sum + (player?.points || 0);
        }, 0) : 0;

        return {
          ...pod,
          totalMatches: podMatches.length,
          completedMatches,
          completionRate: podMatches.length > 0 ? Math.round((completedMatches / podMatches.length) * 100) : 0,
          totalPoints,
          avgPoints: Array.isArray(pod.players) && pod.players.length > 0 ? Math.round(totalPoints / pod.players.length * 10) / 10 : 0
        };
      });
    } else {
      groupStats = [];
    }
  });

  $effect(() => {
    if (tournamentData) {
      const startTime = new Date(); // Would need to be stored in tournament data
      const currentTime = new Date();
      const duration = Math.floor((currentTime.getTime() - startTime.getTime()) / (1000 * 60)); // minutes

      tournamentOverview = {
        name: tournamentData.name || 'Unknown Tournament',
        state: tournamentData.state || 'unknown',
        playerCount: Array.isArray(tournamentData.players) ? tournamentData.players.length : 0,
        groupCount: Array.isArray(tournamentData.pods) ? tournamentData.pods.length : 0,
        duration: `${duration} minutes`,
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

  onMount(loadTournamentData);
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
              <div class="text-xs text-gray-400">Total Matches</div>
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
              <div class="text-xs text-gray-400">Playoffs</div>
            </div>
          </div>

          <!-- Win/Loss/Draw Distribution -->
          <div class="mb-4">
            <h3 class="text-sm font-bold text-gray-300 mb-2">Match Outcomes</h3>
            <div class="flex gap-2">
              <div class="flex-1 bg-green-900/30 rounded p-2 text-center">
                <div class="text-lg font-bold text-green-400">{stats.totalWins}</div>
                <div class="text-xs text-gray-400">Wins</div>
              </div>
              <div class="flex-1 bg-yellow-900/30 rounded p-2 text-center">
                <div class="text-lg font-bold text-yellow-400">{stats.totalDraws}</div>
                <div class="text-xs text-gray-400">Draws</div>
              </div>
              <div class="flex-1 bg-red-900/30 rounded p-2 text-center">
                <div class="text-lg font-bold text-red-400">{stats.totalLosses}</div>
                <div class="text-xs text-gray-400">Losses</div>
              </div>
            </div>
          </div>

          <div class="text-center text-sm text-gray-400">
            Average Points per Match: <span class="text-cyber-green font-bold">{stats.avgPointsPerMatch}</span>
          </div>
        </div>
      {/if}

      <!-- Player Performance Rankings -->
      <div class="glass rounded-lg p-6 mb-6">
        <h2 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
          <svg class="w-5 h-5 text-cyber-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
          Player Performance Rankings
        </h2>

        <div class="space-y-2">
          {#each playerStats as player, index}
            <div class="flex items-center gap-4 p-3 rounded-lg bg-space-700/50 hover:bg-space-700 transition-colors">
              <!-- Rank -->
              <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                {index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-space-900' :
                 index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-space-900' :
                 index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-space-900' :
                 'bg-space-600 text-gray-400'}">
                {index + 1}
              </div>

              <!-- Player Avatar -->
              <div class="w-10 h-10 rounded-full flex items-center justify-center">
                {#if player.profilePhoto}
                  <img src={player.profilePhoto} alt="Profile" class="w-10 h-10 rounded-full object-cover" />
                {:else}
                  <div class="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                  </div>
                {/if}
              </div>

              <!-- Player Info -->
              <div class="flex-1">
                <div class="font-bold text-white">{player.name}</div>
                <div class="text-xs text-gray-400">
                  {player.totalGames} games • {player.wins}W {player.draws}D {player.losses}L
                </div>
              </div>

              <!-- Stats -->
              <div class="text-right">
                <div class="text-lg font-black text-cyber-green">{player.points}</div>
                <div class="text-xs text-gray-400">Points</div>
              </div>

              <div class="text-right">
                <div class="text-lg font-black text-cyber-blue">{player.winRate}%</div>
                <div class="text-xs text-gray-400">Win Rate</div>
              </div>

              <div class="text-right">
                <div class="text-lg font-black text-cyber-pink">{player.avgPoints}</div>
                <div class="text-xs text-gray-400">Avg Pts</div>
              </div>
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
            Group Performance
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
                    <div class="text-lg font-bold text-cyber-blue">{group.completedMatches}</div>
                    <div class="text-xs text-gray-400">Completed</div>
                  </div>
                  <div>
                    <div class="text-lg font-bold text-cyber-pink">{group.avgPoints}</div>
                    <div class="text-xs text-gray-400">Avg Pts</div>
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
                {tournamentData.matches?.filter(m => m.completed).length || 0} of {tournamentData.matches?.length || 0} matches completed
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
                {tournamentData.bracketMatches?.filter(m => m.winnerId).length || 0} of {tournamentData.bracketMatches?.length || 0} matches completed
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

    {/if}
  </div>
</div>
