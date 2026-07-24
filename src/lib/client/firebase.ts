import { makeClientId } from "@/lib/client/config";
import { createMaze, difficultySettings } from "@/lib/game/maze";
import type { Difficulty, PublicRoomState } from "@/lib/types";

const databaseUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "";
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";

export type FirebaseIdentity = {
  uid: string;
  token: string;
};

export function isFirebaseConfigured() {
  return Boolean(apiKey && databaseUrl && !databaseUrl.includes("PASTE_"));
}

export async function getAnonymousPlayerId(fallbackId: string) {
  const identity = await ensureFirebaseIdentity(fallbackId);
  return identity.uid;
}

export async function ensureFirebaseIdentity(fallbackId = makeClientId()): Promise<FirebaseIdentity> {
  if (!isFirebaseConfigured()) return { uid: fallbackId, token: "" };

  try {
    const storedUid = window.localStorage.getItem("crowd-maze-firebase-uid");
    const storedToken = window.localStorage.getItem("crowd-maze-firebase-token");
    if (storedUid && storedToken) return { uid: storedUid, token: storedToken };
  } catch {
    return { uid: fallbackId, token: "" };
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true })
  }).catch(() => null);

  if (!response?.ok) return { uid: fallbackId, token: "" };
  const data = (await response.json()) as { localId?: string; idToken?: string };
  const uid = data.localId || fallbackId;
  const token = data.idToken || "";
  try {
    window.localStorage.setItem("crowd-maze-firebase-uid", uid);
    if (token) window.localStorage.setItem("crowd-maze-firebase-token", token);
  } catch {
    // Local storage can be unavailable in private browser modes.
  }
  return { uid, token };
}

export async function createFirebaseRoom(hostId: string) {
  const roomId = makeClientId();
  const roomCode = makeRoomCode();
  const state = createInitialRoomState(roomId, roomCode, hostId);
  await firebasePut(`rooms/${roomId}/state`, state);
  await firebasePut(`roomCodes/${roomCode}`, roomId);
  return { roomId, roomCode, hostId };
}

export async function firebaseGet<T>(path: string): Promise<T | null> {
  const response = await fetch(firebaseUrl(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`Firebase returned ${response.status}`);
  const data = (await response.json()) as T | null;
  if (path.endsWith("/state") && data) return normalizeRoomState(data as unknown as PublicRoomState) as T;
  return data;
}

export async function firebasePut(path: string, body: unknown) {
  return firebaseWrite("PUT", path, body);
}

export async function firebasePatch(path: string, body: unknown) {
  return firebaseWrite("PATCH", path, body);
}

export async function firebasePost(path: string, body: unknown): Promise<{ name: string }> {
  const response = await firebaseWrite("POST", path, body);
  return (await response.json()) as { name: string };
}

export async function firebaseDelete(path: string) {
  await firebaseWrite("DELETE", path, null);
}

export async function resolveFirebaseRoomId(roomIdOrCode: string) {
  const direct = await firebaseGet<PublicRoomState>(`rooms/${roomIdOrCode}/state`).catch(() => null);
  if (direct) return roomIdOrCode;
  const code = roomIdOrCode.trim().toUpperCase();
  return firebaseGet<string>(`roomCodes/${code}`).catch(() => null);
}

function createInitialRoomState(roomId: string, roomCode: string, hostId: string, difficulty: Difficulty = "easy"): PublicRoomState {
  const maze = createMaze(difficulty);
  return {
    roomId,
    roomCode,
    hostId,
    stateVersion: 0,
    status: "lobby",
    difficulty,
    selectionMode: "random",
    inputWindowDuration: difficultySettings[difficulty].window,
    inputBatchSize: 1,
    pendingInputCount: 0,
    moveCooldownMs: 0,
    nextMoveAvailableAt: 0,
    totalRounds: 3,
    currentRound: 1,
    completedRounds: 0,
    maze,
    playerPosition: maze.start,
    currentWindowId: "lobby",
    windowStartedAt: 0,
    windowEndsAt: 0,
    selectedMove: null,
    connectedPlayerCount: 0,
    players: [],
    history: [],
    startedAt: null,
    finishedAt: null,
    finishedReason: null,
    countdownEndsAt: null,
    results: null
  };
}

function normalizeRoomState(state: PublicRoomState): PublicRoomState {
  return {
    ...state,
    stateVersion: typeof state.stateVersion === "number" ? state.stateVersion : 0,
    players: Array.isArray(state.players) ? state.players : [],
    history: Array.isArray(state.history) ? state.history : [],
    connectedPlayerCount: Array.isArray(state.players) ? state.players.filter((player) => player.connected).length : 0,
    results: state.results
      ? {
          ...state.results,
          leaderboard: Array.isArray(state.results.leaderboard) ? state.results.leaderboard : [],
          awards: Array.isArray(state.results.awards) ? state.results.awards : []
        }
      : null
  };
}

async function firebaseWrite(method: "PUT" | "PATCH" | "POST" | "DELETE", path: string, body: unknown) {
  const response = await fetch(firebaseUrl(path), {
    method,
    headers: body === null ? undefined : { "content-type": "application/json" },
    body: body === null ? undefined : JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Firebase returned ${response.status}`);
  return response;
}

function firebaseUrl(path: string) {
  const trimmed = databaseUrl.replace(/\/$/, "");
  return `${trimmed}/${path}.json`;
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
