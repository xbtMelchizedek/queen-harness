// The local roster loader: labels and counts only, evidence and names never leak, missing dirs are empty.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  hitForRole,
  keyOf,
  loadRoster,
  loadRosterFromEnv,
  rosterFromRows,
  RUG_RATE_VETO,
  splitCsvLine,
  VETO_LABELS,
} from "../src/roster.ts";
import { applyRoster, tokenChecks, type ScanFacts } from "../src/scan.ts";

const SOL = "CoinMint1111111111111111111111111111111pump";
const DEV = "DevWallet111111111111111111111111111111111";
const EVM = "0xAbCdEf0123456789aBcDeF0123456789aBcDeF01";

function tokenFacts(o: Partial<ScanFacts> & { creator?: string | null } = {}): ScanFacts {
  const { creator, ...rest } = o;
  return {
    kind: "token",
    chain: "solana",
    symbol: "test",
    resolved: "address",
    via: null,
    address: SOL,
    market: null,
    authorities: null,
    program: null,
    security: null,
    holders: null,
    dev: creator ? { found: true, ageDays: 1, gotPct: 5, holdsPct: 5, creator } : null,
    wallet: null,
    flags: [],
    goods: [],
    notes: [],
    unreliable: [],
    results: [],
    calls: [],
    ...rest,
  };
}

describe("roster: keys and csv", () => {
  it("evm addresses are lower-cased; solana stays as written", () => {
    assert.equal(keyOf(EVM), EVM.toLowerCase());
    assert.equal(keyOf(DEV), DEV);
  });

  it("splitCsvLine keeps commas inside quotes and doubled quotes", () => {
    assert.deepEqual(splitCsvLine('a,b,"c,d",e'), ["a", "b", "c,d", "e"]);
    assert.deepEqual(splitCsvLine('a,"he said ""hi""",b'), ["a", 'he said "hi"', "b"]);
  });
});

describe("roster: load from a directory", () => {
  it("loads deployers.csv and serial_deployers.txt, drops evidence and names, marks vetoes", () => {
    const dir = mkdtempSync(join(tmpdir(), "roster-"));
    writeFileSync(
      join(dir, "deployers.csv"),
      [
        "address,chain,labels,name,handle,source,evidence,n_launches,n_rugs,rug_rate,best_mult",
        `${DEV},solana,"deployer,serial_deployer",secretname,x:@hidden,walletdb,"Top-25: 171,195 deploys. NEVER APE.",12,11,0.92,2.3`,
        `Repeat11111111111111111111111111111111111,solana,repeat_deployer,,,,walletgraph,4,1,0.25,1.1`,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(dir, "serial_deployers.txt"),
      ["# comment", "OtherSerial1111111111111111111111111111111,solana,serial_deployer,None,None"].join("\n"),
      "utf8",
    );
    const roster = loadRoster(dir);
    assert.equal(roster.size, 3);

    const hit = roster.lookup(DEV);
    assert.ok(hit);
    assert.equal(hit.veto, true);
    assert.ok(hit.labels.includes("serial_deployer"));
    assert.equal(hit.nLaunches, 12);
    assert.equal(hit.nRugs, 11);
    assert.equal(hit.rugRate, 0.92);
    assert.match(hit.reason, /hard veto/);
    assert.match(hit.reason, /serial_deployer/);
    const blob = JSON.stringify(hit);
    assert.doesNotMatch(blob, /secretname/);
    assert.doesNotMatch(blob, /@hidden/);
    assert.doesNotMatch(blob, /NEVER APE/);
    assert.doesNotMatch(blob, /171,195/);
    assert.doesNotMatch(blob, /evidence/);

    assert.equal(roster.lookup("OtherSerial1111111111111111111111111111111")?.veto, true);
    const soft = roster.lookup("Repeat11111111111111111111111111111111111");
    assert.ok(soft);
    assert.equal(soft.veto, false);
    assert.ok(soft.labels.includes("repeat_deployer"));
  });

  it("a missing directory or empty env is an empty roster, not a throw", () => {
    const missing = loadRoster("/no/such/roster-dir-ever");
    assert.equal(missing.size, 0);
    assert.equal(missing.lookup(DEV), null);
    assert.equal(loadRoster(null).size, 0);
    assert.equal(loadRosterFromEnv({}).size, 0);
  });

  it("serial lines may carry several unquoted label fields before the counts", () => {
    const dir = mkdtempSync(join(tmpdir(), "roster-"));
    writeFileSync(join(dir, "serial_deployers.txt"), `${EVM},robinhood,serial_deployer,lp_rugger,None,None\n`, "utf8");
    const hit = loadRoster(dir).lookup(EVM.toLowerCase());
    assert.ok(hit);
    assert.ok(hit.labels.includes("serial_deployer"));
    assert.ok(hit.labels.includes("lp_rugger"));
    assert.equal(hit.veto, true);
    assert.equal(loadRoster(dir).lookup(EVM)?.address.toLowerCase(), EVM.toLowerCase());
  });

  it("roster.jsonl loads, and a high rug rate without a veto label is still a veto", () => {
    const dir = mkdtempSync(join(tmpdir(), "roster-"));
    writeFileSync(
      join(dir, "roster.jsonl"),
      JSON.stringify({
        address: DEV,
        chain: "solana",
        labels: ["repeat_deployer"],
        n_launches: 20,
        n_rugs: 18,
        rug_rate: 0.9,
        evidence: "should never appear",
        name: "hidden",
      }) + "\n",
      "utf8",
    );
    const hit = loadRoster(dir).lookup(DEV);
    assert.ok(hit);
    assert.equal(hit.veto, true);
    assert.ok(hit.rugRate !== null && hit.rugRate >= RUG_RATE_VETO);
    assert.doesNotMatch(JSON.stringify(hit), /should never appear/);
    assert.doesNotMatch(JSON.stringify(hit), /hidden/);
  });
});

describe("roster: dossier wiring", () => {
  it("applyRoster flags a serial creator as a hard veto and tokenChecks lists it first among danger", () => {
    const facts = tokenFacts({ creator: DEV });
    const roster = rosterFromRows([
      { address: DEV, chain: "solana", labels: ["serial_deployer"], nLaunches: 12, nRugs: 11, rugRate: 0.92 },
    ]);
    applyRoster(facts, roster);
    assert.ok(facts.roster);
    assert.equal(facts.roster.veto, true);
    assert.match(facts.roster.reason, /creator/);
    assert.ok(facts.flags.some((f) => f.includes("serial_deployer") && f.includes("hard veto")));
    const checks = tokenChecks(facts);
    assert.equal(checks[0]?.label, "roster");
    assert.equal(checks[0]?.status, "bad");
    assert.doesNotMatch(JSON.stringify(facts.roster), /evidence|@|hidden/i);
  });

  it("a non-veto label is a warning, not a flag, and applyRoster is idempotent", () => {
    const facts = tokenFacts({ creator: DEV });
    const roster = rosterFromRows([{ address: DEV, chain: "solana", labels: ["repeat_deployer"], nLaunches: 4, rugRate: 0.25 }]);
    applyRoster(facts, roster);
    applyRoster(facts, roster);
    assert.equal(facts.flags.filter((f) => f.startsWith("local roster:")).length, 0);
    assert.equal(facts.notes.filter((n) => n.startsWith("local roster:")).length, 1);
    assert.equal(facts.roster?.veto, false);
    assert.equal(tokenChecks(facts).find((c) => c.label === "roster")?.status, "warn");
  });

  it("a wallet scan looks up the wallet itself; a miss leaves the dossier unchanged", () => {
    const facts = tokenFacts({ kind: "wallet", address: DEV, dev: null, chain: "solana" });
    const roster = rosterFromRows([{ address: DEV, chain: "solana", labels: ["serial_rugger"] }]);
    applyRoster(facts, roster);
    assert.equal(facts.roster?.veto, true);
    assert.match(facts.roster?.reason ?? "", /wallet/);
    const clean = tokenFacts({ creator: "Unknown11111111111111111111111111111111111" });
    applyRoster(clean, roster);
    assert.equal(clean.roster, null);
    assert.equal(clean.flags.length, 0);
  });

  it("hitForRole only changes the clause", () => {
    const hit = rosterFromRows([{ address: DEV, labels: ["bundler"] }]).lookup(DEV);
    assert.ok(hit);
    assert.equal(hitForRole(hit, "creator").veto, true);
    assert.match(hitForRole(hit, "creator").reason, /creator is labeled bundler/);
    assert.ok(VETO_LABELS.has("bundler"));
  });
});
