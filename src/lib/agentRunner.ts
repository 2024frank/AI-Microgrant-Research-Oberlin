import Anthropic from '@anthropic-ai/sdk';
import pool from './db';
import { getRejectionHistory } from './rejectionHistory';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Trigger a Claude agent run for a given source.
 *
 * Each source has its own agent (unique agent_id) but shares
 * the same environment and vault (from env vars). The agent
 * already knows how to fetch its source internally — we just
 * trigger it and read the JSON it outputs.
 */
export async function triggerAgentRun(sourceId: number) {
  const [[source]] = await pool.query(
    'SELECT * FROM sources WHERE id = ? AND active = 1', [sourceId]
  ) as any;
  if (!source) throw new Error(`Source ${sourceId} not found or inactive`);

  // Open a run record
  const [runResult] = await pool.query(
    'INSERT INTO agent_runs (source_id, status) VALUES (?, "running")', [sourceId]
  ) as any;
  const runId = runResult.insertId;

  try {
    // Get rejection history for this source → injected so agent learns from mistakes
    const { prompt_block } = await getRejectionHistory(sourceId, 50);

    // Trigger the agent via Anthropic's agent platform.
    // The agent_id is what's unique per source — env/vault are shared.
    const run = await (client as any).beta.agents.runs.create({
      agent_id:       source.agent_id,
      environment_id: process.env.SOURCE_BUILDER_ENVIRONMENT_ID,
      vault_id:       process.env.SOURCE_BUILDER_VAULT_ID,
      // Pass rejection history as a user message so the agent learns from it
      messages: [
        {
          role:    'user',
          content: prompt_block
            ? `Run extraction now.\n\n${prompt_block}\n\nReturn only the JSON array of events.`
            : 'Run extraction now. Return only the JSON array of events.',
        },
      ],
    });

    // Poll until the run completes
    let result = run;
    while (result.status === 'running' || result.status === 'queued') {
      await new Promise(r => setTimeout(r, 2000));
      result = await (client as any).beta.agents.runs.retrieve(result.id);
    }

    if (result.status !== 'completed') {
      throw new Error(`Agent run ended with status: ${result.status}`);
    }

    // Extract the JSON array from the agent's output
    const outputText: string = result.output_messages
      ?.filter((m: any) => m.role === 'assistant')
      ?.map((m: any) => typeof m.content === 'string' ? m.content : m.content?.[0]?.text || '')
      ?.join('') || '';

    const jsonMatch = outputText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Agent returned no JSON array');

    const events: any[] = JSON.parse(jsonMatch[0]);

    // Write events to MySQL
    const inserted = await writeEvents(events, sourceId, runId, source.calendar_source_name);

    // Close run with stats
    await pool.query(
      `UPDATE agent_runs SET
         status='completed', finished_at=NOW(),
         events_found=?, events_extracted=?
       WHERE id=?`,
      [events.length, inserted.length, runId]
    );

    return { run_id: runId, inserted: inserted.length, events: inserted };

  } catch (err: any) {
    await pool.query(
      `UPDATE agent_runs SET status='failed', finished_at=NOW(), error_log=? WHERE id=?`,
      [JSON.stringify([err.message]), runId]
    );
    throw err;
  }
}

async function writeEvents(events: any[], sourceId: number, runId: number, calendarSourceName: string) {
  const inserted: any[] = [];
  const conn = await pool.getConnection();
  try {
    await (conn as any).beginTransaction();

    for (const ev of events) {
      const [res] = await conn.query(
        `INSERT INTO raw_events (
          source_id, agent_run_id, event_type, title, description,
          extended_description, sponsors, post_type_ids, sessions,
          location_type, location, place_id, place_name, room_num,
          url_link, display, screen_ids, buttons, contact_email,
          phone, website, image_cdn_url, calendar_source_name,
          calendar_source_url, geo_scope, geo_json, status
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')`,
        [
          sourceId, runId,
          ev.eventType        || 'ot',
          ev.title,
          ev.description,
          ev.extendedDescription  || null,
          JSON.stringify(ev.sponsors     || []),
          JSON.stringify(ev.postTypeId   || []),
          JSON.stringify(ev.sessions     || []),
          ev.locationType     || 'ne',
          ev.location         || null,
          ev.placeId          || null,
          ev.placeName        || null,
          ev.roomNum          || null,
          ev.urlLink          || null,
          ev.display          || 'all',
          JSON.stringify(ev.screensIds   || []),
          JSON.stringify(ev.buttons      || []),
          ev.contactEmail     || null,
          ev.phone            || null,
          ev.website          || null,
          ev.image_cdn_url    || null,
          ev.calendarSourceName || calendarSourceName,
          ev.calendarSourceUrl  || null,
          ev.geo_scope        || null,
          ev.geo ? JSON.stringify(ev.geo) : null,
        ]
      ) as any;

      const eventId = res.insertId;

      // Build ingestedPostUrl now that we have the row ID
      const ingestedPostUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventId}`;
      await conn.query(
        'UPDATE raw_events SET ingested_post_url = ? WHERE id = ?',
        [ingestedPostUrl, eventId]
      );

      inserted.push({ id: eventId, title: ev.title, ingested_post_url: ingestedPostUrl });
    }

    await (conn as any).commit();
    return inserted;
  } catch (e) {
    await (conn as any).rollback();
    throw e;
  } finally {
    (conn as any).release();
  }
}
