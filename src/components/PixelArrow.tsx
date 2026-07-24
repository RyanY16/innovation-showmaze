import type { Direction } from "@/lib/types";

const arrows: Record<Direction, number[]> = {
  up: [2, 6, 7, 8, 10, 12, 14, 17, 22],
  down: [2, 7, 12, 10, 12, 14, 16, 17, 18],
  left: [2, 6, 10, 11, 12, 13, 14, 16, 22],
  right: [2, 8, 10, 11, 12, 13, 14, 18, 22]
};

export function PixelArrow({ direction, small = false }: { direction: Direction; small?: boolean }) {
  const active = new Set(arrows[direction]);
  return (
    <span className={`pixel-arrow ${small ? "pixel-arrow-sm" : ""}`} aria-hidden="true">
      {Array.from({ length: 25 }).map((_, index) => (
        <span key={index} className={active.has(index) ? "pixel-arrow-block" : ""} />
      ))}
    </span>
  );
}
