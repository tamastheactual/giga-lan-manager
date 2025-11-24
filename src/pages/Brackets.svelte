<script lang="ts">
  import { onMount } from 'svelte';
  import { getState, submitBracketWinner } from '$lib/api';

  let { tournamentId } = $props<{ tournamentId: string }>();

  let bracketMatches = $state([]) as any[];
  let players = $state([]) as any[];
  let tournamentState = $state('');
  let champion = $state(null) as any;

  async function loadState() {
    const data = await getState(tournamentId);
    // With $state, direct assignment triggers reactivity
    bracketMatches = data.bracketMatches;
    players = data.players;
    tournamentState = data.state;

    // Find champion (winner of finals)
    const final = bracketMatches.find(m => m.bracketType === 'finals');
    if (final?.winnerId) {
      champion = players.find(p => p.id === final.winnerId);
    }
  }

  function getPlayerName(id: string) {
    if (!id) return 'TBD';
    return players.find(p => p.id === id)?.name || 'Unknown';
  }

  function getPlayer(id: string) {
    return players.find(p => p.id === id);
  }
  
  function getRunnerUp() {
    const final = bracketMatches.find(m => m.bracketType === 'finals');
    if (final?.winnerId) {
      const loserId = final.player1Id === final.winnerId ? final.player2Id : final.player1Id;
      return players.find(p => p.id === loserId);
    }
    return null;
  }
  
  function getThirdPlace() {
    const thirdPlaceMatch = bracketMatches.find(m => m.bracketType === '3rd-place');
    if (thirdPlaceMatch?.winnerId) {
      return players.find(p => p.id === thirdPlaceMatch.winnerId);
    }
    return null;
  }

  async function handleWinner(matchId: string, winnerId: string) {
      if (!winnerId) return;
      console.log('Selecting winner:', { matchId, winnerId });
      try {
        await submitBracketWinner(tournamentId, matchId, winnerId);
        console.log('Winner submitted successfully');
        await loadState();
        console.log('State reloaded, bracketMatches:', bracketMatches.length);
       } catch (error) {
         console.error('Error selecting winner:', error);
       }
   }

  function getRounds() {
      const rounds = [...new Set(bracketMatches.map(m => m.round))].sort((a, b) => a - b);
      return rounds;
  }

  function getMatchesForRound(round: number) {
      return bracketMatches.filter(m => m.round === round);
  }

  function getRoundLabel(round: number, totalRounds: number) {
    const roundMatches = getMatchesForRound(round);
    const hasThirdPlace = roundMatches.some(m => m.bracketType === '3rd-place');
    
    // Check bracket types in this round
    if (roundMatches.some(m => m.bracketType === 'finals')) {
      return 'Finals';
    }
    if (roundMatches.some(m => m.bracketType === 'semifinals')) {
      return 'Semifinals';
    }
    if (roundMatches.some(m => m.bracketType === 'quarterfinals')) {
      return 'Quarterfinals';
    }
    if (hasThirdPlace) {
      return '3rd Place';
    }
    return `Round ${round}`;
  }

  onMount(loadState);
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 text-gaming-text px-3 py-3">
  <div class="max-w-[1800px] mx-auto">
    
    <!-- Header -->
    <div class="flex justify-between items-center mb-3">
      <div>
        <a href={`/tournament/${tournamentId}/groups`} class="text-gray-400 hover:text-cyber-green transition-colors mb-1 inline-block text-xs flex items-center gap-1">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          Back
        </a>
        <h1 class="text-xl font-black gradient-text flex items-center gap-1.5">
          <svg class="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
          PLAYOFFS BRACKET
        </h1>
      </div>
    </div>

    {#if tournamentState !== 'playoffs' && tournamentState !== 'completed'}
      <div class="glass rounded-lg p-8 text-center">
        <svg class="w-12 h-12 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <p class="text-base text-gray-400 mb-1">Playoffs have not started yet</p>
        <p class="text-gray-500 text-xs">Complete the group stage to generate brackets</p>
      </div>
    {:else}
      
      <!-- Immersive Champion Podium -->
      {#if champion}
        <div class="mb-6">
          <!-- Trophy and Celebration -->
          <div class="text-center mb-4">
            <div class="relative inline-block">
              <svg class="w-16 h-16 mx-auto mb-2 text-yellow-400 drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
              <!-- Confetti effect -->
              <div class="absolute -top-2 -left-2 w-20 h-20 pointer-events-none">
                <div class="absolute top-0 left-1/2 w-1 h-1 bg-yellow-400 rounded-full animate-ping"></div>
                <div class="absolute top-2 left-1/4 w-1 h-1 bg-yellow-300 rounded-full animate-ping" style="animation-delay: 0.2s"></div>
                <div class="absolute top-1 right-1/4 w-1 h-1 bg-yellow-500 rounded-full animate-ping" style="animation-delay: 0.4s"></div>
              </div>
            </div>
            <h2 class="text-2xl font-black mb-2 bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500 bg-clip-text text-transparent">
              🏆 TOURNAMENT CHAMPION 🏆
            </h2>
          </div>

          <!-- Podium Layout -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl mx-auto">
            <!-- 2nd Place (Left) -->
            {#if getRunnerUp()}
              {@const runnerUp = getRunnerUp()}
              <div class="order-2 md:order-1 relative">
                <div class="glass rounded-lg p-4 text-center relative overflow-hidden transform hover:scale-105 transition-all duration-300">
                  <div class="absolute inset-0 bg-gradient-to-br from-gray-400/20 via-gray-300/20 to-gray-400/20"></div>
                  <div class="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-gray-400 to-gray-500"></div>
                  <div class="relative z-10">
                    <div class="text-4xl mb-1">🥈</div>
                    <div class="w-12 h-12 mx-auto mb-2 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center shadow-lg">
                      <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                    </div>
                    <h3 class="text-sm font-black text-gray-300 mb-1">2ND PLACE</h3>
                    <div class="text-lg font-black text-white mb-1">{runnerUp.name}</div>
                    <div class="text-gray-400 text-xs font-bold">{runnerUp.points} Points</div>
                  </div>
                </div>
                <!-- Podium height indicator -->
                <div class="h-4 bg-gradient-to-r from-gray-400 to-gray-500 rounded-b-lg mx-2"></div>
              </div>
            {/if}

            <!-- 1st Place (Center) -->
            <div class="order-1 md:order-2 relative">
              <div class="glass rounded-lg p-6 text-center relative overflow-hidden transform hover:scale-105 transition-all duration-300 shadow-2xl">
                <div class="absolute inset-0 bg-gradient-to-br from-yellow-500/20 via-yellow-400/20 to-yellow-500/20"></div>
                <div class="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600"></div>
                <div class="relative z-10">
                  <div class="text-5xl mb-2">👑</div>
                  <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-xl ring-4 ring-yellow-400/30">
                    <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                  </div>
                  <h3 class="text-lg font-black bg-gradient-to-r from-yellow-400 to-yellow-500 bg-clip-text text-transparent mb-2">CHAMPION</h3>
                  <div class="text-2xl font-black text-white mb-2">{champion.name}</div>
                  <div class="text-cyber-green text-sm font-bold">{champion.points} Points</div>
                  <div class="mt-2 px-3 py-1 bg-yellow-500/20 rounded-full text-yellow-400 text-xs font-bold">🏆 VICTORIOUS 🏆</div>
                </div>
              </div>
              <!-- Podium height indicator -->
              <div class="h-8 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 rounded-b-lg mx-2"></div>
            </div>

            <!-- 3rd Place (Right) -->
            {#if getThirdPlace()}
              {@const thirdPlace = getThirdPlace()}
              <div class="order-3 relative">
                <div class="glass rounded-lg p-4 text-center relative overflow-hidden transform hover:scale-105 transition-all duration-300">
                  <div class="absolute inset-0 bg-gradient-to-br from-orange-500/20 via-orange-400/20 to-orange-500/20"></div>
                  <div class="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-orange-400 to-orange-500"></div>
                  <div class="relative z-10">
                    <div class="text-4xl mb-1">🥉</div>
                    <div class="w-12 h-12 mx-auto mb-2 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg">
                      <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                    </div>
                    <h3 class="text-sm font-black text-orange-400 mb-1">3RD PLACE</h3>
                    <div class="text-lg font-black text-white mb-1">{thirdPlace.name}</div>
                    <div class="text-orange-400 text-xs font-bold">{thirdPlace.points} Points</div>
                  </div>
                </div>
                <!-- Podium height indicator -->
                <div class="h-2 bg-gradient-to-r from-orange-400 to-orange-500 rounded-b-lg mx-2"></div>
              </div>
            {/if}
          </div>

          <!-- Victory Message -->
          <div class="text-center mt-4">
            <div class="inline-block glass rounded-lg px-6 py-3 bg-gradient-to-r from-yellow-500/10 to-yellow-400/10 border border-yellow-400/20">
              <p class="text-yellow-400 font-bold text-sm">🎉 Congratulations to all participants! 🎉</p>
            </div>
          </div>
        </div>
      {/if}

      <div class="space-y-6">
        
        <!-- Playoff Bracket -->
        <div class="glass rounded-lg p-3">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-1 h-4 bg-gradient-to-b from-cyber-green to-cyber-blue rounded-full"></div>
            <h2 class="text-base font-black text-white">PLAYOFF BRACKET</h2>
            <div class="text-xs px-2 py-0.5 bg-cyber-green/20 text-cyber-green rounded-full font-bold">Single Elimination</div>
          </div>
          
          <div class="relative">
            <div class="flex gap-4 overflow-x-auto pb-2">
              {#each getRounds() as round, roundIndex}
                {@const roundMatches = getMatchesForRound(round)}
                {@const totalRounds = getRounds().length}
                <div class="flex-shrink-0 w-64 flex flex-col justify-around gap-3 relative">
                  <div class="text-center mb-2">
                    <h3 class="font-black text-sm text-cyber-blue">
                      {getRoundLabel(round, totalRounds)}
                    </h3>
                  </div>
                  
                  {#each roundMatches as match, matchIndex}
                    {@const player1 = getPlayer(match.player1Id)}
                    {@const player2 = getPlayer(match.player2Id)}
                    
                    <div class="relative">
                      {#if roundIndex < totalRounds - 1 && match.bracketType !== 'third-place'}
                        <svg class="absolute left-full top-1/2 w-4 h-12 -translate-y-1/2 pointer-events-none z-0" style="margin-left: -1px;">
                          <path d="M 0 0 L 16 0" stroke="#334155" stroke-width="1" fill="none"/>
                        </svg>
                      {/if}

                      <div class="glass rounded-lg overflow-hidden relative z-10">
                        <div class="bg-gradient-to-r from-space-700 to-space-800 px-2 py-1 text-center">
                          <span class="text-xs font-bold text-gray-400">{match.matchLabel || `M${matchIndex + 1}`}</span>
                        </div>

                        <!-- Player 1 -->
                        <button 
                          type="button"
                          class="w-full text-left px-2 py-1.5 border-b border-space-600 transition-all cursor-pointer {match.winnerId === match.player1Id ? 'bg-cyber-green/20 ring-1 ring-cyber-green' : ''} {match.winnerId && match.winnerId !== match.player1Id ? 'opacity-40' : 'hover:bg-space-700/50 hover:ring-1 hover:ring-cyber-green/50'}"
                          onclick={(e) => { e.stopPropagation(); if (!match.winnerId && match.player1Id) handleWinner(match.id, match.player1Id); }}
                          disabled={!!match.winnerId || !match.player1Id}
                        >
                          <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1.5">
                              <div class="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                                <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                              </div>
                              <div>
                                <div class="font-bold text-xs text-white">{getPlayerName(match.player1Id)}</div>
                                {#if player1}
                                  <div class="text-xs text-gray-400">{player1.points}pts</div>
                                {/if}
                              </div>
                            </div>
                            {#if match.winnerId === match.player1Id}
                              <svg class="w-4 h-4 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                            {/if}
                          </div>
                        </button>
                        
                        <!-- Player 2 -->
                        <button 
                          type="button"
                          class="w-full text-left px-2 py-1.5 transition-all cursor-pointer {match.winnerId === match.player2Id ? 'bg-cyber-green/20 ring-1 ring-cyber-green' : ''} {match.winnerId && match.winnerId !== match.player2Id ? 'opacity-40' : 'hover:bg-space-700/50 hover:ring-1 hover:ring-cyber-green/50'}"
                          onclick={(e) => { e.stopPropagation(); if (!match.winnerId && match.player2Id) handleWinner(match.id, match.player2Id); }}
                          disabled={!!match.winnerId || !match.player2Id}
                        >
                          <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1.5">
                              <div class="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
                              </div>
                              <div>
                                <div class="font-bold text-xs text-white">{getPlayerName(match.player2Id)}</div>
                                {#if player2}
                                  <div class="text-xs text-gray-400">{player2.points}pts</div>
                                {/if}
                              </div>
                            </div>
                            {#if match.winnerId === match.player2Id}
                              <svg class="w-4 h-4 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                            {/if}
                          </div>
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
