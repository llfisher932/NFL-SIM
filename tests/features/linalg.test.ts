import { describe, expect, it } from "vitest";
import { choleskySolve } from "../../src/features/linalg";

describe("features/linalg", () => {
  describe("choleskySolve", () => {
    it("solves a symmetric positive-definite system", () => {
      const x = choleskySolve(
        [
          [4, 2, 0],
          [2, 5, 1],
          [0, 1, 3],
        ],
        [2, -1, 5],
      );
      expect(x[0]).toBeCloseTo(1, 12);
      expect(x[1]).toBeCloseTo(-1, 12);
      expect(x[2]).toBeCloseTo(2, 12);
    });

    it("returns b for the identity matrix", () => {
      expect(
        choleskySolve(
          [
            [1, 0],
            [0, 1],
          ],
          [3, -4],
        ),
      ).toEqual([3, -4]);
    });

    it("throws for a singular matrix", () => {
      expect(() =>
        choleskySolve(
          [
            [1, 1],
            [1, 1],
          ],
          [1, 1],
        ),
      ).toThrow("matrix not positive definite");
    });
  });
});
