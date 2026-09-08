<script lang="ts">
  import { onMount } from 'svelte';
  import { getTournaments, createTournament, deleteTournament, importTournament, formatKeyForDisplay, type GameType, GAME_CONFIGS } from '$lib/api';
  import { getArchetypeConfig } from '$shared/gameArchetypes';
  import { getGameLogoUrl } from '$lib/gameLogos';
  import logoImg from '../assets/logo.png';
  import Footer from '../components/Footer.svelte';

  // Get logo path from config and resolve via Vite
  function getGameLogo(gameType: GameType): string {
    const logoPath = GAME_CONFIGS[gameType]?.logo || '';
    return getGameLogoUrl(logoPath) || '';
  }

  let tournaments: any[] = $state([]);
  let newTournamentName = $state('');
  let selectedGameType = $state<GameType>('cs16');
  let map1 = $state('');
  let map2 = $state('');
  let map3 = $state('');
  let groupStageRoundLimit = $state<number>(16);
  let playoffsRoundLimit = $state<number>(10);

  // Default the round limits to the selected game's configured limits
  // (cs16 -> 16/10, rtcw/wolfet -> 5/5, etc.) whenever the game changes -- the
  // old hardcoded 16/10 was wrong for every game but CS 1.6. The user can still
  // override via the inputs afterward. Also resets when Cancel sets game=cs16.
  $effect(() => {
    const cfg = GAME_CONFIGS[selectedGameType];
    groupStageRoundLimit = cfg.groupStage.maxScore ?? 16;
    playoffsRoundLimit = cfg.playoffs.maxScorePerMap ?? 10;
  });
  let useCustomPoints = $state(false);
  let teamMode = $state(false);
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
  let importedJoinCode = $state('');
  let importedAdminKey = $state('');

  // Whether this visitor is the instance owner. /api/tournaments is the owner's
  // view; everyone else reaches a tournament with a join code instead.
  let canListTournaments = $state(true);

  // Credentials handed out once, right after a tournament is created or
  // imported. The admin key is never retrievable again.
  let showCredentials = $state(false);
  let credName = $state('');
  let credId = $state('');
  let credJoinCode = $state('');
  let credAdminKey = $state('');
  let copied = $state('');

  const joinLink = $derived(credJoinCode ? `${window.location.origin}/t/${credJoinCode}` : '');

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = label;
      setTimeout(() => { if (copied === label) copied = ''; }, 1800);
    } catch {
      copied = '';
    }
  }

  // Two things people actually want: the code (to read out) and the link (to
  // paste). Both are one click, and the whole block is the target rather than
  // a few pixels of text beside it.
  function copyCode(e: MouseEvent, code: string) {
    e.stopPropagation();
    copy(code, `code:${code}`);
  }
  function copyLink(e: MouseEvent, code: string) {
    e.stopPropagation();
    copy(shareLinkFor(code), `link:${code}`);
  }

  function openCredentials(name: string, id: string, code: string, key: string) {
    credName = name; credId = id; credJoinCode = code; credAdminKey = key;
    showCredentials = true;
  }

  function shareLinkFor(code: string): string {
    return `${window.location.origin}/t/${code}`;
  }

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
    try {
      tournaments = await getTournaments();
      canListTournaments = true;
    } catch {
      // Not the instance owner: there is no list to show, only the join box.
      tournaments = [];
      canListTournaments = false;
    }
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
    
    // Pass round limits for rounds-based games (cs16, rtcw, wolfet)
    const isRoundsBased = GAME_CONFIGS[selectedGameType].defaultArchetype === 'rounds';
    
    // Check if team mode should be passed
    const supportsTeamMode = GAME_CONFIGS[selectedGameType].supportsTeamMode === true;
    
    try {
      const result = await createTournament(
        newTournamentName.trim(), 
        selectedGameType, 
        mapPool,
        isRoundsBased ? groupStageRoundLimit : undefined,
        isRoundsBased ? playoffsRoundLimit : undefined,
        useCustomPoints,
        supportsTeamMode && teamMode ? true : undefined
      );
      newTournamentName = '';
      selectedGameType = 'cs16';
      map1 = '';
      map2 = '';
      map3 = '';
      groupStageRoundLimit = 16;
      playoffsRoundLimit = 10;
      useCustomPoints = false;
      teamMode = false;
      showCreateForm = false;
      await loadTournaments();

      // Show the join code and admin key before going anywhere -- the admin key
      // exists only in that one response and is never retrievable again.
      openCredentials(result.name, result.id, result.joinCode, result.adminKey);
    } catch (error: any) {
      errorMessage = error.message || 'Failed to create tournament';
      showErrorPopup = true;
    }
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
        importedTournamentName = result.name || 'Unknown';
        importedTournamentId = result.id;
        importedJoinCode = result.joinCode;
        importedAdminKey = result.adminKey;
        await loadTournaments();
        openCredentials(result.name, result.id, importedJoinCode, importedAdminKey);
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

<div class="min-h-screen bg-space-600 py-8 px-4 flex flex-col">
  <div class="w-full max-w-6xl mx-auto space-y-8">

    <!-- Header -->
    <div class="text-center py-3 space-y-2">
      <img src={logoImg} alt="AI Department Logo" class="h-20 w-auto mx-auto mb-2" />
      <h1 class="text-2xl md:text-3xl font-black gradient-text leading-tight">
        TOURNAMENT LOBBY
      </h1>
      <p class="text-gray-400 text-sm">Select or create a tournament to begin</p>
    </div>

    {#if !canListTournaments}
      <!-- Not the instance owner: the only way in is a join code. -->
      <div class="glass rounded-2xl p-8 shadow-xl border border-cyber-green/30 text-center">
        <h2 class="text-2xl font-black gradient-text mb-2">Got a join code?</h2>
        <p class="text-gray-400 text-sm mb-6 max-w-md mx-auto">
          Enter the code from the organiser to follow a tournament's brackets, standings and
          statistics live.
        </p>
        <a href="/join" class="inline-block bg-cyber-green text-black font-bold px-8 py-3 rounded-xl hover:brightness-110 transition">
          Join a tournament
        </a>
        <p class="text-xs text-gray-500 mt-6">
          Running the tournament yourself? <a href="/login" class="text-brand-orange hover:text-cyber-green underline">Sign in as organiser</a>.
        </p>
      </div>
    {/if}

    <!-- Create Tournament Section -->
    <div class="glass rounded-lg p-6 shadow-xl border border-white/10" class:hidden={!canListTournaments}>
      {#if !showCreateForm}
        <div class="flex flex-wrap gap-3">
          <button onclick={() => showCreateForm = true} class="btn btn-primary">
            <svg class="w-5 h-5 inline-block mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>
            Create New Tournament
          </button>
          <a href="/join" class="btn btn-secondary">
            <svg class="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7h3a5 5 0 010 10h-3m-6 0H6a5 5 0 010-10h3m-1 5h8"/></svg>
            Open by code
          </a>
          <button onclick={handleImportClick} disabled={importing} class="btn btn-secondary">
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
          
          <!-- Game Selection - Card Grid -->
          <div class="space-y-2">
            <span class="text-sm text-gray-400">Select Game ({Object.keys(GAME_CONFIGS).length} available)</span>
            <div class="max-h-64 overflow-y-auto rounded-lg border-2 border-space-600 bg-space-800/50 p-3 custom-scrollbar">
              <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {#each Object.entries(GAME_CONFIGS) as [gameTypeKey, config]}
                  {@const gameConfig = config as typeof GAME_CONFIGS['cs16']}
                  <button
                    type="button"
                    onclick={() => selectedGameType = gameTypeKey as GameType}
                    class="relative flex flex-col items-center p-2 rounded-lg transition-all duration-200 {selectedGameType === gameTypeKey 
                      ? 'bg-brand-cyan/20 ring-2 ring-brand-cyan shadow-lg shadow-brand-cyan/20' 
                      : 'bg-space-700/50 hover:bg-space-600/50 hover:ring-1 hover:ring-space-500'}"
                  >
                    <div class="w-22 h-16 flex items-center justify-center mb-1 relative">
                      <img 
                        src={getGameLogo(gameTypeKey as GameType)} 
                        alt={gameConfig.name}
                        class="max-w-full max-h-full object-contain"
                        onerror={(e) => {
                          const img = e.target as HTMLImageElement;
                          img.style.display = 'none';
                          const fallback = img.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                      <div class="w-14 h-14 rounded bg-space-600 items-center justify-center absolute" style="display: none;">
                        <span class="text-xl font-bold text-gray-500">{gameConfig.shortName.substring(0, 2).toUpperCase()}</span>
                      </div>
                    </div>
                    <div class="text-xs text-gray-300 text-center leading-tight line-clamp-2 min-h-[2rem] font-medium">{gameConfig.name}</div>
                    {#if selectedGameType === gameTypeKey}
                      <div class="absolute -top-1 -right-1">
                        <svg class="w-4 h-4 text-brand-cyan bg-space-900 rounded-full" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                        </svg>
                      </div>
                    {/if}
                  </button>
                {/each}
              </div>
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
              class="bg-space-600  text-white font-bold px-4 py-2 text-sm rounded-lg shadow-glow-cyan transition-all duration-300 hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              disabled={!newTournamentName.trim()}
            >
              Create
            </button>
            <button
              onclick={() => { showCreateForm = false; newTournamentName = ''; selectedGameType = 'cs16'; map1 = ''; map2 = ''; map3 = ''; useCustomPoints = false; teamMode = false; }}
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

          <!-- Scoring Options -->
          <div class="space-y-3">
            <!-- Custom Points Toggle -->
            <div class="flex items-center gap-3">
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" bind:checked={useCustomPoints} class="sr-only peer" />
                <div class="w-9 h-5 bg-space-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-cyan/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-cyan"></div>
              </label>
              <div>
                <span class="text-sm text-gray-300">Use Custom Points</span>
                <p class="text-xs text-gray-500">
                  {#if useCustomPoints}
                    Override default scoring
                  {:else}
                    Default: {getArchetypeConfig(GAME_CONFIGS[selectedGameType].defaultArchetype).scoreLabel}
                  {/if}
                </p>
              </div>
            </div>

            <!-- Team Mode Toggle (only for games that support it) -->
            {#if GAME_CONFIGS[selectedGameType].supportsTeamMode}
              <div class="flex items-center gap-3">
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" bind:checked={teamMode} class="sr-only peer" />
                  <div class="w-9 h-5 bg-space-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-purple/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-purple"></div>
                </label>
                <div>
                  <span class="text-sm text-gray-300">Team Tournament</span>
                  <p class="text-xs text-gray-500">
                    {#if teamMode}
                      Teams compete ({GAME_CONFIGS[selectedGameType].minTeamSize}-{GAME_CONFIGS[selectedGameType].maxTeamSize} players per team)
                    {:else}
                      1v1 individual matches
                    {/if}
                  </p>
                </div>
              </div>
            {/if}

            <!-- Round Limits for rounds-based games -->
            {#if GAME_CONFIGS[selectedGameType].defaultArchetype === 'rounds' && !useCustomPoints}
              <div class="space-y-2">
                <span class="text-sm text-gray-400">Round Limits ({GAME_CONFIGS[selectedGameType].shortName})</span>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label for="group-stage-limit" class="block text-xs text-gray-500 mb-1">Group Stage (first to)</label>
                    <input
                      id="group-stage-limit"
                      type="number"
                      bind:value={groupStageRoundLimit}
                      min="1"
                      max="30"
                      class="w-full px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 focus:border-brand-cyan text-white placeholder-gray-500 transition-all shadow-lg"
                      placeholder={String(GAME_CONFIGS[selectedGameType].groupStage.maxScore || 16)}
                    />
                  </div>
                  <div>
                    <label for="playoffs-limit" class="block text-xs text-gray-500 mb-1">Playoffs (first to)</label>
                    <input
                      id="playoffs-limit"
                      type="number"
                      bind:value={playoffsRoundLimit}
                      min="1"
                      max="20"
                      class="w-full px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-cyan/50 focus:border-brand-cyan text-white placeholder-gray-500 transition-all shadow-lg"
                      placeholder={String(GAME_CONFIGS[selectedGameType].playoffs.maxScorePerMap || 10)}
                    />
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Tournament List -->
    <div class="space-y-8">
      <!-- Active Tournaments Section -->
      <div class="space-y-4">
        <div class="inline-block">
          <h2 class="section-title">Active</h2>
        </div>

        {#if getActiveTournaments().length === 0}
          <div class="glass rounded-xl p-8 text-center shadow-xl">
            <p class="text-gray-400 text-sm">
              {canListTournaments
                ? 'No active tournaments yet - create one above.'
                : 'Nothing running right now.'}
            </p>
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
                    {#if tournament.gameType && GAME_CONFIGS[tournament.gameType as GameType]}
                      <img 
                        src={getGameLogo(tournament.gameType as GameType)} 
                        alt={GAME_CONFIGS[tournament.gameType as GameType]?.shortName || 'Game'}
                        class="w-16 h-10 object-contain flex-shrink-0"
                        onerror={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                      />
                    {/if}
                    <h3 class="text-base font-bold text-ink leading-snug">{tournament.name}</h3>
                  </div>

                  <div class="flex items-center gap-2">
                    <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border
                      {tournament.state === 'completed'
                        ? 'bg-white/5 text-ink-muted border-white/10'
                        : 'bg-win/10 text-win border-win/30'}">
                      {tournament.state === 'completed' ? 'Finished' : tournament.state}
                    </span>
                    <button
                      onclick={(e) => requestDeleteTournament(e, tournament.id)}
                      class="p-1.5 rounded-full bg-loss/20 text-loss hover:bg-loss/40 hover:text-loss transition-all"
                      title="Delete Tournament"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                    </button>
                  </div>
                </div>

                {#if tournament.joinCode}
                  <div class="flex items-center gap-2 mb-3 flex-wrap">
                    <button
                      type="button"
                      class="code-copy"
                      class:is-copied={copied === `code:${tournament.joinCode}`}
                      onclick={(e) => copyCode(e, tournament.joinCode)}
                      title="Copy the join code"
                    >
                      <span class="code-copy__value">{tournament.joinCode}</span>
                      <span class="code-copy__hint">
                        {copied === `code:${tournament.joinCode}` ? 'Copied' : 'Copy'}
                      </span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost !px-2.5 !py-1.5 !text-xs"
                      onclick={(e) => copyLink(e, tournament.joinCode)}
                      title="Copy the shareable view-only link"
                    >
                      {copied === `link:${tournament.joinCode}` ? 'Link copied' : 'Copy link'}
                    </button>
                  </div>
                {/if}

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
                    <!-- Team/1v1 indicator -->
                    <div class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold {tournament.isTeamBased ? 'bg-brand-orange/20 text-brand-orange' : 'bg-white/5 text-ink-faint'}">
                      {#if tournament.isTeamBased}
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>
                        TEAM
                      {:else}
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                        1v1
                      {/if}
                    </div>
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
            <h2 class="section-title">Finished</h2>
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
                    {#if tournament.gameType && GAME_CONFIGS[tournament.gameType as GameType]}
                      <img 
                        src={getGameLogo(tournament.gameType as GameType)} 
                        alt={GAME_CONFIGS[tournament.gameType as GameType]?.shortName || 'Game'}
                        class="w-16 h-10 object-contain flex-shrink-0"
                        onerror={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                      />
                    {/if}
                    <h3 class="text-base font-bold text-ink leading-snug">{tournament.name}</h3>
                  </div>

                  <div class="flex items-center gap-2">
                    <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-white/5 text-ink-muted border border-white/10">
                      Finished
                    </span>
                    <button
                      onclick={(e) => requestDeleteTournament(e, tournament.id)}
                      class="p-1.5 rounded-full bg-loss/20 text-loss hover:bg-loss/40 hover:text-loss transition-all"
                      title="Delete Tournament"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                    </button>
                  </div>
                </div>

                {#if tournament.joinCode}
                  <div class="flex items-center gap-2 mb-3 flex-wrap">
                    <button
                      type="button"
                      class="code-copy"
                      class:is-copied={copied === `code:${tournament.joinCode}`}
                      onclick={(e) => copyCode(e, tournament.joinCode)}
                      title="Copy the join code"
                    >
                      <span class="code-copy__value">{tournament.joinCode}</span>
                      <span class="code-copy__hint">
                        {copied === `code:${tournament.joinCode}` ? 'Copied' : 'Copy'}
                      </span>
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost !px-2.5 !py-1.5 !text-xs"
                      onclick={(e) => copyLink(e, tournament.joinCode)}
                      title="Copy the shareable view-only link"
                    >
                      {copied === `link:${tournament.joinCode}` ? 'Link copied' : 'Copy link'}
                    </button>
                  </div>
                {/if}

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
                    <!-- Team/1v1 indicator -->
                    <div class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold {tournament.isTeamBased ? 'bg-brand-orange/20 text-brand-orange' : 'bg-white/5 text-ink-faint'}">
                      {#if tournament.isTeamBased}
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>
                        TEAM
                      {:else}
                        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                        1v1
                      {/if}
                    </div>
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
    <div role="presentation" class="glass rounded-xl max-w-md w-full shadow-2xl border border-loss/30" onclick={(e) => e.stopPropagation()}>
      <!-- Modal Header -->
      <div class="flex items-center gap-3 p-6 border-b border-space-600">
        <div class="w-12 h-12 rounded-full bg-loss/20 flex items-center justify-center">
          <svg class="w-6 h-6 text-loss" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
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
            class="bg-loss hover:bg-loss text-white font-bold px-6 py-2 rounded-lg shadow-lg hover:scale-105 transition-all duration-300"
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
    <div role="presentation" class="glass rounded-xl max-w-md w-full shadow-2xl border border-loss/30" onclick={(e) => e.stopPropagation()}>
      <!-- Modal Header -->
      <div class="flex items-center gap-3 p-6 border-b border-space-600">
        <div class="w-12 h-12 rounded-full bg-loss/20 flex items-center justify-center">
          <svg class="w-6 h-6 text-loss" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
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
            class="bg-space-600 text-white font-bold px-6 py-2 rounded-lg shadow-glow-cyan hover:scale-105 transition-all duration-300"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Import Success Popup Modal -->
{#if showCredentials}
  <div class="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="glass rounded-xl max-w-lg w-full shadow-2xl border border-cyber-green/40">
      <div class="p-6 border-b border-space-600">
        <h2 class="text-xl font-bold text-white">"{credName}" is ready</h2>
        <p class="text-gray-400 text-sm mt-1">Share the code to let people watch. Keep the admin key to run it.</p>
      </div>

      <div class="p-6 space-y-6">
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-bold text-gray-400 tracking-widest">JOIN CODE - SAFE TO SHARE</span>
            <button onclick={() => copy(joinLink, 'link')} class="text-[11px] font-bold text-brand-cyan hover:text-cyber-green transition">
              {copied === 'link' ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <button
            type="button"
            class="w-full p-4 rounded-xl bg-space-900 border border-space-500 text-center hover:border-accent transition-colors"
            onclick={() => copy(credJoinCode, 'cred-code')}
            title="Copy the join code"
          >
            <div class="text-3xl font-mono font-bold text-accent-soft tracking-[0.3em]">{credJoinCode}</div>
            <div class="text-[11px] font-bold tracking-wider uppercase mt-2 {copied === 'cred-code' ? 'text-win' : 'text-ink-faint'}">
              {copied === 'cred-code' ? 'Code copied' : 'Click to copy the code'}
            </div>
          </button>
          <div class="text-xs text-ink-faint mt-2 break-all">{joinLink}</div>
          <p class="text-xs text-gray-500 mt-2">Anyone with this can follow the brackets and stats live. They cannot change anything.</p>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] font-bold text-brand-orange tracking-widest">ADMIN KEY - SHOWN ONCE</span>
            <button onclick={() => copy(credAdminKey, 'key')} class="text-[11px] font-bold text-brand-orange hover:text-cyber-green transition">
              {copied === 'key' ? 'Copied' : 'Copy key'}
            </button>
          </div>
          <div class="p-4 rounded-xl bg-space-800 border border-brand-orange/40">
            <div class="font-mono text-sm text-brand-orange break-all select-all">{formatKeyForDisplay(credAdminKey)}</div>
          </div>
          <p class="text-xs text-gray-400 mt-2">
            This is the only thing that can enter results. It is already saved in
            <strong class="text-gray-300">this browser</strong> - copy it somewhere safe if you might
            run the tournament from another device. The server keeps only a hash, so it cannot be shown again.
          </p>
        </div>
      </div>

      <div class="flex justify-end gap-3 p-6 border-t border-space-600">
        <button onclick={() => showCredentials = false} class="bg-gray-600 hover:bg-gray-500 text-white font-bold px-4 py-2 rounded-lg transition">
          Stay here
        </button>
        <button
          onclick={() => { showCredentials = false; navigateToTournament(credId); }}
          class="bg-space-600 text-white font-bold px-6 py-2 rounded-lg shadow-glow-cyan hover:scale-105 transition"
        >
          Open tournament
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showImportSuccess}
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && (showImportSuccess = false)} onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && e.target === e.currentTarget && (showImportSuccess = false)}>
    <div role="presentation" class="glass rounded-xl max-w-md w-full shadow-2xl border border-cyber-green/30" onclick={(e) => e.stopPropagation()}>
      <!-- Modal Header -->
      <div class="flex items-center gap-3 p-6 border-b border-space-600">
        <div class="w-12 h-12 rounded-full bg-win/20 flex items-center justify-center">
          <svg class="w-6 h-6 text-win" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
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
        <p class="text-gray-300 mb-6">Tournament "<span class="text-ink-muted font-semibold">{importedTournamentName}</span>" has been successfully imported!</p>
        <div class="flex justify-end gap-3">
          <button
            onclick={() => showImportSuccess = false}
            class="bg-gray-600 hover:bg-gray-500 text-white font-bold px-4 py-2 rounded-lg transition-all duration-300"
          >
            Stay Here
          </button>
          <button
            onclick={goToImportedTournament}
            class="bg-space-600 text-white font-bold px-6 py-2 rounded-lg shadow-glow-cyan hover:scale-105 transition-all duration-300"
          >
            View Tournament
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
