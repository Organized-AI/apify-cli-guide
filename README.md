# apify-cli-guide

Static two-page guide, deployed as a Cloudflare Worker (Assets), served at
**https://guide.organizedai.vip/apify-cli** and
**https://guide.organizedai.vip/apify-cli/workshop**.

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
curl -s -o /dev/null -w "vanity:   %{http_code}\n" https://guide.organizedai.vip/apify-cli
curl -s -o /dev/null -w "vanity:   %{http_code}\n" https://guide.organizedai.vip/apify-cli/workshop
```
All four should print `200`.

## Add a new page

Drop a new `.html` file into `public/`, keep the same `<style>` block for a
matching look, then run `wrangler deploy` again. No config changes needed —
`guide.organizedai.vip/apify-cli/<filename>` picks it up automatically once the
Worker is live (the vanity router forwards any sub-path straight through).

## Structure

```
apify-cli-guide/
  public/
    index.html      # guide.organizedai.vip/apify-cli
    workshop.html    # guide.organizedai.vip/apify-cli/workshop
  wrangler.toml
```

---

## For AI coding agents

If you were handed only this repo's URL, do this, in order, with no
clarification needed:

1. Clone the repo and `cd` into it.
2. Check `wrangler --version`. If missing: `npm install -g wrangler`.
3. Check `wrangler whoami`. If not logged in: `wrangler login` (this opens a
   browser — tell the user to complete it, then continue).
4. Run `wrangler deploy` from the repo root (no flags needed — everything is
   in `wrangler.toml`).
5. Run the four `curl` checks in **Verify** above. All must return `200`.
6. Report the live URLs back to the user. Do not modify `wrangler.toml`
   (`name`, `compatibility_date`, `[assets]` block) — those are load-bearing
   for the existing Cloudflare Worker and vanity-domain routing.

If step 5 fails on the two `guide.organizedai.vip` checks but the two
`workers.dev` checks pass: the Worker deployed fine, but the vanity subdomain
routing is a separate, unrelated Cloudflare Worker (`organizedai-vanity-router`)
that this repo does not own or deploy — report that distinction rather than
trying to fix it here.
