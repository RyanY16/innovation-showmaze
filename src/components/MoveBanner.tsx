import type { MoveHistoryItem, SelectedMove } from "@/lib/types";
import { PixelArrow } from "@/components/PixelArrow";

const directionLabels: Record<SelectedMove["direction"], string> = {
  up: "UP",
  down: "DOWN",
  left: "LEFT",
  right: "RIGHT"
};

export function MoveBanner({ move, history = [] }: { move: SelectedMove | null; history?: MoveHistoryItem[] }) {
  const moves = history.length ? history.slice(0, 5) : move ? [{ ...move, id: "selected" }] : [];
  if (!moves.length) return null;
  const totalMoves = history.length || moves.length;

  return (
    <div className="border-[4px] border-gold bg-ink/95 p-2 shadow-pixel">
      <p className="hud-label px-1 text-gold">Moves</p>
      <div className="mt-1 max-h-40 overflow-hidden">
        {moves.map((item, index) => (
          <div key={item.id} className="mb-1 flex items-center gap-2 border-[3px] border-cyan bg-panel px-2 py-2 text-xs font-black last:mb-0">
            <span className="w-8 text-bone/70">#{totalMoves - index}</span>
            <span className="min-w-0 flex-1 truncate text-cyan">{item.displayName}</span>
            <span className="text-gold"><PixelArrow direction={item.direction} small /></span>
            <span className="text-bone">{directionLabels[item.direction]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
