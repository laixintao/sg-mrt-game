import { describe, expect, it } from "vitest";
import { stations } from "../data/geographicMapData.js";
import { getSuggestions, isCorrectGuess, normalizeAnswer } from "./answerMatching.js";

describe("normalizeAnswer", () => {
  it("normalizes HarbourFront and Harbour Front consistently", () => {
    expect(normalizeAnswer("HarbourFront")).toBe("harbour front");
    expect(normalizeAnswer("harbour front")).toBe("harbour front");
  });

  it("normalizes one-north and extra whitespace", () => {
    expect(normalizeAnswer("one-north")).toBe("one north");
    expect(normalizeAnswer("  dhoby   ghaut ")).toBe("dhoby ghaut");
  });
});

describe("getSuggestions", () => {
  it("ranks exact and prefix matches first", () => {
    const suggestions = getSuggestions(stations, "bugi");

    expect(suggestions[0].name).toBe("Bugis");
    expect(suggestions[0].matchTier).toBeLessThanOrEqual(suggestions[1].matchTier);
  });
});

describe("isCorrectGuess", () => {
  it("accepts small typos for the intended station", () => {
    const targetStation = stations.find((station) => station.id === "harbourfront");
    const suggestions = getSuggestions(stations, "harbrfront");

    expect(
      isCorrectGuess({
        input: "harbrfront",
        selectedSuggestionId: null,
        suggestions,
        targetStation,
      }),
    ).toBe(true);
  });

  it("rejects unrelated station names", () => {
    const targetStation = stations.find((station) => station.id === "harbourfront");
    const suggestions = getSuggestions(stations, "bedok");

    expect(
      isCorrectGuess({
        input: "bedok",
        selectedSuggestionId: null,
        suggestions,
        targetStation,
      }),
    ).toBe(false);
  });
});
