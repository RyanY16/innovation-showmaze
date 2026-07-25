import type { Difficulty, Direction, Maze, MazeCell, Position } from "@/lib/types";

const opposite: Record<Direction, Direction> = {
  up: "down",
  right: "left",
  down: "up",
  left: "right"
};

const delta: Record<Direction, Position> = {
  up: { row: -1, column: 0 },
  right: { row: 0, column: 1 },
  down: { row: 1, column: 0 },
  left: { row: 0, column: -1 }
};

export const difficultySettings: Record<Difficulty, { rows: number; columns: number; window: number }> = {
  easy: { rows: 9, columns: 13, window: 100 },
  medium: { rows: 15, columns: 21, window: 100 },
  hard: { rows: 17, columns: 25, window: 100 }
};

const straightBias: Record<Difficulty, number> = {
  easy: 0.78,
  medium: 0.65,
  hard: 0.55
};

const routeDistanceLimit: Record<Difficulty, number> = {
  easy: 28,
  medium: 60,
  hard: 70
};

export function createMaze(difficulty: Difficulty = "easy"): Maze {
  let fallback: Maze | null = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const maze = buildMaze(difficulty);
    const distance = maze.distanceToExit[0][0];
    if (findRightDownPath(maze.grid).length || !Number.isFinite(distance)) continue;
    fallback ??= maze;
    if (distance <= routeDistanceLimit[difficulty]) return maze;
  }
  return fallback ?? buildMaze(difficulty);
}

function buildMaze(difficulty: Difficulty): Maze {
  const { rows, columns } = difficultySettings[difficulty];
  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, (): MazeCell => ({ top: true, right: true, bottom: true, left: true }))
  );
  const visited = Array.from({ length: rows }, () => Array.from({ length: columns }, () => false));
  const stack: Array<{ position: Position; direction: Direction | null }> = [{ position: { row: 0, column: 0 }, direction: null }];
  visited[0][0] = true;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const neighbors = shuffledDirections(current.direction, straightBias[difficulty])
      .map((direction) => ({ direction, next: add(current.position, delta[direction]) }))
      .filter(({ next }) => inBounds(next, rows, columns) && !visited[next.row][next.column]);

    if (!neighbors.length) {
      stack.pop();
      continue;
    }

    const { direction, next } = neighbors[0];
    grid[current.position.row][current.position.column][directionToWall(direction)] = false;
    grid[next.row][next.column][directionToWall(opposite[direction])] = false;
    visited[next.row][next.column] = true;
    stack.push({ position: next, direction });
  }

  const start = { row: 0, column: 0 };
  const exit = { row: rows - 1, column: columns - 1 };
  const protectedRoute = carveCrowdFriendlyRoute(grid, difficulty);
  removeRightDownOnlyRoutes(grid, protectedRoute);
  return { grid, rows, columns, start, exit, distanceToExit: buildDistanceMap(grid, exit) };
}

export function attemptMove(maze: Maze, from: Position, direction: Direction) {
  const cell = maze.grid[from.row][from.column];
  if (cell[directionToWall(direction)]) {
    return { moved: false, wallHit: true, to: from, quality: 0 as const };
  }

  const to = add(from, delta[direction]);
  const before = maze.distanceToExit[from.row][from.column];
  const after = maze.distanceToExit[to.row][to.column];
  const diff = before - after;
  return {
    moved: true,
    wallHit: false,
    to,
    quality: diff > 0 ? (1 as const) : diff < 0 ? (-1 as const) : (0 as const)
  };
}

export function canMove(maze: Maze, from: Position, direction: Direction) {
  return !maze.grid[from.row][from.column][directionToWall(direction)];
}

function buildDistanceMap(grid: MazeCell[][], exit: Position) {
  const rows = grid.length;
  const columns = grid[0].length;
  const distance = Array.from({ length: rows }, () => Array.from({ length: columns }, () => Number.POSITIVE_INFINITY));
  const queue: Position[] = [exit];
  distance[exit.row][exit.column] = 0;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const direction of Object.keys(delta) as Direction[]) {
      if (grid[current.row][current.column][directionToWall(direction)]) continue;
      const next = add(current, delta[direction]);
      if (!inBounds(next, rows, columns)) continue;
      if (distance[next.row][next.column] !== Number.POSITIVE_INFINITY) continue;
      distance[next.row][next.column] = distance[current.row][current.column] + 1;
      queue.push(next);
    }
  }

  return distance;
}

function directionToWall(direction: Direction): keyof MazeCell {
  return direction === "up" ? "top" : direction === "down" ? "bottom" : direction;
}

function add(a: Position, b: Position): Position {
  return { row: a.row + b.row, column: a.column + b.column };
}

function inBounds(position: Position, rows: number, columns: number) {
  return position.row >= 0 && position.column >= 0 && position.row < rows && position.column < columns;
}

function shuffledDirections(preferred: Direction | null, bias: number): Direction[] {
  const directions: Direction[] = ["up", "right", "down", "left"];
  for (let index = directions.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [directions[index], directions[swap]] = [directions[swap], directions[index]];
  }
  if (preferred && Math.random() < bias) {
    const index = directions.indexOf(preferred);
    if (index > 0) [directions[0], directions[index]] = [directions[index], directions[0]];
  }
  return directions;
}

function carveCrowdFriendlyRoute(grid: MazeCell[][], difficulty: Difficulty) {
  const rows = grid.length;
  const columns = grid[0].length;
  const waypoints = routeWaypoints(difficulty, rows, columns);
  const protectedRoute = new Set<string>();
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    carveSegment(grid, waypoints[index], waypoints[index + 1], protectedRoute);
  }
  return protectedRoute;
}

function routeWaypoints(difficulty: Difficulty, rows: number, columns: number): Position[] {
  const lastRow = rows - 1;
  const lastColumn = columns - 1;
  if (difficulty === "easy") {
    const earlyColumn = Math.max(5, Math.floor(columns * 0.62));
    const middleRow = Math.floor(rows * 0.38);
    const backtrackColumn = Math.max(2, earlyColumn - 2);
    return [
      { row: 0, column: 0 },
      { row: 0, column: earlyColumn },
      { row: middleRow, column: earlyColumn },
      { row: middleRow, column: backtrackColumn },
      { row: lastRow, column: backtrackColumn },
      { row: lastRow, column: lastColumn }
    ];
  }
  if (difficulty === "medium") {
    const middleRow = Math.floor(rows * 0.5);
    const nearEndColumn = Math.max(2, columns - 3);
    const earlyColumn = Math.floor(columns * 0.55);
    return [
      { row: 0, column: 0 },
      { row: 0, column: earlyColumn },
      { row: middleRow, column: earlyColumn },
      { row: middleRow, column: 2 },
      { row: Math.max(middleRow - 3, 1), column: 2 },
      { row: Math.max(middleRow - 3, 1), column: nearEndColumn },
      { row: lastRow, column: nearEndColumn },
      { row: lastRow, column: lastColumn }
    ];
  }
  const upperRow = Math.floor(rows * 0.28);
  const middleRow = Math.floor(rows * 0.5);
  const lowerRow = Math.floor(rows * 0.68);
  const nearEndColumn = Math.max(3, columns - 4);
  const firstColumn = Math.floor(columns * 0.34);
  const middleColumn = Math.floor(columns * 0.58);
  return [
    { row: 0, column: 0 },
    { row: 0, column: firstColumn },
    { row: upperRow, column: firstColumn },
    { row: upperRow, column: nearEndColumn },
    { row: middleRow, column: nearEndColumn },
    { row: middleRow, column: 3 },
    { row: lowerRow, column: 3 },
    { row: lowerRow, column: middleColumn },
    { row: lastRow - 2, column: middleColumn },
    { row: lastRow - 2, column: nearEndColumn },
    { row: lastRow, column: nearEndColumn },
    { row: lastRow, column: lastColumn }
  ];
}

function carveSegment(grid: MazeCell[][], start: Position, end: Position, protectedRoute: Set<string>) {
  let current = start;
  while (current.row !== end.row || current.column !== end.column) {
    const direction = current.column < end.column ? "right" : current.column > end.column ? "left" : current.row < end.row ? "down" : "up";
    const next = add(current, delta[direction]);
    grid[current.row][current.column][directionToWall(direction)] = false;
    grid[next.row][next.column][directionToWall(opposite[direction])] = false;
    protectedRoute.add(edgeKey(current, next));
    current = next;
  }
}

function removeRightDownOnlyRoutes(grid: MazeCell[][], protectedRoute: Set<string>) {
  let path = findRightDownPath(grid);
  let guard = 0;
  while (path.length && guard < 500) {
    const removable = [...path]
      .sort((a, b) => Number(protectedRoute.has(edgeKey(a.from, a.to))) - Number(protectedRoute.has(edgeKey(b.from, b.to))))
      .find((edge) => {
        setPassage(grid, edge.from, edge.to, true);
        const connected = hasExitPath(grid);
        if (!connected) setPassage(grid, edge.from, edge.to, false);
        return connected;
      });
    if (!removable) break;
    path = findRightDownPath(grid);
    guard += 1;
  }
}

function hasExitPath(grid: MazeCell[][]) {
  const rows = grid.length;
  const columns = grid[0].length;
  const seen = Array.from({ length: rows }, () => Array.from({ length: columns }, () => false));
  const queue: Position[] = [{ row: 0, column: 0 }];
  seen[0][0] = true;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.row === rows - 1 && current.column === columns - 1) return true;
    for (const direction of Object.keys(delta) as Direction[]) {
      if (grid[current.row][current.column][directionToWall(direction)]) continue;
      const next = add(current, delta[direction]);
      if (!inBounds(next, rows, columns) || seen[next.row][next.column]) continue;
      seen[next.row][next.column] = true;
      queue.push(next);
    }
  }

  return false;
}

function setPassage(grid: MazeCell[][], from: Position, to: Position, closed: boolean) {
  const direction = to.column > from.column ? "right" : to.column < from.column ? "left" : to.row > from.row ? "down" : "up";
  grid[from.row][from.column][directionToWall(direction)] = closed;
  grid[to.row][to.column][directionToWall(opposite[direction])] = closed;
}

function findRightDownPath(grid: MazeCell[][]) {
  const rows = grid.length;
  const columns = grid[0].length;
  const seen = Array.from({ length: rows }, () => Array.from({ length: columns }, () => false));
  const parent = new Map<string, Position>();
  seen[0][0] = true;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (!seen[row][column]) continue;
      const current = { row, column };
      if (column + 1 < columns && !grid[row][column].right && !seen[row][column + 1]) {
        seen[row][column + 1] = true;
        parent.set(positionKey({ row, column: column + 1 }), current);
      }
      if (row + 1 < rows && !grid[row][column].bottom && !seen[row + 1][column]) {
        seen[row + 1][column] = true;
        parent.set(positionKey({ row: row + 1, column }), current);
      }
    }
  }

  const exit = { row: rows - 1, column: columns - 1 };
  if (!seen[exit.row][exit.column]) return [];
  const path: Array<{ from: Position; to: Position }> = [];
  let current = exit;
  while (current.row !== 0 || current.column !== 0) {
    const previous = parent.get(positionKey(current));
    if (!previous) return [];
    path.unshift({ from: previous, to: current });
    current = previous;
  }
  return path;
}

function edgeKey(a: Position, b: Position) {
  if (a.row === b.row) {
    const column = Math.min(a.column, b.column);
    return `${a.row}:${column}:right`;
  }
  const row = Math.min(a.row, b.row);
  return `${row}:${a.column}:down`;
}

function positionKey(position: Position) {
  return `${position.row}:${position.column}`;
}
