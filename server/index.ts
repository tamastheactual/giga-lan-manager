import express from 'express';
import { createClient } from 'redis';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import session from 'express-session';
import RedisStore from 'connect-redis';

// Add session types to Express Request
declare module 'express-serve-static-core' {
  interface Request {
    session: session.Session & Partial<session.SessionData>;
  }
}

declare module 'express-session' {
  interface SessionData {
    admin?: boolean;
  }
}

declare module 'connect-redis';

import { TournamentManager } from './tournament.js';

const app = express();
const port = 3000;

// Redis Client
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });

redisClient.on('error', (err) => console.log('Redis Client Error', err));

const tournaments: Map<string, TournamentManager> = new Map();

(async () => {
  await redisClient.connect();
  console.log('Connected to Redis');

  // Load tournament list from Redis
  const tournamentIds = await redisClient.sMembers('tournaments:list');
  for (const id of tournamentIds) {
    const state = await redisClient.get(`tournament:${id}`);
    if (state) {
      const data = JSON.parse(state);
      const tournament = new TournamentManager(data.id, data.name);
      Object.assign(tournament, data);
      tournaments.set(id, tournament);
      console.log(`Loaded tournament: ${data.name} (${id})`);
    }
  }
})();

const saveState = async (tournamentId: string) => {
    const tournament = tournaments.get(tournamentId);
    if (tournament) {
        await redisClient.set(`tournament:${tournamentId}`, JSON.stringify(tournament));
    }
};

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); 

// Session middleware (requires npm install express-session connect-redis)
app.use(session({
  store: new (RedisStore as any)({ client: redisClient }),
  secret: 'your-secret-key', // Change to a secure key
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Tournament management
app.get('/api/tournaments', (req, res) => {
  const tournamentList = Array.from(tournaments.values()).map(t => ({
    id: t.id,
    name: t.name,
    state: t.state,
    playerCount: t.players.length
  }));
  res.json(tournamentList);
});

app.post('/api/tournaments', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = uuidv4();
  const tournament = new TournamentManager(id, name);
  tournaments.set(id, tournament);
  await redisClient.sAdd('tournaments:list', id);
  await saveState(id);
  res.json({ id, name });
});

// Delete a tournament
app.delete('/api/tournament/:tournamentId', async (req, res) => {
    const { tournamentId } = req.params;
    if (!tournaments.has(tournamentId)) {
        return res.status(404).json({ error: 'Tournament not found' });
    }

    try {
        tournaments.delete(tournamentId);
        await redisClient.sRem('tournaments:list', tournamentId);
        await redisClient.del(`tournament:${tournamentId}`);
        res.json({ success: true, message: `Tournament ${tournamentId} deleted.` });
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to delete tournament', details: e.message });
    }
});

// Get tournament state
app.get('/api/tournament/:tournamentId/state', (req, res) => {
  const { tournamentId } = req.params;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

  res.json({
    id: tournament.id,
    name: tournament.name,
    players: tournament.players,
    pods: tournament.pods,
    matches: tournament.matches,
    bracketMatches: tournament.bracketMatches,
    state: tournament.state
  });
});



app.post('/api/tournament/:tournamentId/players', async (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const player = tournament.addPlayer(name);
    await saveState(tournamentId);
    res.json(player);
});

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === 'admin123') { // Hardcoded for demo; use env var or DB
    req.session.admin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/admin/status', (req, res) => {
  res.json({ isAdmin: !!req.session.admin });
});

// Middleware to protect edit routes
function requireAdmin(req: any, res: any, next: any) {
  if (req.session.admin) {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
}

// Protect edit routes (example for starting tournament)
app.post('/api/tournament/:tournamentId/start', requireAdmin, async (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.startGroupStage();
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/tournament/:tournamentId/match/:id', async (req, res) => {
    const { tournamentId, id } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const { results } = req.body;
    console.log(`[API] POST /api/tournament/${tournamentId}/match/${id} - Received:`, { id, results });
    try {
        tournament.submitMatchResult(id, results);
        await saveState(tournamentId);
        console.log(`[API] POST /api/tournament/${tournamentId}/match/${id} - Success, state saved`);
        res.json({ success: true });
    } catch (e: any) {
        console.error(`[API] POST /api/tournament/${tournamentId}/match/${id} - Error:`, e.message);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/tournament/:tournamentId/brackets', async (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.generateBrackets();
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/tournament/:tournamentId/bracket-match/:id', async (req, res) => {
    const { tournamentId, id } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const { winnerId } = req.body;
    try {
        tournament.submitBracketWinner(id, winnerId);
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/tournament/:tournamentId/reset', async (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    tournament.players = [];
    tournament.pods = [];
    tournament.matches = [];
    tournament.bracketMatches = [];
    tournament.state = 'registration';
    await saveState(tournamentId);
    res.json({ success: true });
});

// Update tournament name
app.put('/api/tournament/:tournamentId/name', async (req, res) => {
    const { tournamentId } = req.params;
    const { name } = req.body;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    try {
        tournament.updateTournamentName(name);
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Update group name
app.put('/api/tournament/:tournamentId/group/:podId/name', async (req, res) => {
    const { tournamentId, podId } = req.params;
    const { name } = req.body;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    try {
        tournament.updateGroupName(podId, name);
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Reset group data
app.post('/api/tournament/:tournamentId/group/:podId/reset', async (req, res) => {
    const { tournamentId, podId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    try {
        tournament.resetGroupData(podId);
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Update a player's name
app.put('/api/tournament/:tournamentId/player/:playerId', async (req, res) => {
  const { tournamentId, playerId } = req.params;
  const { name } = req.body;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  try {
    tournament.updatePlayerName(playerId, name);
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Update player photo
app.put('/api/tournament/:tournamentId/player/:playerId/photo', async (req, res) => {
  const { tournamentId, playerId } = req.params;
  const { photo } = req.body;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  try {
    tournament.updatePlayerPhoto(playerId, photo);
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Serve static files from the Svelte app build
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// In production (docker), dist is at /app/dist. In dev, it might be different.
// We'll assume the server is run from the root or we adjust the path.
// If running with ts-node from root:
app.use(express.static(path.join(process.cwd(), 'dist')));

app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
