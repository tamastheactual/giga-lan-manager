<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, addPlayer, startGroupStage, resetTournament, updateTournamentName, updatePlayerName, updatePlayerPhoto, removePlayer, type GameType, GAME_CONFIGS } from '$lib/api';
  import { getPlayerImageUrl } from '$lib/playerImages';
  import csLogo from '../assets/games/CounterStrike.png';
  import ut2004Logo from '../assets/games/UT2004.png';
  import wormsLogo from '../assets/games/WormsArmageddon.png';

  // Map game types to logos
  const GAME_LOGOS: Record<GameType, string> = {
    cs16: csLogo,
    ut2004: ut2004Logo,
    worms: wormsLogo
  };

  let { tournamentId } = $props<{ tournamentId: string }>();
  let players = $state([] as any[]);
  let newPlayerName = $state('');
  let tournamentState = $state('registration');
  let tournamentName = $state('');
  let gameType = $state<GameType | null>(null);
  let showConfetti = $state(false);
  let showRulesModal = $state(false);

  // Player edit state
  let editingPlayerId = $state<string | null>(null);
  let editingPlayerName = $state('');

  // Photo editing state
  let editingPhotoPlayerId = $state<string | null>(null);
  let selectedFile = $state<File | null>(null);
  let imagePreview = $state<string | null>(null);
  let showPhotoModal = $state(false);

  // Editing state for tournament name
  let isEditingName = $state(false);
  let editingName = $state('');

  // Error popup state
  let showErrorPopup = $state(false);
  let errorMessage = $state('');

  // Confirmation popup state
  let showConfirmPopup = $state(false);
  let confirmMessage = $state('');
  let confirmTitle = $state('');
  let confirmButtonText = $state('Confirm');
  let pendingAction = $state<(() => Promise<void>) | null>(null);

  // Computed: current game config
  const currentGameConfig = $derived(gameType ? GAME_CONFIGS[gameType] : null);

  async function loadState() {
    const data = await getState(tournamentId);
    players = data.players;
    tournamentState = data.state;
    tournamentName = data.name;
    gameType = data.gameType || null;
  }

  async function handleAddPlayer() {
    if (!newPlayerName.trim()) return;

    // Check for duplicate names
    const trimmedName = newPlayerName.trim();
    if (players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      errorMessage = 'A player with this name already exists! Please choose a different name.';
      showErrorPopup = true;
      return;
    }

    const newPlayer = await addPlayer(tournamentId, trimmedName);
    
    // Set profile photo based on name match (or default to Cat)
    const photoUrl = getPlayerImageUrl(trimmedName);
    if (photoUrl && newPlayer?.id) {
      await updatePlayerPhoto(tournamentId, newPlayer.id, photoUrl);
    }
    
    newPlayerName = '';
    await loadState();

    // Show confetti when reaching minimum players
    if (players.length === 4) {
      showConfetti = true;
      setTimeout(() => showConfetti = false, 3000);
    }
  }

  async function handleStart() {
    if (players.length === 11 || players.length === 13) {
      errorMessage = "Please add or remove 1 player. 11 and 13 player tournaments are not supported.";
      showErrorPopup = true;
      return;
    }
    await startGroupStage(tournamentId);
    await loadState();
    window.location.href = `/tournament/${tournamentId}/groups`;
  }

  function requestRemovePlayer(playerId: string) {
    const player = players.find(p => p.id === playerId);
    confirmTitle = 'Remove Player';
    confirmMessage = `Are you sure you want to remove "${player?.name || 'this player'}" from the tournament?`;
    confirmButtonText = 'Remove';
    pendingAction = async () => {
      try {
        await removePlayer(tournamentId, playerId);
        await loadState();
      } catch (error) {
        console.error('Failed to remove player:', error);
        errorMessage = 'Failed to remove player.';
        showErrorPopup = true;
      }
    };
    showConfirmPopup = true;
  }

  function requestReset() {
    confirmTitle = 'Reset Tournament';
    confirmMessage = 'Are you sure? This will delete all tournament data including players, matches, and brackets. This action cannot be undone.';
    confirmButtonText = 'Reset';
    pendingAction = async () => {
      try {
        console.log('[Home] Resetting tournament...');
        await resetTournament(tournamentId);
        console.log('[Home] Tournament reset, redirecting...');
        window.location.href = '/';
      } catch (error) {
        console.error('[Home] Error resetting tournament:', error);
        errorMessage = 'Failed to reset tournament. Check console for details.';
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

  function startEditingName() {
    editingName = tournamentName;
    isEditingName = true;
  }

  function cancelEditingName() {
    isEditingName = false;
  }

  async function saveTournamentName() {
    if (!editingName.trim()) {
      errorMessage = 'Tournament name cannot be empty.';
      showErrorPopup = true;
      return;
    }
    try {
      await updateTournamentName(tournamentId, editingName);
      tournamentName = editingName;
      isEditingName = false;
    } catch (error) {
      console.error('Failed to update tournament name:', error);
      errorMessage = 'Failed to update name.';
      showErrorPopup = true;
    }
  }

  function startEditingPlayer(playerId: string) {
    console.log('[Dashboard] startEditingPlayer called for', playerId);
    const p = players.find(x => x.id === playerId);
    if (!p) {
      console.warn('[Dashboard] player not found', playerId);
      return;
    }
    editingPlayerId = playerId;
    editingPlayerName = p.name;
  }

  function cancelEditingPlayer() {
    editingPlayerId = null;
    editingPlayerName = '';
  }

  async function savePlayerName(playerId?: string) {
    if (!playerId && !editingPlayerId) return;
    const id = playerId || editingPlayerId!;
    if (!editingPlayerName.trim()) {
      errorMessage = 'Name cannot be empty';
      showErrorPopup = true;
      return;
    }
    try {
      await updatePlayerName(tournamentId, id, editingPlayerName.trim());
      await loadState();
      editingPlayerId = null;
      editingPlayerName = '';
    } catch (err) {
      console.error('Failed to update player name:', err);
      errorMessage = 'Failed to update player name';
      showErrorPopup = true;
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

  // Simple Photo Editing Functions

  function startEditingPhoto(playerId: string) {
    editingPhotoPlayerId = playerId;
    selectedFile = null;
    imagePreview = null;
    showPhotoModal = true;
  }

  function cancelPhotoEditing() {
    showPhotoModal = false;
    editingPhotoPlayerId = null;
    selectedFile = null;
    imagePreview = null;
  }

  async function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      errorMessage = 'Please select a valid image file (JPEG, PNG, GIF, or WebP)';
      showErrorPopup = true;
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      errorMessage = 'File size must be less than 5MB';
      showErrorPopup = true;
      return;
    }

    selectedFile = file;

    // Create image preview
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function savePlayerPhoto() {
    if (!editingPhotoPlayerId || !imagePreview) return;

    try {
      await updatePlayerPhoto(tournamentId, editingPhotoPlayerId, imagePreview);
      // Update local state
      const playerIndex = players.findIndex(p => p.id === editingPhotoPlayerId);
      if (playerIndex !== -1) {
        players[playerIndex].profilePhoto = imagePreview;
      }
      cancelPhotoEditing();
    } catch (error) {
      console.error('Failed to save photo:', error);
      errorMessage = 'Failed to save photo';
      showErrorPopup = true;
    }
  }

  onMount(() => {
    const pathParts = window.location.pathname.split('/');
    tournamentId = pathParts[2]; // /tournament/:id
    loadState();
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 py-8 px-4">
  <div class="w-full max-w-6xl mx-auto space-y-8">

    <!-- Header with Animated Title -->
    <div class="text-center py-3 space-y-2">
      {#if isEditingName}
        <div class="flex justify-center items-center gap-2 max-w-lg mx-auto">
          <input
            type="text"
            bind:value={editingName}
            class="flex-1 text-center text-2xl md:text-3xl font-black bg-space-700 border border-cyber-green rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-cyber-green px-3 py-2"
            onkeydown={(e) => {
              if (e.key === 'Enter') saveTournamentName();
              if (e.key === 'Escape') cancelEditingName();
            }}
          />
          <button onclick={saveTournamentName} class="px-3 py-2 text-sm bg-brand-purple text-white rounded font-bold hover:bg-brand-cyan transition-colors">Save</button>
          <button onclick={cancelEditingName} class="px-3 py-2 text-sm bg-gray-600 text-white rounded font-bold hover:bg-gray-500">Cancel</button>
        </div>
      {:else}
        <h1 class="text-2xl md:text-3xl font-black gradient-text leading-tight inline-flex items-center gap-2">
          {tournamentName}
          {#if tournamentState === 'registration'}
            <button type="button" onclick={startEditingName} class="cursor-pointer hover:opacity-80 p-1" title="Edit Name" aria-label="Edit tournament name">
              <svg class="w-5 h-5 opacity-60" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
            </button>
          {/if}
        </h1>
      {/if}
      <p class="text-gray-400 text-sm">TOURNAMENT COMMAND CENTER</p>
    </div>

    <!-- Game Info Banner -->
    {#if currentGameConfig && gameType}
      <div class="glass rounded-lg p-4 shadow-xl border border-brand-purple/30 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <img 
            src={GAME_LOGOS[gameType]} 
            alt={currentGameConfig.name}
            class="w-24 h-14 object-contain"
          />
          <div>
            <h3 class="text-lg font-bold text-white">{currentGameConfig.name}</h3>
            <p class="text-sm text-gray-400">
              Group: {currentGameConfig.groupStage.format} • Playoffs: {currentGameConfig.playoffs.format}
            </p>
          </div>
        </div>
        <button
          onclick={() => showRulesModal = true}
          class="bg-brand-purple/20 border border-brand-purple text-brand-purple hover:bg-brand-purple hover:text-white font-bold px-4 py-2 rounded-lg transition-all duration-300"
        >
          <svg class="w-4 h-4 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
          View Rules
        </button>
      </div>
    {/if}

    {#if tournamentState === 'registration'}
      <!-- Top Row: Tournament Status + Add Player Side by Side -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Tournament Status Dashboard -->
        <div class="glass rounded-lg p-4 shadow-xl border border-brand-cyan/20">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-bold text-brand-cyan">Tournament Status</h2>
            <span class="px-2 py-0.5 bg-brand-cyan/20 border border-brand-cyan rounded text-brand-cyan font-bold text-xs">
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
                  class="h-full bg-gradient-to-r from-brand-purple to-brand-cyan transition-all duration-500 ease-out shadow-lg"
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
              class="bg-gradient-to-r from-brand-purple to-brand-cyan hover:from-brand-cyan hover:to-brand-purple text-white font-bold px-4 py-2 text-sm rounded-lg shadow-glow-cyan transition-all duration-300 hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              disabled={!newPlayerName.trim()}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <!-- Start Button -->
      {#if players.length >= 4 && tournamentState === 'registration'}
        <div class="text-center space-y-2 py-3">
          <button
            onclick={handleStart}
            class="bg-gradient-to-r from-brand-purple via-brand-blue to-brand-cyan text-white font-black text-lg px-8 py-3 rounded-xl shadow-xl shadow-brand-purple/30 hover:shadow-brand-cyan/40 hover:scale-105 transition-all duration-500 animate-pulse-slow"
          >
            <svg class="w-5 h-5 inline-block mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
            START TOURNAMENT
          </button>
          <p class="text-gray-400 text-xs">Click to begin the group stage</p>
        </div>
      {:else if tournamentState !== 'registration'}
        <div class="text-center space-y-2 py-3">
          <div class="glass rounded-xl p-6 text-center shadow-xl">
            <svg class="w-8 h-8 mx-auto mb-2 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
            <p class="text-cyber-green font-bold text-sm">Tournament Started</p>
            <p class="text-gray-400 text-xs">Group stage is now active</p>
          </div>
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
        <h2 class="text-2xl font-bold mb-3 text-white">Tournament in Progress</h2>
        <p class="text-sm text-gray-400 mb-4">
          Current Stage: <span class="text-cyber-pink font-bold uppercase">{tournamentState}</span>
        </p>
        <a
          href={`/tournament/${tournamentId}/groups`}
          class="inline-block bg-gradient-to-r from-cyber-blue to-blue-500 text-white font-bold text-base px-6 py-3 rounded-xl shadow-glow-blue hover:scale-105 transition-all duration-300"
        >
          View Group Stage →
        </a>
      </div>
    {/if}

    <!-- Player Cards Grid - Always visible -->
    {#if players.length > 0}
      <div class="space-y-3">
        <h3 class="text-lg font-bold text-white text-center">
          {#if tournamentState === 'registration'}
            Registered Players
          {:else}
            Tournament Players
          {/if}
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {#each players as player, index}
            <div class="glass rounded-lg p-3 shadow-xl hover:shadow-cyber-green/20 hover:scale-105 transition-all duration-300 card-entrance relative overflow-hidden group" style="animation-delay: {index * 50}ms">
              <!-- Background Gradient -->
              <div class="absolute inset-0 bg-gradient-to-br {getPlayerGradient(index)} opacity-10 group-hover:opacity-20 transition-opacity"></div>

              <!-- Player Number Badge -->
              <div class="absolute top-1.5 right-1.5 w-6 h-6 bg-space-700 rounded-full flex items-center justify-center text-xs font-bold text-cyber-blue border border-space-600">
                {index + 1}
              </div>

              <!-- Player Avatar -->
              <div class="mb-2 relative flex justify-center">
                {#if player.profilePhoto}
                  <img
                    src={player.profilePhoto}
                    alt="Profile"
                    class="w-20 h-20 rounded-full object-cover"
                  />
                {:else}
                  <div class="w-12 h-12 rounded-full bg-gradient-to-br {getPlayerGradient(index)} flex items-center justify-center shadow-xl relative">
                    <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                    <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full shadow-lg shadow-green-500/50 border-2 border-space-900"></div>
                  </div>
                {/if}

                {#if tournamentState === 'registration'}
                  <button
                    onclick={() => startEditingPhoto(player.id)}
                    class="absolute -bottom-1 -right-1 w-6 h-6 bg-brand-cyan rounded-full flex items-center justify-center shadow-lg hover:bg-brand-cyan/80 transition-colors"
                    title="Edit profile photo"
                  >
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                  </button>
                  <button
                    onclick={(e) => { e.stopPropagation(); requestRemovePlayer(player.id); }}
                    class="absolute -bottom-8 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg hover:bg-red-400 transition-colors"
                    title="Remove player"
                  >
                    <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                {/if}
              </div>

              <!-- Player Name -->
              {#if editingPlayerId === player.id}
                <div class="mt-2 flex gap-1 items-center relative z-30 px-1">
                  <input
                    type="text"
                    bind:value={editingPlayerName}
                    class="w-16 px-1 py-1 rounded bg-space-700 text-xs text-white border border-cyber-green focus:outline-none focus:ring-1 focus:ring-cyber-green"
                    onkeydown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter') savePlayerName(player.id);
                      if (e.key === 'Escape') cancelEditingPlayer();
                    }}
                  />
                  <button onclick={() => savePlayerName(player.id)} class="p-0.5 bg-green-500 hover:bg-green-600 text-white rounded transition-colors" title="Save">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                  </button>
                  <button onclick={cancelEditingPlayer} class="p-0.5 bg-red-500 hover:bg-red-600 text-white rounded transition-colors" title="Cancel">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                  </button>
                </div>
              {:else}
                <div class="mb-2">
                  <div class="flex flex-col items-center">
                    <div class="flex items-center gap-1">
                      <h4 class="text-center text-sm font-bold text-white mb-0.5 truncate relative z-10">{player.name}</h4>
                      {#if tournamentState === 'registration'}
                        <button
                          type="button"
                          onclick={(e) => { e.stopPropagation(); startEditingPlayer(player.id); }}
                          class="p-1 rounded text-gray-400 hover:text-brand-cyan relative z-20"
                          title="Edit name"
                          aria-label="Edit player name"
                        >
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                          </svg>
                        </button>
                      {/if}
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Reset Button -->
    <div class="text-center pt-8 border-t border-space-600">
      <button
        onclick={requestReset}
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

{#if showConfetti}
  <div class="confetti-container">
    <!-- Confetti animation placeholder - could add canvas-confetti library -->
  </div>
{/if}

<!-- Photo Editing Modal -->
{#if showPhotoModal}
  <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="glass rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
      <!-- Modal Header -->
      <div class="flex items-center justify-between p-6 border-b border-space-600 flex-shrink-0">
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <svg class="w-5 h-5 text-cyber-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          Edit Profile Photo
        </h2>
        <button onclick={cancelPhotoEditing} class="p-2 hover:bg-space-700 rounded-lg transition-colors" aria-label="Close">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Modal Content -->
      <div class="p-6 overflow-y-auto flex-1 min-h-0">
        {#if !selectedFile}
          <!-- File Selection -->
          <div class="text-center py-8">
            <svg class="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            <h3 class="text-lg font-bold text-white mb-2">Upload Profile Photo</h3>
            <p class="text-gray-400 mb-6">Select an image file to crop and use as profile photo</p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,imagewebp"
              onchange={handleFileSelect}
              class="hidden"
              id="photo-upload"
            />
            <label
              for="photo-upload"
              class="inline-block bg-gradient-to-r from-cyber-blue to-blue-500 text-white font-bold px-6 py-3 rounded-lg shadow-glow-blue hover:scale-105 transition-all duration-300 cursor-pointer"
            >
              Choose Image
            </label>
          </div>
        {:else if imagePreview}
          <!-- Image Preview -->
          <div class="space-y-4">
            <div class="text-center">
              <h3 class="text-lg font-bold text-white mb-2">Preview</h3>
              <p class="text-gray-400 text-sm">This is how your profile photo will look</p>
            </div>

            <!-- Image Preview -->
            <div class="flex justify-center">
              <img
                src={imagePreview}
                alt="Profile avatar preview"
                class="w-32 h-32 rounded-full object-cover border-4 border-brand-cyan shadow-xl"
              />
            </div>

            <!-- Save Controls -->
            <div class="flex justify-center gap-3">
              <button
                onclick={savePlayerPhoto}
                class="bg-gradient-to-r from-brand-purple to-brand-cyan text-white font-bold px-6 py-3 rounded-lg shadow-glow-cyan hover:scale-105 transition-all duration-300"
              >
                Save Profile Photo
              </button>
              <button
                onclick={() => { selectedFile = null; imagePreview = null; }}
                class="bg-gray-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-gray-500 transition-colors"
              >
                Choose Different Image
              </button>
            </div>
          </div>
        {:else}
          <!-- Loading -->
          <div class="text-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-cyan mx-auto mb-4"></div>
            <p class="text-gray-400">Loading image...</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Error Popup Modal -->
{#if showErrorPopup}
  <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="glass rounded-xl max-w-md w-full shadow-2xl border border-red-500/30">
      <!-- Modal Header -->
      <div class="flex items-center gap-3 p-6 border-b border-space-600">
        <div class="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
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

<!-- Confirmation Popup Modal -->
{#if showConfirmPopup}
  <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="glass rounded-xl max-w-md w-full shadow-2xl border border-red-500/30">
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
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Game Rules Modal -->
{#if showRulesModal && currentGameConfig && gameType}
  <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="glass rounded-xl max-w-2xl w-full shadow-2xl border border-brand-purple/30 max-h-[90vh] overflow-y-auto">
      <!-- Modal Header -->
      <div class="flex items-center gap-4 p-6 border-b border-space-600 sticky top-0 bg-space-800/95 backdrop-blur-sm">
        <img 
          src={GAME_LOGOS[gameType]} 
          alt={currentGameConfig.name}
          class="w-20 h-12 object-contain"
        />
        <div class="flex-1">
          <h2 class="text-xl font-bold text-white">{currentGameConfig.name}</h2>
          <p class="text-gray-400 text-sm">Tournament Rules</p>
        </div>
        <button
          onclick={() => showRulesModal = false}
          class="p-2 rounded-full hover:bg-space-700 transition-colors"
          aria-label="Close rules modal"
        >
          <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      
      <!-- Modal Content -->
      <div class="p-6 space-y-6">
        <!-- Group Stage Rules -->
        <div class="space-y-3">
          <h3 class="text-lg font-bold text-brand-cyan flex items-center gap-2">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
            Group Stage
          </h3>
          <div class="bg-space-700/50 rounded-lg p-4 space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Format:</span>
              <span class="text-white font-medium">{currentGameConfig.groupStage.format}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Max Rounds:</span>
              <span class="text-white font-medium">{currentGameConfig.groupStage.maxRounds}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Ties Allowed:</span>
              <span class="text-white font-medium">{currentGameConfig.groupStage.tieAllowed ? 'Yes' : 'No'}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Score Type:</span>
              <span class="text-white font-medium capitalize">{currentGameConfig.groupStage.scoreType}</span>
            </div>
          </div>
        </div>

        <!-- Playoffs Rules -->
        <div class="space-y-3">
          <h3 class="text-lg font-bold text-brand-orange flex items-center gap-2">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 5a3 3 0 015-2.236A3 3 0 0114.83 6H16a2 2 0 110 4h-5V9a1 1 0 10-2 0v1H4a2 2 0 110-4h1.17C5.06 5.687 5 5.35 5 5zm4 1V5a1 1 0 10-1 1h1zm3 0a1 1 0 10-1-1v1h1z" clip-rule="evenodd"/><path d="M9 11H3v5a2 2 0 002 2h4v-7zm2 7h4a2 2 0 002-2v-5h-6v7z"/></svg>
            Playoffs
          </h3>
          <div class="bg-space-700/50 rounded-lg p-4 space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Format:</span>
              <span class="text-white font-medium">{currentGameConfig.playoffs.format}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Maps per Match:</span>
              <span class="text-white font-medium">{currentGameConfig.playoffs.mapsPerMatch}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Rounds per Map:</span>
              <span class="text-white font-medium">{currentGameConfig.playoffs.roundsPerMap}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Score Type:</span>
              <span class="text-white font-medium capitalize">{currentGameConfig.playoffs.scoreType}</span>
            </div>
          </div>
        </div>

        <!-- Game-Specific Rules -->
        <div class="space-y-3">
          <h3 class="text-lg font-bold text-cyber-green flex items-center gap-2">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
            Game Rules
          </h3>
          <ul class="space-y-2">
            {#each currentGameConfig.rules as rule}
              <li class="flex items-start gap-2 text-sm text-gray-300">
                <span class="text-brand-cyan mt-0.5">•</span>
                <span>{rule}</span>
              </li>
            {/each}
          </ul>
        </div>

        <!-- Map Pool -->
        {#if currentGameConfig.maps && currentGameConfig.maps.length > 0}
          <div class="space-y-3">
            <h3 class="text-lg font-bold text-brand-purple flex items-center gap-2">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
              Map Pool
            </h3>
            <div class="bg-space-700/50 rounded-lg p-4 space-y-3">
              <div class="flex flex-wrap gap-2">
                {#each currentGameConfig.maps as map}
                  <span class="px-3 py-1 bg-brand-purple/20 border border-brand-purple/40 rounded text-sm text-white font-medium">
                    {map}
                  </span>
                {/each}
              </div>
              <div class="pt-2 border-t border-space-600 space-y-1">
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-brand-cyan font-bold">Group Stage:</span>
                  <span class="text-gray-300">Random map selection</span>
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-brand-orange font-bold">Playoffs:</span>
                  <span class="text-gray-300">All 3 maps played (player-decided order)</span>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="p-6 border-t border-space-600">
        <button
          onclick={() => showRulesModal = false}
          class="w-full bg-gradient-to-r from-brand-purple to-brand-cyan text-white font-bold px-6 py-3 rounded-lg shadow-glow-cyan hover:scale-105 transition-all duration-300"
        >
          Got it!
        </button>
      </div>
    </div>
  </div>
{/if}
