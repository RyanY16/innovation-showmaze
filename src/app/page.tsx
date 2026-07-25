"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gameHttpUrl, getOrCreateId } from "@/lib/client/config";
import { createFirebaseRoom, getAnonymousPlayerId, isFirebaseConfigured } from "@/lib/client/firebase";
import { createMaze } from "@/lib/game/maze";

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
    const maze = createMaze("easy");
    const rows = maze.rows;
    const columns = maze.columns;
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

    context.fillStyle = "#09122a";
    context.fillRect(4, 4, width - 8, height - 8);

    drawPreviewMarker(context, maze.start, scale, "#33c7ff");
    drawPreviewMarker(context, maze.exit, scale, "#34d399");

    context.strokeStyle = "#2f6bff";
    context.lineWidth = Math.max(3, Math.floor(scale * 0.14));
    context.lineCap = "square";
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const cell = maze.grid[row][column];
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
