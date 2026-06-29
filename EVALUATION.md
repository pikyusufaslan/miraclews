# Evaluation & licensing

MiracleWS is proprietary. The source is not distributed. Evaluation is done with a binary build
under an evaluation license — you can run it, benchmark it, and integrate against it without ever
seeing the source.

## What an evaluation package includes

- **Evaluation binary** — `linux-x86_64`, statically linked (musl), no system dependencies.
- **C ABI header** (`miraclews.h`) — embed the server in a C/C++/Go/any-FFI host.
- **Example echo server** — a ready-to-run binary to point Autobahn or a load client at.
- **Evaluation license** (`LICENSE-EVAL.txt`) — time-boxed, non-production.
- **`SHA256SUMS`** — so a measured binary is tied to an exact build.
- A short **support window** for evaluation questions.

## What you do *not* get

- Source code (`src/`, the reactor, the framing engine, the slab allocator).
- The right to redistribute or use the evaluation build in production.

## Integration surface

Your application implements one `Handler` trait (Rust) or the equivalent C ABI callbacks;
MiracleWS owns the sockets, RFC6455 framing, masking, fragmentation, ping/pong/close, and
backpressure. The public API shape is shown in the [README](README.md#the-public-api).

## How to request access

**Open an issue** on this repository (evaluation request) with your use case and target scale.
Production licensing, pilots, and a source-escrow option are discussed from there.
