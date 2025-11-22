<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, submitMatch, generateBrackets } from '$lib/api';

  let pods: any[] = [];
  let matches: any[] = [];
  let players: any[] = [];
  let state = '';
  let currentRound = 1;

  // Local state to track UI selections before submission
  let matchSelections: Record<string, { [pid: string]: 'win' | 'loss' | 'tie' }> = {};

  async function loadState() {
    const data = await getState();
    pods = data.pods;
    matches = data.matches;
    players = data.players;
    state = data.state;
    
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

  function setWinner(matchId: string, winnerId: string, loserId: string) {
      matchSelections[matchId] = {
          [winnerId]: 'win',
          [loserId]: 'loss'
      };
      submitMatchResult(matchId);
  }

  function setTie(matchId: string, p1Id: string, p2Id: string) {
      matchSelections[matchId] = {
          [p1Id]: 'tie',
          [p2Id]: 'tie'
      };
      submitMatchResult(matchId);
  }

  async function submitMatchResult(matchId: string) {
      const selection = matchSelections[matchId];
      if (!selection) return;

      const results: any = {};
      Object.entries(selection).forEach(([pid, status]) => {
          let points = 0;
          if (status === 'win') points = 3;
          if (status === 'tie') points = 1;
          results[pid] = { points };
      });

      await submitMatch(matchId, results);
      await loadState();
  }

  async function handleGenerateBrackets() {
      if (confirm('Finish Group Stage and Generate Brackets?')) {
          await generateBrackets();
          window.location.href = '/brackets';
      }
  }

  function getMatchStatus(match: any) {
    if (!match) return 'pending';
    if (match.completed) return 'complete';
    if (matchSelections[match.id]) return 'live';
    return 'pending';
  }

  function getStandings() {
    return [...players].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return 0;
    });
  }

  onMount(loadState);
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 text-gaming-text p-4 md:p-8">
  <div class="max-w-7xl mx-auto">
    
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
      <div>
        <a href="/" class="text-gray-400 hover:text-cyber-green transition-colors mb-2 inline-block">← Back to Home</a>
        <h1 class="text-4xl md:text-6xl font-black gradient-text">
          ⚔️ GROUP STAGE
        </h1>
        <p class="text-gray-400 mt-2">Round {currentRound} of 3</p>
      </div>
      
      {#if state === 'group' && matches.every(m => m.completed)}
        <button 
          on:click={handleGenerateBrackets}
          class="bg-gradient-to-r from-cyber-pink to-purple-600 text-white font-bold py-4 px-8 rounded-xl shadow-glow-pink hover:scale-105 transition-transform"
        >
          Generate Playoffs →
        </button>
      {/if}
    </div>

    <!-- Round Progress -->
    <div class="glass rounded-2xl p-6 mb-8">
      <div class="flex items-center justify-between">
        {#each [1, 2, 3] as round}
          <div class="flex items-center flex-1">
            <button 
              on:click={() => currentRound = round}
              class="flex items-center gap-3 {currentRound === round ? 'text-cyber-green' : 'text-gray-500'} transition-colors"
            >
              <div class="w-10 h-10 rounded-full border-2 {matches.filter(m => pods.find(p => p.matchId === m.id && p.round === round)).every(m => m.completed) ? 'bg-cyber-green border-cyber-green text-space-900' : currentRound === round ? 'border-cyber-green' : 'border-gray-600'} flex items-center justify-center font-bold">
                {matches.filter(m => pods.find(p => p.matchId === m.id && p.round === round)).every(m => m.completed) ? '✓' : round}
              </div>
              <span class="font-bold hidden md:block">Round {round}</span>
            </button>
            {#if round < 3}
              <div class="flex-1 h-1 mx-4 {matches.filter(m => pods.find(p => p.matchId === m.id && p.round === round)).every(m => m.completed) ? 'bg-cyber-green' : 'bg-gray-700'}"></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      <!-- Standings Table (Left Column) -->
      <div class="lg:col-span-1">
        <div class="glass rounded-2xl p-6 sticky top-8">
          <h2 class="text-2xl font-bold mb-4 text-cyber-blue">📊 Live Standings</h2>
          <div class="space-y-2">
            {#each getStandings() as player, index}
              <div class="flex items-center gap-3 p-3 rounded-lg bg-space-700/50 hover:bg-space-700 transition-colors">
                <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm {index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-space-900' : index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-space-900' : index === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-space-900' : 'bg-space-600 text-gray-400'}">
                  {index + 1}
                </div>
                <div class="flex-1">
                  <div class="font-bold text-white">{player.name}</div>
                  <div class="text-xs text-gray-400">{player.wins}W {player.draws}D {player.losses}L</div>
                </div>
                <div class="text-2xl font-black text-cyber-green">{player.points}</div>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Matches (Right Column) -->
      <div class="lg:col-span-2">
        <h2 class="text-3xl font-bold mb-6 text-white">Round {currentRound} Matches</h2>
        <div class="grid grid-cols-1 gap-6">
          {#each pods.filter(p => p.round === currentRound) as pod}
            {@const match = getMatchForPod(pod.id)}
            {#if match && match.players.length === 2}
              {@const player1 = getPlayer(match.players[0])}
              {@const player2 = getPlayer(match.players[1])}
              {@const status = getMatchStatus(match)}
              
              <div class="glass rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all duration-300 relative overflow-hidden group">
                <!-- Status Indicator -->
                <div class="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold {status === 'complete' ? 'bg-cyber-green/20 text-cyber-green' : status === 'live' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-gray-500/20 text-gray-400'}">
                  {status === 'complete' ? '✅ Complete' : status === 'live' ? '⚡ Live' : '⏳ Pending'}
                </div>

                <!-- Player 1 -->
                <div class="mb-4 p-4 rounded-xl bg-space-700/50 {matchSelections[match.id]?.[match.players[0]] === 'win' ? 'ring-2 ring-cyber-green shadow-glow-green' : matchSelections[match.id]?.[match.players[0]] === 'loss' ? 'opacity-60' : ''} transition-all">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                      <div class="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-2xl">
                        👤
                      </div>
                      <div>
                        <div class="font-bold text-xl text-white">{player1.name}</div>
                        <div class="text-xs text-gray-400">{player1.points} pts • {player1.wins}W {player1.draws}D {player1.losses}L</div>
                      </div>
                    </div>
                    {#if matchSelections[match.id]?.[match.players[0]] === 'win'}
                      <div class="text-cyber-green text-3xl animate-scale-in">🏆</div>
                    {/if}
                  </div>
                  
                  {#if !match.completed}
                    <div class="flex gap-2">
                      <button 
                        on:click={() => setWinner(match.id, match.players[0], match.players[1])}
                        class="flex-1 py-2 px-4 rounded-lg font-bold transition-all {matchSelections[match.id]?.[match.players[0]] === 'win' ? 'bg-cyber-green text-space-900 shadow-glow-green' : 'bg-space-600 hover:bg-cyber-green/20 text-gray-300 hover:text-cyber-green'}"
                      >
                        WIN
                      </button>
                    </div>
                  {/if}
                </div>

                <!-- VS Divider -->
                <div class="flex items-center gap-4 my-4">
                  <div class="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>
                  {#if !match.completed}
                    <button 
                      on:click={() => setTie(match.id, match.players[0], match.players[1])}
                      class="px-6 py-2 rounded-lg font-bold transition-all {matchSelections[match.id]?.[match.players[0]] === 'tie' ? 'bg-yellow-500 text-space-900' : 'bg-space-600 hover:bg-yellow-500/20 text-gray-300 hover:text-yellow-500'}"
                    >
                      TIE
                    </button>
                  {:else}
                    <div class="text-2xl">⚔️</div>
                  {/if}
                  <div class="flex-1 h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent"></div>
                </div>

                <!-- Player 2 -->
                <div class="p-4 rounded-xl bg-space-700/50 {matchSelections[match.id]?.[match.players[1]] === 'win' ? 'ring-2 ring-cyber-green shadow-glow-green' : matchSelections[match.id]?.[match.players[1]] === 'loss' ? 'opacity-60' : ''} transition-all">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                      <div class="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl">
                        👤
                      </div>
                      <div>
                        <div class="font-bold text-xl text-white">{player2.name}</div>
                        <div class="text-xs text-gray-400">{player2.points} pts • {player2.wins}W {player2.draws}D {player2.losses}L</div>
                      </div>
                    </div>
                    {#if matchSelections[match.id]?.[match.players[1]] === 'win'}
                      <div class="text-cyber-green text-3xl animate-scale-in">🏆</div>
                    {/if}
                  </div>
                  
                  {#if !match.completed}
                    <div class="flex gap-2">
                      <button 
                        on:click={() => setWinner(match.id, match.players[1], match.players[0])}
                        class="flex-1 py-2 px-4 rounded-lg font-bold transition-all {matchSelections[match.id]?.[match.players[1]] === 'win' ? 'bg-cyber-green text-space-900 shadow-glow-green' : 'bg-space-600 hover:bg-cyber-green/20 text-gray-300 hover:text-cyber-green'}"
                      >
                        WIN
                      </button>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
      <h2 class="text-2xl font-bold mb-4 border-b border-gray-700 pb-2 text-gray-300">Round {round}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each pods.filter(p => p.round === round) as pod}
          {@const match = getMatchForPod(pod.id)}
          {#if match}
            <div class="bg-gaming-secondary rounded-xl p-4 shadow-xl border border-gray-800 relative overflow-hidden group">
              <!-- Background decoration -->
              <div class="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-gaming-accent opacity-10 rounded-full blur-xl group-hover:opacity-20 transition"></div>

              {#if match.players.length === 2}
                <!-- 1v1 Match Layout -->
                <div class="flex flex-col gap-4">
                  <!-- Player 1 -->
                  <div class="flex justify-between items-center p-3 rounded-lg {matchSelections[match.id]?.[match.players[0]] === 'win' ? 'bg-green-900/30 border border-green-500/50' : 'bg-gray-800/50'}">
                    <span class="font-bold text-lg truncate">{getPlayerName(match.players[0])}</span>
                    <div class="flex gap-2">
                        <button 
                            class="w-8 h-8 rounded flex items-center justify-center font-bold transition {matchSelections[match.id]?.[match.players[0]] === 'win' ? 'bg-green-500 text-white' : 'bg-gray-700 hover:bg-green-600 text-gray-300'}"
                            on:click={() => setWinner(match.id, match.players[0], match.players[1])}
                            title="Win"
                        >W</button>
                    </div>
                  </div>

                  <!-- VS / Tie -->
                  <div class="flex justify-center items-center gap-4">
                    <div class="h-px bg-gray-700 flex-1"></div>
                    <button 
                        class="px-3 py-1 rounded text-sm font-bold transition {matchSelections[match.id]?.[match.players[0]] === 'tie' ? 'bg-yellow-600 text-white' : 'bg-gray-700 hover:bg-yellow-600 text-gray-400'}"
                        on:click={() => setTie(match.id, match.players[0], match.players[1])}
                    >
                        TIE
                    </button>
                    <div class="h-px bg-gray-700 flex-1"></div>
                  </div>

                  <!-- Player 2 -->
                  <div class="flex justify-between items-center p-3 rounded-lg {matchSelections[match.id]?.[match.players[1]] === 'win' ? 'bg-green-900/30 border border-green-500/50' : 'bg-gray-800/50'}">
                    <span class="font-bold text-lg truncate">{getPlayerName(match.players[1])}</span>
                    <div class="flex gap-2">
                        <button 
                            class="w-8 h-8 rounded flex items-center justify-center font-bold transition {matchSelections[match.id]?.[match.players[1]] === 'win' ? 'bg-green-500 text-white' : 'bg-gray-700 hover:bg-green-600 text-gray-300'}"
                            on:click={() => setWinner(match.id, match.players[1], match.players[0])}
                            title="Win"
                        >W</button>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
