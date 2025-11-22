const API_URL = 'http://localhost:3000/api';

export async function getState() {
    const res = await fetch(`${API_URL}/state`);
    return res.json();
}

export async function addPlayer(name: string) {
    const res = await fetch(`${API_URL}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    return res.json();
}

export async function startGroupStage() {
    const res = await fetch(`${API_URL}/start`, { method: 'POST' });
    return res.json();
}

export async function submitMatch(id: string, results: any) {
    const res = await fetch(`${API_URL}/match/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results })
    });
    return res.json();
}

export async function generateBrackets() {
    const res = await fetch(`${API_URL}/brackets`, { method: 'POST' });
    return res.json();
}

export async function resetTournament() {
    const res = await fetch(`${API_URL}/reset`, { method: 'POST' });
    return res.json();
}

export async function submitBracketWinner(id: string, winnerId: string) {
    const res = await fetch(`${API_URL}/bracket-match/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId })
    });
    return res.json();
}
