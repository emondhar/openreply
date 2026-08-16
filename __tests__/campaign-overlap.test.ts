/**
 * Campaign overlap — Unit Tests
 *
 * Instagram allows exactly one private reply per comment, ever. Two campaigns
 * covering the same post means one of them will quietly stop sending, so the
 * owner gets told. The throttle matters as much as the detection: a builder
 * that saves five times in a row must not send five emails.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockSendEmail } = vi.hoisted(() => ({
  mockPrisma: {
    automationPost: { findMany: vi.fn() },
    workspaceMember: { findMany: vi.fn() },
    workspace: { findUnique: vi.fn() },
    operationalEvent: { findMany: vi.fn(), createMany: vi.fn() },
  },
  mockSendEmail: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  isEmailConfigured: () => true,
  escapeHtml: (v: string) => v,
}));
vi.mock("@/lib/env", () => ({ getBaseUrl: () => "https://app.test" }));

import { findOverlaps, notifyOverlaps } from "../lib/campaigns/overlap";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.operationalEvent.findMany.mockResolvedValue([]);
  mockPrisma.operationalEvent.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.workspaceMember.findMany.mockResolvedValue([
    { user: { email: "owner@test.com" } },
  ]);
  mockSendEmail.mockResolvedValue(true);
});

describe("findOverlaps", () => {
  it("groups the campaigns covering each post", async () => {
    mockPrisma.automationPost.findMany.mockResolvedValue([
      {
        mediaId: "m1",
        permalink: "https://insta/m1",
        thumbnailUrl: null,
        automation: { id: "auto_b", name: "B" },
      },
      {
        mediaId: "m1",
        permalink: null,
        thumbnailUrl: "t.jpg",
        automation: { id: "auto_c", name: "C" },
      },
    ]);

    const overlaps = await findOverlaps({
      instagramAccountId: "ig_1",
      automationId: "auto_a",
      mediaIds: ["m1"],
    });

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].campaigns.map((c) => c.name)).toEqual(["B", "C"]);
    // Metadata is taken from whichever row has it.
    expect(overlaps[0].permalink).toBe("https://insta/m1");
    expect(overlaps[0].thumbnailUrl).toBe("t.jpg");
  });

  it("excludes the campaign being saved and inactive ones", async () => {
    mockPrisma.automationPost.findMany.mockResolvedValue([]);

    await findOverlaps({
      instagramAccountId: "ig_1",
      automationId: "auto_a",
      mediaIds: ["m1"],
    });

    expect(mockPrisma.automationPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mediaId: { in: ["m1"] },
          excluded: false,
          automation: {
            isActive: true,
            instagramAccountId: "ig_1",
            id: { not: "auto_a" },
          },
        }),
      })
    );
  });

  it("short-circuits on an empty media list", async () => {
    expect(
      await findOverlaps({
        instagramAccountId: "ig_1",
        automationId: "auto_a",
        mediaIds: [],
      })
    ).toEqual([]);
    expect(mockPrisma.automationPost.findMany).not.toHaveBeenCalled();
  });
});

describe("notifyOverlaps", () => {
  const overlaps = [
    {
      mediaId: "m1",
      permalink: "https://insta/m1",
      thumbnailUrl: null,
      campaigns: [{ id: "auto_b", name: "B" }],
    },
  ];

  it("emails the workspace admins", async () => {
    await notifyOverlaps({
      workspaceId: "ws_1",
      automationId: "auto_a",
      campaignName: "A",
      overlaps,
      trigger: "save",
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["owner@test.com"],
        subject: expect.stringContaining("A"),
        html: expect.stringContaining("one private reply per comment"),
      })
    );
  });

  it("suppresses a repeat alert for the same pairing inside the window", async () => {
    // The pairing key is direction-independent, so it matches whichever campaign
    // is being saved.
    mockPrisma.operationalEvent.findMany.mockResolvedValue([
      { message: "overlap:auto_a:auto_b" },
    ]);

    await notifyOverlaps({
      workspaceId: "ws_1",
      automationId: "auto_a",
      campaignName: "A",
      overlaps,
      trigger: "save",
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockPrisma.operationalEvent.createMany).not.toHaveBeenCalled();
  });

  it("records the alert before sending, so a send failure cannot loop", async () => {
    mockSendEmail.mockResolvedValue(false);

    await notifyOverlaps({
      workspaceId: "ws_1",
      automationId: "auto_a",
      campaignName: "A",
      overlaps,
      trigger: "rule",
    });

    expect(mockPrisma.operationalEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          workspaceId: "ws_1",
          level: "WARNING",
          message: "overlap:auto_a:auto_b",
        }),
      ],
    });
  });

  it("falls back to the workspace owner when no member has an email", async () => {
    mockPrisma.workspaceMember.findMany.mockResolvedValue([]);
    mockPrisma.workspace.findUnique.mockResolvedValue({
      owner: { email: "fallback@test.com" },
    });

    await notifyOverlaps({
      workspaceId: "ws_1",
      automationId: "auto_a",
      campaignName: "A",
      overlaps,
      trigger: "save",
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["fallback@test.com"] })
    );
  });

  it("does nothing when there are no overlaps", async () => {
    await notifyOverlaps({
      workspaceId: "ws_1",
      automationId: "auto_a",
      campaignName: "A",
      overlaps: [],
      trigger: "save",
    });

    expect(mockPrisma.operationalEvent.findMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("never throws into the caller when the database misbehaves", async () => {
    // This runs inside a save and inside a worker job; neither should fail
    // because a notification could not be recorded.
    mockPrisma.operationalEvent.findMany.mockRejectedValue(new Error("db down"));

    await expect(
      notifyOverlaps({
        workspaceId: "ws_1",
        automationId: "auto_a",
        campaignName: "A",
        overlaps,
        trigger: "save",
      })
    ).resolves.toBeUndefined();
  });
});
