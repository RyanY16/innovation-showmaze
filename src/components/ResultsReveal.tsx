"use client";

import { useMemo, useState } from "react";
import type { Player } from "@/lib/types";

type Category = {
  id: string;
  title: string;
  valueLabel: string;
  description: string;
  players: RankedPlayer[];
};

type RankedPlayer = {
  id: string;
  name: string;
  value: number;
  displayValue: string;
};

export function ResultsReveal({ players }: { players: Player[] }) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const categories = useMemo(() => buildCategories(players), [players]);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {categories.map((category) => {
        const isRevealed = Boolean(revealed[category.id]);
        const winner = category.players[0];
        return (
          <button
            key={category.id}
            className={`border-[4px] p-4 text-left shadow-pixel ${isRevealed ? "border-cyan bg-tile" : "border-gold bg-panel"}`}
            onClick={() => setRevealed((current) => ({ ...current, [category.id]: true }))}
          >
            <p className="hud-label text-gold">{category.title}</p>
            {isRevealed ? (
              <>
                <p className="mt-3 truncate text-2xl font-black text-cyan">{winner?.name ?? "No winner"}</p>
                <p className="mt-1 text-xs leading-5 text-bone/65">{category.description}</p>
                <p className="font-mono text-xs text-bone/70">{winner ? `${winner.displayValue} ${category.valueLabel}` : "n/a"}</p>
                <ol className="mt-4 space-y-2 text-xs">
                  {category.players.slice(0, 5).map((player, index) => (
                    <li key={player.id} className="flex items-center justify-between gap-3 border-b border-bone/15 pb-1">
                      <span className="min-w-0 truncate text-bone/80">#{index + 1} {player.name}</span>
                      <span className="font-mono text-mint">{player.displayValue}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <div className="grid min-h-32 place-items-center">
                <span className="pixel-title text-4xl text-gold">?</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function buildCategories(players: Player[]): Category[] {
  return [
    category("best", "Best Navigator", "net", "Ranked by highest helpful moves minus harmful moves.", players, (player) => player.stats.netContribution, formatNumber, "desc"),
    category("sabotage", "Biggest Sabotager", "harmful", "Ranked by most selected moves that moved away from the exit.", players, (player) => player.stats.harmfulMoves, formatNumber, "desc"),
    category("walls", "Most Wall Hits", "walls", "Ranked by most selected moves that hit a wall.", players, (player) => player.stats.wallHits, formatNumber, "desc")
  ];
}

function category(
  id: string,
  title: string,
  valueLabel: string,
  description: string,
  players: Player[],
  readValue: (player: Player) => number,
  format: (value: number) => string,
  direction: "asc" | "desc"
): Category {
  const ranked = players
    .map((player) => ({ id: player.id, name: player.displayName, value: readValue(player), displayValue: format(readValue(player)) }))
    .filter((player) => Number.isFinite(player.value))
    .sort((a, b) => direction === "desc" ? b.value - a.value || a.name.localeCompare(b.name) : a.value - b.value || a.name.localeCompare(b.name));
  return { id, title, valueLabel, description, players: ranked };
}

function formatNumber(value: number) {
  return String(value);
}
