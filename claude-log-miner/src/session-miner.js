import { createReadStream } from 'node:fs';
import { opendir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

export const DEFAULT_SESSION_GLOBS = ['~/.claude/projects/**/*.jsonl', '~/.codex/archived_sessions/**/*.jsonl'];

const DOMAIN_KEYWORDS = new Map([
    ['aiAgents', /\b(agent|agents|mcp|tool_use|tool use|codex|claude|cursor|prompt|llm|openai)\b/iu],
    ['apify', /\b(apify|actor|actors|crawlee|dataset|key-value store|request queue)\b/iu],
    ['cloudflare', /\b(cloudflare|worker|wrangler|pages)\b/iu],
    ['github', /\b(github|pull request|pr\b|issue|git|commit|branch)\b/iu],
    ['frontend', /\b(react|vue|svelte|css|tailwind|vite|next\.js|frontend|ui|component)\b/iu],
    ['testing', /\b(test|tests|vitest|jest|playwright|cypress|lint|eslint)\b/iu],
    ['data', /\b(csv|json|jsonl|dataset|database|postgres|sql|sheet|spreadsheet)\b/iu],
    ['automation', /\b(cron|schedule|webhook|automation|worker|queue)\b/iu],
    ['commerce', /\b(shopify|checkout|gtm|sgtm|google tag manager|meta capi|stape|stripe|hubspot)\b/iu],
    ['media', /\b(video|caption|subtitles|voiceover|hyperframes|remotion|heygen|faceless)\b/iu],
    ['knowledge', /\b(docs|document|drive|notion|slack|granola|meeting|wiki|notes)\b/iu],
]);

const GENERIC_OPPORTUNITY_WORDS = new Set([
    'agent',
    'agents',
    'all',
    'also',
    'and',
    'answer',
    'any',
    'apple',
    'are',
    'assistant',
    'before',
    'build',
    'can',
    'check',
    'chicago',
    'code',
    'codex',
    'com',
    'context',
    'current',
    'cwd',
    'create',
    'custom',
    'data',
    'default',
    'details',
    'does',
    'file',
    'files',
    'for',
    'from',
    'has',
    'have',
    'here',
    'into',
    'json',
    'jsonl',
    'library',
    'latest',
    'local',
    'make',
    'mobile',
    'now',
    'output',
    'please',
    'plugin',
    'plugins',
    'project',
    'related',
    'run',
    'session',
    'sessions',
    'should',
    'skill',
    'skills',
    'task',
    'that',
    'the',
    'their',
    'this',
    'tool',
    'tools',
    'use',
    'user',
    'users',
    'want',
    'with',
    'work',
    'workdir',
    'workflow',
    'workflows',
]);

const PACKAGE_PATTERNS = [
    /\b(?:npm|pnpm|yarn)\s+(?:install|add|i)\s+((?:[@\w./-]+(?:\s+|$))+)/giu,
    /\bnpx\s+([@\w./-]+)/giu,
    /\bpip(?:3)?\s+install\s+((?:[\w./-]+(?:\s+|$))+)/giu,
    /\buv\s+add\s+((?:[\w./-]+(?:\s+|$))+)/giu,
];

const FILE_EXTENSION_PATTERN =
    /(?:^|[\s"'`([{<])(?:\.{0,2}\/|~\/|\/)?[/\w@()[\]. -]+(\.[a-z][a-z0-9]{0,11})(?=$|[\s"'`)\]}>:,])/giu;

export function expandHome(inputPath) {
    if (!inputPath || inputPath === '~') return homedir();
    if (inputPath.startsWith('~/')) return path.join(homedir(), inputPath.slice(2));
    return inputPath;
}

export async function resolveSessionFiles(inputPath = '~/.claude/projects/**/*.jsonl', { limit = 100 } = {}) {
    const expandedPath = expandHome(inputPath);
    let rootPath = expandedPath;

    if (expandedPath.includes('**')) {
        rootPath = expandedPath.slice(0, expandedPath.indexOf('**'));
    }

    rootPath =
        rootPath
            .replace(/[*][^/\\]*$/u, '')
            .replace(/\/$/u, '')
            .replace(/\\$/u, '') || '.';

    try {
        const rootStat = await stat(rootPath);
        if (rootStat.isFile()) return [rootPath];
    } catch {
        return [];
    }

    const files = [];
    await walkJsonl(rootPath, files, limit);
    return files.sort();
}

export async function resolveSessionGlobs(inputPaths = DEFAULT_SESSION_GLOBS, { limit = 100 } = {}) {
    const paths = Array.isArray(inputPaths) ? inputPaths : [inputPaths];
    const seen = new Set();
    const files = [];

    for (const inputPath of paths.filter(Boolean)) {
        const remaining = limit - files.length;
        if (remaining <= 0) break;

        const matches = await resolveSessionFiles(inputPath, { limit: remaining });
        for (const filePath of matches) {
            if (seen.has(filePath)) continue;
            seen.add(filePath);
            files.push(filePath);
            if (files.length >= limit) break;
        }
    }

    return files.sort();
}

export async function mineSessionFile(filePath) {
    const counters = {
        totalLines: 0,
        parsedLines: 0,
        userMessages: 0,
        assistantMessages: 0,
        toolUseEvents: 0,
    };
    const tools = new Map();
    const mcpServers = new Map();
    const packages = new Set();
    const fileExtensions = new Set();
    const domains = new Set();
    const pluginSignals = new Map();
    const timestamps = [];
    const samplePrompts = [];
    const parseErrors = [];
    const meta = {
        agent: detectAgentFromPath(filePath),
        cwd: null,
        originator: null,
        cliVersion: null,
        source: null,
    };

    const input = createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });

    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        counters.totalLines += 1;

        let event;
        try {
            event = JSON.parse(trimmed);
            counters.parsedLines += 1;
        } catch (error) {
            if (parseErrors.length < 5) parseErrors.push(String(error.message ?? error));
            continue;
        }

        collectTimestamp(event, timestamps);
        Object.assign(meta, getMetaUpdate(event, meta));
        const messageCounts = getMessageCounts(event, samplePrompts);
        counters.userMessages += messageCounts.user;
        counters.assistantMessages += messageCounts.assistant;
        collectFromEvent(event, { tools, mcpServers, packages, fileExtensions, domains, pluginSignals });
    }

    return {
        sessionId: path.basename(filePath, '.jsonl'),
        sourceFile: filePath,
        agent: meta.agent,
        originator: meta.originator,
        cwd: meta.cwd,
        source: meta.source,
        cliVersion: meta.cliVersion,
        project: path.basename(path.dirname(filePath)),
        lineCount: counters.totalLines,
        parsedLineCount: counters.parsedLines,
        parseErrorCount: counters.totalLines - counters.parsedLines,
        firstTimestamp: timestamps[0] ?? null,
        lastTimestamp: timestamps.at(-1) ?? null,
        messageCounts: {
            user: counters.userMessages,
            assistant: counters.assistantMessages,
        },
        toolUseCount: [...tools.values()].reduce((total, count) => total + count, counters.toolUseEvents),
        tools: sortedCounts(tools),
        mcpServers: sortedCounts(mcpServers),
        packages: [...packages].sort(),
        fileExtensions: [...fileExtensions].sort(),
        keywordDomains: [...domains].sort(),
        pluginOpportunitySignals: sortedSignals(pluginSignals).map(({ name, score, evidence }) => ({
            name,
            score,
            evidence,
            installedMatch: null,
            marketplaceMatch: null,
        })),
        samplePrompts,
        parseErrors,
    };
}

export async function loadCapabilityInventory({
    skillRoots = ['~/.agents/skills', '~/.codex/skills'],
    pluginCatalog = '~/.codex/cache/remote_plugin_catalog/cbdcf898a3c2637e.json',
} = {}) {
    const installedSkills = new Set();
    const marketplacePlugins = new Set();

    for (const root of skillRoots) {
        await collectSkillNames(expandHome(root), installedSkills);
    }

    try {
        const catalog = JSON.parse(await readFile(expandHome(pluginCatalog), 'utf8'));
        for (const plugin of catalog.plugins ?? []) {
            if (typeof plugin.name === 'string') marketplacePlugins.add(plugin.name);
        }
    } catch {
        // Catalog is optional; local runs still produce useful custom opportunity signals.
    }

    return {
        installedSkills: [...installedSkills].sort(),
        marketplacePlugins: [...marketplacePlugins].sort(),
    };
}

export function summarizePluginOpportunities(records, inventory = {}) {
    const installed = new Set((inventory.installedSkills ?? []).map(normalizeCapabilityName));
    const marketplace = new Set((inventory.marketplacePlugins ?? []).map(normalizeCapabilityName));
    const scores = new Map();

    for (const record of records) {
        for (const signal of record.pluginOpportunitySignals ?? []) {
            const current = scores.get(signal.name) ?? {
                name: signal.name,
                score: 0,
                sessions: 0,
                agents: new Set(),
                domains: new Set(),
                evidence: new Set(),
                installedMatch: installed.has(normalizeCapabilityName(signal.name)),
                marketplaceMatch: marketplace.has(normalizeCapabilityName(signal.name)),
            };
            current.score += Math.min(signal.score, 10);
            current.sessions += 1;
            if (record.agent) current.agents.add(record.agent);
            for (const domain of record.keywordDomains ?? []) current.domains.add(domain);
            for (const evidence of signal.evidence ?? []) current.evidence.add(evidence);
            scores.set(signal.name, current);
        }
    }

    return [...scores.values()]
        .filter((item) => item.score >= 4 || item.sessions >= 2)
        .sort(
            (left, right) =>
                right.score - left.score || right.sessions - left.sessions || left.name.localeCompare(right.name),
        )
        .map((item) => ({
            name: item.name,
            score: item.score,
            sessions: item.sessions,
            agents: [...item.agents].sort(),
            domains: [...item.domains].sort(),
            evidence: [...item.evidence].sort().slice(0, 8),
            description: describeDataBackedOpportunity(item),
            effectiveness: rateDataBackedOpportunity(item),
            installedMatch: item.installedMatch,
            marketplaceMatch: item.marketplaceMatch,
            recommendation:
                item.installedMatch || item.marketplaceMatch
                    ? 'Use or tune existing capability before building custom.'
                    : `Candidate for a custom skill based on ${item.sessions} matching session(s).`,
        }));
}

async function walkJsonl(directory, files, limit) {
    if (files.length >= limit) return;

    let dir;
    try {
        dir = await opendir(directory);
    } catch {
        return;
    }

    for await (const entry of dir) {
        if (files.length >= limit) break;

        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            await walkJsonl(entryPath, files, limit);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            files.push(entryPath);
        }
    }
}

function collectTimestamp(event, timestamps) {
    const value = event.timestamp ?? event.createdAt ?? event.message?.created_at;
    if (typeof value === 'string' && value) timestamps.push(value);
}

function getMetaUpdate(event, meta) {
    if (event.type !== 'session_meta' || !event.payload) return {};

    const originator = event.payload.originator ?? meta.originator;

    return {
        cwd: event.payload.cwd ?? meta.cwd,
        originator,
        cliVersion: event.payload.cli_version ?? meta.cliVersion,
        source: event.payload.source ?? meta.source,
        agent: String(originator ?? '')
            .toLowerCase()
            .includes('codex')
            ? 'codex'
            : meta.agent,
    };
}

function getMessageCounts(event, samplePrompts) {
    const role =
        event.type === 'user' || event.type === 'assistant' ? event.type : (event.message?.role ?? event.payload?.role);

    if (role === 'user') {
        const text = extractText(
            event.message?.content ?? event.content ?? event.payload?.content ?? event.payload?.message,
        );
        if (text && samplePrompts.length < 3) samplePrompts.push(text.slice(0, 240));
    }

    return {
        user: role === 'user' ? 1 : 0,
        assistant: role === 'assistant' ? 1 : 0,
    };
}

function collectFromEvent(event, state) {
    if (event.type === 'session_meta') {
        collectFromValue(
            {
                cwd: event.payload?.cwd,
                originator: event.payload?.originator,
                source: event.payload?.source,
            },
            state,
            { includePhrases: false },
        );
        return;
    }

    if (event.type === 'response_item' && event.payload?.role === 'developer') return;
    if (event.type === 'response_item' && event.payload?.role === 'system') return;

    const role =
        event.type === 'user' || event.type === 'assistant' ? event.type : (event.message?.role ?? event.payload?.role);

    if (role === 'user') {
        collectFromValue(
            event.message?.content ?? event.content ?? event.payload?.content ?? event.payload?.message,
            state,
            {
                includePhrases: true,
            },
        );
        return;
    }

    collectFromValue(event, state, { includePhrases: role === 'user' });
}

function collectFromValue(value, state, { includePhrases = true } = {}) {
    if (typeof value === 'string') {
        collectTextSignals(value, state, { includePhrases });
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) collectFromValue(item, state, { includePhrases });
        return;
    }

    if (!value || typeof value !== 'object') return;

    if (
        (value.type === 'text' || value.type === 'input_text' || value.type === 'output_text') &&
        typeof (value.text ?? value.input_text ?? value.output_text) === 'string'
    ) {
        collectFromValue(value.text ?? value.input_text ?? value.output_text, state, { includePhrases });
        return;
    }

    if (value.type === 'tool_use' && typeof value.name === 'string') {
        increment(state.tools, value.name);
        collectMcpServer(value.name, state.mcpServers, state.domains, state.pluginSignals);
    }

    if (typeof value.tool_name === 'string') {
        increment(state.tools, value.tool_name);
        collectMcpServer(value.tool_name, state.mcpServers, state.domains, state.pluginSignals);
    }

    if (value.type === 'function_call' && typeof value.name === 'string') {
        increment(state.tools, value.name);
        collectMcpServer(value.name, state.mcpServers, state.domains, state.pluginSignals);
    }

    if (typeof value.name === 'string' && typeof value.input === 'object' && value.type === 'tool_use') {
        collectFromValue(value.input, state, { includePhrases });
    }

    for (const [key, nested] of Object.entries(value)) {
        if (value.type === 'tool_use' && key === 'name') continue;
        collectFromValue(nested, state, { includePhrases });
    }
}

function collectTextSignals(
    text,
    { mcpServers, packages, fileExtensions, domains, pluginSignals },
    { includePhrases },
) {
    collectMcpServer(text, mcpServers, domains, pluginSignals);

    for (const pattern of PACKAGE_PATTERNS) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
            for (const packageName of match[1].trim().split(/\s+/u)) {
                if (packageName && !packageName.startsWith('-')) {
                    packages.add(packageName);
                    incrementSignal(pluginSignals, `${normalizeCapabilityName(packageName)}-tooling`, 4, [
                        `package:${packageName}`,
                    ]);
                }
            }
        }
    }

    FILE_EXTENSION_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(FILE_EXTENSION_PATTERN)) {
        fileExtensions.add(match[1].toLowerCase());
    }

    for (const [domain, pattern] of DOMAIN_KEYWORDS) {
        if (pattern.test(text)) {
            domains.add(domain);
        }
    }

    if (includePhrases) {
        for (const phrase of extractOpportunityPhrases(text)) {
            incrementSignal(pluginSignals, `${phrase}-workflow`, 2, [`phrase:${phrase}`]);
        }
    }
}

function collectMcpServer(value, servers, domains, pluginSignals) {
    const text = String(value);
    const matches = text.matchAll(/\bmcp__([a-z0-9_-]+)__[a-z0-9_-]+\b/giu);
    for (const match of matches) {
        increment(servers, match[1]);
        if (DOMAIN_KEYWORDS.has(match[1])) domains.add(match[1]);
        incrementSignal(pluginSignals, `${normalizeCapabilityName(match[1])}-mcp-workflow`, 4, [`mcp:${match[1]}`]);
    }
}

function extractText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object' && typeof item.text === 'string') return item.text;
                if (item && typeof item === 'object' && typeof item.input_text === 'string') return item.input_text;
                if (item && typeof item === 'object' && typeof item.output_text === 'string') return item.output_text;
                return '';
            })
            .filter(Boolean)
            .join(' ');
    }
    return '';
}

function detectAgentFromPath(filePath) {
    if (filePath.includes('/.codex/')) return 'codex';
    if (filePath.includes('/.claude/')) return 'claude-code';
    return 'unknown';
}

async function collectSkillNames(directory, names) {
    try {
        const skillFile = await stat(path.join(directory, 'SKILL.md'));
        if (skillFile.isFile()) names.add(path.basename(directory));
    } catch {
        // Not every directory under a skill root is itself a skill.
    }

    let dir;
    try {
        dir = await opendir(directory);
    } catch {
        return;
    }

    for await (const entry of dir) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            await collectSkillNames(entryPath, names);
        }
    }
}

function normalizeCapabilityName(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
}

function increment(map, key) {
    map.set(key, (map.get(key) ?? 0) + 1);
}

function incrementSignal(map, key, score = 1, evidence = []) {
    const normalizedKey = normalizeCapabilityName(key);
    if (!normalizedKey || normalizedKey.length < 4) return;

    const current = map.get(normalizedKey) ?? { score: 0, evidence: new Set() };
    current.score += score;
    for (const item of evidence.filter(Boolean)) current.evidence.add(item);
    map.set(normalizedKey, current);
}

function sortedCounts(map) {
    return [...map.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([name, count]) => ({ name, count }));
}

function sortedSignals(map) {
    return [...map.entries()]
        .sort((left, right) => right[1].score - left[1].score || left[0].localeCompare(right[0]))
        .map(([name, value]) => ({ name, score: value.score, evidence: [...value.evidence].sort() }));
}

function extractOpportunityPhrases(text) {
    const words = cleanOpportunityText(text)
        .toLowerCase()
        .match(/[a-z][a-z0-9]{2,}/gu);
    if (!words) return [];

    const meaningful = words.filter((word) => !GENERIC_OPPORTUNITY_WORDS.has(word));
    const phrases = new Set();

    for (let index = 0; index < meaningful.length; index += 1) {
        const one = meaningful[index];
        const two = meaningful[index + 1];
        const three = meaningful[index + 2];
        if (one && two) phrases.add(`${one}-${two}`);
        if (one && two && three) phrases.add(`${one}-${two}-${three}`);
        if (phrases.size >= 12) break;
    }

    return [...phrases].filter((phrase) => phrase.length <= 60);
}

function cleanOpportunityText(text) {
    return String(text)
        .replace(/<[^>]*context[^>]*>[\s\S]*?<\/[^>]*context>/giu, ' ')
        .replace(/<[^>]*environment[^>]*>[\s\S]*?<\/[^>]*environment>/giu, ' ')
        .replace(/https?:\/\/\S+/giu, ' ')
        .replace(/(?:~|\.)?\/[^\s"'`<>]+/gu, ' ')
        .replace(/\b[a-z]:\\[^\s"'`<>]+/giu, ' ');
}

function describeDataBackedOpportunity(item) {
    const evidence = [...item.evidence].slice(0, 4);
    const domains = [...item.domains].slice(0, 4);
    const evidenceText = evidence.length ? `Observed signals: ${evidence.join(', ')}.` : '';
    const domainText = domains.length ? `Domains: ${domains.join(', ')}.` : '';
    return [`Data-backed workflow opportunity found in ${item.sessions} session(s).`, domainText, evidenceText]
        .filter(Boolean)
        .join(' ');
}

function rateDataBackedOpportunity(item) {
    if (item.sessions >= 5 || item.score >= 30) return 5;
    if (item.sessions >= 3 || item.score >= 18) return 4;
    if (item.sessions >= 2 || item.score >= 10) return 3;
    if (item.score >= 5) return 2;
    return 1;
}
