/**
 * Post Rules — Unit Tests
 *
 * The rule predicate runs in two places: the picker previews "matches N posts"
 * with it, and the server enrolls with it. If they disagree the preview lies,
 * so this covers the predicate itself rather than either caller.
 */

import { describe, it, expect } from "vitest";
import {
  classifyMediaType,
  emptyPostRule,
  isRuleEmpty,
  matchesPostRule,
  parsePostRule,
  ruleConditionsChanged,
  selectPostsByRule,
  type PostRule,
} from "../lib/campaigns/post-rules";

const ANCHOR = "2026-06-01T00:00:00.000Z";

function rule(overrides: Partial<PostRule> = {}): PostRule {
  return { ...emptyPostRule(ANCHOR), ...overrides };
}

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: "media_1",
    caption: "hello world",
    media_type: "IMAGE",
    timestamp: "2026-06-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("classifyMediaType", () => {
  it("distinguishes a reel from a plain feed video", () => {
    // Both are media_type VIDEO — only media_product_type separates them, and
    // "Reels only" is the most common thing a rule targets.
    expect(
      classifyMediaType({ id: "a", media_type: "VIDEO", media_product_type: "REELS" })
    ).toBe("REEL");
    expect(
      classifyMediaType({ id: "b", media_type: "VIDEO", media_product_type: "FEED" })
    ).toBe("VIDEO");
  });

  it("maps carousels and images", () => {
    expect(classifyMediaType({ id: "a", media_type: "CAROUSEL_ALBUM" })).toBe(
      "CAROUSEL"
    );
    expect(classifyMediaType({ id: "b", media_type: "IMAGE" })).toBe("IMAGE");
  });

  it("falls back to IMAGE when the type is missing", () => {
    expect(classifyMediaType({ id: "a" })).toBe("IMAGE");
  });
});

describe("matchesPostRule", () => {
  it("matches everything when no condition is set", () => {
    expect(matchesPostRule(post(), rule())).toBe(true);
    expect(isRuleEmpty(rule())).toBe(true);
  });

  it("filters by media type", () => {
    const reelsOnly = rule({ mediaTypes: ["REEL"] });
    expect(matchesPostRule(post({ media_product_type: "REELS" }), reelsOnly)).toBe(
      true
    );
    expect(matchesPostRule(post(), reelsOnly)).toBe(false);
  });

  it("accepts any listed media type", () => {
    const r = rule({ mediaTypes: ["REEL", "CAROUSEL"] });
    expect(matchesPostRule(post({ media_type: "CAROUSEL_ALBUM" }), r)).toBe(true);
    expect(matchesPostRule(post({ media_type: "IMAGE" }), r)).toBe(false);
  });

  it("matches captions case-insensitively", () => {
    const r = rule({ captionContains: ["#Launch"] });
    expect(matchesPostRule(post({ caption: "the big #launch is here" }), r)).toBe(
      true
    );
    expect(matchesPostRule(post({ caption: "nothing here" }), r)).toBe(false);
  });

  it("treats multiple caption terms as any-of by default", () => {
    const r = rule({ captionContains: ["ebook", "#launch"] });
    expect(matchesPostRule(post({ caption: "grab the ebook" }), r)).toBe(true);
  });

  it("requires every term when captionMatchAll is set", () => {
    const r = rule({ captionContains: ["ebook", "#launch"], captionMatchAll: true });
    expect(matchesPostRule(post({ caption: "grab the ebook" }), r)).toBe(false);
    expect(matchesPostRule(post({ caption: "#launch: grab the ebook" }), r)).toBe(
      true
    );
  });

  it("handles a null caption without throwing", () => {
    const r = rule({ captionContains: ["ebook"] });
    expect(matchesPostRule(post({ caption: null }), r)).toBe(false);
  });

  it("filters by posted-after date", () => {
    const r = rule({ postedAfter: "2026-06-05T00:00:00.000Z" });
    expect(matchesPostRule(post({ timestamp: "2026-06-10T00:00:00.000Z" }), r)).toBe(
      true
    );
    expect(matchesPostRule(post({ timestamp: "2026-06-01T00:00:00.000Z" }), r)).toBe(
      false
    );
  });

  it("compares futureOnly against the anchor, not the current time", () => {
    const r = rule({ futureOnly: true });
    // Published after the rule was written.
    expect(matchesPostRule(post({ timestamp: "2026-06-10T00:00:00.000Z" }), r)).toBe(
      true
    );
    // Published before it — a "future posts only" rule must not adopt history.
    expect(matchesPostRule(post({ timestamp: "2026-05-01T00:00:00.000Z" }), r)).toBe(
      false
    );
  });

  it("rejects a post with no usable timestamp when a time bound is set", () => {
    // Fails closed: enrolling it would silently widen the rule.
    const r = rule({ postedAfter: "2026-06-05T00:00:00.000Z" });
    expect(matchesPostRule(post({ timestamp: null }), r)).toBe(false);
    expect(matchesPostRule(post({ timestamp: "not-a-date" }), r)).toBe(false);
  });

  it("allows a post with no timestamp when no time bound is set", () => {
    expect(matchesPostRule(post({ timestamp: null }), rule({ mediaTypes: ["IMAGE"] }))).toBe(
      true
    );
  });

  it("requires every condition to hold when combined", () => {
    const r = rule({
      mediaTypes: ["REEL"],
      captionContains: ["#launch"],
      postedAfter: "2026-06-05T00:00:00.000Z",
    });
    const matching = post({
      media_product_type: "REELS",
      caption: "the #launch",
      timestamp: "2026-06-10T00:00:00.000Z",
    });
    expect(matchesPostRule(matching, r)).toBe(true);
    // Right type and caption, wrong date.
    expect(
      matchesPostRule({ ...matching, timestamp: "2026-06-01T00:00:00.000Z" }, r)
    ).toBe(false);
  });
});

describe("selectPostsByRule", () => {
  it("returns newest first and honours maxPosts", () => {
    const posts = [
      post({ id: "old", timestamp: "2026-06-01T00:00:00.000Z" }),
      post({ id: "new", timestamp: "2026-06-20T00:00:00.000Z" }),
      post({ id: "mid", timestamp: "2026-06-10T00:00:00.000Z" }),
    ];
    // Newest-first matters for the cap: recent posts are the ones still inside
    // Instagram's private-reply window.
    expect(selectPostsByRule(posts, rule({ maxPosts: 2 })).map((p) => p.id)).toEqual([
      "new",
      "mid",
    ]);
  });

  it("excludes non-matching posts before applying the cap", () => {
    const posts = [
      post({ id: "a", caption: "#launch" }),
      post({ id: "b", caption: "unrelated" }),
    ];
    expect(
      selectPostsByRule(posts, rule({ captionContains: ["#launch"] })).map((p) => p.id)
    ).toEqual(["a"]);
  });
});

describe("parsePostRule", () => {
  it("reads a valid rule", () => {
    expect(parsePostRule({ anchorAt: ANCHOR, mediaTypes: ["REEL"] })?.mediaTypes).toEqual(
      ["REEL"]
    );
  });

  it("treats null and malformed values as no rule", () => {
    expect(parsePostRule(null)).toBeNull();
    expect(parsePostRule(undefined)).toBeNull();
    // Missing the required anchor.
    expect(parsePostRule({ mediaTypes: ["REEL"] })).toBeNull();
    expect(parsePostRule({ anchorAt: ANCHOR, mediaTypes: ["NOPE"] })).toBeNull();
  });
});

describe("ruleConditionsChanged", () => {
  it("ignores a re-stamped anchor", () => {
    // Editing an unrelated campaign field must not move a futureOnly cutoff.
    const a = rule({ futureOnly: true });
    const b = { ...a, anchorAt: "2026-07-01T00:00:00.000Z" };
    expect(ruleConditionsChanged(a, b)).toBe(false);
  });

  it("detects a real condition change", () => {
    expect(ruleConditionsChanged(rule(), rule({ futureOnly: true }))).toBe(true);
    expect(
      ruleConditionsChanged(rule({ captionContains: ["a"] }), rule({ captionContains: ["b"] }))
    ).toBe(true);
    expect(ruleConditionsChanged(null, rule())).toBe(true);
    expect(ruleConditionsChanged(null, null)).toBe(false);
  });
});
