<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, updateBracketMatch, submitBracketGameResult, submitTeamBracketWinner, submitTeamBracketGameResult, type GameType, type Team, type TeamBracketMatch, type PlayerGameStats, type TeamGameResult, GAME_CONFIGS, getEffectiveArchetype } from '$lib/api';
  import { getPlayerImageUrl } from '$lib/playerImages';
  import { getTeamImageUrl } from '$lib/teamImages';
  import { getArchetypeConfig, type ScoreArchetype } from '$lib/gameArchetypes';
  import Confetti from '../components/Confetti.svelte';
  import Footer from '../components/Footer.svelte';

  let { tournamentId } = $props<{ tournamentId: string }>();

  // Add missing state variables
  let tournamentData = $state(null) as any;
  let loading = $state(true);
  let error = $state(null) as string | null;

  let bracketMatches = $state([]) as any[];
  let groupMatches = $state([]) as any[];
  let players = $state([]) as any[];
  let tournamentState = $state('');
  let champion = $state(null) as any;
  let gameType = $state<GameType | null>(null);
  let mapPool = $state([]) as string[];
  let playoffsRoundLimit = $state<number | undefined>(undefined);
  let useCustomPoints = $state(false);

  // Team tournament state
  let isTeamBased = $state(false);
  let teams = $state<Team[]>([]);
  let teamBracketMatches = $state<TeamBracketMatch[]>([]);
  let teamChampion = $state<Team | null>(null);

  // Player stats input for team games (per game) - OLD single game
  let editingPlayerStats = $state<Record<string, { kills: number; deaths: number }>>({});

  // BO3 match editing state
  let editingMatchId = $state<string | null>(null);
  let mapScores = $state<{ player1Score: number; player2Score: number }[]>([]);
  let selectedMaps = $state<string[]>([]); // Selected map per game in BO3

  // NEW: Modal state for team bracket matches
  let showTeamMatchModal = $state(false);
  let modalMatchId = $state<string | null>(null);
  // Per-game player stats: gameIndex -> playerId -> {kills, deaths}
  let modalGamePlayerStats = $state<Record<number, Record<string, { kills: number; deaths: number }>>>({});
  // Per-game scores: gameIndex -> {team1Score, team2Score} - undefined means not entered yet
  let modalGameScores = $state<Record<number, { team1Score?: number; team2Score?: number }>>({});
  // Per-game map selection
  let modalGameMaps = $state<Record<number, string>>({});
  // Per-game winner (for win-only mode)
  let modalGameWinners = $state<Record<number, 'team1' | 'team2' | null>>({});

  // Confetti state
  let showConfetti = $state(false);
  let winnerName = $state('');
  let tournamentComplete = $state(false);
  
  // Finals card height tracking
  let finalsCardHeight = $state(0);

  // Derived game config
  const gameConfig = $derived(gameType ? GAME_CONFIGS[gameType] : null);
  const mapsPerMatch = $derived(gameConfig?.playoffs.mapsPerMatch || 3);
  const maxScorePerMap = $derived(playoffsRoundLimit !== undefined ? playoffsRoundLimit : (gameConfig?.playoffs.maxScorePerMap || gameConfig?.groupStage.maxScore));
  const effectiveArchetype = $derived<ScoreArchetype>(getEffectiveArchetype(gameType || 'cs16', useCustomPoints));
  const archetypeConfig = $derived(getArchetypeConfig(effectiveArchetype));
  const scoreLabel = $derived(archetypeConfig.scoreLabel);
  const isKillBased = $derived(effectiveArchetype === 'kills');
  const isHealthBased = $derived(effectiveArchetype === 'health');
  const isRoundsBased = $derived(effectiveArchetype === 'rounds');
  const isWinOnly = $derived(effectiveArchetype === 'winonly');
  const isPointsBased = $derived(effectiveArchetype === 'points');

  // Add helper functions
  function getPlayer(playerId: string) {
    return players.find(p => p.id === playerId);
  }

  function getPlayerName(playerId: string) {
    return getPlayer(playerId)?.name || 'TBD';
  }

  // Team helper functions
  function getTeam(teamId: string): Team | undefined {
    return teams.find(t => t.id === teamId);
  }

  function getTeamName(teamId: string): string {
    return getTeam(teamId)?.name || 'TBD';
  }

  // Helper to get game score for entity1 (handles both team and player games)
  function getGameScore1(game: any): number {
    return isTeamBased ? (game.team1Score ?? 0) : (game.player1Score ?? 0);
  }
  
  // Helper to get game score for entity2 (handles both team and player games)
  function getGameScore2(game: any): number {
    return isTeamBased ? (game.team2Score ?? 0) : (game.player2Score ?? 0);
  }
  
  // Helper to get game winner ID (handles both team and player games)
  function getGameWinnerId(game: any): string | undefined {
    return isTeamBased ? game.winnerTeamId : game.winnerId;
  }

  // Universal entity helpers (work for both teams and players)
  function getEntityId1(match: any): string {
    return isTeamBased ? match.team1Id : match.player1Id;
  }
  
  function getEntityId2(match: any): string {
    return isTeamBased ? match.team2Id : match.player2Id;
  }
  
  function getEntityName(entityId: string): string {
    if (!entityId) return 'TBD';
    return isTeamBased ? getTeamName(entityId) : getPlayerName(entityId);
  }
  
  function getEntityImage(entityId: string): string {
    if (!entityId) return isTeamBased ? getTeamImageUrl(undefined) : getPlayerImageUrl('TBD');
    if (isTeamBased) {
      const team = getTeam(entityId);
      return getTeamImageUrl(team);
    }
    return getPlayerImageUrl(getPlayerName(entityId));
  }

  function getTeamPlayers(teamId: string): any[] {
    const team = getTeam(teamId);
    if (!team) return [];
    return team.playerIds.map(id => getPlayer(id)).filter(Boolean);
  }

  // Initialize player stats for editing (for team games)
  function initPlayerStatsForMatch(match: TeamBracketMatch) {
    const newStats: Record<string, { kills: number; deaths: number }> = {};
    const team1 = getTeam(match.team1Id || '');
    const team2 = getTeam(match.team2Id || '');
    
    if (team1) {
      team1.playerIds.forEach(playerId => {
        newStats[playerId] = { kills: 0, deaths: 0 };
      });
    }
    if (team2) {
      team2.playerIds.forEach(playerId => {
        newStats[playerId] = { kills: 0, deaths: 0 };
      });
    }
    editingPlayerStats = newStats;
  }

  // Get collected player stats as array
  function getPlayerStatsArray(): PlayerGameStats[] {
    return Object.entries(editingPlayerStats).map(([playerId, stats]) => ({
      playerId,
      kills: stats.kills,
      deaths: stats.deaths
    }));
  }

  // === TEAM MATCH MODAL FUNCTIONS ===
  
  // Get the current modal match
  function getModalMatch(): TeamBracketMatch | null {
    if (!modalMatchId) return null;
    return teamBracketMatches.find(m => m.id === modalMatchId) || null;
  }
  
  // Open the modal for a team match
  function openTeamMatchModal(matchId: string) {
    const match = teamBracketMatches.find(m => m.id === matchId);
    if (!match || match.winnerId) return;
    
    modalMatchId = matchId;
    showTeamMatchModal = true;
    
    // Initialize modal state if not already set for this match
    if (!modalGameScores[0]) {
      // Load existing game data if match has games already
      if (match.games && match.games.length > 0) {
        match.games.forEach((game: any, idx: number) => {
          modalGameScores[idx] = { team1Score: game.team1Score || 0, team2Score: game.team2Score || 0 };
          modalGameMaps[idx] = game.mapName || '';
          // Determine winner from scores
          if (game.winnerId) {
            modalGameWinners[idx] = game.winnerId === match.team1Id ? 'team1' : 'team2';
          }
          // Load player stats for this game
          if (game.playerStats && game.playerStats.length > 0) {
            if (!modalGamePlayerStats[idx]) modalGamePlayerStats[idx] = {};
            game.playerStats.forEach((ps: any) => {
              modalGamePlayerStats[idx][ps.playerId] = { kills: ps.kills || 0, deaths: ps.deaths || 0 };
            });
          }
        });
      } else {
        // Initialize empty data for all games (leave scores undefined for placeholder)
        for (let i = 0; i < mapsPerMatch; i++) {
          modalGameScores[i] = { team1Score: undefined, team2Score: undefined };
          modalGameMaps[i] = '';
          modalGameWinners[i] = null;
          modalGamePlayerStats[i] = {};
          
          // Initialize player stats
          const team1 = getTeam(match.team1Id || '');
          const team2 = getTeam(match.team2Id || '');
          if (team1) {
            team1.playerIds.forEach(pid => {
              modalGamePlayerStats[i][pid] = { kills: 0, deaths: 0 };
            });
          }
          if (team2) {
            team2.playerIds.forEach(pid => {
              modalGamePlayerStats[i][pid] = { kills: 0, deaths: 0 };
            });
          }
        }
      }
      // Trigger reactivity
      modalGameScores = { ...modalGameScores };
      modalGamePlayerStats = { ...modalGamePlayerStats };
      modalGameMaps = { ...modalGameMaps };
      modalGameWinners = { ...modalGameWinners };
    }
  }
  
  // Close the modal (data persists)
  function closeTeamMatchModal() {
    showTeamMatchModal = false;
    // Don't clear modalMatchId or data - keep it for persistence
  }
  
  // Update game score in modal
  function updateModalGameScore(gameIdx: number, team: 'team1' | 'team2', value: number) {
    if (!modalGameScores[gameIdx]) modalGameScores[gameIdx] = { team1Score: undefined, team2Score: undefined };
    const clampedValue = Math.max(0, Math.min(value, maxScorePerMap || 999));
    if (team === 'team1') {
      modalGameScores[gameIdx].team1Score = clampedValue;
    } else {
      modalGameScores[gameIdx].team2Score = clampedValue;
    }
    modalGameScores = { ...modalGameScores };
    
    // Auto-determine winner from scores
    const scores = modalGameScores[gameIdx];
    const t1 = scores.team1Score ?? 0;
    const t2 = scores.team2Score ?? 0;
    if (t1 > t2) {
      modalGameWinners[gameIdx] = 'team1';
    } else if (t2 > t1) {
      modalGameWinners[gameIdx] = 'team2';
    } else {
      modalGameWinners[gameIdx] = null; // Tie - no winner yet
    }
    modalGameWinners = { ...modalGameWinners };
  }
  
  // Get game winner from scores (derived) - validates proper win score for CS16
  function getModalGameWinner(gameIdx: number): 'team1' | 'team2' | null {
    const scores = modalGameScores[gameIdx];
    if (!scores) return null;
    const t1 = scores.team1Score ?? 0;
    const t2 = scores.team2Score ?? 0;
    
    // For CS16 playoffs: winner must have exactly maxScorePerMap rounds, loser max maxScorePerMap-1
    if (gameType === 'cs16') {
      const winScore = maxScorePerMap || 10;
      const maxLoserScore = winScore - 1;
      
      if (t1 === winScore && t2 <= maxLoserScore) return 'team1';
      if (t2 === winScore && t1 <= maxLoserScore) return 'team2';
      // Invalid score or incomplete
      return null;
    }
    
    // For other games, just compare scores
    if (t1 > t2) return 'team1';
    if (t2 > t1) return 'team2';
    return null;
  }
  
  // Update player stat in modal
  function updateModalPlayerStat(gameIdx: number, playerId: string, field: 'kills' | 'deaths', value: number) {
    if (!modalGamePlayerStats[gameIdx]) modalGamePlayerStats[gameIdx] = {};
    if (!modalGamePlayerStats[gameIdx][playerId]) modalGamePlayerStats[gameIdx][playerId] = { kills: 0, deaths: 0 };
    modalGamePlayerStats[gameIdx][playerId][field] = Math.max(0, value);
    modalGamePlayerStats = { ...modalGamePlayerStats };
  }
  
  // Get series score from modal data (based on round scores)
  function getModalSeriesScore() {
    let team1Wins = 0;
    let team2Wins = 0;
    for (let i = 0; i < mapsPerMatch; i++) {
      const winner = getModalGameWinner(i);
      if (winner === 'team1') team1Wins++;
      if (winner === 'team2') team2Wins++;
    }
    return { team1Wins, team2Wins };
  }
  
  // Check if a game has a tie (scores are equal but > 0)
  function isGameTie(gameIdx: number): boolean {
    const scores = modalGameScores[gameIdx];
    if (!scores) return false;
    const t1 = scores.team1Score ?? 0;
    const t2 = scores.team2Score ?? 0;
    return t1 === t2 && t1 > 0;
  }
  
  // Check if any game has a tie
  function hasAnyTie(): boolean {
    for (let i = 0; i < mapsPerMatch; i++) {
      if (isGameTie(i)) return true;
    }
    return false;
  }
  
  // Check if a game is ready for player stats input (map selected if pool exists, no tie)
  function isGameReadyForInput(gameIdx: number): boolean {
    // If there's a map pool, require map selection
    if (mapPool.length > 0 && !modalGameMaps[gameIdx]) return false;
    return true;
  }
  
  // Check for duplicate map selection in team modal
  function getModalDuplicateMapError(gameIdx: number): string | null {
    const selectedMap = modalGameMaps[gameIdx];
    if (!selectedMap) return null;
    
    // Check if this game has scores entered (meaning it's a played game)
    const scores = modalGameScores[gameIdx];
    if (!scores) return null;
    const t1 = scores.team1Score ?? 0;
    const t2 = scores.team2Score ?? 0;
    if (t1 === 0 && t2 === 0) return null;
    
    // Check if this map is selected for another game that also has scores
    for (let i = 0; i < mapsPerMatch; i++) {
      if (i === gameIdx) continue; // Skip self
      const otherScores = modalGameScores[i];
      if (!otherScores) continue;
      const ot1 = otherScores.team1Score ?? 0;
      const ot2 = otherScores.team2Score ?? 0;
      if (ot1 === 0 && ot2 === 0) continue;
      
      if (modalGameMaps[i] === selectedMap) {
        return `Map ${selectedMap} already used`;
      }
    }
    return null;
  }
  
  // Check if any game in modal has duplicate map
  function hasModalDuplicateMaps(): boolean {
    for (let i = 0; i < mapsPerMatch; i++) {
      if (getModalDuplicateMapError(i)) return true;
    }
    return false;
  }
  
  // Check if modal series can be submitted
  function canSubmitModalSeries(): boolean {
    // Check for ties first
    if (hasAnyTie()) return false;
    
    // Check for duplicate maps
    if (hasModalDuplicateMaps()) return false;
    
    const { team1Wins, team2Wins } = getModalSeriesScore();
    const needed = Math.ceil(mapsPerMatch / 2);
    return team1Wins >= needed || team2Wins >= needed;
  }
  
  // Submit the modal match result
  async function submitModalMatchResult() {
    if (!modalMatchId) return;
    const match = teamBracketMatches.find(m => m.id === modalMatchId);
    if (!match) return;
    
    const { team1Wins, team2Wins } = getModalSeriesScore();
    const needed = Math.ceil(mapsPerMatch / 2);
    if (team1Wins < needed && team2Wins < needed) return;
    
    const winnerId = team1Wins >= needed ? match.team1Id : match.team2Id;
    
    // Submit each game with player stats
    for (let i = 0; i < mapsPerMatch; i++) {
      const gameWinner = getModalGameWinner(i);
      if (!gameWinner) continue;
      
      const gameWinnerId = (gameWinner === 'team1' ? match.team1Id : match.team2Id) as string;
      const mapName = modalGameMaps[i] || `Game ${i + 1}`;
      const playerStats = Object.entries(modalGamePlayerStats[i] || {}).map(([playerId, stats]) => ({
        playerId,
        kills: stats.kills,
        deaths: stats.deaths
      }));
      
      await submitTeamBracketGameResult(tournamentId, modalMatchId, {
        gameNumber: i + 1,
        mapName,
        team1Score: modalGameScores[i]?.team1Score || 0,
        team2Score: modalGameScores[i]?.team2Score || 0,
        winnerTeamId: gameWinnerId,
        playerStats
      });
    }
    
    // Submit final winner
    await submitTeamBracketWinner(tournamentId, modalMatchId, winnerId!);
    
    // Reset modal state for this match
    modalGameScores = {};
    modalGamePlayerStats = {};
    modalGameMaps = {};
    modalGameWinners = {};
    closeTeamMatchModal();
    modalMatchId = null;
    
    await loadState();
  }

  function getRunnerUp() {
    if (isTeamBased) {
      const finals = teamBracketMatches.find((m: any) => m.bracketType === 'finals');
      if (!finals || !finals.winnerId) return null;
      const loserId = finals.team1Id === finals.winnerId ? finals.team2Id : finals.team1Id;
      return getTeam(loserId || '');
    }
    const finals = bracketMatches.find((m: any) => m.bracketType === 'finals');
    if (!finals || !finals.winnerId) return null;
    const loserId = finals.player1Id === finals.winnerId ? finals.player2Id : finals.player1Id;
    return getPlayer(loserId);
  }

  function getThirdPlace() {
    // For 3-participant tournaments, there's no 3rd place match
    // The 3rd place is the last person in the group standings
    const totalParticipants = isTeamBased ? teams.length : players.length;
    
    if (totalParticipants === 3) {
      if (isTeamBased) {
        // Sort teams by points, then round diff, then rounds won
        const sortedTeams = [...teams].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          const aDiff = (a.roundsWon || 0) - (a.roundsLost || 0);
          const bDiff = (b.roundsWon || 0) - (b.roundsLost || 0);
          if (bDiff !== aDiff) return bDiff - aDiff;
          return (b.roundsWon || 0) - (a.roundsWon || 0);
        });
        return sortedTeams[2]; // 3rd place
      } else {
        // Sort players by points, then score diff, then total score
        const sortedPlayers = [...players].sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if ((b.scoreDifferential || 0) !== (a.scoreDifferential || 0)) return (b.scoreDifferential || 0) - (a.scoreDifferential || 0);
          return (b.totalGameScore || 0) - (a.totalGameScore || 0);
        });
        return sortedPlayers[2]; // 3rd place
      }
    }
    
    // For 4+ participants, use the 3rd place match result
    if (isTeamBased) {
      const thirdPlaceMatch = teamBracketMatches.find((m: any) => m.bracketType === '3rd-place');
      if (!thirdPlaceMatch || !thirdPlaceMatch.winnerId) return null;
      return getTeam(thirdPlaceMatch.winnerId);
    }
    const thirdPlaceMatch = bracketMatches.find((m: any) => m.bracketType === '3rd-place');
    if (!thirdPlaceMatch || !thirdPlaceMatch.winnerId) return null;
    return getPlayer(thirdPlaceMatch.winnerId);
  }

  // Calculate total score (rounds/kills) for a player (group stage + bracket matches)
  function getPlayerTotalScore(playerId: string): number {
    let totalScore = 0;
    
    // Group stage matches
    groupMatches.forEach((match: any) => {
      if (!match.result || !match.completed) return;
      const result = match.result[playerId];
      if (result?.score !== undefined) {
        totalScore += result.score;
      }
    });
    
    // Bracket matches (BO3 - each map counts)
    bracketMatches.forEach((match: any) => {
      if (!match.winnerId) return;
      if (match.player1Id !== playerId && match.player2Id !== playerId) return;
      
      if (match.games && Array.isArray(match.games)) {
        match.games.forEach((game: any) => {
          if (game.player1Score === 0 && game.player2Score === 0) return;
          if (match.player1Id === playerId) {
            totalScore += game.player1Score || 0;
          } else if (match.player2Id === playerId) {
            totalScore += game.player2Score || 0;
          }
        });
      }
    });
    
    return totalScore;
  }
  
  // Get total maps won for a player
  function getPlayerMapsWon(playerId: string): number {
    let mapsWon = 0;
    
    // Group stage matches - each match is 1 map
    groupMatches.forEach((match: any) => {
      if (!match.result || !match.completed) return;
      const playerResult = match.result[playerId];
      const opponentId = match.player1Id === playerId ? match.player2Id : match.player1Id;
      const opponentResult = match.result[opponentId];
      if (playerResult?.score !== undefined && opponentResult?.score !== undefined) {
        if (playerResult.score > opponentResult.score) {
          mapsWon++;
        }
      }
    });
    
    // Bracket matches (BO3)
    bracketMatches.forEach((match: any) => {
      if (!match.winnerId) return;
      if (match.player1Id !== playerId && match.player2Id !== playerId) return;
      
      if (match.games && Array.isArray(match.games)) {
        match.games.forEach((game: any) => {
          if (game.player1Score === 0 && game.player2Score === 0) return;
          const isPlayer1 = match.player1Id === playerId;
          const playerScore = isPlayer1 ? game.player1Score : game.player2Score;
          const opponentScore = isPlayer1 ? game.player2Score : game.player1Score;
          if (playerScore > opponentScore) {
            mapsWon++;
          }
        });
      }
    });
    
    return mapsWon;
  }

  async function loadState() {
    try {
      loading = true;
      error = null;
      tournamentData = await getState(tournamentId);
      
      // Extract data from tournamentData
      bracketMatches = tournamentData.bracketMatches || [];
      groupMatches = tournamentData.matches || [];
      players = tournamentData.players || [];
      tournamentState = tournamentData.state || '';
      champion = tournamentData.champion || null;
      gameType = tournamentData.gameType || 'cs16';
      mapPool = tournamentData.mapPool || [];
      playoffsRoundLimit = tournamentData.playoffsRoundLimit;
      useCustomPoints = tournamentData.useCustomPoints || false;
      
      // Team tournament data
      isTeamBased = tournamentData.isTeamBased || false;
      teams = tournamentData.teams || [];
      teamBracketMatches = tournamentData.teamBracketMatches || [];
      
      // Check if tournament is complete and champion is declared
      checkForChampion();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load bracket data';
      console.error('Error loading bracket data:', err);
    } finally {
      loading = false;
    }
  }

  function checkForChampion() {
    // Handle team tournaments
    if (isTeamBased && tournamentData?.teamBracketMatches) {
      const finals = tournamentData.teamBracketMatches.find((m: any) => m.bracketType === 'finals');
      if (finals?.winnerId) {
        tournamentComplete = true;
        const winningTeam = getTeam(finals.winnerId);
        if (winningTeam) {
          winnerName = winningTeam.name;
          teamChampion = winningTeam;
          setTimeout(() => { showConfetti = true; }, 500);
        }
      } else {
        tournamentComplete = false;
        showConfetti = false;
      }
      return;
    }
    
    // Handle solo tournaments
    if (!tournamentData?.bracketMatches) return;

    // Find the finals match
    const finals = tournamentData.bracketMatches.find((m: any) => m.bracketType === 'finals');
    
    if (finals?.winnerId) {
      // Tournament champion declared
      tournamentComplete = true;
      const championPlayer = finals.player1Id === finals.winnerId 
        ? getPlayer(finals.player1Id) 
        : getPlayer(finals.player2Id);
      
      if (championPlayer) {
        winnerName = championPlayer.name;
        champion = championPlayer;
        // Show confetti after a brief delay for page load
        setTimeout(() => {
          showConfetti = true;
        }, 500);
      }
    } else {
      tournamentComplete = false;
      showConfetti = false;
    }
  }

async function handleDeclareWinner(matchId: string, winnerId: string) {
  if (!confirm('Are you sure you want to declare this player as the winner?')) return;
  
  try {
    await updateBracketMatch(tournamentId, matchId, winnerId, null);
    
    // Find winner name for confetti
    const match = bracketMatches.find(m => m.id === matchId); // Changed from allMatches
    const winner = match?.player1Id === winnerId 
      ? getPlayer(match.player1Id) 
      : match?.player2Id === winnerId 
        ? getPlayer(match.player2Id) 
        : null;
    
    if (winner) {
      winnerName = winner.name;
      showConfetti = true;
    }
    
    await loadState();
  } catch (error) {
    console.error('Failed to declare winner:', error);
    alert('Failed to declare winner');
  }
}

  // Universal wrapper functions that handle both team and solo
  function startEditing(matchId: string) {
    if (isTeamBased) {
      openTeamMatchModal(matchId);
    } else {
      startEditingMatch(matchId);
    }
  }

  async function submitResult() {
    if (isTeamBased) {
      await submitModalMatchResult();
    } else {
      await submitBO3Result();
    }
  }

  // BO3 Functions
  function startEditingMatch(matchId: string) {
    const match = bracketMatches.find(m => m.id === matchId);
    if (!match || match.winnerId) return;
    
    editingMatchId = matchId;
    // Initialize with existing scores or empty
    if (match.games && match.games.length > 0) {
      mapScores = match.games.map((g: any) => ({
        player1Score: g.player1Score || 0,
        player2Score: g.player2Score || 0
      }));
      selectedMaps = match.games.map((g: any) => g.mapName || '');
    } else {
      mapScores = Array(mapsPerMatch).fill(null).map(() => ({ player1Score: 0, player2Score: 0 }));
      selectedMaps = Array(mapsPerMatch).fill('');
    }
  }

  function cancelEditingMatch() {
    editingMatchId = null;
    mapScores = [];
    selectedMaps = [];
  }

  function updateMapScore(mapIndex: number, player: 'player1' | 'player2', value: number) {
    if (!mapScores[mapIndex]) {
      mapScores[mapIndex] = { player1Score: 0, player2Score: 0 };
    }
    // For UT2004, allow negative values (suicides), otherwise clamp to 0 minimum
    const minValue = gameType === 'ut2004' ? -999 : 0;
    // Only clamp to maxScorePerMap for rounds-based games without custom points
    const newValue = (isRoundsBased && maxScorePerMap !== undefined)
      ? Math.max(minValue, Math.min(value, maxScorePerMap)) 
      : Math.max(minValue, value);
    if (player === 'player1') {
      mapScores[mapIndex].player1Score = newValue;
    } else {
      mapScores[mapIndex].player2Score = newValue;
    }
    // Force reactivity
    mapScores = [...mapScores];
  }

  // Set winner for a specific map in win-only mode (BO3)
  function setMapWinner(mapIndex: number, winner: 'player1' | 'player2') {
    if (!mapScores[mapIndex]) {
      mapScores[mapIndex] = { player1Score: 0, player2Score: 0 };
    }
    if (winner === 'player1') {
      mapScores[mapIndex] = { player1Score: 1, player2Score: 0 };
    } else {
      mapScores[mapIndex] = { player1Score: 0, player2Score: 1 };
    }
    // Force reactivity
    mapScores = [...mapScores];
  }

  // Check for duplicate map selection (works for both score and win-only modes)
  function getDuplicateMapError(mapIndex: number): string | null {
    const selectedMap = selectedMaps[mapIndex];
    if (!selectedMap) return null;
    
    // Check if this game has a result (scores entered or winner selected)
    const scores = mapScores[mapIndex];
    if (!scores) return null;
    if (scores.player1Score === 0 && scores.player2Score === 0) return null;
    
    // Check if this map is selected for another game that also has scores
    for (let i = 0; i < mapScores.length; i++) {
      if (i === mapIndex) continue; // Skip self
      const otherScores = mapScores[i];
      if (!otherScores) continue;
      if (otherScores.player1Score === 0 && otherScores.player2Score === 0) continue;
      
      if (selectedMaps[i] === selectedMap) {
        return `Map ${selectedMap} already used`;
      }
    }
    return null;
  }

  function getMapWinner(mapIndex: number): 'player1' | 'player2' | null {
    const scores = mapScores[mapIndex];
    if (!scores) {
      console.log(`[Brackets] Map ${mapIndex} - no scores`);
      return null;
    }
    
    // For CS16 playoffs: winner must have exactly maxScorePerMap rounds, loser max maxScorePerMap-1
    if (gameType === 'cs16') {
      const winScore = maxScorePerMap || 10;
      const maxLoserScore = winScore - 1;
      
      if (scores.player1Score === winScore && scores.player2Score <= maxLoserScore) {
        console.log(`[Brackets] Map ${mapIndex} - player1 wins with`, scores);
        return 'player1';
      }
      if (scores.player2Score === winScore && scores.player1Score <= maxLoserScore) {
        console.log(`[Brackets] Map ${mapIndex} - player2 wins with`, scores);
        return 'player2';
      }
      // Invalid score or incomplete
      console.log(`[Brackets] Map ${mapIndex} - invalid/incomplete`, scores);
      return null;
    }
    
    // For other games, just compare scores
    if (scores.player1Score > scores.player2Score) return 'player1';
    if (scores.player2Score > scores.player1Score) return 'player2';
    return null;
  }

  function getSeriesScore(): { player1Wins: number; player2Wins: number } {
    let player1Wins = 0;
    let player2Wins = 0;
    mapScores.forEach((_, idx) => {
      const winner = getMapWinner(idx);
      if (winner === 'player1') player1Wins++;
      if (winner === 'player2') player2Wins++;
    });
    return { player1Wins, player2Wins };
  }

  function getSeriesWinner(): 'player1' | 'player2' | null {
    const { player1Wins, player2Wins } = getSeriesScore();
    const winsNeeded = Math.ceil(mapsPerMatch / 2); // 2 for BO3
    if (player1Wins >= winsNeeded) return 'player1';
    if (player2Wins >= winsNeeded) return 'player2';
    return null;
  }

  function canSubmitSeries(): boolean {
    // Must have a series winner
    const winner = getSeriesWinner();
    console.log('[Brackets] canSubmitSeries - winner:', winner, 'series score:', getSeriesScore());
    if (winner === null) return false;
    
    // Check for duplicate maps (no two games can have the same map)
    const selectedMapsList: string[] = [];
    for (let i = 0; i < mapScores.length; i++) {
      const scores = mapScores[i];
      if (!scores) continue;
      if (scores.player1Score === 0 && scores.player2Score === 0) continue;
      
      const selectedMap = selectedMaps[i];
      if (selectedMap) {
        // Check if this map was already selected for another game
        if (selectedMapsList.includes(selectedMap)) {
          console.log(`[Brackets] Map ${selectedMap} selected more than once`);
          return false;
        }
        selectedMapsList.push(selectedMap);
      }
    }
    
    // For CS16, validate all maps that have scores are valid
    if (gameType === 'cs16') {
      const winScore = maxScorePerMap || 10;
      const maxLoserScore = winScore - 1;
      
      for (let i = 0; i < mapsPerMatch; i++) {
        const scores = mapScores[i];
        if (!scores) continue;
        if (scores.player1Score === 0 && scores.player2Score === 0) continue;
        
        // If map has scores, it must be valid
        const isValidMap = 
          (scores.player1Score === winScore && scores.player2Score <= maxLoserScore) ||
          (scores.player2Score === winScore && scores.player1Score <= maxLoserScore);
        
        console.log(`[Brackets] Map ${i} validation:`, scores, 'valid:', isValidMap);
        if (!isValidMap) return false;
      }
    }
    
    console.log('[Brackets] canSubmitSeries - returning true');
    return true;
  }

  function getMapValidationError(mapIndex: number): string | null {
    const scores = mapScores[mapIndex];
    if (!scores) return null;
    if (scores.player1Score === 0 && scores.player2Score === 0) return null;
    
    const selectedMap = selectedMaps[mapIndex];
    
    // Check if this map is selected elsewhere
    if (selectedMap) {
      for (let i = 0; i < mapScores.length; i++) {
        if (i === mapIndex) continue; // Skip self
        const otherScores = mapScores[i];
        if (!otherScores) continue;
        if (otherScores.player1Score === 0 && otherScores.player2Score === 0) continue;
        
        if (selectedMaps[i] === selectedMap) {
          return `${selectedMap} already selected for another map`;
        }
      }
    }
    
    if (gameType === 'cs16') {
      const winScore = maxScorePerMap || 10;
      const maxLoserScore = winScore - 1;
      const { player1Score, player2Score } = scores;
      
      // Check for tie
      if (player1Score === player2Score) {
        return 'No ties';
      }
      
      // Check winner has exactly winScore
      if (player1Score > player2Score) {
        if (player1Score !== winScore) {
          return `Winner needs ${winScore}`;
        }
        if (player2Score > maxLoserScore) {
          return `Loser max ${maxLoserScore}`;
        }
      } else {
        if (player2Score !== winScore) {
          return `Winner needs ${winScore}`;
        }
        if (player1Score > maxLoserScore) {
          return `Loser max ${maxLoserScore}`;
        }
      }
    }
    
    return null;
  }

  async function submitBO3Result() {
    if (!editingMatchId) return;
    const match = bracketMatches.find(m => m.id === editingMatchId);
    if (!match) return;

    const seriesWinner = getSeriesWinner();
    if (!seriesWinner) return;

    // Submit each game result with scores
    for (let i = 0; i < mapScores.length; i++) {
      const scores = mapScores[i];
      if (!scores || (scores.player1Score === 0 && scores.player2Score === 0)) continue;
      
      const gameWinner = getMapWinner(i);
      if (!gameWinner) continue;
      
      const winnerId = gameWinner === 'player1' ? match.player1Id : match.player2Id;
      // Use selected map if available from map pool, otherwise use default
      const mapName = selectedMaps[i] || gameConfig?.maps?.[i] || `Map ${i + 1}`;
      
      await submitBracketGameResult(tournamentId, editingMatchId, {
        gameNumber: i + 1,
        mapName,
        player1Score: scores.player1Score,
        player2Score: scores.player2Score,
        winnerId
      });
    }
    
    // The server will automatically determine the series winner after game submissions
    // But we need to reload state to see the updated match
    await loadState();
    cancelEditingMatch();
  }

  // Team version of BO3 submission with player K/D stats
  async function submitTeamBO3Result() {
    if (!editingMatchId) return;
    const match = teamBracketMatches.find(m => m.id === editingMatchId);
    if (!match) return;

    const seriesWinner = getTeamSeriesWinner();
    if (!seriesWinner) return;

    // Submit each game result with scores and player stats
    for (let i = 0; i < mapScores.length; i++) {
      const scores = mapScores[i];
      if (!scores || (scores.player1Score === 0 && scores.player2Score === 0)) continue;
      
      const gameWinner = getTeamMapWinner(i);
      if (!gameWinner) continue;
      
      const winnerTeamId = gameWinner === 'team1' ? match.team1Id : match.team2Id;
      const mapName = selectedMaps[i] || gameConfig?.maps?.[i] || `Map ${i + 1}`;
      
      const gameResult: TeamGameResult = {
        gameNumber: i + 1,
        mapName,
        team1Score: scores.player1Score,
        team2Score: scores.player2Score,
        winnerTeamId: winnerTeamId || '',
        playerStats: getPlayerStatsArray()
      };
      
      await submitTeamBracketGameResult(tournamentId, editingMatchId, gameResult);
    }
    
    await loadState();
    cancelEditingMatch();
  }

  // Team-specific series scoring functions
  function getTeamMapWinner(mapIndex: number): 'team1' | 'team2' | null {
    const scores = mapScores[mapIndex];
    if (!scores) return null;
    if (scores.player1Score > scores.player2Score) return 'team1';
    if (scores.player2Score > scores.player1Score) return 'team2';
    return null;
  }

  function getTeamSeriesScore(): { team1Wins: number; team2Wins: number } {
    let team1Wins = 0;
    let team2Wins = 0;
    mapScores.forEach((_, idx) => {
      const winner = getTeamMapWinner(idx);
      if (winner === 'team1') team1Wins++;
      if (winner === 'team2') team2Wins++;
    });
    return { team1Wins, team2Wins };
  }

  function getTeamSeriesWinner(): 'team1' | 'team2' | null {
    const { team1Wins, team2Wins } = getTeamSeriesScore();
    const winsNeeded = Math.ceil(mapsPerMatch / 2);
    if (team1Wins >= winsNeeded) return 'team1';
    if (team2Wins >= winsNeeded) return 'team2';
    return null;
  }

  // Start editing a team match
  function startEditingTeamMatch(matchId: string) {
    const match = teamBracketMatches.find(m => m.id === matchId);
    if (!match || match.winnerId) return;
    
    editingMatchId = matchId;
    // Initialize with existing scores or empty
    if (match.games && match.games.length > 0) {
      mapScores = match.games.map((g: any) => ({
        player1Score: g.team1Score || 0,
        player2Score: g.team2Score || 0
      }));
      selectedMaps = match.games.map((g: any) => g.mapName || '');
    } else {
      mapScores = Array(mapsPerMatch).fill(null).map(() => ({ player1Score: 0, player2Score: 0 }));
      selectedMaps = Array(mapsPerMatch).fill('');
    }
    
    // Initialize player stats for K/D tracking
    initPlayerStatsForMatch(match);
  }

  // Solo tournament bracket functions
  function getRounds() {
      const rounds = [...new Set(bracketMatches.map(m => m.round))].sort((a, b) => a - b);
      return rounds;
  }

  function getMatchesForRound(round: number) {
      return bracketMatches.filter(m => m.round === round);
  }

  // Team tournament bracket functions
  function getTeamRounds() {
    const rounds = [...new Set(teamBracketMatches.map(m => m.round))].sort((a, b) => a - b);
    return rounds;
  }

  function getTeamMatchesForRound(round: number) {
    return teamBracketMatches.filter(m => m.round === round);
  }

  // Unified functions that work for both solo and team
  function getEffectiveRounds() {
    return isTeamBased ? getTeamRounds() : getRounds();
  }

  function getEffectiveMatchesForRound(round: number) {
    return isTeamBased ? getTeamMatchesForRound(round) : getMatchesForRound(round);
  }

  // Track tallest round to normalize column heights for alignment
  const maxMatchesInRound = $derived.by(() => {
    const rounds = getEffectiveRounds().filter(r => !getEffectiveMatchesForRound(r).every((m: any) => m.bracketType === '3rd-place'));
    if (rounds.length === 0) return 1;
    return Math.max(...rounds.map(r => getEffectiveMatchesForRound(r).filter((m: any) => m.bracketType !== '3rd-place').length || 1));
  });

  const baseMatchHeight = 260;
  const maxColumnHeight = $derived.by(() => Math.max(600, maxMatchesInRound * baseMatchHeight + 40));

  function getRoundLabel(round: number, totalRounds: number) {
    const roundMatches = getEffectiveMatchesForRound(round);
    const hasThirdPlace = roundMatches.some((m: any) => m.bracketType === '3rd-place');
    
    // Check bracket types in this round
    if (roundMatches.some((m: any) => m.bracketType === 'finals')) {
      return 'Finals';
    }
    if (roundMatches.some((m: any) => m.bracketType === 'semifinals')) {
      return 'Semifinals';
    }
    if (roundMatches.some((m: any) => m.bracketType === 'quarterfinals')) {
      return 'Quarterfinals';
    }
    if (hasThirdPlace) {
      return '3rd Place';
    }
    return `Round ${round}`;
  }

  // Draw connector lines from winner rows to their destination rows
  function drawConnectorLines() {
    // Remove any existing connector SVG
    const existingSvg = document.getElementById('bracket-connectors');
    if (existingSvg) existingSvg.remove();
    
    // Create SVG overlay that doesn't scroll with content
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'bracket-connectors';
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '5';
    svg.style.overflow = 'visible';
    
    const bracketContainer = document.querySelector('[data-bracket-container]');
    if (!bracketContainer) return;
    
    const scrollContainer = bracketContainer.querySelector('.flex.gap-16');
    if (!scrollContainer) return;
    
    (bracketContainer as HTMLElement).style.position = 'relative';
    scrollContainer.appendChild(svg);
    
    // Find all rows that have a next destination (winners AND losers)
    const allRows = document.querySelectorAll('[data-next-row-id]');
    
    allRows.forEach(sourceRow => {
      const nextRowId = sourceRow.getAttribute('data-next-row-id');
      if (!nextRowId) return;
      
      const targetRow = document.getElementById(nextRowId);
      if (!targetRow) return;
      
      const isWinner = sourceRow.getAttribute('data-is-winner') === 'true';
      
      const scrollRect = scrollContainer.getBoundingClientRect();
      const sourceRect = sourceRow.getBoundingClientRect();
      const targetRect = targetRow.getBoundingClientRect();
      
      // Calculate positions relative to scroll container's content (not viewport)
      const x1 = sourceRect.right - scrollRect.left;
      const y1 = sourceRect.top + sourceRect.height / 2 - scrollRect.top;
      const x2 = targetRect.left - scrollRect.left;
      const y2 = targetRect.top + targetRect.height / 2 - scrollRect.top;
      
      // Create L-shaped path: horizontal -> vertical -> horizontal
      // Break in the middle between the two cards
      const midX = (x1 + x2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      
      const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
      
      path.setAttribute('d', d);
      path.setAttribute('stroke', isWinner ? '#10b981' : '#f59e0b'); // Green for winners, amber for losers
      path.setAttribute('stroke-width', isWinner ? '2' : '3');
      // Make loser lines dashed to distinguish from winner lines when they overlap
      if (!isWinner) {
        path.setAttribute('stroke-dasharray', '8 4');
      }
      path.setAttribute('fill', 'none');
      path.style.transition = 'all 0.3s';
      
      svg.appendChild(path);
    });
    
    // Set SVG dimensions based on scroll content
    const scrollWidth = (scrollContainer as HTMLElement).scrollWidth;
    const scrollHeight = (scrollContainer as HTMLElement).scrollHeight;
    svg.style.width = `${scrollWidth}px`;
    svg.style.height = `${scrollHeight}px`;
  }
  
  // Redraw connectors when bracket data changes
  $effect(() => {
    if (bracketMatches.length > 0) {
      setTimeout(drawConnectorLines, 50);
    }
  });
  
  onMount(async () => {
    await loadState();
    // Draw connectors after DOM is ready
    setTimeout(drawConnectorLines, 100);
  });
  
  // Measure Finals card height dynamically
  $effect(() => {
    if (bracketMatches.length > 0) {
      setTimeout(() => {
        const finalsCard = document.querySelector('[data-finals-card="true"]')?.querySelector('.glass');
        if (finalsCard) {
          finalsCardHeight = finalsCard.getBoundingClientRect().height;
        }
      }, 100);
    }
  });
</script>

<!-- Update the template to include loading/error states -->
<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 text-gaming-text px-3 py-3 flex flex-col">
  <div class="max-w-6xl mx-auto w-full">
    
    <!-- Header -->
    <div class="flex justify-between items-center mb-3">
      <div>
        <a href={`/tournament/${tournamentId}/groups`} class="text-gray-400 hover:text-cyber-green transition-colors mb-1 inline-block text-xs flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back
        </a>
        <div class="text-sm font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/>
          </svg>
          Brackets
        </div>
      </div>
    </div>

    {#if loading}
      <div class="glass rounded-lg p-8 text-center">
        <div class="animate-spin w-12 h-12 border-4 border-cyber-blue border-t-transparent rounded-full mx-auto mb-4"></div>
        <p class="text-gray-400">Loading bracket data...</p>
      </div>
    {:else if error}
      <div class="glass rounded-lg p-8 text-center">
        <svg class="w-12 h-12 mx-auto mb-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-red-400">{error}</p>
      </div>
    {:else if tournamentState !== 'playoffs' && tournamentState !== 'completed'}
      <div class="glass rounded-lg p-8 text-center">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <p class="text-base text-gray-400 mb-1">Playoffs have not started yet</p>
        <p class="text-gray-500 text-xs">Complete the group stage to generate brackets</p>
      </div>
    {:else}
      
      <!-- Immersive Champion Podium (Team or Solo) -->
      {#if champion || teamChampion}
        {@const displayChampion = isTeamBased ? teamChampion : champion}
        {@const displayName = isTeamBased ? teamChampion?.name : champion?.name}
        <div class="mb-4">
          <!-- Trophy Header -->
          <div class="text-center mb-0">
            <div class="relative inline-block">
              <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 flex items-center justify-center shadow-xl ring-4 ring-yellow-400/30">
                <span class="text-4xl">🏆</span>
              </div>
            </div>
            <h2 class="text-2xl font-black mb-2 bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500 bg-clip-text text-transparent">
              TOURNAMENT CHAMPION
            </h2>
          </div>

          <!-- Professional Podium Layout -->
          <div class="w-full max-w-6xl mx-auto">
            <div class="relative">
              <!-- Podium Container with proper centering -->
              <div class="flex justify-center items-end gap-0 px-4 py-8">
                <!-- 2nd Place (Left) - Shorter -->
                {#if getRunnerUp()}
                  {@const runnerUp = getRunnerUp()}
                  <div class="flex flex-col items-center relative z-10">
                    <!-- Pillar -->
                    <div class="flex flex-col items-center">
                      <!-- Card -->
                      <div class="glass rounded-t-2xl p-6 text-center relative overflow-hidden w-56 mb-0">
                        <div class="absolute inset-0 bg-gradient-to-br from-gray-400/15 via-gray-300/5 to-gray-500/15"></div>
                        <div class="relative z-10">
                          <!-- Medal Ring -->
                          <div class="mb-4">
                            <div class="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shadow-xl ring-4 ring-gray-400/40 border-2 border-gray-200">
                              {#if isTeamBased}
                                <img src={getTeamImageUrl(runnerUp)} alt={runnerUp.name} class="w-20 h-20 rounded-full object-cover" />
                              {:else}
                                <img src={getPlayerImageUrl(runnerUp.name)} alt={runnerUp.name} class="w-20 h-20 rounded-full object-cover" />
                              {/if}
                            </div>
                          </div>
                          <!-- Name -->
                          <h4 class="text-lg font-black text-gray-200 mb-1">{runnerUp.name}</h4>
                          <!-- Rank -->
                          <p class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">2nd Place</p>
                          <!-- Stats -->
                          {#if !isTeamBased}
                            <div class="text-sm font-bold text-gray-400">
                              {#if isHealthBased}
                                {getPlayerTotalScore(runnerUp.id)} HP
                              {:else if isKillBased}
                                {getPlayerTotalScore(runnerUp.id)} Kills
                              {:else}
                                {getPlayerTotalScore(runnerUp.id)} Rounds
                              {/if}
                            </div>
                          {/if}
                        </div>
                      </div>
                      <!-- Podium Base -->
                      <div class="w-56 h-8 bg-gradient-to-b from-gray-400 via-gray-500 to-gray-600 rounded-b-lg shadow-lg flex items-center justify-center">
                      </div>
                    </div>
                  </div>
                {/if}

                <!-- 1st Place (Center) - Tallest -->
                <div class="flex flex-col items-center relative z-20 mx-8">
                  <!-- Pillar -->
                  <div class="flex flex-col items-center">
                    <!-- Card -->
                    <div class="glass rounded-t-2xl p-8 text-center relative overflow-hidden w-64 mb-0 shadow-2xl border-2 border-yellow-400/40">
                      <div class="absolute inset-0 bg-gradient-to-br from-yellow-500/20 via-yellow-400/10 to-yellow-600/15"></div>
                      <div class="relative z-10">
                        <!-- Medal Ring -->
                        <div class="mb-4">
                          <div class="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-2xl ring-4 ring-yellow-400/50 border-3 border-yellow-300">
                            {#if isTeamBased && teamChampion}
                              <img src={getTeamImageUrl(teamChampion)} alt={teamChampion.name} class="w-24 h-24 rounded-full object-cover" />
                            {:else if champion}
                              <img src={getPlayerImageUrl(champion.name)} alt={champion.name} class="w-24 h-24 rounded-full object-cover" />
                            {/if}
                          </div>
                        </div>
                        <!-- Name -->
                        <h4 class="text-2xl font-black text-yellow-300 mb-2">{displayName}</h4>
                        <!-- Rank -->
                        <p class="text-xs font-bold uppercase tracking-wider text-yellow-400 mb-3">Champion</p>
                        <!-- Stats -->
                        {#if !isTeamBased && champion}
                          <div class="text-sm font-bold text-cyber-green">
                            {#if isHealthBased}
                              {getPlayerTotalScore(champion.id)} HP
                            {:else if isKillBased}
                              {getPlayerTotalScore(champion.id)} Kills
                            {:else}
                              {getPlayerTotalScore(champion.id)} Rounds
                            {/if}
                          </div>
                        {/if}
                      </div>
                    </div>
                    <!-- Podium Base -->
                    <div class="w-64 h-12 bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-500 rounded-b-lg shadow-2xl flex items-center justify-center">
                    </div>
                  </div>
                </div>

                <!-- 3rd Place (Right) - Short -->
                {#if getThirdPlace()}
                  {@const thirdPlace = getThirdPlace()}
                  <div class="flex flex-col items-center relative z-10">
                    <!-- Pillar -->
                    <div class="flex flex-col items-center">
                      <!-- Card -->
                      <div class="glass rounded-t-2xl p-6 text-center relative overflow-hidden w-56 mb-0">
                        <div class="absolute inset-0 bg-gradient-to-br from-orange-500/15 via-orange-400/5 to-orange-600/15"></div>
                        <div class="relative z-10">
                          <!-- Medal Ring -->
                          <div class="mb-4">
                            <div class="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-xl ring-4 ring-orange-400/40 border-2 border-orange-300">
                              {#if isTeamBased}
                                <img src={getTeamImageUrl(thirdPlace)} alt={thirdPlace.name} class="w-20 h-20 rounded-full object-cover" />
                              {:else}
                                <img src={getPlayerImageUrl(thirdPlace.name)} alt={thirdPlace.name} class="w-20 h-20 rounded-full object-cover" />
                              {/if}
                            </div>
                          </div>
                          <!-- Name -->
                          <h4 class="text-lg font-black text-orange-300 mb-1">{thirdPlace.name}</h4>
                          <!-- Rank -->
                          <p class="text-xs font-bold uppercase tracking-wider text-orange-400 mb-3">3rd Place</p>
                          <!-- Stats -->
                          {#if !isTeamBased}
                            <div class="text-sm font-bold text-orange-400">
                              {#if isHealthBased}
                                {getPlayerTotalScore(thirdPlace.id)} HP
                              {:else if isKillBased}
                                {getPlayerTotalScore(thirdPlace.id)} Kills
                              {:else}
                                {getPlayerTotalScore(thirdPlace.id)} Rounds
                              {/if}
                            </div>
                          {/if}
                        </div>
                      </div>
                      <!-- Podium Base -->
                      <div class="w-56 h-4 bg-gradient-to-b from-orange-400 via-orange-500 to-orange-600 rounded-b-lg shadow-lg flex items-center justify-center">
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
          
          <!-- View Statistics Button -->
          <div class="text-center">
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
      {/if}
      
      <div class="space-y-6">
        
        <!-- Playoff Bracket -->
        <div class="glass rounded-lg p-4 md:p-6">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <div class="w-1 h-8 bg-gradient-to-b from-yellow-400 via-brand-orange to-brand-purple rounded-full"></div>
              <div>
                <h2 class="text-xl font-black text-white">PLAYOFF BRACKET</h2>
                <p class="text-xs text-gray-400 mt-0.5">Single Elimination • Best of {mapsPerMatch}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              {#if tournamentState === 'playoffs' && !champion}
                <div class="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-cyber-green/10 border border-cyber-green/30 rounded-lg">
                  <div class="w-2 h-2 bg-cyber-green rounded-full animate-pulse"></div>
                  <span class="text-xs font-bold text-cyber-green">LIVE</span>
                </div>
              {:else if champion}
                <div class="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <span class="text-xs font-bold text-yellow-500">COMPLETED</span>
                </div>
              {/if}
            </div>
          </div>
          
          <div class="relative" data-bracket-container>
            <!-- Championship Bracket -->
            <div class="flex gap-16 overflow-x-auto pb-4 px-2">
              {#each getEffectiveRounds() as round, roundIndex}
                {@const roundMatchesAll = getEffectiveMatchesForRound(round)}
                {@const isThirdPlaceRound = roundMatchesAll.every(m => m.bracketType === '3rd-place')}
                {#if !isThirdPlaceRound}
                {@const roundMatches = roundMatchesAll.filter(m => m.bracketType !== '3rd-place')}
                {@const totalRounds = getEffectiveRounds().filter(r => !getEffectiveMatchesForRound(r).every(m => m.bracketType === '3rd-place')).length}
                {@const roundLabel = getRoundLabel(round, totalRounds)}
                {@const isFinals = roundLabel === 'Finals'}
                {@const isSemis = roundLabel === 'Semifinals'}
                {@const isQuarters = roundLabel === 'Quarterfinals'}
                
                <!-- Check if 3rd place match exists -->
                {@const thirdPlaceRound = getEffectiveRounds().find(r => getEffectiveMatchesForRound(r).some(m => m.bracketType === '3rd-place'))}
                {@const thirdPlaceMatches = thirdPlaceRound && isFinals ? getEffectiveMatchesForRound(thirdPlaceRound).filter(m => m.bracketType === '3rd-place') : []}
                {@const semifinalRound = getEffectiveRounds().find(r => getEffectiveMatchesForRound(r).some(m => m.bracketType === 'semifinals'))}
                {@const semifinals = semifinalRound ? getEffectiveMatchesForRound(semifinalRound).filter(m => m.bracketType === 'semifinals') : []}
                
                <!-- Slot-based vertical centering so Semis sit between their Quarter pairs -->
                {@const totalSlotsInColumn = Math.pow(2, totalRounds - 1)}
                {@const singleSlotHeight = maxColumnHeight / totalSlotsInColumn}
                {@const hasThirdPlace = isFinals && getEffectiveRounds().some(r => getEffectiveMatchesForRound(r).some(m => m.bracketType === '3rd-place'))}
                {@const slotsThisMatchOccupies = Math.pow(2, roundIndex)}
                {@const marginTop = 0}
                <div class="flex-shrink-0 w-72">
                  <!-- Round Header -->
                  <div class="text-center mb-4">
                    <div class="inline-block px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 border border-cyan-400 shadow-lg">
                      <h3 class="font-black text-base text-white">{roundLabel}</h3>
                    </div>
                  </div>
                  
                  <div class="flex flex-col {totalRounds === 1 ? 'gap-4' : 'justify-center'}" style={totalRounds > 1 ? `height: ${maxColumnHeight}px;` : ''}>
                  {#each roundMatches as match, matchIndex}
                    {@const entity1Id = getEntityId1(match)}
                    {@const entity2Id = getEntityId2(match)}
                    {@const entity1Name = getEntityName(entity1Id)}
                    {@const entity2Name = getEntityName(entity2Id)}
                    {@const entity1Image = getEntityImage(entity1Id)}
                    {@const entity2Image = getEntityImage(entity2Id)}
                    {@const isEditing = editingMatchId === match.id}
                    {@const hasWinner = !!match.winnerId}
                    {@const seriesScore = match.games ? match.games.reduce((acc: any, game: any) => {
                      const gameWinner = getGameWinnerId(game);
                      if (gameWinner === entity1Id) acc.player1++;
                      if (gameWinner === entity2Id) acc.player2++;
                      return acc;
                    }, { player1: 0, player2: 0 }) : { player1: 0, player2: 0 }}
                    <!-- Generate unique IDs for this match and its players -->
                    {@const matchId = `match-r${roundIndex}-m${matchIndex}`}
                    {@const player1RowId = `${matchId}-p1`}
                    {@const player2RowId = `${matchId}-p2`}
                    <!-- Determine where the winner goes in the next round -->
                    {@const nextRoundMatchIndex = Math.floor(matchIndex / 2)}
                    {@const nextRoundPlayerSlot = matchIndex % 2 === 0 ? 'p1' : 'p2'}
                    {@const nextMatchId = roundIndex < totalRounds - 1 ? `match-r${roundIndex + 1}-m${nextRoundMatchIndex}` : null}
                    {@const nextPlayerRowId = nextMatchId ? `${nextMatchId}-${nextRoundPlayerSlot}` : null}
                    {@const winnerRowId = match.winnerId === entity1Id ? player1RowId : match.winnerId === entity2Id ? player2RowId : null}
                    <!-- Determine where the loser goes (for semifinals → 3rd place) -->
                    {@const loserPlayerRowId = isSemis && match.winnerId ? (matchIndex === 0 ? 'match-3rd-place-p1' : 'match-3rd-place-p2') : null}
                    {@const loserRowId = match.winnerId === entity1Id ? player2RowId : match.winnerId === entity2Id ? player1RowId : null}
                    <!-- Create boxes for positioning -->
                    {@const matchCardHeight = isFinals ? (finalsCardHeight || 220) : baseMatchHeight}
                    {@const boxHeight = hasThirdPlace && isFinals ? singleSlotHeight * 2 : singleSlotHeight * slotsThisMatchOccupies}
                    <!-- Each match container spans multiple slots (quarters=1, semis=2, finals=4) -->
                    <!-- For single-round brackets (only Finals), don't use slot-based heights -->
                    <!-- For Finals with 3rd place, split the column height between them -->
                    {@const finalsBoxHeight = hasThirdPlace && isFinals && totalRounds > 1 ? maxColumnHeight / 2 : boxHeight}
                    <div class="flex items-center justify-center flex-shrink-0" style={totalRounds > 1 ? `height: ${finalsBoxHeight}px; margin-top: ${marginTop}px;` : ''}>
                      <div class="w-full" data-match-id={matchId} data-finals-card={isFinals ? 'true' : null}>
                      <!-- NO CONNECTOR LINES FOR NOW - JUST SHOW THE BRACKETS -->

                      <!-- Match Card -->
                      <div class="glass rounded-xl overflow-hidden relative z-10 transform transition-all duration-300 {isEditing ? 'ring-2 ring-brand-cyan scale-105 shadow-2xl' : hasWinner ? 'shadow-lg shadow-cyber-green/20' : 'hover:scale-102 hover:shadow-xl'} border {isFinals ? 'border-yellow-400 ring-4 ring-yellow-500/50' : 'border-space-600'}">
                        <!-- Match Header -->
                        <div class="bg-gradient-to-r from-space-700 to-space-800 px-3 py-2 flex items-center justify-between border-b border-space-600">
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-gray-400">{match.matchLabel || `Match ${matchIndex + 1}`}</span>
                            {#if hasWinner}
                              <div class="flex items-center gap-1 px-2 py-0.5 bg-cyber-green/20 rounded-full">
                                <svg class="w-3 h-3 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                <span class="text-xs font-bold text-cyber-green">Complete</span>
                              </div>
                            {/if}
                          </div>
                          <div class="flex items-center gap-2">
                            {#if hasWinner}
                              <div class="text-xs font-black text-cyber-green">
                                {seriesScore.player1}-{seriesScore.player2}
                              </div>
                            {/if}
                            <span class="text-xs font-bold {isFinals ? 'text-yellow-500' : isSemis ? 'text-brand-orange' : 'text-brand-cyan'}">BO{mapsPerMatch}</span>
                          </div>
                        </div>

                        {#if isEditing}
                          <!-- BO3 Editing Mode -->
                          <div class="p-3 space-y-3 bg-gradient-to-br from-space-800 to-space-900">
                            <!-- Player Names Header -->
                            <div class="flex items-center justify-between text-sm bg-space-700/50 rounded-lg p-2">
                              <div class="flex items-center gap-2 flex-1">
                                <img src={entity1Image} alt="Profile" class="w-7 h-7 rounded-full object-cover ring-2 ring-cyber-blue" />
                                <span class="font-bold text-white truncate">{entity1Name}</span>
                              </div>
                              <div class="px-3 text-gray-500 font-bold">VS</div>
                              <div class="flex items-center gap-2 flex-1 justify-end">
                                <span class="font-bold text-white truncate">{entity2Name}</span>
                                <img src={entity2Image} alt="Profile" class="w-7 h-7 rounded-full object-cover ring-2 ring-brand-purple" />
                              </div>
                            </div>

                            <!-- Series Score Display -->
                            <div class="flex justify-center items-center gap-4 py-2 bg-gradient-to-r from-space-700 to-space-800 rounded-lg">
                              <div class="text-center">
                                <div class="text-3xl font-black {getSeriesScore().player1Wins >= Math.ceil(mapsPerMatch/2) ? 'text-cyber-green animate-pulse' : 'text-white'}">{getSeriesScore().player1Wins}</div>
                                <div class="text-xs text-gray-400 mt-1">Maps Won</div>
                              </div>
                              <div class="w-px h-12 bg-gradient-to-b from-transparent via-gray-600 to-transparent"></div>
                              <div class="text-center">
                                <div class="text-3xl font-black {getSeriesScore().player2Wins >= Math.ceil(mapsPerMatch/2) ? 'text-cyber-green animate-pulse' : 'text-white'}">{getSeriesScore().player2Wins}</div>
                                <div class="text-xs text-gray-400 mt-1">Maps Won</div>
                              </div>
                            </div>

                            <!-- Map Score Inputs -->
                            {#each Array(mapsPerMatch) as _, mapIdx}
                              {@const mapWinner = getMapWinner(mapIdx)}
                              {@const mapScore = mapScores[mapIdx] || { player1Score: 0, player2Score: 0 }}
                              {@const mapError = getMapValidationError(mapIdx)}
                              <div class="space-y-1.5">
                                <!-- Map Selection Dropdown -->
                                {#if mapPool.length > 0}
                                  <select 
                                    bind:value={selectedMaps[mapIdx]}
                                    class="w-full bg-space-600 border-2 border-space-500 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-cyan"
                                  >
                                    <option value="">Select Map {mapIdx + 1}</option>
                                    {#each mapPool as map}
                                      <option value={map}>{map}</option>
                                    {/each}
                                  </select>
                                {/if}
                                
                                {#if isWinOnly}
                                  <!-- Win-Only Mode: W Buttons -->
                                  <div class="flex items-center gap-2 p-2 rounded-lg bg-space-700/80 {mapWinner ? (mapWinner === 'player1' ? 'ring-2 ring-cyan-500 bg-cyan-500/10' : 'ring-2 ring-purple-500 bg-purple-500/10') : ''}">
                                    <div class="flex items-center gap-1.5 min-w-[60px]">
                                      <span class="text-xs text-gray-400 font-bold">
                                        {#if selectedMaps[mapIdx]}
                                          <span class="text-cyan-400">{selectedMaps[mapIdx]}</span>
                                        {:else}
                                          Game {mapIdx + 1}
                                        {/if}
                                      </span>
                                    </div>
                                    <button
                                      onclick={() => setMapWinner(mapIdx, 'player1')}
                                      class="w-10 h-10 rounded-lg font-black text-base transition-all {mapWinner === 'player1' ? 'bg-cyber-green text-black' : 'bg-space-600 hover:bg-space-500 text-white border-2 border-space-500 hover:border-cyber-green'}"
                                    >
                                      W
                                    </button>
                                    <span class="text-gray-600 font-bold">:</span>
                                    <button
                                      onclick={() => setMapWinner(mapIdx, 'player2')}
                                      class="w-10 h-10 rounded-lg font-black text-base transition-all {mapWinner === 'player2' ? 'bg-cyber-green text-black' : 'bg-space-600 hover:bg-space-500 text-white border-2 border-space-500 hover:border-cyber-green'}"
                                    >
                                      W
                                    </button>
                                  </div>
                                  {@const duplicateMapError = getDuplicateMapError(mapIdx)}
                                  {#if duplicateMapError}
                                    <div class="text-xs text-red-400 text-center font-medium bg-red-500/10 rounded px-2 py-1">{duplicateMapError}</div>
                                  {/if}
                                {:else}
                                  <!-- Standard Score Inputs -->
                                  <div class="flex items-center gap-2 p-2 rounded-lg bg-space-700/80 {mapWinner ? (mapWinner === 'player1' ? 'ring-2 ring-cyan-500 bg-cyan-500/10' : 'ring-2 ring-purple-500 bg-purple-500/10') : mapError ? 'ring-2 ring-red-500/50' : ''}">
                                    <div class="flex items-center gap-1.5 min-w-[60px]">
                                      {#if mapWinner === 'player1'}
                                        <svg class="w-3.5 h-3.5 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                      {/if}
                                      <span class="text-xs text-gray-400 font-bold">
                                        {#if selectedMaps[mapIdx]}
                                          <span class="text-cyan-400">{selectedMaps[mapIdx]}</span>
                                        {:else}
                                          Map {mapIdx + 1}
                                        {/if}
                                      </span>
                                    </div>
                                    <input
                                      type="number"
                                      min="0"
                                      max={isRoundsBased ? maxScorePerMap : undefined}
                                      value={mapScore.player1Score}
                                      oninput={(e) => updateMapScore(mapIdx, 'player1', parseInt((e.target as HTMLInputElement).value) || 0)}
                                      class="w-14 text-center text-base font-bold bg-space-600 border-2 {mapWinner === 'player1' ? 'border-cyber-green' : 'border-space-500'} rounded-lg py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-cyan appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                    />
                                    <span class="text-gray-500 font-bold">:</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max={isRoundsBased ? maxScorePerMap : undefined}
                                      value={mapScore.player2Score}
                                      oninput={(e) => updateMapScore(mapIdx, 'player2', parseInt((e.target as HTMLInputElement).value) || 0)}
                                      class="w-14 text-center text-base font-bold bg-space-600 border-2 {mapWinner === 'player2' ? 'border-cyber-green' : 'border-space-500'} rounded-lg py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-cyan appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                    />
                                    {#if mapWinner === 'player2'}
                                      <svg class="w-3.5 h-3.5 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                    {/if}
                                  </div>
                                  {#if mapError}
                                    <div class="text-xs text-red-400 text-center font-medium bg-red-500/10 rounded px-2 py-1">{mapError}</div>
                                  {/if}
                                {/if}
                              </div>
                            {/each}

                            <!-- Action Buttons -->
                            <div class="flex gap-2 pt-2">
                              <button
                                onclick={cancelEditingMatch}
                                class="flex-1 py-2.5 text-sm font-bold bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-all duration-300 hover:scale-105"
                              >
                                Cancel
                              </button>
                              <button
                                onclick={submitResult}
                                disabled={!canSubmitSeries()}
                                class="flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 {canSubmitSeries() ? 'bg-gradient-to-r from-cyber-green to-emerald-500 text-space-900 hover:scale-105 shadow-lg shadow-cyber-green/30' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
                              >
                                {#if canSubmitSeries()}
                                  <svg class="w-4 h-4 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                  Submit ({getSeriesScore().player1Wins}-{getSeriesScore().player2Wins})
                                {:else}
                                  Need Winner
                                {/if}
                              </button>
                            </div>
                          </div>
                        {:else}
                          <!-- Normal View / Click to Edit -->
                          {#if !match.winnerId && entity1Id && entity2Id}
                            <button
                              type="button"
                              class="w-full p-3 text-center text-sm font-bold text-brand-cyan hover:bg-brand-cyan/10 transition-all duration-300 border-b border-space-600 hover:text-brand-cyan hover:shadow-inner"
                              onclick={() => startEditing(match.id)}
                            >
                              <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                              Enter Match Scores
                            </button>
                          {/if}

                          <!-- Games Results Display -->
                          {#if match.games && match.games.length > 0}
                            <div class="px-3 py-2 bg-space-800/50 border-b border-space-600/50 space-y-1.5">
                              {#each match.games as game, idx}
                                {@const gameWinner = getGameWinnerId(game)}
                                <div class="flex items-center justify-between text-xs">
                                  <div class="flex items-center gap-2 flex-1">
                                    <span class="text-gray-400 font-bold">G{idx + 1}:</span>
                                    <span class="text-brand-cyan font-medium">{game.mapName || `Map ${idx + 1}`}</span>
                                  </div>
                                  <div class="flex items-center gap-2 font-bold">
                                    <span class="text-white">{getGameScore1(game)}</span>
                                    <span class="text-gray-500">:</span>
                                    <span class="text-white">{getGameScore2(game)}</span>
                                    {#if gameWinner === entity1Id}
                                      <svg class="w-3 h-3 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                    {:else if gameWinner === entity2Id}
                                      <svg class="w-3 h-3 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                    {/if}
                                  </div>
                                </div>
                              {/each}
                            </div>
                          {/if}

                          <!-- Entity 1 (Player or Team) -->
                          <div 
                            id={player1RowId}
                            data-player-id={entity1Id}
                            data-is-winner={match.winnerId === entity1Id}
                            data-next-row-id={match.winnerId === entity1Id ? nextPlayerRowId : (match.winnerId === entity2Id && loserPlayerRowId ? loserPlayerRowId : null)}
                            class="w-full text-left px-3 py-3 border-b border-space-600 transition-all duration-300 {match.winnerId === entity1Id ? 'bg-gradient-to-r from-cyber-green/20 to-transparent ring-2 ring-cyber-green/50' : ''} {match.winnerId && match.winnerId !== entity1Id ? 'opacity-40' : 'hover:bg-space-700/30'}"
                          >
                            <div class="flex items-center justify-between">
                              <div class="flex items-center gap-2.5 flex-1 min-w-0">
                                <div class="relative flex-shrink-0">
                                  <img src={entity1Image} alt="Profile" class="w-10 h-10 rounded-full object-cover {match.winnerId === entity1Id ? 'ring-2 ring-cyber-green' : ''}" />
                                  {#if match.winnerId === entity1Id}
                                    <div class="absolute -bottom-1 -right-1 w-5 h-5 bg-cyber-green rounded-full flex items-center justify-center">
                                      <svg class="w-3 h-3 text-space-900" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                    </div>
                                  {/if}
                                </div>
                                <div class="min-w-0 flex-1">
                                  <div class="font-bold text-sm text-white truncate">{entity1Name}</div>
                                  {#if hasWinner}
                                    <div class="text-xs text-gray-400 mt-0.5">
                                      <span class="font-bold {match.winnerId === entity1Id ? 'text-cyber-green' : ''}">{seriesScore.player1}</span>
                                      <span class="text-gray-500 mx-1">maps</span>
                                    </div>
                                  {/if}
                                </div>
                              </div>
                              {#if hasWinner}
                                <div class="text-right flex-shrink-0 ml-2">
                                  <div class="text-2xl font-black {match.winnerId === entity1Id ? 'text-cyber-green' : 'text-gray-600'}">{seriesScore.player1}</div>
                                </div>
                              {/if}
                            </div>
                          </div>
                          
                          <!-- Entity 2 (Player or Team) -->
                          <div 
                            id={player2RowId}
                            data-player-id={entity2Id}
                            data-is-winner={match.winnerId === entity2Id}
                            data-next-row-id={match.winnerId === entity2Id ? nextPlayerRowId : (match.winnerId === entity1Id && loserPlayerRowId ? loserPlayerRowId : null)}
                            class="w-full text-left px-3 py-3 transition-all duration-300 {match.winnerId === entity2Id ? 'bg-gradient-to-r from-cyber-green/20 to-transparent ring-2 ring-cyber-green/50' : ''} {match.winnerId && match.winnerId !== entity2Id ? 'opacity-40' : 'hover:bg-space-700/30'}"
                          >
                            <div class="flex items-center justify-between">
                              <div class="flex items-center gap-2.5 flex-1 min-w-0">
                                <div class="relative flex-shrink-0">
                                  <img src={entity2Image} alt="Profile" class="w-10 h-10 rounded-full object-cover {match.winnerId === entity2Id ? 'ring-2 ring-cyber-green' : ''}" />
                                  {#if match.winnerId === entity2Id}
                                    <div class="absolute -bottom-1 -right-1 w-5 h-5 bg-cyber-green rounded-full flex items-center justify-center">
                                      <svg class="w-3 h-3 text-space-900" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                    </div>
                                  {/if}
                                </div>
                                <div class="min-w-0 flex-1">
                                  <div class="font-bold text-sm text-white truncate">{entity2Name}</div>
                                  {#if hasWinner}
                                    <div class="text-xs text-gray-400 mt-0.5">
                                      <span class="font-bold {match.winnerId === entity2Id ? 'text-cyber-green' : ''}">{seriesScore.player2}</span>
                                      <span class="text-gray-500 mx-1">maps</span>
                                    </div>
                                  {/if}
                                </div>
                              </div>
                              {#if hasWinner}
                                <div class="text-right flex-shrink-0 ml-2">
                                  <div class="text-2xl font-black {match.winnerId === entity2Id ? 'text-cyber-green' : 'text-gray-600'}">{seriesScore.player2}</div>
                                </div>
                              {/if}
                            </div>
                          </div>
                        {/if}
                      </div>
                    </div>
                  </div>
              {/each}
                  
                  <!-- Second box for Finals column: 3rd place (editable + stats) -->
                  {#if isFinals && thirdPlaceMatches.length > 0}
                    {@const totalSlotsInColumn = Math.pow(2, totalRounds - 1)}
                    {@const singleSlotHeight = maxColumnHeight / totalSlotsInColumn}
                    <!-- For single-round brackets, don't use slot-based heights -->
                    <!-- For multi-round brackets, split the column height with Finals -->
                    {@const thirdPlaceBoxHeight = totalRounds > 1 ? maxColumnHeight / 2 : 0}
                    <div class="flex items-center justify-center flex-shrink-0" style={totalRounds > 1 ? `height: ${thirdPlaceBoxHeight}px;` : ''}>
                      <div class="w-full">
                        {#each thirdPlaceMatches as match3rd}
                          {@const entity1Id3rd = getEntityId1(match3rd)}
                          {@const entity2Id3rd = getEntityId2(match3rd)}
                          {@const entity1Name3rd = getEntityName(entity1Id3rd)}
                          {@const entity2Name3rd = getEntityName(entity2Id3rd)}
                          {@const entity1Image3rd = getEntityImage(entity1Id3rd)}
                          {@const entity2Image3rd = getEntityImage(entity2Id3rd)}
                          {@const isEditing3rd = editingMatchId === match3rd.id}
                          {@const hasWinner = !!match3rd.winnerId}
                          {@const seriesScore = match3rd.games ? match3rd.games.reduce((acc: any, game: any) => {
                            const gameWinner = getGameWinnerId(game);
                            if (gameWinner === entity1Id3rd) acc.player1++;
                            if (gameWinner === entity2Id3rd) acc.player2++;
                            return acc;
                          }, { player1: 0, player2: 0 }) : { player1: 0, player2: 0 }}
                          
                          <div class="glass rounded-xl overflow-hidden relative z-10 transform transition-all duration-300 {isEditing3rd ? 'ring-2 ring-brand-cyan scale-105 shadow-2xl' : hasWinner ? 'shadow-lg shadow-cyber-green/20' : 'hover:scale-102 hover:shadow-xl'} border border-orange-500 ring-4 ring-orange-600/50" data-match-id={`match-3rd-place`}>
                            <div class="bg-gradient-to-r from-space-700 to-space-800 px-3 py-2 flex items-center justify-between border-b border-space-600">
                              <div class="flex items-center gap-2">
                                <span class="text-xs font-bold text-gray-400">3rd Place</span>
                                {#if hasWinner}
                                  <div class="flex items-center gap-1 px-2 py-0.5 bg-cyber-green/20 rounded-full">
                                    <svg class="w-3 h-3 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                    <span class="text-xs font-bold text-cyber-green">Complete</span>
                                  </div>
                                {/if}
                              </div>
                              <div class="flex items-center gap-2">
                                {#if hasWinner}
                                  <div class="text-xs font-black text-cyber-green">
                                    {seriesScore.player1}-{seriesScore.player2}
                                  </div>
                                {/if}
                                <span class="text-xs font-bold text-brand-orange">BO{mapsPerMatch}</span>
                              </div>
                            </div>

                          {#if isEditing3rd}
                                <!-- Reuse BO3 editor for 3rd place -->
                                <div class="flex items-center justify-between text-sm bg-space-700/50 rounded-lg p-2">
                                  <div class="flex items-center gap-2 flex-1">
                                    <img src={entity1Image3rd} alt="Profile" class="w-7 h-7 rounded-full object-cover ring-2 ring-cyber-blue" />
                                    <span class="font-bold text-white truncate">{entity1Name3rd}</span>
                                  </div>
                                  <div class="px-3 text-gray-500 font-bold">VS</div>
                                  <div class="flex items-center gap-2 flex-1 justify-end">
                                    <span class="font-bold text-white truncate">{entity2Name3rd}</span>
                                    <img src={entity2Image3rd} alt="Profile" class="w-7 h-7 rounded-full object-cover ring-2 ring-brand-purple" />
                                  </div>
                                </div>

                                <div class="flex justify-center items-center gap-4 py-2 bg-gradient-to-r from-space-700 to-space-800 rounded-lg">
                                  <div class="text-center">
                                    <div class="text-3xl font-black {getSeriesScore().player1Wins >= Math.ceil(mapsPerMatch/2) ? 'text-cyber-green animate-pulse' : 'text-white'}">{getSeriesScore().player1Wins}</div>
                                    <div class="text-xs text-gray-400 mt-1">Maps Won</div>
                                  </div>
                                  <div class="w-px h-12 bg-gradient-to-b from-transparent via-gray-600 to-transparent"></div>
                                  <div class="text-center">
                                    <div class="text-3xl font-black {getSeriesScore().player2Wins >= Math.ceil(mapsPerMatch/2) ? 'text-cyber-green animate-pulse' : 'text-white'}">{getSeriesScore().player2Wins}</div>
                                    <div class="text-xs text-gray-400 mt-1">Maps Won</div>
                                  </div>
                                </div>

                                {#each Array(mapsPerMatch) as _, mapIdx}
                                  {@const mapWinner = getMapWinner(mapIdx)}
                                  {@const mapScore = mapScores[mapIdx] || { player1Score: 0, player2Score: 0 }}
                                  {@const mapError = getMapValidationError(mapIdx)}
                                  <div class="space-y-1.5">
                                    {#if mapPool.length > 0}
                                      <select 
                                        bind:value={selectedMaps[mapIdx]}
                                        class="w-full bg-space-600 border-2 border-space-500 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-brand-cyan"
                                      >
                                        <option value="">Select Map {mapIdx + 1}</option>
                                        {#each mapPool as map}
                                          <option value={map}>{map}</option>
                                        {/each}
                                      </select>
                                    {/if}
                                    
                                    {#if isWinOnly}
                                      <!-- Win-Only Mode: W Buttons -->
                                      <div class="flex items-center gap-2 p-2 rounded-lg bg-space-700/80 {mapWinner ? (mapWinner === 'player1' ? 'ring-2 ring-cyan-500 bg-cyan-500/10' : 'ring-2 ring-purple-500 bg-purple-500/10') : ''}">
                                        <div class="flex items-center gap-1.5 min-w-[60px]">
                                          <span class="text-xs text-gray-400 font-bold">
                                            {#if selectedMaps[mapIdx]}
                                              <span class="text-cyan-400">{selectedMaps[mapIdx]}</span>
                                            {:else}
                                              Game {mapIdx + 1}
                                            {/if}
                                          </span>
                                        </div>
                                        <button
                                          onclick={() => setMapWinner(mapIdx, 'player1')}
                                          class="w-10 h-10 rounded-lg font-black text-base transition-all {mapWinner === 'player1' ? 'bg-cyber-green text-black' : 'bg-space-600 hover:bg-space-500 text-white border-2 border-space-500 hover:border-cyber-green'}"
                                        >
                                          W
                                        </button>
                                        <span class="text-gray-600 font-bold">:</span>
                                        <button
                                          onclick={() => setMapWinner(mapIdx, 'player2')}
                                          class="w-10 h-10 rounded-lg font-black text-base transition-all {mapWinner === 'player2' ? 'bg-cyber-green text-black' : 'bg-space-600 hover:bg-space-500 text-white border-2 border-space-500 hover:border-cyber-green'}"
                                        >
                                          W
                                        </button>
                                      </div>
                                      {@const duplicateMapError = getDuplicateMapError(mapIdx)}
                                      {#if duplicateMapError}
                                        <div class="text-xs text-red-400 text-center font-medium bg-red-500/10 rounded px-2 py-1">{duplicateMapError}</div>
                                      {/if}
                                    {:else}
                                      <!-- Standard Score Inputs -->
                                      <div class="flex items-center gap-2 p-2 rounded-lg bg-space-700/80 {mapWinner ? (mapWinner === 'player1' ? 'ring-2 ring-cyan-500 bg-cyan-500/10' : 'ring-2 ring-purple-500 bg-purple-500/10') : mapError ? 'ring-2 ring-red-500/50' : ''}">
                                        <div class="flex items-center gap-1.5 min-w-[60px]">
                                          {#if mapWinner === 'player1'}
                                            <svg class="w-3.5 h-3.5 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                          {/if}
                                          <span class="text-xs text-gray-400 font-bold">
                                            {#if selectedMaps[mapIdx]}
                                              <span class="text-cyan-400">{selectedMaps[mapIdx]}</span>
                                            {:else}
                                              Map {mapIdx + 1}
                                            {/if}
                                          </span>
                                        </div>
                                        <input
                                          type="number"
                                          min="0"
                                          max={isRoundsBased ? maxScorePerMap : undefined}
                                          value={mapScore.player1Score}
                                          oninput={(e) => updateMapScore(mapIdx, 'player1', parseInt((e.target as HTMLInputElement).value) || 0)}
                                          class="w-14 text-center text-base font-bold bg-space-600 border-2 {mapWinner === 'player1' ? 'border-cyber-green' : 'border-space-500'} rounded-lg py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-cyan appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                        />
                                        <span class="text-gray-500 font-bold">:</span>
                                        <input
                                          type="number"
                                          min="0"
                                          max={isRoundsBased ? maxScorePerMap : undefined}
                                          value={mapScore.player2Score}
                                          oninput={(e) => updateMapScore(mapIdx, 'player2', parseInt((e.target as HTMLInputElement).value) || 0)}
                                          class="w-14 text-center text-base font-bold bg-space-600 border-2 {mapWinner === 'player2' ? 'border-cyber-green' : 'border-space-500'} rounded-lg py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-brand-cyan appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                        />
                                        {#if mapWinner === 'player2'}
                                          <svg class="w-3.5 h-3.5 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                        {/if}
                                      </div>
                                      {#if mapError}
                                        <div class="text-xs text-red-400 text-center font-medium bg-red-500/10 rounded px-2 py-1">{mapError}</div>
                                      {/if}
                                    {/if}
                                  </div>
                                {/each}

                                <div class="flex gap-2 pt-2">
                                  <button
                                    onclick={cancelEditingMatch}
                                    class="flex-1 py-2.5 text-sm font-bold bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-all duration-300 hover:scale-105"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onclick={submitResult}
                                    disabled={!canSubmitSeries()}
                                    class="flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 {canSubmitSeries() ? 'bg-gradient-to-r from-cyber-green to-emerald-500 text-space-900 hover:scale-105 shadow-lg shadow-cyber-green/30' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
                                  >
                                    {#if canSubmitSeries()}
                                      <svg class="w-4 h-4 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                      Submit ({getSeriesScore().player1Wins}-{getSeriesScore().player2Wins})
                                    {:else}
                                      Need Winner
                                    {/if}
                                  </button>
                                </div>
                              {:else}
                                {#if !match3rd.winnerId && entity1Id3rd && entity2Id3rd}
                                  <button
                                    type="button"
                                    class="w-full p-3 text-center text-sm font-bold text-brand-cyan hover:bg-brand-cyan/10 transition-all duration-300 border-b border-space-600 hover:text-brand-cyan hover:shadow-inner"
                                    onclick={() => startEditing(match3rd.id)}
                                  >
                                    <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                    Enter Match Scores
                                  </button>
                                {/if}

                                {#if match3rd.games && match3rd.games.length > 0}
                                  <div class="px-3 py-2 bg-space-800/50 border-b border-space-600/50 space-y-1.5">
                                    {#each match3rd.games as game, idx}
                                      {@const gameWinner = getGameWinnerId(game)}
                                      <div class="flex items-center justify-between text-xs">
                                        <div class="flex items-center gap-2 flex-1">
                                          <span class="text-gray-400 font-bold">G{idx + 1}:</span>
                                          <span class="text-brand-cyan font-medium">{game.mapName || `Map ${idx + 1}`}</span>
                                        </div>
                                        <div class="flex items-center gap-2 font-bold">
                                          <span class="text-white">{getGameScore1(game)}</span>
                                          <span class="text-gray-500">:</span>
                                          <span class="text-white">{getGameScore2(game)}</span>
                                          {#if gameWinner === entity1Id3rd}
                                            <svg class="w-3 h-3 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                          {:else if gameWinner === entity2Id3rd}
                                            <svg class="w-3 h-3 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                          {/if}
                                        </div>
                                      </div>
                                    {/each}
                                  </div>
                                {/if}

                                <!-- Entity 1 (3rd place) -->
                                <div 
                                  id="match-3rd-place-p1"
                                  data-player-id={entity1Id3rd}
                                  data-is-winner={match3rd.winnerId === entity1Id3rd}
                                  class="w-full text-left px-3 py-3 border-b border-space-600 transition-all duration-300 {match3rd.winnerId === entity1Id3rd ? 'bg-gradient-to-r from-cyber-green/20 to-transparent ring-2 ring-cyber-green/50' : ''} {match3rd.winnerId && match3rd.winnerId !== entity1Id3rd ? 'opacity-40' : 'hover:bg-space-700/30'}"
                                >
                                  <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2.5 flex-1 min-w-0">
                                      <div class="relative flex-shrink-0">
                                        <img src={entity1Image3rd} alt="Profile" class="w-10 h-10 rounded-full object-cover {match3rd.winnerId === entity1Id3rd ? 'ring-2 ring-cyber-green' : ''}" />
                                        {#if match3rd.winnerId === entity1Id3rd}
                                          <div class="absolute -bottom-1 -right-1 w-5 h-5 bg-cyber-green rounded-full flex items-center justify-center">
                                            <svg class="w-3 h-3 text-space-900" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                          </div>
                                        {/if}
                                      </div>
                                      <div class="min-w-0 flex-1">
                                        <div class="font-bold text-sm text-white truncate">{entity1Name3rd}</div>
                                        {#if hasWinner}
                                          <div class="text-xs text-gray-400 mt-0.5">
                                            <span class="font-bold {match3rd.winnerId === entity1Id3rd ? 'text-cyber-green' : ''}">{seriesScore.player1}</span>
                                            <span class="text-gray-500 mx-1">maps</span>
                                          </div>
                                        {/if}
                                      </div>
                                    </div>
                                    {#if hasWinner}
                                      <div class="text-right flex-shrink-0 ml-2">
                                        <div class="text-2xl font-black {match3rd.winnerId === entity1Id3rd ? 'text-cyber-green' : 'text-gray-600'}">{seriesScore.player1}</div>
                                      </div>
                                    {/if}
                                  </div>
                                </div>
                                
                                <!-- Entity 2 (3rd place) -->
                                <div 
                                  id="match-3rd-place-p2"
                                  data-player-id={entity2Id3rd}
                                  data-is-winner={match3rd.winnerId === entity2Id3rd}
                                  class="w-full text-left px-3 py-3 transition-all duration-300 {match3rd.winnerId === entity2Id3rd ? 'bg-gradient-to-r from-cyber-green/20 to-transparent ring-2 ring-cyber-green/50' : ''} {match3rd.winnerId && match3rd.winnerId !== entity2Id3rd ? 'opacity-40' : 'hover:bg-space-700/30'}"
                                >
                                  <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2.5 flex-1 min-w-0">
                                      <div class="relative flex-shrink-0">
                                        <img src={entity2Image3rd} alt="Profile" class="w-10 h-10 rounded-full object-cover {match3rd.winnerId === entity2Id3rd ? 'ring-2 ring-cyber-green' : ''}" />
                                        {#if match3rd.winnerId === entity2Id3rd}
                                          <div class="absolute -bottom-1 -right-1 w-5 h-5 bg-cyber-green rounded-full flex items-center justify-center">
                                            <svg class="w-3 h-3 text-space-900" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                                          </div>
                                        {/if}
                                      </div>
                                      <div class="min-w-0 flex-1">
                                        <div class="font-bold text-sm text-white truncate">{entity2Name3rd}</div>
                                        {#if hasWinner}
                                          <div class="text-xs text-gray-400 mt-0.5">
                                            <span class="font-bold {match3rd.winnerId === entity2Id3rd ? 'text-cyber-green' : ''}">{seriesScore.player2}</span>
                                            <span class="text-gray-500 mx-1">maps</span>
                                          </div>
                                        {/if}
                                      </div>
                                    </div>
                                    {#if hasWinner}
                                      <div class="text-right flex-shrink-0 ml-2">
                                        <div class="text-2xl font-black {match3rd.winnerId === entity2Id3rd ? 'text-cyber-green' : 'text-gray-600'}">{seriesScore.player2}</div>
                                      </div>
                                    {/if}
                                  </div>
                                </div>
                              {/if}
                          </div>
                        {/each}
                      </div>
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
    {/if}
  </div>

  <!-- Team Match Modal -->
  {#if showTeamMatchModal && modalMatchId}
    {@const modalMatch = getModalMatch()}
    {#if modalMatch}
      {@const team1 = getTeam(modalMatch.team1Id || '')}
      {@const team2 = getTeam(modalMatch.team2Id || '')}
      {@const team1Players = getTeamPlayers(modalMatch.team1Id || '')}
      {@const team2Players = getTeamPlayers(modalMatch.team2Id || '')}
      {@const seriesScore = getModalSeriesScore()}
      
      <!-- Modal backdrop -->
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="button" tabindex="-1" onclick={closeTeamMatchModal}>
        <!-- Modal content -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="bg-space-800 border-2 border-brand-cyan rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" role="presentation" onclick={(e) => e.stopPropagation()}>
          <!-- Modal header -->
          <div class="bg-gradient-to-r from-space-700 to-space-800 px-6 py-4 border-b border-space-600 flex items-center justify-between sticky top-0 z-10">
            <div class="flex items-center gap-4">
              <h2 class="text-xl font-black text-white">{modalMatch.matchLabel || 'Match'}</h2>
              <span class="px-3 py-1 bg-brand-cyan/20 text-brand-cyan font-bold rounded-lg text-sm">BO{mapsPerMatch}</span>
            </div>
            <div class="flex items-center gap-4">
              <!-- Series score -->
              <div class="flex items-center gap-3 px-4 py-2 bg-space-700 rounded-lg">
                <div class="flex items-center gap-2">
                  <img src={getTeamImageUrl(team1)} alt="" class="w-8 h-8 rounded-lg object-cover" />
                  <span class="text-2xl font-black {seriesScore.team1Wins > seriesScore.team2Wins ? 'text-cyber-green' : 'text-white'}">{seriesScore.team1Wins}</span>
                </div>
                <span class="text-gray-500 font-bold">-</span>
                <div class="flex items-center gap-2">
                  <span class="text-2xl font-black {seriesScore.team2Wins > seriesScore.team1Wins ? 'text-cyber-green' : 'text-white'}">{seriesScore.team2Wins}</span>
                  <img src={getTeamImageUrl(team2)} alt="" class="w-8 h-8 rounded-lg object-cover" />
                </div>
              </div>
              <button onclick={closeTeamMatchModal} class="p-2 hover:bg-space-600 rounded-lg transition-colors" aria-label="Close modal">
                <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
          
          <!-- Team headers -->
          <div class="grid grid-cols-2 gap-4 px-6 py-3 bg-space-700/50 border-b border-space-600">
            <div class="flex items-center gap-3">
              <img src={getTeamImageUrl(team1)} alt="" class="w-12 h-12 rounded-lg object-cover border-2 border-brand-purple" />
              <div>
                <div class="font-bold text-white text-lg">{team1?.name || 'TBD'}</div>
                <div class="text-xs text-gray-400">{team1Players.length} players</div>
              </div>
            </div>
            <div class="flex items-center gap-3 justify-end">
              <div class="text-right">
                <div class="font-bold text-white text-lg">{team2?.name || 'TBD'}</div>
                <div class="text-xs text-gray-400">{team2Players.length} players</div>
              </div>
              <img src={getTeamImageUrl(team2)} alt="" class="w-12 h-12 rounded-lg object-cover border-2 border-brand-orange" />
            </div>
          </div>
          
          <!-- Games -->
          <div class="p-6 space-y-6">
            {#each Array(mapsPerMatch) as _, gameIdx}
              {@const gameWinner = getModalGameWinner(gameIdx)}
              {@const isGameComplete = !!gameWinner}
              {@const team1Score = modalGameScores[gameIdx]?.team1Score}
              {@const team2Score = modalGameScores[gameIdx]?.team2Score}
              {@const gameTie = isGameTie(gameIdx)}
              {@const gameReady = isGameReadyForInput(gameIdx)}
              {@const maxScore = maxScorePerMap || 99}
              
              <div class="bg-space-700/50 rounded-xl border {isGameComplete ? 'border-cyber-green/50' : gameTie ? 'border-red-500/50' : 'border-space-600'} overflow-hidden">
                <!-- Game header with score inputs -->
                <div class="bg-space-700 px-4 py-3 border-b border-space-600">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                      <span class="text-lg font-black text-white">Game {gameIdx + 1}</span>
                      {#if gameTie}
                        <span class="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-bold rounded">
                          Tie not allowed
                        </span>
                      {:else if isGameComplete}
                        <span class="px-2 py-0.5 bg-cyber-green/20 text-cyber-green text-xs font-bold rounded">
                          {gameWinner === 'team1' ? team1?.name : team2?.name} wins
                        </span>
                      {/if}
                    </div>
                    {#if mapPool.length > 0}
                      <select 
                        class="bg-space-600 border border-space-500 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-cyan"
                        value={modalGameMaps[gameIdx] || ''}
                        onchange={(e) => { modalGameMaps[gameIdx] = (e.target as HTMLSelectElement).value; modalGameMaps = {...modalGameMaps}; }}
                      >
                        <option value="">Select Map *</option>
                        {#each mapPool as map}
                          <option value={map}>{map}</option>
                        {/each}
                      </select>
                    {/if}
                  </div>
                  
                  <!-- Map required warning -->
                  {#if mapPool.length > 0 && !modalGameMaps[gameIdx]}
                    <div class="text-center text-yellow-400 text-xs font-medium mb-3 bg-yellow-500/10 rounded-lg py-2">
                      ⚠️ Select a map to enable score input
                    </div>
                  {/if}
                  
                  <!-- Duplicate map error -->
                  {#if getModalDuplicateMapError(gameIdx)}
                    <div class="text-xs text-red-400 text-center font-medium bg-red-500/10 rounded-lg px-2 py-2 mb-3">{getModalDuplicateMapError(gameIdx)}</div>
                  {/if}
                  
                  <!-- Round Score inputs -->
                  <div class="flex items-center justify-center gap-4 {!gameReady ? 'opacity-50 pointer-events-none' : ''}">
                    <div class="flex items-center gap-3">
                      <img src={getTeamImageUrl(team1)} alt="" class="w-10 h-10 rounded-lg object-cover border-2 {gameWinner === 'team1' ? 'border-cyber-green' : 'border-brand-purple'}" />
                      <span class="text-sm font-bold text-white w-24 truncate">{team1?.name}</span>
                      <input
                        type="number"
                        min="0"
                        max={maxScore}
                        placeholder="0"
                        disabled={!gameReady}
                        class="w-20 h-14 text-3xl font-black text-center rounded-lg transition-all {gameWinner === 'team1' ? 'bg-cyber-green/20 border-2 border-cyber-green text-cyber-green' : gameTie ? 'bg-red-500/20 border-2 border-red-500 text-red-400' : 'bg-space-600 border-2 border-space-500 text-white'} focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:cursor-not-allowed placeholder:text-gray-500"
                        value={team1Score ?? ''}
                        onchange={(e) => updateModalGameScore(gameIdx, 'team1', parseInt((e.target as HTMLInputElement).value) || 0)}
                      />
                    </div>
                    <span class="text-2xl font-bold text-gray-500">:</span>
                    <div class="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max={maxScore}
                        placeholder="0"
                        disabled={!gameReady}
                        class="w-20 h-14 text-3xl font-black text-center rounded-lg transition-all {gameWinner === 'team2' ? 'bg-cyber-green/20 border-2 border-cyber-green text-cyber-green' : gameTie ? 'bg-red-500/20 border-2 border-red-500 text-red-400' : 'bg-space-600 border-2 border-space-500 text-white'} focus:outline-none focus:ring-2 focus:ring-brand-cyan disabled:cursor-not-allowed placeholder:text-gray-500"
                        value={team2Score ?? ''}
                        onchange={(e) => updateModalGameScore(gameIdx, 'team2', parseInt((e.target as HTMLInputElement).value) || 0)}
                      />
                      <span class="text-sm font-bold text-white w-24 truncate text-right">{team2?.name}</span>
                      <img src={getTeamImageUrl(team2)} alt="" class="w-10 h-10 rounded-lg object-cover border-2 {gameWinner === 'team2' ? 'border-cyber-green' : 'border-brand-orange'}" />
                    </div>
                  </div>
                </div>
                
                <!-- Player K/D stats -->
                <div class="p-4 {!gameReady ? 'opacity-50 pointer-events-none' : ''}">
                  <div class="text-xs text-gray-400 mb-3 font-semibold">Player Stats (Kills / Deaths)</div>
                  <div class="grid grid-cols-2 gap-4">
                    <!-- Team 1 Players -->
                    <div class="bg-brand-purple/10 rounded-lg p-3 border border-brand-purple/20">
                      <div class="text-sm font-bold text-brand-purple mb-3 border-b border-brand-purple/20 pb-2">{team1?.name}</div>
                      {#each team1Players as player (player.id)}
                        <div class="flex items-center gap-2 mb-2">
                          <img src={getPlayerImageUrl(player.name)} alt="" class="w-6 h-6 rounded-full flex-shrink-0" />
                          <span class="text-sm text-gray-200 flex-1 truncate font-medium">{player.name}</span>
                          <div class="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              placeholder="K"
                              class="w-14 px-2 py-1.5 text-sm bg-space-600 border border-cyber-green/30 rounded text-center text-cyber-green font-bold focus:border-cyber-green focus:outline-none"
                              value={modalGamePlayerStats[gameIdx]?.[player.id]?.kills || 0}
                              oninput={(e) => updateModalPlayerStat(gameIdx, player.id, 'kills', parseInt((e.target as HTMLInputElement).value) || 0)}
                            />
                            <span class="text-gray-500 font-bold">/</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="D"
                              class="w-14 px-2 py-1.5 text-sm bg-space-600 border border-red-400/30 rounded text-center text-red-400 font-bold focus:border-red-400 focus:outline-none"
                              value={modalGamePlayerStats[gameIdx]?.[player.id]?.deaths || 0}
                              oninput={(e) => updateModalPlayerStat(gameIdx, player.id, 'deaths', parseInt((e.target as HTMLInputElement).value) || 0)}
                            />
                          </div>
                        </div>
                      {/each}
                    </div>
                    
                    <!-- Team 2 Players -->
                    <div class="bg-brand-orange/10 rounded-lg p-3 border border-brand-orange/20">
                      <div class="text-sm font-bold text-brand-orange mb-3 border-b border-brand-orange/20 pb-2">{team2?.name}</div>
                      {#each team2Players as player (player.id)}
                        <div class="flex items-center gap-2 mb-2">
                          <img src={getPlayerImageUrl(player.name)} alt="" class="w-6 h-6 rounded-full flex-shrink-0" />
                          <span class="text-sm text-gray-200 flex-1 truncate font-medium">{player.name}</span>
                          <div class="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              placeholder="K"
                              class="w-14 px-2 py-1.5 text-sm bg-space-600 border border-cyber-green/30 rounded text-center text-cyber-green font-bold focus:border-cyber-green focus:outline-none"
                              value={modalGamePlayerStats[gameIdx]?.[player.id]?.kills || 0}
                              oninput={(e) => updateModalPlayerStat(gameIdx, player.id, 'kills', parseInt((e.target as HTMLInputElement).value) || 0)}
                            />
                            <span class="text-gray-500 font-bold">/</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="D"
                              class="w-14 px-2 py-1.5 text-sm bg-space-600 border border-red-400/30 rounded text-center text-red-400 font-bold focus:border-red-400 focus:outline-none"
                              value={modalGamePlayerStats[gameIdx]?.[player.id]?.deaths || 0}
                              oninput={(e) => updateModalPlayerStat(gameIdx, player.id, 'deaths', parseInt((e.target as HTMLInputElement).value) || 0)}
                            />
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
          
          <!-- Modal footer -->
          <div class="bg-space-700/50 px-6 py-4 border-t border-space-600 flex items-center justify-between sticky bottom-0">
            <button
              onclick={closeTeamMatchModal}
              class="px-6 py-2.5 text-sm font-bold bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-all"
            >
              Close (Save Progress)
            </button>
            <div class="flex items-center gap-3">
              {#if hasAnyTie()}
                <span class="text-red-400 text-sm font-medium">⚠️ Fix tied games</span>
              {/if}
              <button
                onclick={submitModalMatchResult}
                disabled={!canSubmitModalSeries()}
                class="px-8 py-2.5 text-sm font-bold rounded-lg transition-all {canSubmitModalSeries() ? 'bg-gradient-to-r from-cyber-green to-emerald-500 text-space-900 hover:scale-105 shadow-lg shadow-cyber-green/30' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}"
              >
                {#if canSubmitModalSeries()}
                  <svg class="w-5 h-5 inline-block mr-2" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                  Submit Result ({seriesScore.team1Wins}-{seriesScore.team2Wins})
                {:else if hasAnyTie()}
                  Ties Not Allowed
                {:else}
                  Need {Math.ceil(mapsPerMatch / 2)} Game Winners
                {/if}
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}

  <!-- Confetti (shows on champion declaration) -->
  <Confetti bind:show={showConfetti} duration={5000} />
  <Footer />
</div>