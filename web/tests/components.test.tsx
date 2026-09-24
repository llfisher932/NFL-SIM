import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameCard, modelPickCorrect } from "../src/components/GameCard";
import { BetCalculator } from "../src/components/BetCalculator";
import { GameDetail } from "../src/components/GameDetail";
import { PlayersView } from "../src/components/PlayersView";
import { RecordView } from "../src/components/RecordView";
import { Slate } from "../src/components/Slate";
import type { SituationPick } from "../../src/types/situations";
import { game, record, week } from "./fixtures";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const spot = (overrides: Partial<SituationPick> = {}): SituationPick => ({
  situation: "disagree-3",
  label: "3+ point disagreement",
  market: "spread",
  side: "SF",
  line: 8.5,
  bet: "SF +8.5",
  gap: -4,
  result: null,
  record: { wins: 179, losses: 137, pushes: 0, seasons: 4, seasonsAboveBreakEven: 3, beatsVegas: false },
  ...overrides,
});

describe("web/components", () => {
  describe("modelPickCorrect", () => {
    it("is false when the favorite lost", () => {
      expect(modelPickCorrect(game())).toBe(false);
    });

    it("is null before kickoff", () => {
      expect(modelPickCorrect(game({ final: null }))).toBeNull();
    });
  });

  describe("GameCard", () => {
    const html = renderToStaticMarkup(<GameCard game={game()} />);

    it("links to the game page", () => {
      expect(html).toContain('href="#/2025/5/game/2025_05_SF_LA"');
    });

    it("shows both win probabilities and the Vegas line", () => {
      expect(text(html)).toContain("21%");
      expect(text(html)).toContain("78%");
      expect(text(html)).toContain("Vegas LA −8.5");
    });

    it("lists injured regulars but not departed players", () => {
      expect(text(html)).toContain("Brock Purdy");
      expect(text(html)).not.toContain("Traded Player");
    });

    it("collapses a team resting starters into one chip", () => {
      const restingGame = game({
        home: {
          ...game().home,
          out: ["00-0000101", "00-0000102"].map((playerId) => ({ playerId, name: playerId, group: "WR" as const, role: 0.9, probability: 0.6, reason: "resting" as const })),
        },
      });
      const card = text(renderToStaticMarkup(<GameCard game={restingGame} />));
      expect(card).toContain("LA resting starters");
      expect(card).not.toContain("00-0000101");
    });

    it("marks a game in one of the model's best spots with its pick", () => {
      const card = text(renderToStaticMarkup(<GameCard game={game({ spots: [spot()] })} />));
      expect(card).toContain("Model spot: SF +8.5");
    });

    it("shows whether a best-spot pick won once the game is final", () => {
      const card = text(renderToStaticMarkup(<GameCard game={game({ spots: [spot({ result: "win" })] })} />));
      expect(card).toContain("SF +8.5 (won)");
    });

    it("reports the model pick result with a label, not color alone", () => {
      expect(text(html)).toContain("Model pick lost");
    });
  });

  describe("Slate", () => {
    it("lists this week's best spots with their history", () => {
      const slate = week({ games: [game({ spots: [spot()] }), game({ gameId: "x", spots: [] })] });
      const html = text(renderToStaticMarkup(<Slate week={slate} refreshing={false} />));
      expect(html).toContain("Model’s best spots this week");
      expect(html).toContain("SF +8.5");
      expect(html).toContain("179–137 (56.6%) since 2022, above break-even in 3 of 4 seasons");
    });

    it("says when no game fits a best spot", () => {
      expect(text(renderToStaticMarkup(<Slate week={week()} refreshing={false} />))).toContain("No games fit those situations this week");
    });

    it("renders every game and the week header", () => {
      const html = text(renderToStaticMarkup(<Slate week={week()} refreshing={false} />));
      expect(html).toContain("Week 5");
      expect(html).toContain("49ers");
      expect(html).toContain("Chiefs");
    });
  });

  describe("GameDetail", () => {
    const html = text(renderToStaticMarkup(<GameDetail game={game()} />));

    it("leads with the favorite's win probability", () => {
      expect(html).toContain("78%");
      expect(html).toContain("Rams win probability");
    });

    it("explains why a best-spot game stands out", () => {
      const playoff = spot({
        situation: "playoffs",
        label: "Playoff game",
        record: { wins: 31, losses: 21, pushes: 0, seasons: 4, seasonsAboveBreakEven: 3, beatsVegas: true },
      });
      const detail = text(renderToStaticMarkup(<GameDetail game={game({ spots: [playoff] })} />));
      expect(detail).toContain("One of the model’s best spots");
      expect(detail).toContain("Model takes SF +8.5");
      expect(detail).toContain("and more accurate than Vegas");
    });

    it("names the expected QB and whom he replaces", () => {
      const withQb = game({ away: { ...game().away, qb: { name: "Mac Jones", skill: -0.12, starterOut: "Brock Purdy" } } });
      const detail = text(renderToStaticMarkup(<GameDetail game={withQb} />));
      expect(detail).toContain("Expected QB: Mac Jones (−0.12 EPA/dropback vs league average)");
      expect(detail).toContain("in for Brock Purdy");
    });

    it("explains why each player is missing", () => {
      expect(html).toContain("Brock Purdy");
      expect(html).toContain("Injured reserve");
      expect(html).toContain("No longer on roster");
    });

    it("renders both charts with table toggles", () => {
      expect(html).toContain("Margin of victory");
      expect(html).toContain("Total points");
    });

    it("renders each team's player projections", () => {
      expect(html).toContain("Matthew Stafford");
      expect(html).toContain("Test Back");
    });
  });

  describe("BetCalculator", () => {
    const priced = game({ pricing: { marginWeight: 0.15, totalWeight: 0 } });
    const html = text(renderToStaticMarkup(<BetCalculator game={priced} />));

    it("opens on the model's side of the spread at the Vegas line", () => {
      expect(html).toContain("Bet calculator");
      expect(html).toContain("Win");
      expect(html).toContain("Fair price");
    });

    it("explains how realistic odds blend the model with Vegas", () => {
      expect(html).toContain("mix 15% model with 85% Vegas for margins and 0% model for totals");
    });

    it("shows the raw model's chance next to the realistic one", () => {
      expect(html).toContain("Raw model alone:");
    });

    it("offers a table of alternative lines", () => {
      expect(html).toContain("Alternative lines");
    });

    it("reports expected value at the default price", () => {
      expect(html).toContain("Expected value");
      expect(html).toContain("per $100");
    });
  });

  describe("PlayersView", () => {
    it("lists players across the slate", () => {
      const html = text(renderToStaticMarkup(<PlayersView week={week()} refreshing={false} />));
      expect(html).toContain("Test Receiver");
      expect(html).toContain("Player projections");
    });
  });

  describe("RecordView", () => {
    it("compares the model with the market", () => {
      const html = text(renderToStaticMarkup(<RecordView record={record()} />));
      expect(html).toContain("0.2185");
      expect(html).toContain("Market 0.2095");
      expect(html).toContain("51.8%");
    });

    it("shows the live pick record when picks are tracked", () => {
      const line = (minGap: number, wins: number, losses: number) => ({ minGap, picks: wins + losses, wins, losses, pushes: 0, averageClv: 0.4 });
      const tracker = {
        season: 2026,
        spread: [line(0, 12, 9), line(3, 5, 3), line(5, 2, 1)],
        total: [line(0, 10, 11), line(3, 3, 4), line(5, 1, 1)],
        picks: [
          {
            gameId: "2026_03_TEN_NYG",
            season: 2026,
            week: 3,
            home: "NYG",
            away: "TEN",
            kickoff: "2026-09-27T13:00",
            capturedAt: "2026-09-26T11:00:00.000Z",
            started: true,
            postseason: false,
            modelMargin: 3.4,
            modelTotal: 46.4,
            spread: { side: "NYG", gap: 0.9, line: 2.5, closingLine: 3, clv: 0.5, result: "win" as const },
            total: { side: "over", gap: 7.9, line: 38.5, closingLine: 39, clv: 0.5, result: "loss" as const },
            final: { home: 24, away: 20 },
          },
        ],
      };
      const html = text(renderToStaticMarkup(<RecordView record={{ ...record(), tracker }} />));
      expect(html).toContain("2026 live picks");
      expect(html).toContain("12–9 (57.1%)");
      expect(html).toContain("5+ pt disagreements: 2–1");
      expect(html).toContain("TEN @ NYG");
    });

    it("shows when the model is at its best, naming where it beats Vegas", () => {
      const situation = {
        id: "playoffs" as const,
        label: "Playoff game",
        market: "spread" as const,
        description: "Postseason games: the model's side of the spread",
        games: 52,
        wins: 31,
        losses: 21,
        pushes: 0,
        seasons: [2022, 2023, 2024, 2025].map((season) => ({ season, wins: 8, losses: 5, pushes: 0 })),
        seasonsAboveBreakEven: 3,
        brierEdge: 0.009,
        marginEdge: 0.48,
        totalEdge: -0.36,
        beatsVegas: true,
        live: { picks: 0, wins: 0, losses: 0, pushes: 0 },
      };
      const html = text(renderToStaticMarkup(<RecordView record={{ ...record(), situations: [situation] }} />));
      expect(html).toContain("When the model is at its best");
      expect(html).toContain("More accurate than Vegas: playoff game");
      expect(html).toContain("31–21 (59.6%)");
      expect(html).toContain("+0.48 pts (beats Vegas)");
    });

    it("explains an empty live record", () => {
      const tracker = { season: 2026, spread: [], total: [], picks: [] };
      expect(text(renderToStaticMarkup(<RecordView record={{ ...record(), tracker }} />))).toContain("No picks logged yet");
    });
  });
});
