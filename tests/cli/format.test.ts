import { describe, expect, it } from "vitest";
import { formatTable } from "../../src/cli/format";

describe("cli/format", () => {
  describe("formatTable", () => {
    const output = formatTable(
      ["team", "epa"],
      [
        ["BAL", "0.394"],
        ["TEN", "-0.429"],
      ],
    );

    it("underlines the header to column width", () => {
      expect(output.split("\n").slice(0, 2)).toEqual(["team     epa", "----  ------"]);
    });

    it("right-aligns numeric columns and left-aligns text", () => {
      expect(output.split("\n").slice(2)).toEqual(["BAL    0.394", "TEN   -0.429"]);
    });

    it("prints only the header when there are no rows", () => {
      expect(formatTable(["team"], [])).toBe("team\n----");
    });
  });
});
