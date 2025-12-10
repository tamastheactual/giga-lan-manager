import { v4 as uuidv4 } from 'uuid';
import { getGameConfig } from './gameTypes.js';
export class TournamentManager {
    id;
    name;
    gameType; // Which game this tournament is for
    mapPool = []; // Optional map pool for tournaments
    players = [];
    pods = [];
    matches = [];
    bracketMatches = [];
    state = 'registration';
    createdAt;
    startedAt;
    groupStageRoundLimit; // Custom round limit for group stage (CS 1.6)
    playoffsRoundLimit; // Custom round limit for playoffs (CS 1.6)
    useCustomPoints; // Override default archetype with custom points
    constructor(id, name, gameType = 'cs16', mapPool = [], groupStageRoundLimit, playoffsRoundLimit, useCustomPoints) {
        this.id = id;
        this.name = name;
        this.gameType = gameType;
        this.mapPool = mapPool;
        this.createdAt = new Date().toISOString();
        this.groupStageRoundLimit = groupStageRoundLimit;
        this.playoffsRoundLimit = playoffsRoundLimit;
        this.useCustomPoints = useCustomPoints;
    }
    // Get game configuration
    getGameConfig() {
        return getGameConfig(this.gameType);
    }
    // Fill in missing maps for existing matches with random selection
    fillMissingMaps() {
        const config = this.getGameConfig();
        const availableMaps = this.mapPool.length > 0 ? this.mapPool : config.maps;
        // Fill in missing maps for group stage matches
        this.matches.forEach(match => {
            if (!match.mapName && match.completed) {
                match.mapName = availableMaps[Math.floor(Math.random() * availableMaps.length)];
            }
        });
        // Fill in missing maps for bracket matches
        this.bracketMatches.forEach(match => {
            // Fill in missing maps in games array
            if (match.games && match.games.length > 0) {
                match.games.forEach((game) => {
                    if (!game.mapName) {
                        game.mapName = availableMaps[Math.floor(Math.random() * availableMaps.length)];
                    }
                });
            }
        });
    }
    addPlayer(name) {
        const player = {
            id: uuidv4(),
            name,
            points: 0,
            matchesPlayed: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            scoreDifferential: 0,
            totalGameScore: 0
        };
        this.players.push(player);
        return player;
    }
    removePlayer(playerId) {
        if (this.state !== 'registration') {
            throw new Error("Cannot remove players after tournament has started");
        }
        const index = this.players.findIndex(p => p.id === playerId);
        if (index === -1) {
            throw new Error("Player not found");
        }
        this.players.splice(index, 1);
    }
    startGroupStage() {
        if (this.players.length < 4) {
            throw new Error("Need at least 4 players");
        }
        // Auto-add dummy player for awkward tournament sizes
        if (this.players.length === 11) {
            // 11 → 12 (3 groups of 4)
            this.addPlayer("BYE (Dummy Player)");
        }
        else if (this.players.length === 13) {
            // 13 → 14 (2 groups of 7)
            this.addPlayer("BYE (Dummy Player)");
        }
        this.state = 'group';
        this.startedAt = new Date().toISOString();
        this.generatePods();
    }
    generatePods() {
        const numPlayers = this.players.length;
        // Determine group size and count
        let groupSize = 4;
        let numGroups = 1;
        if (numPlayers === 4) {
            groupSize = 4;
            numGroups = 1;
        }
        else if (numPlayers === 5) {
            groupSize = 5;
            numGroups = 1;
        }
        else if (numPlayers === 6) {
            groupSize = 3;
            numGroups = 2;
        }
        else if (numPlayers === 7) {
            groupSize = 7;
            numGroups = 1;
        }
        else if (numPlayers === 8) {
            groupSize = 4;
            numGroups = 2;
        }
        else if (numPlayers === 9) {
            groupSize = 3;
            numGroups = 3;
        }
        else if (numPlayers === 10) {
            // 10 players: 2 groups of 5
            groupSize = 5;
            numGroups = 2;
        }
        else if (numPlayers === 11) {
            // 11 players: awkward, use 3 groups (4, 4, 3)
            groupSize = 4;
            numGroups = 3;
        }
        else if (numPlayers === 12) {
            // 12 players: 3 groups of 4
            groupSize = 4;
            numGroups = 3;
        }
        else if (numPlayers === 13) {
            // 13 players: awkward number, make uneven groups
            groupSize = 7;
            numGroups = 2; // Will be 7 and 6
        }
        else if (numPlayers === 14) {
            // 14 players: 2 groups of 7
            groupSize = 7;
            numGroups = 2;
        }
        else if (numPlayers === 15) {
            // 15 players: 3 groups of 5
            groupSize = 5;
            numGroups = 3;
        }
        else if (numPlayers === 16) {
            // 16 players: 4 groups of 4
            groupSize = 4;
            numGroups = 4;
        }
        else {
            // For larger numbers, try to make groups of 4-5
            groupSize = 4;
            numGroups = Math.ceil(numPlayers / 4);
        }
        // Shuffle and divide players into groups
        const shuffled = [...this.players].sort(() => Math.random() - 0.5);
        const groups = [];
        for (let g = 0; g < numGroups; g++) {
            groups.push([]);
        }
        // Distribute players evenly
        shuffled.forEach((player, index) => {
            groups[index % numGroups].push(player);
        });
        // For each group, generate complete round-robin matches
        groups.forEach((groupPlayers, groupIndex) => {
            const podId = uuidv4();
            // Store pod with all players in this group
            this.pods.push({
                id: podId,
                round: 1, // All belong to the same logical group
                players: groupPlayers.map(p => p.id),
                matchId: '' // Will be set later
            });
            // Generate complete round-robin: every player plays every other player once
            const n = groupPlayers.length;
            if (n < 2)
                return; // Need at least 2 players
            // For round-robin, generate all unique pairs
            const allMatches = [];
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    allMatches.push([groupPlayers[i], groupPlayers[j]]);
                }
            }
            // Distribute matches across rounds to minimize conflicts
            // Use round-robin scheduling algorithm
            const totalMatches = allMatches.length;
            const matchesPerRound = Math.floor(n / 2);
            const totalRounds = n % 2 === 0 ? n - 1 : n;
            const schedule = [];
            const playersCopy = [...groupPlayers];
            for (let round = 0; round < totalRounds; round++) {
                const roundMatches = [];
                for (let i = 0; i < matchesPerRound; i++) {
                    const p1 = playersCopy[i];
                    const p2 = playersCopy[n - 1 - i];
                    if (p1 && p2) {
                        roundMatches.push([p1, p2]);
                    }
                }
                schedule.push(roundMatches);
                // Rotate players for next round (keep first player fixed)
                if (n % 2 === 0) {
                    // For even number of players, rotate all except first
                    const last = playersCopy.pop();
                    playersCopy.splice(1, 0, last);
                }
                else {
                    // For odd number of players, rotate all
                    playersCopy.push(playersCopy.shift());
                }
            }
            // Create matches for each round
            schedule.forEach((roundMatches, roundIndex) => {
                roundMatches.forEach(([p1, p2]) => {
                    const matchId = uuidv4();
                    this.matches.push({
                        id: matchId,
                        podId,
                        round: roundIndex + 1, // Store the round number
                        player1Id: p1.id,
                        player2Id: p2.id,
                        players: [p1.id, p2.id],
                        completed: false
                    });
                });
            });
        });
    }
    submitMatchResult(matchId, results, mapName, gameResults) {
        const match = this.matches.find(m => m.id === matchId);
        if (!match)
            throw new Error("Match not found");
        match.result = results;
        match.completed = true;
        // Store map name if provided
        if (mapName) {
            match.mapName = mapName;
        }
        // Store detailed game results if provided
        if (gameResults) {
            match.gameResults = gameResults;
        }
        // Update player stats
        for (const [playerId, result] of Object.entries(results)) {
            const player = this.players.find(p => p.id === playerId);
            if (player) {
                player.matchesPlayed++;
                player.points += result.points;
                if (result.points >= 3)
                    player.wins++; // 3 = win
                else if (result.points === 1)
                    player.draws++;
                else
                    player.losses++;
                // Track game-specific score (kills, rounds, etc.) for tiebreakers
                if (result.score !== undefined) {
                    player.totalGameScore += result.score;
                    // Calculate score differential against opponent
                    const opponentId = match.player1Id === playerId ? match.player2Id : match.player1Id;
                    const opponentResult = results[opponentId];
                    if (opponentResult?.score !== undefined) {
                        player.scoreDifferential += (result.score - opponentResult.score);
                    }
                }
            }
        }
    }
    // Submit BO3 bracket match game result
    submitBracketGameResult(matchId, gameResult) {
        const match = this.bracketMatches.find(m => m.id === matchId);
        if (!match)
            throw new Error("Bracket match not found");
        if (!match.games) {
            match.games = [];
            match.player1Wins = 0;
            match.player2Wins = 0;
        }
        // Don't allow more than 3 games
        if (match.games.length >= 3) {
            throw new Error("BO3 match already has 3 games");
        }
        // Add the game result
        match.games.push(gameResult);
        // Update win counts
        if (gameResult.winnerId === match.player1Id) {
            match.player1Wins = (match.player1Wins || 0) + 1;
        }
        else if (gameResult.winnerId === match.player2Id) {
            match.player2Wins = (match.player2Wins || 0) + 1;
        }
        // Check if match is won (first to 2)
        if ((match.player1Wins || 0) >= 2) {
            this.submitBracketWinner(matchId, match.player1Id);
        }
        else if ((match.player2Wins || 0) >= 2) {
            this.submitBracketWinner(matchId, match.player2Id);
        }
    }
    getRankings() {
        return [...this.players].sort((a, b) => {
            // Primary: Points
            if (b.points !== a.points)
                return b.points - a.points;
            // Tiebreaker 1: Total game score (rounds won for CS, kills for UT, etc.)
            if ((b.totalGameScore || 0) !== (a.totalGameScore || 0)) {
                return (b.totalGameScore || 0) - (a.totalGameScore || 0);
            }
            // Tiebreaker 2: Head-to-head result (only for 2-way tie)
            const h2hResult = this.getHeadToHeadResult(a.id, b.id);
            if (h2hResult !== 0)
                return h2hResult;
            // Tiebreaker 3: More wins
            if (b.wins !== a.wins)
                return b.wins - a.wins;
            // Tiebreaker 4: Fewer losses
            if (a.losses !== b.losses)
                return a.losses - b.losses;
            // Tiebreaker 5: Score differential (if tracked)
            if (b.scoreDifferential !== a.scoreDifferential) {
                return b.scoreDifferential - a.scoreDifferential;
            }
            // Tiebreaker 6: Alphabetical by name (deterministic fallback)
            return a.name.localeCompare(b.name);
        });
    }
    // Get head-to-head result between two players
    // Returns: positive if player B won, negative if player A won, 0 if no direct match or tie
    getHeadToHeadResult(playerAId, playerBId) {
        const directMatch = this.matches.find(m => m.completed &&
            ((m.player1Id === playerAId && m.player2Id === playerBId) ||
                (m.player1Id === playerBId && m.player2Id === playerAId)));
        if (!directMatch || !directMatch.result)
            return 0;
        const aPoints = directMatch.result[playerAId]?.points || 0;
        const bPoints = directMatch.result[playerBId]?.points || 0;
        // Return positive if B won (B should rank higher), negative if A won
        return bPoints - aPoints;
    }
    // Get which group/pod a player belongs to
    getPlayerGroup(playerId) {
        const pod = this.pods.find(p => p.players.includes(playerId));
        return pod ? pod.id : null;
    }
    // Reorder qualified players to avoid same-group matchups in brackets
    reorderForCrossGroupMatchups(players) {
        const numGroups = this.pods.length;
        // Only reorder for multi-group tournaments
        if (numGroups <= 1)
            return players;
        // Group players by their pod and maintain ranking within groups
        const playersByGroup = new Map();
        players.forEach(player => {
            const groupId = this.getPlayerGroup(player.id);
            if (groupId) {
                if (!playersByGroup.has(groupId)) {
                    playersByGroup.set(groupId, []);
                }
                playersByGroup.get(groupId).push(player);
            }
        });
        const groups = Array.from(playersByGroup.values());
        // Handle different scenarios
        if (numGroups === 2) {
            // 2 groups: Interleave to ensure cross-group matchups
            // Result: G1-1st, G2-1st, G1-2nd, G2-2nd, G1-3rd, G2-3rd, G1-4th, G2-4th
            const reordered = [];
            const maxGroupSize = Math.max(...groups.map(g => g.length));
            for (let i = 0; i < maxGroupSize; i++) {
                for (const group of groups) {
                    if (i < group.length) {
                        reordered.push(group[i]);
                    }
                }
            }
            return reordered;
        }
        else if (numGroups === 3 && players.length === 6) {
            // 3 groups, 6 players (top 2 from each)
            // Bracket structure: Seeds 1-2 get byes, Seeds 3-6 play QFs
            // QF1: Seed 3 vs Seed 6 → Winner plays Seed 2 in SF2
            // QF2: Seed 4 vs Seed 5 → Winner plays Seed 1 in SF1
            // 
            // To avoid same-group matchups in semifinals:
            // - Seed 1 and Seed 2 should be from different groups (guaranteed by ranking)
            // - QF1 winner should not be from same group as Seed 2
            // - QF2 winner should not be from same group as Seed 1
            //
            // Strategy: Place 1st from each group in seeds 1-3, then distribute 2nds carefully
            // Seed 1: G1-1st (bye) → will face QF2 winner
            // Seed 2: G2-1st (bye) → will face QF1 winner
            // Seed 3: G3-1st → QF1 vs Seed 6
            // Seed 4: G2-2nd → QF2 vs Seed 5
            // Seed 5: G3-2nd → QF2 vs Seed 4
            // Seed 6: G1-2nd → QF1 vs Seed 3
            //
            // Verification:
            // QF1: G3-1st vs G1-2nd ✓ different
            // QF2: G2-2nd vs G3-2nd ✓ different
            // SF1: G1-1st vs (G2-2nd or G3-2nd) ✓ different from G1
            // SF2: G2-1st vs (G3-1st or G1-2nd) ✓ different from G2
            const reordered = [
                groups[0][0], // G1-1st (Seed 1)
                groups[1][0], // G2-1st (Seed 2)
                groups[2][0], // G3-1st (Seed 3)
                groups[1][1], // G2-2nd (Seed 4)
                groups[2][1], // G3-2nd (Seed 5)
                groups[0][1], // G1-2nd (Seed 6)
            ];
            return reordered;
        }
        else if (numGroups >= 3) {
            // 3+ groups: Distribute to avoid same-group matchups
            // Strategy: Round-robin distribution across groups
            const reordered = [];
            const maxGroupSize = Math.max(...groups.map(g => g.length));
            for (let i = 0; i < maxGroupSize; i++) {
                for (const group of groups) {
                    if (i < group.length) {
                        reordered.push(group[i]);
                    }
                }
            }
            return reordered;
        }
        return players;
    }
    generateBrackets() {
        const rankings = this.getRankings();
        const numGroups = this.pods.length;
        const totalPlayers = this.players.length;
        // Determine playoff size based on group size and count
        let numQualified;
        if (numGroups === 1) {
            // Single group: top 4 advance (unless fewer than 6 total players)
            numQualified = Math.min(4, totalPlayers);
        }
        else if (numGroups === 2) {
            // Two groups: determine based on group size
            const avgGroupSize = totalPlayers / 2;
            if (avgGroupSize >= 5) {
                // Large groups (5-7+ players): top 4 from each group = 8 total
                numQualified = 8;
            }
            else {
                // Small groups (3-4 players): top 2 from each = 4 total
                numQualified = 4;
            }
        }
        else if (numGroups === 3) {
            // Three groups: top 2 from each = 6 total
            numQualified = 6;
        }
        else {
            // Four+ groups: top 2 from each, capped at 8
            numQualified = Math.min(numGroups * 2, 8);
        }
        // Ensure we don't exceed available players
        numQualified = Math.min(numQualified, rankings.length);
        let qualifiedPlayers = rankings.slice(0, numQualified);
        // Reorder to ensure cross-group matchups in first round
        qualifiedPlayers = this.reorderForCrossGroupMatchups(qualifiedPlayers);
        this.bracketMatches = [];
        this.createPlayoffBracket(qualifiedPlayers);
        this.state = 'playoffs';
    }
    createPlayoffBracket(players) {
        const numPlayers = players.length;
        const totalTournamentPlayers = this.players.length;
        // Only use direct finals for exactly 4-player tournaments
        // (everyone played everyone in groups, no need for semifinals)
        // For 5+ players, always use semifinals even if single group
        if (totalTournamentPlayers === 4 && numPlayers === 4) {
            this.createDirectFinalsBracket(players);
        }
        else if (numPlayers === 4) {
            this.create4PlayerSemifinalsBracket(players);
        }
        else if (numPlayers === 6) {
            this.create6PlayerBracket(players);
        }
        else if (numPlayers === 8) {
            this.create8PlayerBracket(players);
        }
        else {
            // Fallback: create semifinals with top 4 players
            this.create4PlayerSemifinalsBracket(players.slice(0, 4));
        }
    }
    // For single group tournaments where everyone has played each other
    createDirectFinalsBracket(players) {
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();
        // Third place match: 3rd seed vs 4th seed
        this.bracketMatches.push({
            id: thirdPlaceId,
            round: 1,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            player1Id: players[2]?.id,
            player2Id: players[3]?.id
        });
        // Final: 1st seed vs 2nd seed
        this.bracketMatches.push({
            id: finalId,
            round: 1,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
            player1Id: players[0].id,
            player2Id: players[1].id
        });
    }
    // For multi-group tournaments - standard semifinals bracket
    create4PlayerSemifinalsBracket(players) {
        // 4 players from multiple groups: need semifinals since they haven't all played
        const semi1Id = uuidv4();
        const semi2Id = uuidv4();
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();
        // Semifinals: 1v4, 2v3
        this.bracketMatches.push({
            id: semi1Id,
            round: 1,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            player1Id: players[0].id, // 1st seed
            player2Id: players[3].id, // 4th seed
            nextMatchId: finalId,
            nextMatchSlot: 1
        });
        this.bracketMatches.push({
            id: semi2Id,
            round: 1,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            player1Id: players[1].id, // 2nd seed
            player2Id: players[2].id, // 3rd seed
            nextMatchId: finalId,
            nextMatchSlot: 2
        });
        // Third place match
        this.bracketMatches.push({
            id: thirdPlaceId,
            round: 2,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id
        });
        // Final
        this.bracketMatches.push({
            id: finalId,
            round: 2,
            bracketType: 'finals',
            matchLabel: 'Grand Final'
        });
    }
    create6PlayerBracket(players) {
        // 6 players: 2 quarterfinals → 2 semifinals → finals + 3rd place
        // Seeds 1 and 2 get automatic advancement to semifinals (no bye matches shown)
        // Seeds 3-6 play in quarterfinals
        const quarter1Id = uuidv4();
        const quarter2Id = uuidv4();
        const semi1Id = uuidv4();
        const semi2Id = uuidv4();
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();
        // Quarterfinals (2 matches)
        // Match 1: 3rd vs 6th → winner plays 2nd seed
        this.bracketMatches.push({
            id: quarter1Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 1',
            player1Id: players[2].id, // 3rd seed
            player2Id: players[5].id, // 6th seed
            nextMatchId: semi2Id,
            nextMatchSlot: 2
        });
        // Match 2: 4th vs 5th → winner plays 1st seed
        this.bracketMatches.push({
            id: quarter2Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 2',
            player1Id: players[3].id, // 4th seed
            player2Id: players[4].id, // 5th seed
            nextMatchId: semi1Id,
            nextMatchSlot: 2
        });
        // Semifinals (2 matches)
        // Semi 1: 1st seed (bye) vs winner of QF2
        this.bracketMatches.push({
            id: semi1Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            player1Id: players[0].id, // 1st seed (bye)
            // player2Id filled by QF2 winner
            nextMatchId: finalId,
            nextMatchSlot: 1
        });
        // Semi 2: 2nd seed (bye) vs winner of QF1
        this.bracketMatches.push({
            id: semi2Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            player1Id: players[1].id, // 2nd seed (bye)
            // player2Id filled by QF1 winner
            nextMatchId: finalId,
            nextMatchSlot: 2
        });
        // Third place match
        this.bracketMatches.push({
            id: thirdPlaceId,
            round: 3,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id
        });
        // Final
        this.bracketMatches.push({
            id: finalId,
            round: 3,
            bracketType: 'finals',
            matchLabel: 'Grand Final'
        });
    }
    create8PlayerBracket(players) {
        // 8 players: 4 quarterfinals → 2 semifinals → finals + 3rd place
        const quarter1Id = uuidv4();
        const quarter2Id = uuidv4();
        const quarter3Id = uuidv4();
        const quarter4Id = uuidv4();
        const semi1Id = uuidv4();
        const semi2Id = uuidv4();
        const thirdPlaceId = uuidv4();
        const finalId = uuidv4();
        // Quarterfinals (4 matches)
        this.bracketMatches.push({
            id: quarter1Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 1',
            player1Id: players[0].id, // 1st vs 8th
            player2Id: players[7].id,
            nextMatchId: semi1Id,
            nextMatchSlot: 1
        });
        this.bracketMatches.push({
            id: quarter2Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 2',
            player1Id: players[3].id, // 4th vs 5th
            player2Id: players[4].id,
            nextMatchId: semi1Id,
            nextMatchSlot: 2
        });
        this.bracketMatches.push({
            id: quarter3Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 3',
            player1Id: players[1].id, // 2nd vs 7th
            player2Id: players[6].id,
            nextMatchId: semi2Id,
            nextMatchSlot: 1
        });
        this.bracketMatches.push({
            id: quarter4Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 4',
            player1Id: players[2].id, // 3rd vs 6th
            player2Id: players[5].id,
            nextMatchId: semi2Id,
            nextMatchSlot: 2
        });
        // Semifinals (2 matches)
        this.bracketMatches.push({
            id: semi1Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            nextMatchId: finalId,
            nextMatchSlot: 1
        });
        this.bracketMatches.push({
            id: semi2Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            nextMatchId: finalId,
            nextMatchSlot: 2
        });
        // Third place match
        this.bracketMatches.push({
            id: thirdPlaceId,
            round: 3,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id
        });
        // Final
        this.bracketMatches.push({
            id: finalId,
            round: 3,
            bracketType: 'finals',
            matchLabel: 'Grand Final'
        });
    }
    submitBracketWinner(matchId, winnerId) {
        const match = this.bracketMatches.find(m => m.id === matchId);
        if (!match)
            throw new Error("Match not found");
        if (match.player1Id !== winnerId && match.player2Id !== winnerId) {
            throw new Error("Winner must be one of the players in the match");
        }
        match.winnerId = winnerId;
        const loserId = match.player1Id === winnerId ? match.player2Id : match.player1Id;
        // Advance winner to next match
        if (match.nextMatchId) {
            const nextMatch = this.bracketMatches.find(m => m.id === match.nextMatchId);
            if (nextMatch) {
                if (match.nextMatchSlot === 1) {
                    nextMatch.player1Id = winnerId;
                }
                else {
                    nextMatch.player2Id = winnerId;
                }
            }
        }
        // If this is a semifinal, send loser to third place match
        if (match.bracketType === 'semifinals') {
            const thirdPlaceMatch = this.bracketMatches.find(m => m.bracketType === '3rd-place');
            if (thirdPlaceMatch && loserId) {
                // Add loser to third place match
                if (!thirdPlaceMatch.player1Id) {
                    thirdPlaceMatch.player1Id = loserId;
                }
                else if (!thirdPlaceMatch.player2Id) {
                    thirdPlaceMatch.player2Id = loserId;
                }
            }
        }
        // Check if all bracket matches are completed
        const allBracketMatchesCompleted = this.bracketMatches.every(m => m.winnerId);
        if (allBracketMatchesCompleted) {
            this.state = 'completed';
        }
    }
    // Update tournament name
    updateTournamentName(name) {
        if (!name?.trim()) {
            throw new Error("Tournament name cannot be empty");
        }
        this.name = name.trim();
    }
    // Update group name
    updateGroupName(podId, name) {
        const pod = this.pods.find(p => p.id === podId);
        if (!pod)
            throw new Error("Group not found");
        pod.name = name.trim() || undefined;
    }
    // Reset group data (clear all match results for players in this group)
    resetGroupData(podId) {
        const pod = this.pods.find(p => p.id === podId);
        if (!pod)
            throw new Error("Group not found");
        // Reset player stats for players in this group
        pod.players.forEach(playerId => {
            const player = this.players.find(p => p.id === playerId);
            if (player) {
                player.points = 0;
                player.matchesPlayed = 0;
                player.wins = 0;
                player.draws = 0;
                player.losses = 0;
                player.scoreDifferential = 0;
            }
        });
        // Reset all matches for this group
        this.matches.forEach(match => {
            if (match.podId === podId) {
                match.result = undefined;
                match.completed = false;
            }
        });
    }
    // Update player name
    updatePlayerName(playerId, name) {
        if (!name || !name.trim())
            throw new Error('Name cannot be empty');
        const p = this.players.find(pl => pl.id === playerId);
        if (!p)
            throw new Error('Player not found');
        p.name = name.trim();
    }
    // Update player photo
    updatePlayerPhoto(playerId, photo) {
        const p = this.players.find(pl => pl.id === playerId);
        if (!p)
            throw new Error('Player not found');
        p.profilePhoto = photo;
    }
    // Get the tournament champion (winner of finals)
    getChampion() {
        if (this.state !== 'completed')
            return null;
        const finals = this.bracketMatches.find(m => m.bracketType === 'finals');
        if (!finals?.winnerId)
            return null;
        return this.players.find(p => p.id === finals.winnerId) || null;
    }
}
//# sourceMappingURL=tournament.js.map