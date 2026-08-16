/**
 * Comment Reconciler — Unit Tests
 *
 * The sweep runs per account rather than per campaign. That is a cost decision:
 * once a campaign can cover many posts, campaigns overlap heavily, and walking
 * each campaign's posts separately re-reads the same post's comments once per
 * campaign covering it — against an endpoint Instagram throttles hard (error
 * 368). These tests pin the two properties that keep it bounded: each post's
 * comments are fetched once per sweep, and one job is enqueued per comment.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockQueueAdd, mockGetRecentMediaComments, mockGetUserMedia } =
  vi.hoisted(() => ({
    mockPrisma: {
      instagramAccount: { findMany: vi.fn() },
      automation: { findMany: vi.fn() },
      automationPost: { findMany: vi.fn() },
      dmLog: { findMany: vi.fn() },
      operationalEvent: { create: vi.fn() },
    },
    mockQueueAdd: vi.fn(),
    mockGetRecentMediaComments: vi.fn(),
    mockGetUserMedia: vi.fn(),
  }));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ add: mockQueueAdd }),
}));
vi.mock("@/lib/meta/client", () => ({
  getRecentMediaComments: mockGetRecentMediaComments,
  getUserMedia: mockGetUserMedia,
  MetaApiError: class MetaApiError extends Error {
    code = 0;
  },
}));
vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: () => "decrypted_token",
}));
vi.mock("@/lib/utils/keyword-matcher", () => ({
  matchKeywords: (text: string, keywords: string[]) => {
    const hit = keywords.find((k) => text.toUpperCase().includes(k.toUpperCase()));
    return { matched: Boolean(hit), matchedKeyword: hit ?? null };
  },
}));

import { reconcileComments } from "../lib/polling/comment-reconciler";

const ACCOUNT = {
  id: "ig_row_1",
  instagramId: "ig_456",
  username: "acme",
  accessToken: "encrypted",
  workspaceId: "ws_1",
};

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "auto_1",
    name: "Campaign One",
    matchAnyPost: false,
    matchAnyWord: false,
    keywords: ["LINK"],
    wholeWordMatch: true,
    publicReplyEnabled: false,
    workspaceId: "ws_1",
    ...overrides,
  };
}

function comment(id: string, text = "send me the LINK") {
  return {
    id,
    text,
    timestamp: new Date().toISOString(),
    from: { id: "commenter_1", username: "someone" },
    replies: { data: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.instagramAccount.findMany.mockResolvedValue([ACCOUNT]);
  mockPrisma.dmLog.findMany.mockResolvedValue([]);
  mockPrisma.operationalEvent.create.mockResolvedValue({});
  mockGetUserMedia.mockResolvedValue([]);
});

describe("reconcileComments", () => {
  it("reads each post's comments once no matter how many campaigns cover it", async () => {
    const a = campaign({ id: "auto_a", name: "A" });
    const b = campaign({ id: "auto_b", name: "B" });
    mockPrisma.automation.findMany.mockResolvedValue([a, b]);
    // Both campaigns cover the same post.
    mockPrisma.automationPost.findMany.mockResolvedValue([
      { automationId: "auto_a", mediaId: "media_1", postedAt: new Date() },
      { automationId: "auto_b", mediaId: "media_1", postedAt: new Date() },
    ]);
    mockGetRecentMediaComments.mockResolvedValue([comment("c1")]);

    await reconcileComments();

    // The whole point: one read, not one per covering campaign.
    expect(mockGetRecentMediaComments).toHaveBeenCalledTimes(1);
    expect(mockGetRecentMediaComments).toHaveBeenCalledWith(
      "decrypted_token",
      "media_1",
      expect.any(Number)
    );
    // And one job, not one per campaign — the worker re-runs every match itself.
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-comment",
      expect.objectContaining({ commentId: "c1", mediaId: "media_1" })
    );
  });

  it("carries the right media id when a sweep spans several posts", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([campaign()]);
    mockPrisma.automationPost.findMany.mockResolvedValue([
      { automationId: "auto_1", mediaId: "media_1", postedAt: new Date("2026-08-10") },
      { automationId: "auto_1", mediaId: "media_2", postedAt: new Date("2026-08-11") },
    ]);
    mockGetRecentMediaComments.mockImplementation(
      async (_token: string, mediaId: string) => [comment(`c-${mediaId}`)]
    );

    await reconcileComments();

    // Comments are pooled across posts before enqueueing, so each job must still
    // name the post its comment came from.
    const jobs = mockQueueAdd.mock.calls.map((call) => call[1]);
    expect(jobs).toHaveLength(2);
    expect(jobs.find((j) => j.commentId === "c-media_1")?.mediaId).toBe("media_1");
    expect(jobs.find((j) => j.commentId === "c-media_2")?.mediaId).toBe("media_2");
  });

  it("skips comments the covering campaign already handled", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([campaign()]);
    mockPrisma.automationPost.findMany.mockResolvedValue([
      { automationId: "auto_1", mediaId: "media_1", postedAt: new Date() },
    ]);
    mockGetRecentMediaComments.mockResolvedValue([comment("c1"), comment("c2")]);
    mockPrisma.dmLog.findMany.mockResolvedValue([
      { automationId: "auto_1", commentId: "c1", status: "SENT", publicReplySentAt: null },
    ]);

    await reconcileComments();

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-comment",
      expect.objectContaining({ commentId: "c2" })
    );
  });

  it("ignores comments written by the account itself and ones the owner answered", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([campaign()]);
    mockPrisma.automationPost.findMany.mockResolvedValue([
      { automationId: "auto_1", mediaId: "media_1", postedAt: new Date() },
    ]);
    mockGetRecentMediaComments.mockResolvedValue([
      { ...comment("own"), from: { id: "ig_456", username: "acme" } },
      { ...comment("answered"), replies: { data: [{ from: { id: "ig_456" } }] } },
      comment("fresh"),
    ]);

    await reconcileComments();

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-comment",
      expect.objectContaining({ commentId: "fresh" })
    );
  });

  it("skips comments that match no covering campaign's keywords", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([campaign()]);
    mockPrisma.automationPost.findMany.mockResolvedValue([
      { automationId: "auto_1", mediaId: "media_1", postedAt: new Date() },
    ]);
    mockGetRecentMediaComments.mockResolvedValue([comment("c1", "nice reel")]);

    await reconcileComments();

    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("scans the recent feed for any-post campaigns", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      campaign({ matchAnyPost: true }),
    ]);
    mockPrisma.automationPost.findMany.mockResolvedValue([]);
    mockGetUserMedia.mockResolvedValue([
      { id: "media_recent", timestamp: new Date().toISOString() },
    ]);
    mockGetRecentMediaComments.mockResolvedValue([comment("c1")]);

    await reconcileComments();

    expect(mockGetRecentMediaComments).toHaveBeenCalledWith(
      "decrypted_token",
      "media_recent",
      expect.any(Number)
    );
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the account has no covered posts", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([campaign()]);
    mockPrisma.automationPost.findMany.mockResolvedValue([]);

    await reconcileComments();

    expect(mockGetRecentMediaComments).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
