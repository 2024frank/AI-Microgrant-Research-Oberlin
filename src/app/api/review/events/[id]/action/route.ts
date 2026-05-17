import { NextRequest } from 'next/server';
import pool from '@/lib/db';
import { getAuthUser, unauthorized } from '@/lib/auth';

const CH_BASE = 'https://oberlin.communityhub.cloud/api/legacy/calendar';

// POST /api/review/events/:id/approve
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { edits = {}, time_spent_sec = null, action } = await req.json();
  const eventId = params.id;

  const [[event]] = await pool.query('SELECT * FROM raw_events WHERE id = ?', [eventId]) as any;
  if (!event) return Response.json({ error: 'Not found' }, { status: 404 });
  if (event.status !== 'pending') return Response.json({ error: 'Already reviewed' }, { status: 409 });

  const [[dbUser]] = await pool.query(
    'SELECT id FROM users WHERE firebase_uid = ?', [user.uid]
  ) as any;
  const reviewerId = dbUser?.id;

  const conn = await pool.getConnection();
  try {
    await (conn as any).beginTransaction();

    if (action === 'reject') {
      const { reason_codes, reviewer_note = '' } = edits;
      if (!reason_codes?.length) {
        return Response.json({ error: 'reason_codes required' }, { status: 400 });
      }
      await conn.query('UPDATE raw_events SET status="rejected" WHERE id=?', [eventId]);
      await conn.query(
        `INSERT INTO rejection_log
           (raw_event_id, source_id, reviewer_id, reason_codes, reviewer_note, event_title, event_snapshot)
         VALUES (?,?,?,?,?,?,?)`,
        [eventId, event.source_id, reviewerId, JSON.stringify(reason_codes),
         reviewer_note, event.title, JSON.stringify(event)]
      );
      await conn.query(
        `INSERT INTO review_sessions (raw_event_id, reviewer_id, action, time_spent_sec, submitted_to_ch)
         VALUES (?,?,'rejected',?,0)`,
        [eventId, reviewerId, time_spent_sec]
      );
      await (conn as any).commit();
      return Response.json({ ok: true });
    }

    // APPROVE — log field edits, submit to CommunityHub
    const editableFields = ['title','description','extended_description','sessions',
      'location_type','location','place_name','room_num','url_link','sponsors',
      'post_type_ids','geo_scope','contact_email','phone','website','image_cdn_url',
      'buttons','display'];

    for (const field of editableFields) {
      if (edits[field] !== undefined) {
        const oldVal = JSON.stringify(event[field] ?? '');
        const newVal = JSON.stringify(edits[field]);
        if (oldVal !== newVal) {
          await conn.query(
            `INSERT INTO field_edit_log (raw_event_id, source_id, reviewer_id, field_name, old_value, new_value)
             VALUES (?,?,?,?,?,?)`,
            [eventId, event.source_id, reviewerId, field, String(event[field] ?? ''), String(edits[field])]
          );
        }
      }
    }

    // Apply edits
    const merged = { ...event, ...edits };

    // Build CommunityHub payload
    const payload: any = {
      eventType:          merged.event_type,
      email:              process.env.COMMUNITYHUB_EMAIL || 'fkusiapp@oberlin.edu',
      subscribe:          true,
      title:              merged.title,
      description:        merged.description,
      sponsors:           JSON.parse(merged.sponsors      || '[]'),
      postTypeId:         JSON.parse(merged.post_type_ids || '[]'),
      sessions:           JSON.parse(merged.sessions      || '[]'),
      locationType:       merged.location_type,
      display:            merged.display || 'all',
      screensIds:         JSON.parse(merged.screen_ids    || '[]'),
      public:             '1',
      calendarSourceName: merged.calendar_source_name,
      calendarSourceUrl:  merged.calendar_source_url,
      ingestedPostUrl:    merged.ingested_post_url,
    };
    if (merged.extended_description) payload.extendedDescription = merged.extended_description;
    if (merged.contact_email)        payload.contactEmail        = merged.contact_email;
    if (merged.phone)                payload.phone               = merged.phone;
    if (merged.website)              payload.website             = merged.website;
    if (merged.image_cdn_url)        payload.image_cdn_url       = merged.image_cdn_url;
    if (merged.buttons)              payload.buttons             = JSON.parse(merged.buttons);
    if (merged.place_id)             payload.placeId             = merged.place_id;
    if (merged.place_name)           payload.placeName           = merged.place_name;
    if (merged.room_num)             payload.roomNum             = merged.room_num;
    if (['ph2','bo'].includes(merged.location_type)) payload.location = merged.location;
    if (['on', 'bo'].includes(merged.location_type)) payload.urlLink  = merged.url_link;

    const chRes  = await fetch(`${CH_BASE}/post/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const chData = await chRes.json();

    await conn.query(
      `UPDATE raw_events SET status='approved', communityhub_post_id=? WHERE id=?`,
      [chData?.id || chData?.post_id || null, eventId]
    );
    await conn.query(
      `INSERT INTO review_sessions (raw_event_id, reviewer_id, action, time_spent_sec, submitted_to_ch, ch_response)
       VALUES (?,?,'approved',?,1,?)`,
      [eventId, reviewerId, time_spent_sec, JSON.stringify(chData)]
    );

    await (conn as any).commit();
    return Response.json({ ok: true, communityhub: chData });
  } catch (err: any) {
    await (conn as any).rollback();
    return Response.json({ error: err.message }, { status: 500 });
  } finally {
    (conn as any).release();
  }
}
