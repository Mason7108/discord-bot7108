import { describe, expect, it } from "vitest";
import { chooseWinners } from "../../src/systems/giveaways.js";

describe("chooseWinners", () => {
  it("returns unique winners", () => {
    const winners = chooseWinners(["a", "a", "b", "c"], 2);
    expect(new Set(winners).size).toBe(winners.length);
    expect(winners.length).toBeLessThanOrEqual(2);
  });
});
