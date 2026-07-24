export function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-bone/15 py-1 text-sm">
      <span className="text-bone/70">{label}</span>
      <strong className="font-mono text-cyan">{value}</strong>
    </div>
  );
}
