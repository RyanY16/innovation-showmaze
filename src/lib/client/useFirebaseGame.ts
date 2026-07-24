"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { makeClientId } from "@/lib/client/config";
import {
  ensureFirebaseIdentity,
  firebaseDelete,
  firebaseGet,
  firebasePost,
  firebasePut,
  resolveFirebaseRoomId
} from "@/lib/client/firebase";
import { attemptMove, createMaze, difficultySettings } from "@/lib/game/maze";
import { calculateAwards, emptyStats, leaderboard, recalculateStats } from "@/lib/game/stats";
import type { ClientEvent, Direction, Player, PublicRoomState, SelectedMove, ServerEvent, SubmittedInput } from "@/lib/types";

type JoinRecord = {
  displayName: string;
  joinedAt: number;
};

type InputRecord = SubmittedInput;

const roundDifficulties = ["easy", "medium", "hard"] as const;

export function useFirebaseGame() {
  const [state, setState] = useState<PublicRoomState | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastEvent, setLastEvent] = useState<ServerEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roomIdRef = useRef("");
  const playerIdRef = useRef("");
  const isHostRef = useRef(false);
  const stateRef = useRef<PublicRoomState | null>(null);
  const processingRef = useRef(false);

  const publishState = useCallback(async (nextState: PublicRoomState, event?: ServerEvent) => {
    stateRef.current = nextState;
    setState(nextState);
    if (event) setLastEvent(event);
    await firebasePut(`rooms/${nextState.roomId}/state`, nextState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    ensureFirebaseIdentity().then(() => {
      if (cancelled) return;
      setStatus("connected");
      setError(null);
    }).catch(() => {
      if (cancelled) return;
      setStatus("disconnected");
      setError("Firebase auth failed.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const pollState = async () => {
      const roomId = roomIdRef.current;
      if (!roomId) return;
      try {
        const nextState = await firebaseGet<PublicRoomState>(`rooms/${roomId}/state`);
        if (!nextState) {
          setState(null);
          setLastEvent({ type: "ERROR", message: "Room not found." });
          setError("Room not found.");
          return;
        }
        stateRef.current = nextState;
        setState(nextState);
        setLastEvent({ type: "ROOM_STATE", state: nextState });
        setError(null);
      } catch {
        setError("Firebase state sync failed.");
      }
    };
    const interval = window.setInterval(pollState, 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (!isHostRef.current || processingRef.current) return;
      const current = stateRef.current;
      if (!current) return;
      processingRef.current = true;
      try {
        await processHostQueues(current, publishState);
      } catch {
        setError("Firebase host processing failed.");
      } finally {
        processingRef.current = false;
      }
    }, 60);
    return () => window.clearInterval(interval);
  }, [publishState]);

  const send = useCallback((event: ClientEvent) => {
    if (event.type === "WATCH_ROOM") {
      const watchRoom = async () => {
        const resolved = await resolveFirebaseRoomId(event.roomId);
        if (!resolved) {
          setState(null);
          setError("Room not found.");
          setLastEvent({ type: "ERROR", message: "Room not found." });
          return;
        }
        roomIdRef.current = resolved;
        const nextState = await firebaseGet<PublicRoomState>(`rooms/${resolved}/state`);
        if (nextState) {
          stateRef.current = nextState;
          setState(nextState);
          setLastEvent({ type: "ROOM_STATE", state: nextState });
        }
      };
      watchRoom().catch(() => setError("Room not found."));
      return true;
    }

    if (event.type === "HOST_JOIN") {
      isHostRef.current = true;
      playerIdRef.current = event.playerId;
      const connectHost = async () => {
        const resolved = event.roomId ? await resolveFirebaseRoomId(event.roomId) : null;
        if (!resolved) {
          setError("Room not found.");
          setLastEvent({ type: "ERROR", message: "Room not found." });
          return;
        }
        roomIdRef.current = resolved;
        const nextState = await firebaseGet<PublicRoomState>(`rooms/${resolved}/state`);
        if (!nextState) throw new Error("Room not found.");
        stateRef.current = nextState;
        setState(nextState);
        setLastEvent({ type: "ROOM_STATE", state: nextState });
      };
      connectHost().catch(() => setError("Room not found."));
      return true;
    }

    if (event.type === "JOIN_ROOM") {
      playerIdRef.current = event.playerId;
      const joinRoom = async () => {
        const resolved = await resolveFirebaseRoomId(event.roomId);
        if (!resolved) {
          setState(null);
          setError("Room not found.");
          setLastEvent({ type: "ERROR", message: "Room not found." });
          return;
        }
        roomIdRef.current = resolved;
        await firebasePut(`rooms/${resolved}/joins/${event.playerId}`, {
          displayName: sanitizeName(event.displayName),
          joinedAt: Date.now()
        } satisfies JoinRecord);
        const nextState = await firebaseGet<PublicRoomState>(`rooms/${resolved}/state`);
        if (nextState) {
          setState(nextState);
          setLastEvent({ type: "ROOM_STATE", state: nextState });
        }
      };
      joinRoom().catch(() => setError("Could not join room."));
      return true;
    }

    if (event.type === "LEAVE_ROOM") {
      const roomId = roomIdRef.current || event.roomId;
      firebasePut(`rooms/${roomId}/leaves/${event.playerId}`, Date.now()).catch(() => setError("Could not leave room."));
      roomIdRef.current = "";
      playerIdRef.current = "";
      setState(null);
      return true;
    }

    if (event.type === "SUBMIT_INPUT") {
      const current = stateRef.current;
      const roomId = roomIdRef.current;
      const playerId = playerIdRef.current;
      const player = current?.players.find((candidate) => candidate.id === playerId);
      if (!roomId || !current || !player) return false;
      if (current.status !== "playing") {
        setLastEvent({ type: "INPUT_REJECTED", reason: "Game is not accepting moves." });
        return true;
      }
      firebasePost(`rooms/${roomId}/inputs`, {
        playerId,
        displayName: player.displayName,
        direction: event.direction,
        receivedAt: Date.now(),
        windowId: event.windowId
      } satisfies InputRecord).catch(() => setError("Could not submit move."));
      setLastEvent({ type: "INPUT_ACCEPTED", windowId: event.windowId, direction: event.direction });
      return true;
    }

    if (!isHostRef.current || !stateRef.current) return false;
    applyHostEvent(stateRef.current, event, publishState).catch(() => setError("Host command failed."));
    return true;
  }, [publishState]);

  return { state, status, lastEvent, error, socketUrl: "firebase", send, clearError: () => setError(null) };
}

async function processHostQueues(current: PublicRoomState, publishState: (state: PublicRoomState, event?: ServerEvent) => Promise<void>) {
  let nextState = { ...current, players: [...current.players], history: [...current.history] };
  const roomId = nextState.roomId;
  const shouldReadJoins = nextState.status !== "playing";
  const shouldReadInputs = nextState.status === "playing";
  const [joins, leaves, inputs] = await Promise.all([
    shouldReadJoins ? firebaseGet<Record<string, JoinRecord>>(`rooms/${roomId}/joins`).catch(() => null) : Promise.resolve(null),
    firebaseGet<Record<string, number>>(`rooms/${roomId}/leaves`).catch(() => null),
    shouldReadInputs ? firebaseGet<Record<string, InputRecord>>(`rooms/${roomId}/inputs`).catch(() => null) : Promise.resolve(null)
  ]);
  let changed = false;

  for (const [playerId, join] of Object.entries(joins || {})) {
    nextState = upsertPlayer(nextState, playerId, join.displayName, join.joinedAt);
    await firebaseDelete(`rooms/${roomId}/joins/${playerId}`).catch(() => undefined);
    changed = true;
  }

  for (const playerId of Object.keys(leaves || {})) {
    nextState = {
      ...nextState,
      players: nextState.players.map((player) => player.id === playerId ? { ...player, connected: false } : player)
    };
    await Promise.all([
      firebaseDelete(`rooms/${roomId}/joins/${playerId}`).catch(() => undefined),
      firebaseDelete(`rooms/${roomId}/leaves/${playerId}`).catch(() => undefined)
    ]);
    changed = true;
  }

  const sortedInputs = Object.entries(inputs || {}).sort((a, b) => a[1].receivedAt - b[1].receivedAt);
  if (sortedInputs.length) nextState = markSubmitted(nextState, sortedInputs.map(([, input]) => input));

  for (const [inputId, input] of sortedInputs) {
    if (nextState.status === "playing") {
      nextState = applyMove(nextState, input);
      changed = true;
    }
  }
  await Promise.all(sortedInputs.map(([inputId]) => firebaseDelete(`rooms/${roomId}/inputs/${inputId}`).catch(() => undefined)));

  nextState = { ...nextState, pendingInputCount: 0, connectedPlayerCount: nextState.players.filter((player) => player.connected).length };
  if (changed) await publishState(nextState, { type: "ROOM_STATE", state: nextState });
}

async function applyHostEvent(
  current: PublicRoomState,
  event: ClientEvent,
  publishState: (state: PublicRoomState, event?: ServerEvent) => Promise<void>
) {
  let nextState = current;
  if (event.type === "HOST_START_GAME") nextState = startGame(nextState);
  if (event.type === "HOST_RESET_GAME") nextState = resetRun(nextState);
  if (event.type === "HOST_END_ROUND") nextState = completeRound(nextState);
  if (event.type === "HOST_END_GAME") nextState = finishGame(nextState, "ended");
  if (event.type === "HOST_SET_INPUT_BATCH") nextState = { ...nextState, inputBatchSize: Math.max(1, Math.min(25, Math.round(event.inputBatchSize))) };
  if (event.type === "HOST_NEW_MAZE") nextState = resetRun({ ...nextState, difficulty: event.difficulty });
  await publishState(nextState, { type: "ROOM_STATE", state: nextState });
}

function startGame(state: PublicRoomState): PublicRoomState {
  const base = state.status === "round_over" ? prepareNextRound(state) : state.status === "finished" ? resetRun(state) : state;
  return {
    ...base,
    status: "playing",
    startedAt: Date.now(),
    finishedAt: null,
    finishedReason: null,
    results: null,
    currentWindowId: makeClientId(),
    windowStartedAt: Date.now(),
    windowEndsAt: 0,
    nextMoveAvailableAt: 0,
    selectedMove: null
  };
}

function resetRun(state: PublicRoomState): PublicRoomState {
  const difficulty = "easy";
  const maze = createMaze(difficulty);
  return {
    ...state,
    status: "lobby",
    difficulty,
    totalRounds: roundDifficulties.length,
    currentRound: 1,
    completedRounds: 0,
    maze,
    playerPosition: maze.start,
    currentWindowId: "lobby",
    windowStartedAt: 0,
    windowEndsAt: 0,
    nextMoveAvailableAt: 0,
    selectedMove: null,
    history: [],
    startedAt: null,
    finishedAt: null,
    finishedReason: null,
    results: null,
    players: state.players.map((player) => ({ ...player, stats: emptyStats() }))
  };
}

function prepareNextRound(state: PublicRoomState): PublicRoomState {
  const currentRound = Math.min(state.completedRounds + 1, state.totalRounds);
  const difficulty = difficultyForRound(currentRound);
  const maze = createMaze(difficulty);
  return {
    ...state,
    status: "round_over",
    currentRound,
    difficulty,
    inputWindowDuration: difficultySettings[difficulty].window,
    maze,
    playerPosition: maze.start,
    currentWindowId: "round-over",
    windowStartedAt: 0,
    windowEndsAt: 0,
    selectedMove: null,
    history: []
  };
}

function completeRound(state: PublicRoomState): PublicRoomState {
  const completedRounds = Math.max(state.completedRounds, state.currentRound);
  if (completedRounds >= state.totalRounds) return finishGame({ ...state, completedRounds }, "won");
  return {
    ...state,
    status: "round_over",
    completedRounds,
    currentWindowId: "round-over",
    selectedMove: null
  };
}

function finishGame(state: PublicRoomState, reason: "won" | "ended"): PublicRoomState {
  return {
    ...state,
    status: "finished",
    finishedAt: Date.now(),
    finishedReason: reason,
    currentWindowId: "finished",
    selectedMove: null,
    results: {
      leaderboard: leaderboard(state.players),
      awards: calculateAwards(state.players, null)
    }
  };
}

function applyMove(state: PublicRoomState, input: SubmittedInput): PublicRoomState {
  if (!["up", "down", "left", "right"].includes(input.direction)) return state;
  const result = attemptMove(state.maze, state.playerPosition, input.direction as Direction);
  const move: SelectedMove = {
    ...input,
    from: state.playerPosition,
    to: result.to,
    moved: result.moved,
    wallHit: result.wallHit,
    quality: result.quality
  };
  const players = state.players.map((player) => player.id === input.playerId ? updateSelectedStats(player, move) : player);
  const nextState: PublicRoomState = {
    ...state,
    players,
    playerPosition: result.to,
    selectedMove: move,
    history: [{ ...move, id: makeClientId() }, ...state.history].slice(0, 10),
    currentWindowId: makeClientId(),
    windowStartedAt: Date.now(),
    windowEndsAt: 0
  };
  if (result.to.row === state.maze.exit.row && result.to.column === state.maze.exit.column) {
    return completeRound({
      ...nextState,
      players: nextState.players.map((player) => player.id === input.playerId ? { ...player, stats: recalculateStats({ ...player.stats, finalMoves: player.stats.finalMoves + 1 }) } : player)
    });
  }
  return nextState;
}

function markSubmitted(state: PublicRoomState, inputs: SubmittedInput[]) {
  const counts = new Map<string, number>();
  for (const input of inputs) counts.set(input.playerId, (counts.get(input.playerId) || 0) + 1);
  return {
    ...state,
    players: state.players.map((player) => {
      const count = counts.get(player.id) || 0;
      return count ? { ...player, stats: recalculateStats({ ...player.stats, submittedInputs: player.stats.submittedInputs + count }) } : player;
    })
  };
}

function updateSelectedStats(player: Player, move: SelectedMove): Player {
  const stats = { ...player.stats, selectedMoves: player.stats.selectedMoves + 1 };
  if (move.wallHit) stats.wallHits += 1;
  else if (move.quality > 0) stats.helpfulMoves += 1;
  else if (move.quality < 0) stats.harmfulMoves += 1;
  else stats.neutralMoves += 1;
  return { ...player, stats: recalculateStats(stats) };
}

function upsertPlayer(state: PublicRoomState, playerId: string, displayName: string, joinedAt: number): PublicRoomState {
  const existing = state.players.find((player) => player.id === playerId);
  const players = existing
    ? state.players.map((player) => player.id === playerId ? { ...player, displayName: sanitizeName(displayName), connected: true } : player)
    : [...state.players, { id: playerId, displayName: sanitizeName(displayName), connected: true, joinedAt, stats: emptyStats() }];
  return { ...state, players, connectedPlayerCount: players.filter((player) => player.connected).length };
}

function difficultyForRound(round: number) {
  return round >= 3 ? "hard" : round === 2 ? "medium" : "easy";
}

function sanitizeName(name: string) {
  const cleaned = name.replace(/[^A-Za-z0-9_. -]/g, "").trim().slice(0, 18);
  return cleaned || "Player";
}
