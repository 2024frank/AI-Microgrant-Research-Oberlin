import { ensureMysqlSchema, getMysqlPool, json, parseJson } from "./mysql";
import type { ReviewPost, DuplicateGroup, ReviewStatus } from "./postTypes";

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export async function saveReviewPost(post: ReviewPost): Promise<void> {
  await ensureMysqlSchema();
  const existing = await getReviewPost(post.id);
  const data = stripUndefined({
    ...(existing ?? {}),
    ...post,
    updatedAt: Date.now(),
    createdAt: post.createdAt ?? existing?.createdAt ?? Date.now(),
  }) as ReviewPost;
  await getMysqlPool().execute(
    `INSERT INTO review_posts (id, data)
     VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [post.id, json(data)]
  );
}

export async function bulkSaveReviewPosts(posts: ReviewPost[]): Promise<void> {
  if (posts.length === 0) return;
  await ensureMysqlSchema();
  const chunks: ReviewPost[][] = [];
  for (let i = 0; i < posts.length; i += 100) chunks.push(posts.slice(i, i + 100));

  for (const chunk of chunks) {
    const values: any[] = [];
    const placeholders = chunk
      .map((post) => {
        const data = stripUndefined({
          ...post,
          updatedAt: Date.now(),
          createdAt: post.createdAt ?? Date.now(),
        });
        values.push(post.id, json(data));
        return "(?, CAST(? AS JSON))";
      })
      .join(",");

    await getMysqlPool().execute(
      `INSERT INTO review_posts (id, data)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      values
    );
  }
}

export async function getReviewPost(id: string): Promise<ReviewPost | null> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT data FROM review_posts WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows[0]) return null;
  return parseJson<ReviewPost>(rows[0].data, null as unknown as ReviewPost);
}

export async function updateReviewPost(
  id: string,
  updates: Partial<ReviewPost>
): Promise<void> {
  await ensureMysqlSchema();
  const existing = await getReviewPost(id);
  if (!existing) return;
  await saveReviewPost({ ...existing, ...updates, updatedAt: Date.now() } as unknown as ReviewPost);
}

export async function deleteReviewPost(id: string): Promise<void> {
  await ensureMysqlSchema();
  await getMysqlPool().execute("DELETE FROM review_posts WHERE id = ?", [id]);
}

export async function listReviewPosts(options?: {
  status?: ReviewStatus;
  maxResults?: number;
}): Promise<ReviewPost[]> {
  await ensureMysqlSchema();
  const maxResults = Math.max(1, Math.min(Number(options?.maxResults ?? 500), 500));
  const params: Array<string | number> = [];
  let sql = "SELECT data FROM review_posts";
  if (options?.status) {
    sql += " WHERE status = ?";
    params.push(options.status);
  }
  sql += ` ORDER BY created_at DESC LIMIT ${maxResults}`;
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(sql, params);
  return rows.map((row) => parseJson<ReviewPost>(row.data, null as unknown as ReviewPost));
}

export async function listAllReviewPosts(): Promise<ReviewPost[]> {
  return listReviewPosts({ maxResults: 500 });
}

export async function getReviewPostStats(): Promise<{
  pending: number;
  approved: number;
  rejected: number;
  duplicate: number;
  published: number;
  total: number;
}> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT status, COUNT(*) AS count FROM review_posts GROUP BY status"
  );
  const counts = { pending: 0, approved: 0, rejected: 0, duplicate: 0, published: 0, total: 0 };
  rows.forEach((row) => {
    const status = row.status as ReviewStatus;
    const count = Number(row.count) || 0;
    counts.total += count;
    if (status === "pending" || status === "needs_correction") counts.pending += count;
    else if (status === "approved") counts.approved += count;
    else if (status === "rejected") counts.rejected += count;
    else if (status === "duplicate") counts.duplicate += count;
    else if (status === "published") counts.published += count;
  });
  return counts;
}

export async function saveDuplicateGroup(group: DuplicateGroup): Promise<void> {
  await ensureMysqlSchema();
  await getMysqlPool().execute(
    `INSERT INTO duplicate_groups (id, data)
     VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [group.id, json({ ...group, updatedAt: Date.now() })]
  );
}

export async function bulkSaveDuplicateGroups(groups: DuplicateGroup[]): Promise<void> {
  if (groups.length === 0) return;
  await ensureMysqlSchema();
  const chunks: DuplicateGroup[][] = [];
  for (let i = 0; i < groups.length; i += 100) chunks.push(groups.slice(i, i + 100));

  for (const chunk of chunks) {
    const values: any[] = [];
    const placeholders = chunk
      .map((group) => {
        values.push(group.id, json({ ...group, updatedAt: Date.now() }));
        return "(?, CAST(? AS JSON))";
      })
      .join(",");

    await getMysqlPool().execute(
      `INSERT INTO duplicate_groups (id, data)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      values
    );
  }
}

export async function updateDuplicateGroup(
  id: string,
  updates: Partial<DuplicateGroup>
): Promise<void> {
  await ensureMysqlSchema();
  const groups = await listDuplicateGroups();
  const existing = groups.find((group) => group.id === id);
  if (!existing) return;
  await saveDuplicateGroup({ ...existing, ...updates } as DuplicateGroup);
}

export async function listDuplicateGroups(): Promise<DuplicateGroup[]> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT data FROM duplicate_groups ORDER BY updated_at DESC LIMIT 200"
  );
  return rows.map((row) => parseJson<DuplicateGroup>(row.data, null as unknown as DuplicateGroup));
}

export async function isEventProcessed(localistEventId: string): Promise<boolean> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT id FROM processed_event_ids WHERE id = ? LIMIT 1",
    [localistEventId]
  );
  return Boolean(rows[0]);
}

/** Returns Localist event ids already recorded in MySQL `processed_event_ids` (dedupe / idempotency). Not Firestore. */
export async function bulkCheckProcessed(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  await ensureMysqlSchema();
  const processed = new Set<string>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
  for (const chunk of chunks) {
    const placeholders = chunk.map(() => "?").join(",");
    const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
      `SELECT id FROM processed_event_ids WHERE id IN (${placeholders})`,
      chunk
    );
    for (const row of rows) {
      processed.add(String(row.id));
    }
  }
  return processed;
}

/** Persist Localist event id to MySQL `processed_event_ids` after a successful pipeline outcome for that event. */
export async function markEventProcessed(localistEventId: string): Promise<void> {
  await ensureMysqlSchema();
  await getMysqlPool().execute(
    `INSERT INTO processed_event_ids (id, processed_at)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE processed_at = VALUES(processed_at)`,
    [localistEventId, Date.now()]
  );
}

export async function bulkMarkEventsProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await ensureMysqlSchema();
  const now = Date.now();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));

  for (const chunk of chunks) {
    const values: any[] = [];
    const placeholders = chunk
      .map((id) => {
        values.push(id, now);
        return "(?, ?)";
      })
      .join(",");

    await getMysqlPool().execute(
      `INSERT INTO processed_event_ids (id, processed_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE processed_at = VALUES(processed_at)`,
      values
    );
  }
}

export async function countProcessedEventIds(): Promise<number> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT COUNT(*) AS c FROM processed_event_ids"
  );
  return Number(rows[0]?.c ?? 0);
}

/** Removes all Localist dedupe keys so the pipeline can re-ingest events. Does not delete review posts. */
export async function clearProcessedEventIds(): Promise<number> {
  await ensureMysqlSchema();
  const [result] = await getMysqlPool().execute("DELETE FROM processed_event_ids");
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}
