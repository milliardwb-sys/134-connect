import { describe, expect, it } from "vitest";

import {
  normalizePairingCode,
  parsePairingCode,
} from "../src/shared/pairing-code";

describe("pairing code", () => {
  it("normalizes spaces, separators, and lowercase characters", () => {
    expect(normalizePairingCode(" 134 abcd 7x9q ")).toBe("134-ABCD-7X9Q");
  });

  it("accepts the canonical 134 pairing-code format", () => {
    expect(parsePairingCode("134-ABCD-7X9Q")).toEqual({
      value: "134-ABCD-7X9Q",
    });
  });

  it("rejects ambiguous and invalid characters", () => {
    expect(() => parsePairingCode("134-ABOI-1L5S")).toThrow(
      "Некорректный код привязки",
    );
  });

  it("rejects codes with an invalid service prefix", () => {
    expect(() => parsePairingCode("999-ABCD-7X9Q")).toThrow(
      "Некорректный код привязки",
    );
  });
});

