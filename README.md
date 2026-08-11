# apify-cli-guide

Static two-page guide, deployed as a Cloudflare Worker (Assets), served at
**https://guide.organizedai.vip/apify-cli** and
**https://guide.organizedai.vip/apify-cli/workshop**.

It also includes the Agent Session Miner Apify Actor, served at
**https://guide.organizedai.vip/apify-cli/workshop/agent-session-miner**.

## Deploy (copy-paste)

```bash
npm install -g wrangler   # skip if already installed
wrangler login             # skip if already logged in
wrangler deploy
```

That's it. Wrangler reads `wrangler.toml`, uploads whatever changed in `public/`,
and prints the live URL.

## Verify

```bash
curl -s -o /dev/null -w "root:     %{http_code}\n" https://apify-cli-guide.jordan-691.workers.dev
curl -s -o /dev/null -w "workshop: %{http_code}\n" https://apify-cli-guide.jordan-691.workers.dev/workshop
curl -s -o /dev/null -w "miner:    %{http_code}\n" https://apify-cli-guide.jordan-691.workers.dev/workshop/agent-session-miner
curl -s -o /dev/null -w "vanity:   %{http_code}\n" https://guide.organizedai.vip/apify-cli
curl -s -o /dev/null -w "vanity:   %{http_code}\n" https://guide.organizedai.vip/apify-cli/workshop
curl -s -o /dev/null -w "vanity:   %{http_code}\n" https://guide.organizedai.vip/apify-cli/workshop/agent-session-miner
```
All six should print `200`.

## Agent Session Miner

The Actor lives in `claude-log-miner/`. It scans Codex and Claude Code JSONL
session logs, extracts session taxonomy records, ranks custom plugin
opportunities from evidence in those logs, and generates an interactive HTML
report with checkboxes for Codex and Claude Code import plans. The generated
opportunities are not a fixed starter list; local runs derive names,
descriptions, ratings, and evidence from the user's own session data.

Run the whole local-to-Worker flow:

```bash
cd claude-log-miner
npm install
npm run doctor
apify run --purge --input-file ./local-input.json
npm run export:worker-assets
cd ..
wrangler deploy
```

Use `npm run doctor:strict` before cloud operations when you want auth checks
for both Apify and Cloudflare. It requires `apify login` and `wrangler login`.

For direct local imports:

```bash
cd claude-log-miner
npm run report
```

Open `http://localhost:4177`, select the plugin opportunities to keep, choose
Codex, Claude Code, or both, then click **Import Selected**. On the deployed
static Cloudflare page, browser filesystem restrictions mean the same button
downloads an import plan and shows a command to apply it locally.

## Add a new page

Drop a new `.html` file into `public/`, keep the same `<style>` block for a
matching look, then run `wrangler deploy` again. No config changes needed —
`guide.organizedai.vip/apify-cli/<filename>` picks it up automatically once the
Worker is live (the vanity router forwards any sub-path straight through).

## Structure

```
apify-cli-guide/
  claude-log-miner/  # Apify Actor: Agent Session Miner
  public/
    index.html                         # guide.organizedai.vip/apify-cli
    workshop.html                      # guide.organizedai.vip/apify-cli/workshop
    workshop/agent-session-miner.html  # guide.organizedai.vip/apify-cli/workshop/agent-session-miner
  wrangler.toml
```

---

## For AI coding agents

If you were handed only this repo's URL, do this, in order, with no
clarification needed:

1. Clone the repo and `cd` into it.
2. If the task is about the Agent Session Miner, `cd claude-log-miner`, run
   `npm install`, then run `npm run doctor`.
3. To regenerate the miner report, run
   `apify run --purge --input-file ./local-input.json`, then
   `npm run export:worker-assets`, then `cd ..`.
4. Check `wrangler --version`. If missing: `npm install -g wrangler`.
5. Check `wrangler whoami`. If not logged in: `wrangler login` (this opens a
   browser — tell the user to complete it, then continue).
6. Run `wrangler deploy` from the repo root (no flags needed — everything is
   in `wrangler.toml`).
7. Run the six `curl` checks in **Verify** above. All must return `200`.
8. Report the live URLs back to the user. Do not modify `wrangler.toml`
   (`name`, `compatibility_date`, `[assets]` block) — those are load-bearing
   for the existing Cloudflare Worker and vanity-domain routing.

If step 7 fails on the `guide.organizedai.vip` checks but the matching
`workers.dev` checks pass: the Worker deployed fine, but the vanity subdomain
routing is a separate, unrelated Cloudflare Worker (`organizedai-vanity-router`)
that this repo does not own or deploy — report that distinction rather than
trying to fix it here.
