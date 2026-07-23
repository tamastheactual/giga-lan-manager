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

test('team highlight avatars resolve to the player image, not the default', async ({ page, request }) => {
  test.setTimeout(90_000); // heavy setup: seeds a full team tournament via the API
  // Players named from the bundled image map so their avatars resolve to a real
  // image (before the fix these cards passed the UUID to a name lookup -> Cat.jpg).
  const names = ['Tamás', 'Viktor', 'Zoli', 'Kristóf', 'Márk', 'Milán', 'Hunor', 'Imi'];
  const created = await (await request.post(`${API}/tournaments`, { data: { name: 'Team Avatars E2E', gameType: 'cs16', teamMode: true } })).json();
  const id = created.id as string;

  const pid: Record<string, string> = {};
  for (const n of names) pid[n] = (await (await request.post(`${API}/tournament/${id}/players`, { data: { name: n } })).json()).id;
  const teamDefs = [['Tamás', 'Viktor'], ['Zoli', 'Kristóf'], ['Márk', 'Milán'], ['Hunor', 'Imi']];
  for (let i = 0; i < teamDefs.length; i++) {
    await request.post(`${API}/tournament/${id}/teams`, { data: { name: `Team ${i + 1}`, playerIds: teamDefs[i].map((n) => pid[n]) } });
  }
  await request.post(`${API}/tournament/${id}/start-team`);

  const tamas = pid['Tamás'];
  const st = await (await request.get(`${API}/tournament/${id}/state`)).json();
  const teamPlayers: Record<string, string[]> = Object.fromEntries(st.teams.map((t: any) => [t.id, t.playerIds]));
  // Give Tamás the most kills across every game so he is the clear MVP.
  for (const m of st.teamMatches) {
    const playerStats = [...teamPlayers[m.team1Id], ...teamPlayers[m.team2Id]].map((p) => ({ playerId: p, kills: p === tamas ? 30 : 8, deaths: 5 }));
    await request.post(`${API}/tournament/${id}/team-match/${m.id}`, {
      data: { team1Score: 16, team2Score: 10, games: [{ gameNumber: 1, mapName: 'de_dust2', team1Score: 16, team2Score: 10, winnerTeamId: m.team1Id, playerStats }] },
    });
  }
  await request.post(`${API}/tournament/${id}/team-brackets`);
  for (let i = 0; i < 20; i++) {
    const s = await (await request.get(`${API}/tournament/${id}/state`)).json();
    const next = s.teamBracketMatches.find((mm: any) => mm.team1Id && mm.team2Id && !mm.winnerId);
    if (!next) break;
    await request.post(`${API}/tournament/${id}/team-bracket-match/${next.id}`, { data: { winnerId: next.team1Id } });
  }

  await page.goto(`/tournament/${id}/statistics`);
  // The MVP highlights live under the "Individual Stats" view.
  await page.getByRole('button', { name: /individual stats/i }).click();
  // Tamás is the MVP; his highlight-card avatar must resolve from his NAME
  // (any real image / name-based fallback), never the playerId -> Cat default.
  const avatar = page.locator('img[alt="Tamás"]').first();
  await expect(avatar).toBeVisible({ timeout: 15_000 });
  const src = await avatar.getAttribute('src');
  expect(src, `avatar src was: ${src}`).not.toContain('Cat');
});
