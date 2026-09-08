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
    } catch (e) { /* status unavailable - leave auth hidden */ }
  });
  function signOut() {
    // No session to destroy: forget the token this browser holds.
    signOutOwner();
    window.location.href = '/';
  }

  // Which page is actually open. The nav used to render LOBBY as a permanent
  // gradient pill, so it read as "you are here" on every page including the
  // ones it wasn't -- which is why you could not tell where you were.
  const path = typeof window === 'undefined' ? '/' : window.location.pathname;
  const parts = path.split('/').filter(Boolean);
  const section =
    parts[0] === 'tournament' ? (parts[2] ?? 'dashboard') :
    parts[0] === 't'          ? 'dashboard' :
    parts[0] ?? 'lobby';
  /** @param {string} id */
  const isCurrent = (id) => section === id;
</script>

<nav class="w-full bg-space-900/95 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-6 py-2.5">
    <div class="flex items-center justify-between gap-4">
      <a href="/" class="flex items-center gap-3 hover:opacity-90 transition-opacity flex-shrink-0">
        <img src={logoImg} alt="" class="h-10 w-auto" />
        <div class="leading-tight">
          <span class="text-base font-black text-gaming-text block">AI DEPARTMENT</span>
          <span class="text-[10px] text-accent font-bold tracking-[0.18em]">LAN SERIES</span>
        </div>
      </a>

      <div class="flex items-center gap-1 overflow-x-auto">
        <a href="/" class="nav-link" class:nav-link-active={isCurrent('lobby')}>Lobby</a>
        {#if tournamentId}
          <span class="w-px h-4 bg-white/10 mx-1.5" aria-hidden="true"></span>
          <a href={`/tournament/${tournamentId}`} class="nav-link" class:nav-link-active={isCurrent('dashboard')}>Overview</a>
          <a href={`/tournament/${tournamentId}/groups`} class="nav-link" class:nav-link-active={isCurrent('groups')}>Groups</a>
          <a href={`/tournament/${tournamentId}/brackets`} class="nav-link" class:nav-link-active={isCurrent('brackets')}>Brackets</a>
          <a href={`/tournament/${tournamentId}/statistics`} class="nav-link" class:nav-link-active={isCurrent('statistics')}>Stats</a>
        {/if}
      </div>

      <!-- Who you are, always visible, rather than inferred from whether a
           SIGN OUT link happens to be present. -->
      <div class="flex items-center gap-2 flex-shrink-0">
        {#if auth.isOwner}
          <span class="chip chip-organiser" title="This browser holds the instance admin token">
            <span class="chip-dot"></span>Organiser
          </span>
          <button onclick={signOut} class="btn btn-ghost !px-2.5 !py-1.5 !text-xs">Sign out</button>
        {:else}
          <span class="chip chip-viewer"><span class="chip-dot"></span>Viewing</span>
          <a href="/join" class="btn btn-ghost !px-2.5 !py-1.5 !text-xs">Join</a>
          {#if auth.authRequired}
            <a href="/login" class="btn btn-secondary !px-2.5 !py-1.5 !text-xs">Organiser</a>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</nav>

<!-- Full Width Main Content -->
<main class="w-full">
  {@render children()}
</main>