# Our taste on this fork

Crawlnet's queen harness already answers like a trencher: the verdict first, numbers as returned, the worst finding first. This fork keeps that, and adds a prompt layer plus a local roster so answers use our gate language.

The source of the prompt is `packages/harness/src/taste.ts`. It is included in the system prompt after voice and before the visual blocks, and it is on the leak guard (the model may apply the rules, not quote them).

What we added, and what we left out on purpose:

- **In:** verdict first (BLOCK / PASS when the gate ran, else danger / mixed / clean on-chain); numbers as returned; worst finding first; no shilling; hard vetoes (serial deployer / linked / bundler, live mint or freeze, honeypot, rugged, pullable lp, rug rate ≥ 0.8); fail-closed on missing holder, funding or creator data for a young coin; the block classes our scanner uses (BUNDLE, FAIL-CLOSED, YOUNG, MICROTX, LIQUIDITY, AUTHORITIES, TOP_HOLDER, DEV_HOLD, HONEYPOT, COPYCAT, FUNDING, MC_CEILING); "fills beat badges."
- **Out:** sizing, exits, ticket amounts, live trading rules, signing, keys, private write-ups of tracked people. This stays a research harness.

The model endpoint is any OpenAI-compatible chat completions API with tool calls (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). `LLM_ADAPTER_URL` is an alias for `LLM_BASE_URL` so a later fine-tuned adapter can be pointed at without renaming the rest of the config.

See [ROSTER.md](ROSTER.md) for the optional local deployer roster.
