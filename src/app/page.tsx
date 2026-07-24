"use client";

import { FormEvent, useState } from "react";
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
          <p className="hud-label mb-3 text-[#34a853]">GDG innovation demo</p>
          <h1 className="pixel-title text-5xl leading-tight md:text-7xl">
            <span className="text-[#4285f4]">Innovation</span>{" "}
            <span className="text-[#fbbc04]">Show</span><span className="text-[#ea4335]">maze</span>
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
  return (
    <div className="mt-6 border-[4px] border-[#ea4335] bg-ink p-3 shadow-pixel">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${mazeCells[0].length}, minmax(0, 1fr))` }}>
        {mazeCells.flatMap((row, rowIndex) =>
          [...row].map((cell, columnIndex) => {
            const color =
              cell === "#"
                ? "bg-[#4285f4]"
                : cell === "S"
                  ? "bg-[#fbbc04]"
                  : cell === "E"
                    ? "bg-[#34a853]"
                    : (rowIndex + columnIndex) % 7 === 0
                      ? "bg-[#ea4335]"
                      : "bg-[#111827]";
            return <span key={`${rowIndex}-${columnIndex}`} className={`aspect-square border border-ink ${color}`} />;
          })
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <span className="h-2 bg-[#4285f4]" />
        <span className="h-2 bg-[#ea4335]" />
        <span className="h-2 bg-[#fbbc04]" />
        <span className="h-2 bg-[#34a853]" />
      </div>
    </div>
  );
}
