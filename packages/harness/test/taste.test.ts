// Our taste layer sits in the system prompt, and the model endpoint can point at a local adapter.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadHarnessConfig, loadLlmConfig } from "../src/config.ts";
import { HARNESS_GUARDED, harnessSystem } from "../src/harness.ts";
import { TASTE, tastePrompt } from "../src/taste.ts";

describe("taste: the prompt layer", () => {
  it("states the voice and the hard vetoes, and never tells the model to trade", () => {
    const text = tastePrompt();
    assert.equal(text, TASTE);
    assert.match(text, /verdict first/i);
    assert.match(text, /numbers as the dossier and the functions returned them/);
    assert.match(text, /worst first/);
    assert.match(text, /no shilling/);
    assert.match(text, /fail-closed/);
    assert.match(text, /serial_deployer/);
    assert.match(text, /hard vetoes/);
    assert.match(text, /no call to buy, sell, hold or ape/);
    assert.doesNotMatch(text, /\b(kelly|ticket|sizing floor|\$8|\$10|\$50)\b/);
    assert.doesNotMatch(text, /sign a (tx|transaction)|private key|seed phrase/i);
  });

  it("harnessSystem includes the taste layer after voice, and the leak guard covers it", () => {
    const sys = harnessSystem("q-test-0000");
    assert.match(sys, /^\[q-test-0000\]/);
    assert.match(sys, /fork of crawlnet's queen harness/);
    assert.match(sys, /verdict first/);
    assert.match(sys, /fail-closed/);
    assert.ok(sys.indexOf("\nvoice and format\n") < sys.indexOf("\nour taste\n"));
    assert.ok(sys.indexOf("\nour taste\n") < sys.indexOf("\nhard rules\n"));
    assert.ok(HARNESS_GUARDED.includes(TASTE));
  });
});

describe("taste: model endpoint", () => {
  it("LLM_BASE_URL wins; LLM_ADAPTER_URL is the alias for a local or self-hosted adapter", () => {
    const viaAdapter = loadLlmConfig({ LLM_ADAPTER_URL: "http://127.0.0.1:8080/v1/", LLM_MODEL: "qwen3-8b-local" });
    assert.equal(viaAdapter.baseUrl, "http://127.0.0.1:8080/v1");
    assert.equal(viaAdapter.model, "qwen3-8b-local");
    const viaBase = loadLlmConfig({
      LLM_BASE_URL: "https://openrouter.ai/api/v1",
      LLM_ADAPTER_URL: "http://127.0.0.1:8080/v1",
      LLM_MODEL: "ignored-if-base",
    });
    assert.equal(viaBase.baseUrl, "https://openrouter.ai/api/v1");
    const def = loadLlmConfig({});
    assert.equal(def.baseUrl, "https://openrouter.ai/api/v1");
  });

  it("ROSTER_DIR is on the harness config and a missing about file is just null", () => {
    const cfg = loadHarnessConfig({ ROSTER_DIR: "/tmp/roster-not-there", ABOUT_FILE: "/tmp/no-such-about.txt" });
    assert.equal(cfg.rosterDir, "/tmp/roster-not-there");
    assert.equal(cfg.about, null);
  });
});
