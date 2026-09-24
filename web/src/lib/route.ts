export type Route =
  | { view: "home" }
  | { view: "slate"; season: number; week: number }
  | { view: "players"; season: number; week: number }
  | { view: "game"; season: number; week: number; gameId: string }
  | { view: "record" };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "record") return { view: "record" };
  const season = Number(parts[0]);
  const week = Number(parts[1]);
  if (!Number.isInteger(season) || !Number.isInteger(week) || parts.length < 2) return { view: "home" };
  if (parts[2] === "players") return { view: "players", season, week };
  if (parts[2] === "game" && parts[3]) return { view: "game", season, week, gameId: decodeURIComponent(parts[3]) };
  return { view: "slate", season, week };
}

export function formatHash(route: Route): string {
  switch (route.view) {
    case "home":
      return "#/";
    case "record":
      return "#/record";
    case "slate":
      return `#/${route.season}/${route.week}`;
    case "players":
      return `#/${route.season}/${route.week}/players`;
    case "game":
      return `#/${route.season}/${route.week}/game/${encodeURIComponent(route.gameId)}`;
  }
}
