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
          <p className="mt-5 max-w-xl text-lg leading-8 text-bone/80">
            One shared cursor, one maze, and a room full of phones steering the demo together.
          </p>
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

const mazeCells = [
  "#############",
  "#S  #       #",
  "### # ### # #",
  "#   # #   # #",
  "# ### # ### #",
  "#     #   # #",
  "# ### ### # #",
  "# #     #   #",
  "# # ### ### #",
  "#   #     E #",
  "#############"
];

function PlaceholderMaze() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tile = 16;
    const width = mazeCells[0].length * tile;
    const height = mazeCells.length * tile;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = "100%";
    canvas.style.height = "auto";

    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#050816";
    context.fillRect(0, 0, width, height);

    for (let row = 0; row < mazeCells.length; row += 1) {
      for (let column = 0; column < mazeCells[row].length; column += 1) {
        const cell = mazeCells[row][column];
        const x = column * tile;
        const y = row * tile;
        context.fillStyle = (row + column) % 2 ? "#09122a" : "#0b1735";
        context.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        if (cell === "#") {
          context.fillStyle = "#2f6bff";
          context.fillRect(x, y, tile, tile);
          context.fillStyle = "#33c7ff";
          context.fillRect(x + 3, y + 3, tile - 6, tile - 6);
        }
        if (cell === "S") {
          context.fillStyle = "#ffd84a";
          context.fillRect(x + 4, y + 4, tile - 8, tile - 8);
        }
        if (cell === "E") {
          context.fillStyle = "#34d399";
          context.fillRect(x + 4, y + 4, tile - 8, tile - 8);
        }
      }
    }
  }, []);

  return (
    <div className="mt-6 border-[4px] border-[#4285f4] bg-ink p-3 shadow-pixel">
      <canvas ref={canvasRef} className="block w-full [image-rendering:pixelated]" aria-label="Maze preview" />
    </div>
  );
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
