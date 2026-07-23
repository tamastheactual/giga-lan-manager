import { v4 as uuidv4 } from 'uuid';
import type { Player, Team, BracketMatch, TeamBracketMatch } from '../shared/types.js';

// Single-elimination playoff bracket construction, extracted from
// TournamentManager. Each builder is a pure function: given the seeded players
// (index 0 = top seed) it returns the bracket matches, with no dependency on
// tournament state. TournamentManager.generateBrackets() decides the qualifier
// set and seeding, then delegates the shape to these builders.

// Top 2 seeds contest a single final (3-player tournaments).
export function build3PlayerFinalsBracket(players: Player[]): BracketMatch[] {
    return [{
        id: uuidv4(),
        round: 1,
        bracketType: 'finals',
        matchLabel: 'Grand Final',
        player1Id: players[0].id,
        player2Id: players[1].id,
    }];
}

// Single group where everyone already played everyone: no semifinals, just the
// final (1 vs 2) and the 3rd-place match (3 vs 4).
export function buildDirectFinalsBracket(players: Player[]): BracketMatch[] {
    const thirdPlaceId = uuidv4();
    const finalId = uuidv4();
    return [
        {
            id: thirdPlaceId,
            round: 1,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            player1Id: players[2]?.id,
            player2Id: players[3]?.id,
        },
        {
            id: finalId,
            round: 1,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
            player1Id: players[0].id,
            player2Id: players[1].id,
        },
    ];
}

// 4 players from multiple groups: standard semifinals (1v4, 2v3) → final + 3rd.
export function build4PlayerSemifinalsBracket(players: Player[]): BracketMatch[] {
    const semi1Id = uuidv4();
    const semi2Id = uuidv4();
    const thirdPlaceId = uuidv4();
    const finalId = uuidv4();
    return [
        {
            id: semi1Id,
            round: 1,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            player1Id: players[0].id, // 1st seed
            player2Id: players[3].id, // 4th seed
            nextMatchId: finalId,
            nextMatchSlot: 1,
        },
        {
            id: semi2Id,
            round: 1,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            player1Id: players[1].id, // 2nd seed
            player2Id: players[2].id, // 3rd seed
            nextMatchId: finalId,
            nextMatchSlot: 2,
        },
        {
            id: thirdPlaceId,
            round: 2,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id,
        },
        {
            id: finalId,
            round: 2,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
        },
    ];
}

// 6 players: seeds 1-2 get a bye to the semis; seeds 3-6 play quarterfinals.
export function build6PlayerBracket(players: Player[]): BracketMatch[] {
    const quarter1Id = uuidv4();
    const quarter2Id = uuidv4();
    const semi1Id = uuidv4();
    const semi2Id = uuidv4();
    const thirdPlaceId = uuidv4();
    const finalId = uuidv4();
    return [
        // QF1: 3rd vs 6th → winner plays 2nd seed in SF2
        {
            id: quarter1Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 1',
            player1Id: players[2].id, // 3rd seed
            player2Id: players[5].id, // 6th seed
            nextMatchId: semi2Id,
            nextMatchSlot: 2,
        },
        // QF2: 4th vs 5th → winner plays 1st seed in SF1
        {
            id: quarter2Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 2',
            player1Id: players[3].id, // 4th seed
            player2Id: players[4].id, // 5th seed
            nextMatchId: semi1Id,
            nextMatchSlot: 2,
        },
        // SF1: 1st seed (bye) vs QF2 winner
        {
            id: semi1Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            player1Id: players[0].id, // 1st seed (bye)
            nextMatchId: finalId,
            nextMatchSlot: 1,
        },
        // SF2: 2nd seed (bye) vs QF1 winner
        {
            id: semi2Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            player1Id: players[1].id, // 2nd seed (bye)
            nextMatchId: finalId,
            nextMatchSlot: 2,
        },
        {
            id: thirdPlaceId,
            round: 3,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id,
        },
        {
            id: finalId,
            round: 3,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
        },
    ];
}

// 8 players: 4 quarterfinals (1v8, 4v5, 2v7, 3v6) → 2 semifinals → final + 3rd.
export function build8PlayerBracket(players: Player[]): BracketMatch[] {
    const quarter1Id = uuidv4();
    const quarter2Id = uuidv4();
    const quarter3Id = uuidv4();
    const quarter4Id = uuidv4();
    const semi1Id = uuidv4();
    const semi2Id = uuidv4();
    const thirdPlaceId = uuidv4();
    const finalId = uuidv4();
    return [
        {
            id: quarter1Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 1',
            player1Id: players[0].id, // 1st vs 8th
            player2Id: players[7].id,
            nextMatchId: semi1Id,
            nextMatchSlot: 1,
        },
        {
            id: quarter2Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 2',
            player1Id: players[3].id, // 4th vs 5th
            player2Id: players[4].id,
            nextMatchId: semi1Id,
            nextMatchSlot: 2,
        },
        {
            id: quarter3Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 3',
            player1Id: players[1].id, // 2nd vs 7th
            player2Id: players[6].id,
            nextMatchId: semi2Id,
            nextMatchSlot: 1,
        },
        {
            id: quarter4Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarterfinal 4',
            player1Id: players[2].id, // 3rd vs 6th
            player2Id: players[5].id,
            nextMatchId: semi2Id,
            nextMatchSlot: 2,
        },
        {
            id: semi1Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            nextMatchId: finalId,
            nextMatchSlot: 1,
        },
        {
            id: semi2Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            nextMatchId: finalId,
            nextMatchSlot: 2,
        },
        {
            id: thirdPlaceId,
            round: 3,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id,
        },
        {
            id: finalId,
            round: 3,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
        },
    ];
}

// Pick the bracket shape from the qualifier count. `totalTournamentPlayers`
// distinguishes a 4-player single group (direct final, everyone already played)
// from 4 qualifiers out of a larger field (needs semifinals).
export function buildPlayoffBracket(players: Player[], totalTournamentPlayers: number): BracketMatch[] {
    const numPlayers = players.length;
    if (totalTournamentPlayers === 4 && numPlayers === 4) {
        return buildDirectFinalsBracket(players);
    } else if (numPlayers === 4) {
        return build4PlayerSemifinalsBracket(players);
    } else if (numPlayers === 6) {
        return build6PlayerBracket(players);
    } else if (numPlayers === 8) {
        return build8PlayerBracket(players);
    } else {
        // Fallback: semifinals with the top 4 seeds.
        return build4PlayerSemifinalsBracket(players.slice(0, 4));
    }
}

// Reorder qualified players so the first round pits players from different groups
// against each other. `groupOf` returns the pod id a player belongs to.
export function reorderForCrossGroupMatchups(
    players: Player[],
    numGroups: number,
    groupOf: (playerId: string) => string | null,
): Player[] {
    // Only reorder for multi-group tournaments.
    if (numGroups <= 1) return players;

    const playersByGroup = new Map<string, Player[]>();
    players.forEach((player) => {
        const groupId = groupOf(player.id);
        if (groupId) {
            if (!playersByGroup.has(groupId)) playersByGroup.set(groupId, []);
            playersByGroup.get(groupId)!.push(player);
        }
    });
    const groups = Array.from(playersByGroup.values());

    // Round-robin interleave across groups (used for 2 groups and 3+ groups).
    const interleave = (): Player[] => {
        const reordered: Player[] = [];
        const maxGroupSize = Math.max(...groups.map((g) => g.length));
        for (let i = 0; i < maxGroupSize; i++) {
            for (const group of groups) {
                if (i < group.length) reordered.push(group[i]);
            }
        }
        return reordered;
    };

    if (numGroups === 2) {
        return interleave();
    } else if (numGroups === 3 && players.length === 6) {
        // 3 groups, top 2 each: hand-tuned seeding so neither semifinal is an
        // intra-group rematch (see the 6-player bracket wiring).
        return [
            groups[0][0], // Seed 1
            groups[1][0], // Seed 2
            groups[2][0], // Seed 3
            groups[1][1], // Seed 4
            groups[2][1], // Seed 5
            groups[0][1], // Seed 6
        ];
    } else if (numGroups >= 3) {
        return interleave();
    }

    return players;
}

// ============================================================================
// Team brackets — identical shapes to the solo builders, keyed by team1Id/
// team2Id. NOTE: TournamentManager.generateTeamBrackets() does NOT run a
// cross-group reorder before seeding (unlike the solo path); that asymmetry is
// a known issue tracked in CODE_AUDIT.md, preserved here without change.
// ============================================================================

// Top 2 seeds contest a single final (3-team tournaments).
export function build3TeamFinalsBracket(teams: Team[]): TeamBracketMatch[] {
    return [{
        id: uuidv4(),
        round: 1,
        bracketType: 'finals',
        matchLabel: 'Grand Final',
        team1Id: teams[0].id,
        team2Id: teams[1].id,
    }];
}

// Single group where everyone already played everyone: final + 3rd-place only.
export function buildDirectTeamFinalsBracket(teams: Team[]): TeamBracketMatch[] {
    const thirdPlaceId = uuidv4();
    const finalId = uuidv4();
    return [
        {
            id: thirdPlaceId,
            round: 1,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            team1Id: teams[2]?.id,
            team2Id: teams[3]?.id,
        },
        {
            id: finalId,
            round: 1,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
            team1Id: teams[0].id,
            team2Id: teams[1].id,
        },
    ];
}

// 4 teams from multiple groups: semifinals (1v4, 2v3) → final + 3rd.
export function build4TeamBracket(teams: Team[]): TeamBracketMatch[] {
    const semi1Id = uuidv4();
    const semi2Id = uuidv4();
    const thirdPlaceId = uuidv4();
    const finalId = uuidv4();
    return [
        {
            id: semi1Id,
            round: 1,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            team1Id: teams[0].id,
            team2Id: teams[3].id,
            nextMatchId: finalId,
            nextMatchSlot: 1,
        },
        {
            id: semi2Id,
            round: 1,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            team1Id: teams[1].id,
            team2Id: teams[2].id,
            nextMatchId: finalId,
            nextMatchSlot: 2,
        },
        {
            id: thirdPlaceId,
            round: 2,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id,
        },
        {
            id: finalId,
            round: 2,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
        },
    ];
}

// 6 teams: seeds 1-2 bye to the semis; seeds 3-6 play quarterfinals.
export function build6TeamBracket(teams: Team[]): TeamBracketMatch[] {
    const qf1Id = uuidv4();
    const qf2Id = uuidv4();
    const semi1Id = uuidv4();
    const semi2Id = uuidv4();
    const thirdPlaceId = uuidv4();
    const finalId = uuidv4();
    return [
        {
            id: qf1Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 1',
            team1Id: teams[2].id, // 3rd seed
            team2Id: teams[5].id, // 6th seed
            nextMatchId: semi2Id,
            nextMatchSlot: 2,
        },
        {
            id: qf2Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 2',
            team1Id: teams[3].id, // 4th seed
            team2Id: teams[4].id, // 5th seed
            nextMatchId: semi1Id,
            nextMatchSlot: 2,
        },
        {
            id: semi1Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            team1Id: teams[0].id, // 1st seed (bye)
            nextMatchId: finalId,
            nextMatchSlot: 1,
        },
        {
            id: semi2Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            team1Id: teams[1].id, // 2nd seed (bye)
            nextMatchId: finalId,
            nextMatchSlot: 2,
        },
        {
            id: thirdPlaceId,
            round: 3,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id,
        },
        {
            id: finalId,
            round: 3,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
        },
    ];
}

// 8 teams: 4 quarterfinals (1v8, 4v5, 2v7, 3v6) → 2 semifinals → final + 3rd.
export function build8TeamBracket(teams: Team[]): TeamBracketMatch[] {
    const qf1Id = uuidv4();
    const qf2Id = uuidv4();
    const qf3Id = uuidv4();
    const qf4Id = uuidv4();
    const semi1Id = uuidv4();
    const semi2Id = uuidv4();
    const thirdPlaceId = uuidv4();
    const finalId = uuidv4();
    return [
        {
            id: qf1Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 1',
            team1Id: teams[0].id,
            team2Id: teams[7].id,
            nextMatchId: semi1Id,
            nextMatchSlot: 1,
        },
        {
            id: qf2Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 2',
            team1Id: teams[3].id,
            team2Id: teams[4].id,
            nextMatchId: semi1Id,
            nextMatchSlot: 2,
        },
        {
            id: qf3Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 3',
            team1Id: teams[1].id,
            team2Id: teams[6].id,
            nextMatchId: semi2Id,
            nextMatchSlot: 1,
        },
        {
            id: qf4Id,
            round: 1,
            bracketType: 'quarterfinals',
            matchLabel: 'Quarter-final 4',
            team1Id: teams[2].id,
            team2Id: teams[5].id,
            nextMatchId: semi2Id,
            nextMatchSlot: 2,
        },
        {
            id: semi1Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 1',
            nextMatchId: finalId,
            nextMatchSlot: 1,
        },
        {
            id: semi2Id,
            round: 2,
            bracketType: 'semifinals',
            matchLabel: 'Semifinal 2',
            nextMatchId: finalId,
            nextMatchSlot: 2,
        },
        {
            id: thirdPlaceId,
            round: 3,
            bracketType: '3rd-place',
            matchLabel: '3rd Place Match',
            loserFromMatch1: semi1Id,
            loserFromMatch2: semi2Id,
        },
        {
            id: finalId,
            round: 3,
            bracketType: 'finals',
            matchLabel: 'Grand Final',
        },
    ];
}

// Pick the team bracket shape from the qualifier count. A 4-team single group
// goes straight to a final (everyone already played); 4 qualifiers from a larger
// field need semifinals.
export function buildTeamPlayoffBracket(
    teams: Team[],
    totalTournamentTeams: number,
    numGroups: number,
): TeamBracketMatch[] {
    const numTeams = teams.length;
    if (totalTournamentTeams === 4 && numTeams === 4 && numGroups === 1) {
        return buildDirectTeamFinalsBracket(teams);
    } else if (numTeams === 4) {
        return build4TeamBracket(teams);
    } else if (numTeams === 6) {
        return build6TeamBracket(teams);
    } else if (numTeams === 8) {
        return build8TeamBracket(teams);
    } else {
        // Fallback: top 4 seeds.
        return build4TeamBracket(teams.slice(0, 4));
    }
}
