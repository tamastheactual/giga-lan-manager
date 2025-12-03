import express from 'express';
import { createClient } from 'redis';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { TournamentManager } from './tournament.js';
import { GAME_CONFIGS, getAllGames } from './gameTypes.js';
const app = express();
const port = 3000;
// Redis Client
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });
redisClient.on('error', (err) => console.log('Redis Client Error', err));
const tournaments = new Map();
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
const saveState = async (tournamentId) => {
    const tournament = tournaments.get(tournamentId);
    if (tournament) {
        await redisClient.set(`tournament:${tournamentId}`, JSON.stringify(tournament));
    }
};
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
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
        playerCount: t.players.length,
        gameType: t.gameType
    }));
    res.json(tournamentList);
});
// Get available games
app.get('/api/games', (req, res) => {
    res.json(getAllGames());
});
app.post('/api/tournaments', async (req, res) => {
    const { name, gameType } = req.body;
    if (!name)
        return res.status(400).json({ error: 'Name is required' });
    if (!gameType || !GAME_CONFIGS[gameType]) {
        return res.status(400).json({ error: 'Valid game type is required' });
    }
    const id = uuidv4();
    const tournament = new TournamentManager(id, name, gameType);
    tournaments.set(id, tournament);
    await redisClient.sAdd('tournaments:list', id);
    await saveState(id);
    res.json({ id, name, gameType });
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
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to delete tournament', details: e.message });
    }
});
// Import a tournament from JSON
app.post('/api/tournaments/import', async (req, res) => {
    try {
        const importData = req.body;
        if (!importData || !importData.id || !importData.name) {
            return res.status(400).json({ error: 'Invalid tournament data' });
        }
        // Use the original ID or generate a new one if it conflicts
        let id = importData.tournamentId || importData.id;
        if (tournaments.has(id)) {
            // Generate new ID if tournament with this ID already exists
            id = uuidv4();
        }
        // Create a new tournament manager and restore state
        const gameType = (importData.gameType || 'cs16');
        const tournament = new TournamentManager(id, importData.name, gameType);
        // Restore all data
        tournament.players = importData.players || [];
        tournament.pods = importData.pods || [];
        tournament.matches = importData.matches || [];
        tournament.bracketMatches = importData.bracketMatches || [];
        tournament.state = importData.state || 'setup';
        tournaments.set(id, tournament);
        await redisClient.sAdd('tournaments:list', id);
        await saveState(id);
        res.json({
            success: true,
            id,
            name: tournament.name,
            message: `Tournament "${tournament.name}" imported successfully`
        });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to import tournament', details: e.message });
    }
});
// Get tournament state
app.get('/api/tournament/:tournamentId/state', (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    res.json({
        id: tournament.id,
        name: tournament.name,
        gameType: tournament.gameType,
        gameConfig: tournament.getGameConfig(),
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
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    const { name } = req.body;
    if (!name)
        return res.status(400).json({ error: 'Name is required' });
    const player = tournament.addPlayer(name);
    await saveState(tournamentId);
    res.json(player);
});
app.post('/api/tournament/:tournamentId/start', async (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.startGroupStage();
        await saveState(tournamentId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
app.post('/api/tournament/:tournamentId/match/:id', async (req, res) => {
    const { tournamentId, id } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    const { results } = req.body;
    console.log(`[API] POST /api/tournament/${tournamentId}/match/${id} - Received:`, { id, results });
    try {
        tournament.submitMatchResult(id, results);
        await saveState(tournamentId);
        console.log(`[API] POST /api/tournament/${tournamentId}/match/${id} - Success, state saved`);
        res.json({ success: true });
    }
    catch (e) {
        console.error(`[API] POST /api/tournament/${tournamentId}/match/${id} - Error:`, e.message);
        res.status(400).json({ error: e.message });
    }
});
app.post('/api/tournament/:tournamentId/brackets', async (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.generateBrackets();
        await saveState(tournamentId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
app.post('/api/tournament/:tournamentId/bracket-match/:id', async (req, res) => {
    const { tournamentId, id } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    const { winnerId } = req.body;
    try {
        tournament.submitBracketWinner(id, winnerId);
        await saveState(tournamentId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// Submit a single game result for BO3 bracket match
app.post('/api/tournament/:tournamentId/bracket-match/:id/game', async (req, res) => {
    const { tournamentId, id } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    const { gameNumber, mapName, player1Score, player2Score, winnerId } = req.body;
    try {
        tournament.submitBracketGameResult(id, {
            gameNumber,
            mapName,
            player1Score,
            player2Score,
            winnerId
        });
        await saveState(tournamentId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
app.post('/api/tournament/:tournamentId/reset', async (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
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
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.updateTournamentName(name);
        await saveState(tournamentId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// Update group name
app.put('/api/tournament/:tournamentId/group/:podId/name', async (req, res) => {
    const { tournamentId, podId } = req.params;
    const { name } = req.body;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.updateGroupName(podId, name);
        await saveState(tournamentId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// Reset group data
app.post('/api/tournament/:tournamentId/group/:podId/reset', async (req, res) => {
    const { tournamentId, podId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.resetGroupData(podId);
        await saveState(tournamentId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// Update a player's name
app.put('/api/tournament/:tournamentId/player/:playerId', async (req, res) => {
    const { tournamentId, playerId } = req.params;
    const { name } = req.body;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.updatePlayerName(playerId, name);
        await saveState(tournamentId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// Update player photo
app.put('/api/tournament/:tournamentId/player/:playerId/photo', async (req, res) => {
    const { tournamentId, playerId } = req.params;
    const { photo } = req.body;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.updatePlayerPhoto(playerId, photo);
        await saveState(tournamentId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    }
});
// Remove player
app.delete('/api/tournament/:tournamentId/player/:playerId', async (req, res) => {
    const { tournamentId, playerId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament)
        return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.removePlayer(playerId);
        await saveState(tournamentId);
        res.json({ success: true });
    }
    catch (e) {
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
//# sourceMappingURL=index.js.map