# Agent Session Miner

An Apify Actor that reads Claude Code and Codex JSONL session logs from disk,
pushes one structured taxonomy record per session file to the default Dataset,
and writes a ranked list of custom plugin opportunities to `SUMMARY`.

The default input scans:

```json
{
    "sessionGlobs": ["~/.claude/projects/**/*.jsonl", "~/.codex/archived_sessions/**/*.jsonl"],
    "maxFiles": 100,
    "maxOpportunities": 25
}
```

## How it works

- Expands `~` and scans JSONL files, directories, or simple `**/*.jsonl` paths.
- Parses each JSONL line independently so malformed lines do not kill the run.
- Extracts tool use events, MCP server names, package references, file
  extensions, keyword domains, message counts, agent/source metadata, and
  timestamps.
- Cross-references session signals against installed local skills and the Codex
  remote plugin catalog cache when present.
- Writes one Dataset item per session file with `Actor.pushData()`.
- Writes aggregate plugin opportunity rankings to the default key-value store
  under `SUMMARY`.
- Writes an interactive report to the default key-value store under `REPORT`.
- Provides a local report server so the report's Import button can create
  placeholder skills for Codex and Claude Code.

## Getting started

Install and check dependencies:

```bash
npm install
npm run doctor
```

Use `npm run doctor:strict` before deploys; it also checks that `apify login`
and `wrangler login` are complete.

Run locally:

```bash
apify run
```

Override input locally by editing `storage/key_value_stores/default/INPUT.json`,
or pass an input file with the Apify CLI.

Open the interactive report:

```bash
npm run report
```

Then open `http://localhost:4177`, check the opportunities you want to keep,
choose Codex, Claude Code, or both, and click **Import Selected**. The importer
creates placeholder `SKILL.md` files under `~/.codex/skills/<opportunity>/` and
`~/.claude/skills/<opportunity>/`.

If you open `REPORT.html` directly from Apify storage instead of the local
server, the browser cannot edit local settings. In that mode the Import button
downloads an import plan that can be applied with:

```bash
node scripts/import-selection.js --file ~/Downloads/agent-session-import-plan.json --clients codex,claude-code
```

Deploy to Apify:

```bash
apify push
```

Export the latest local report into this repo's Cloudflare Worker Assets and
deploy the guide:

```bash
npm run export:worker-assets
cd ..
wrangler deploy
```

The deployed report is served at:

https://guide.organizedai.vip/apify-cli/workshop/agent-session-miner

Note: local files under `~/.claude` and `~/.codex` are only available to local
runs. For cloud runs, provide logs through cloud-accessible storage or adapt the
Actor to read from an uploaded key-value store record.
