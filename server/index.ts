import express from 'express';
import { createClient } from 'redis';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import { TournamentManager } from './tournament.js';

const app = express();
const port = 3000;

// Redis Client
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });

redisClient.on('error', (err) => console.log('Redis Client Error', err));

const tournament = new TournamentManager();

(async () => {
  await redisClient.connect();
  console.log('Connected to Redis');
  
  // Load state from Redis
  const state = await redisClient.get('tournament_state');
  if (state) {
      const data = JSON.parse(state);
      Object.assign(tournament, data);
      console.log('Loaded tournament state');
  }
})();

const saveState = async () => {
    await redisClient.set('tournament_state', JSON.stringify(tournament));
};

app.use(cors());
app.use(bodyParser.json());

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/state', (req, res) => {
    console.log('[API] GET /api/state - Returning tournament state');
    res.json(tournament);
});

app.post('/api/players', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const player = tournament.addPlayer(name);
    await saveState();
    res.json(player);
});

app.post('/api/start', async (req, res) => {
    try {
        tournament.startGroupStage();
        await saveState();
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/match/:id', async (req, res) => {
    const { id } = req.params;
    const { results } = req.body;
    console.log('[API] POST /api/match/:id - Received:', { id, results });
    try {
        tournament.submitMatchResult(id, results);
        await saveState();
        console.log('[API] POST /api/match/:id - Success, state saved');
        res.json({ success: true });
    } catch (e: any) {
        console.error('[API] POST /api/match/:id - Error:', e.message);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/brackets', async (req, res) => {
    try {
        tournament.generateBrackets();
        await saveState();
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/bracket-match/:id', async (req, res) => {
    const { id } = req.params;
    const { winnerId } = req.body;
    try {
        tournament.submitBracketWinner(id, winnerId);
        await saveState();
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/reset', async (req, res) => {
    tournament.players = [];
    tournament.pods = [];
    tournament.matches = [];
    tournament.bracketMatches = [];
    tournament.state = 'registration';
    await saveState();
    res.json({ success: true });
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
