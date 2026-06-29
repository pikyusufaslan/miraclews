# Benchmark evidence — methodology & commands

All throughput/latency numbers come from one setup, disclosed in full so they can be judged
and reproduced.

## Machine & method

- **12-core Linux x86_64**, loopback transport, **32 B binary echo round-trips**.
- Load generator and server **share the same machine and split the CPU** → numbers are
  **relative** (good for backend-vs-backend and vs-competitor under identical conditions, not
  for projecting absolute single-box capacity, where load generation runs on separate hardware).
- Fixed scenario across comparisons: **2,000 connections, pipeline depth 8, 6 workers.**

## Backend comparison

| Backend | Throughput | p99 (saturated) | Idle RAM/conn |
|---|---|---|---|
| epoll (raw libc) | ~2.5M msg/s | ~10 ms | ~85 B |
| io_uring (naive) | ~2.7M msg/s | ~8 ms | ~5.5 KB |
| io_uring (buf-ring) | ~2.4M msg/s | ~10 ms | ~107 B |

## Competitor comparison (same machine, same harness)

| Metric | tokio-tungstenite | fastwebsockets | MiracleWS |
|---|---|---|---|
| Throughput | 758k msg/s | 862k msg/s | 3.02M msg/s |
| p99 saturated | 48.5 ms | 49.3 ms | ~7.5 ms |
| Idle RAM/conn (8k conns) | ~8.2 KB | ~2.8 KB | ~0.25 KB |
| Projected @ 1M conns | ~8 GB | ~2.8 GB | ~250 MB |

→ **vs tokio-tungstenite: 4.0× throughput, ~33× less RAM. vs fastwebsockets: 3.5× throughput,
~11× less RAM.** Competitors are run from the same load client under identical conditions;
tokio-tungstenite and fastwebsockets are public crates, so this comparison is independently
reproducible.

Honest note: fastwebsockets has some of the fastest framing code in Rust. In this workload
(many small connections, 32 B frames) the bottleneck is task-per-connection scheduling, not
framing — which is why MiracleWS's sharded, task-free model wins here. A single-connection bulk
benchmark (framing-dominant) would look different; that is not the fleet-telemetry workload.

## Reproducing

The competitor harness (echo servers + the shared load client) and the soak runner are the same
ones used to produce these numbers. Backend and competitor comparisons against the public crates
are fully reproducible; MiracleWS-specific runs use an evaluation build (see
[`../../EVALUATION.md`](../../EVALUATION.md)). Full machine/kernel/command detail:
[`../../REPRODUCE.md`](../../REPRODUCE.md).
