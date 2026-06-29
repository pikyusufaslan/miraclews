const assert = require("assert");
const M = require("./cost-model.js");
const A = M.DEFAULTS;
const prod = A.boxes.production;

// Scenario: 1M conns, 100k msg/s, fanout 5, no TLS, Production box.
const wl = { conns: 1_000_000, messagesPerSec: 100_000, fanout: 5, tlsInProcess: false };

// per-conn RAM includes kernel floor:
assert.strictEqual(M.perConnRamKB("miraclews", Object.assign({}, A, {tlsInProcess:false})), 0.25 + 2);   // 2.25 KB
assert.strictEqual(M.perConnRamKB("tungstenite", Object.assign({}, A, {tlsInProcess:false})), 8.2 + 2);  // 10.2 KB

// RAM-bound servers (Production = 64GB * 0.8 = 52428.8 MB usable = 53687091.2 KB):
const mw = M.selfHostedResult("miraclews", wl, A, prod);
const tt = M.selfHostedResult("tungstenite", wl, A, prod);
// 1e6 * 2.25 / (64*1024*1024*0.8) = 2.25e6 / 53687091.2 = 0.0419 -> ceil 1; CPU: 5e5/(3.0*16/12*1e6)=5e5/4e6=0.125 -> ceil 1
assert.strictEqual(mw.servers, 1);
// tungstenite RAM: 1e6*10.2/53687091.2 = 0.19 -> 1; CPU: 5e5/(0.76*16/12*1e6)=5e5/1.013e6=0.49 -> 1
assert.strictEqual(tt.servers, 1);
// saving exists at larger scale — bump conns to make RAM dominate:
const big = { conns: 50_000_000, messagesPerSec: 100_000, fanout: 5, tlsInProcess: false };
const mwB = M.selfHostedResult("miraclews", big, A, prod);
const ttB = M.selfHostedResult("tungstenite", big, A, prod);
assert.ok(ttB.servers > mwB.servers, "tungstenite needs more servers at 50M conns");
assert.strictEqual(mwB.bound, "RAM");

// kernel-floor inclusion changes the ratio (floor=0 widens the gap):
const noFloor = Object.assign({}, A, { kernelFloorKB: 0 });
const mwNF = M.selfHostedResult("miraclews", big, A, prod).servers;
const mwNF0 = M.selfHostedResult("miraclews", big, noFloor, prod).servers;
assert.ok(mwNF >= mwNF0, "kernel floor only ever raises or holds the server count");

// TLS toggle raises per-conn RAM:
const tlsWl = Object.assign({}, big, { tlsInProcess: true });
assert.ok(M.selfHostedResult("miraclews", tlsWl, A, prod).servers >= mwB.servers);

// CPU-bound switch: tiny conns, huge deliveries -> CPU dominates:
const cpuWl = { conns: 1000, messagesPerSec: 50_000_000, fanout: 10, tlsInProcess: false };
assert.strictEqual(M.selfHostedResult("miraclews", cpuWl, A, prod).bound, "CPU");

// Edge: zero connections:
assert.strictEqual(M.selfHostedResult("miraclews", {conns:0,messagesPerSec:0,fanout:1,tlsInProcess:false}, A, prod).servers, 0);

// SaaS monthly:
assert.strictEqual(M.saasMonthly(100000, 1_000_000_000, A.saas.aws), (1e9/1e6)*1.00 + 100000*0.0108); // 1000 + 1080 = 2080
console.log("cost-model: ALL PASS");
