"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getOrCreateId, getPublicAppOrigin } from "@/lib/client/config";
import { getAnonymousPlayerId } from "@/lib/client/firebase";
import { useGameSocket } from "@/lib/client/useGameSocket";
import { MazeCanvas } from "@/components/MazeCanvas";
import { MoveBanner } from "@/components/MoveBanner";
import { QRCodeBox } from "@/components/QRCodeBox";
import { ResultsReveal } from "@/components/ResultsReveal";
import { StatLine } from "@/components/StatLine";

export default function HostPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { state, status, error, send } = useGameSocket();
  const [hostMessage, setHostMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const playerId = getOrCreateId("crowd-maze-host-id");
    if (status === "connected") {
      getAnonymousPlayerId(playerId).then((hostId) => {
        if (!cancelled) send({ type: "HOST_JOIN", roomId, playerId: hostId, displayName: "Host" });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [roomId, send, status]);

  const joinUrl = typeof window === "undefined" || !state ? "" : `${getPublicAppOrigin()}/room/${state.roomId}/player`;
  const hostReady = status === "connected" && Boolean(state);
  const isRunning = state?.status === "playing";
  const isFinished = state?.status === "finished";
  const isInitialLobby = state?.status === "lobby" && (state.completedRounds ?? 0) === 0;
  const isBetweenRounds = !isRunning && !isFinished && !isInitialLobby;
  const isLobby = !isRunning && !isFinished;
  const nextRound = isBetweenRounds ? (state?.completedRounds ?? 0) + 1 : state?.currentRound ?? 1;
  const nextDifficulty = roundDifficulty(nextRound);
  const primaryLabel = isRunning ? "End" : `Start Round ${nextRound}`;
  const sendHost = (event: Parameters<typeof send>[0], message: string) => {
    const sent = send(event);
    setHostMessage(sent ? message : "Socket is not connected yet.");
  };
  const handlePrimary = () => {
    if (isRunning) sendHost({ type: "HOST_END_GAME" }, "Game ended.");
    else sendHost({ type: "HOST_START_GAME" }, "Game started.");
  };
  const leaveToCreate = () => {
    if (isRunning) send({ type: "HOST_END_GAME" });
    router.push("/");
  };

  if (isInitialLobby) {
    return (
      <main className="min-h-screen bg-ink p-4 text-bone md:p-6">
        <section className="pixel-panel mx-auto grid max-w-5xl gap-6 p-6">
          <div className="grid gap-2 text-center">
            <p className="hud-label">Lobby</p>
            <h1 className="pixel-title text-5xl text-cyan md:text-6xl">Room {state?.roomCode ?? "..."}</h1>
            <p className="font-mono text-sm text-mint">Round 1 Easy / Round 2 Medium / Round 3 Hard</p>
          </div>

          <div className="grid items-start gap-6 md:grid-cols-[280px_1fr]">
            <div className="grid justify-center gap-3">
              <p className="hud-label text-center">Scan to join</p>
              {joinUrl ? <QRCodeBox value={joinUrl} /> : <div className="h-44 w-44 border-[4px] border-cyan bg-tile" />}
            </div>

            <div className="border-[4px] border-cyan bg-tile p-4">
              <p className="hud-label">Players</p>
              <div className="mt-3 grid gap-2">
                {state?.players.length ? (
                  state.players.map((player) => (
                    <div key={player.id} className="flex items-center justify-between border-[4px] border-cyan bg-panel px-3 py-2">
                      <span className="truncate font-black">{player.displayName}</span>
                      <span className={player.connected ? "text-mint" : "text-coral"}>{player.connected ? "ready" : "away"}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-bone/65">Waiting for players.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-4">
            <button className="pixel-button bg-panel px-6 py-5 text-xl" disabled={!hostReady} onClick={leaveToCreate}>
              Cancel
            </button>
            <button className="pixel-button px-6 py-5 text-xl" disabled={!hostReady} onClick={handlePrimary}>
              Start
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink p-4 text-bone md:p-6">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1fr_360px]">
        <section className="pixel-panel relative h-[calc(100vh-2rem)] min-h-[520px] p-3 md:h-[calc(100vh-3rem)]">
          {state && isRunning ? (
            <MazeCanvas maze={state.maze} position={state.playerPosition} />
          ) : state && isFinished ? (
            <div className="grid min-h-[500px] content-start gap-5 p-5">
              <div>
                <p className="hud-label">Results</p>
                <h2 className={`pixel-title mt-2 text-5xl ${state.finishedReason === "won" ? "text-mint" : "text-coral"}`}>
                  {state.finishedReason === "won" ? "All Rounds Cleared" : "Game Ended"}
                </h2>
                <p className="mt-3 text-bone/75">Final standings after {state.completedRounds}/{state.totalRounds} rounds.</p>
              </div>
              {state.results ? <ResultsReveal players={state.results.leaderboard} /> : null}
            </div>
          ) : (
            <div className="grid h-full min-h-[500px] content-start gap-5 p-5">
              <div>
                <p className="hud-label">{isBetweenRounds ? "Round complete" : "Lobby"}</p>
                <h2 className="pixel-title mt-2 text-5xl text-cyan">
                  {isBetweenRounds ? `Round ${state?.completedRounds ?? 1} Cleared` : `Room ${state?.roomCode ?? "..."}`}
                </h2>
                <p className="mt-3 text-bone/75">
                  {isBetweenRounds ? `Next up: Round ${nextRound} ${nextDifficulty}.` : "Players join here. Round 1 easy, round 2 medium, round 3 hard."}
                </p>
              </div>

              {isInitialLobby ? (
                <div className="grid gap-4 md:grid-cols-[240px_1fr]">
                  <div>
                    <p className="hud-label mb-3">Scan to join</p>
                    {joinUrl ? <QRCodeBox value={joinUrl} /> : <div className="h-44 w-44 border-[4px] border-cyan bg-tile" />}
                  </div>

                  <div className="border-[4px] border-cyan bg-tile p-4">
                    <p className="hud-label">Players</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {state?.players.length ? (
                        state.players.map((player) => (
                          <div key={player.id} className="flex items-center justify-between border-[4px] border-cyan bg-panel px-3 py-2">
                            <span className="truncate font-black">{player.displayName}</span>
                            <span className={player.connected ? "text-mint" : "text-coral"}>{player.connected ? "ready" : "away"}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-bone/65">No players yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          {state && isRunning ? <MoveBanner move={state.selectedMove} history={state.history} /> : null}

          <div className="pixel-panel p-4">
            <p className="hud-label">{isRunning ? "Game menu" : "Lobby menu"}</p>
            <h1 className="pixel-title mt-1 text-3xl text-cyan">Room {state?.roomCode ?? "..."}</h1>
            <p className="mt-1 font-mono text-sm text-mint">
              Round {state?.currentRound ?? 1} / {state?.totalRounds ?? 3} · {(state?.difficulty ?? "easy").toUpperCase()}
            </p>
            <p className="mt-2 text-sm text-bone/70">Socket: {status}{error ? ` / ${error}` : ""}</p>
            {state?.status === "finished" ? (
              <p className={`mt-3 border-[4px] border-cyan px-3 py-2 text-sm font-black ${state.finishedReason === "won" ? "bg-mint text-ink" : "bg-coral text-ink"}`}>
                {state.finishedReason === "won" ? "Maze cleared. Winner recorded." : "Game ended by host."}
              </p>
            ) : null}
            {hostMessage ? <p className="mt-2 border-[4px] border-cyan bg-tile px-3 py-2 text-sm font-black text-cyan">{hostMessage}</p> : null}
            {isBetweenRounds ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button className="pixel-button px-3 py-3" disabled={!hostReady} onClick={() => sendHost({ type: "HOST_START_GAME" }, "Next round started.")}>
                  Next: {nextDifficulty}
                </button>
                <button className="pixel-button bg-panel px-3 py-3" disabled={!hostReady} onClick={() => sendHost({ type: "HOST_END_GAME" }, "Game ended.")}>
                  End
                </button>
              </div>
            ) : isRunning ? (
              <div className="mt-4 grid gap-3">
                <button className="pixel-button px-3 py-3" disabled={!hostReady} onClick={() => sendHost({ type: "HOST_END_ROUND" }, "Round ended.")}>
                  End Round
                </button>
                <button className="pixel-button bg-coral px-3 py-3" disabled={!hostReady} onClick={() => sendHost({ type: "HOST_END_GAME" }, "Game ended.")}>
                  End Everything
                </button>
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button className={`pixel-button px-3 py-3 ${isRunning ? "bg-bone" : ""}`} disabled={!hostReady} onClick={handlePrimary}>{primaryLabel}</button>
                  <button className="pixel-button bg-coral px-3 py-3" disabled={!hostReady} onClick={() => sendHost({ type: "HOST_RESET_GAME" }, "Reset.")}>Reset</button>
                </div>
                <button className="pixel-button mt-3 w-full bg-cyan px-3 py-3" disabled={!hostReady} onClick={leaveToCreate}>
                  {isRunning ? "End & Create Game" : "Back To Create Game"}
                </button>
              </>
            )}
          </div>

          {isInitialLobby ? <div className="pixel-panel p-4">
            <p className="hud-label">Round path</p>
            <div className="mt-3 grid gap-2 text-sm font-black uppercase">
              <div className="border-[4px] border-cyan bg-panel px-3 py-2">Round 1 · Easy</div>
              <div className="border-[4px] border-cyan bg-panel px-3 py-2">Round 2 · Medium</div>
              <div className="border-[4px] border-cyan bg-panel px-3 py-2">Round 3 · Hard</div>
            </div>
            <label className="hud-label mt-5 block">Inputs per move {state?.inputBatchSize ?? 1}</label>
            <input
              type="range"
              min={1}
              max={25}
              step={1}
              value={state?.inputBatchSize ?? 1}
              onChange={(event) => sendHost({ type: "HOST_SET_INPUT_BATCH", inputBatchSize: Number(event.target.value) }, "Input count updated.")}
              className="mt-2 w-full accent-gold"
            />
          </div> : null}

          {isInitialLobby ? <div className="pixel-panel p-4">
            <p className="hud-label">Player link</p>
            {joinUrl ? <QRCodeBox value={joinUrl} /> : null}
            <div className="mt-4 flex gap-3">
              <Link className="pixel-button flex-1 px-3 py-3 text-center text-sm" href={`/room/${roomId}/display`}>Display</Link>
              <Link className="pixel-button flex-1 bg-mint px-3 py-3 text-center text-sm" href={`/room/${roomId}/player`}>Test Phone</Link>
            </div>
          </div> : null}

          {isInitialLobby ? (
            <div className="pixel-panel p-4">
              <p className="hud-label">Players</p>
              <ol className="mt-3 space-y-2 text-sm">
                {state?.players.length ? state.players.map((player, index) => (
                  <li key={player.id} className="flex justify-between gap-3 border-b border-bone/15 pb-1">
                    <span className="truncate">{index + 1}. {player.displayName}</span>
                    <span className={player.connected ? "text-mint" : "text-coral"}>{player.connected ? "ready" : "away"}</span>
                  </li>
                )) : <li className="text-bone/65">Waiting for players.</li>}
              </ol>
            </div>
          ) : null}

          <div className="pixel-panel p-4">
            <StatLine label="Status" value={state?.status ?? "..."} />
            <StatLine label="Players" value={state?.connectedPlayerCount ?? 0} />
            <StatLine label="Mode" value={state?.selectionMode ?? "random"} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function roundDifficulty(round: number) {
  if (round >= 3) return "Hard";
  if (round === 2) return "Medium";
  return "Easy";
}
