import { describe, expect, it } from "vitest";
import { buildEvenTeamSizes } from "../../src/systems/vcTeamRandomizer.js";

describe("vcTeamRandomizer sizing", () => {
  it("splits 10 users into 2 teams as 5/5", () => {
    expect(buildEvenTeamSizes(10, 2)).toEqual([5, 5]);
  });

  it("splits 11 users into 2 teams as 6/5", () => {
    expect(buildEvenTeamSizes(11, 2)).toEqual([6, 5]);
  });

  it("splits 11 users into 3 teams as 4/4/3", () => {
    expect(buildEvenTeamSizes(11, 3)).toEqual([4, 4, 3]);
  });
});
