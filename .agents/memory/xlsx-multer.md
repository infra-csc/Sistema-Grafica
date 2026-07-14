---
name: xlsx multer upload
description: How to handle file uploads in Express without hitting JSON body-parser size limits.
---

**Rule:** Use `multipart/form-data` with multer (memory storage) for file uploads instead of base64-encoded JSON.

**Why:** Express's `express.json()` body parser has a size limit (default 100kb, even after changing to 50mb it may not hot-reload correctly). Sending a large xlsx as base64 in JSON body reliably causes HTTP 413. Multer bypasses the JSON parser entirely by reading raw multipart streams.

**How to apply:**
```ts
const multer = (await import("multer")).default;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
await new Promise<void>((resolve, reject) =>
  upload.single("file")(req as any, res as any, (err: any) => err ? reject(err) : resolve())
);
const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
```

Frontend sends with:
```ts
const formData = new FormData();
formData.append("file", file);
await fetch("/api/...", { method: "POST", body: formData, credentials: "include" });
```
(Do NOT set Content-Type header manually — browser sets it with boundary automatically.)
