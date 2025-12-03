<script lang="ts">
  import './app.css';
  import logoImg from './assets/logo.png';
  let { children, tournamentId } = $props();
</script>

<!-- Professional Gaming Navbar -->
<nav class="w-full bg-space-900/98 backdrop-blur-xl border-b border-cyber-green/30 sticky top-0 z-50 shadow-xl">
  <div class="max-w-7xl mx-auto px-6 py-2">
    <div class="flex items-center justify-between">
      <a href="/" class="flex items-center gap-3 hover:opacity-90 transition-opacity">
        <img src={logoImg} alt="AI Department Logo" class="h-12 w-auto" />
        <div>
          <span class="text-lg font-black gradient-text block leading-tight">AI DEPARTMENT</span>
          <span class="text-xs text-cyber-green font-bold tracking-wider">LAN SERIES</span>
        </div>
      </a>
      
      <div class="flex items-center gap-6">
<<<<<<< HEAD
        <a href="/" class="text-sm font-black gradient-text hover:scale-105 transition-all duration-200">Lobby</a>
        {#if tournamentId}
          <a href={`/tournament/${tournamentId}`} class="text-sm font-black gradient-text hover:scale-105 transition-all duration-200">Dashboard</a>
          <a href={`/tournament/${tournamentId}/groups`} class="text-sm font-black gradient-text hover:scale-105 transition-all duration-200">Groups</a>
          <a href={`/tournament/${tournamentId}/brackets`} class="text-sm font-black gradient-text hover:scale-105 transition-all duration-200">Brackets</a>
          <a href={`/tournament/${tournamentId}/statistics`} class="text-sm font-black gradient-text hover:scale-105 transition-all duration-200">Statistics</a>
=======
        <a href="/" class="text-sm font-bold px-4 py-2 rounded-xl bg-gradient-to-r from-brand-purple via-brand-blue to-brand-cyan text-white shadow-lg shadow-brand-purple/30 hover:shadow-brand-cyan/40 hover:scale-105 transition-all duration-300">Lobby</a>
    </div>
  </div>
</nav>

<!-- Admin Login / Logout -->
<div class="max-w-7xl mx-auto px-6 py-3 text-right">
    <button onclick={logout} class="text-sm text-red-400 hover:text-red-300">Logout</button>
  {:else}
    <a href="/login" class="text-sm text-cyber-blue hover:text-cyber-green">Admin Login</a>
  {/if}
</div>

<!-- Full Width Main Content -->
<main class="w-full">
  {@render children()}
</main>
