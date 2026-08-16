/**
 * Campaign post set — Unit Tests
 *
 * syncCampaignPosts reconciles the submitted manual selection against the rows
 * a campaign already holds. The subtle part is what it must NOT do: a save
 * carries only the posts a human ticked, so treating that list as authoritative
 * over rule-enrolled rows would drop any post the rule added between the
 * builder loading and the user hitting save.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    automationPost: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

import { syncCampaignPosts } from "../lib/campaigns/posts";

/** findMany is called twice: existing rows first, then the remaining set. */
function withRows(
  existing: Record<string, unknown>[],
  remaining: Record<string, unknown>[]
) {
  mockPrisma.automationPost.findMany
    .mockResolvedValueOnce(existing)
    .mockResolvedValueOnce(remaining);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.automationPost.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.automationPost.update.mockResolvedValue({});
  mockPrisma.automationPost.delete.mockResolvedValue({});
});

describe("syncCampaignPosts", () => {
  it("creates rows for newly ticked posts, with their cached metadata", async () => {
    withRows([], [{ mediaId: "m1", permalink: "https://insta/m1" }]);

    const result = await syncCampaignPosts({
      automationId: "auto_1",
      postIds: ["m1"],
      postMeta: {
        m1: {
          permalink: "https://insta/m1",
          thumbnailUrl: "https://cdn/m1.jpg",
          mediaType: "REEL",
          caption: "hello",
          timestamp: "2026-08-01T00:00:00.000Z",
        },
      },
    });

    expect(mockPrisma.automationPost.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          automationId: "auto_1",
          mediaId: "m1",
          source: "MANUAL",
          thumbnailUrl: "https://cdn/m1.jpg",
          mediaType: "REEL",
          postedAt: new Date("2026-08-01T00:00:00.000Z"),
        }),
      ],
      skipDuplicates: true,
    });
    expect(result.added).toEqual(["m1"]);
    // The legacy mirror follows the primary post.
    expect(result.primary).toEqual({ postId: "m1", postUrl: "https://insta/m1" });
  });

  it("deletes a manual row that was unticked", async () => {
    withRows(
      [{ id: "row_1", mediaId: "m1", source: "MANUAL", excluded: false, thumbnailUrl: null }],
      []
    );

    const result = await syncCampaignPosts({ automationId: "auto_1", postIds: [] });

    expect(mockPrisma.automationPost.delete).toHaveBeenCalledWith({
      where: { id: "row_1" },
    });
    expect(result.removed).toEqual(["m1"]);
  });

  it("leaves rule-enrolled posts alone when they are absent from the selection", async () => {
    // The rule owns this row. A save that simply doesn't mention it — which is
    // every save, since the picker only submits manual picks — must not drop it.
    withRows(
      [{ id: "row_r", mediaId: "m_rule", source: "RULE", excluded: false, thumbnailUrl: null }],
      [{ mediaId: "m_rule", permalink: null }]
    );

    const result = await syncCampaignPosts({ automationId: "auto_1", postIds: [] });

    expect(mockPrisma.automationPost.delete).not.toHaveBeenCalled();
    expect(result.removed).toEqual([]);
    expect(result.mediaIds).toEqual(["m_rule"]);
  });

  it("promotes a rule-enrolled post to manual when it is ticked by hand", async () => {
    // Specificity decides who wins the one private reply Instagram allows, so a
    // deliberate pick has to outrank an automatic one.
    withRows(
      [{ id: "row_r", mediaId: "m1", source: "RULE", excluded: false, thumbnailUrl: null }],
      [{ mediaId: "m1", permalink: null }]
    );

    await syncCampaignPosts({ automationId: "auto_1", postIds: ["m1"] });

    expect(mockPrisma.automationPost.update).toHaveBeenCalledWith({
      where: { id: "row_r" },
      data: expect.objectContaining({ source: "MANUAL", excluded: false }),
    });
    expect(mockPrisma.automationPost.createMany).not.toHaveBeenCalled();
  });

  it("excludes rather than deletes a post named in excludePostIds", async () => {
    // Deleting would let the next rule sweep add it straight back.
    withRows(
      [{ id: "row_r", mediaId: "m1", source: "RULE", excluded: false, thumbnailUrl: null }],
      []
    );

    const result = await syncCampaignPosts({
      automationId: "auto_1",
      postIds: [],
      excludePostIds: ["m1"],
    });

    expect(mockPrisma.automationPost.update).toHaveBeenCalledWith({
      where: { id: "row_r" },
      data: { excluded: true },
    });
    expect(mockPrisma.automationPost.delete).not.toHaveBeenCalled();
    expect(result.removed).toEqual(["m1"]);
  });

  it("un-excludes a post the user ticks again", async () => {
    withRows(
      [{ id: "row_1", mediaId: "m1", source: "MANUAL", excluded: true, thumbnailUrl: null }],
      [{ mediaId: "m1", permalink: null }]
    );

    await syncCampaignPosts({ automationId: "auto_1", postIds: ["m1"] });

    expect(mockPrisma.automationPost.update).toHaveBeenCalledWith({
      where: { id: "row_1" },
      data: expect.objectContaining({ excluded: false }),
    });
  });

  it("backfills metadata onto rows that have none without clobbering what is cached", async () => {
    withRows(
      [
        { id: "row_1", mediaId: "m1", source: "MANUAL", excluded: false, thumbnailUrl: null },
        { id: "row_2", mediaId: "m2", source: "MANUAL", excluded: false, thumbnailUrl: "keep.jpg" },
      ],
      []
    );

    await syncCampaignPosts({
      automationId: "auto_1",
      postIds: ["m1", "m2"],
      postMeta: {
        m1: { thumbnailUrl: "new1.jpg" },
        m2: { thumbnailUrl: "new2.jpg" },
      },
    });

    // The migration leaves thumbnails null, so those get filled...
    expect(mockPrisma.automationPost.update).toHaveBeenCalledWith({
      where: { id: "row_1" },
      data: expect.objectContaining({ thumbnailUrl: "new1.jpg" }),
    });
    // ...while a row that already has one is left as it is.
    expect(mockPrisma.automationPost.update).not.toHaveBeenCalledWith({
      where: { id: "row_2" },
      data: expect.anything(),
    });
  });

  it("dedupes the submitted list", async () => {
    withRows([], []);

    await syncCampaignPosts({ automationId: "auto_1", postIds: ["m1", "m1", "m2"] });

    expect(mockPrisma.automationPost.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ mediaId: "m1" }),
        expect.objectContaining({ mediaId: "m2" }),
      ],
      skipDuplicates: true,
    });
  });

  it("reports a null primary when the campaign covers nothing", async () => {
    withRows([], []);

    const result = await syncCampaignPosts({ automationId: "auto_1", postIds: [] });

    expect(result.primary).toEqual({ postId: null, postUrl: null });
    expect(result.mediaIds).toEqual([]);
  });
});
