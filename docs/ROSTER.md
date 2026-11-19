# The local roster

An optional, local-only data source the scan reads when a coin's creator or a scanned wallet is known. It is how this fork layers our deployer and serial-rugger labels onto crawlnet's dossier.

Nothing in this directory is committed. Point `ROSTER_DIR` at a folder you keep privately (it is already covered by `data/` when you use the default path below).

```bash
# example: our Eve pack's traders folder (read-only labels + counts)
# ROSTER_DIR=/path/to/from_eve/traders

# or a copy under the harness data dir (gitignored)
mkdir -p data/roster
# copy deployers.csv and serial_deployers.txt there
# ROSTER_DIR=./data/roster
```

## Files the loader accepts

| File | Shape |
|---|---|
| `deployers.csv` | header `address,chain,labels,name,handle,source,evidence,n_launches,n_rugs,rug_rate,best_mult`. Quoted fields may hold commas. |
| `serial_deployers.txt` | `#` comments, then `address,chain,labels,launches,rug_rate`. Several unquoted label fields before the last two counts are fine. |
| `roster.jsonl` | one JSON object per line: `address`, `chain`, `labels` (array or string), `n_launches`, `n_rugs`, `rug_rate`. |

`name`, `handle`, `source`, `evidence` and any other identity or write-up field are parsed only so the row lines up, then dropped. The dossier, the token card and the model see labels and counts only: for example `local roster: its creator is labeled serial_deployer, 12 launches, 11 rugs, rug rate 0.92 (hard veto)`.

## What it does

- A hit on the creator, or on the wallet of a wallet scan, is written into the dossier and the token card (`roster`).
- Hard veto (danger / BLOCK): labels `serial_deployer`, `serial_rugger`, `deployer_linked`, `bundler`, `lp_rugger`, `rugger`, or a `rug_rate` at or over 0.8.
- Other labels (for example `repeat_deployer`) are a warning, not a veto.
- Missing directory, missing files or a miss on the address: the scan runs as before, with no roster line.

This is a research lookup, not a trading signal and not a blocklist you ship. Do not commit roster files. Do not put wallet keys, API keys or private write-ups of tracked people in `ROSTER_DIR`.
