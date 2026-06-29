# Reproducing the numbers

MiracleWS is closed-source, so the full build can't be reproduced by a third party — but the
**methodology, machine, tuning, and commands are disclosed in full**, the conformance and
competitor benchmarks run against public software, and MiracleWS-specific runs are verifiable
with an evaluation build (see [`EVALUATION.md`](EVALUATION.md)). Nothing here is a number you
have to take on faith without a way to check it.

## Machine

- **Benchmarks:** 12-core Linux x86_64, loopback, load generator + server sharing the CPU
  (numbers are relative — see [`evidence/bench/`](evidence/bench/)).
- **Dedicated soak (72h / 100k):** separate dedicated box, AMD Ryzen 5 1600 / 8 GB RAM.
- **Kernel:** 5.19+ required for the io_uring backend (falls back to epoll otherwise).

## Host tuning used

```ini
# /etc/security/limits.d — file descriptors
*  soft  nofile  1048576
*  hard  nofile  1048576

# /etc/sysctl.d/99-miraclews.conf
net.core.somaxconn        = 65535
net.ipv4.tcp_fastopen     = 3
net.ipv4.tcp_tw_reuse     = 1
net.ipv4.tcp_keepalive_time   = 60
net.ipv4.tcp_keepalive_intvl  = 15
net.ipv4.tcp_keepalive_probes = 4
net.core.rmem_max         = 16777216
net.core.wmem_max         = 16777216
# tcp_congestion_control = bbr
```
Worker threads are pinned to cores (`Config::pin_cores(true)`); on large NUMA hosts, reserve
worker cores via kernel boot params.

## What you can reproduce yourself

| Claim | Reproducible? | How |
|---|---|---|
| RFC6455 conformance (239/0) | **Fully** | Autobahn|TestSuite via Docker against any WS server — [`evidence/autobahn/`](evidence/autobahn/) |
| vs tokio-tungstenite / fastwebsockets | **Fully** | public crates, same load client, identical scenario — [`evidence/bench/`](evidence/bench/) |
| No leak under sustained churn | **Inspect raw data** | [`evidence/soak/overnight.csv`](evidence/soak/overnight.csv) — 10h, ~14.8M connection cycles, flat RSS, 0 panics |
| MiracleWS throughput / idle-RAM / p99 | **With an eval build** | request an evaluation binary — [`EVALUATION.md`](EVALUATION.md) |

## Soak harness shape

The soak logs one CSV row every ~300 s with the columns documented in
[`evidence/soak/README.md`](evidence/soak/README.md) (RSS, fd, cpu, active conns, accepted/closed,
p50/p99, and error/panic counters). RSS flat from first to last sample = no leak.

## Version

MiracleWS 0.1.0. Evaluation builds are stamped with a binary SHA-256 (see `EVALUATION.md`) so a
measured binary can be tied to a specific build.
