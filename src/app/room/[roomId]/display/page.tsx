"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getPublicAppOrigin } from "@/lib/client/config";
import { useGameSocket } from "@/lib/client/useGameSocket";
import { MazeCanvas } from "@/components/MazeCanvas";
import { MoveBanner } from "@/components/MoveBanner";
import { QRCodeBox } from "@/components/QRCodeBox";
import { ResultsReveal } from "@/components/ResultsReveal";

export default function DisplayPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { state, status, send } = useGameSocket();

  useEffect(() => {
    if (status === "connected") send({ type: "WATCH_ROOM", roomId });
  }, [roomId, send, status]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 150);
    return () => window.clearInterval(interval);
  }, []);

  const joinUrl = typeof window === "undefined" || !state ? "" : `${getPublicAppOrigin()}/room/${state.roomId}/player`;
  const timer = useMemo(() => {
    if (state?.status === "countdown" && state.countdownEndsAt) return `${Math.max(1, Math.ceil((state.countdownEndsAt - now) / 1000))}`;
    if (state?.status === "playing" && state.roundEndsAt) return `${Math.max(0, Math.ceil((state.roundEndsAt - now) / 1000))}s`;
    if (!state?.startedAt) return "30s";
    const end = state.finishedAt ?? state.roundEndsAt ?? now;
    const seconds = Math.max(0, Math.ceil((end - state.startedAt) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }, [now, state]);

  return (
    <main className="min-h-screen bg-ink p-4 text-bone">
      <div className="grid min-h-[calc(100vh-2rem)] gap-4 xl:grid-cols-[1fr_340px]">
        <section className="pixel-panel relative p-3">
          {state ? <MazeCanvas maze={state.maze} position={state.playerPosition} /> : <div className="p-8">Waiting for room...</div>}
          {state?.status === "countdown" ? (
            <div className="absolute inset-0 grid place-items-center bg-ink/85 p-8 text-center">
              <div>
                <p className="hud-label">Round {state.currentRound}</p>
                <h1 className="pixel-title mt-2 text-8xl text-gold">{Math.max(1, Math.ceil(((state.countdownEndsAt ?? now) - now) / 1000))}</h1>
              </div>
            </div>
          ) : null}
          {state?.status === "round_over" ? (
            <div className="absolute inset-0 grid place-items-center bg-ink/85 p-8 text-center">
              <div>
                <p className="hud-label">Round complete</p>
                <h1 className="pixel-title mt-2 text-6xl text-cyan">Round {state.completedRounds} Cleared</h1>
                <p className="mt-4 text-2xl font-black text-mint">Next: Round {state.completedRounds + 1} / {state.totalRounds}</p>
              </div>
            </div>
          ) : null}
          {state?.status === "finished" && state.results ? (
            <div className="absolute inset-0 overflow-auto bg-ink/90 p-8">
              <h1 className={`pixel-title text-5xl ${state.finishedReason === "won" ? "text-mint" : "text-coral"}`}>
                {state.finishedReason === "won" ? "Maze Cleared" : "Game Ended"}
              </h1>
              {state.finishedReason === "won" && state.selectedMove ? (
                <p className="mt-3 text-xl font-black text-cyan">{state.selectedMove.displayName} reached the exit.</p>
              ) : null}
              <div className="mt-6">
                <ResultsReveal players={state.results.leaderboard} />
              </div>
            </div>
          ) : null}
        </section>

        <aside className="grid content-start gap-4">
          {state?.status === "playing" ? <MoveBanner move={state.selectedMove} history={state.history} /> : null}

          <div className="pixel-panel p-4 text-center">
            <p className="hud-label">Room</p>
            <h1 className="pixel-title text-5xl text-cyan">{state?.roomCode ?? "..."}</h1>
            {joinUrl ? <div className="mt-4"><QRCodeBox value={joinUrl} /></div> : null}
          </div>

          <div className="pixel-panel grid grid-cols-2 gap-3 p-4">
            <Hud label="Timer" value={timer} />
            <Hud label="Inputs" value={state ? `${state.pendingInputCount}/${state.inputBatchSize}` : "..."} />
            <Hud label="Players" value={state?.connectedPlayerCount ?? 0} />
            <Hud label="Round" value={state ? `${state.currentRound}/${state.totalRounds}` : "..."} />
          </div>

          <div className="pixel-panel p-4">
            <p className="hud-label">Selected move</p>
            <p className="mt-2 text-2xl font-black text-cyan">
              {state?.selectedMove ? `${state.selectedMove.displayName} ${state.selectedMove.direction}` : "Waiting..."}
            </p>
            {state?.selectedMove?.wallHit ? <p className="mt-2 font-black text-coral">Wall hit</p> : null}
          </div>

          <div className="pixel-panel p-4">
            <p className="hud-label">Leaderboard</p>
            <ol className="mt-3 space-y-2">
              {state?.players.slice(0, 6).map((player, index) => (
                <li key={player.id} className="flex justify-between border-b border-bone/15 pb-1">
                  <span>{index + 1}. {player.displayName}</span>
                  <strong className="font-mono text-cyan">{player.stats.netContribution}</strong>
                </li>
              ))}
            </ol>
          </div>

          <div className="pixel-panel p-4">
            <p className="hud-label">Recent moves</p>
            <div className="mt-2 space-y-1 text-sm">
              {state?.history.map((move) => (
                <div key={move.id} className="flex justify-between gap-3">
                  <span className="truncate">{move.displayName}</span>
                  <span className={move.wallHit ? "text-coral" : move.quality > 0 ? "text-mint" : "text-bone/70"}>{move.direction}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Hud({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-[4px] border-cyan bg-tile p-3">
      <p className="hud-label">{label}</p>
      <p className="pixel-title mt-1 text-2xl text-bone">{value}</p>
    </div>
  );
}
