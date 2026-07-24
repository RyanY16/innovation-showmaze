export type Direction = "up" | "down" | "left" | "right";
export type Difficulty = "easy" | "medium" | "hard";
export type RoomStatus = "lobby" | "countdown" | "playing" | "paused" | "round_over" | "finished";
export type SelectionMode = "random" | "first" | "majority" | "weighted" | "chaos";
export type FinishedReason = "won" | "ended";

export interface Position {
  row: number;
  column: number;
}

export interface MazeCell {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface Maze {
  grid: MazeCell[][];
  rows: number;
  columns: number;
  start: Position;
  exit: Position;
  distanceToExit: number[][];
}

export interface PlayerStats {
  submittedInputs: number;
  selectedMoves: number;
  helpfulMoves: number;
  harmfulMoves: number;
  neutralMoves: number;
  wallHits: number;
  rejectedSpamInputs: number;
  netContribution: number;
  accuracy: number;
  finalMoves: number;
}

export interface Player {
  id: string;
  displayName: string;
  connected: boolean;
  joinedAt: number;
  stats: PlayerStats;
}

export interface SubmittedInput {
  playerId: string;
  displayName: string;
  direction: Direction;
  receivedAt: number;
  windowId: string;
}

export interface SelectedMove extends SubmittedInput {
  moved: boolean;
  wallHit: boolean;
  from: Position;
  to: Position;
  quality: -1 | 0 | 1;
}

export interface MoveHistoryItem extends SelectedMove {
  id: string;
}

export interface Award {
  title: string;
  winners: string[];
  value: string;
}

export interface GameResults {
  leaderboard: Player[];
  awards: Award[];
}

export interface PublicRoomState {
  roomId: string;
  roomCode: string;
  hostId: string;
  stateVersion: number;
  status: RoomStatus;
  difficulty: Difficulty;
  selectionMode: SelectionMode;
  inputWindowDuration: number;
  inputBatchSize: number;
  pendingInputCount: number;
  moveCooldownMs: number;
  nextMoveAvailableAt: number;
  totalRounds: number;
  currentRound: number;
  completedRounds: number;
  maze: Maze;
  playerPosition: Position;
  currentWindowId: string;
  windowStartedAt: number;
  windowEndsAt: number;
  selectedMove: SelectedMove | null;
  connectedPlayerCount: number;
  players: Player[];
  history: MoveHistoryItem[];
  startedAt: number | null;
  finishedAt: number | null;
  finishedReason: FinishedReason | null;
  countdownEndsAt: number | null;
  results: GameResults | null;
}

export type ClientEvent =
  | { type: "JOIN_ROOM"; roomId: string; playerId: string; displayName: string }
  | { type: "LEAVE_ROOM"; roomId: string; playerId: string }
  | { type: "HOST_JOIN"; roomId?: string; playerId: string; displayName?: string }
  | { type: "WATCH_ROOM"; roomId: string }
  | { type: "SUBMIT_INPUT"; direction: Direction; windowId: string }
  | { type: "HOST_START_GAME" }
  | { type: "HOST_PAUSE_GAME" }
  | { type: "HOST_RESET_GAME" }
  | { type: "HOST_END_ROUND" }
  | { type: "HOST_END_GAME" }
  | { type: "HOST_NEW_MAZE"; difficulty: Difficulty }
  | { type: "HOST_SET_WINDOW"; duration: number }
  | { type: "HOST_SET_INPUT_BATCH"; inputBatchSize: number }
  | { type: "HOST_SET_ROUNDS"; rounds: number };

export type ServerEvent =
  | { type: "ROOM_STATE"; state: PublicRoomState }
  | { type: "WINDOW_OPENED"; windowId: string; endsAt: number }
  | { type: "INPUT_ACCEPTED"; windowId: string; direction: Direction }
  | { type: "INPUT_REJECTED"; reason: string }
  | { type: "MOVE_SELECTED"; move: SelectedMove }
  | { type: "PLAYER_MOVED"; position: Position }
  | { type: "GAME_FINISHED"; results: GameResults; reason: FinishedReason }
  | { type: "ERROR"; message: string };
