// ── src/middleware/compression.ts ── Response Compression ────────────
//
// Compresses HTTP responses using gzip or Brotli before sending them
// to the client. This reduces bandwidth usage significantly — JSON
// responses typically compress 70-90%.
//
// HOW IT WORKS:
//   1. Client sends `Accept-Encoding: gzip, br` header
//   2. This middleware checks the header and compresses the response
//   3. Client decompresses automatically (browsers and HTTP clients do this)
//
// WHEN TO SKIP COMPRESSION:
//   - Small responses (< 1KB) — overhead of compression headers > savings
//   - Already compressed content (images, videos) — won't compress further
//   - Server-Sent Events — breaks streaming
//
// C# COMPARISON:
//   ASP.NET has built-in response compression:
//
//   builder.Services.AddResponseCompression(opts => {
//     opts.EnableForHttps = true;
//     opts.Providers.Add<BrotliCompressionProvider>();
//     opts.Providers.Add<GzipCompressionProvider>();
//   });
//   app.UseResponseCompression();
//
//   In Express, we use the `compression` package — same concept,
//   same result, just different syntax.

import compression from 'compression';

// ── Compression Middleware ───────────────────────────────────────────
// Configured to skip compression for responses smaller than 1KB
// (the compression header overhead isn't worth it for tiny payloads).
//
// The `filter` function uses the default behavior: compress text-based
// content types (JSON, HTML, CSS, JS) but skip binary formats (images,
// PDFs) that are already compressed.

export const compressionMiddleware = compression({
  // Only compress responses larger than 1KB.
  // Below this, the Content-Encoding header adds more bytes than you save.
  threshold: 1024,

  // Compression level: 6 is the default gzip level — good balance between
  // CPU usage and compression ratio. Range is 1 (fastest) to 9 (smallest).
  // In production behind a reverse proxy (Nginx), you might disable this
  // and let the proxy handle compression instead.
  level: 6,
});
