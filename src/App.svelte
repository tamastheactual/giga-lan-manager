<script lang="ts">
  import Layout from './Layout.svelte';
  import TournamentList from './pages/TournamentList.svelte';
  import TournamentDashboard from './pages/TournamentDashboard.svelte';
  import Groups from './pages/Groups.svelte';
  import Brackets from './pages/Brackets.svelte';
  import Statistics from './pages/Statistics.svelte';

  const path = window.location.pathname;
  const pathParts = path.split('/').filter(p => p);

  let tournamentId: string | null = null;
  let page: string | null = null;

  if (pathParts[0] === 'tournament') {
    tournamentId = pathParts[1];
    page = pathParts[2] || null;
  } else {
    page = pathParts[0] || null;
  }
</script>

<Layout {tournamentId}>
  {#if path === '/' || path === ''}
    <TournamentList />
  {:else if path.startsWith('/tournament/') && !page && tournamentId}
    <TournamentDashboard tournamentId={tournamentId!} />
  {:else if path.startsWith('/tournament/') && page === 'groups' && tournamentId}
    <Groups tournamentId={tournamentId!} />
  {:else if path.startsWith('/tournament/') && page === 'brackets' && tournamentId}
    <Brackets tournamentId={tournamentId!} />
  {:else if path.startsWith('/tournament/') && page === 'statistics' && tournamentId}
    <Statistics tournamentId={tournamentId!} />
  {:else}
    <div class="text-center mt-10">
      <h1 class="text-2xl font-bold">404 Not Found</h1>
      <a href="/" class="text-blue-500 underline">Go Home</a>
    </div>
  {/if}
</Layout>