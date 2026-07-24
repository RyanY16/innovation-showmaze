"use client";

import { useEffect, useRef } from "react";
import type { Maze, Position } from "@/lib/types";

export function MazeCanvas({ maze, position, className = "" }: { maze: Maze; position: Position; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.max(18, Math.floor(Math.min(canvas.clientWidth / maze.columns, canvas.clientHeight / maze.rows)));
    const width = maze.columns * scale;
    const height = maze.rows * scale;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#050816";
    context.fillRect(0, 0, width, height);

    for (let row = 0; row < maze.rows; row += 1) {
      for (let column = 0; column < maze.columns; column += 1) {
        const x = column * scale;
        const y = row * scale;
        context.fillStyle = (row + column) % 2 ? "#09122a" : "#0b1735";
        context.fillRect(x + 2, y + 2, scale - 4, scale - 4);
      }
    }

    drawMarker(context, maze.start, scale, "#33c7ff");
    drawMarker(context, maze.exit, scale, "#34d399");

    context.strokeStyle = "#2f6bff";
    context.lineWidth = Math.max(3, Math.floor(scale * 0.14));
    context.lineCap = "square";
    for (let row = 0; row < maze.rows; row += 1) {
      for (let column = 0; column < maze.columns; column += 1) {
        const cell = maze.grid[row][column];
        const x = column * scale;
        const y = row * scale;
        context.beginPath();
        if (cell.top) line(context, x, y, x + scale, y);
        if (cell.right) line(context, x + scale, y, x + scale, y + scale);
        if (cell.bottom) line(context, x, y + scale, x + scale, y + scale);
        if (cell.left) line(context, x, y, x, y + scale);
        context.stroke();
      }
    }

    const pulse = Date.now() % 800 < 400 ? 1 : 0;
    const cx = position.column * scale + scale / 2;
    const cy = position.row * scale + scale / 2;
    context.fillStyle = "#ffd84a";
    context.fillRect(cx - scale * 0.25, cy - scale * 0.25 - pulse, scale * 0.5, scale * 0.5);
    context.fillStyle = "#050816";
    context.fillRect(cx + scale * 0.04, cy - scale * 0.22 - pulse, scale * 0.12, scale * 0.12);
  }, [maze, position]);

  return <canvas ref={canvasRef} className={`h-full w-full bg-ink [image-rendering:pixelated] ${className}`} />;
}

function line(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
}

function drawMarker(context: CanvasRenderingContext2D, position: Position, scale: number, color: string) {
  context.fillStyle = color;
  context.fillRect(position.column * scale + scale * 0.3, position.row * scale + scale * 0.3, scale * 0.4, scale * 0.4);
}
