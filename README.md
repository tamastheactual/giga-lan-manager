# LAN Party Tournament Manager

A self-hosted web application for managing LAN party tournaments with a Swiss-lite group stage and Double-House playoffs.

## Features

*   **Group Phase**: 3 rounds of randomized pods (Swiss-lite).
*   **Scoring**: Win (3), Draw (1), Loss (0).
*   **Playoffs**:
    *   **Upper House**: Top 50% (Championship).
    *   **Lower House**: Bottom 50% (Placement).
*   **Interactive Brackets**: Click to advance winners.
*   **Self-Hosted**: Dockerized with Redis for persistence.

## Tech Stack

*   **Frontend**: Svelte (Vite) + Tailwind CSS (via CDN or custom CSS).
*   **Backend**: Node.js (Express) + TypeScript.
*   **Database**: Redis.
*   **Infrastructure**: Docker & Docker Compose.

## Getting Started

### Prerequisites

*   Docker & Docker Compose
*   Node.js (for local dev)

### Running with Docker (Recommended)

1.  Build and start the containers:
    ```bash
    docker-compose up --build
    ```
2.  Open [http://localhost:3000](http://localhost:3000) in your browser.

### Local Development

1.  Start Redis (e.g., via Docker):
    ```bash
    docker run -d -p 6379:6379 redis:alpine
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server (Frontend + Backend):
    ```bash
    npm run dev
    ```
4.  Open [http://localhost:5173](http://localhost:5173) (Vite dev server).
    *   Note: The backend runs on port 3000. Vite proxies API requests to it if configured, or you might need to adjust CORS/ports.
    *   Currently, the frontend points to `http://localhost:3000/api`. Ensure the backend is running.

## Usage

1.  **Registration**: Add player names on the home page.
2.  **Start**: Click "Start Group Stage" once you have at least 4 players.
3.  **Groups**: Enter points for each player in their pods and submit results.
4.  **Brackets**: Once all group matches are done, click "Generate Brackets".
5.  **Playoffs**: Click on player names in the bracket to advance them to the next round (or mark them as winner).

