import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameCard, modelPickCorrect } from "../src/components/GameCard";
import { GameDetail } from "../src/components/GameDetail";
import { PlayersView } from "../src/components/PlayersView";
import { RecordView } from "../src/components/RecordView";
import { Slate } from "../src/components/Slate";
import { game, record, week } from "./fixtures";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

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

    it("reports the model pick result with a label, not color alone", () => {
      expect(text(html)).toContain("Model pick lost");
    });
  });

  describe("Slate", () => {
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
  });
});
