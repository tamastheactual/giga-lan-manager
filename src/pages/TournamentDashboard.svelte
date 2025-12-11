<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, addPlayer, startGroupStage, startTeamGroupStage, resetTournament, updateTournamentName, updatePlayerName, updatePlayerPhoto, removePlayer, addTeam, removeTeam, updateTeam, isTeamGame, type GameType, type Team, GAME_CONFIGS } from '$lib/api';
  import { getPlayerImageUrl } from '$lib/playerImages';
  import { getTeamImageUrl, fileToBase64, validateImageFile } from '$lib/teamImages';
  import { getGameLogoUrl } from '$lib/gameLogos';
  import Footer from '../components/Footer.svelte';

  // Get logo for any game type dynamically
  function getGameLogo(gameType: GameType): string {
    const logoPath = GAME_CONFIGS[gameType]?.logo || '';
    return getGameLogoUrl(logoPath) || '';
  }

  let { tournamentId } = $props<{ tournamentId: string }>();
  let players = $state([] as any[]);
  let newPlayerName = $state('');
  let tournamentState = $state('registration');
  let tournamentName = $state('');
  let gameType = $state<GameType | null>(null);
  let showConfetti = $state(false);
  let showRulesModal = $state(false);
  let champion = $state(null) as any;
  let bracketMatches = $state([]) as any[];
  let createdAt = $state<string | null>(null);
  let startedAt = $state<string | null>(null);
  let mapPool = $state<string[]>([]);

  // Tournament settings (set when created)
  let groupStageRoundLimit = $state<number | undefined>(undefined);
  let playoffsRoundLimit = $state<number | undefined>(undefined);
  let useCustomPoints = $state<boolean>(false);

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

  // Team tournament state
  let isTeamBased = $state(false);
  let teams = $state<any[]>([]);
  let championTeam = $state<any>(null);
  let teamBracketMatches = $state<any[]>([]);
  let teamMatches = $state<any[]>([]);
  let newTeamName = $state('');
  let selectedPlayerIds = $state<string[]>([]);
  let showTeamModal = $state(false);
  let editingTeamId = $state<string | null>(null);
  let editingTeamName = $state('');
  let editingTeamPlayerIds = $state<string[]>([]);
  let editingTeamLogo = $state<string | null>(null);
  let teamLogoPreview = $state<string | null>(null);
  let teamLogoFile = $state<File | null>(null);

  // Computed: current game config
  const currentGameConfig = $derived(gameType ? GAME_CONFIGS[gameType] : null);
  const isKillBased = $derived(currentGameConfig?.groupStage.scoreType === 'kills');
  const isHealthBased = $derived(currentGameConfig?.groupStage.scoreType === 'health');
  
  // Computed: dynamic format strings based on actual tournament settings
  const groupStageFormatText = $derived.by(() => {
    if (!currentGameConfig) return '';
    const archetype = currentGameConfig.defaultArchetype;
    
    if (archetype === 'rounds' || archetype === 'team-rounds') {
      const roundLimit = groupStageRoundLimit ?? currentGameConfig.groupStage.maxRounds ?? 15;
      return `MR${roundLimit} (${roundLimit * 2} rounds)`;
    } else if (archetype === 'kills' || archetype === 'team-kills') {
      const maxScore = currentGameConfig.groupStage.maxScore;
      return maxScore ? `First to ${maxScore}` : currentGameConfig.groupStage.format;
    } else {
      return currentGameConfig.groupStage.format;
    }
  });
  
  const playoffsFormatText = $derived.by(() => {
    if (!currentGameConfig) return '';
    const archetype = currentGameConfig.defaultArchetype;
    const mapsPerMatch = currentGameConfig.playoffs.mapsPerMatch ?? 3;
    
    if (archetype === 'rounds') {
      const roundLimit = playoffsRoundLimit ?? currentGameConfig.playoffs.roundsPerMap ?? 12;
      return `BO${mapsPerMatch} (MR${roundLimit})`;
    } else {
      return `BO${mapsPerMatch}`;
    }
  });
  
  // Computed: team size constraints
  const minTeamSize = $derived(currentGameConfig?.minTeamSize ?? 2);
  const maxTeamSize = $derived(currentGameConfig?.maxTeamSize ?? 8);
  
  // Computed: unassigned players (not in any team)
  const unassignedPlayers = $derived.by(() => {
    const assignedIds = new Set(teams.flatMap(t => t.playerIds));
    return players.filter(p => !assignedIds.has(p.id));
  });

  function getPlayer(playerId: string) {
    return players.find(p => p.id === playerId);
  }

  function getRunnerUp() {
    const finals = bracketMatches.find((m: any) => m.bracketType === 'finals');
    if (!finals?.winnerId) return null;
    const loserId = finals.player1Id === finals.winnerId ? finals.player2Id : finals.player1Id;
    return getPlayer(loserId);
  }

  function getThirdPlace() {
    // For 3-participant tournaments, there's no 3rd place match
    // The 3rd place is the last person in the group standings
    if (players.length === 3) {
      // Sort players by points, then score diff, then total score
      const sortedPlayers = [...players].sort((a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        if ((b.scoreDifferential || 0) !== (a.scoreDifferential || 0)) return (b.scoreDifferential || 0) - (a.scoreDifferential || 0);
        return (b.totalGameScore || 0) - (a.totalGameScore || 0);
      });
      return sortedPlayers[2]; // 3rd place
    }
    
    // For 4+ participants, use the 3rd place match result
    const thirdPlaceMatch = bracketMatches.find((m: any) => m.bracketType === '3rd-place');
    if (!thirdPlaceMatch?.winnerId) return null;
    return getPlayer(thirdPlaceMatch.winnerId);
  }

  function getPlayerTotalScore(playerId: string) {
    const player = getPlayer(playerId);
    return player?.totalGameScore || 0;
  }

  function getPlayerMapsWon(playerId: string) {
    const player = getPlayer(playerId);
    return player?.wins || 0;
  }

  // Get team by ID
  function getTeam(teamId: string) {
    return teams.find((t: any) => t.id === teamId);
  }

  // Calculate full team stats from all matches (group + bracket)
  function getFullTeamStats(teamId: string) {
    let wins = 0;
    let losses = 0;
    let roundsWon = 0;
    let roundsLost = 0;
    
    // Group stage matches
    teamMatches.filter((m: any) => m.completed).forEach((match: any) => {
      if (match.team1Id === teamId) {
        roundsWon += match.team1Score || 0;
        roundsLost += match.team2Score || 0;
        if (match.winnerId === teamId) wins++;
        else if (match.winnerId) losses++;
      } else if (match.team2Id === teamId) {
        roundsWon += match.team2Score || 0;
        roundsLost += match.team1Score || 0;
        if (match.winnerId === teamId) wins++;
        else if (match.winnerId) losses++;
      }
    });
    
    // Bracket matches
    teamBracketMatches.filter((m: any) => m.winnerId).forEach((match: any) => {
      if (match.team1Id !== teamId && match.team2Id !== teamId) return;
      
      // Count series win/loss
      if (match.winnerId === teamId) wins++;
      else losses++;
      
      // Count rounds from each game
      if (match.games && Array.isArray(match.games)) {
        match.games.forEach((game: any) => {
          const team1Score = game.team1Score ?? 0;
          const team2Score = game.team2Score ?? 0;
          if (team1Score === 0 && team2Score === 0) return;
          
          if (match.team1Id === teamId) {
            roundsWon += team1Score;
            roundsLost += team2Score;
          } else {
            roundsWon += team2Score;
            roundsLost += team1Score;
          }
        });
      }
    });
    
    return { wins, losses, roundsWon, roundsLost };
  }

  // Get runner-up team (loser of finals)
  function getRunnerUpTeam() {
    const finals = teamBracketMatches.find((m: any) => m.bracketType === 'finals');
    if (!finals?.winnerId) return null;
    const loserId = finals.team1Id === finals.winnerId ? finals.team2Id : finals.team1Id;
    return getTeam(loserId);
  }

  // Get 3rd place team
  function getThirdPlaceTeam() {
    // For 3-team tournaments, there's no 3rd place match
    // The 3rd place is the last team in the group standings
    if (teams.length === 3) {
      // Sort teams by points, then round diff, then rounds won
      const sortedTeams = [...teams].sort((a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        const aDiff = (a.roundsWon || 0) - (a.roundsLost || 0);
        const bDiff = (b.roundsWon || 0) - (b.roundsLost || 0);
        if (bDiff !== aDiff) return bDiff - aDiff;
        return (b.roundsWon || 0) - (a.roundsWon || 0);
      });
      return sortedTeams[2]; // 3rd place
    }
    
    // For 4+ teams, use the 3rd place match result
    const thirdPlaceMatch = teamBracketMatches.find((m: any) => m.bracketType === '3rd-place');
    if (!thirdPlaceMatch?.winnerId) return null;
    return getTeam(thirdPlaceMatch.winnerId);
  }

  // Get ranked teams based on bracket results
  function getRankedTeams() {
    if (!championTeam) return [];
    
    const ranked = [];
    
    // 1st Place - Champion
    ranked.push({ ...championTeam, rank: 1 });
    
    // 2nd Place - Runner Up
    const runnerUpTeam = getRunnerUpTeam();
    if (runnerUpTeam) {
      ranked.push({ ...runnerUpTeam, rank: 2 });
    }
    
    // 3rd Place - Winner of 3rd place match
    const thirdPlaceTeam = getThirdPlaceTeam();
    if (thirdPlaceTeam) {
      ranked.push({ ...thirdPlaceTeam, rank: 3 });
    }
    
    // 4th Place - Loser of 3rd place match
    const thirdPlaceMatch = teamBracketMatches.find((m: any) => m.bracketType === '3rd-place');
    let fourthPlaceTeam = null;
    if (thirdPlaceMatch?.winnerId) {
      const loserId = thirdPlaceMatch.team1Id === thirdPlaceMatch.winnerId 
        ? thirdPlaceMatch.team2Id 
        : thirdPlaceMatch.team1Id;
      fourthPlaceTeam = getTeam(loserId);
      if (fourthPlaceTeam) {
        ranked.push({ ...fourthPlaceTeam, rank: 4 });
      }
    }
    
    // 5th+ Place - Rest of teams sorted by wins then round difference
    const topFourIds = [championTeam.id, runnerUpTeam?.id, thirdPlaceTeam?.id, fourthPlaceTeam?.id].filter(Boolean);
    const remainingTeams = teams
      .filter((t: any) => !topFourIds.includes(t.id))
      .sort((a: any, b: any) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return (b.roundsWon - b.roundsLost) - (a.roundsWon - a.roundsLost);
      })
      .map((t: any, index: number) => ({ ...t, rank: index + 5 }));
    
    return [...ranked, ...remainingTeams];
  }

  function getRankedPlayers() {
    if (!champion) return [];
    
    const ranked = [];
    
    // 1st Place - Champion
    ranked.push({ ...champion, rank: 1 });
    
    // 2nd Place - Runner Up
    const runnerUp = getRunnerUp();
    if (runnerUp) {
      ranked.push({ ...runnerUp, rank: 2 });
    }
    
    // 3rd Place - Winner of 3rd place match
    const thirdPlace = getThirdPlace();
    if (thirdPlace) {
      ranked.push({ ...thirdPlace, rank: 3 });
    }
    
    // 4th Place - Loser of 3rd place match
    const thirdPlaceMatch = bracketMatches.find((m: any) => m.bracketType === '3rd-place');
    let fourthPlace = null;
    if (thirdPlaceMatch?.winnerId) {
      const loserId = thirdPlaceMatch.player1Id === thirdPlaceMatch.winnerId 
        ? thirdPlaceMatch.player2Id 
        : thirdPlaceMatch.player1Id;
      fourthPlace = getPlayer(loserId);
      if (fourthPlace) {
        ranked.push({ ...fourthPlace, rank: 4 });
      }
    }
    
    // 5th+ Place - Rest of players sorted by score
    const topFourIds = [champion.id, runnerUp?.id, thirdPlace?.id, fourthPlace?.id].filter(Boolean);
    const remainingPlayers = players
      .filter(p => !topFourIds.includes(p.id))
      .sort((a, b) => (b.totalGameScore || 0) - (a.totalGameScore || 0))
      .map((p, index) => ({ ...p, rank: index + 5 }));
    
    return [...ranked, ...remainingPlayers];
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(dateString: string | null) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function loadState() {
    const data = await getState(tournamentId);
    players = data.players;
    tournamentState = data.state;
    tournamentName = data.name;
    gameType = data.gameType || null;
    champion = data.champion || null;
    bracketMatches = data.bracketMatches || [];
    createdAt = data.createdAt || null;
    startedAt = data.startedAt || null;
    mapPool = data.mapPool || [];
    // Tournament settings
    groupStageRoundLimit = data.groupStageRoundLimit;
    playoffsRoundLimit = data.playoffsRoundLimit;
    useCustomPoints = data.useCustomPoints || false;
    // Team data
    isTeamBased = data.isTeamBased || false;
    teams = data.teams || [];
    championTeam = data.championTeam || null;
    teamBracketMatches = data.teamBracketMatches || [];
    teamMatches = data.teamMatches || [];
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
    if (players.length === 2) {
      showConfetti = true;
      setTimeout(() => showConfetti = false, 3000);
    }
  }

  async function handleStart() {
    if (isTeamBased) {
      // Team tournament: need at least 2 teams
      if (teams.length < 2) {
        errorMessage = "Need at least 2 teams to start the tournament.";
        showErrorPopup = true;
        return;
      }
      // Check all teams have minimum players
      for (const team of teams) {
        if (team.playerIds.length < minTeamSize) {
          errorMessage = `Team "${team.name}" needs at least ${minTeamSize} players.`;
          showErrorPopup = true;
          return;
        }
      }
      await startTeamGroupStage(tournamentId);
    } else {
      // Solo tournament
      if (players.length === 11 || players.length === 13) {
        errorMessage = "Please add or remove 1 player. 11 and 13 player tournaments are not supported.";
        showErrorPopup = true;
        return;
      }
      await startGroupStage(tournamentId);
    }
    await loadState();
    window.location.href = `/tournament/${tournamentId}/groups`;
  }

  // Team management functions
  function openTeamModal(teamId?: string) {
    if (teamId) {
      // Edit existing team
      const team = teams.find(t => t.id === teamId);
      if (team) {
        editingTeamId = teamId;
        editingTeamName = team.name;
        editingTeamPlayerIds = [...team.playerIds];
        editingTeamLogo = team.logo || null;
        teamLogoPreview = team.logo || null;
      }
    } else {
      // Create new team
      editingTeamId = null;
      editingTeamName = '';
      editingTeamPlayerIds = [];
      editingTeamLogo = null;
      teamLogoPreview = null;
    }
    teamLogoFile = null;
    showTeamModal = true;
  }

  function closeTeamModal() {
    showTeamModal = false;
    editingTeamId = null;
    editingTeamName = '';
    editingTeamPlayerIds = [];
    editingTeamLogo = null;
    teamLogoPreview = null;
    teamLogoFile = null;
  }

  async function handleTeamLogoChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      errorMessage = validation.error || 'Invalid file';
      showErrorPopup = true;
      return;
    }

    teamLogoFile = file;
    const base64 = await fileToBase64(file);
    teamLogoPreview = base64;
    editingTeamLogo = base64;
  }

  function removeTeamLogo() {
    teamLogoFile = null;
    teamLogoPreview = null;
    editingTeamLogo = null;
  }

  function togglePlayerInTeam(playerId: string) {
    if (editingTeamPlayerIds.includes(playerId)) {
      editingTeamPlayerIds = editingTeamPlayerIds.filter(id => id !== playerId);
    } else {
      if (editingTeamPlayerIds.length < maxTeamSize) {
        editingTeamPlayerIds = [...editingTeamPlayerIds, playerId];
      }
    }
  }

  async function handleSaveTeam() {
    if (!editingTeamName.trim()) {
      errorMessage = 'Team name is required.';
      showErrorPopup = true;
      return;
    }
    if (editingTeamPlayerIds.length < minTeamSize) {
      errorMessage = `Team needs at least ${minTeamSize} players.`;
      showErrorPopup = true;
      return;
    }

    try {
      if (editingTeamId) {
        // Update existing team
        await updateTeam(tournamentId, editingTeamId, {
          name: editingTeamName.trim(),
          playerIds: editingTeamPlayerIds,
          logo: editingTeamLogo || undefined
        });
      } else {
        // Create new team
        await addTeam(tournamentId, editingTeamName.trim(), editingTeamPlayerIds, editingTeamLogo || undefined);
      }
      closeTeamModal();
      await loadState();
    } catch (e: any) {
      closeTeamModal();
      errorMessage = e.message || 'Failed to save team.';
      showErrorPopup = true;
    }
  }

  async function handleRemoveTeam(teamId: string) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    
    confirmTitle = 'Remove Team';
    confirmMessage = `Are you sure you want to remove team "${team.name}"?`;
    confirmButtonText = 'Remove';
    pendingAction = async () => {
      try {
        await removeTeam(tournamentId, teamId);
        await loadState();
      } catch (e: any) {
        errorMessage = e.message || 'Failed to remove team.';
        showErrorPopup = true;
      }
    };
    showConfirmPopup = true;
  }

  function getTeamPlayers(team: Team) {
    return team.playerIds.map(id => players.find(p => p.id === id)).filter(Boolean);
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

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 py-8 px-4 flex flex-col">
  <div class="w-full max-w-6xl mx-auto space-y-8">

    <!-- Header with Animated Title -->
    <div class="text-center py-3 space-y-2">
      <div class="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-2 justify-center">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
        </svg>
        Dashboard
      </div>
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
      <div class="glass rounded-lg p-4 shadow-xl border border-brand-purple/30">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-4">
            <img 
              src={getGameLogo(gameType)} 
              alt={currentGameConfig.name}
              class="w-24 h-14 object-contain"
            />
            <div>
              <h3 class="text-lg font-bold text-white">{currentGameConfig.name}</h3>
              <p class="text-sm text-gray-400">
                Group: {groupStageFormatText} • Playoffs: {playoffsFormatText}
              </p>
            </div>
          </div>
          <button
            onclick={() => showRulesModal = true}
            class="bg-brand-purple/20 border border-brand-purple text-brand-purple hover:bg-brand-purple hover:text-white font-bold px-4 py-2 rounded-lg transition-all duration-300"
          >
            <svg class="w-4 h-4 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
            VIEW RULES
          </button>
        </div>
        <div class="flex items-center gap-6 text-xs text-gray-400 border-t border-space-600 pt-2 mt-2">
          <div class="flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <span>Created: {formatDate(createdAt)}</span>
          </div>
          {#if startedAt}
            <div class="flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span>Started: {formatDateTime(startedAt)}</span>
            </div>
          {/if}
        </div>
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
                <span class="font-bold text-white">{players.length >= 2 ? 'Ready' : `Need ${2 - players.length} more`}</span>
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

      <!-- Team Management Section (for team-based games) -->
      {#if isTeamBased}
        <div class="glass rounded-lg p-4 shadow-xl border border-brand-orange/20">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-brand-orange">Teams</h3>
              <span class="text-xs text-gray-400">({teams.length} teams, {minTeamSize}-{maxTeamSize} players each)</span>
            </div>
            <button
              onclick={() => openTeamModal()}
              class="bg-gradient-to-r from-brand-orange to-brand-purple hover:from-brand-purple hover:to-brand-orange text-white font-bold px-3 py-1.5 text-sm rounded-lg shadow-glow-orange transition-all duration-300 hover:scale-105 inline-flex items-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Create Team
            </button>
          </div>

          {#if teams.length === 0}
            <div class="text-center py-6 text-gray-400">
              <svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <p class="text-sm">No teams created yet</p>
              <p class="text-xs mt-1">Add players first, then create teams</p>
            </div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              {#each teams as team}
                <div class="bg-space-700/50 rounded-lg p-3 border border-space-600 hover:border-brand-orange/50 transition-colors">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-3">
                      <img 
                        src={getTeamImageUrl(team)} 
                        alt="{team.name} logo" 
                        class="w-10 h-10 rounded-lg object-cover border-2 border-brand-purple/50 shadow-md flex-shrink-0"
                      />
                      <h4 class="font-bold text-white text-base">{team.name}</h4>
                    </div>
                    <div class="flex gap-1">
                      <button
                        onclick={() => openTeamModal(team.id)}
                        class="text-gray-400 hover:text-brand-cyan p-1 rounded transition-colors"
                        title="Edit team"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                      </button>
                      <button
                        onclick={() => handleRemoveTeam(team.id)}
                        class="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                        title="Remove team"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    {#each getTeamPlayers(team) as player}
                      <div class="flex items-center gap-1 bg-space-600 rounded px-2 py-0.5">
                        <img 
                          src={player.profilePhoto || getPlayerImageUrl(player.name)} 
                          alt={player.name} 
                          class="w-4 h-4 rounded-full object-cover"
                        />
                        <span class="text-xs text-gray-300">{player.name}</span>
                      </div>
                    {/each}
                    {#if team.playerIds.length < minTeamSize}
                      <span class="text-xs text-red-400 italic">Need {minTeamSize - team.playerIds.length} more</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          {#if unassignedPlayers.length > 0 && teams.length > 0}
            <div class="mt-3 pt-3 border-t border-space-600">
              <p class="text-xs text-gray-400 mb-2">
                <span class="text-yellow-400">⚠</span> {unassignedPlayers.length} unassigned {unassignedPlayers.length === 1 ? 'player' : 'players'}:
                <span class="text-gray-300">{unassignedPlayers.map(p => p.name).join(', ')}</span>
              </p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Start Button -->
      {#if tournamentState === 'registration'}
        {#if isTeamBased}
          <!-- Team tournament start conditions -->
          {#if teams.length >= 2 && teams.every(t => t.playerIds.length >= minTeamSize)}
            <div class="text-center space-y-2 py-3">
              <button
                onclick={handleStart}
                class="bg-gradient-to-r from-brand-purple via-brand-blue to-brand-cyan text-white font-black text-lg px-8 py-3 rounded-xl shadow-xl shadow-brand-purple/30 hover:shadow-brand-cyan/40 hover:scale-105 transition-all duration-500 animate-pulse-slow"
              >
                <svg class="w-5 h-5 inline-block mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
                START TEAM TOURNAMENT
              </button>
              <p class="text-gray-400 text-xs">Click to begin the team group stage</p>
            </div>
          {:else}
            <div class="glass rounded-xl p-6 text-center shadow-xl">
              <p class="text-gray-400 text-sm">
                <svg class="w-6 h-6 inline-block text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {#if teams.length < 2}
                  Need at least <span class="text-brand-orange font-bold text-lg">{2 - teams.length}</span> more {2 - teams.length === 1 ? 'team' : 'teams'} to start
                {:else}
                  Some teams need more players (min {minTeamSize} per team)
                {/if}
              </p>
            </div>
          {/if}
        {:else}
          <!-- Solo tournament start conditions -->
          {#if players.length >= 2}
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
          {:else}
            <div class="glass rounded-xl p-6 text-center shadow-xl">
              <p class="text-gray-400 text-sm">
                <svg class="w-6 h-6 inline-block text-cyber-green" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Need at least <span class="text-cyber-green font-bold text-lg">{2 - players.length}</span> more {2 - players.length === 1 ? 'player' : 'players'} to start
              </p>
            </div>
          {/if}
        {/if}
      {/if}

    {:else}
      <!-- Tournament In Progress or Completed -->
      {#if tournamentState === 'completed' && (champion || championTeam)}
        <!-- Tournament Completed -->
        <div class="glass rounded-xl p-6 mb-6 border border-brand-purple/30 relative overflow-hidden">
          <div class="absolute inset-0 bg-gradient-to-r from-brand-purple/10 via-brand-blue/10 to-brand-cyan/10"></div>
          <div class="relative z-10">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-2xl font-black mb-1 bg-gradient-to-r from-brand-purple via-brand-blue to-brand-cyan bg-clip-text text-transparent">
                  TOURNAMENT COMPLETED
                </h2>
                <p class="text-gray-400 text-sm">Final results and rankings</p>
              </div>
              <div class="w-16 h-16 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center shadow-xl shadow-brand-purple/50">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                </svg>
              </div>
            </div>
            
            {#if isTeamBased && championTeam}
              <!-- Team Champion Display -->
              {@const teamLogoSrc = championTeam.logo || getTeamImageUrl(championTeam.name)}
              {@const championStats = getFullTeamStats(championTeam.id)}
              <div class="flex items-center gap-6 mb-6 p-4 bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-yellow-500/20 rounded-xl border border-yellow-500/30">
                <!-- Team Logo -->
                <div class="relative">
                  <img 
                    src={teamLogoSrc} 
                    alt={championTeam.name} 
                    class="w-20 h-20 rounded-xl object-cover ring-4 ring-yellow-400 shadow-lg shadow-yellow-500/50"
                  />
                  <div class="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-lg">
                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clip-rule="evenodd"/></svg>
                  </div>
                </div>
                
                <!-- Team Info -->
                <div class="flex-1">
                  <p class="text-sm text-yellow-400 font-bold uppercase tracking-wider mb-1">Team Champions</p>
                  <h3 class="text-2xl font-black text-white mb-2">{championTeam.name}</h3>
                  
                  <!-- Team Members -->
                  <div class="flex flex-wrap gap-2">
                    {#each championTeam.playerIds as playerId}
                      {@const teamPlayer = players.find(p => p.id === playerId)}
                      {#if teamPlayer}
                        <span class="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs font-medium rounded-full border border-yellow-500/30">
                          {teamPlayer.name}
                        </span>
                      {/if}
                    {/each}
                  </div>
                </div>
                
                <!-- Stats -->
                <div class="text-right">
                  <p class="text-sm text-gray-400">Final Record</p>
                  <p class="text-xl font-bold text-white">{championStats.wins}W - {championStats.losses}L</p>
                  <p class="text-sm text-gray-400">
                    Rounds: {championStats.roundsWon} - {championStats.roundsLost}
                  </p>
                </div>
              </div>
            {:else if champion}
              <!-- Solo Champion Display -->
              {@const isBase64Photo = champion.profilePhoto && champion.profilePhoto.startsWith('data:')}
              {@const photoSrc = isBase64Photo ? champion.profilePhoto : getPlayerImageUrl(champion.name)}
              <div class="flex items-center gap-6 mb-6 p-4 bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-yellow-500/20 rounded-xl border border-yellow-500/30">
                <!-- Player Photo -->
                <div class="relative">
                  <img 
                    src={photoSrc} 
                    alt={champion.name} 
                    class="w-20 h-20 rounded-full object-cover ring-4 ring-yellow-400 shadow-lg shadow-yellow-500/50"
                  />
                  <div class="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-lg">
                    <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clip-rule="evenodd"/></svg>
                  </div>
                </div>
                
                <!-- Player Info -->
                <div class="flex-1">
                  <p class="text-sm text-yellow-400 font-bold uppercase tracking-wider mb-1">Tournament Champion</p>
                  <h3 class="text-2xl font-black text-white">{champion.name}</h3>
                </div>
                
                <!-- Stats -->
                <div class="text-right">
                  <p class="text-sm text-gray-400">Final Record</p>
                  <p class="text-xl font-bold text-white">{champion.wins ?? 0}W - {champion.losses ?? 0}L</p>
                </div>
              </div>
            {/if}
            
            <!-- View Statistics Button -->
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
      {:else}
        <!-- Tournament In Progress -->
        <div class="glass rounded-xl p-6 mb-6 border border-brand-purple/30 relative overflow-hidden">
          <div class="absolute inset-0 bg-gradient-to-r from-brand-purple/10 via-brand-blue/10 to-brand-cyan/10"></div>
          <div class="relative z-10">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h2 class="text-2xl font-black mb-1 bg-gradient-to-r from-brand-purple via-brand-blue to-brand-cyan bg-clip-text text-transparent">
                  TOURNAMENT IN PROGRESS
                </h2>
                <p class="text-gray-400 text-sm">
                  Current Stage: <span class="text-brand-cyan font-bold uppercase">{tournamentState === 'group' ? 'Group Stage' : tournamentState === 'playoffs' ? 'Playoffs' : tournamentState}</span>
                </p>
              </div>
              <div class="w-16 h-16 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center shadow-xl shadow-brand-purple/50">
                {#if tournamentState === 'playoffs'}
                  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                  </svg>
                {:else}
                  <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                  </svg>
                {/if}
              </div>
            </div>
            
            <!-- Navigation Button -->
            {#if tournamentState === 'group'}
              <a
                href={`/tournament/${tournamentId}/groups`}
                class="bg-gradient-to-r from-cyber-blue to-blue-500 text-white font-bold text-sm py-2 px-6 rounded-lg shadow-glow-blue hover:scale-105 transition-transform inline-flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
                View Group Stage
              </a>
            {:else if tournamentState === 'playoffs'}
              <a
                href={`/tournament/${tournamentId}/brackets`}
                class="bg-gradient-to-r from-brand-purple to-brand-cyan text-white font-bold text-sm py-2 px-6 rounded-lg shadow-glow-purple hover:scale-105 transition-transform inline-flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
                </svg>
                View Playoffs
              </a>
            {:else}
              <a
                href={`/tournament/${tournamentId}/groups`}
                class="bg-gradient-to-r from-cyber-blue to-blue-500 text-white font-bold text-sm py-2 px-6 rounded-lg shadow-glow-blue hover:scale-105 transition-transform inline-flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                View Tournament
              </a>
            {/if}
          </div>
        </div>
      {/if}
    {/if}

    <!-- Team Rankings for Team Tournaments (All States except registration) -->
    {#if isTeamBased && tournamentState !== 'registration' && teams.length > 0}
      <div class="space-y-6 mb-8">
        {#if tournamentState === 'completed' && championTeam}
          <h3 class="text-xl font-black text-center bg-gradient-to-r from-brand-orange via-brand-purple to-brand-blue bg-clip-text text-transparent">
            TEAM FINAL STANDINGS
          </h3>
        {:else}
          <h3 class="text-xl font-black text-center bg-gradient-to-r from-brand-orange via-brand-purple to-brand-blue bg-clip-text text-transparent">
            PARTICIPATING TEAMS
          </h3>
        {/if}
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {#each (tournamentState === 'completed' && championTeam ? getRankedTeams() : teams) as team, index}
            {@const isCompleted = tournamentState === 'completed' && championTeam}
            {@const isChampion = isCompleted && team.rank === 1}
            {@const isSecond = isCompleted && team.rank === 2}
            {@const isThird = isCompleted && team.rank === 3}
            {@const isFourth = isCompleted && team.rank === 4}
            {@const teamLogoSrc = team.logo || getTeamImageUrl(team.name)}
            {@const teamStats = getFullTeamStats(team.id)}
            
            <div class="glass rounded-xl p-4 shadow-xl hover:scale-102 transition-all duration-300 card-entrance relative overflow-hidden group
              {isChampion ? 'ring-4 ring-yellow-400 shadow-2xl shadow-yellow-500/50' : ''}
              {isSecond ? 'ring-4 ring-gray-400 shadow-2xl shadow-gray-400/50' : ''}
              {isThird ? 'ring-4 ring-orange-400 shadow-2xl shadow-orange-500/50' : ''}
            " style="animation-delay: {index * 50}ms">
              <!-- Background Gradient -->
              {#if isChampion}
                <div class="absolute inset-0 bg-gradient-to-br from-yellow-500/30 via-yellow-400/20 to-yellow-600/30 opacity-100 transition-opacity"></div>
              {:else if isSecond}
                <div class="absolute inset-0 bg-gradient-to-br from-gray-400/30 via-gray-300/20 to-gray-500/30 opacity-100 transition-opacity"></div>
              {:else if isThird}
                <div class="absolute inset-0 bg-gradient-to-br from-orange-500/30 via-orange-400/20 to-orange-600/30 opacity-100 transition-opacity"></div>
              {:else}
                <div class="absolute inset-0 bg-gradient-to-br {getPlayerGradient(index)} opacity-10 group-hover:opacity-20 transition-opacity"></div>
              {/if}
              
              <!-- Rank/Number Badge -->
              <div class="absolute top-2 right-2 w-10 h-10 rounded-full flex items-center justify-center text-base font-black border-2
                {isChampion ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-space-900 border-yellow-300' : ''}
                {isSecond ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-space-900 border-gray-200' : ''}
                {isThird ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white border-orange-300' : ''}
                {!isChampion && !isSecond && !isThird ? 'bg-space-700 text-cyber-blue border-space-600' : ''}
              ">
                {isCompleted ? team.rank : index + 1}
              </div>
              
              <!-- Status Badge -->
              {#if isCompleted}
                {#if isChampion}
                  <div class="absolute top-2 left-2 px-2 py-0.5 bg-yellow-500/90 backdrop-blur-sm text-yellow-900 text-xs font-black rounded-full border border-yellow-300">
                    CHAMPIONS
                  </div>
                {:else if isSecond}
                  <div class="absolute top-2 left-2 px-2 py-0.5 bg-gray-400/90 backdrop-blur-sm text-gray-900 text-xs font-black rounded-full border border-gray-300">
                    RUNNER-UP
                  </div>
                {:else if isThird}
                  <div class="absolute top-2 left-2 px-2 py-0.5 bg-orange-500/90 backdrop-blur-sm text-orange-900 text-xs font-black rounded-full border border-orange-300">
                    3RD PLACE
                  </div>
                {:else if isFourth}
                  <div class="absolute top-2 left-2 px-2 py-0.5 bg-space-600/90 backdrop-blur-sm text-gray-300 text-xs font-bold rounded-full border border-space-500">
                    4TH PLACE
                  </div>
                {/if}
              {/if}
              
              <div class="relative z-10 {isCompleted && (isChampion || isSecond || isThird || isFourth) ? 'mt-8' : 'mt-2'}">
                <!-- Team Header -->
                <div class="flex items-center gap-4 mb-4">
                  <!-- Team Logo -->
                  <img 
                    src={teamLogoSrc} 
                    alt={team.name} 
                    class="w-16 h-16 rounded-xl object-cover flex-shrink-0
                      {isChampion ? 'ring-4 ring-yellow-400 shadow-lg shadow-yellow-500/50' : ''}
                      {isSecond ? 'ring-4 ring-gray-400 shadow-lg shadow-gray-400/50' : ''}
                      {isThird ? 'ring-4 ring-orange-400 shadow-lg shadow-orange-500/50' : ''}
                    "
                  />
                  
                  <div class="flex-1">
                    <!-- Team Name -->
                    <h4 class="text-xl font-bold text-white mb-1">{team.name}</h4>
                    
                    <!-- Stats -->
                    <div class="flex items-center gap-3 text-sm">
                      <span class="text-green-400 font-bold">{teamStats.wins}W</span>
                      <span class="text-red-400 font-bold">{teamStats.losses}L</span>
                      <span class="text-gray-400">
                        Rounds: {teamStats.roundsWon}-{teamStats.roundsLost} 
                        <span class="{teamStats.roundsWon - teamStats.roundsLost >= 0 ? 'text-green-400' : 'text-red-400'}">
                          ({teamStats.roundsWon - teamStats.roundsLost >= 0 ? '+' : ''}{teamStats.roundsWon - teamStats.roundsLost})
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                
                <!-- Team Members with Photos -->
                <div class="border-t border-space-600/50 pt-3">
                  <p class="text-xs text-gray-500 uppercase tracking-wider mb-2">Team Members</p>
                  <div class="flex flex-wrap gap-2">
                    {#each team.playerIds as playerId}
                      {@const teamPlayer = players.find(p => p.id === playerId)}
                      {#if teamPlayer}
                        {@const isBase64 = teamPlayer.profilePhoto && teamPlayer.profilePhoto.startsWith('data:')}
                        {@const playerImg = isBase64 ? teamPlayer.profilePhoto : getPlayerImageUrl(teamPlayer.name)}
                        <div class="flex items-center gap-2 px-2 py-1 bg-space-700/50 rounded-lg border border-space-600/50">
                          <img 
                            src={playerImg} 
                            alt={teamPlayer.name}
                            class="w-6 h-6 rounded-full object-cover"
                          />
                          <span class="text-sm text-gray-300">{teamPlayer.name}</span>
                        </div>
                      {/if}
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Player Cards Grid - Show for solo tournaments, and for team tournaments only during registration -->
    {#if players.length > 0 && (!isTeamBased || tournamentState === 'registration')}
      <div class="space-y-6">
        {#if tournamentState === 'registration'}
          <h3 class="text-lg font-bold text-white text-center">
            Registered Players
          </h3>
        {:else if tournamentState === 'completed'}
          <h3 class="text-xl font-black text-center bg-gradient-to-r from-brand-orange via-brand-purple to-brand-blue bg-clip-text text-transparent">
            FINAL RANKINGS
          </h3>
        {:else}
          <h3 class="text-xl font-black text-center bg-gradient-to-r from-brand-orange via-brand-purple to-brand-blue bg-clip-text text-transparent">
            TOURNAMENT PLAYERS
          </h3>
        {/if}

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {#each (tournamentState === 'completed' && champion ? getRankedPlayers() : players) as player, index}
            {@const isCompleted = tournamentState === 'completed'}
            {@const isFirst = isCompleted && player.rank === 1}
            {@const isSecond = isCompleted && player.rank === 2}
            {@const isThird = isCompleted && player.rank === 3}
            {@const displayIndex = isCompleted ? player.rank : (index + 1)}
            
            <div class="glass rounded-lg p-3 shadow-xl hover:scale-105 transition-all duration-300 card-entrance relative overflow-hidden group
              {isFirst ? 'ring-4 ring-yellow-400 shadow-2xl shadow-yellow-500/50' : ''}
              {isSecond ? 'ring-4 ring-gray-400 shadow-2xl shadow-gray-400/50' : ''}
              {isThird ? 'ring-4 ring-orange-400 shadow-2xl shadow-orange-500/50' : ''}
            " style="animation-delay: {index * 50}ms">
              <!-- Background Gradient -->
              {#if isFirst}
                <div class="absolute inset-0 bg-gradient-to-br from-yellow-500/30 via-yellow-400/20 to-yellow-600/30 opacity-100 group-hover:opacity-100 transition-opacity"></div>
              {:else if isSecond}
                <div class="absolute inset-0 bg-gradient-to-br from-gray-400/30 via-gray-300/20 to-gray-500/30 opacity-100 group-hover:opacity-100 transition-opacity"></div>
              {:else if isThird}
                <div class="absolute inset-0 bg-gradient-to-br from-orange-500/30 via-orange-400/20 to-orange-600/30 opacity-100 group-hover:opacity-100 transition-opacity"></div>
              {:else}
                <div class="absolute inset-0 bg-gradient-to-br {getPlayerGradient(index)} opacity-10 group-hover:opacity-20 transition-opacity"></div>
              {/if}

              <!-- Rank/Number Badge -->
              <div class="absolute top-1.5 right-1.5 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black border-2
                {isFirst ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-space-900 border-yellow-300' : ''}
                {isSecond ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-space-900 border-gray-200' : ''}
                {isThird ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white border-orange-300' : ''}
                {!isFirst && !isSecond && !isThird ? 'bg-space-700 text-cyber-blue border-space-600' : ''}
              ">
                {displayIndex}
              </div>

              <!-- Champion Badge for 1st place -->
              {#if isFirst}
                <div class="absolute top-1.5 left-1.5 px-2 py-0.5 bg-yellow-500/90 backdrop-blur-sm text-yellow-900 text-xs font-black rounded-full border border-yellow-300">
                  CHAMPION
                </div>
              {/if}

              <!-- Player Avatar -->
              <div class="mb-2 relative flex justify-center {isFirst || isSecond || isThird ? 'mt-6' : ''}">
                {#if player}
                  {@const isBase64Photo = player.profilePhoto && player.profilePhoto.startsWith('data:')}
                  {@const imgSrc = isBase64Photo ? player.profilePhoto : getPlayerImageUrl(player.name)}
                  <img
                    src={imgSrc}
                    alt="Profile"
                    class="w-20 h-20 rounded-full object-cover
                      {isFirst ? 'ring-4 ring-yellow-400 shadow-lg shadow-yellow-500/50' : ''}
                      {isSecond ? 'ring-4 ring-gray-400 shadow-lg shadow-gray-400/50' : ''}
                      {isThird ? 'ring-4 ring-orange-400 shadow-lg shadow-orange-500/50' : ''}
                    "
                  />
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
                      <h4 class="text-center text-sm font-bold relative z-10
                        {isFirst ? 'text-yellow-400' : ''}
                        {isSecond ? 'text-gray-300' : ''}
                        {isThird ? 'text-orange-400' : ''}
                        {!isFirst && !isSecond && !isThird ? 'text-white' : ''}
                      ">{player.name}</h4>
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
<Footer />

{#if showConfetti}
  <div class="confetti-container">
    <!-- Confetti animation placeholder - could add canvas-confetti library -->
  </div>
{/if}

<!-- Photo Editing Modal -->
{#if showPhotoModal}
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && cancelPhotoEditing()} onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && e.target === e.currentTarget && cancelPhotoEditing()}>
    <div role="presentation" class="glass rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onclick={(e) => e.stopPropagation()}>
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
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && (showErrorPopup = false)} onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && e.target === e.currentTarget && (showErrorPopup = false)}>
    <div role="presentation" class="glass rounded-xl max-w-md w-full shadow-2xl border border-red-500/30" onclick={(e) => e.stopPropagation()}>
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
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && cancelConfirmation()} onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && e.target === e.currentTarget && cancelConfirmation()}>
    <div role="presentation" class="glass rounded-xl max-w-md w-full shadow-2xl border border-red-500/30" onclick={(e) => e.stopPropagation()}>
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
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && (showRulesModal = false)} onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && e.target === e.currentTarget && (showRulesModal = false)}>
    <div role="presentation" class="glass rounded-xl max-w-2xl w-full shadow-2xl border border-brand-purple/30 max-h-[90vh] overflow-y-auto" onclick={(e) => e.stopPropagation()}>
      <!-- Modal Header -->
      <div class="flex items-center gap-4 p-6 border-b border-space-600 sticky top-0 bg-space-800/95 backdrop-blur-sm">
        <img 
          src={getGameLogo(gameType)} 
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
        <!-- Tournament Mode -->
        <div class="flex items-center gap-3 p-3 bg-space-700/50 rounded-lg border border-space-600">
          <div class="w-10 h-10 rounded-full flex items-center justify-center {isTeamBased ? 'bg-brand-purple/30' : 'bg-brand-cyan/30'}">
            {#if isTeamBased}
              <svg class="w-5 h-5 text-brand-purple" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>
            {:else}
              <svg class="w-5 h-5 text-brand-cyan" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
            {/if}
          </div>
          <div>
            <p class="text-sm text-gray-400">Tournament Mode</p>
            <p class="text-white font-bold">{isTeamBased ? 'Team Tournament' : '1v1 Tournament'}</p>
          </div>
        </div>

        <!-- Group Stage Rules -->
        <div class="space-y-3">
          <h3 class="text-lg font-bold text-brand-cyan flex items-center gap-2">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
            Group Stage
          </h3>
          <div class="bg-space-700/50 rounded-lg p-4 space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Format:</span>
              <span class="text-white font-medium">{groupStageFormatText}</span>
            </div>
            {#if currentGameConfig.defaultArchetype === 'rounds'}
              <div class="flex justify-between text-sm">
                <span class="text-gray-400">Max Rounds per Half:</span>
                <span class="text-white font-medium">{groupStageRoundLimit ?? currentGameConfig.groupStage.maxRounds ?? 'N/A'}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-400">Total Rounds:</span>
                <span class="text-white font-medium">{(groupStageRoundLimit ?? currentGameConfig.groupStage.maxRounds ?? 15) * 2}</span>
              </div>
            {:else if currentGameConfig.groupStage.maxScore}
              <div class="flex justify-between text-sm">
                <span class="text-gray-400">Max Score:</span>
                <span class="text-white font-medium">{currentGameConfig.groupStage.maxScore}</span>
              </div>
            {/if}
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Score Type:</span>
              <span class="text-white font-medium capitalize">{currentGameConfig.groupStage.scoreType || currentGameConfig.defaultArchetype}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Ties Allowed:</span>
              <span class="text-white font-medium">{currentGameConfig.groupStage.tieAllowed ? 'Yes' : 'No'}</span>
            </div>
            {#if useCustomPoints}
              <div class="flex justify-between text-sm">
                <span class="text-gray-400">Scoring:</span>
                <span class="text-brand-cyan font-medium">Custom Points Enabled</span>
              </div>
            {/if}
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
              <span class="text-white font-medium">{playoffsFormatText}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Maps per Match:</span>
              <span class="text-white font-medium">{currentGameConfig.playoffs.mapsPerMatch}</span>
            </div>
            {#if currentGameConfig.defaultArchetype === 'rounds'}
              <div class="flex justify-between text-sm">
                <span class="text-gray-400">Rounds per Map (per Half):</span>
                <span class="text-white font-medium">{playoffsRoundLimit ?? currentGameConfig.playoffs.roundsPerMap ?? 'N/A'}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-400">Total Rounds per Map:</span>
                <span class="text-white font-medium">{(playoffsRoundLimit ?? currentGameConfig.playoffs.roundsPerMap ?? 10) * 2}</span>
              </div>
            {:else if currentGameConfig.playoffs.maxScorePerMap}
              <div class="flex justify-between text-sm">
                <span class="text-gray-400">Max Score per Map:</span>
                <span class="text-white font-medium">{currentGameConfig.playoffs.maxScorePerMap}</span>
              </div>
            {/if}
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Score Type:</span>
              <span class="text-white font-medium capitalize">{currentGameConfig.playoffs.scoreType || currentGameConfig.defaultArchetype}</span>
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
        {#if mapPool && mapPool.length > 0}
          <div class="space-y-3">
            <h3 class="text-lg font-bold text-brand-purple flex items-center gap-2">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
              Map Pool
            </h3>
            <div class="bg-space-700/50 rounded-lg p-4 space-y-3">
              <div class="flex flex-wrap gap-2">
                {#each mapPool as map}
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

<!-- Team Creation/Editing Modal -->
{#if showTeamModal}
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && closeTeamModal()} onkeydown={(e) => e.key === 'Escape' && closeTeamModal()}>
    <div role="presentation" class="glass rounded-xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onclick={(e) => e.stopPropagation()}>
      <!-- Modal Header -->
      <div class="flex items-center justify-between p-4 border-b border-space-600 flex-shrink-0">
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <svg class="w-5 h-5 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          {editingTeamId ? 'Edit Team' : 'Create Team'}
        </h2>
        <button onclick={closeTeamModal} class="p-2 hover:bg-space-700 rounded-lg transition-colors" aria-label="Close">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Modal Content -->
      <div class="p-4 overflow-y-auto flex-1 min-h-0 space-y-4">
        <!-- Team Logo and Name Row -->
        <div class="flex gap-4">
          <!-- Team Logo Upload -->
          <div class="flex-shrink-0">
            <label class="block text-sm font-bold text-gray-300 mb-1">Logo</label>
            <div class="relative group">
              <div class="w-20 h-20 rounded-lg bg-space-700 border-2 border-dashed border-space-500 flex items-center justify-center overflow-hidden cursor-pointer hover:border-brand-orange transition-colors">
                {#if teamLogoPreview}
                  <img src={teamLogoPreview} alt="Team logo" class="w-full h-full object-cover" />
                {:else}
                  <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                {/if}
                <input
                  type="file"
                  accept="image/*"
                  class="absolute inset-0 opacity-0 cursor-pointer"
                  onchange={handleTeamLogoChange}
                />
              </div>
              {#if teamLogoPreview}
                <button
                  type="button"
                  onclick={removeTeamLogo}
                  class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600 transition-colors shadow-lg"
                >
                  ×
                </button>
              {/if}
            </div>
            <p class="text-xs text-gray-500 mt-1 text-center">Max 2MB</p>
          </div>

          <!-- Team Name -->
          <div class="flex-1">
            <label for="team-name-input" class="block text-sm font-bold text-gray-300 mb-1">Team Name</label>
            <input
              id="team-name-input"
              type="text"
              bind:value={editingTeamName}
              placeholder="Enter team name..."
              class="w-full px-3 py-2 text-sm bg-space-700 border-2 border-space-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange text-white placeholder-gray-500 transition-all"
              maxlength="30"
            />
          </div>
        </div>

        <!-- Player Selection -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="block text-sm font-bold text-gray-300">
              Select Players ({editingTeamPlayerIds.length}/{maxTeamSize})
            </span>
            <span class="text-xs text-gray-400">Min {minTeamSize}, Max {maxTeamSize}</span>
          </div>
          
          {#if players.length === 0}
            <div class="text-center py-4 text-gray-400 text-sm">
              No players available. Add players first.
            </div>
          {:else}
            <div class="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {#each players as player}
                {@const isSelected = editingTeamPlayerIds.includes(player.id)}
                {@const isAssignedToOtherTeam = !isSelected && teams.some(t => t.id !== editingTeamId && t.playerIds.includes(player.id))}
                <button
                  onclick={() => !isAssignedToOtherTeam && togglePlayerInTeam(player.id)}
                  disabled={isAssignedToOtherTeam}
                  class="flex items-center gap-2 p-2 rounded-lg border-2 transition-all text-left
                    {isSelected ? 'border-brand-orange bg-brand-orange/20' : 'border-space-600 bg-space-700/50 hover:border-gray-500'}
                    {isAssignedToOtherTeam ? 'opacity-40 cursor-not-allowed' : ''}"
                >
                  <img 
                    src={player.profilePhoto || getPlayerImageUrl(player.name)} 
                    alt={player.name} 
                    class="w-8 h-8 rounded-full object-cover border border-space-500"
                  />
                  <div class="flex-1 min-w-0">
                    <span class="text-sm text-white font-medium truncate block">{player.name}</span>
                    {#if isAssignedToOtherTeam}
                      <span class="text-xs text-gray-500">In another team</span>
                    {/if}
                  </div>
                  {#if isSelected}
                    <svg class="w-5 h-5 text-brand-orange flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        {#if editingTeamPlayerIds.length < minTeamSize}
          <p class="text-xs text-yellow-400 flex items-center gap-1">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            Need {minTeamSize - editingTeamPlayerIds.length} more player(s)
          </p>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="p-4 border-t border-space-600 flex gap-2">
        <button
          onclick={closeTeamModal}
          class="flex-1 bg-space-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-space-500 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={handleSaveTeam}
          disabled={!editingTeamName.trim() || editingTeamPlayerIds.length < minTeamSize}
          class="flex-1 bg-gradient-to-r from-brand-orange to-brand-purple text-white font-bold px-4 py-2 rounded-lg shadow-glow-orange hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {editingTeamId ? 'Save Changes' : 'Create Team'}
        </button>
      </div>
    </div>
  </div>
{/if}