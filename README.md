# Innovation Showmaze

Innovation Showmaze is a real-time shared-controller maze game for phones and a projector. The MVP uses:

- Next.js App Router, React, TypeScript, and Tailwind CSS
- Canvas maze rendering
- An authoritative WebSocket game server with 400ms-style input windows
- Random selection mode with room/player stats, BFS move scoring, leaderboards, and awards
- Firebase Anonymous Authentication through Identity Toolkit REST when configured
- Optional Firebase Realtime Database persistence from the game server

## Run Locally

```bash
pnpm install
pnpm dev:all
```

Open:

- App: `http://localhost:3000`
- Game server health: `http://localhost:8787/health`

Create a room from the landing page, open the Host controls, then use the Display and Test Phone links.

## Deploy On Vercel

For Vercel, use Firebase Realtime Database. Vercel serves the app, Firebase stores room state, joins, leaves, and phone inputs, and the host browser processes the maze.

1. In Firebase, enable Anonymous Authentication.
2. Create a Realtime Database.
3. Publish `firebase.database.rules.json` to that database.
4. Add these Vercel environment variables:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com
```

The other Firebase public values are fine to keep, but the game only needs the API key and database URL for this MVP.

## Production Notes

When `NEXT_PUBLIC_FIREBASE_DATABASE_URL` is set, the app automatically uses Firebase and does not need the local `server/index.ts` WebSocket server. Without Firebase, local development still uses the Node game server:

```bash
NEXT_PUBLIC_GAME_SERVER_URL=http://localhost:8787
NEXT_PUBLIC_GAME_WS_URL=ws://localhost:8787
```
