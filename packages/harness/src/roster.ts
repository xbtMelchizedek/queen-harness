// A local deployer / serial-rugger roster, loaded from a gitignored directory (ROSTER_DIR).
// Looks up a creator or wallet by address and returns public labels and launch/rug stats only.
// Evidence, names and handles in the source files are dropped: they never enter a dossier or a prompt.
// Missing directory or files: an empty roster, never a throw. Nothing here signs, trades or holds a key.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Labels that are a hard veto when they sit on a creator, mint signer, funder or top holder */
export const VETO_LABELS: ReadonlySet<string> = new Set([
  "serial_deployer",
  "serial_rugger",
  "deployer_linked",
  "bundler",
  "lp_rugger",
  "rugger",
]);

/** A serial deployer at or over this rug rate is a hard veto even without a veto label */
export const RUG_RATE_VETO = 0.8;

/** What the dossier and the token card may show of a roster hit: labels and counts, never evidence or identity */
export interface RosterHit {
  address: string;
  chain: string | null;
  labels: string[];
  nLaunches: number | null;
  nRugs: number | null;
  rugRate: number | null;
  /** True when a veto label is present, or rug_rate is at or over RUG_RATE_VETO */
  veto: boolean;
  /** One lowercase line for the dossier, no evidence, no names, no handles */
  reason: string;
}

export interface Roster {
  /** Addresses loaded (unique, after keyOf) */
  size: number;
  /** The directory it was loaded from, or null for an empty in-memory roster */
  dir: string | null;
  lookup(address: string, chain?: string | null): RosterHit | null;
}

interface Row {
  address: string;
  chain: string | null;
  labels: string[];
  nLaunches: number | null;
  nRugs: number | null;
  rugRate: number | null;
}

/** A solana address as written (base58 is case-sensitive); an evm address lower-cased */
export function keyOf(address: string): string {
  const a = address.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) return a.toLowerCase();
  return a;
}

function numOf(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.trim();
  if (s === "" || s.toLowerCase() === "none" || s.toLowerCase() === "null") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function labelsOf(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,|;/\s]+/)) {
    const l = part.trim().toLowerCase();
    if (!l || seen.has(l)) continue;
    seen.add(l);
    out.push(l);
  }
  return out;
}

function isVeto(labels: readonly string[], rugRate: number | null): boolean {
  if (labels.some((l) => VETO_LABELS.has(l))) return true;
  return rugRate !== null && rugRate >= RUG_RATE_VETO;
}

function reasonOf(row: Row, role: string | null): string {
  const who = role ? `its ${role} is labeled` : "labeled";
  const labs = row.labels.length ? row.labels.join(", ") : "known deployer";
  const bits: string[] = [];
  if (row.nLaunches !== null) bits.push(`${row.nLaunches} launch${row.nLaunches === 1 ? "" : "es"}`);
  if (row.nRugs !== null) bits.push(`${row.nRugs} rug${row.nRugs === 1 ? "" : "s"}`);
  if (row.rugRate !== null) bits.push(`rug rate ${trimRate(row.rugRate)}`);
  const stats = bits.length ? `, ${bits.join(", ")}` : "";
  const veto = isVeto(row.labels, row.rugRate) ? " (hard veto)" : "";
  return `local roster: ${who} ${labs}${stats}${veto}`;
}

function trimRate(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const t = Math.round(n * 1000) / 1000;
  return String(t);
}

function hitOf(row: Row, role: string | null = null): RosterHit {
  return {
    address: row.address,
    chain: row.chain,
    labels: row.labels,
    nLaunches: row.nLaunches,
    nRugs: row.nRugs,
    rugRate: row.rugRate,
    veto: isVeto(row.labels, row.rugRate),
    reason: reasonOf(row, role),
  };
}

/** Merge a new row into an existing one: union of labels, prefer numeric stats that are present */
function mergeRow(into: Row, add: Row): void {
  const seen = new Set(into.labels);
  for (const l of add.labels) {
    if (!seen.has(l)) {
      seen.add(l);
      into.labels.push(l);
    }
  }
  if (into.nLaunches === null && add.nLaunches !== null) into.nLaunches = add.nLaunches;
  if (into.nRugs === null && add.nRugs !== null) into.nRugs = add.nRugs;
  if (into.rugRate === null && add.rugRate !== null) into.rugRate = add.rugRate;
  if (add.nLaunches !== null && into.nLaunches !== null && add.nLaunches > into.nLaunches) into.nLaunches = add.nLaunches;
  if (add.nRugs !== null && into.nRugs !== null && add.nRugs > into.nRugs) into.nRugs = add.nRugs;
  if (add.rugRate !== null && into.rugRate !== null && add.rugRate > into.rugRate) into.rugRate = add.rugRate;
  if (!into.chain && add.chain) into.chain = add.chain;
}

/** RFC 4180-ish row split: quoted fields may hold commas and doubled quotes */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let q = false;
  while (i < line.length) {
    const c = line[i]!;
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        q = false;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      q = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      out.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  out.push(cur);
  return out;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function loadDeployersCsv(text: string, map: Map<string, Row>): void {
  const lines = text.split(/\n/);
  if (lines.length === 0) return;
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.trim().toLowerCase());
  const idx = (name: string): number => header.indexOf(name);
  const iAddr = idx("address");
  if (iAddr < 0) return;
  const iChain = idx("chain");
  const iLabels = idx("labels");
  const iLaunches = idx("n_launches");
  const iRugs = idx("n_rugs");
  const iRate = idx("rug_rate");
  // evidence, name, handle, source, best_mult are read so the column count is right, then dropped
  for (let n = 1; n < lines.length; n++) {
    const raw = lines[n]!.trim();
    if (raw === "" || raw.startsWith("#")) continue;
    const cols = splitCsvLine(lines[n]!);
    const address = (cols[iAddr] ?? "").trim();
    if (!address) continue;
    const row: Row = {
      address,
      chain: iChain >= 0 ? (cols[iChain] ?? "").trim() || null : null,
      labels: iLabels >= 0 ? labelsOf(cols[iLabels] ?? "") : [],
      nLaunches: iLaunches >= 0 ? numOf(cols[iLaunches]) : null,
      nRugs: iRugs >= 0 ? numOf(cols[iRugs]) : null,
      rugRate: iRate >= 0 ? numOf(cols[iRate]) : null,
    };
    const k = keyOf(address);
    const had = map.get(k);
    if (had) mergeRow(had, row);
    else map.set(k, row);
  }
}

/** serial_deployers.txt: address,chain,labels...,launches,rug_rate (labels may be several unquoted fields) */
function loadSerialTxt(text: string, map: Map<string, Row>): void {
  for (const line of text.split(/\n/)) {
    const raw = line.trim();
    if (raw === "" || raw.startsWith("#")) continue;
    const parts = splitCsvLine(raw).map((p) => p.trim());
    if (parts.length < 3) continue;
    const address = parts[0] ?? "";
    if (!address) continue;
    const chain = (parts[1] ?? "").trim() || null;
    let labelsRaw: string;
    let launches: string | undefined;
    let rate: string | undefined;
    if (parts.length === 3) {
      labelsRaw = parts[2] ?? "";
    } else if (parts.length === 4) {
      labelsRaw = parts[2] ?? "";
      launches = parts[3];
    } else {
      labelsRaw = parts.slice(2, -2).join(",");
      launches = parts[parts.length - 2];
      rate = parts[parts.length - 1];
    }
    const row: Row = {
      address,
      chain,
      labels: labelsOf(labelsRaw),
      nLaunches: numOf(launches),
      nRugs: null,
      rugRate: numOf(rate),
    };
    if (row.labels.length === 0) row.labels.push("serial_deployer");
    const k = keyOf(address);
    const had = map.get(k);
    if (had) mergeRow(had, row);
    else map.set(k, row);
  }
}

function loadJsonl(text: string, map: Map<string, Row>): void {
  for (const line of text.split(/\n/)) {
    const raw = line.trim();
    if (raw === "" || raw.startsWith("#")) continue;
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    if (typeof o.address !== "string" || !o.address.trim()) continue;
    const labels = Array.isArray(o.labels)
      ? labelsOf(o.labels.filter((x): x is string => typeof x === "string").join(","))
      : typeof o.labels === "string"
        ? labelsOf(o.labels)
        : [];
    const row: Row = {
      address: o.address.trim(),
      chain: typeof o.chain === "string" && o.chain.trim() ? o.chain.trim() : null,
      labels,
      nLaunches: typeof o.n_launches === "number" ? o.n_launches : numOf(typeof o.n_launches === "string" ? o.n_launches : undefined),
      nRugs: typeof o.n_rugs === "number" ? o.n_rugs : numOf(typeof o.n_rugs === "string" ? o.n_rugs : undefined),
      rugRate: typeof o.rug_rate === "number" ? o.rug_rate : numOf(typeof o.rug_rate === "string" ? o.rug_rate : undefined),
    };
    const k = keyOf(row.address);
    const had = map.get(k);
    if (had) mergeRow(had, row);
    else map.set(k, row);
  }
}


function sameChain(rowChain: string | null, want: string | null | undefined): boolean {
  if (!want || !rowChain) return true;
  const a = rowChain.toLowerCase();
  const b = want.toLowerCase();
  if (a === b) return true;
  // an evm address is the same account on every evm chain; solana never matches evm
  return a !== "solana" && b !== "solana";
}

function lookupRow(map: Map<string, Row>, address: string, chain?: string | null): RosterHit | null {
  const row = map.get(keyOf(address));
  if (!row) return null;
  if (!sameChain(row.chain, chain)) return null;
  return hitOf(row);
}

function emptyRoster(): Roster {
  return { size: 0, dir: null, lookup: () => null };
}

/** Load a roster from a directory of deployers.csv, serial_deployers.txt and/or roster.jsonl. Empty when missing. */
export function loadRoster(dir: string | null | undefined): Roster {
  if (!dir || dir.trim() === "") return emptyRoster();
  const root = dir.trim();
  if (!existsSync(root)) return emptyRoster();
  const map = new Map<string, Row>();
  let names: string[] = [];
  try {
    names = readdirSync(root);
  } catch {
    return emptyRoster();
  }
  const want = new Set(["deployers.csv", "serial_deployers.txt", "roster.jsonl"]);
  for (const name of names) {
    if (!want.has(name)) continue;
    const text = readText(join(root, name));
    if (text === null) continue;
    if (name.endsWith(".csv")) loadDeployersCsv(text, map);
    else if (name.endsWith(".jsonl")) loadJsonl(text, map);
    else loadSerialTxt(text, map);
  }
  return {
    size: map.size,
    dir: root,
    lookup(address: string, chain?: string | null): RosterHit | null {
      return lookupRow(map, address, chain);
    },
  };
}

/** Build a roster from rows in memory (tests): still strips anything but labels and counts */
export function rosterFromRows(
  rows: readonly {
    address: string;
    chain?: string | null;
    labels: readonly string[];
    nLaunches?: number | null;
    nRugs?: number | null;
    rugRate?: number | null;
  }[],
): Roster {
  const map = new Map<string, Row>();
  for (const r of rows) {
    const row: Row = {
      address: r.address,
      chain: r.chain ?? null,
      labels: labelsOf(r.labels.join(",")),
      nLaunches: r.nLaunches ?? null,
      nRugs: r.nRugs ?? null,
      rugRate: r.rugRate ?? null,
    };
    const k = keyOf(row.address);
    const had = map.get(k);
    if (had) mergeRow(had, row);
    else map.set(k, row);
  }
  return {
    size: map.size,
    dir: null,
    lookup(address: string, chain?: string | null): RosterHit | null {
      return lookupRow(map, address, chain);
    },
  };
}

export function loadRosterFromEnv(env: NodeJS.ProcessEnv = process.env): Roster {
  return loadRoster(env.ROSTER_DIR?.trim() || null);
}

/**
 * Word a hit for a known role (creator, wallet) so the dossier says who was labeled.
 * The hit's own reason assumes no role; this only changes the clause, never adds evidence.
 */
export function hitForRole(hit: RosterHit, role: string): RosterHit {
  const row: Row = {
    address: hit.address,
    chain: hit.chain,
    labels: hit.labels,
    nLaunches: hit.nLaunches,
    nRugs: hit.nRugs,
    rugRate: hit.rugRate,
  };
  return hitOf(row, role);
}
