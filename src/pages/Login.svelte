<script lang="ts">
  import { onMount } from 'svelte';
  import { verifyOwnerToken, getAdminStatus } from '$lib/api';
  import Footer from '../components/Footer.svelte';

  let token = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit() {
    if (!token.trim()) return;
    busy = true;
    error = '';
    try {
      await verifyOwnerToken(token.trim());
      window.location.href = '/';
    } catch (e: any) {
      error = e.message || 'That admin token is not valid';
      busy = false;
    }
  }

  onMount(async () => {
    // Already the organiser on this device, or no token configured at all.
    try {
      const status = await getAdminStatus();
      if (status.isOwner) window.location.href = '/';
    } catch {
      /* leave the form up */
    }
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 flex flex-col items-center justify-center px-6">
  <div class="glass rounded-2xl p-8 w-full max-w-md">
    <h1 class="text-2xl font-black gradient-text mb-2">Organiser access</h1>
    <p class="text-sm text-gray-400 mb-6">
      Paste the admin token for this server to create tournaments. Generate one with
      <code class="text-brand-cyan">npm run gen-token</code>.
    </p>

    <label for="admin-token" class="block text-xs font-bold text-gray-300 tracking-wider mb-2">ADMIN TOKEN</label>
    <input
      id="admin-token"
      type="password"
      bind:value={token}
      onkeydown={(e) => e.key === 'Enter' && submit()}
      placeholder="Paste your admin token"
      autocomplete="off"
      spellcheck="false"
      class="w-full p-3 rounded-xl bg-space-700 text-white font-mono border border-space-600 focus:border-cyber-green outline-none"
    />

    {#if error}
      <p class="text-loss text-sm mt-3">{error}</p>
    {/if}

    <button
      onclick={submit}
      disabled={busy || !token.trim()}
      class="w-full mt-5 bg-cyber-green text-black py-3 rounded-xl font-bold hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? 'Checking…' : 'Continue'}
    </button>

    <p class="text-xs text-gray-500 mt-6">
      Only looking to watch a tournament? You want a
      <a href="/join" class="text-brand-cyan hover:text-cyber-green underline">join code</a> instead.
    </p>
  </div>

  <Footer />
</div>
