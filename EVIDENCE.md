# miraclews — Evidence

This document consolidates the concrete evidence for correctness and stability claims. Each item is labeled with its scope: **measured for miraclews** (run against the miraclews library directly) or **proven in production** (measured in the larger system miraclews originates from, using the same sharded-reactor architecture).

---

## RFC6455 Conformance — Autobahn TestSuite

*Scope: measured for miraclews.*

Run against the official `crossbario/autobahn-testsuite` Docker image, cases 1–7 (246 cases total covering framing, ping/pong, reserved bits, fragmentation, UTF-8 handling, and close handshake).

| Result | Count |
|---|---|
| OK | 239 |
| NON-STRICT | 4 |
| INFORMATIONAL | 3 |
| **FAILED** | **0** |

**0 FAILED** is the standard pass criterion for RFC6455 conformance.

### The 4 NON-STRICT cases (6.4.1–6.4.4)

These cases test UTF-8 validation in fragmented text messages. miraclews validates UTF-8 at the end of the complete reassembled message rather than byte-by-byte as each fragment arrives. This behavior is **correct** — the resulting close frame is `1007` (invalid UTF-8) in both approaches — but it is not the strict-mode behavior that Autobahn marks as OK (which requires failing mid-fragment as soon as an invalid byte is detected).

The practical difference: a client sending a fragmented text message with invalid UTF-8 receives a `1007` close, but slightly later than strict-mode would send it. For server-to-client workloads this distinction has no protocol impact.

Strict-mode (byte-incremental) validation is on the roadmap and would turn these 4 NON-STRICT results into OK.

### The 3 INFORMATIONAL cases

These are informational probes (connection behavior under specific edge conditions), not pass/fail correctness tests.

### Cases 9.x/10.x not run

The performance and limits cases (9.x/10.x) send messages up to 16 MB. miraclews applies a 64 KB `max_frame` cap as a DoS protection policy, which rejects those messages with close code `1009` (message too large). This is a **size policy**, not a correctness failure — the 1009 close is the correct response. Raising `max_frame` via `Config` would allow these cases to pass.

---

## 72-Hour WS-Core Soak

*Scope: measured for miraclews. Run on a dedicated machine (AMD Ryzen 5 1600, 8 GB RAM) separate from the development machine.*

**Setup:** ~100 000 connections, sustained active traffic, 72 hours continuous.

| Metric | Result |
|---|---|
| Duration | 72 hours |
| Connections | ~100 000 |
| Load | Sustained active traffic, full 72 h |
| Errors | 0 |
| Panics | 0 |
| RSS | Plateau (hour 1 ≈ hour 72) |
| p99 latency | 894 µs |

RSS plateau is the primary leak indicator: if RSS grows continuously over 72 hours, there is a leak. RSS flat from hour 1 to hour 72 means the allocator has reached steady state — no leak.

A separate allocator measurement at 4 000-connection churn (repeated open/close, most memory-stressful for the allocator) showed: jemalloc RSS plateau ~6.4 MB, musl malloc plateau ~13.8 MB. Both plateau; the difference is allocator fragmentation/return behavior, not a leak.

---

## WebTransport 24-Hour Soak

*Scope: measured for miraclews-wt, the WebTransport/QUIC companion transport that shares the same Handler API and architectural patterns as miraclews.*

**Setup:** 2 000 concurrent WebTransport sessions, sustained datagram traffic, 24 hours.

| Metric | Result |
|---|---|
| Duration | 24 hours |
| Sessions | 2 000 concurrent |
| Total datagrams | 86.4 million |
| Drops | 0 |
| RSS | 264 MB → 220 MB plateau (declining = no leak) |

RSS declining from 264 MB to a 220 MB plateau (rather than growing) confirms no leak. The initial higher value reflects warm-up allocation; the plateau is the steady-state footprint.

---

## 300 000 Concurrent Connections

*Scope: proven in the production system miraclews originates from (same sharded-reactor architecture, same SO_REUSEPORT sharding, same per-conn slab model).*

300 000 concurrent WebSocket connections sustained on a single machine. Measured RSS at that scale: **~1.4 KB/conn** (this includes kernel TCP socket state and socket buffers in addition to the miraclews connection struct; pure miraclews idle overhead is ~85–107 B/conn as measured in isolation).

At 100 000 connections: server RSS 78 MB, CPU ~12%, 731 000 frames, 0 errors.

---

## Summary

| Claim | Evidence type | Result |
|---|---|---|
| RFC6455 correctness | Autobahn TestSuite (real run) | 239 OK / 0 FAILED |
| No memory leak under 72h active load | Dedicated-machine soak | RSS plateau, 0 errors |
| No leak under 24h WebTransport load | Companion transport soak | RSS plateau, 86.4M datagrams, 0 drop |
| 300k concurrent connections | Production system measurement | ~1.4 KB/conn, sustained |
