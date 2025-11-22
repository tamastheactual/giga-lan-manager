<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, addPlayer, startGroupStage, resetTournament } from '$lib/api';

  let players: any[] = [];
  let newPlayerName = '';
  let state = 'registration';
  let showConfetti = false;

  async function loadState() {
    const data = await getState();
    players = data.players;
    state = data.state;
  }

  async function handleAddPlayer() {
    if (!newPlayerName.trim()) return;
    
    // Check for duplicate names
    const trimmedName = newPlayerName.trim();
    if (players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      alert('A player with this name already exists! Please choose a different name.');
      return;
    }
    
    await addPlayer(trimmedName);
    newPlayerName = '';
    await loadState();
    
    // Show confetti when reaching minimum players
    if (players.length === 4) {
      showConfetti = true;
      setTimeout(() => showConfetti = false, 3000);
    }
  }

  async function handleStart() {
    await startGroupStage();
    await loadState();
    window.location.href = '/groups';
  }

  async function handleReset() {
      if(confirm('Are you sure? This will delete all tournament data.')) {
          try {
              console.log('[Home] Resetting tournament...');
              await resetTournament();
              console.log('[Home] Tournament reset, redirecting...');
              window.location.href = '/';
          } catch (error) {
              console.error('[Home] Error resetting tournament:', error);
              alert('Failed to reset tournament. Check console for details.');
          }
      }
  }

  function getPlayerGradient(index: number) {
    const gradients = [
      'from-cyan-500 to-blue-500',
      'from-purple-500 to-pink-500',
      'from-green-500 to-emerald-500',
      'from-orange-500 to-red-500',
      'from-yellow-500 to-orange-500',
      'from-indigo-500 to-purple-500',
    ];
    return gradients[index % gradients.length];
  }

  onMount(loadState);
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 py-8 px-4">
  <div class="w-full max-w-6xl mx-auto space-y-8">
    
    <!-- Header with Animated Title -->
    <div class="text-center py-3 space-y-2">
      <h1 class="text-2xl md:text-3xl font-black gradient-text leading-tight">
        <svg class="w-7 h-7 inline-block" fill="currentColor" viewBox="0 0 20 20"><path d="M10 3.5a6.5 6.5 0 106.5 6.5h-2a4.5 4.5 0 11-4.5-4.5V3.5z"/><path d="M13.5 7a.5.5 0 01.5.5v1a.5.5 0 01-1 0v-1a.5.5 0 01.5-.5z"/></svg>
        TOURNAMENT COMMAND CENTER
      </h1>
    </div>

    {#if state === 'registration'}
      <!-- Top Row: Tournament Status + Add Player Side by Side -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Tournament Status Dashboard -->
        <div class="glass rounded-lg p-4 shadow-xl border border-cyber-green/20">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-bold text-cyber-green">Tournament Status</h2>
            <span class="px-2 py-0.5 bg-cyber-green/20 border border-cyber-green rounded text-cyber-green font-bold text-xs">
              REGISTRATION
            </span>
          </div>
          
          <div class="flex items-center gap-3">
            <span class="text-2xl font-black text-white">{players.length}</span>
            <div class="flex-1 space-y-1.5">
              <div class="flex justify-between text-xs text-gray-400">
                <span class="font-semibold">Players Registered</span>
                <span class="font-bold text-white">{players.length >= 4 ? 'Ready' : `Need ${4 - players.length} more`}</span>
              </div>
              <div class="w-full h-1.5 bg-space-700 rounded-full overflow-hidden shadow-inner">
                <div 
                  class="h-full bg-gradient-to-r from-cyber-green to-cyber-blue transition-all duration-500 ease-out shadow-lg"
                  style="width: {Math.min((players.length / 16) * 100, 100)}%"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Add Player Input -->
        <div class="glass rounded-lg p-4 shadow-xl border border-cyber-blue/20">
          <h3 class="text-base font-bold mb-3 text-cyber-blue">Add Player</h3>
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newPlayerName}
              placeholder="Enter player name..."
              class="flex-1 px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyber-green/50 focus:border-cyber-green text-white placeholder-gray-500 transition-all shadow-lg"
              onkeydown={(e) => e.key === 'Enter' && handleAddPlayer()}
              maxlength="20"
            />
            <button 
              onclick={handleAddPlayer} 
              class="bg-gradient-to-r from-cyber-green to-emerald-500 hover:from-cyber-green hover:to-cyber-green text-space-900 font-bold px-4 py-2 text-sm rounded-lg shadow-glow-green transition-all duration-300 hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              disabled={!newPlayerName.trim()}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <!-- Player Cards Grid -->
      <div class="space-y-3">
        <h3 class="text-lg font-bold text-white text-center">Registered Players</h3>
        
        {#if players.length === 0}
          <div class="glass rounded-xl p-8 text-center shadow-xl">
            <svg class="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            <p class="text-gray-400 text-sm">No players registered yet. Add your first player above!</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {#each players as player, index}
              <div 
                class="glass rounded-lg p-3 shadow-xl hover:shadow-cyber-green/20 hover:scale-105 transition-all duration-300 card-entrance relative overflow-hidden group"
                style="animation-delay: {index * 50}ms"
              >
                <!-- Background Gradient -->
                <div class="absolute inset-0 bg-gradient-to-br {getPlayerGradient(index)} opacity-10 group-hover:opacity-20 transition-opacity"></div>
                
                <!-- Player Number Badge -->
                <div class="absolute top-1.5 right-1.5 w-6 h-6 bg-space-700 rounded-full flex items-center justify-center text-xs font-bold text-cyber-blue border border-space-600">
                  {index + 1}
                </div>
                
                <!-- Player Avatar -->
                <div class="mb-2 relative flex justify-center">
                  <div class="w-12 h-12 rounded-full bg-gradient-to-br {getPlayerGradient(index)} flex items-center justify-center shadow-xl relative">
                    <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                    <div class="absolute bottom-0 right-0 w-3 h-3 bg-cyber-green rounded-full animate-pulse shadow-lg shadow-cyber-green/50 border-2 border-space-900"></div>
                  </div>
                </div>
                
                <!-- Player Name -->
                <h4 class="text-center text-sm font-bold text-white mb-0.5 truncate relative z-10">{player.name}</h4>
                <p class="text-center text-xs text-gray-400 relative z-10">Ready</p>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Start Button -->
      {#if players.length >= 4}
        <div class="text-center space-y-2 py-3">
          <button 
            onclick={handleStart} 
            class="bg-gradient-to-r from-cyber-green via-emerald-500 to-cyber-blue text-space-900 font-black text-lg px-8 py-3 rounded-xl shadow-xl shadow-cyber-green/30 hover:shadow-cyber-blue/40 hover:scale-105 transition-all duration-500 animate-pulse-slow"
          >
            <svg class="w-5 h-5 inline-block mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
            START TOURNAMENT
          </button>
          <p class="text-gray-400 text-xs">Click to begin the group stage</p>
        </div>
      {:else}
        <div class="glass rounded-xl p-6 text-center shadow-xl">
          <p class="text-gray-400 text-sm">
            <svg class="w-6 h-6 inline-block text-cyber-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Need at least <span class="text-cyber-green font-bold text-lg">{4 - players.length}</span> more {4 - players.length === 1 ? 'player' : 'players'} to start
          </p>
        </div>
      {/if}

    {:else}
      <!-- Tournament In Progress -->
      <div class="glass rounded-xl p-8 text-center shadow-xl">
        <svg class="w-14 h-14 mx-auto mb-4 text-cyber-pink" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clip-rule="evenodd"/></svg>
        <h2 class="text-2xl font-bold mb-3 text-white">Tournament in Progress</h2>
        <p class="text-sm text-gray-400 mb-4">
          Current Stage: <span class="text-cyber-pink font-bold uppercase">{state}</span>
        </p>
        <a 
          href="/groups" 
          class="inline-block bg-gradient-to-r from-cyber-blue to-blue-500 text-white font-bold text-base px-6 py-3 rounded-xl shadow-glow-blue hover:scale-105 transition-all duration-300"
        >
          View Group Stage →
        </a>
      </div>
    {/if}
    
    <!-- Reset Button -->
    <div class="text-center pt-8 border-t border-space-600">
      <button 
        onclick={handleReset} 
        class="text-red-400/70 hover:text-red-400 text-base font-semibold transition-colors hover:underline"
      >
        <svg class="w-4 h-4 inline-block" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        Reset Tournament Data
      </button>
    </div>
  </div>
</div>

{#if showConfetti}
  <div class="confetti-container">
    <!-- Confetti animation placeholder - could add canvas-confetti library -->
  </div>
{/if}

