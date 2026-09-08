import { test, expect, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3000/api';

/**
 * Create a tournament and keep its credentials. Every write to a tournament now
 * needs that tournament's admin key in X-Admin-Key -- knowing the id is only
 * enough to read.
 */
async function createTournament(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ id: string; joinCode: string; adminKey: string; headers: Record<string, string> }> {
  const res = await request.post(`${API}/tournaments`, { data });
  expect(res.ok(), await res.text()).toBeTruthy();
  const created = await res.json();
  return {
    id: created.id,
    joinCode: created.joinCode,
    adminKey: created.adminKey,
    headers: { 'X-Admin-Key': created.adminKey },
  };
}

test('home page renders the tournament list', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /create new tournament/i })).toBeVisible();
});

test('a tournament can be created through the UI and hands over its credentials', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /create new tournament/i }).click();
  const name = 'E2E Cup ' + Date.now();
  await page.getByPlaceholder(/tournament name/i).fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  // Creation now surfaces the join code and the admin key before navigating --
  // the key is shown exactly once and is never retrievable again.
  await expect(page.getByText(/join code/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/shown once/i)).toBeVisible();

  await page.getByRole('button', { name: /open tournament/i }).click();
  await expect(page).toHaveURL(/\/tournament\/[0-9a-f-]{36}/, { timeout: 15_000 });
});

test('a join code opens the tournament read-only', async ({ page, request }) => {
  const { id, joinCode } = await createTournament(request, {
    name: 'Join Flow ' + Date.now(),
    gameType: 'cs16',
  });
  expect(joinCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);

  // The short link a player is given resolves to the tournament.
  await page.goto(`/t/${joinCode}`);
  await expect(page).toHaveURL(new RegExp(`/tournament/${id}`), { timeout: 15_000 });

  // ...and it is a viewer's session: no editing offered, and it says so.
  await expect(page.getByText(/only the organiser can enter results/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^add player$/i })).toHaveCount(0);
});

test('writes are refused without the admin key and accepted with it', async ({ request }) => {
  const { id, headers } = await createTournament(request, {
    name: 'Key Gate ' + Date.now(),
    gameType: 'cs16',
  });

  const noKey = await request.post(`${API}/tournament/${id}/players`, { data: { name: 'Nope' } });
  expect(noKey.status()).toBe(401);

  const wrongKey = await request.post(`${API}/tournament/${id}/players`, {
    data: { name: 'Nope' },
    headers: { 'X-Admin-Key': 'ZZZZZZZZZZZZZZZZZZZZZZZZZZ' },
  });
  expect(wrongKey.status()).toBe(401);

  const withKey = await request.post(`${API}/tournament/${id}/players`, {
    data: { name: 'Ann' },
    headers,
  });
  expect(withKey.ok()).toBeTruthy();

  // Reading stays open to anyone holding the id (which the join code resolves to).
  const state = await (await request.get(`${API}/tournament/${id}/state`)).json();
  expect(state.players).toHaveLength(1);
  expect(state.isAdmin).toBe(false); // no key on this read
});

test('an unknown join code is rejected', async ({ request }) => {
  const res = await request.get(`${API}/join/ZZZZZZ`);
  expect(res.status()).toBe(404);
});

test('the statistics page renders for a completed tournament', async ({ page, request }) => {
  // Seed a full solo tournament through the API (fast), then load its stats page.
  const { id, headers } = await createTournament(request, { name: 'Stats E2E ' + Date.now(), gameType: 'cs16' });
  const players = ['Ann', 'Bo', 'Cy', 'Di'];
  for (const n of players) await request.post(`${API}/tournament/${id}/players`, { data: { name: n }, headers });
  await request.post(`${API}/tournament/${id}/start`, { headers });

  const state = await (await request.get(`${API}/tournament/${id}/state`)).json();
  for (const m of state.matches) {
    const res = await request.post(`${API}/tournament/${id}/match/${m.id}`, {
      headers,
      data: { results: { [m.player1Id]: { points: 3, score: 16 }, [m.player2Id]: { points: 0, score: 10 } } },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  await request.post(`${API}/tournament/${id}/brackets`, { headers });

  // Play the bracket to a champion.
  for (let i = 0; i < 20; i++) {
    const s = await (await request.get(`${API}/tournament/${id}/state`)).json();
    const next = s.bracketMatches.find((m: any) => m.player1Id && m.player2Id && !m.winnerId);
    if (!next) break;
    await request.post(`${API}/tournament/${id}/bracket-match/${next.id}`, { headers, data: { winnerId: next.player1Id } });
  }

  // The Statistics component must render without crashing and show data.
  await page.goto(`/tournament/${id}/statistics`);
  await expect(page.locator('body')).not.toContainText('404 Not Found');
  await expect(page.locator('body')).toContainText(players[0]);
});

test('the 3rd-place match gets two different teams', async ({ request }) => {
  // Regression guard for the defect where the playoff modal's redundant winner
  // call seeded the SAME semifinal loser into both bronze slots.
  const { id, headers } = await createTournament(request, {
    name: 'Bronze ' + Date.now(), gameType: 'cs16', teamMode: true,
  });

  const pid: string[] = [];
  for (let i = 1; i <= 16; i++) {
    const p = await (await request.post(`${API}/tournament/${id}/players`, { data: { name: `P${i}` }, headers })).json();
    pid.push(p.id);
  }
  for (let t = 0; t < 8; t++) {
    await request.post(`${API}/tournament/${id}/teams`, {
      headers, data: { name: `Team ${t + 1}`, playerIds: pid.slice(t * 2, t * 2 + 2) },
    });
  }
  await request.post(`${API}/tournament/${id}/start-team`, { headers });

  let st = await (await request.get(`${API}/tournament/${id}/state`)).json();
  for (const m of st.teamMatches) {
    await request.post(`${API}/tournament/${id}/team-match/${m.id}`, {
      headers, data: { team1Score: 16, team2Score: 10 },
    });
  }
  await request.post(`${API}/tournament/${id}/team-brackets`, { headers });

  // Drive it exactly as the UI does: per-map submits, then an explicit winner call.
  for (let guard = 0; guard < 20; guard++) {
    st = await (await request.get(`${API}/tournament/${id}/state`)).json();
    const m = st.teamBracketMatches.find((x: any) => x.team1Id && x.team2Id && !x.winnerId);
    if (!m) break;
    for (const gameNumber of [1, 2]) {
      await request.post(`${API}/tournament/${id}/team-bracket-match/${m.id}/game`, {
        headers,
        data: { gameNumber, team1Score: 16, team2Score: 10, winnerTeamId: m.team1Id, playerStats: [] },
      });
    }
    await request.post(`${API}/tournament/${id}/team-bracket-match/${m.id}`, {
      headers, data: { winnerId: m.team1Id },
    });
  }

  st = await (await request.get(`${API}/tournament/${id}/state`)).json();
  const third = st.teamBracketMatches.find((m: any) => m.bracketType === '3rd-place');
  expect(third.team1Id).toBeTruthy();
  expect(third.team2Id).toBeTruthy();
  expect(third.team1Id).not.toBe(third.team2Id);
});

test('team highlight avatars resolve to the player image, not the default', async ({ page, request }) => {
  test.setTimeout(90_000); // heavy setup: seeds a full team tournament via the API
  // Full names, exactly as keyed in src/lib/playerImages.ts. Single first names
  // stopped resolving when the photo map was re-keyed to full names, which left
  // this assertion failing unnoticed until CI existed to run it.
  const names = ['Takács Tamás', 'Varga Viktor', 'Barta Zoltán', 'Makó Kristóf',
                 'Domonkos Márk', 'Szász Milán', 'Hubay Csenge', 'Molnár Imre'];
  const { id, headers } = await createTournament(request, {
    name: 'Team Avatars E2E ' + Date.now(), gameType: 'cs16', teamMode: true,
  });

  const pid: Record<string, string> = {};
  for (const n of names) {
    pid[n] = (await (await request.post(`${API}/tournament/${id}/players`, { data: { name: n }, headers })).json()).id;
  }
  const teamDefs = [['Takács Tamás', 'Varga Viktor'], ['Barta Zoltán', 'Makó Kristóf'],
                    ['Domonkos Márk', 'Szász Milán'], ['Hubay Csenge', 'Molnár Imre']];
  for (let i = 0; i < teamDefs.length; i++) {
    await request.post(`${API}/tournament/${id}/teams`, {
      headers, data: { name: `Team ${i + 1}`, playerIds: teamDefs[i].map((n) => pid[n]) },
    });
  }
  await request.post(`${API}/tournament/${id}/start-team`, { headers });

  const tamas = pid['Takács Tamás'];
  const st = await (await request.get(`${API}/tournament/${id}/state`)).json();
  const teamPlayers: Record<string, string[]> = Object.fromEntries(st.teams.map((t: any) => [t.id, t.playerIds]));
  // Give Tamás the most kills across every game so he is the clear MVP.
  for (const m of st.teamMatches) {
    const playerStats = [...teamPlayers[m.team1Id], ...teamPlayers[m.team2Id]].map((p) => ({
      playerId: p, kills: p === tamas ? 30 : 8, deaths: 5,
    }));
    await request.post(`${API}/tournament/${id}/team-match/${m.id}`, {
      headers,
      data: {
        team1Score: 16, team2Score: 10,
        games: [{ gameNumber: 1, mapName: 'de_dust2', team1Score: 16, team2Score: 10, winnerTeamId: m.team1Id, playerStats }],
      },
    });
  }
  await request.post(`${API}/tournament/${id}/team-brackets`, { headers });
  for (let i = 0; i < 20; i++) {
    const s = await (await request.get(`${API}/tournament/${id}/state`)).json();
    const next = s.teamBracketMatches.find((mm: any) => mm.team1Id && mm.team2Id && !mm.winnerId);
    if (!next) break;
    await request.post(`${API}/tournament/${id}/team-bracket-match/${next.id}`, { headers, data: { winnerId: next.team1Id } });
  }

  await page.goto(`/tournament/${id}/statistics`);
  await page.getByRole('button', { name: /individual stats/i }).click();
  // Tamás is the MVP; his highlight-card avatar must resolve from his NAME
  // (any real image / name-based fallback), never the playerId -> Cat default.
  const avatar = page.locator('img[alt="Takács Tamás"]').first();
  await expect(avatar).toBeVisible({ timeout: 15_000 });
  const src = await avatar.getAttribute('src');
  expect(src, `avatar src was: ${src}`).not.toContain('Cat');
});
