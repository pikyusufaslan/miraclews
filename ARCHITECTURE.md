# miraclews — Architecture

## Overview

miraclews is a **sharded-reactor WebSocket server**. N identical OS threads each own a slice of the connection space: their own `SO_REUSEPORT` listener, their own event loop (epoll or io_uring), and their own slab allocator. There are no per-connection async tasks. A single thread drives all of its connections in a flat event loop.

```
                    Clients (millions)
                           |
    +----------------------+----------------------+
    |      SO_REUSEPORT (kernel distributes)      |
+---+---+  +---+---+  +---+---+       +---+---+
|Worker0|  |Worker1|  |Worker2|  ...  |WorkerN|
| epoll |  | epoll |  | epoll |       | epoll |   N = CPU cores
|/uring |  |/uring |  |/uring |       |/uring |   each:
| slab  |  | slab  |  | slab  |       | slab  |    - own listener (SO_REUSEPORT)
+-------+  +-------+  +-------+       +-------+    - own event loop
                           |                        - pinned to a core
                           v                        - no per-conn task
         Handler::on_message(worker, conn, msg, outbox)
              ^--- your application code goes here
```

## Key design decisions

### Sharded, not task-per-connection

Each worker is an OS thread pinned to a CPU core via `sched_setaffinity`. The kernel distributes incoming connections across workers via `SO_REUSEPORT` — no coordination needed between threads at accept time. This eliminates the ~3 KB per-connection overhead that async task-per-connection models incur, and keeps each worker's working set cache-local.

### Two I/O backends, one protocol engine

The RFC6455 framing and state machine live in a single shared function. Both the epoll backend and the io_uring backend call through this same function. Behavior is therefore identical regardless of which backend is active, and protocol correctness is maintained in one place.

**epoll backend (default):** The event loop is implemented entirely with raw OS syscalls — no third-party event loop crate. This is the simplest backend and has the lowest idle RAM footprint (~85 B/conn).

**io_uring buf-ring backend (`uring` feature):** Uses a per-worker shared buffer pool registered with the kernel. When data arrives the kernel selects a buffer from the pool; no per-connection receive buffer is needed. This recovers the idle RAM advantage of the epoll backend (~107 B/conn) while keeping the io_uring I/O model. At startup, `serve()` probes io_uring availability and falls back to epoll silently if the kernel does not support it.

### Zero-alloc hot path

Single-frame messages are parsed and unmasked directly in the receive buffer — no copy, no heap allocation per frame. The `Handler::on_message` callback receives a slice into that buffer. Fragmented messages (rare) use a separate allocation path.

### Backpressure

Every connection has a per-connection outbound buffer. If a write would block, the unsent bytes remain in the buffer and the connection registers for write-readiness. If the buffer exceeds the configured `backpressure_limit` (default 4 MB), the connection is closed — this prevents a single slow consumer from exhausting memory.

A per-wake read budget (256 KB by default) prevents one active connection from starving others on the same worker.

### Panic isolation

Handler callbacks are guarded with `catch_unwind`. A panic in `on_message` closes only the connection that triggered it; the worker and all other connections survive. The worker loop itself has a supervisor that respawns a crashed worker with a short backoff.

## ASCII reactor diagram

```
  +-----------+     SO_REUSEPORT
  |  Listener |  <-----------------+
  +-----------+                    |
       |  accept                   |
       v                           |
  +--------------------+           |
  |  Event loop        |           |  (repeated N times,
  |  (epoll/io_uring)  |           |   one per CPU core)
  +--------------------+           |
       |  readable                 |
       v                           |
  +---------------------+          |
  |  Protocol engine    |          |
  |  - read frames      |          |
  |  - unmask in place  |          |
  |  - RFC6455 state    |          |
  +---------------------+          |
       |  on_message               |
       v                           |
  +---------------------+          |
  |  Handler (your code)|          |
  |  Worker (per-thread)|          |
  |  Conn   (per-conn)  |          |
  |  Outbox (write buf) |          |
  +---------------------+          |
       |  flush outbox             |
       v                           |
  +---------------------+          |
  |  Write / backpressure-----------+
  +---------------------+
```

## Idle memory profile

At idle (post-handshake, no traffic) each connection occupies roughly:

- The connection struct: ~80 bytes
- Receive buffer (shrunk after handshake): ~64 bytes
- Outbound buffer (shrunk to zero after each flush): 0 bytes

Total at idle: **~144 bytes** measured; RSS delta over 8 000 idle connections rounds to **~85 B/conn**.

The io_uring buf-ring backend shares buffer pool memory across connections rather than allocating per connection, achieving a similar idle footprint (~107 B/conn) at the cost of a fixed per-worker pool (~8 MB per worker, lazily faulted).

## Feature flags

| Feature | Description |
|---|---|
| `uring` | io_uring backend (Linux 5.19+, falls back to epoll) |
| `tls` | `wss://` support via rustls |
| `jemalloc` | jemalloc global allocator (recommended for musl/production) |

## Dependency footprint

Default build: **one runtime dependency** — `libc` (OS syscall declarations). SHA-1, base64, the slab allocator, and the event loop are all first-party code. Optional features add `io-uring` and/or `rustls`, both MIT/Apache. No GPL or copyleft in the dependency tree.
