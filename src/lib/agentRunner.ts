import Anthropic from '@anthropic-ai/sdk';
import pool from './db';
import { getRejectionHistory } from './rejectionHistory';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Trigger a Claude agent run for a given source.
 * The agent outputs JSON events, we read them and write to raw_events.
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
    // Get rejection history to inject as learning context
    const { prompt_block } = await getRejectionHistory(sourceId, 50);

    // Build the full system prompt: stored prompt + rejection history
    const systemPrompt = [source.system_prompt, prompt_block].filter(Boolean).join('\n\n');

    // Trigger the agent — it runs, fetches events, returns JSON
    const message = await client.beta.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 8096,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: 'Run extraction now. Return only the JSON array of events.' }],
      // Use the shared environment and vault from env vars
      // (betas for agent toolset if needed)
    } as any);

    // Parse the JSON output from the agent
    const text = message.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    // Extract JSON array from response (agent may wrap in ```json blocks)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Agent returned no JSON array');

    const events: any[] = JSON.parse(jsonMatch[0]);

    // Write events to raw_events
    const inserted: any[] = [];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
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
            ev.eventType || 'ot',
            ev.title,
            ev.description,
            ev.extendedDescription || null,
            JSON.stringify(ev.sponsors      || []),
            JSON.stringify(ev.postTypeId    || []),
            JSON.stringify(ev.sessions      || []),
            ev.locationType || 'ne',
            ev.location     || null,
            ev.placeId      || null,
            ev.placeName    || null,
            ev.roomNum      || null,
            ev.urlLink      || null,
            ev.display      || 'all',
            JSON.stringify(ev.screensIds    || []),
            JSON.stringify(ev.buttons       || []),
            ev.contactEmail || null,
            ev.phone        || null,
            ev.website      || null,
            ev.image_cdn_url|| null,
            ev.calendarSourceName || source.calendar_source_name,
            ev.calendarSourceUrl  || null,
            ev.geo_scope    || null,
            ev.geo ? JSON.stringify(ev.geo) : null,
          ]
        ) as any;

        const eventId = res.insertId;
        const ingestedPostUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${eventId}`;
        await conn.query(
          'UPDATE raw_events SET ingested_post_url = ? WHERE id = ?',
          [ingestedPostUrl, eventId]
        );
        inserted.push({ id: eventId, title: ev.title });
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      (conn as any).release();
    }

    // Close run with stats
    await pool.query(
      `UPDATE agent_runs SET
        status='completed', finished_at=NOW(),
        events_extracted=?, events_found=?,
        prompt_tokens=?, completion_tokens=?
       WHERE id=?`,
      [
        inserted.length, events.length,
        message.usage?.input_tokens  || null,
        message.usage?.output_tokens || null,
        runId,
      ]
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
