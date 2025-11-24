<script lang="ts">
  import { onMount } from 'svelte';
  import { getTournaments, createTournament, deleteTournament } from '$lib/api';

  let tournaments: any[] = [];
  let newTournamentName = '';
  let showCreateForm = false;

  async function loadTournaments() {
    tournaments = await getTournaments();
  }

  async function handleCreateTournament() {
    if (!newTournamentName.trim()) return;

    const result = await createTournament(newTournamentName.trim());
    newTournamentName = '';
    showCreateForm = false;
    await loadTournaments();

    // Navigate to the new tournament
    window.location.href = `/tournament/${result.id}`;
  }

  async function handleDeleteTournament(event: MouseEvent, tournamentId: string) {
    event.stopPropagation(); // Prevent navigation when clicking the delete button
    if (confirm('Are you sure you want to permanently delete this tournament?')) {
      try {
        await deleteTournament(tournamentId);
        await loadTournaments(); // Refresh the list
      } catch (error) {
        console.error('Failed to delete tournament:', error);
        alert('Could not delete the tournament.');
      }
    }
  }

  function navigateToTournament(tournamentId: string) {
    window.location.href = `/tournament/${tournamentId}`;
  }

  onMount(loadTournaments);
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 py-8 px-4">
  <div class="w-full max-w-6xl mx-auto space-y-8">

    <!-- Header -->
    <div class="text-center py-3 space-y-2">
      <h1 class="text-2xl md:text-3xl font-black gradient-text leading-tight">
        <svg class="w-7 h-7 inline-block" fill="currentColor" viewBox="0 0 20 20"><path d="M10 3.5a6.5 6.5 0 106.5 6.5h-2a4.5 4.5 0 11-4.5-4.5V3.5z"/></svg>
        TOURNAMENT LOBBY
      </h1>
      <p class="text-gray-400 text-sm">Select or create a tournament to begin</p>
    </div>

    <!-- Create Tournament Section -->
    <div class="glass rounded-lg p-6 shadow-xl border border-cyber-green/20">
      {#if !showCreateForm}
        <button
          onclick={() => showCreateForm = true}
          class="bg-gradient-to-r from-cyber-green to-emerald-500 hover:from-cyber-green hover:to-cyber-green text-space-900 font-bold px-6 py-3 rounded-lg shadow-glow-green transition-all duration-300 hover:scale-105 hover:shadow-xl"
        >
          <svg class="w-5 h-5 inline-block mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          Create New Tournament
        </button>
      {:else}
        <div class="space-y-4">
          <h3 class="text-lg font-bold text-cyber-green">Create New Tournament</h3>
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newTournamentName}
              placeholder="Tournament name (e.g., CS2 Finals)"
              class="flex-1 px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyber-green/50 focus:border-cyber-green text-white placeholder-gray-500 transition-all shadow-lg"
              onkeydown={(e) => e.key === 'Enter' && handleCreateTournament()}
              maxlength="50"
            />
            <button
              onclick={handleCreateTournament}
              class="bg-gradient-to-r from-cyber-green to-emerald-500 hover:from-cyber-green hover:to-cyber-green text-space-900 font-bold px-4 py-2 text-sm rounded-lg shadow-glow-green transition-all duration-300 hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              disabled={!newTournamentName.trim()}
            >
              Create
            </button>
            <button
              onclick={() => { showCreateForm = false; newTournamentName = ''; }}
              class="bg-gray-600 hover:bg-gray-500 text-white font-bold px-4 py-2 text-sm rounded-lg transition-all duration-300"
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}
    </div>

    <!-- Tournament List -->
    <div class="space-y-4">
      <h2 class="text-xl font-bold text-white text-center">Active Tournaments</h2>

      {#if tournaments.length === 0}
        <div class="glass rounded-xl p-8 text-center shadow-xl">
          <svg class="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
          <p class="text-gray-400 text-sm">No tournaments created yet. Create your first tournament above!</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each tournaments as tournament}
            <div
              class="glass rounded-lg p-4 shadow-xl hover:shadow-cyber-green/20 hover:scale-105 transition-all duration-300 card-entrance cursor-pointer relative"
              onclick={() => navigateToTournament(tournament.id)}
            >
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2 min-w-0">
                  <h3 class="text-lg font-bold text-white truncate">{tournament.name}</h3>
                </div>

                <div class="flex items-center gap-2">
                  <span class="px-2 py-1 bg-cyber-green/20 border border-cyber-green rounded text-cyber-green font-bold text-xs uppercase">
                    {tournament.state}
                  </span>

                  <!-- Delete Button (now in header flow, not absolute) -->
                  <button
                    onclick={(e) => handleDeleteTournament(e, tournament.id)}
                    class="p-1.5 rounded-full bg-red-600/20 text-red-400 hover:bg-red-500/40 hover:text-red-300 transition-all"
                    title="Delete Tournament"
                  >
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                  </button>
                </div>
              </div>

              <div class="flex items-center gap-2 text-sm text-gray-400">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                {tournament.playerCount} {tournament.playerCount === 1 ? 'player' : 'players'}
              </div>

              <div class="mt-3 text-center">
                <span class="text-xs text-gray-500">Click to enter tournament</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
