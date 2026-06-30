# Dedicated-Rig Benchmark — Idle Per-Connection Memory

*Scope: measured for MiracleWS, on a 2-machine real-NIC rig, vs tokio-tungstenite and fastwebsockets under an identical workload on the same hardware.*

**What this establishes:** the idle per-connection **memory** cost of MiracleWS, on a real network interface (not loopback), head-to-head against two common Rust WebSocket stacks. These are the conservative numbers wired into the [cost simulator](../../docs/cost.html).

**What this does NOT establish (yet):** throughput, latency (p99/p99.9), reconnect-storm, slow-client, and a *directly-measured* 1 M plateau. Those are pending a gigabit rig (see "Pending" below) and are **not claimed**.

---

## Rig

Two commodity desktop machines, server + load generator on separate hosts, plain `ws://` over a real NIC. The link negotiated at **100 Mbit** (cable/switch-limited), which makes throughput/latency network-bound — so this session reports **only idle memory**, which is independent of link speed (idle connections carry no traffic). The honest framing is kept throughout: a network-bound rig measures memory cleanly and throughput poorly.

Methodology: the server runs an echo endpoint; the load generator opens N WebSocket connections and holds them idle (zero application traffic). Server memory is sampled from the OS (`/proc/<pid>` RSS and PSS) at each connection plateau. Connection counts beyond the single-source-IP ceiling were re-confirmed in-process via loopback sharding (memory is NIC-independent, so loopback idle memory equals real-NIC idle memory).

---

## Verified — idle per-connection memory

Same rig, same load, idle (no traffic). Server process RSS at each held plateau:

| Held idle connections | MiracleWS | fastwebsockets | tokio-tungstenite |
|---:|---|---|---|
| 10 000 | **5.2 MB** | 44.9 MB | 118.2 MB |
| 20 000 | **7.6 MB** | 103.9 MB | 264.0 MB |
| 50 000 | **14.4 MB** | — | — |
| 100 000 | **26.1 MB** | — | — |
| 200 000 | **45.8 MB** | — | — |

**Per-connection slope (userspace):**

| Stack | KB/connection | vs MiracleWS |
|---|---|---|
| **MiracleWS** | **0.21** (measured) | 1× |
| fastwebsockets | 5.0 | ~24× |
| tokio-tungstenite | 13.0 | ~62× |

MiracleWS's cost is **linear across a 20× range (10 k → 200 k)** with **R² = 0.998** over two independent measurement paths (real NIC + loopback). The task-per-connection competitors grow super-linearly (per-conn cost rises with scale). Reproducibility: the 10 k point was measured twice with **0.15 %** variance.

---

## Extrapolated — 1 M idle connections

*Extrapolated from the measured slope — not a directly-measured plateau.*

| Stack | userspace RSS @ 1 M idle |
|---|---|
| **MiracleWS** | **~0.22 GB** (slope verified to 200 k, i.e. 1/5 of target) |
| fastwebsockets | ~5 GB |
| tokio-tungstenite | ~13 GB |

A direct 1 M run on the loopback rig reached and held 408 k connections at ~80 MB (still on the 0.2 KB/conn slope) before the single-box load generator — not the server, not RAM — became the limit. The server scaled cleanly throughout.

---

## Honest kernel floor

The numbers above are **userspace** (process RSS). The Linux kernel separately holds ~2–3 KB of socket state per idle TCP connection, **the same for every stack**, in kernel memory not counted in process RSS. This was **not measured** here (it needs privileged slab accounting) and remains an **estimate**.

So the two honest headlines:

- **Userspace per-connection memory: 40×+ smaller** than tokio-tungstenite (0.25 KB vs 10 KB conservative).
- **Total host memory** for the same connection count: once the shared, stack-independent kernel floor is added, the advantage compresses to **~4–6×**.

Both are true; we lead with the second for total-cost claims and the first for the engine's userspace footprint.

---

## Conservative values used in the cost simulator

Rounded to *understate* MiracleWS's advantage (ours rounded up, competitors rounded down):

| Constant | Measured | In the model |
|---|---|---|
| MiracleWS userspace/conn | 0.21 KB | 0.25 KB |
| fastwebsockets userspace/conn | 5.0 KB | 4.0 KB |
| tokio-tungstenite userspace/conn | 13.0 KB | 10.0 KB |
| kernel floor/conn | not measured | ~2 KB (estimate) |

---

## Pending (next rig)

Real-NIC throughput, latency (p50/p99/p99.9), reconnect-storm, slow-client backpressure, and a directly-measured 1 M plateau require a **gigabit** link (the current rig is 100 Mbit). The plan is two instances on a gigabit network (a direct cable, or two same-region cloud instances — which also matches the deployment the cost model represents). Those numbers will move from "extrapolated" / "not claimed" to "verified" then.
