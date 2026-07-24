import type { Award, Player, PlayerStats } from "@/lib/types";

export const emptyStats = (): PlayerStats => ({
  submittedInputs: 0,
  selectedMoves: 0,
  helpfulMoves: 0,
  harmfulMoves: 0,
  neutralMoves: 0,
  wallHits: 0,
  rejectedSpamInputs: 0,
  netContribution: 0,
  accuracy: 0,
  finalMoves: 0
});

export function recalculateStats(stats: PlayerStats): PlayerStats {
  return {
    ...stats,
    netContribution: stats.helpfulMoves - stats.harmfulMoves,
    accuracy: stats.selectedMoves > 0 ? stats.helpfulMoves / stats.selectedMoves : 0
  };
}

export function leaderboard(players: Player[]) {
  return [...players].sort((a, b) => {
    const contribution = b.stats.netContribution - a.stats.netContribution;
    if (contribution) return contribution;
    const selected = b.stats.selectedMoves - a.stats.selectedMoves;
    if (selected) return selected;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function calculateAwards(players: Player[], clutchPlayerId: string | null): Award[] {
  const ranked = leaderboard(players);
  const minAccuracyMoves = 3;
  return [
    awardFor("Best Navigator", ranked, (player) => player.stats.netContribution, (value) => `${value} net`),
    awardFor(
      "Most Accurate",
      ranked.filter((player) => player.stats.selectedMoves >= minAccuracyMoves),
      (player) => player.stats.accuracy,
      (value) => `${Math.round(value * 100)}%`
    ),
    awardFor("Biggest Saboteur", ranked, (player) => player.stats.harmfulMoves, String),
    awardFor("Wall Enthusiast", ranked, (player) => player.stats.wallHits, String),
    awardFor("Main Character", ranked, (player) => player.stats.selectedMoves, String),
    {
      title: "Clutch Player",
      winners: clutchPlayerId ? ranked.filter((player) => player.id === clutchPlayerId).map((player) => player.displayName) : [],
      value: clutchPlayerId ? "exit move" : "nobody"
    },
    awardFor("Most Spam", ranked, (player) => player.stats.rejectedSpamInputs, String),
    awardFor("Most Lost", ranked, (player) => player.stats.harmfulMoves + player.stats.wallHits, String)
  ].map((award) => (award.winners.length ? award : { ...award, winners: ["No winner"] }));
}

function awardFor(
  title: string,
  players: Player[],
  readValue: (player: Player) => number,
  format: (value: number) => string
): Award {
  if (!players.length) return { title, winners: [], value: "n/a" };
  const best = Math.max(...players.map(readValue));
  const winners = players.filter((player) => readValue(player) === best).map((player) => player.displayName);
  return { title, winners, value: format(best) };
}
