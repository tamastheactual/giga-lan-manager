<script>
  import './app.css';
  import logoImg from './assets/logo.png';
  import { onMount } from 'svelte';
  import { getAdminStatus, signOutOwner } from '$lib/api';
  let { children, tournamentId } = $props();

  let auth = $state({ authRequired: false, isAdmin: false, isOwner: false });
  onMount(async () => {
    try {
      auth = await getAdminStatus();
    } catch (e) { /* status unavailable — leave auth hidden */ }
  });
  function signOut() {
    // No session to destroy: forget the token this browser holds.
    signOutOwner();
    window.location.href = '/';
  }
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
        <a href="/" class="text-sm font-bold px-4 py-2 rounded-xl bg-gradient-to-r from-brand-purple via-brand-blue to-brand-cyan text-white shadow-lg shadow-brand-purple/30 hover:shadow-brand-cyan/40 hover:scale-105 transition-all duration-300">LOBBY</a>
        {#if tournamentId}
          <a href={`/tournament/${tournamentId}`} class="text-sm font-bold text-cyber-green hover:text-brand-orange hover:scale-105 transition-all duration-200">DASHBOARD</a>
          <a href={`/tournament/${tournamentId}/groups`} class="text-sm font-bold text-cyber-green hover:text-brand-orange hover:scale-105 transition-all duration-200">GROUPS</a>
          <a href={`/tournament/${tournamentId}/brackets`} class="text-sm font-bold text-cyber-green hover:text-brand-orange hover:scale-105 transition-all duration-200">BRACKETS</a>
          <a href={`/tournament/${tournamentId}/statistics`} class="text-sm font-bold text-cyber-green hover:text-brand-orange hover:scale-105 transition-all duration-200">STATISTICS</a>
        {/if}
        {#if auth.authRequired}
          {#if auth.isOwner}
            <button onclick={signOut} class="text-sm font-bold text-brand-orange hover:text-cyber-green transition-colors">SIGN OUT</button>
          {:else}
            <a href="/login" class="text-sm font-bold text-brand-orange hover:text-cyber-green transition-colors">🔒 ORGANISER</a>
          {/if}
        {/if}
        <a href="/join" class="text-sm font-bold text-gray-400 hover:text-cyber-green transition-colors">JOIN</a>
      </div>
    </div>
  </div>
</nav>

<!-- Full Width Main Content -->
<main class="w-full">
  {@render children()}
</main>