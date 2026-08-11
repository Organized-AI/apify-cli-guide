import { Actor, log } from 'apify';

import { buildImportPlan, buildReportHtml } from './report.js';
import {
    DEFAULT_SESSION_GLOBS,
    loadCapabilityInventory,
    mineSessionFile,
    resolveSessionGlobs,
    summarizePluginOpportunities,
} from './session-miner.js';

await Actor.init();

try {
    const input = (await Actor.getInput()) ?? {};
    const sessionGlobs = input.sessionGlobs ?? (input.sessionsGlob ? [input.sessionsGlob] : DEFAULT_SESSION_GLOBS);
    const maxFiles = Number.isInteger(input.maxFiles) ? input.maxFiles : 100;

    log.info('Scanning agent session logs', { sessionGlobs, maxFiles });

    const sessionFiles = await resolveSessionGlobs(sessionGlobs, { limit: maxFiles });
    log.info(`Found ${sessionFiles.length} session file(s)`);

    const records = [];
    let pushedRecords = 0;
    for (const filePath of sessionFiles) {
        const record = await mineSessionFile(filePath);
        records.push(record);
        await Actor.pushData(record);
        pushedRecords += 1;
    }

    const inventory = await loadCapabilityInventory();
    const pluginOpportunities = summarizePluginOpportunities(records, inventory).slice(0, input.maxOpportunities ?? 25);
    const summary = {
        sessionGlobs,
        maxFiles,
        scannedFiles: sessionFiles.length,
        pushedRecords,
        agents: [...new Set(records.map((record) => record.agent))].sort(),
        installedSkills: inventory.installedSkills,
        marketplacePluginsSeen: inventory.marketplacePlugins.length,
        pluginOpportunities,
    };
    const importPlan = buildImportPlan(summary);
    const reportHtml = buildReportHtml({ summary, records, importPlan });

    await Actor.setValue('SUMMARY', summary);
    await Actor.setValue('IMPORT_PLAN', importPlan);
    await Actor.setValue('REPORT', reportHtml, { contentType: 'text/html; charset=utf-8' });

    log.info('Agent session mining complete', { pushedRecords });
} catch (error) {
    log.exception(error, 'Claude log mining failed');
    throw error;
} finally {
    await Actor.exit();
}
