import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { attemptMove, createMaze, difficultySettings } from "../src/lib/game/maze";
import { calculateAwards, emptyStats, leaderboard, recalculateStats } from "../src/lib/game/stats";
import type {
  ClientEvent,
  Difficulty,
  Direction,
  MoveHistoryItem,
  Player,
  PublicRoomState,
  SelectedMove,
  ServerEvent,
  SubmittedInput
} from "../src/lib/types";

type ClientContext = {
  socket: WebSocket;
  roomId: string | null;
  playerId: string | null;
  isHost: boolean;
};

type Room = PublicRoomState & {
  inputs: Map<string, SubmittedInput>;
  inputPlayers: Set<string>;
  queuedInputs: SubmittedInput[];
  queuedInputPlayers: Set<string>;
  httpPlayerLastSeen: Map<string, number>;
  sockets: Set<WebSocket>;
  hostSocket: WebSocket | null;
  timer: NodeJS.Timeout | null;
  queueTimer: NodeJS.Timeout | null;
  persistTimer: NodeJS.Timeout | null;
  clutchPlayerId: string | null;
};

const rooms = new Map<string, Room>();
const clients = new Map<WebSocket, ClientContext>();
const port = Number(process.env.PORT ?? 8787);
const roundDifficulties: Difficulty[] = ["easy", "medium", "hard"];
const countdownDurationMs = 3000;
const roundDurationMs = 30000;

const httpServer = createServer((request, response) => {
  setCors(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.url === "/create-room" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const parsed = safeJson(body);
      const hostId = sanitizeId(parsed.hostId) || randomUUID();
      const difficulty = parseDifficulty(parsed.difficulty);
      const room = createRoom(hostId, difficulty);
      sendJson(response, 200, { roomId: room.roomId, roomCode: room.roomCode, hostId });
    });
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/room-state" && request.method === "GET") {
    const roomId = url.searchParams.get("roomId") ?? "";
    const playerId = sanitizeId(url.searchParams.get("playerId") ?? "");
    const room = rooms.get(roomId) ?? findByCode(roomId);
    if (!room) return sendJson(response, 404, { error: "Room not found." });
    if (playerId) room.httpPlayerLastSeen.set(playerId, Date.now());
    sendJson(response, 200, { state: publicState(room) });
    return;
  }

  if (url.pathname === "/join-room" && request.method === "POST") {
    readRequestJson(request, (parsed) => {
      const room = rooms.get(String(parsed.roomId ?? "")) ?? findByCode(String(parsed.roomId ?? ""));
      const playerId = sanitizeId(parsed.playerId);
      if (!room || !playerId) return sendJson(response, 404, { error: "Room not found." });
      const player = upsertPlayer(room, playerId, sanitizeName(parsed.displayName));
      room.httpPlayerLastSeen.set(player.id, Date.now());
      broadcast(room);
      persist(room);
      sendJson(response, 200, { state: publicState(room) });
    });
    return;
  }

  if (url.pathname === "/leave-room" && request.method === "POST") {
    readRequestJson(request, (parsed) => {
      const room = rooms.get(String(parsed.roomId ?? "")) ?? findByCode(String(parsed.roomId ?? ""));
      const playerId = sanitizeId(parsed.playerId);
      if (!room || !playerId) return sendJson(response, 404, { error: "Room not found." });
      leavePlayer(room, playerId);
      broadcast(room);
      persist(room);
      sendJson(response, 200, { state: publicState(room) });
    });
    return;
  }

  if (url.pathname === "/submit-input" && request.method === "POST") {
    readRequestJson(request, (parsed) => {
      const room = rooms.get(String(parsed.roomId ?? "")) ?? findByCode(String(parsed.roomId ?? ""));
      const playerId = sanitizeId(parsed.playerId);
      if (!room || !playerId) return sendJson(response, 404, { error: "Room not found." });
      room.httpPlayerLastSeen.set(playerId, Date.now());
      const result = submitHttpInput(room, playerId, parsed.direction, String(parsed.windowId ?? ""));
      sendJson(response, result.ok ? 200 : 409, result);
    });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket) => {
  clients.set(socket, { socket, roomId: null, playerId: null, isHost: false });

  socket.on("message", (raw) => {
    const event = safeJson(raw.toString()) as ClientEvent;
    handleEvent(socket, event);
  });

  socket.on("close", () => {
    const context = clients.get(socket);
    if (context?.roomId) {
      const room = rooms.get(context.roomId);
      if (room) {
        room.sockets.delete(socket);
        if (context.playerId) {
          const player = room.players.find((candidate) => candidate.id === context.playerId);
          if (player) player.connected = false;
        }
        if (room.hostSocket === socket) room.hostSocket = null;
        broadcast(room);
      }
    }
    clients.delete(socket);
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Innovation Showmaze game server listening on :${port}`);
});

function handleEvent(socket: WebSocket, event: ClientEvent) {
  const context = clients.get(socket);
  if (!context || !event?.type) return;

  if (event.type === "WATCH_ROOM") {
    const room = rooms.get(event.roomId) ?? findByCode(event.roomId);
    if (!room) return send(socket, { type: "ERROR", message: "Room not found." });
    context.roomId = room.roomId;
    context.playerId = null;
    context.isHost = false;
    room.sockets.add(socket);
    send(socket, { type: "ROOM_STATE", state: publicState(room) });
    return;
  }

  if (event.type === "HOST_JOIN") {
    const playerId = sanitizeId(event.playerId);
    if (!playerId) return send(socket, { type: "ERROR", message: "Host identity is required." });
    const room = event.roomId ? rooms.get(event.roomId) ?? createRoom(playerId, "easy", event.roomId) : createRoom(playerId);
    if (room.hostId && room.hostId !== playerId) {
      context.roomId = room.roomId;
      context.playerId = playerId;
      context.isHost = false;
      room.sockets.add(socket);
      send(socket, { type: "ROOM_STATE", state: publicState(room) });
      send(socket, { type: "ERROR", message: "This room already has a different host." });
      return;
    }
    joinSocket(context, room, playerId, true);
    room.hostId = playerId;
    room.hostSocket = socket;
    send(socket, { type: "ROOM_STATE", state: publicState(room) });
    broadcast(room);
    persist(room);
    return;
  }

  if (event.type === "JOIN_ROOM") {
    const room = rooms.get(event.roomId) ?? findByCode(event.roomId);
    const playerId = sanitizeId(event.playerId);
    if (!room || !playerId) return send(socket, { type: "ERROR", message: "Room not found." });
    const displayName = sanitizeName(event.displayName);
    joinSocket(context, room, playerId, false);
    upsertPlayer(room, playerId, displayName);
    send(socket, { type: "ROOM_STATE", state: publicState(room) });
    broadcast(room);
    persist(room);
    return;
  }

  if (event.type === "LEAVE_ROOM") {
    const room = rooms.get(event.roomId) ?? findByCode(event.roomId);
    const playerId = sanitizeId(event.playerId);
    if (!room || !playerId) return send(socket, { type: "ERROR", message: "Room not found." });
    leavePlayer(room, playerId);
    context.roomId = null;
    context.playerId = null;
    context.isHost = false;
    room.sockets.delete(socket);
    send(socket, { type: "ROOM_STATE", state: publicState(room) });
    broadcast(room);
    persist(room);
    return;
  }

  const room = context.roomId ? rooms.get(context.roomId) : null;
  if (!room) return send(socket, { type: "ERROR", message: "Join a room first." });

  if (event.type === "SUBMIT_INPUT") {
    submitInput(socket, context, room, event.direction, event.windowId);
    return;
  }

  if (!context.isHost || context.playerId !== room.hostId) {
    send(socket, { type: "ERROR", message: "Only the host can use that control." });
    return;
  }

  if (event.type === "HOST_START_GAME") startGame(room);
  if (event.type === "HOST_PAUSE_GAME") pauseGame(room);
  if (event.type === "HOST_RESET_GAME") resetRoom(room);
  if (event.type === "HOST_END_ROUND") endRound(room);
  if (event.type === "HOST_END_GAME") finishGame(room, "ended");
  if (event.type === "HOST_NEW_MAZE") newMaze(room, event.difficulty);
  if (event.type === "HOST_SET_WINDOW") setWindowDuration(room, event.duration);
  if (event.type === "HOST_SET_INPUT_BATCH") setInputBatchSize(room, event.inputBatchSize);
  if (event.type === "HOST_SET_ROUNDS") setTotalRounds(room, event.rounds);
}

function submitInput(socket: WebSocket, context: ClientContext, room: Room, direction: Direction, windowId: string) {
  if (room.status !== "playing") return send(socket, { type: "INPUT_REJECTED", reason: "Game is not accepting moves." });
  if (!isAcceptingWindow(room, windowId)) return send(socket, { type: "INPUT_REJECTED", reason: "That input window has closed." });
  if (!["up", "down", "left", "right"].includes(direction)) return send(socket, { type: "INPUT_REJECTED", reason: "Invalid direction." });
  if (!context.playerId) return send(socket, { type: "INPUT_REJECTED", reason: "Unknown player." });

  const player = room.players.find((candidate) => candidate.id === context.playerId);
  if (!player) return send(socket, { type: "INPUT_REJECTED", reason: "Player is not in this room." });

  if (room.queuedInputPlayers.has(player.id)) {
    player.stats = recalculateStats({ ...player.stats, rejectedSpamInputs: player.stats.rejectedSpamInputs + 1 });
    send(socket, { type: "INPUT_REJECTED", reason: "You already have a move queued." });
    vibrateHint(socket, "spam");
    broadcast(room);
    persistSoon(room);
    return;
  }

  player.stats = recalculateStats({ ...player.stats, submittedInputs: player.stats.submittedInputs + 1 });
  queueInput(room, {
    playerId: player.id,
    displayName: player.displayName,
    direction,
    receivedAt: Date.now(),
    windowId
  });
  send(socket, { type: "INPUT_ACCEPTED", windowId, direction });
  broadcast(room);
  scheduleQueueProcessing(room);
}

function submitHttpInput(room: Room, playerId: string, direction: unknown, windowId: string) {
  if (room.status !== "playing") return { ok: false, reason: "Game is not accepting moves." };
  if (!isAcceptingWindow(room, windowId)) return { ok: false, reason: "That input window has closed." };
  const safeDirection = String(direction) as Direction;
  if (!["up", "down", "left", "right"].includes(safeDirection)) return { ok: false, reason: "Invalid direction." };

  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) return { ok: false, reason: "Player is not in this room." };

  if (room.queuedInputPlayers.has(player.id)) {
    player.stats = recalculateStats({ ...player.stats, rejectedSpamInputs: player.stats.rejectedSpamInputs + 1 });
    broadcast(room);
    persistSoon(room);
    return { ok: false, reason: "You already have a move queued." };
  }

  player.stats = recalculateStats({ ...player.stats, submittedInputs: player.stats.submittedInputs + 1 });
  queueInput(room, {
    playerId: player.id,
    displayName: player.displayName,
    direction: safeDirection,
    receivedAt: Date.now(),
    windowId
  });
  broadcast(room);
  scheduleQueueProcessing(room);
  return { ok: true, windowId, direction: safeDirection, state: publicState(room) };
}

function isAcceptingWindow(room: Room, windowId: string) {
  return windowId === room.currentWindowId || Date.now() < room.nextMoveAvailableAt;
}

function queueInput(room: Room, input: SubmittedInput) {
  room.queuedInputs.push(input);
  room.queuedInputPlayers.add(input.playerId);
  room.inputs.set(input.playerId, input);
  room.inputPlayers.add(input.playerId);
}

function scheduleQueueProcessing(room: Room) {
  if (room.queueTimer || room.status !== "playing") return;
  room.queueTimer = setTimeout(() => {
    room.queueTimer = null;
    processQueuedMove(room);
  }, 80);
}

function startGame(room: Room) {
  if (room.status === "playing" || room.status === "countdown") return;
  clearRoomTimer(room);
  clearQueueTimer(room);
  if (room.status === "finished") resetRun(room, true);
  if (room.status === "round_over") prepareNextRound(room);
  room.status = "countdown";
  room.countdownEndsAt = Date.now() + countdownDurationMs;
  room.roundEndsAt = null;
  room.startedAt = null;
  room.finishedAt = null;
  room.finishedReason = null;
  room.results = null;
  room.currentWindowId = "countdown";
  room.windowStartedAt = Date.now();
  room.windowEndsAt = 0;
  room.selectedMove = null;
  broadcast(room);
  persist(room);
  room.timer = setTimeout(() => beginTimedRound(room), countdownDurationMs);
}

function beginTimedRound(room: Room) {
  if (room.status !== "countdown") return;
  room.status = "playing";
  room.countdownEndsAt = null;
  room.startedAt = Date.now();
  room.roundEndsAt = room.startedAt + roundDurationMs;
  openWindow(room);
  room.timer = setTimeout(() => endRound(room), roundDurationMs);
}

function openWindow(room: Room) {
  if (room.status !== "playing") return;
  room.inputs.clear();
  room.inputPlayers.clear();
  room.currentWindowId = randomUUID();
  room.windowStartedAt = Date.now();
  room.windowEndsAt = 0;
  room.nextMoveAvailableAt = 0;
  room.selectedMove = null;
  broadcast(room, { type: "WINDOW_OPENED", windowId: room.currentWindowId, endsAt: room.windowEndsAt });
}

function processQueuedMove(room: Room) {
  if (room.status !== "playing") return;
  const selected = room.queuedInputs.shift();
  if (!selected) {
    openWindow(room);
    return;
  }
  room.queuedInputPlayers.delete(selected.playerId);
  room.inputs.delete(selected.playerId);
  room.inputPlayers.delete(selected.playerId);
  const from = room.playerPosition;
  const result = attemptMove(room.maze, from, selected.direction);
  const move: SelectedMove = {
    ...selected,
    from,
    to: result.to,
    moved: result.moved,
    wallHit: result.wallHit,
    quality: result.quality
  };

  room.playerPosition = result.to;
  room.selectedMove = move;
  room.history = [{ ...move, id: randomUUID() }, ...room.history].slice(0, 10);
  updateSelectedPlayerStats(room, move);
  broadcast(room, { type: "MOVE_SELECTED", move });
  broadcast(room, { type: "PLAYER_MOVED", position: room.playerPosition });

  if (room.playerPosition.row === room.maze.exit.row && room.playerPosition.column === room.maze.exit.column) {
    const player = room.players.find((candidate) => candidate.id === move.playerId);
    if (player) player.stats = recalculateStats({ ...player.stats, finalMoves: player.stats.finalMoves + 1 });
    room.clutchPlayerId = move.playerId;
    completeRound(room, "cleared");
    return;
  }

  persistSoon(room);
  if (room.queuedInputs.length) processQueuedMove(room);
  else openWindow(room);
}

function updateSelectedPlayerStats(room: Room, move: SelectedMove) {
  const player = room.players.find((candidate) => candidate.id === move.playerId);
  if (!player) return;
  const stats = { ...player.stats, selectedMoves: player.stats.selectedMoves + 1 };
  if (move.wallHit) stats.wallHits += 1;
  else if (move.quality > 0) stats.helpfulMoves += 1;
  else if (move.quality < 0) stats.harmfulMoves += 1;
  else stats.neutralMoves += 1;
  player.stats = recalculateStats(stats);
}

function pauseGame(room: Room) {
  if (room.status !== "playing") return;
  clearRoomTimer(room);
  clearQueueTimer(room);
  room.status = "paused";
  room.nextMoveAvailableAt = 0;
  room.inputs.clear();
  room.inputPlayers.clear();
  room.queuedInputs = [];
  room.queuedInputPlayers.clear();
  broadcast(room);
  persist(room);
}

function resetRoom(room: Room) {
  clearRoomTimer(room);
  clearQueueTimer(room);
  resetRun(room, true);
  broadcast(room);
  persist(room);
}

function resetRun(room: Room, regenerateMaze: boolean) {
  room.currentRound = 1;
  room.completedRounds = 0;
  room.roundResult = null;
  room.totalRounds = roundDifficulties.length;
  room.difficulty = difficultyForRound(room.currentRound);
  const maze = regenerateMaze ? createMaze(room.difficulty) : room.maze;
  room.maze = maze;
  room.playerPosition = maze.start;
  room.status = "lobby";
  room.startedAt = null;
  room.finishedAt = null;
  room.finishedReason = null;
  room.countdownEndsAt = null;
  room.roundEndsAt = null;
  room.roundResult = null;
  room.currentWindowId = "lobby";
  room.windowStartedAt = 0;
  room.windowEndsAt = 0;
  room.countdownEndsAt = null;
  room.roundEndsAt = null;
  room.nextMoveAvailableAt = 0;
  room.selectedMove = null;
  room.history = [];
  room.results = null;
  room.clutchPlayerId = null;
  room.inputs.clear();
  room.inputPlayers.clear();
  room.queuedInputs = [];
  room.queuedInputPlayers.clear();
  room.players = room.players.map((player) => ({ ...player, stats: emptyStats() }));
}

function prepareNextRound(room: Room) {
  room.currentRound = Math.min(room.completedRounds + 1, room.totalRounds);
  room.difficulty = difficultyForRound(room.currentRound);
  room.inputWindowDuration = difficultySettings[room.difficulty].window;
  const maze = createMaze(room.difficulty);
  room.maze = maze;
  room.playerPosition = maze.start;
  room.roundResult = null;
  room.currentWindowId = "lobby";
  room.windowStartedAt = 0;
  room.windowEndsAt = 0;
  room.nextMoveAvailableAt = 0;
  room.selectedMove = null;
  room.history = [];
  room.inputs.clear();
  room.inputPlayers.clear();
  room.queuedInputs = [];
  room.queuedInputPlayers.clear();
}

function completeRound(room: Room, roundResult: "cleared" | "failed" = "cleared") {
  room.completedRounds = Math.max(room.completedRounds, room.currentRound);
  room.roundResult = roundResult;
  if (room.completedRounds >= room.totalRounds) {
    finishGame(room, roundResult === "cleared" ? "won" : "ended");
    return;
  }

  clearRoomTimer(room);
  clearQueueTimer(room);
  room.status = "round_over";
  room.currentWindowId = "round-over";
  room.windowStartedAt = 0;
  room.windowEndsAt = 0;
  room.countdownEndsAt = null;
  room.roundEndsAt = null;
  room.nextMoveAvailableAt = 0;
  room.inputs.clear();
  room.inputPlayers.clear();
  room.queuedInputs = [];
  room.queuedInputPlayers.clear();
  broadcast(room);
  persist(room);
}

function endRound(room: Room) {
  if (room.status !== "playing" && room.status !== "countdown") return;
  completeRound(room, "failed");
}

function newMaze(room: Room, difficulty: Difficulty) {
  room.difficulty = difficultyForRound(room.currentRound);
  room.inputWindowDuration = difficultySettings[room.difficulty].window;
  resetRoom(room);
}

function setWindowDuration(room: Room, duration: number) {
  room.inputWindowDuration = Math.max(100, Math.min(1200, Math.round(duration)));
  broadcast(room);
  persistSoon(room);
}

function setInputBatchSize(room: Room, inputBatchSize: number) {
  room.inputBatchSize = Math.max(1, Math.min(25, Math.round(inputBatchSize)));
  broadcast(room);
  persistSoon(room);
  if (room.status === "playing" && room.queuedInputs.length && room.nextMoveAvailableAt <= Date.now()) processQueuedMove(room);
}

function setTotalRounds(room: Room, rounds: number) {
  if (room.status === "playing") return;
  room.totalRounds = roundDifficulties.length;
  broadcast(room);
  persistSoon(room);
}

function finishGame(room: Room, reason: "won" | "ended") {
  if (room.status === "finished") return;
  clearRoomTimer(room);
  clearQueueTimer(room);
  room.status = "finished";
  room.finishedAt = Date.now();
  room.finishedReason = reason;
  room.currentWindowId = "finished";
  room.windowStartedAt = 0;
  room.windowEndsAt = 0;
  room.countdownEndsAt = null;
  room.roundEndsAt = null;
  room.nextMoveAvailableAt = 0;
  room.inputs.clear();
  room.inputPlayers.clear();
  room.queuedInputs = [];
  room.queuedInputPlayers.clear();
  room.results = {
    leaderboard: leaderboard(room.players),
    awards: calculateAwards(room.players, room.clutchPlayerId)
  };
  broadcast(room, { type: "GAME_FINISHED", results: room.results, reason });
  persist(room);
}

function createRoom(hostId: string, difficulty: Difficulty = "easy", requestedRoomId?: string): Room {
  const existing = requestedRoomId ? rooms.get(requestedRoomId) : null;
  if (existing) return existing;
  const maze = createMaze(difficulty);
  const roomId = requestedRoomId ?? randomUUID();
  const room: Room = {
    roomId,
    roomCode: makeRoomCode(),
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
    totalRounds: roundDifficulties.length,
    currentRound: 1,
    completedRounds: 0,
    roundResult: null,
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
    roundEndsAt: null,
    results: null,
    inputs: new Map(),
    inputPlayers: new Set(),
    queuedInputs: [],
    queuedInputPlayers: new Set(),
    httpPlayerLastSeen: new Map(),
    sockets: new Set(),
    hostSocket: null,
    timer: null,
    queueTimer: null,
    persistTimer: null,
    clutchPlayerId: null
  };
  rooms.set(roomId, room);
  persist(room);
  return room;
}

function joinSocket(context: ClientContext, room: Room, playerId: string, isHost: boolean) {
  context.roomId = room.roomId;
  context.playerId = playerId;
  context.isHost = isHost;
  room.sockets.add(context.socket);
}

function upsertPlayer(room: Room, playerId: string, displayName: string) {
  const existing = room.players.find((player) => player.id === playerId);
  if (existing) {
    existing.displayName = displayName;
    existing.connected = true;
    return existing;
  }
  const player: Player = { id: playerId, displayName, connected: true, joinedAt: Date.now(), stats: emptyStats() };
  room.players.push(player);
  return player;
}

function leavePlayer(room: Room, playerId: string) {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (player) player.connected = false;
  room.httpPlayerLastSeen.delete(playerId);
  room.queuedInputs = room.queuedInputs.filter((input) => input.playerId !== playerId);
  room.queuedInputPlayers.delete(playerId);
  room.inputs.delete(playerId);
  room.inputPlayers.delete(playerId);
}

function publicState(room: Room): PublicRoomState {
  const connectedIds = new Set(
    [...clients.values()]
      .filter((client) => client.roomId === room.roomId && client.playerId && !client.isHost)
      .map((client) => client.playerId)
  );
  const now = Date.now();
  for (const [playerId, lastSeen] of room.httpPlayerLastSeen) {
    if (now - lastSeen < 10000) connectedIds.add(playerId);
    else room.httpPlayerLastSeen.delete(playerId);
  }
  room.connectedPlayerCount = connectedIds.size;
  room.players = room.players.map((player) => ({ ...player, connected: connectedIds.has(player.id) }));
  const visiblePlayers = room.status === "lobby" ? room.players.filter((player) => player.connected) : room.players;
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    hostId: room.hostId,
    stateVersion: room.stateVersion,
    status: room.status,
    difficulty: room.difficulty,
    selectionMode: room.selectionMode,
    inputWindowDuration: room.inputWindowDuration,
    inputBatchSize: room.inputBatchSize,
    pendingInputCount: room.queuedInputs.length,
    moveCooldownMs: room.moveCooldownMs,
    nextMoveAvailableAt: room.nextMoveAvailableAt,
    totalRounds: room.totalRounds,
    currentRound: room.currentRound,
    completedRounds: room.completedRounds,
    roundResult: room.roundResult,
    maze: room.maze,
    playerPosition: room.playerPosition,
    currentWindowId: room.currentWindowId,
    windowStartedAt: room.windowStartedAt,
    windowEndsAt: room.windowEndsAt,
    selectedMove: room.selectedMove,
    connectedPlayerCount: room.connectedPlayerCount,
    players: leaderboard(visiblePlayers),
    history: room.history,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
    finishedReason: room.finishedReason,
    countdownEndsAt: room.countdownEndsAt,
    roundEndsAt: room.roundEndsAt,
    results: room.results
  };
}

function broadcast(room: Room, extra?: ServerEvent) {
  const stateEvent: ServerEvent = { type: "ROOM_STATE", state: publicState(room) };
  for (const socket of room.sockets) {
    send(socket, stateEvent);
    if (extra) send(socket, extra);
  }
}

function send(socket: WebSocket, event: ServerEvent) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

function clearRoomTimer(room: Room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}

function clearQueueTimer(room: Room) {
  if (room.queueTimer) clearTimeout(room.queueTimer);
  room.queueTimer = null;
}

function persistSoon(room: Room) {
  if (room.persistTimer) return;
  room.persistTimer = setTimeout(() => {
    room.persistTimer = null;
    persist(room);
  }, 500);
}

function persist(room: Room) {
  const databaseUrl = process.env.FIREBASE_DATABASE_URL?.replace(/\/$/, "");
  const token = process.env.FIREBASE_DATABASE_AUTH_TOKEN;
  if (!databaseUrl || !token) return;
  fetch(`${databaseUrl}/rooms/${room.roomId}.json?auth=${encodeURIComponent(token)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(publicState(room))
  }).catch((error) => {
    console.error("Firebase persistence failed", error);
  });
}

function findByCode(roomCode: string) {
  return [...rooms.values()].find((room) => room.roomCode === roomCode.toUpperCase());
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function sanitizeName(name: string) {
  return String(name || "Player")
    .replace(/[^\w .-]/g, "")
    .trim()
    .slice(0, 18) || "Player";
}

function sanitizeId(id: string) {
  return String(id || "").replace(/[^\w-]/g, "").slice(0, 80);
}

function parseDifficulty(value: unknown): Difficulty {
  return value === "medium" || value === "hard" || value === "easy" ? value : "easy";
}

function difficultyForRound(round: number): Difficulty {
  return roundDifficulties[Math.max(0, Math.min(roundDifficulties.length - 1, round - 1))];
}

function safeJson(value: string) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function readRequestJson(request: IncomingMessage, callback: (value: Record<string, string>) => void) {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    callback(safeJson(body));
  });
}

function setCors(response: { setHeader: (name: string, value: string) => void }) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function sendJson(response: ServerResponse, status: number, data: unknown) {
  setCors(response);
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(data));
}

function vibrateHint(_socket: WebSocket, _kind: "spam") {
  // The browser performs actual vibration when it receives rejection/selection events.
}
