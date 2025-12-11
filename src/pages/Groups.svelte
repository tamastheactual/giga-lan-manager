<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, submitMatch, submitTeamMatchResult, generateBrackets, updateGroupName, resetGroupData, resetTournament, type GameType, GAME_CONFIGS, getEffectiveArchetype, type TeamGameResult, type PlayerGameStats } from '$lib/api';
  import { getPlayerImageUrl } from '$lib/playerImages';
  import { getTeamImageUrl } from '$lib/teamImages';
  import { getArchetypeConfig, type ScoreArchetype } from '$lib/gameArchetypes';
  import Footer from '../components/Footer.svelte';

  let { tournamentId } = $props<{ tournamentId: string }>();

  let isLoading = $state(true);
  let pods = $state([]) as any[];
  let matches = $state([]) as any[];
  let players = $state([]) as any[];
  let tournamentState = $state('');
  let currentRound = $state(1);
  let gameType = $state<GameType | null>(null);
  let mapPool = $state([]) as string[];
  let groupStageRoundLimit = $state<number | undefined>(undefined);
  let useCustomPoints = $state(false);

  // Team tournament support
  let isTeamBased = $state(false);
  let teams = $state([]) as any[];
  let teamPods = $state([]) as any[];
  let teamMatches = $state([]) as any[];
  // Aggregated player statistics (K/D) from server
  let playerStatistics = $state({}) as Record<string, { kills: number; deaths: number; kdRatio: number; gamesPlayed: number }>;

  // Score-based input state (player1Score, player2Score per match)
  let matchScores = $state({}) as Record<string, { player1Score: number; player2Score: number }>;
  let matchMaps = $state({}) as Record<string, string>; // Selected map per match
  
  // Player stats tracking for team matches (K/D per player per match)
  let matchPlayerStats = $state({}) as Record<string, Record<string, { kills: number; deaths: number }>>;
  // Expanded match for showing player stats
  let expandedMatchId = $state<string | null>(null);
  
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
  const effectiveArchetype = $derived<ScoreArchetype>(getEffectiveArchetype(gameType || 'cs16', useCustomPoints));
  const archetypeConfig = $derived(getArchetypeConfig(effectiveArchetype));
  const scoreLabel = $derived(archetypeConfig.scoreLabel);
  const scoreLabelShort = $derived(archetypeConfig.statLabelShort);
  const maxScore = $derived(groupStageRoundLimit !== undefined ? groupStageRoundLimit : gameConfig?.groupStage.maxScore); // Use custom limit if set
  const tieAllowed = $derived(archetypeConfig.tiesPossible);
  const isKillBased = $derived(effectiveArchetype === 'kills');
  const isHealthBased = $derived(effectiveArchetype === 'health');
  const isRoundsBased = $derived(effectiveArchetype === 'rounds');
  const isWinOnly = $derived(effectiveArchetype === 'winonly');
  const isPointsBased = $derived(effectiveArchetype === 'points');

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
    if (isTeamBased) {
      const pod = teamPods.find((p: any) => p.id === groupId);
      return pod?.name || `Group ${groupId}`;
    }
    const pod = pods.find(p => p.id === groupId);
    return pod?.name || `Group ${groupId}`;
  }
  
  // Reactive derived values using $derived.by for proper reactivity with state arrays
  let currentRoundMatches = $derived.by(() => {
    if (isTeamBased) {
      return teamMatches.filter((m: any) => m.round === currentRound);
    }
    return matches.filter(m => m.round === currentRound);
  });
  let groupsWithPlayers = $derived.by(() => isTeamBased ? getGroupsWithTeams() : getGroupsWithPlayers());
  // Get available rounds with fallback to [1] if empty
  let availableRounds = $derived.by(() => {
    const matchList = isTeamBased ? teamMatches : matches;
    const rounds = [...new Set(matchList.map((m: any) => m.round))].sort((a, b) => a - b);
    return rounds.length > 0 ? rounds : [1];
  });
  
  // Check if this is a 2-participant tournament that skipped group stage
  let hasNoGroupStage = $derived.by(() => {
    const participantCount = isTeamBased ? teams.length : players.length;
    const podsEmpty = isTeamBased ? teamPods.length === 0 : pods.length === 0;
    return participantCount === 2 && podsEmpty;
  });
  
  // Debug logging with $effect
  $effect(() => {
    console.log('[Groups] Reactive update - currentRound:', currentRound);
    console.log('[Groups] Reactive update - matches count:', isTeamBased ? teamMatches.length : matches.length);
    console.log('[Groups] Reactive update - currentRoundMatches count:', currentRoundMatches.length);
    console.log('[Groups] Reactive update - matchScores:', matchScores);
    console.log('[Groups] Reactive update - pods:', isTeamBased ? teamPods.length : pods.length);
    console.log('[Groups] Reactive update - isTeamBased:', isTeamBased);
  });

  // Track if we've done initial auto-advance
  let hasAutoAdvanced = $state(false);

  // Auto-advance to the first incomplete round on initial load only
  $effect(() => {
    const matchList = isTeamBased ? teamMatches : matches;
    if (!hasAutoAdvanced && matchList.length > 0) {
      // Find the first incomplete round
      const maxRound = Math.max(...availableRounds);
      for (let round = 1; round <= maxRound; round++) {
        const roundComplete = isTeamBased ? isTeamRoundComplete(round) : isRoundComplete(round);
        if (!roundComplete) {
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
      state: data.state,
      mapPoolLength: data.mapPool?.length || 0,
      useCustomPoints: data.useCustomPoints,
      groupStageRoundLimit: data.groupStageRoundLimit,
      gameType: data.gameType,
      isTeamBased: data.isTeamBased,
      teamsCount: data.teams?.length || 0,
      teamPodsCount: data.teamPods?.length || 0,
      teamMatchesCount: data.teamMatches?.length || 0,
      playerStatisticsCount: Object.keys(data.playerStatistics || {}).length
    });

    // With $state, direct assignment triggers reactivity
    pods = data.pods;
    matches = data.matches;
    players = data.players;
    tournamentState = data.state;
    gameType = data.gameType || 'cs16';
    mapPool = data.mapPool || [];
    groupStageRoundLimit = data.groupStageRoundLimit;
    useCustomPoints = data.useCustomPoints || false;
    
    // Team tournament data
    isTeamBased = data.isTeamBased || false;
    teams = data.teams || [];
    teamPods = data.teamPods || [];
    teamMatches = data.teamMatches || [];
    playerStatistics = data.playerStatistics || {};

    // For team tournaments, use teamMatches for score initialization
    const matchesToInit = isTeamBased ? teamMatches : matches;
    
    // Initialize scores from existing results, but preserve user-entered scores for incomplete matches
    matchesToInit.forEach((m: any) => {
        const existingScore = matchScores[m.id];
        const hasUserInput = existingScore && (existingScore.player1Score > 0 || existingScore.player2Score > 0);
        
        if (isTeamBased) {
            // Team matches store scores directly
            // Only update if match is completed OR user hasn't entered anything yet
            if (m.completed || !hasUserInput) {
                matchScores[m.id] = {
                    player1Score: m.team1Score ?? 0,
                    player2Score: m.team2Score ?? 0
                };
            }
            // Initialize player stats for team matches - preserve user input for incomplete matches
            const existingPlayerStats = matchPlayerStats[m.id];
            const hasPlayerStatsInput = existingPlayerStats && Object.values(existingPlayerStats).some((s: any) => s.kills > 0 || s.deaths > 0);
            
            if (!existingPlayerStats || (m.completed && !hasPlayerStatsInput)) {
              const team1 = teams.find((t: any) => t.id === m.team1Id);
              const team2 = teams.find((t: any) => t.id === m.team2Id);
              const allMembers = [...(team1?.members || []), ...(team2?.members || [])];
              const stats: Record<string, { kills: number; deaths: number }> = {};
              allMembers.forEach((pid: string) => {
                stats[pid] = { kills: 0, deaths: 0 };
              });
              // If match has games with playerStats, load them
              if (m.games && m.games[0]?.playerStats) {
                m.games[0].playerStats.forEach((ps: any) => {
                  if (stats[ps.playerId]) {
                    stats[ps.playerId] = { kills: ps.kills || 0, deaths: ps.deaths || 0 };
                  }
                });
              }
              matchPlayerStats[m.id] = stats;
            }
        } else if (m.result) {
            // Individual matches use result object - always load from completed results
            const p1Result = m.result[m.player1Id];
            const p2Result = m.result[m.player2Id];
            matchScores[m.id] = {
                player1Score: p1Result?.score ?? (p1Result?.points === 3 ? 16 : p1Result?.points === 1 ? 15 : 0),
                player2Score: p2Result?.score ?? (p2Result?.points === 3 ? 16 : p2Result?.points === 1 ? 15 : 0)
            };
        } else if (!hasUserInput) {
            // No result yet and no user input - initialize to 0
            matchScores[m.id] = { player1Score: 0, player2Score: 0 };
        }
        // Preserve user-entered scores for incomplete matches (don't overwrite)
        
        // Initialize map selection from match data
        if (m.mapName) {
            matchMaps[m.id] = m.mapName;
        }
    });

    console.log('[Groups] loadState() complete - matchScores:', matchScores);
    console.log('[Groups] loadState() complete - mapPool:', mapPool);
    
    // Ensure currentRound is valid after loading
    const loadedMatches = isTeamBased ? teamMatches : matches;
    if (loadedMatches.length > 0) {
      const rounds = [...new Set(loadedMatches.map((m: any) => m.round))].sort((a: number, b: number) => a - b);
      if (!rounds.includes(currentRound) && rounds.length > 0) {
        currentRound = rounds[0];
      }
    }
    
    isLoading = false;
  }

  function getPlayerName(id: string) {
    return players.find(p => p.id === id)?.name || 'Unknown';
  }

  function getPlayer(id: string) {
    return players.find(p => p.id === id);
  }
  
  // Team helper functions
  function getTeamName(id: string) {
    return teams.find((t: any) => t.id === id)?.name || 'Unknown Team';
  }
  
  function getTeam(id: string) {
    return teams.find((t: any) => t.id === id);
  }
  
  function getTeamPlayers(teamId: string): any[] {
    const team = getTeam(teamId);
    if (!team || !team.members) return [];
    return team.members.map((pid: string) => players.find(p => p.id === pid)).filter(Boolean);
  }
  
  function getPlayerStats(playerId: string) {
    return playerStatistics[playerId] || { kills: 0, deaths: 0, kdRatio: 0, gamesPlayed: 0 };
  }
  
  function getMatchPlayers(match: any): { team1Players: any[], team2Players: any[] } {
    return {
      team1Players: getTeamPlayers(match.team1Id),
      team2Players: getTeamPlayers(match.team2Id)
    };
  }
  
  function initPlayerStatsForMatch(matchId: string, match: any) {
    if (matchPlayerStats[matchId]) return;
    
    const { team1Players, team2Players } = getMatchPlayers(match);
    const stats: Record<string, { kills: number; deaths: number }> = {};
    
    [...team1Players, ...team2Players].forEach(p => {
      stats[p.id] = { kills: 0, deaths: 0 };
    });
    
    matchPlayerStats[matchId] = stats;
  }
  
  // Helper to update player K/D with clamping (max 999)
  function updatePlayerKD(matchId: string, playerId: string, stat: 'kills' | 'deaths', value: number) {
    if (!matchPlayerStats[matchId]) matchPlayerStats[matchId] = {};
    if (!matchPlayerStats[matchId][playerId]) matchPlayerStats[matchId][playerId] = { kills: 0, deaths: 0 };
    const clamped = Math.max(0, Math.min(999, value || 0));
    matchPlayerStats[matchId][playerId][stat] = clamped;
  }
  
  function getTeamMatchesForRound(round: number) {
    return teamMatches.filter((m: any) => m.round === round);
  }
  
  function isTeamRoundComplete(round: number) {
    const roundMatches = getTeamMatchesForRound(round);
    return roundMatches.length > 0 && roundMatches.every((m: any) => m.completed);
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
    // For UT2004, allow negative values (suicides), otherwise clamp to 0 minimum
    const minValue = gameType === 'ut2004' ? -999 : 0;
    // Only clamp to maxScore for rounds-based games without custom points
    const clampedValue = (isRoundsBased && maxScore !== undefined)
      ? Math.max(minValue, Math.min(value, maxScore)) 
      : Math.max(minValue, value);
    if (player === 'player1') {
      matchScores[matchId].player1Score = clampedValue;
    } else {
      matchScores[matchId].player2Score = clampedValue;
    }
  }

  // For win-only games: Set winner directly with W button
  function setWinner(matchId: string, winner: 'player1' | 'player2' | 'tie') {
    if (!matchScores[matchId]) {
      matchScores[matchId] = { player1Score: 0, player2Score: 0 };
    }
    if (winner === 'player1') {
      matchScores[matchId] = { player1Score: 1, player2Score: 0 };
    } else if (winner === 'player2') {
      matchScores[matchId] = { player1Score: 0, player2Score: 1 };
    } else {
      // Tie - both get 1 so it's recognized as valid
      matchScores[matchId] = { player1Score: 1, player2Score: 1 };
    }
  }

  function getMatchResult(matchId: string) {
    const scores = matchScores[matchId];
    if (!scores) return null;
    const { player1Score, player2Score } = scores;
    if (player1Score > player2Score) return 'player1';
    if (player2Score > player1Score) return 'player2';
    // For health-based games (Worms), 0-0 is a valid tie (mutual kill)
    // For win-only games with tie selected (1-1), it's a valid tie
    if (player1Score === player2Score && (player1Score > 0 || (tieAllowed && isHealthBased))) return 'tie';
    return null;
  }

  function isValidScore(matchId: string) {
    const scores = matchScores[matchId];
    if (!scores) return false;
    const { player1Score, player2Score } = scores;
    // For health-based games (Worms), 0-0 is valid (mutual kill/tie)
    // Need at least one score, unless it's a health-based game where 0-0 tie is valid
    if (player1Score === 0 && player2Score === 0 && !isHealthBased) return false;
    
    // If map pool exists AND match doesn't already have mapName, require map selection
    if (mapPool.length > 0 && !matchMaps[matchId]) {
      return false;
    }
    
    // Only enforce strict round rules for rounds-based games (CS, RtCW, Wolf:ET)
    // When useCustomPoints is true, isRoundsBased is false, so this won't run
    if (isRoundsBased) {
      const winScore = maxScore || 16; 
      const maxLoserScore = winScore - 1;
      
      if (player1Score > player2Score) {
        // Player 1 wins - must have exactly winScore, loser max winScore-1
        if (player1Score !== winScore || player2Score > maxLoserScore) return false;
      } else if (player2Score > player1Score) {
        // Player 2 wins - must have exactly winScore, loser max winScore-1
        if (player2Score !== winScore || player1Score > maxLoserScore) return false;
      } else {
        // Tie - only valid at maxLoserScore-maxLoserScore (e.g., 15-15 for MR15)
        if (player1Score !== maxLoserScore || player2Score !== maxLoserScore) return false;
      }
      return true;
    }
    
    // For non-rounds games: just check that ties are allowed if scores are equal
    if (!tieAllowed && player1Score === player2Score) return false;
    
    return true;
  }

  function getValidationError(matchId: string): string | null {
    const scores = matchScores[matchId];
    if (!scores) return null;
    const { player1Score, player2Score } = scores;
    
    if (player1Score === 0 && player2Score === 0) return null;
    
    // Check if map selection is required
    if (mapPool.length > 0 && !matchMaps[matchId]) {
      return 'Please select a map';
    }
    
    // Only enforce strict round rules for rounds-based games (applies to both solo and team)
    if (isRoundsBased) {
      const winScore = maxScore || 16;
      const maxLoserScore = winScore - 1;
      
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
      } else if (player1Score !== maxLoserScore || player2Score !== maxLoserScore) {
        return `Ties only valid at ${maxLoserScore}-${maxLoserScore}`;
      }
      return null;
    }
    
    // For non-rounds games, just check tie rules
    if (!tieAllowed && player1Score === player2Score) {
      return 'Ties not allowed - scores must be different';
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

      // Include selected map if available
      const selectedMap = matchMaps[matchId];
      const payload: any = { results };
      if (selectedMap) {
        payload.mapName = selectedMap;
      }

      console.log('[Groups] submitMatchResult - submitting:', payload);
      await submitMatch(tournamentId, matchId, results, selectedMap);
      console.log('[Groups] submitMatchResult - match submitted, reloading state');
      await loadState();
      console.log('[Groups] submitMatchResult complete');
  }
  
  // Submit team match result with player K/D stats
  async function submitTeamMatch(matchId: string, match: any) {
    console.log('[Groups] submitTeamMatch called:', matchId);
    const scores = matchScores[matchId];
    if (!scores) return;
    
    const { player1Score: team1Score, player2Score: team2Score } = scores;
    
    // Gather player stats
    const stats = matchPlayerStats[matchId] || {};
    const playerStats: PlayerGameStats[] = Object.entries(stats).map(([playerId, s]) => ({
      playerId,
      kills: s.kills || 0,
      deaths: s.deaths || 0
    }));
    
    // Create a game result for this match
    const selectedMap = matchMaps[matchId];
    const game: TeamGameResult = {
      gameNumber: 1,
      mapName: selectedMap || undefined,
      team1Score,
      team2Score,
      winnerTeamId: team1Score > team2Score ? match.team1Id : (team2Score > team1Score ? match.team2Id : ''),
      playerStats
    };
    
    try {
      await submitTeamMatchResult(tournamentId, matchId, team1Score, team2Score, [game]);
      console.log('[Groups] submitTeamMatch - submitted, reloading state');
      expandedMatchId = null;
      await loadState();
    } catch (error: any) {
      console.error('[Groups] Error submitting team match:', error);
      showError(error.message || 'Failed to submit team match result');
    }
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

  // Group teams by their pod/group (for team tournaments)
  function getGroupsWithTeams() {
    // For team tournaments, teamPods contain the groups
    const groups: Record<string, any[]> = {};
    
    console.log('[Groups] getGroupsWithTeams - teamPods:', teamPods);
    
    teamPods.forEach((pod: any) => {
      const groupKey = pod.id;
      if (!groups[groupKey]) groups[groupKey] = [];
      
      // Get teams directly from pod.teams
      pod.teams?.forEach((teamId: string) => {
        const team = getTeam(teamId);
        if (team && !groups[groupKey].find((t: any) => t.id === teamId)) {
          groups[groupKey].push(team);
        }
      });
    });
    
    console.log('[Groups] getGroupsWithTeams - groups:', groups);
    
    // Sort teams within each group by standings
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
        // Tiebreaker: round difference
        if ((b.roundDiff || 0) !== (a.roundDiff || 0)) return (b.roundDiff || 0) - (a.roundDiff || 0);
        if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
        return 0;
      });
    });
    
    return groups;
  }

  onMount(loadState);
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 text-gaming-text px-3 py-3 flex flex-col">
  <div class="max-w-6xl mx-auto w-full">
    
    <!-- Header -->
    <div class="flex justify-between items-center mb-3">
      <div>
        <a href={`/tournament/${tournamentId}`} class="text-gray-400 hover:text-cyber-green transition-colors mb-1 inline-block text-xs flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back
        </a>
        <div class="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          Groups
        </div>
      </div>
      
      {#if tournamentState === 'group' && (isTeamBased ? teamMatches.every((m: any) => m.completed) : matches.every(m => m.completed))}
        <button 
          onclick={handleGenerateBrackets}
          class="bg-gradient-to-r from-brand-orange to-brand-purple text-white font-bold text-xs py-1.5 px-4 rounded-lg shadow-glow-orange hover:scale-105 transition-transform flex items-center gap-1.5"
        >
          Playoffs
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </button>
      {/if}
    </div>
    
    <!-- No Group Stage Message (for 2-participant tournaments) -->
    {#if hasNoGroupStage}
      <div class="glass rounded-xl p-8 text-center">
        <div class="flex flex-col items-center gap-4">
          <div class="w-16 h-16 rounded-full bg-brand-cyan/20 flex items-center justify-center">
            <svg class="w-8 h-8 text-brand-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white mb-2">No Group Stage</h2>
            <p class="text-gray-400 mb-4">
              With only 2 {isTeamBased ? 'teams' : 'players'}, the tournament goes directly to the Grand Final!
            </p>
            <a 
              href={`/tournament/${tournamentId}/brackets`}
              class="inline-flex items-center gap-2 bg-gradient-to-r from-brand-orange to-brand-purple text-white font-bold py-2 px-6 rounded-lg hover:scale-105 transition-transform"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Go to Playoffs
            </a>
          </div>
        </div>
      </div>
    {:else}

    <!-- Round Progress -->
    <div class="glass rounded-lg p-2 mb-3">
      <div class="flex items-center gap-2">
        {#each availableRounds as round}
          <button 
            onclick={() => currentRound = round}
            class="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded {currentRound === round ? 'bg-brand-cyan/20 text-brand-cyan' : 'text-gray-500 hover:bg-space-700'} transition-all"
          >
            <div class="w-6 h-6 rounded-full border {(isTeamBased ? isTeamRoundComplete(round) : isRoundComplete(round)) ? 'bg-brand-cyan border-brand-cyan text-space-900' : currentRound === round ? 'border-brand-cyan' : 'border-gray-600'} flex items-center justify-center font-bold text-xs">
              {#if isTeamBased ? isTeamRoundComplete(round) : isRoundComplete(round)}
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
            <table class="w-full {isTeamBased ? 'text-sm' : 'text-xs'}">
              <thead>
                <tr class="{isTeamBased ? 'bg-space-700/50' : ''} border-b border-space-500">
                  <th class="text-left py-2 px-2 text-gray-300 font-bold {isTeamBased ? 'text-sm' : 'text-xs'}">#</th>
                  <th class="text-left py-2 px-2 text-gray-300 font-bold {isTeamBased ? 'text-sm' : 'text-xs'}">{isTeamBased ? 'Team' : 'Player'}</th>
                  <th class="text-center py-2 px-2 text-gray-300 font-bold {isTeamBased ? 'text-sm' : 'text-xs'}">P</th>
                  <th class="text-center py-2 px-2 text-gray-300 font-bold {isTeamBased ? 'text-sm' : 'text-xs'}">W</th>
                  <th class="text-center py-2 px-2 text-gray-300 font-bold {isTeamBased ? 'text-sm' : 'text-xs'}">D</th>
                  <th class="text-center py-2 px-2 text-gray-300 font-bold {isTeamBased ? 'text-sm' : 'text-xs'}">L</th>
                  {#if !isWinOnly}
                    <th class="text-center py-2 px-2 text-gray-300 font-bold {isTeamBased ? 'text-sm' : 'text-xs'}" title="{scoreLabel} - Tiebreaker">{isTeamBased ? 'RD' : scoreLabelShort}</th>
                  {/if}
                  <th class="text-center py-2 px-2 text-gray-300 font-bold {isTeamBased ? 'text-sm' : 'text-xs'}">Pts</th>
                </tr>
              </thead>
              <tbody>
                {#each groupPlayers as entity, index (entity.id)}
                  <tr class="{isTeamBased ? 'border-b border-space-500' : 'border-b border-space-700/50'} hover:bg-space-700/30 transition-colors {index === 0 && isTeamBased ? 'bg-gradient-to-r from-yellow-500/10 to-transparent' : index === 1 && isTeamBased ? 'bg-gradient-to-r from-gray-400/10 to-transparent' : ''}">
                    <td class="py-2 px-2">
                      <div class="{isTeamBased ? 'w-6 h-6 text-sm' : 'w-4 h-4 text-xs'} rounded-full flex items-center justify-center font-bold {index === 0 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-space-900 shadow-lg shadow-yellow-500/30' : index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-space-900' : index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white' : 'bg-space-600 text-gray-400'}">
                        {index + 1}
                      </div>
                    </td>
                    <td class="py-2 px-2 font-bold text-white {isTeamBased ? 'text-base' : 'text-xs'}">
                      <div class="flex items-center gap-2">
                        {#if isTeamBased}
                          <img src={getTeamImageUrl(entity)} alt="{entity.name}" class="w-8 h-8 rounded-lg object-cover border-2 border-brand-purple/50 shadow-md flex-shrink-0" />
                        {:else}
                          <img src={getPlayerImageUrl(entity.name)} alt="Profile" class="w-6 h-6 rounded-full object-cover inline-block" />
                        {/if}
                        <span class="{isTeamBased ? 'font-bold' : ''}">{entity.name}</span>
                      </div>
                    </td>                    
                    <td class="text-center py-2 px-2 text-gray-400 {isTeamBased ? 'text-base' : ''}">{(entity.wins || 0) + (entity.draws || 0) + (entity.losses || 0)}</td>
                    <td class="text-center py-2 px-2 text-cyber-green font-bold {isTeamBased ? 'text-base' : ''}">{entity.wins || 0}</td>
                    <td class="text-center py-2 px-2 text-yellow-500 font-bold {isTeamBased ? 'text-base' : ''}">{entity.draws || 0}</td>
                    <td class="text-center py-2 px-2 text-red-400 font-bold {isTeamBased ? 'text-base' : ''}">{entity.losses || 0}</td>
                    {#if !isWinOnly}
                      <td class="text-center py-2 px-2 text-brand-cyan font-bold {isTeamBased ? 'text-base' : ''}" title="{scoreLabel}">{entity.totalGameScore || entity.roundDiff || 0}</td>
                    {/if}
                    <td class="text-center py-2 px-2 text-cyber-green font-black {isTeamBased ? 'text-lg' : ''}">{entity.points || 0}</td>
                  </tr>
                  <!-- For team tournaments, show expanded player stats under each team -->
                  {#if isTeamBased && entity.members}
                    <tr class="bg-space-800/50 border-b border-space-600">
                      <td colspan={isWinOnly ? 7 : 8} class="py-3 px-2">
                        <div class="grid grid-cols-2 gap-2 w-full">
                          {#each entity.members as memberId}
                            {@const player = players.find(p => p.id === memberId)}
                            {@const stats = getPlayerStats(memberId)}
                            {#if player}
                              <div class="flex items-center gap-2 bg-space-700/80 rounded-lg px-3 py-2 border border-space-500 w-full">
                                <img src={getPlayerImageUrl(player.name)} alt="" class="w-6 h-6 rounded-full flex-shrink-0" />
                                <span class="text-gray-200 text-sm font-medium flex-1 truncate">{player.name}</span>
                                <span class="text-gray-400 text-xs font-medium">K/D</span>
                                <span class="text-cyber-green font-bold text-sm">{stats.kills}</span>
                                <span class="text-gray-500">/</span>
                                <span class="text-red-400 font-bold text-sm">{stats.deaths}</span>
                                {#if stats.gamesPlayed > 0}
                                  <span class="text-brand-cyan text-xs font-semibold">({stats.kdRatio.toFixed(2)})</span>
                                {/if}
                              </div>
                            {/if}
                          {/each}
                        </div>
                      </td>
                    </tr>
                  {/if}
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
      {#if isLoading}
        <div class="text-center py-8 text-gray-400">
          <svg class="animate-spin h-8 w-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading matches...
        </div>
      {:else if currentRoundMatches.length === 0}
        <div class="text-center py-8 text-gray-400">No matches found for this round</div>
      {:else}
      <div class="grid {isTeamBased ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'} gap-3">
        {#each currentRoundMatches as match (match.id)}
          {@const entity1 = isTeamBased ? getTeam(match.team1Id) : getPlayer(match.player1Id)}
          {@const entity2 = isTeamBased ? getTeam(match.team2Id) : getPlayer(match.player2Id)}
          {@const entity1Name = isTeamBased ? entity1?.name || 'Unknown Team' : entity1?.name || 'Unknown'}
          {@const entity2Name = isTeamBased ? entity2?.name || 'Unknown Team' : entity2?.name || 'Unknown'}
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
                <!-- Map Selection (if map pool exists or match has mapName) -->
                {#if (mapPool.length > 0 || match.mapName) && !match.completed}
                  <div class="mb-3">
                    <span class="block text-xs text-gray-400 mb-1">Map</span>
                    <select 
                      bind:value={matchMaps[match.id]}
                      class="w-full bg-space-600 border-2 border-space-500 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-cyan"
                    >
                      <option value="">Select Map</option>
                      {#each mapPool as map}
                        <option value={map}>{map}</option>
                      {/each}
                    </select>
                  </div>
                {:else if match.mapName}
                  <div class="mb-3 text-center">
                    <span class="text-xs px-2 py-1 bg-brand-cyan/20 text-brand-cyan rounded-full">{match.mapName}</span>
                  </div>
                {/if}
                
                <!-- Score Display Row -->
                <div class="flex items-center justify-center gap-3 mb-3">
                  {#if isWinOnly}
                    <!-- Win-Only Mode: W/T/W or W/W Buttons (T only if ties allowed) -->
                    {#if !match.completed}
                      <button
                        onclick={() => setWinner(match.id, 'player1')}
                        class="w-14 h-14 rounded-lg font-black text-xl transition-all {scores.player1Score > scores.player2Score ? 'bg-cyber-green text-black' : 'bg-space-600 hover:bg-space-500 text-white border-2 border-space-500 hover:border-cyber-green'}"
                      >
                        W
                      </button>
                      {#if tieAllowed}
                        <button
                          onclick={() => setWinner(match.id, 'tie')}
                          class="w-14 h-14 rounded-lg font-black text-xl transition-all {scores.player1Score === scores.player2Score && scores.player1Score > 0 ? 'bg-yellow-500 text-black' : 'bg-space-600 hover:bg-space-500 text-gray-400 border-2 border-space-500 hover:border-yellow-500'}"
                        >
                          T
                        </button>
                      {:else}
                        <span class="text-gray-500 font-bold">:</span>
                      {/if}
                      <button
                        onclick={() => setWinner(match.id, 'player2')}
                        class="w-14 h-14 rounded-lg font-black text-xl transition-all {scores.player2Score > scores.player1Score ? 'bg-cyber-green text-black' : 'bg-space-600 hover:bg-space-500 text-white border-2 border-space-500 hover:border-cyber-green'}"
                      >
                        W
                      </button>
                    {:else}
                      <!-- Completed Win-Only Match -->
                      <div class="w-14 h-14 rounded-lg flex items-center justify-center font-black text-xl {result === 'player1' ? 'bg-cyber-green text-black' : result === 'tie' ? 'bg-yellow-500/50 text-yellow-300' : 'bg-space-700 text-gray-500'}">
                        {result === 'player1' ? 'W' : result === 'tie' ? 'T' : 'L'}
                      </div>
                      {#if tieAllowed}
                        <div class="w-14 h-14 rounded-lg flex items-center justify-center font-black text-xl {result === 'tie' ? 'bg-yellow-500 text-black' : 'bg-space-700 text-gray-600'}">
                          {result === 'tie' ? 'T' : 'vs'}
                        </div>
                      {:else}
                        <span class="text-gray-500 font-bold">:</span>
                      {/if}
                      <div class="w-14 h-14 rounded-lg flex items-center justify-center font-black text-xl {result === 'player2' ? 'bg-cyber-green text-black' : result === 'tie' ? 'bg-yellow-500/50 text-yellow-300' : 'bg-space-700 text-gray-500'}">
                        {result === 'player2' ? 'W' : result === 'tie' ? 'T' : 'L'}
                      </div>
                    {/if}
                  {:else}
                    <!-- Standard Score Input Mode -->
                    <!-- Player 1 Score -->
                    <div class="flex-1 text-center">
                      {#if !match.completed}
                        <input
                          type="number"
                          min="0"
                          max={isRoundsBased ? maxScore : undefined}
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
                          max={isRoundsBased ? maxScore : undefined}
                          value={scores.player2Score || ''}
                          placeholder="0"
                          oninput={(e) => updateScore(match.id, 'player2', parseInt((e.target as HTMLInputElement).value) || 0)}
                          class="w-full text-center text-3xl font-black bg-space-600 border-2 {result === 'player2' ? 'border-cyber-green' : 'border-space-500'} rounded-lg py-2 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-cyan appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                        />
                      {:else}
                        <div class="text-3xl font-black {result === 'player2' ? 'text-cyber-green' : result === 'player1' ? 'text-gray-500' : 'text-yellow-500'}">{scores.player2Score}</div>
                      {/if}
                    </div>
                  {/if}
                </div>

                <!-- Player/Team Names Row -->
                <div class="flex items-center justify-between gap-3">
                  <!-- Entity 1 Info -->
                  <div class="flex-1 flex items-center gap-2 {result === 'player2' ? 'opacity-50' : ''}">
                    {#if !isTeamBased}
                      <img src={getPlayerImageUrl(entity1Name)} alt="Profile" class="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    {:else}
                      <img src={getTeamImageUrl(entity1)} alt="{entity1Name} logo" class="w-8 h-8 rounded-lg object-cover border border-brand-purple/50 flex-shrink-0" />
                    {/if}
                    <span class="font-bold {isTeamBased ? 'text-sm' : 'text-xs'} text-white truncate">{entity1Name}</span>
                    {#if result === 'player1'}
                      <svg class="w-4 h-4 text-cyber-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    {/if}
                  </div>
                  
                  <!-- Spacer -->
                  <div class="w-12"></div>
                  
                  <!-- Entity 2 Info -->
                  <div class="flex-1 flex items-center justify-end gap-2 {result === 'player1' ? 'opacity-50' : ''}">
                    {#if result === 'player2'}
                      <svg class="w-4 h-4 text-cyber-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    {/if}
                    <span class="font-bold {isTeamBased ? 'text-sm' : 'text-xs'} text-white truncate">{entity2Name}</span>
                    {#if !isTeamBased}
                      <img src={getPlayerImageUrl(entity2Name)} alt="Profile" class="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    {:else}
                      <img src={getTeamImageUrl(entity2)} alt="{entity2Name} logo" class="w-8 h-8 rounded-lg object-cover border border-brand-orange/50 flex-shrink-0" />
                    {/if}
                  </div>
                </div>

                <!-- Player K/D Stats (always shown for team matches) -->
                {#if isTeamBased}
                  {@const { team1Players, team2Players } = getMatchPlayers(match)}
                  <div class="mt-3 pt-3 border-t border-space-600">
                    <div class="text-xs text-gray-400 mb-2 font-semibold">Player Stats (K/D)</div>
                    <div class="grid grid-cols-2 gap-3">
                      <!-- Team 1 Players -->
                      <div class="bg-brand-purple/10 rounded-lg p-2 border border-brand-purple/20">
                        <div class="text-xs font-bold text-brand-purple mb-2 border-b border-brand-purple/20 pb-1">{entity1Name}</div>
                        {#each team1Players as player (player.id)}
                          <div class="flex items-center gap-2 mb-1.5">
                            <img src={getPlayerImageUrl(player.name)} alt="" class="w-5 h-5 rounded-full flex-shrink-0" />
                            <span class="text-xs text-gray-200 flex-1 truncate font-medium">{player.name}</span>
                            <div class="flex items-center gap-0.5">
                              {#if match.completed}
                                <span class="w-11 px-1 py-1 text-sm bg-space-700 rounded text-center text-cyber-green font-bold">{matchPlayerStats[match.id]?.[player.id]?.kills || 0}</span>
                                <span class="text-gray-500 font-bold">/</span>
                                <span class="w-11 px-1 py-1 text-sm bg-space-700 rounded text-center text-red-400 font-bold">{matchPlayerStats[match.id]?.[player.id]?.deaths || 0}</span>
                              {:else}
                                <input
                                  type="number"
                                  min="0"
                                  max="999"
                                  placeholder="K"
                                  class="w-11 px-1 py-1 text-sm bg-space-600 border border-cyber-green/30 rounded text-center text-cyber-green font-bold focus:border-cyber-green focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  value={matchPlayerStats[match.id]?.[player.id]?.kills || 0}
                                  onchange={(e) => {
                                    updatePlayerKD(match.id, player.id, 'kills', parseInt((e.target as HTMLInputElement).value));
                                    (e.target as HTMLInputElement).value = String(matchPlayerStats[match.id]?.[player.id]?.kills || 0);
                                  }}
                                />
                                <span class="text-gray-500 font-bold">/</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="999"
                                  placeholder="D"
                                  class="w-11 px-1 py-1 text-sm bg-space-600 border border-red-400/30 rounded text-center text-red-400 font-bold focus:border-red-400 focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  value={matchPlayerStats[match.id]?.[player.id]?.deaths || 0}
                                  onchange={(e) => {
                                    updatePlayerKD(match.id, player.id, 'deaths', parseInt((e.target as HTMLInputElement).value));
                                    (e.target as HTMLInputElement).value = String(matchPlayerStats[match.id]?.[player.id]?.deaths || 0);
                                  }}
                                />
                              {/if}
                            </div>
                          </div>
                        {/each}
                      </div>
                      
                      <!-- Team 2 Players -->
                      <div class="bg-brand-orange/10 rounded-lg p-2 border border-brand-orange/20">
                        <div class="text-xs font-bold text-brand-orange mb-2 border-b border-brand-orange/20 pb-1">{entity2Name}</div>
                        {#each team2Players as player (player.id)}
                          <div class="flex items-center gap-2 mb-1.5">
                            <img src={getPlayerImageUrl(player.name)} alt="" class="w-5 h-5 rounded-full flex-shrink-0" />
                            <span class="text-xs text-gray-200 flex-1 truncate font-medium">{player.name}</span>
                            <div class="flex items-center gap-0.5">
                              {#if match.completed}
                                <span class="w-11 px-1 py-1 text-sm bg-space-700 rounded text-center text-cyber-green font-bold">{matchPlayerStats[match.id]?.[player.id]?.kills || 0}</span>
                                <span class="text-gray-500 font-bold">/</span>
                                <span class="w-11 px-1 py-1 text-sm bg-space-700 rounded text-center text-red-400 font-bold">{matchPlayerStats[match.id]?.[player.id]?.deaths || 0}</span>
                              {:else}
                                <input
                                  type="number"
                                  min="0"
                                  max="999"
                                  placeholder="K"
                                  class="w-11 px-1 py-1 text-sm bg-space-600 border border-cyber-green/30 rounded text-center text-cyber-green font-bold focus:border-cyber-green focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  value={matchPlayerStats[match.id]?.[player.id]?.kills || 0}
                                  onchange={(e) => {
                                    updatePlayerKD(match.id, player.id, 'kills', parseInt((e.target as HTMLInputElement).value));
                                    (e.target as HTMLInputElement).value = String(matchPlayerStats[match.id]?.[player.id]?.kills || 0);
                                  }}
                                />
                                <span class="text-gray-500 font-bold">/</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="999"
                                  placeholder="D"
                                  class="w-11 px-1 py-1 text-sm bg-space-600 border border-red-400/30 rounded text-center text-red-400 font-bold focus:border-red-400 focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  value={matchPlayerStats[match.id]?.[player.id]?.deaths || 0}
                                  onchange={(e) => {
                                    updatePlayerKD(match.id, player.id, 'deaths', parseInt((e.target as HTMLInputElement).value));
                                    (e.target as HTMLInputElement).value = String(matchPlayerStats[match.id]?.[player.id]?.deaths || 0);
                                  }}
                                />
                              {/if}
                            </div>
                          </div>
                        {/each}
                      </div>
                    </div>
                  </div>
                {/if}

                <!-- Submit Button -->
                {#if !match.completed && isValidScore(match.id)}
                  <div class="mt-2 pt-2 border-t border-space-600">
                    {#if isTeamBased}
                      <button 
                        onclick={() => submitTeamMatch(match.id, match)}
                        class="w-full bg-gradient-to-r from-brand-cyan to-cyber-blue text-white font-bold py-2 px-3 rounded-lg text-sm hover:scale-102 transition-all shadow-lg shadow-brand-cyan/20"
                      >
                        Submit Result ({scores.player1Score} - {scores.player2Score})
                      </button>
                    {:else}
                      <button 
                        onclick={() => submitMatchResult(match.id, match)}
                        class="w-full bg-gradient-to-r from-brand-cyan to-cyber-blue text-white font-bold py-2 px-3 rounded-lg text-sm hover:scale-102 transition-all shadow-lg shadow-brand-cyan/20"
                      >
                        Submit Result ({scores.player1Score} - {scores.player2Score})
                      </button>
                    {/if}
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
      {/if}
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
    {/if}
  </div>
    
  <Footer />
</div>

<!-- Error Popup Modal -->
{#if showErrorPopup}
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && (showErrorPopup = false)} onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && e.target === e.currentTarget && (showErrorPopup = false)}>
    <div role="presentation" class="glass rounded-xl max-w-md w-full shadow-2xl border border-red-500/30" onclick={(e) => e.stopPropagation()}>
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
  <div role="button" tabindex="0" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={(e) => e.target === e.currentTarget && (showConfirmPopup = false)} onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && e.target === e.currentTarget && (showConfirmPopup = false)}>
    <div role="presentation" class="glass rounded-xl max-w-md w-full shadow-2xl border border-brand-cyan/30" onclick={(e) => e.stopPropagation()}>
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
