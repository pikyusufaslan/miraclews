# miraclews — Benchmarks

## Methodology

All numbers were measured on a **12-core Linux x86_64 box**, loopback transport, 32 B binary echo round-trips. The load generator and the server share the same machine and split the available CPU. This means the **numbers are relative** — suitable for comparing backends against each other and against competitors run under identical conditions, but not for projecting absolute single-box throughput in a production setup (where load generation runs on separate hardware).

Connection counts and pipeline depths are held fixed across comparisons; the same `loadclient` binary drives all scenarios.

## Backend comparison

| Backend | Throughput | p99 saturated | Idle RAM/conn |
|---|---|---|---|
| epoll (raw libc) | ~2.5M msg/s | ~10 ms | ~85 B |
| io_uring (naive) | ~2.7M msg/s | ~8 ms | ~5.5 KB |
| io_uring (buf-ring) | ~2.4M msg/s | ~10 ms | ~107 B |

*Scenario: 2 000 connections, pipeline depth 8, 6 workers.*

**Notes:**

- The io_uring naive backend delivers the best tail latency (p99 −22%, p99.9 −35% vs epoll) by batching syscalls, but allocates a fixed 4 KB receive buffer per connection. At 1 M connections that is ~4 GB of receive-buffer alone — impractical for mostly-idle workloads.
- The io_uring buf-ring backend eliminates the per-connection receive buffer by sharing a kernel-registered buffer pool across all connections on a worker. Idle RAM footprint returns to epoll levels (~107 B/conn). The tradeoff is that the per-buffer recycle cost absorbs the latency gains of naive io_uring — p99 is on par with epoll, not better.
- Throughput figures have ±5% run-to-run variance on this shared-CPU setup; tail latency deltas are the reliable signal.

## Allocator note (jemalloc vs musl malloc)

Measured during the 72h soak at 4 000-connection churn: **jemalloc RSS plateau ~6.4 MB** vs **musl malloc RSS plateau ~13.8 MB**. Both plateau — this is allocator fragmentation/return behavior, not a memory leak. musl's system allocator is slower to return freed per-connection buffers to the OS, producing a higher steady-state RSS watermark at sustained churn. glibc malloc does not exhibit this to the same degree, but jemalloc outperforms both at churn.

**Recommendation:** use the `jemalloc` feature flag for musl/static production deployments.

## Scale result

Proven in the production system miraclews originates from: **300 000 concurrent connections sustained on a single machine at ~1.4 KB/conn** (measured RSS at that scale; the per-conn overhead includes kernel TCP state and socket buffers in addition to the miraclews connection struct).

At 100 000 connections: server RSS 78 MB, ~12% CPU, 731 000 frames processed, 0 errors.

## Competitor comparison

Same machine, same session, same `loadclient`, 6 workers, 32 B echo, 2 000 connections, depth 8. Competitor echo servers were run under identical conditions.

| Metric | tokio-tungstenite | fastwebsockets | miraclews |
|---|---|---|---|
| Throughput | 758k msg/s | 862k msg/s | ~3.0M msg/s |
| p99 saturated | 48.5 ms | 49.3 ms | ~7.5 ms |
| Idle RAM/conn (8 000 conns) | ~8.2 KB | ~2.8 KB | ~0.25 KB |
| Projected at 1M connections | ~8 GB | ~2.8 GB | ~250 MB |

miraclews vs tokio-tungstenite: **4× throughput, ~33× less RAM.**
miraclews vs fastwebsockets: **3.5× throughput, ~11× less RAM.**

An important honest note: fastwebsockets has some of the fastest WebSocket framing code in Rust. In this workload (many small connections, 32 B frames) the bottleneck is not framing but **task-per-connection scheduling overhead** — which is why fastwebsockets, despite its framing advantage, does not outperform miraclews. In a single-connection bulk-throughput scenario (framing dominant, no scheduling pressure) the comparison would look different. The workload that matters for fleet telemetry or live tracking is the one measured here.

## TLS overhead

Measured separately (200 connections, closed-loop, ws vs wss on the same client):

| Metric | ws (plaintext) | wss (TLS) | delta |
|---|---|---|---|
| Throughput | 504k msg/s | 453k msg/s | ~10% lower |
| p50 | 336 µs | 379 µs | +13% |
| p99 | 1 240 µs | 1 295 µs | +4% |
| RAM/conn (active) | ~0.25 KB | ~4.9 KB | ~20× |

AES-NI keeps the steady-state throughput hit small (~10%; the handshake cost amortizes over the connection lifetime). The RAM cost, however, is ~20× — rustls `ServerConnection` state is ~4.9 KB/conn. For millions of idle connections, terminate TLS at the load balancer and run plaintext internally. For moderate connection counts, in-process `wss://` is practical.
