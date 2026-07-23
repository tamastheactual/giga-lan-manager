import { test, expect } from '@playwright/test';

const API = 'http://localhost:3000/api';

test('home page renders the tournament list', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /create new tournament/i })).toBeVisible();
});

test('a tournament can be created through the UI', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /create new tournament/i }).click();
  const name = 'E2E Cup ' + Date.now();
  await page.getByPlaceholder(/tournament name/i).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  // The create flow navigates to the new tournament's dashboard.
  await expect(page).toHaveURL(/\/tournament\/[0-9a-f-]{36}/, { timeout: 15_000 });
});

test('the statistics page renders for a completed tournament', async ({ page, request }) => {
  // Seed a full solo tournament through the API (fast), then load its stats page.
  const created = await (await request.post(`${API}/tournaments`, { data: { name: 'Stats E2E', gameType: 'cs16' } })).json();
  const id = created.id as string;
  const players = ['Ann', 'Bo', 'Cy', 'Di'];
  for (const n of players) await request.post(`${API}/tournament/${id}/players`, { data: { name: n } });
  await request.post(`${API}/tournament/${id}/start`);

  const state = await (await request.get(`${API}/tournament/${id}/state`)).json();
  for (const m of state.matches) {
    await request.post(`${API}/tournament/${id}/match/${m.id}`, {
      data: { results: { [m.player1Id]: { points: 3, score: 16 }, [m.player2Id]: { points: 0, score: 10 } } },
    });
  }
  await request.post(`${API}/tournament/${id}/brackets`);

  // Play the bracket to a champion.
  for (let i = 0; i < 20; i++) {
    const s = await (await request.get(`${API}/tournament/${id}/state`)).json();
    const next = s.bracketMatches.find((m: any) => m.player1Id && m.player2Id && !m.winnerId);
    if (!next) break;
    await request.post(`${API}/tournament/${id}/bracket-match/${next.id}`, { data: { winnerId: next.player1Id } });
  }

  // The 5,359-line Statistics component must render without crashing and show data.
  await page.goto(`/tournament/${id}/statistics`);
  await expect(page.locator('body')).not.toContainText('404 Not Found');
  await expect(page.locator('body')).toContainText(players[0]);
});
