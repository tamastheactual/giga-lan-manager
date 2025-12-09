<script lang="ts">
  import { onMount } from 'svelte';
  import Footer from '../components/Footer.svelte';
  let password = '';
  let error = '';

  async function login() {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (res.ok) {
      window.location.href = '/';
    } else {
      error = 'Invalid password';
    }
  }

  onMount(() => {
    // Redirect if already logged in
    fetch('/api/admin/status').then(res => res.json()).then(data => {
      if (data.isAdmin) window.location.href = '/';
    });
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-space-900 via-space-800 to-space-900 flex flex-col items-center justify-center">
  <div class="glass rounded-lg p-8 w-full max-w-md">
    <h1 class="text-2xl font-bold text-white mb-4">Admin Login</h1>
    <input
      type="password"
      bind:value={password}
      placeholder="Password"
      class="w-full p-3 rounded bg-space-700 text-white mb-4"
    />
    {#if error}
      <p class="text-red-400 mb-4">{error}</p>
    {/if}
    <button onclick={login} class="w-full bg-cyber-green text-black py-3 rounded font-bold">
      Login
    </button>
  </div>
  
  <Footer />
</div>