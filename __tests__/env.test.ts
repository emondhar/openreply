import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getEncryptionKeyHex,
  getMetaGraphApiVersion,
  isEmailAllowedToSignIn,
  requireEnv,
} from "../lib/env";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("environment helpers", () => {
  it("requires missing variables", () => {
    expect(() => requireEnv("MISSING_TEST_ENV")).toThrow(
      "MISSING_TEST_ENV environment variable is required"
    );
  });

  it("validates the encryption key format", () => {
    vi.stubEnv("ENCRYPTION_KEY", "not-hex");
    expect(() => getEncryptionKeyHex()).toThrow(
      "ENCRYPTION_KEY must be a 32-byte hex string"
    );
  });

  it("defaults Meta Graph API version in one place", () => {
    expect(getMetaGraphApiVersion()).toBe("v25.0");
    vi.stubEnv("META_GRAPH_API_VERSION", "v26.0");
    expect(getMetaGraphApiVersion()).toBe("v26.0");
  });
});

describe("sign-in allowlist", () => {
  it("allows anyone when unset, so existing self-hosts are unaffected", () => {
    expect(isEmailAllowedToSignIn("anyone@example.com")).toBe(true);
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "");
    expect(isEmailAllowedToSignIn("anyone@example.com")).toBe(true);
  });

  it("allows only listed addresses once set", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "owner@example.com");
    expect(isEmailAllowedToSignIn("owner@example.com")).toBe(true);
    expect(isEmailAllowedToSignIn("someone@example.com")).toBe(false);
  });

  it("ignores case and surrounding whitespace on both sides", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", " Owner@Example.com , second@example.com ");
    expect(isEmailAllowedToSignIn("owner@example.com")).toBe(true);
    expect(isEmailAllowedToSignIn(" SECOND@example.com ")).toBe(true);
  });

  it("rejects a missing email when an allowlist is configured", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "owner@example.com");
    expect(isEmailAllowedToSignIn(null)).toBe(false);
    expect(isEmailAllowedToSignIn(undefined)).toBe(false);
  });
});
