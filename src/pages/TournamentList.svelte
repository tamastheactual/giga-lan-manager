<script lang="ts">
  import { onMount } from 'svelte';
  import { getTournaments, createTournament, deleteTournament, importTournament, type GameType, GAME_CONFIGS } from '$lib/api';
  import logoImg from '../assets/logo.png';
  import csLogo from '../assets/games/CounterStrike.png';
  import ut2004Logo from '../assets/games/UT2004.png';
  import wormsLogo from '../assets/games/WormsArmageddon.png';
  import Footer from '../components/Footer.svelte';

  // Map game types to logos
  const GAME_LOGOS: Record<GameType, string> = {
    cs16: csLogo,
    ut2004: ut2004Logo,
    worms: wormsLogo
  };

  let tournaments: any[] = $state([]);
  let newTournamentName = $state('');
  let selectedGameType = $state<GameType>('cs16');
  let map1 = $state('');
  let map2 = $state('');
  let map3 = $state('');
  let groupStageRoundLimit = $state<number>(16);
  let playoffsRoundLimit = $state<number>(10);
  let showCreateForm = $state(false);
  let importing = $state(false);
  
  // Confirmation popup state
  let showConfirmPopup = $state(false);
  let confirmMessage = $state('');
  let confirmTitle = $state('');
  let pendingAction = $state<(() => Promise<void>) | null>(null);
  
  // Error popup state
  let showErrorPopup = $state(false);
  let errorMessage = $state('');
  
  // Success popup state
  let showSuccessPopup = $state(false);
  let successMessage = $state('');
  
  // Import success popup state
  let showImportSuccess = $state(false);
  let importedTournamentName = $state('');
  let importedTournamentId = $state('');

  function formatDate(dateString: string | null | undefined): string {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'N/A';
    }
  }

  function getActiveTournaments() {
    return tournaments
      .filter(t => t.state !== 'completed')
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA; // Newest first
      });
  }

  function getFinishedTournaments() {
    return tournaments
      .filter(t => t.state === 'completed')
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA; // Newest first
      });
  }

  async function loadTournaments() {
    tournaments = await getTournaments();
  }

  async function handleCreateTournament() {
    if (!newTournamentName.trim()) return;

    const mapPool = [map1.trim(), map2.trim(), map3.trim()].filter(m => m !== '');
    
    // Check for duplicate maps
    const uniqueMaps = new Set(mapPool);
    if (uniqueMaps.size !== mapPool.length) {
      errorMessage = 'Map pool contains duplicate maps. Each map must be unique.';
      showErrorPopup = true;
      return;
    }
    
    // Pass round limits only for CS 1.6
    const result = await createTournament(
      newTournamentName.trim(), 
      selectedGameType, 
      mapPool,
      selectedGameType === 'cs16' ? groupStageRoundLimit : undefined,
      selectedGameType === 'cs16' ? playoffsRoundLimit : undefined
    );
    newTournamentName = '';
    selectedGameType = 'cs16';
    map1 = '';
    map2 = '';
    map3 = '';
    groupStageRoundLimit = 16;
    playoffsRoundLimit = 10;
    showCreateForm = false;
    await loadTournaments();

    // Navigate to the new tournament
    window.location.href = `/tournament/${result.id}`;
  }

  function requestDeleteTournament(event: MouseEvent, tournamentId: string) {
    event.stopPropagation();
    confirmTitle = 'Delete Tournament';
    confirmMessage = 'Are you sure you want to permanently delete this tournament? This action cannot be undone.';
    pendingAction = async () => {
      try {
        await deleteTournament(tournamentId);
        await loadTournaments();
      } catch (error) {
        console.error('Failed to delete tournament:', error);
        errorMessage = 'Could not delete the tournament.';
        showErrorPopup = true;
      }
    };
    showConfirmPopup = true;
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

  function navigateToTournament(tournamentId: string) {
    window.location.href = `/tournament/${tournamentId}`;
  }

  function goToImportedTournament() {
    showImportSuccess = false;
    window.location.href = `/tournament/${importedTournamentId}`;
  }

  // Import tournament from JSON file
  function handleImportClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      importing = true;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Check for duplicate tournament name
        const existingTournament = tournaments.find(t => t.name === data.name);
        if (existingTournament) {
          errorMessage = `A tournament named "${data.name}" already exists. Please rename the tournament before importing or delete the existing one.`;
          showErrorPopup = true;
          importing = false;
          return;
        }
        
        const result = await importTournament(data);
        
        if (result.success) {
          importedTournamentName = result.name || 'Unknown';
          importedTournamentId = result.id;
          showImportSuccess = true;
          await loadTournaments();
        } else {
          errorMessage = result.error || 'Failed to import tournament';
          showErrorPopup = true;
        }
      } catch (error: any) {
        errorMessage = `Import failed: ${error.message || 'Invalid JSON file'}`;
        showErrorPopup = true;
      } finally {
        importing = false;
      }
    };
    input.click();
  }

  onMount(loadTournaments);
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 py-8 px-4 flex flex-col">
  <div class="w-full max-w-6xl mx-auto space-y-8">

    <!-- Header -->
    <div class="text-center py-3 space-y-2">
      <img src={logoImg} alt="AI Department Logo" class="h-20 w-auto mx-auto mb-2" />
      <h1 class="text-2xl md:text-3xl font-black gradient-text leading-tight">
        TOURNAMENT LOBBY
      </h1>
      <p class="text-gray-400 text-sm">Select or create a tournament to begin</p>
    </div>

    <!-- Create Tournament Section -->
    <div class="glass rounded-lg p-6 shadow-xl border border-brand-cyan/20">
      {#if !showCreateForm}
        <div class="flex flex-wrap gap-3">
          <button
            onclick={() => showCreateForm = true}
            class="bg-gradient-to-r from-brand-purple to-brand-cyan hover:from-brand-cyan hover:to-brand-purple text-white font-bold px-6 py-3 rounded-lg shadow-glow-cyan transition-all duration-300 hover:scale-105 hover:shadow-xl"
          >
            <svg class="w-5 h-5 inline-block mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Create New Tournament
          </button>
          <button
            onclick={handleImportClick}
            disabled={importing}
            class="bg-gradient-to-r from-cyber-green to-brand-cyan hover:from-brand-cyan hover:to-cyber-green text-space-900 font-bold px-6 py-3 rounded-lg shadow-glow-green transition-all duration-300 hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if importing}
              <svg class="w-5 h-5 inline-block mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Importing...
            {:else}
              <svg class="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              Import Tournament
            {/if}
          </button>
        </div>
      {:else}
        <div class="space-y-4">
          <h3 class="text-lg font-bold text-cyber-green">Create New Tournament</h3>
          
          <!-- Game Selection -->
          <div class="space-y-2">
            <span class="text-sm text-gray-400">Select Game</span>
            <div class="grid grid-cols-3 gap-3">
              {#each Object.entries(GAME_CONFIGS) as [gameTypeKey, config]}
                {@const gameConfig = config as typeof GAME_CONFIGS['cs16']}
                <button
                  type="button"
                  onclick={() => selectedGameType = gameTypeKey as GameType}
                  class="relative p-4 rounded-lg border-2 transition-all duration-300 {selectedGameType === gameTypeKey 
                    ? 'border-brand-cyan bg-brand-cyan/20 shadow-glow-cyan' 
                    : 'border-space-600 bg-space-700 hover:border-brand-purple/50'}"
                >
                  <img 
                    src={GAME_LOGOS[gameTypeKey as GameType]} 
                    alt={gameConfig.name}
                    class="w-full h-16 mx-auto mb-2 object-contain"
                  />
                  {#if selectedGameType === gameTypeKey}
                    <div class="absolute top-1 right-1 w-3 h-3 bg-brand-cyan rounded-full"></div>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
          
          <!-- Tournament Name Input -->
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newTournamentName}
              placeholder="Tournament name (e.g., {GAME_CONFIGS[selectedGameType].shortName} Finals)"
              class="flex-1 px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyber-green/50 focus:border-cyber-green text-white placeholder-gray-500 transition-all shadow-lg"
              onkeydown={(e) => e.key === 'Enter' && handleCreateTournament()}
              maxlength="50"
            />
            <button
              onclick={handleCreateTournament}
              class="bg-gradient-to-r from-brand-purple to-brand-cyan hover:from-brand-cyan hover:to-brand-purple text-white font-bold px-4 py-2 text-sm rounded-lg shadow-glow-cyan transition-all duration-300 hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              disabled={!newTournamentName.trim()}
            >
              Create
            </button>
            <button
              onclick={() => { showCreateForm = false; newTournamentName = ''; selectedGameType = 'cs16'; map1 = ''; map2 = ''; map3 = ''; }}
              class="bg-gray-600 hover:bg-gray-500 text-white font-bold px-4 py-2 text-sm rounded-lg transition-all duration-300"
            >
              Cancel
            </button>
          </div>

          <!-- Map Pool (Optional) -->
          <div class="space-y-2">
            <span class="text-sm text-gray-400">Map Pool</span>
            <div class="grid grid-cols-3 gap-2">
              <input
                type="text"
                bind:value={map1}
                placeholder="Map 1 (e.g., de_dust2)"
                class="px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 focus:border-brand-cyan text-white placeholder-gray-500 transition-all shadow-lg"
                maxlength="30"
              />
              <input
                type="text"
                bind:value={map2}
                placeholder="Map 2 (e.g., de_inferno)"
                class="px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 focus:border-brand-cyan text-white placeholder-gray-500 transition-all shadow-lg"
                maxlength="30"
              />
              <input
                type="text"
                bind:value={map3}
                placeholder="Map 3 (e.g., de_nuke)"
                class="px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 focus:border-brand-cyan text-white placeholder-gray-500 transition-all shadow-lg"
                maxlength="30"
              />
            </div>
          </div>

          <!-- CS 1.6 Round Limits -->
          {#if selectedGameType === 'cs16'}
            <div class="space-y-2">
              <span class="text-sm text-gray-400">Round Limits (CS 1.6)</span>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs text-gray-500 mb-1">Group Stage (first to)</label>
                  <input
                    type="number"
                    bind:value={groupStageRoundLimit}
                    min="1"
                    max="30"
                    class="w-full px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 focus:border-brand-cyan text-white placeholder-gray-500 transition-all shadow-lg"
                    placeholder="16"
                  />
                </div>
                <div>
                  <label class="block text-xs text-gray-500 mb-1">Playoffs (first to)</label>
                  <input
                    type="number"
                    bind:value={playoffsRoundLimit}
                    min="1"
                    max="20"
                    class="w-full px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 focus:border-brand-cyan text-white placeholder-gray-500 transition-all shadow-lg"
                    placeholder="10"
                  />
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Tournament List -->
    <div class="space-y-8">
      <!-- Active Tournaments Section -->
      <div class="space-y-4">
        <div class="inline-block">
          <h2 class="text-xl font-bold bg-gradient-to-r from-brand-cyan to-cyber-blue bg-clip-text text-transparent pb-1">Active Tournaments</h2>
          <div class="h-1 bg-gradient-to-r from-brand-cyan to-cyber-blue rounded-full"></div>
        </div>

        {#if getActiveTournaments().length === 0}
          <div class="glass rounded-xl p-8 text-center shadow-xl">
            <p class="text-gray-400 text-sm">No active tournaments. Create your first one above!</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each getActiveTournaments() as tournament}
              <div
                role="button"
                tabindex="0"
                class="glass rounded-lg p-4 shadow-xl hover:shadow-cyber-green/20 hover:scale-105 transition-all duration-300 card-entrance cursor-pointer relative border border-brand-cyan/30"
                onclick={() => navigateToTournament(tournament.id)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigateToTournament(tournament.id); }}
              >
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-3 min-w-0">
                    {#if tournament.gameType && GAME_LOGOS[tournament.gameType as GameType]}
                      <img 
                        src={GAME_LOGOS[tournament.gameType as GameType]} 
                        alt={GAME_CONFIGS[tournament.gameType as GameType]?.shortName || 'Game'}
                        class="w-16 h-10 object-contain flex-shrink-0"
                      />
                    {/if}
                    <h3 class="text-lg font-bold text-white truncate">{tournament.name}</h3>
                  </div>

                  <div class="flex items-center gap-2">
                    <span class="px-2 py-1 bg-brand-cyan/20 border border-brand-cyan rounded text-brand-cyan font-bold text-xs uppercase">
                      {tournament.state}
                    </span>
                    <button
                      onclick={(e) => requestDeleteTournament(e, tournament.id)}
                      class="p-1.5 rounded-full bg-red-600/20 text-red-400 hover:bg-red-500/40 hover:text-red-300 transition-all"
                      title="Delete Tournament"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                    </button>
                  </div>
                </div>

                <div class="flex items-center justify-between text-sm mb-3">
                  <div class="flex items-center gap-4 text-gray-400">
                    <div class="flex items-center gap-1">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                      {tournament.playerCount}
                    </div>
                    {#if tournament.gameType && GAME_CONFIGS[tournament.gameType as GameType]}
                      <div class="text-brand-cyan text-xs font-medium">
                        {GAME_CONFIGS[tournament.gameType as GameType].shortName}
                      </div>
                    {/if}
                  </div>
                </div>

                <div class="flex items-center gap-1 text-xs text-gray-500 border-t border-space-600 pt-2">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  <span>{formatDate(tournament.createdAt)}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Finished Tournaments Section -->
      {#if getFinishedTournaments().length > 0}
        <div class="space-y-4">
          <div class="inline-block">
            <h2 class="text-xl font-bold bg-gradient-to-r from-cyber-green to-brand-cyan bg-clip-text text-transparent pb-1">Finished Tournaments</h2>
            <div class="h-1 bg-gradient-to-r from-cyber-green to-brand-cyan rounded-full"></div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each getFinishedTournaments() as tournament}
              <div
                role="button"
                tabindex="0"
                class="glass rounded-lg p-4 shadow-xl hover:shadow-cyber-green/20 hover:scale-105 transition-all duration-300 card-entrance cursor-pointer relative border border-cyber-green/30 opacity-80"
                onclick={() => navigateToTournament(tournament.id)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigateToTournament(tournament.id); }}
              >
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-3 min-w-0">
                    {#if tournament.gameType && GAME_LOGOS[tournament.gameType as GameType]}
                      <img 
                        src={GAME_LOGOS[tournament.gameType as GameType]} 
                        alt={GAME_CONFIGS[tournament.gameType as GameType]?.shortName || 'Game'}
                        class="w-16 h-10 object-contain flex-shrink-0"
                      />
                    {/if}
                    <h3 class="text-lg font-bold text-white truncate">{tournament.name}</h3>
                  </div>

                  <div class="flex items-center gap-2">
                    <span class="px-2 py-1 bg-cyber-green/20 border border-cyber-green rounded text-cyber-green font-bold text-xs uppercase">
                      Finished
                    </span>
                    <button
                      onclick={(e) => requestDeleteTournament(e, tournament.id)}
                      class="p-1.5 rounded-full bg-red-600/20 text-red-400 hover:bg-red-500/40 hover:text-red-300 transition-all"
                      title="Delete Tournament"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                    </button>
                  </div>
                </div>

                <div class="flex items-center justify-between text-sm mb-3">
                  <div class="flex items-center gap-4 text-gray-400">
                    <div class="flex items-center gap-1">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                      {tournament.playerCount}
                    </div>
                    {#if tournament.gameType && GAME_CONFIGS[tournament.gameType as GameType]}
                      <div class="text-cyber-green text-xs font-medium">
                        {GAME_CONFIGS[tournament.gameType as GameType].shortName}
                      </div>
                    {/if}
                  </div>
                </div>

                <div class="flex items-center gap-1 text-xs text-gray-500 border-t border-space-600 pt-2">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  <span>{formatDate(tournament.createdAt)}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
  <Footer />

<!-- Confirmation Popup Modal -->
{#if showConfirmPopup}
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && cancelConfirmation()} onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && e.target === e.currentTarget && cancelConfirmation()}>
    <div class="glass rounded-xl max-w-md w-full shadow-2xl border border-red-500/30" onclick={(e) => e.stopPropagation()}>
      <!-- Modal Header -->
      <div class="flex items-center gap-3 p-6 border-b border-space-600">
        <div class="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">{confirmTitle}</h2>
          <p class="text-gray-400 text-sm">Please confirm</p>
        </div>
      </div>
      
      <!-- Modal Content -->
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
            class="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-2 rounded-lg shadow-lg hover:scale-105 transition-all duration-300"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Error Popup Modal -->
{#if showErrorPopup}
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && (showErrorPopup = false)} onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && e.target === e.currentTarget && (showErrorPopup = false)}>
    <div class="glass rounded-xl max-w-md w-full shadow-2xl border border-red-500/30" onclick={(e) => e.stopPropagation()}>
      <!-- Modal Header -->
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
      
      <!-- Modal Content -->
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

<!-- Import Success Popup Modal -->
{#if showImportSuccess}
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && (showImportSuccess = false)} onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && e.target === e.currentTarget && (showImportSuccess = false)}>
    <div class="glass rounded-xl max-w-md w-full shadow-2xl border border-cyber-green/30" onclick={(e) => e.stopPropagation()}>
      <!-- Modal Header -->
      <div class="flex items-center gap-3 p-6 border-b border-space-600">
        <div class="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Import Successful</h2>
          <p class="text-gray-400 text-sm">Tournament has been restored</p>
        </div>
      </div>
      
      <!-- Modal Content -->
      <div class="p-6">
        <p class="text-gray-300 mb-6">Tournament "<span class="text-brand-cyan font-semibold">{importedTournamentName}</span>" has been successfully imported!</p>
        <div class="flex justify-end gap-3">
          <button
            onclick={() => showImportSuccess = false}
            class="bg-gray-600 hover:bg-gray-500 text-white font-bold px-4 py-2 rounded-lg transition-all duration-300"
          >
            Stay Here
          </button>
          <button
            onclick={goToImportedTournament}
            class="bg-gradient-to-r from-brand-purple to-brand-cyan text-white font-bold px-6 py-2 rounded-lg shadow-glow-cyan hover:scale-105 transition-all duration-300"
          >
            View Tournament
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
