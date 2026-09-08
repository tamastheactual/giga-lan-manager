<script lang="ts">
  import { onMount } from 'svelte';
  import { joinByCode, normalizeCode, JOIN_CODE_LENGTH } from '$lib/api';
  import logoImg from '../assets/logo.svg';
  import Footer from '../components/Footer.svelte';

  // A code from the URL (/t/7K2QMX) is resolved immediately; without one we
  // just show the box so someone can type the code they were given.
  let { code = '' } = $props<{ code?: string }>();

  let entered = $state(normalizeCode(code));
  let resolving = $state(false);
  let error = $state('');

  async function go() {
    const clean = normalizeCode(entered);
    if (clean.length !== JOIN_CODE_LENGTH) {
      error = `A join code is ${JOIN_CODE_LENGTH} characters.`;
      return;
    }
    resolving = true;
    error = '';
    try {
      const info = await joinByCode(clean);
      window.location.href = `/tournament/${info.id}`;
    } catch (e: any) {
      error = e.message || 'Could not find that tournament.';
      resolving = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') go();
  }

  onMount(() => {
    if (normalizeCode(code).length === JOIN_CODE_LENGTH) go();
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 flex flex-col items-center justify-center px-6">
  <img src={logoImg} alt="AI Department" class="h-16 w-auto mb-6" />

  <div class="glass rounded-2xl p-8 w-full max-w-md">
    {#if resolving}
      <h1 class="text-xl font-bold text-white mb-2">Opening tournament…</h1>
      <p class="text-sm text-gray-400">Looking up code {normalizeCode(entered)}</p>
    {:else}
      <h1 class="text-2xl font-black gradient-text mb-2">Join a tournament</h1>
      <p class="text-sm text-gray-400 mb-6">
        Enter the {JOIN_CODE_LENGTH}-character code from the organiser to follow the
        brackets, standings and stats live.
      </p>

      <label for="join-code" class="block text-xs font-bold text-gray-300 tracking-wider mb-2">JOIN CODE</label>
      <input
        id="join-code"
        bind:value={entered}
        onkeydown={onKeydown}
        placeholder="7K2QMX"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        maxlength="16"
        class="w-full p-4 rounded-xl bg-space-700 text-white text-center text-2xl font-mono tracking-[0.3em] uppercase placeholder-gray-600 border border-space-600 focus:border-cyber-green outline-none"
      />

      {#if error}
        <p class="text-loss text-sm mt-3">{error}</p>
      {/if}

      <button
        onclick={go}
        class="w-full mt-5 bg-cyber-green text-black py-3 rounded-xl font-bold hover:brightness-110 transition"
      >
        Open tournament
      </button>

      <p class="text-xs text-gray-500 mt-5 text-center">
        A join code gives you a live view. Only the organiser can enter results.
      </p>
    {/if}
  </div>

  <Footer />
</div>
