import { describe, expect, it } from "vitest";
import {
  SUGGESTIONS,
  getSuggestionSet,
  inferIntent,
  pickPublicReplies,
} from "@/lib/campaigns/suggestions";

/**
 * These are not style tests. Every string here is sent verbatim to a real
 * person, so a bad token or a link in the wrong field is a visible defect in
 * someone's Instagram thread rather than a lint warning.
 */

/** The only placeholders lib/tracking/message.ts substitutes. */
const SUPPORTED = ["username", "link"];

function tokensIn(text: string): string[] {
  return [...text.matchAll(/\{([a-zA-Z_]+)\}/g)].map((m) => m[1]);
}

describe("campaign suggestions", () => {
  it("only uses placeholders the renderer knows how to substitute", () => {
    // An unknown token is not stripped — it is delivered with its braces
    // intact, so "Hey {firstName}" arrives exactly like that.
    for (const set of SUGGESTIONS) {
      const all = [
        ...set.publicReplies,
        ...set.openingDms.flatMap((o) => [o.message, o.buttonLabel]),
        ...set.dms,
      ];
      for (const text of all) {
        for (const token of tokensIn(text)) {
          expect(
            SUPPORTED,
            `"${token}" in ${set.intent}: "${text}"`
          ).toContain(token);
        }
      }
    }
  });

  it("never puts a link in a public reply or an opening DM", () => {
    for (const set of SUGGESTIONS) {
      // A URL in a comment reads as spam; the public reply exists to point at
      // the DM, not to carry the payload.
      for (const reply of set.publicReplies) {
        expect(reply, `publicReply in ${set.intent}`).not.toContain("{link}");
        expect(reply).not.toMatch(/https?:\/\//);
      }
      // The opening DM is sent before the tap — a link there defeats the
      // button that opens the 24-hour messaging window.
      for (const opening of set.openingDms) {
        expect(opening.message, `openingDm in ${set.intent}`).not.toContain(
          "{link}"
        );
      }
    }
  });

  it("gives every DM suggestion something to deliver", () => {
    for (const set of SUGGESTIONS) {
      for (const dm of set.dms) {
        expect(dm, `dm in ${set.intent}`).toContain("{link}");
      }
    }
  });

  it("stays inside the field length limits the schema enforces", () => {
    for (const set of SUGGESTIONS) {
      for (const reply of set.publicReplies) expect(reply.length).toBeLessThanOrEqual(1000);
      for (const dm of set.dms) expect(dm.length).toBeLessThanOrEqual(1000);
      for (const o of set.openingDms) {
        expect(o.message.length).toBeLessThanOrEqual(1000);
        // openingDmButtonLabel is capped at 64 in the zod schema.
        expect(o.buttonLabel.length).toBeLessThanOrEqual(64);
      }
    }
  });

  it("offers enough public replies to fill a believable rotation", () => {
    // The worker picks one at random per comment. With fewer than five, a busy
    // post visibly repeats itself.
    for (const set of SUGGESTIONS) {
      expect(set.publicReplies.length, set.intent).toBeGreaterThanOrEqual(5);
      expect(new Set(set.publicReplies).size).toBe(set.publicReplies.length);
    }
  });

  it("infers intent from keywords, and falls back rather than guessing wildly", () => {
    expect(inferIntent({ keywords: ["CODE"] })).toBe("discount");
    expect(inferIntent({ keywords: ["GUIDE"] })).toBe("leadMagnet");
    expect(inferIntent({ keywords: ["BOOK"] })).toBe("booking");
    expect(inferIntent({ keywords: ["APP"] })).toBe("resource");
    expect(inferIntent({ keywords: ["COURSE"] })).toBe("course");
    expect(inferIntent({ keywords: ["LINK"] })).toBe("link");
    // Nothing recognisable still returns a usable set.
    expect(inferIntent({ keywords: ["xyzzy"] })).toBe("link");
    expect(inferIntent({})).toBe("link");
  });

  it("is case-insensitive about keywords", () => {
    expect(inferIntent({ keywords: ["code"] })).toBe(
      inferIntent({ keywords: ["CODE"] })
    );
  });

  it("returns a stable set for the same seed and varies across seeds", () => {
    const a = pickPublicReplies("link", 5, 3);
    const b = pickPublicReplies("link", 5, 3);
    expect(a).toEqual(b); // stable within one campaign
    expect(a).toHaveLength(5);
    expect(new Set(a).size).toBe(5);

    const c = pickPublicReplies("link", 5, 4);
    expect(c).not.toEqual(a); // different campaigns get different openers
  });

  it("never asks for more replies than the pool holds", () => {
    const all = pickPublicReplies("link", 99, 0);
    expect(all.length).toBe(getSuggestionSet("link").publicReplies.length);
  });
});
