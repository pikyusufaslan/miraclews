<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo/logo-wordmark-dark.png">
    <img src="logo/logo-wordmark-light.png" alt="MiracleWS" width="460">
  </picture>
</p>

<p align="center">Dependency-minimal WebSocket server core, in Rust. Built for millions of mostly-idle connections.</p>

<p align="center">
  <img alt="Rust" src="https://img.shields.io/badge/language-Rust-orange?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/license-proprietary-lightgrey?style=flat-square">
</p>

---

## Why

Most WebSocket libraries use a task-per-connection model (~3 KB+ idle RAM per connection) or pull in a third-party framing crate. **miraclews is a thin transport**: you bring the application logic via one `Handler` trait; miraclews owns the sockets, RFC6455 framing, masking, fragmentation, ping/pong/close, and backpressure. There is no async runtime in the hot path — a sharded event loop drives thousands of connections per OS thread with no per-connection task overhead.

## At a glance

- **~85 B idle RAM per connection** (epoll backend, RSS delta at 8 000 idle connections)
- **300 000 concurrent connections sustained on a single machine** (~1.4 KB/conn at that scale, proven in production)
- **1 runtime dependency** — `libc` (FFI declarations only; SHA-1, base64, slab, and the event loop are all first-party code)
- **RFC6455 conformant** — Autobahn TestSuite: 239 OK / 0 FAILED across 246 cases
- **Two I/O backends, one API** — `epoll` (default) and `io_uring` buf-ring; same `Handler` trait for both
- **TLS (`wss://`)** available as a feature flag; plaintext path unaffected at compile or runtime

## Benchmarks

Local loopback, 12-core box, 32 B binary echo round-trips. Numbers are **relative** (load generator and server share the same machine); they measure backend deltas, not absolute capacity. Full methodology and competitor comparison: [BENCH.md](BENCH.md).

| Backend | Throughput | p99 (saturated) | Idle RAM/conn |
|---|---|---|---|
| epoll (raw libc) | ~2.5M msg/s | ~10 ms | ~85 B |
| io_uring (naive) | ~2.7M msg/s | ~8 ms | ~5.5 KB |
| io_uring (buf-ring) | ~2.4M msg/s | ~10 ms | ~107 B |

**Pick buf-ring** for millions of mostly-idle connections (fleet telemetry, live tracking). **Pick naive io_uring** for lowest tail latency at moderate connection counts. **Pick epoll** for the simplest deploy or if io_uring is unavailable.

## The public API

Application code implements one trait. Everything else is handled by miraclews.

```rust
use miraclews::{Config, Handler, Message, Outbox, handshake, serve};
use std::sync::Arc;

struct Echo;
impl Handler for Echo {
    type Conn = ();
    type Worker = ();
    fn new_worker(&self) {}
    fn on_open(&self, _req: &handshake::Request) -> Option<()> { Some(()) }
    fn on_message(&self, _w: &mut (), _c: &mut (), msg: Message<'_>, out: &mut Outbox<'_>) {
        match msg { Message::Text(b) => out.text(b), Message::Binary(b) => out.binary(b) }
    }
}

fn main() {
    serve(Config::new("0.0.0.0:9001"), Arc::new(Echo)).unwrap();
}
```

`type Worker` is per-thread state shared by all connections on that thread — use it for lock-free batching (e.g. accumulate GPS points, flush in `on_tick`). `on_open` receives the upgrade request and returns `None` to reject. `Config` is a builder: `.workers(n)`, `.max_frame(bytes)`, `.flush_interval(dur)`, `.pin_cores(bool)`.

## Evidence

- **Autobahn TestSuite** (cases 1–7, real docker run): 239 OK / 0 FAILED / 4 NON-STRICT / 3 informational.
- **72h WS-core soak** on a dedicated machine: 100 000 connections × 3 days, 0 errors, RSS plateau, p99 894 µs.
- **WebTransport 24h soak**: 2 000 sessions, 86.4 M datagrams, 0 drop, RSS 264 MB → 220 MB plateau (no leak).

Full details: [EVIDENCE.md](EVIDENCE.md).

**Want to verify the numbers?** Raw artifacts and full methodology are in
[`evidence/`](evidence/) (soak CSV + RSS-plateau plot, Autobahn command, benchmark setup) and
[`REPRODUCE.md`](REPRODUCE.md) — machine, kernel tuning, exact commands. Conformance and
competitor benchmarks are independently reproducible; MiracleWS-specific runs are verifiable with
an evaluation build ([`EVALUATION.md`](EVALUATION.md)).

## Architecture

miraclews uses a sharded-reactor model: N OS threads, each with its own `SO_REUSEPORT` listener, epoll/io_uring event loop, and slab, pinned to a CPU core. There are no per-connection async tasks — each thread drives all its connections in a flat event loop. The entire RFC6455 protocol engine lives in a single shared function called by both I/O backends, so behavior is identical regardless of backend. Backpressure is enforced per connection: slow consumers are dropped past a configurable limit.

Full details: [ARCHITECTURE.md](ARCHITECTURE.md).

## Licensing

miraclews is proprietary / closed-source. The source is not distributed. An evaluation is done
with a binary build under an evaluation license — see [`EVALUATION.md`](EVALUATION.md) for what
it includes. For evaluation, licensing, or a pilot, **open an issue** on this repo.

---

<p align="center"><a href="https://pikyusufaslan.github.io/miraclews">pikyusufaslan.github.io/miraclews</a></p>
