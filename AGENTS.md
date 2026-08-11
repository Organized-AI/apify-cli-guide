# Agent Runbook

This repo contains the Cloudflare Worker Assets guide and the Agent Session
Miner Apify Actor.

## End-to-End Session Miner Flow

From the repo root:

```bash
cd claude-log-miner
npm install
npm run doctor
apify run --purge --input-file ./local-input.json
npm run export:worker-assets
cd ..
wrangler deploy
```

Then verify:

```bash
curl -s -o /dev/null -w "worker: %{http_code}\n" https://apify-cli-guide.jordan-691.workers.dev/workshop/agent-session-miner
curl -s -o /dev/null -w "guide:  %{http_code}\n" https://guide.organizedai.vip/apify-cli/workshop/agent-session-miner
```

Both should return `200`.

## Dependency Checks

Use `npm run doctor` inside `claude-log-miner` before local runs. Use
`npm run doctor:strict` before pushing the Actor or deploying Worker Assets; it
also requires `apify login` and `wrangler login` to be complete.

## Local Import UI

After `apify run`, start the local report server:

```bash
npm run report
```

Open `http://localhost:4177`, select plugin opportunities, choose Codex, Claude
Code, or both, then click **Import Selected**. The static Cloudflare page cannot
write local skill files directly; it downloads an import plan and shows the
fallback command.

## Deployment Notes

Do not modify `wrangler.toml` unless the Worker name, compatibility date, or
asset routing intentionally changes. The current vanity route is:

https://guide.organizedai.vip/apify-cli/workshop/agent-session-miner
