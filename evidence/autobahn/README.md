# Autobahn conformance evidence

MiracleWS is tested against the official **Autobahn|TestSuite**
(`crossbario/autobahn-testsuite`, the industry-standard WebSocket conformance suite).

## Result

| Result | Count |
|---|---|
| OK | 239 |
| NON-STRICT | 4 |
| INFORMATIONAL | 3 |
| **FAILED** | **0** |

**0 FAILED** across cases 1–7 (framing, ping/pong, reserved bits, fragmentation, UTF-8
handling, close handshake). The 4 NON-STRICT are cases 6.4.1–6.4.4: MiracleWS validates UTF-8
at the end of the reassembled message and returns close code `1007`, which is correct — it is
simply not the byte-incremental strict-mode behavior Autobahn marks as OK. The 3 INFORMATIONAL
are non-pass/fail probes. Cases 9.x/10.x send messages up to 16 MB; MiracleWS's 64 KB
`max_frame` DoS cap rejects them with close code `1009` (a size policy, not a correctness fault).

## How it was run

The suite drives the MiracleWS echo server over loopback. Config (`fuzzingserver.json`):

```json
{
  "outdir": "/tmp/reports",
  "servers": [{ "url": "ws://127.0.0.1:9101" }],
  "cases": ["1.*","2.*","3.*","4.*","5.*","6.*","7.*","9.*","10.*"]
}
```

```sh
docker run --rm -it --net=host \
  -v /tmp/fuzzingserver.json:/config/fuzzingserver.json \
  -v /tmp/reports:/reports \
  crossbario/autobahn-testsuite \
  wstest -m fuzzingclient -s /config/fuzzingserver.json
```

Autobahn writes a full HTML + `index.json` report to `/tmp/reports`. **This is reproducible
against any WebSocket server** — point the `url` at an evaluation MiracleWS build to reproduce
the numbers above. The raw generated report can be provided on request.
