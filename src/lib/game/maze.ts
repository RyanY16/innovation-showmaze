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
  medium: { rows: 13, columns: 19, window: 100 },
  hard: { rows: 15, columns: 23, window: 100 }
};

export function createMaze(difficulty: Difficulty = "easy"): Maze {
  const { rows, columns } = difficultySettings[difficulty];
  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, (): MazeCell => ({ top: true, right: true, bottom: true, left: true }))
  );
  const visited = Array.from({ length: rows }, () => Array.from({ length: columns }, () => false));
  const stack: Position[] = [{ row: 0, column: 0 }];
  visited[0][0] = true;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const neighbors = shuffledDirections()
      .map((direction) => ({ direction, next: add(current, delta[direction]) }))
      .filter(({ next }) => inBounds(next, rows, columns) && !visited[next.row][next.column]);

    if (!neighbors.length) {
      stack.pop();
      continue;
    }

    const { direction, next } = neighbors[0];
    grid[current.row][current.column][directionToWall(direction)] = false;
    grid[next.row][next.column][directionToWall(opposite[direction])] = false;
    visited[next.row][next.column] = true;
    stack.push(next);
  }

  const start = { row: 0, column: 0 };
  const exit = { row: rows - 1, column: columns - 1 };
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

function shuffledDirections(): Direction[] {
  const directions: Direction[] = ["up", "right", "down", "left"];
  for (let index = directions.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [directions[index], directions[swap]] = [directions[swap], directions[index]];
  }
  return directions;
}
