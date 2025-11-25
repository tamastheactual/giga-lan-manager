const API_URL = 'http://localhost:3000/api';

export async function getTournaments() {
    const res = await fetch(`${API_URL}/tournaments`);
    return res.json();
}

export async function createTournament(name: string) {
    const res = await fetch(`${API_URL}/tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return res.json();
}

export async function deleteTournament(tournamentId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}`, {
        method: 'DELETE'
    });
    return res.json();
}

export async function getState(tournamentId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/state`);
    return res.json();
}

export async function addPlayer(tournamentId: string, name: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return res.json();
}

export async function startGroupStage(tournamentId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/start`, { method: 'POST' });
    return res.json();
}

export async function submitMatch(tournamentId: string, id: string, results: any) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/match/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results })
    });
    return res.json();
}

export async function generateBrackets(tournamentId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/brackets`, { method: 'POST' });
    return res.json();
}

export async function resetTournament(tournamentId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/reset`, { method: 'POST' });
    return res.json();
}

export async function submitBracketWinner(tournamentId: string, id: string, winnerId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/bracket-match/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId })
    });
    return res.json();
}

export async function updateGroupName(tournamentId: string, podId: string, name: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/group/${podId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return res.json();
}

export async function resetGroupData(tournamentId: string, podId: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/group/${podId}/reset`, {
        method: 'POST'
    });
    return res.json();
}

export async function updateTournamentName(tournamentId: string, name: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return res.json();
}

export async function updatePlayerName(tournamentId: string, playerId: string, name: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/player/${playerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return res.json();
}

export async function updatePlayerPhoto(tournamentId: string, playerId: string, photo: string) {
    const res = await fetch(`${API_URL}/tournament/${tournamentId}/player/${playerId}/photo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo })
    });
    return res.json();
}
