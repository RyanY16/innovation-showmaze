"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gameHttpUrl, getOrCreateId } from "@/lib/client/config";
import { createFirebaseRoom, getAnonymousPlayerId, isFirebaseConfigured } from "@/lib/client/firebase";

export default function LandingPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function createRoom() {
    try {
      setError("");
      setCreating(true);
      const hostId = getOrCreateId("crowd-maze-host-id");
      if (isFirebaseConfigured()) {
        const firebaseHostId = await getAnonymousPlayerId(hostId);
        const room = await createFirebaseRoom(firebaseHostId);
        router.push(`/room/${room.roomId}/host`);
        return;
      }
      const response = await fetch(`${gameHttpUrl}/create-room`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId, difficulty: "easy" })
      });
      if (!response.ok) throw new Error(`Backend returned ${response.status}`);
      const data = (await response.json()) as { roomId?: string; error?: string };
      if (!data.roomId) throw new Error(data.error || "Backend did not return a room.");
      router.push(`/room/${data.roomId}/host`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create room.");
      setCreating(false);
    }
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (code) router.push(`/room/${code}/player`);
  }

  return (
    <main className="min-h-screen bg-ink px-5 py-8 text-bone">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 md:grid-cols-[1.05fr_0.95fr]">
        <div>
          <h1 className="pixel-title text-5xl leading-tight md:text-7xl">
            <AlternatingTitle text="Innovation Showmaze" />
          </h1>
          <div className="mt-8 flex flex-wrap gap-4">
            <button className="pixel-button bg-[#fbbc04] px-6 py-4" onClick={createRoom} disabled={creating}>
              {creating ? "Creating..." : "Create Room"}
            </button>
          </div>
          {error ? <p className="mt-4 border-[3px] border-coral bg-panel px-4 py-3 font-black text-coral">{error}</p> : null}
        </div>

        <form onSubmit={joinRoom} className="pixel-panel border-[#4285f4] p-5">
          <label className="hud-label text-[#34a853]" htmlFor="roomCode">
            Room code
          </label>
          <input
            id="roomCode"
            className="mt-2 w-full border-[4px] border-[#4285f4] bg-bone px-4 py-4 font-mono text-3xl font-black uppercase text-ink outline-none placeholder:text-ink/45"
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value)}
            maxLength={36}
            placeholder="A1B2C3"
          />
          <button className="pixel-button mt-5 w-full bg-[#34a853] px-5 py-4">Join From Phone</button>
          <PlaceholderMaze />
        </form>
      </section>
    </main>
  );
}

function PlaceholderMaze() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rows = 7;
    const columns = 10;
    const scale = 20;
    const width = columns * scale;
    const height = rows * scale;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = "100%";
    canvas.style.height = "auto";

    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#050816";
    context.fillRect(0, 0, width, height);

    const grid = createPreviewMaze(rows, columns);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * scale;
        const y = row * scale;
        context.fillStyle = (row + column) % 2 ? "#09122a" : "#0b1735";
        context.fillRect(x + 2, y + 2, scale - 4, scale - 4);
      }
    }

    drawPreviewMarker(context, { row: 0, column: 0 }, scale, "#33c7ff");
    drawPreviewMarker(context, { row: rows - 1, column: columns - 1 }, scale, "#34d399");

    context.strokeStyle = "#2f6bff";
    context.lineWidth = Math.max(3, Math.floor(scale * 0.14));
    context.lineCap = "square";
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const cell = grid[row][column];
        const x = column * scale;
        const y = row * scale;
        context.beginPath();
        if (cell.top) previewLine(context, x, y, x + scale, y);
        if (cell.right) previewLine(context, x + scale, y, x + scale, y + scale);
        if (cell.bottom) previewLine(context, x, y + scale, x + scale, y + scale);
        if (cell.left) previewLine(context, x, y, x, y + scale);
        context.stroke();
      }
    }

    const cx = scale / 2;
    const cy = scale / 2;
    context.fillStyle = "#ffd84a";
    context.fillRect(cx - scale * 0.25, cy - scale * 0.25, scale * 0.5, scale * 0.5);
    context.fillStyle = "#050816";
    context.fillRect(cx + scale * 0.04, cy - scale * 0.22, scale * 0.12, scale * 0.12);
  }, []);

  return (
    <div className="mt-6 border-[4px] border-[#4285f4] bg-ink p-3 shadow-pixel">
      <canvas ref={canvasRef} className="block w-full [image-rendering:pixelated]" aria-label="Maze preview" />
    </div>
  );
}

type PreviewCell = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

function createPreviewMaze(rows: number, columns: number): PreviewCell[][] {
  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, (): PreviewCell => ({ top: true, right: true, bottom: true, left: true }))
  );
  const path = [
    [0, 0], [0, 1], [1, 1], [2, 1], [2, 2], [2, 3], [1, 3], [0, 3], [0, 4], [0, 5],
    [1, 5], [2, 5], [3, 5], [3, 4], [4, 4], [5, 4], [5, 5], [5, 6], [4, 6], [3, 6],
    [2, 6], [2, 7], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [6, 9]
  ];

  for (let index = 0; index < path.length - 1; index += 1) {
    const [row, column] = path[index];
    const [nextRow, nextColumn] = path[index + 1];
    if (nextRow === row && nextColumn === column + 1) {
      grid[row][column].right = false;
      grid[nextRow][nextColumn].left = false;
    } else if (nextRow === row && nextColumn === column - 1) {
      grid[row][column].left = false;
      grid[nextRow][nextColumn].right = false;
    } else if (nextRow === row + 1 && nextColumn === column) {
      grid[row][column].bottom = false;
      grid[nextRow][nextColumn].top = false;
    } else if (nextRow === row - 1 && nextColumn === column) {
      grid[row][column].top = false;
      grid[nextRow][nextColumn].bottom = false;
    }
  }

  const branches = [
    [[1, 1], [1, 2]],
    [[4, 4], [4, 3], [5, 3]],
    [[3, 8], [3, 9]],
    [[5, 6], [6, 6], [6, 5]],
    [[0, 5], [0, 6], [1, 6]]
  ];
  for (const branch of branches) {
    for (let index = 0; index < branch.length - 1; index += 1) {
      const [row, column] = branch[index];
      const [nextRow, nextColumn] = branch[index + 1];
      if (nextRow === row && nextColumn === column + 1) {
        grid[row][column].right = false;
        grid[nextRow][nextColumn].left = false;
      } else if (nextRow === row + 1 && nextColumn === column) {
        grid[row][column].bottom = false;
        grid[nextRow][nextColumn].top = false;
      } else if (nextRow === row && nextColumn === column - 1) {
        grid[row][column].left = false;
        grid[nextRow][nextColumn].right = false;
      }
    }
  }
  return grid;
}

function previewLine(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
}

function drawPreviewMarker(context: CanvasRenderingContext2D, position: { row: number; column: number }, scale: number, color: string) {
  context.fillStyle = color;
  context.fillRect(position.column * scale + scale * 0.3, position.row * scale + scale * 0.3, scale * 0.4, scale * 0.4);
}

function AlternatingTitle({ text }: { text: string }) {
  const colors = ["#4285f4", "#ea4335", "#fbbc04", "#34a853"];
  let colorIndex = 0;
  return (
    <>
      {[...text].map((character, index) => {
        if (character === " ") return <span key={index}> </span>;
        const color = colors[colorIndex % colors.length];
        colorIndex += 1;
        return <span key={index} style={{ color }}>{character}</span>;
      })}
    </>
  );
}
