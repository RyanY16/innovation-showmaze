"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { getAnonymousPlayerId } from "@/lib/client/firebase";
import { getOrCreateId } from "@/lib/client/config";
import { useGameSocket } from "@/lib/client/useGameSocket";
import { PixelArrow } from "@/components/PixelArrow";
import { StatLine } from "@/components/StatLine";
import type { Direction } from "@/lib/types";

export default function PlayerPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { state, status, lastEvent, error, socketUrl, send } = useGameSocket();
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [pendingJoinName, setPendingJoinName] = useState("");
  const [roomMissing, setRoomMissing] = useState(false);
  const [submittedWindow, setSubmittedWindow] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("Enter name to join.");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 150);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const fallbackId = getOrCreateId("crowd-maze-player-id");
    setPlayerId(fallbackId);
    getAnonymousPlayerId(fallbackId).then((anonymousId) => {
      if (anonymousId) window.localStorage.setItem("crowd-maze-firebase-uid", anonymousId);
    });
  }, []);

  useEffect(() => {
    if (!playerId || !pendingJoinName || joined || status !== "connected") return;
    const sent = send({ type: "JOIN_ROOM", roomId, playerId, displayName: pendingJoinName });
    if (sent) setFeedback("Joining room...");
  }, [joined, pendingJoinName, playerId, roomId, send, status]);

  useEffect(() => {
    const player = state?.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    setJoined(true);
    setJoining(false);
    setPendingJoinName("");
    setFeedback(state?.status === "playing" ? "Joined. Choose a direction." : state?.status === "countdown" ? "Get ready." : "Joined. Waiting for start.");
  }, [playerId, state?.players, state?.status]);

  useEffect(() => {
    if (!state?.currentWindowId) return;
    if (state.status === "countdown") setFeedback("Get ready.");
    else if (state.status === "playing" && state.currentWindowId !== submittedWindow) setFeedback("Window open. Choose a direction.");
    else if (state.status === "round_over") setFeedback(`Round ${state.completedRounds} cleared. Waiting for next round.`);
    else if (state.status === "finished") {
      if (state.finishedReason === "won") setFeedback(state.selectedMove ? `${state.selectedMove.displayName} reached the exit.` : "Maze cleared.");
      else setFeedback("Game ended.");
    }
  }, [state?.currentWindowId, state?.status, state?.finishedReason, state?.selectedMove, submittedWindow]);

  useEffect(() => {
    if (state?.status === "finished") router.push("/");
  }, [router, state?.status]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "INPUT_ACCEPTED") {
      setSubmittedWindow(lastEvent.windowId);
      setFeedback(`Submitted ${lastEvent.direction}.`);
      vibrate(25);
    }
    if (lastEvent.type === "INPUT_REJECTED") {
      setFeedback(lastEvent.reason);
      vibrate([20, 30, 20]);
    }
    if (lastEvent.type === "ERROR") {
      setJoining(false);
      setPendingJoinName("");
      if (lastEvent.message === "Room not found.") {
        setJoined(false);
        setRoomMissing(true);
        setFeedback("Room doesn't exist.");
      } else {
        setFeedback(lastEvent.message);
      }
    }
    if (lastEvent.type === "MOVE_SELECTED") {
      if (lastEvent.move.playerId === playerId) {
        setFeedback(lastEvent.move.wallHit ? "You were selected: wall hit." : "You were selected!");
        vibrate(lastEvent.move.wallHit ? [40, 50, 80] : [40, 30, 40]);
      } else {
        setFeedback(`${lastEvent.move.displayName} moved ${lastEvent.move.direction}.`);
      }
    }
  }, [lastEvent, playerId]);

  const me = useMemo(() => state?.players.find((player) => player.id === playerId), [playerId, state?.players]);
  const canMove = joined && state?.status === "playing" && submittedWindow !== state?.currentWindowId;
  const displayStatus = status === "connected" ? "connected" : state ? "http mode" : status;
  const isOnline = status === "connected" || Boolean(state);
  const visibleError = roomMissing ? "" : error;

  function join(event: FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const typedName = String(new FormData(form).get("displayName") ?? "").trim();
    if (!typedName) {
      setFeedback("Type a name first.");
      return;
    }
    const activePlayerId = playerId || getOrCreateId("crowd-maze-player-id");
    if (!playerId) setPlayerId(activePlayerId);
    const displayName = typedName;
    setRoomMissing(false);
    setJoining(true);
    setPendingJoinName(displayName);
    const sent = send({ type: "JOIN_ROOM", roomId, playerId: activePlayerId, displayName });
    setFeedback(sent ? "Joining room..." : "Connecting. Join will retry automatically.");
  }

  function submit(direction: Direction) {
    if (!state || !canMove) return;
    const sent = send({ type: "SUBMIT_INPUT", direction, windowId: state.currentWindowId });
    if (!sent) setFeedback("Socket is not connected yet.");
  }

  function leave() {
    if (playerId) send({ type: "LEAVE_ROOM", roomId, playerId });
    setJoined(false);
    setJoining(false);
    setPendingJoinName("");
    setSubmittedWindow(null);
    setFeedback("Left room. Enter name to join.");
  }

  function returnHome() {
    router.push("/");
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-bone">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <header className="pixel-panel p-4">
          <div className="flex items-start justify-between gap-3">
            {joined ? <div>
              <p className="hud-label">Innovation Showmaze controller</p>
              <h1 className="pixel-title text-3xl text-cyan">{state?.roomCode ?? roomId}</h1>
            </div> : <p className="hud-label">Join controller</p>}
            <div className={`border-[4px] border-cyan px-2 py-1 text-xs font-black uppercase ${isOnline ? "bg-mint text-ink" : "bg-coral text-ink"}`}>
              {displayStatus}
            </div>
          </div>
          <div className="mt-3 h-4 overflow-hidden border-[4px] border-cyan bg-tile">
            <div className="h-full bg-gold" style={{ width: `${state ? Math.max(0, Math.min(100, (state.pendingInputCount / state.inputBatchSize) * 100)) : 0}%` }} />
          </div>
          <p className="mt-1 font-mono text-xs text-cyan">
            Queued {state?.pendingInputCount ?? 0}
          </p>
          <p className="mt-2 text-sm text-bone/75">{feedback}{visibleError ? ` ${visibleError}` : ""}</p>
          {!isOnline && socketUrl ? <p className="mt-2 break-all font-mono text-[10px] text-coral">{socketUrl}</p> : null}
        </header>

        {!joined ? (
          <form onSubmit={join} className="pixel-panel p-4">
            {roomMissing ? (
              <>
                <p className="hud-label text-coral">Room doesn't exist</p>
                <p className="mt-2 text-sm text-bone/70">Scan a fresh QR code from the host screen.</p>
                <button type="button" className="pixel-button mt-4 w-full px-4 py-4" onClick={returnHome}>
                  Back
                </button>
              </>
            ) : (
              <>
                <label className="hud-label" htmlFor="displayName">Display name</label>
                <input
                  id="displayName"
                  name="displayName"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={18}
                  className="mt-2 w-full border-[4px] border-cyan bg-bone px-4 py-4 text-xl font-black text-ink outline-none placeholder:text-ink/45"
                  placeholder="GDG Navigator"
                />
                <button className="pixel-button mt-4 w-full px-4 py-4" disabled={joining}>
                  Join Room
                </button>
              </>
            )}
          </form>
        ) : null}

        {joined && state?.status === "countdown" ? (
          <section className="pixel-panel p-5 text-center">
            <p className="hud-label">Get ready</p>
            <p className="pixel-title mt-3 text-6xl text-gold">
              {Math.max(1, Math.ceil(((state.countdownEndsAt ?? now) - now) / 1000))}
            </p>
            <button className="pixel-button mt-5 w-full bg-panel px-4 py-4" onClick={leave}>
              Leave
            </button>
          </section>
        ) : null}

        {joined && state?.status !== "countdown" ? (
          <section className="pixel-panel p-5">
            <div className="mx-auto grid w-72 grid-cols-3 grid-rows-3 gap-2">
              <div />
              <PadButton label="Up" onClick={() => submit("up")} disabled={!canMove} />
              <div />
              <PadButton label="Left" onClick={() => submit("left")} disabled={!canMove} />
              <div className="border-[4px] border-cyan bg-panel" />
              <PadButton label="Right" onClick={() => submit("right")} disabled={!canMove} />
              <div />
              <PadButton label="Down" onClick={() => submit("down")} disabled={!canMove} />
              <div />
            </div>
            <button className="pixel-button mt-5 w-full bg-panel px-4 py-4" onClick={leave}>
              Leave
            </button>
          </section>
        ) : null}

        {joined ? <section className="grid grid-cols-2 gap-4">
          <div className="pixel-panel p-4">
            <p className="hud-label">You</p>
            <StatLine label="Submitted" value={me?.stats.submittedInputs ?? 0} />
            <StatLine label="Selected" value={me?.stats.selectedMoves ?? 0} />
            <StatLine label="Net" value={me?.stats.netContribution ?? 0} />
            <StatLine label="Walls" value={me?.stats.wallHits ?? 0} />
          </div>
          <div className="pixel-panel p-4">
            <p className="hud-label">Leaders</p>
            <ol className="mt-2 space-y-1 text-sm">
              {state?.players.slice(0, 4).map((player, index) => (
                <li key={player.id} className="flex justify-between gap-2">
                  <span className="truncate">{index + 1}. {player.displayName}</span>
                  <strong className="text-cyan">{player.stats.netContribution}</strong>
                </li>
              ))}
            </ol>
          </div>
        </section> : null}
      </div>
    </main>
  );
}

function PadButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  const direction = label.toLowerCase() as Direction;
  return (
    <button className="pixel-button grid aspect-square place-items-center text-ink" onClick={onClick} disabled={disabled} aria-label={label}>
      <PixelArrow direction={direction} />
    </button>
  );
}

function vibrate(pattern: VibratePattern) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}
