<script>
  import './app.css';
  let { children, tournamentId } = $props();
</script>

<!-- Professional Gaming Navbar -->
<nav class="w-full bg-space-900/98 backdrop-blur-xl border-b border-cyber-green/40 sticky top-0 z-50 shadow-xl">
  <div class="max-w-7xl mx-auto px-6 py-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <svg class="w-8 h-8 text-cyber-green" fill="currentColor" viewBox="0 0 20 20"><path d="M10 3.5a6.5 6.5 0 106.5 6.5h-2a4.5 4.5 0 11-4.5-4.5V3.5z"/></svg>
        <div>
          <span class="text-lg font-black gradient-text block leading-tight">AI DEPARTMENT</span>
          <span class="text-xs text-cyber-green font-bold tracking-wider">GIGA LAN</span>
        </div>
      </div>
      
      <div class="flex items-center gap-6">
        <a href="/" class="text-sm font-black gradient-text hover:scale-105 transition-all duration-200">Lobby</a>
        {#if tournamentId}
          <a href={`/tournament/${tournamentId}`} class="text-sm font-black gradient-text hover:scale-105 transition-all duration-200">Dashboard</a>
          <a href={`/tournament/${tournamentId}/groups`} class="text-sm font-black gradient-text hover:scale-105 transition-all duration-200">Groups</a>
          <a href={`/tournament/${tournamentId}/brackets`} class="text-sm font-black gradient-text hover:scale-105 transition-all duration-200">Brackets</a>
        {/if}
      </div>
    </div>
  </div>
</nav>

<!-- Full Width Main Content -->
<main class="w-full">
  {@render children()}
</main>
