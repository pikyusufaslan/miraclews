// Pure cost-model functions for the MiracleWS cost simulator. No DOM, no I/O.
const DEFAULTS = {
  benchCores: 12,            // throughputs below were measured on a 12-core box
  kernelFloorKB: 2,          // estimate: stack-independent kernel/TCP per-conn state
  rustlsKB: 4.9,             // measured: rustls ServerConnection per active conn (TLS in-process)
  usableRamFrac: 0.80,       // estimate: fraction of box RAM usable for connection state
  stacks: {
    // userspaceKB = measured idle RAM/conn (8000-conn bench); throughputMps = M deliveries/s @ benchCores
    miraclews:   { label: "MiracleWS",          userspaceKB: 0.25, throughputMps: 3.0,  tag: "measured" },
    tungstenite: { label: "tokio-tungstenite",  userspaceKB: 8.2,  throughputMps: 0.76, tag: "measured" },
    fastws:      { label: "fastwebsockets",     userspaceKB: 2.8,  throughputMps: 0.86, tag: "measured" },
    nodews:      { label: "Node / ws",          userspaceKB: 8.6,  throughputMps: 0.30, tag: "estimate" },
    socketio:    { label: "Socket.IO",          userspaceKB: 10.0, throughputMps: 0.15, tag: "estimate" },
  },
  boxes: {
    budget:     { label: "Budget",     vcpu: 8,  ramGB: 16, priceMo: 115 },
    production: { label: "Production", vcpu: 16, ramGB: 64, priceMo: 375 }, // DEFAULT
  },
  defaultBox: "production",
  saas: { // ballpark public-tier estimates, 2026-06-29 — editable, verify before sales
    aws:    { label: "AWS API Gateway WS", perMillionMsg: 1.00, perPeakConnMo: 0.0108 },
    ably:   { label: "Ably",               perMillionMsg: 2.50, perPeakConnMo: 0.0 },
    pusher: { label: "Pusher Channels",    perMillionMsg: 2.00, perPeakConnMo: 0.0 },
  },
};

// per-connection RAM (KB) for a stack, including the kernel floor and optional in-process TLS.
function perConnRamKB(stackKey, a) {
  const s = a.stacks[stackKey];
  // Optional per-call override used by the Assumptions panel to preview edits before committing.
  const us = (a.userspaceOverride != null) ? a.userspaceOverride : s.userspaceKB;
  return us + a.kernelFloorKB + (a.tlsInProcess ? a.rustlsKB : 0);
}

// per-box throughput scaled linearly from the bench-core measurement to the box vCPU count.
function boxThroughputMps(stackKey, box, a) {
  return a.stacks[stackKey].throughputMps * (box.vcpu / a.benchCores);
}

function ramBoundServers(conns, perConnKB, box, usableFrac) {
  if (conns <= 0) return 0;
  const boxRamKB = box.ramGB * 1024 * 1024 * usableFrac;
  return Math.ceil((conns * perConnKB) / boxRamKB);
}

function cpuBoundServers(deliveriesPerSec, stackKey, box, a) {
  if (deliveriesPerSec <= 0) return 0;
  const perBox = boxThroughputMps(stackKey, box, a) * 1e6;
  return Math.ceil(deliveriesPerSec / perBox);
}

// workload = { conns, messagesPerSec, fanout, tlsInProcess }
function selfHostedResult(stackKey, workload, a, box) {
  const aWithTls = Object.assign({}, a, { tlsInProcess: workload.tlsInProcess });
  const perConn = perConnRamKB(stackKey, aWithTls);
  const ramSrv = ramBoundServers(workload.conns, perConn, box, a.usableRamFrac);
  const deliveries = workload.messagesPerSec * workload.fanout; // "fanout-adjusted deliveries/sec"
  const cpuSrv = cpuBoundServers(deliveries, stackKey, box, a);
  const servers = Math.max(ramSrv, cpuSrv, (workload.conns > 0 ? 1 : 0));
  return {
    servers,
    monthly: servers * box.priceMo,
    perConnKB: perConn,
    deliveriesPerSec: deliveries,
    bound: ramSrv >= cpuSrv ? "RAM" : "CPU",
  };
}

function saasMonthly(peakConns, messagesPerMonth, pricing) {
  return (messagesPerMonth / 1e6) * pricing.perMillionMsg + peakConns * pricing.perPeakConnMo;
}

// Alias: selfHostedResult and serversFor are the same function (both names appear in the interface spec).
const serversFor = selfHostedResult;

if (typeof module !== "undefined" && module.exports) {
  module.exports = { DEFAULTS, perConnRamKB, boxThroughputMps, ramBoundServers, cpuBoundServers, selfHostedResult, serversFor, saasMonthly };
}
