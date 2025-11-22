<script lang="ts">
  import Layout from './Layout.svelte';
  import Home from './pages/Home.svelte';
  import Groups from './pages/Groups.svelte';
  import Brackets from './pages/Brackets.svelte';

  const path = window.location.pathname;
</script>

<Layout>
  {#if path === '/' || path === ''}
    <Home />
  {:else if path.startsWith('/groups')}
    <Groups />
  {:else if path.startsWith('/brackets')}
    <Brackets />
  {:else}
    <div class="text-center mt-10">
      <h1 class="text-2xl font-bold">404 Not Found</h1>
      <a href="/" class="text-blue-500 underline">Go Home</a>
    </div>
  {/if}
</Layout>

