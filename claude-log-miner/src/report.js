export function buildImportPlan(summary) {
    const opportunities = (summary.pluginOpportunities ?? []).map((opportunity) => ({
        id: opportunity.name,
        title: toTitle(opportunity.name),
        description:
            opportunity.description ??
            'Data-backed opportunity inferred from this user session data. Review the evidence before importing.',
        effectiveness: opportunity.effectiveness ?? 1,
        score: opportunity.score,
        sessions: opportunity.sessions,
        agents: opportunity.agents,
        domains: opportunity.domains ?? [],
        evidence: opportunity.evidence ?? [],
        installedMatch: opportunity.installedMatch,
        marketplaceMatch: opportunity.marketplaceMatch,
        recommendation: opportunity.recommendation,
        defaultSelected: !opportunity.installedMatch,
    }));

    return {
        generatedAt: new Date().toISOString(),
        clients: ['codex', 'claude-code'],
        opportunities,
    };
}

export function buildReportHtml({ summary, records, importPlan }) {
    const safeSummary = {
        ...summary,
        sessionGlobs: (summary.sessionGlobs ?? []).map(redactHomePath),
    };
    const topTools = topCounts(
        records.flatMap((record) => record.tools ?? []),
        'name',
        'count',
    ).slice(0, 10);
    const topDomains = topValues(records.flatMap((record) => record.keywordDomains ?? [])).slice(0, 12);
    const agentCounts = topValues(records.map((record) => record.agent ?? 'unknown'));
    const sessions = records.slice(0, 100).map((record) => ({
        id: record.sessionId,
        agent: record.agent,
        cwd: redactHomePath(record.cwd),
        messages: `${record.messageCounts?.user ?? 0} user / ${record.messageCounts?.assistant ?? 0} assistant`,
        tools: record.toolUseCount ?? 0,
        started: record.firstTimestamp,
        ended: record.lastTimestamp,
    }));

    const data = {
        summary: safeSummary,
        topTools,
        topDomains,
        agentCounts,
        sessions,
        importPlan,
    };

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Session Miner Report</title>
<style>
:root {
  color-scheme: light;
  --bg: #f7f8fa;
  --panel: #ffffff;
  --text: #1d2433;
  --muted: #667085;
  --line: #d9dee8;
  --accent: #0f766e;
  --accent-dark: #115e59;
  --warn: #9a3412;
  --ok-bg: #e8f5f1;
  --warn-bg: #fff4e5;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.45;
}
header {
  padding: 28px 32px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}
h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
h2 { margin: 0 0 14px; font-size: 18px; letter-spacing: 0; }
p { margin: 0; color: var(--muted); }
main { max-width: 1180px; margin: 0 auto; padding: 24px; }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
.metric, .panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.metric { padding: 14px; }
.metric strong { display: block; font-size: 24px; }
.metric span { color: var(--muted); font-size: 13px; }
.panel { padding: 18px; margin-bottom: 18px; }
.opportunity {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.opportunity:first-of-type { border-top: 0; }
.opportunity input { width: 18px; height: 18px; margin-top: 2px; accent-color: var(--accent); }
.op-title { font-weight: 700; }
.op-desc { color: var(--text); font-size: 13px; margin-top: 4px; max-width: 760px; }
.op-meta { color: var(--muted); font-size: 13px; margin-top: 2px; }
.rating {
  display: inline-flex;
  gap: 2px;
  margin-left: 6px;
  color: #b45309;
  font-size: 13px;
  letter-spacing: 0;
}
.badge {
  display: inline-block;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 12px;
  color: var(--muted);
  background: #fff;
}
.badge.warn { color: var(--warn); background: var(--warn-bg); border-color: #fed7aa; }
.badge.ok { color: var(--accent-dark); background: var(--ok-bg); border-color: #99f6e4; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 16px; }
button {
  border: 0;
  border-radius: 6px;
  padding: 10px 14px;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
button.secondary { background: #344054; }
select {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 9px 10px;
  background: #fff;
  color: var(--text);
}
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 9px 8px; border-top: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 700; }
code, pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
pre {
  display: none;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: #101828;
  color: #f2f4f7;
}
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.status { margin-top: 12px; color: var(--muted); min-height: 20px; }
@media (max-width: 820px) {
  header { padding: 22px 18px 16px; }
  main { padding: 16px; }
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .opportunity { grid-template-columns: 28px 1fr; }
  .opportunity > .badge { grid-column: 2; width: fit-content; }
}
</style>
</head>
<body>
<header>
  <h1>Agent Session Miner</h1>
  <p>Clean session summary, plugin opportunities, and import controls for Codex and Claude Code.</p>
</header>
<main>
  <section class="grid" aria-label="Run metrics">
    ${metric('Sessions', safeSummary.scannedFiles ?? records.length)}
    ${metric('Records', safeSummary.pushedRecords ?? records.length)}
    ${metric('Agents', (safeSummary.agents ?? []).join(', ') || 'none')}
    ${metric('Marketplace Plugins', safeSummary.marketplacePluginsSeen ?? 0)}
  </section>

  <section class="panel">
    <h2>Plugin Opportunities</h2>
    <div id="opportunities"></div>
    <div class="actions">
      <select id="clientSelect" aria-label="Import target">
        <option value="both">Codex and Claude Code</option>
        <option value="codex">Codex only</option>
        <option value="claude-code">Claude Code only</option>
      </select>
      <button id="importButton" type="button">Import Selected</button>
      <button id="downloadButton" class="secondary" type="button">Download Import Plan</button>
    </div>
    <div id="status" class="status"></div>
    <pre id="fallbackCommand"></pre>
  </section>

  <section class="panel">
    <h2>Signal Summary</h2>
    <div class="chips">${topDomains.map((item) => `<span class="badge">${escapeHtml(item.name)} ${item.count}</span>`).join('')}</div>
  </section>

  <section class="panel">
    <h2>Top Tools</h2>
    ${table(
        ['Tool', 'Count'],
        topTools.map((item) => [item.name, item.count]),
    )}
  </section>

  <section class="panel">
    <h2>Sessions</h2>
    ${table(
        ['Session', 'Agent', 'Messages', 'Tool Calls', 'Started'],
        sessions.map((session) => [session.id, session.agent, session.messages, session.tools, session.started]),
    )}
  </section>
</main>
<script>
window.__REPORT_DATA__ = ${JSON.stringify(data)};

const state = window.__REPORT_DATA__;
const opportunitiesEl = document.getElementById('opportunities');
const statusEl = document.getElementById('status');
const fallbackCommandEl = document.getElementById('fallbackCommand');

function renderOpportunities() {
  if (!state.importPlan.opportunities.length) {
    opportunitiesEl.innerHTML = '<p>No importable plugin opportunities met the evidence threshold for this run. Scan more sessions or raise maxFiles to find repeated patterns.</p>';
    return;
  }

  opportunitiesEl.innerHTML = state.importPlan.opportunities.map((opportunity) => {
    const checked = opportunity.defaultSelected ? 'checked' : '';
    const badgeClass = opportunity.installedMatch || opportunity.marketplaceMatch ? 'ok' : 'warn';
    const badge = opportunity.installedMatch ? 'already installed' : opportunity.marketplaceMatch ? 'marketplace match' : 'custom candidate';
    return '<label class="opportunity">' +
      '<input type="checkbox" value="' + escapeAttr(opportunity.id) + '" ' + checked + '>' +
      '<span><span class="op-title">' + escapeHtml(opportunity.title) + '</span>' +
      '<span class="rating" aria-label="Effectiveness ' + opportunity.effectiveness + ' of 5">[' + '#'.repeat(opportunity.effectiveness) + '-'.repeat(5 - opportunity.effectiveness) + ']</span>' +
      '<span class="op-desc">' + escapeHtml(opportunity.description) + '</span>' +
      '<span class="op-meta">Effectiveness ' + opportunity.effectiveness + '/5 · Signal score ' + opportunity.score + ' · ' + opportunity.sessions + ' session(s) · ' + opportunity.agents.join(', ') + '</span>' +
      '<span class="op-meta">' + escapeHtml(opportunity.recommendation) + '</span></span>' +
      '<span class="badge ' + badgeClass + '">' + badge + '</span>' +
      '</label>';
  }).join('');
}

function selectedPlan() {
  const selectedIds = [...opportunitiesEl.querySelectorAll('input:checked')].map((input) => input.value);
  const target = document.getElementById('clientSelect').value;
  return {
    generatedAt: new Date().toISOString(),
    target,
    clients: target === 'both' ? ['codex', 'claude-code'] : [target],
    opportunities: state.importPlan.opportunities.filter((opportunity) => selectedIds.includes(opportunity.id)),
  };
}

async function importSelected() {
  const plan = selectedPlan();
  if (!plan.opportunities.length) {
    statusEl.textContent = 'Select at least one opportunity to import.';
    return;
  }

  try {
    const response = await fetch('/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    statusEl.textContent = 'Imported ' + result.imported.length + ' opportunity skill(s) into ' + result.clients.join(', ') + '.';
    fallbackCommandEl.style.display = 'none';
  } catch {
    downloadPlan(plan);
    statusEl.textContent = 'Downloaded an import plan. Run the command below from the Actor project to apply it.';
    fallbackCommandEl.textContent = 'node scripts/import-selection.js --file ~/Downloads/agent-session-import-plan.json --clients ' + plan.clients.join(',');
    fallbackCommandEl.style.display = 'block';
  }
}

function downloadPlan(plan = selectedPlan()) {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'agent-session-import-plan.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

document.getElementById('importButton').addEventListener('click', importSelected);
document.getElementById('downloadButton').addEventListener('click', () => downloadPlan());
renderOpportunities();
</script>
</body>
</html>`;
}

function metric(label, value) {
    return `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function table(headers, rows) {
    return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`;
}

function topValues(values) {
    const counts = new Map();
    for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([name, count]) => ({ name, count }));
}

function topCounts(items, nameKey, countKey) {
    const counts = new Map();
    for (const item of items) counts.set(item[nameKey], (counts.get(item[nameKey]) ?? 0) + item[countKey]);
    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([name, count]) => ({ name, count }));
}

function toTitle(value) {
    return String(value)
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function redactHomePath(value) {
    return String(value ?? '').replace(/\/Users\/[^/\s"]+/gu, '~');
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/gu, (char) => {
        const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return entities[char];
    });
}
