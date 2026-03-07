import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = new URL('..', import.meta.url).pathname;
const outputDir = join(repoRoot, 'docs/live-provider/reports');
const postgresContainer = process.env.POSTGRES_CONTAINER ?? 'f1-vibetiming-postgres';
const postgresUser = process.env.POSTGRES_USER ?? 'postgres';
const postgresDb = process.env.POSTGRES_DB ?? 'f1_vibetiming';

const runQuery = (query) => {
  const output = execFileSync(
    'docker',
    [
      'exec',
      '-i',
      postgresContainer,
      'psql',
      '-U',
      postgresUser,
      '-d',
      postgresDb,
      '-t',
      '-A',
      '-P',
      'pager=off',
      '-c',
      query,
    ],
    {
      encoding: 'utf8',
    },
  ).trim();

  if (output.length === 0) {
    return null;
  }

  return JSON.parse(output);
};

const report = {
  generatedAt: new Date().toISOString(),
  activeRun: runQuery(`
    select row_to_json(t)
    from (
      select
        source,
        status,
        "eventsCaptured",
        "decodeErrors",
        "sessionKey",
        "startedAt",
        "lastEventAt"
      from "LiveCaptureRun"
      where status = 'ACTIVE'
      order by "startedAt" desc
      limit 1
    ) t;
  `),
  latestFinishedRun: runQuery(`
    select row_to_json(t)
    from (
      select
        source,
        status,
        "eventsCaptured",
        "decodeErrors",
        "sessionKey",
        "startedAt",
        "lastEventAt"
      from "LiveCaptureRun"
      where status in ('COMPLETED', 'INTERRUPTED')
        and "eventsCaptured" > 0
      order by "startedAt" desc
      limit 1
    ) t;
  `),
  topicCounts: runQuery(`
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select
        topic,
        count(*)::int as "eventCount",
        min("emittedAt") as "firstSeen",
        max("emittedAt") as "lastSeen"
      from "LiveProviderEvent"
      group by topic
      order by count(*) desc, topic asc
    ) t;
  `),
  shapeCounts: runQuery(`
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select
        topic,
        count(*)::int as "shapeCount",
        sum(observations)::int as observations
      from "LiveTopicSchemaCatalog"
      group by topic
      order by observations desc, topic asc
    ) t;
  `),
  recentCatalog: runQuery(`
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select
        topic,
        "rawTopic",
        observations,
        "decodeErrorCount",
        "lastSeenAt"
      from "LiveTopicSchemaCatalog"
      order by "lastSeenAt" desc
      limit 20
    ) t;
  `),
};

const shapeCountByTopic = new Map(
  (report.shapeCounts ?? []).map((entry) => [entry.topic, entry.shapeCount]),
);

const markdown = [
  '# Latest Capture Summary',
  '',
  `Generated at: \`${report.generatedAt}\``,
  '',
  '## Runs',
  '',
  `- Active run: ${report.activeRun ? `\`${report.activeRun.sessionKey ?? 'pending-session-key'}\` (${report.activeRun.eventsCaptured} events, ${report.activeRun.decodeErrors} decode errors)` : 'none'}`,
  `- Latest finished run: ${report.latestFinishedRun ? `\`${report.latestFinishedRun.sessionKey}\` (${report.latestFinishedRun.eventsCaptured} events, ${report.latestFinishedRun.decodeErrors} decode errors)` : 'none'}`,
  '',
  '## Topic Counts',
  '',
  '| Topic | Events | Shapes | First seen | Last seen |',
  '| --- | ---: | ---: | --- | --- |',
  ...(report.topicCounts ?? []).map(
    (entry) =>
      `| \`${entry.topic}\` | ${entry.eventCount} | ${shapeCountByTopic.get(entry.topic) ?? 0} | \`${entry.firstSeen}\` | \`${entry.lastSeen}\` |`,
  ),
  '',
  '## Recent Catalog Rows',
  '',
  '| Topic | Raw topic | Observations | Decode errors | Last seen |',
  '| --- | --- | ---: | ---: | --- |',
  ...(report.recentCatalog ?? []).map(
    (entry) =>
      `| \`${entry.topic}\` | \`${entry.rawTopic}\` | ${entry.observations} | ${entry.decodeErrorCount} | \`${entry.lastSeenAt}\` |`,
  ),
  '',
];

mkdirSync(outputDir, { recursive: true });

writeFileSync(
  join(outputDir, 'latest-capture-summary.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

writeFileSync(
  join(outputDir, 'latest-capture-summary.md'),
  `${markdown.join('\n')}\n`,
  'utf8',
);

process.stdout.write(`Wrote ${join(outputDir, 'latest-capture-summary.json')}\n`);
process.stdout.write(`Wrote ${join(outputDir, 'latest-capture-summary.md')}\n`);
