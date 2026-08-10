/**
 * Unit tests for server-side file upload validation logic.
 *
 * The validation rules added in Phase 1 live in POST /api/objects/upload:
 *   - contentType must start with one of the allowed prefixes
 *   - size must not exceed 50 MB
 *
 * These tests extract the validation logic into pure functions and verify
 * each branch without spinning up a real server or database.
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Extracted validation logic (mirrors server/routes/objects.ts exactly)
// ---------------------------------------------------------------------------
const ALLOWED_CONTENT_TYPE_PREFIXES = [
  "image/",
  "video/",
  "application/pdf",
  "application/zip",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument",
  "text/plain",
  "application/octet-stream",
];
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

function isContentTypeAllowed(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) =>
    contentType.startsWith(prefix)
  );
}

function isSizeAllowed(size: number): boolean {
  return size <= MAX_UPLOAD_BYTES;
}

// ---------------------------------------------------------------------------
// Content-type allowlist
// ---------------------------------------------------------------------------
describe("upload content-type validation", () => {
  it("allows common image types", () => {
    for (const ct of ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]) {
      expect(isContentTypeAllowed(ct)).toBe(true);
    }
  });

  it("allows PDF", () => {
    expect(isContentTypeAllowed("application/pdf")).toBe(true);
  });

  it("allows video types", () => {
    for (const ct of ["video/mp4", "video/quicktime", "video/webm"]) {
      expect(isContentTypeAllowed(ct)).toBe(true);
    }
  });

  it("allows Excel formats", () => {
    expect(isContentTypeAllowed("application/vnd.ms-excel")).toBe(true);
    expect(isContentTypeAllowed(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )).toBe(true);
  });

  it("allows zip and plain text", () => {
    expect(isContentTypeAllowed("application/zip")).toBe(true);
    expect(isContentTypeAllowed("text/plain")).toBe(true);
  });

  it("allows octet-stream (browser fallback for unknown binary)", () => {
    expect(isContentTypeAllowed("application/octet-stream")).toBe(true);
  });

  it("rejects executable types", () => {
    for (const ct of [
      "application/x-msdownload",
      "application/x-executable",
      "application/x-sh",
      "application/x-bat",
    ]) {
      expect(isContentTypeAllowed(ct)).toBe(false);
    }
  });

  it("rejects script types", () => {
    for (const ct of [
      "application/javascript",
      "text/javascript",
      "text/html",
      "application/x-php",
    ]) {
      expect(isContentTypeAllowed(ct)).toBe(false);
    }
  });

  it("rejects empty string", () => {
    expect(isContentTypeAllowed("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// File size limit
// ---------------------------------------------------------------------------
describe("upload size validation", () => {
  it("allows files at exactly 50 MB", () => {
    expect(isSizeAllowed(50 * 1024 * 1024)).toBe(true);
  });

  it("allows files below 50 MB", () => {
    expect(isSizeAllowed(1)).toBe(true);
    expect(isSizeAllowed(10 * 1024 * 1024)).toBe(true);
    expect(isSizeAllowed(49 * 1024 * 1024)).toBe(true);
  });

  it("rejects files above 50 MB", () => {
    expect(isSizeAllowed(50 * 1024 * 1024 + 1)).toBe(false);
    expect(isSizeAllowed(100 * 1024 * 1024)).toBe(false);
    expect(isSizeAllowed(Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});
