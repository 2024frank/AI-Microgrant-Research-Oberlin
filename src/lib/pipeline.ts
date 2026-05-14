import { fetchLocalistEvents } from "./localist";
import { runExtractionAgent, runEditorAgent, runDedupAgent, GeminiQuotaError } from "./gemini";
import { fetchExistingCHPosts } from "./communityHub";
import {
  updatePipelineJob,
  getPipelineJob,
} from "./pipelineJobs";
import {
  saveReviewPost,
  saveDuplicateGroup,
  bulkCheckProcessed,
  markEventProcessed,
  bulkSaveReviewPosts,
  bulkSaveDuplicateGroups,
  bulkMarkEventsProcessed,
} from "./reviewStore";
import { recordSourceRun } from "./sources";
import { listAuthorizedUsersAdmin } from "./usersAdmin";
import { getReviewPostStats } from "./reviewStore";
import { sendPipelineCompleteEmail } from "./emailServer";
import type { ReviewPost, EventPost, AnnouncementPost, DuplicateGroup } from "./postTypes";

const ADMIN_EMAIL = "fkusiapp@oberlin.edu";

function generatePostId(localistEventId: string | number): string {
  return `oberlin-${String(localistEventId)}`;
}

const TIME_LIMIT_MS = 240_000; // 240s — leave 60s buffer before Vercel's 300s limit

async function triggerContinuation(jobId: string, sourceId: string) {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://ai-microgrant-research-oberlin.vercel.app").replace(/\/$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.CRON_SECRET) headers["x-cron-secret"] = process.env.CRON_SECRET;
  try {
    await fetch(`${baseUrl}/api/pipeline/continue`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jobId, sourceId }),
    });
  } catch { /* best effort */ }
}

export async function runPipeline(jobId: string, sourceId: string): Promise<void> {
  const startTime = Date.now();
  const job = await getPipelineJob(jobId);
  if (!job) return;
  if (job.status !== "running") return;

  const CONCURRENCY = 8;
  const BATCH_SIZE = 16;

  try {
    let currentPage = job.currentPage || 1;
    let isFinalPage = false;

    // Restore cumulative counters from job (continuation adds to these)
    let queued = job.totalQueued || 0;
    let rejected = job.totalRejected || 0;
    let duplicates = job.totalDuplicates || 0;
    let totalFetched = job.totalFetched || 0;
    let totalSkipped = job.totalSkipped || 0;

    // Step 3: Fetch Community Hub posts for dedup (once per invocation)
    const chPosts = await fetchExistingCHPosts();

    while (!isFinalPage) {
      // Step 1: Fetch Localist events in pages
      const PAGE_CHUNK = 5; // Fetch 5 pages at a time (500 events)
      const rawEvents = await fetchLocalistEvents(180, 100, currentPage, PAGE_CHUNK);

      if (rawEvents.length === 0) {
        isFinalPage = true;
        break;
      }

      // Step 2: Idempotency
      const allIds = rawEvents.map((e) => String(e.id));
      const processedSet = await bulkCheckProcessed(allIds);

      const batchAlreadyIngested = rawEvents.filter((e) => processedSet.has(String(e.id)));
      const batchNewEvents = rawEvents.filter((e) => !processedSet.has(String(e.id)));

      totalFetched += rawEvents.length;
      totalSkipped += batchAlreadyIngested.length;

      await updatePipelineJob(jobId, {
        totalFetched,
        totalSkipped,
        progressTotal: totalFetched - totalSkipped,
      });

      // Step 4-9: Process the batch
      for (let i = 0; i < batchNewEvents.length; i += BATCH_SIZE) {
        // Time limit check
        if (Date.now() - startTime > TIME_LIMIT_MS) {
          await updatePipelineJob(jobId, {
            totalQueued: queued,
            totalRejected: rejected,
            totalDuplicates: duplicates,
            totalFetched,
            totalSkipped,
            currentPage,
            continuationIndex: 0,
          });
          await triggerContinuation(jobId, sourceId);
          return;
        }

        const batch = batchNewEvents.slice(i, i + BATCH_SIZE);
        const batchResults: ReviewPost[] = [];
        const batchDuplicates: DuplicateGroup[] = [];
        const processedIds: string[] = [];

        let batchQueued = 0;
        let batchRejected = 0;
        let batchDuplicatesCount = 0;

        let eventIndexInBatch = 0;
        const workers = Array.from({ length: CONCURRENCY }, async () => {
          while (eventIndexInBatch < batch.length) {
            const currentIndex = eventIndexInBatch++;
            const rawEvent = batch[currentIndex];
            const postId = generatePostId(String(rawEvent.id));

            try {
              // Step 4: Extraction Agent
              const extraction = await runExtractionAgent(rawEvent);

              const rawDesc = (rawEvent.description_text || rawEvent.description || "")
                .replace(/<[^>]*>/g, "")
                .replace(/More info:.*$/i, "")
                .trim();

              // Auto-reject athletics
              if (extraction.isAthletic) {
                const rejectedPost: ReviewPost = buildPost(postId, extraction, {
                  description: rawDesc.slice(0, 200) || rawEvent.title,
                  extendedDescription: "",
                }, "rejected", rawDesc, rawEvent);

                batchResults.push(rejectedPost);
                processedIds.push(String(rawEvent.id));
                batchRejected++;
                continue;
              }

              // Step 5: Editor Agent
              const editor = await runEditorAgent(extraction, rawEvent);

              // Step 6: AI-powered Community Hub dedup check
              const dedupResult = await runDedupAgent(
                {
                  title: extraction.title,
                  startTime: extraction.sessions[0]?.startTime,
                  location: extraction.location ?? undefined,
                  description: rawDesc,
                },
                chPosts.map((p) => ({
                  id: p.id,
                  title: p.title,
                  startTime: p.startTime,
                  location: p.location,
                }))
              );

              let finalStatus: ReviewPost["status"] = "pending";
              let duplicateGroupId: string | undefined;

              if (dedupResult.isDuplicate && dedupResult.confidence >= 0.7) {
                finalStatus = "duplicate";
                const matchId = dedupResult.matchedId ?? "unknown";
                const groupId = `ch-${matchId}-${postId}`;
                duplicateGroupId = groupId;
                const group: DuplicateGroup = {
                  id: groupId,
                  postIds: [postId, `community-hub-${matchId}`],
                  similarityScore: dedupResult.confidence,
                  matchingSignals: [dedupResult.reason],
                  conflictFields: [],
                  recommendation: `AI detected duplicate: "${dedupResult.matchedTitle}" — ${dedupResult.reason}`,
                  status: "open",
                };
                batchDuplicates.push(group);
                batchDuplicatesCount++;
              } else {
                batchQueued++;
              }

              // Step 7: Build review post
              const finalPost = buildPost(postId, extraction, editor, finalStatus, rawDesc, rawEvent);
              if (duplicateGroupId) {
                (finalPost as Record<string, unknown>).duplicateGroupId = duplicateGroupId;
                (finalPost as Record<string, unknown>).duplicateWarning =
                  "Potential duplicate found in Community Hub";
              }

              batchResults.push(finalPost);
              processedIds.push(String(rawEvent.id));
            } catch (eventErr) {
              if (eventErr instanceof GeminiQuotaError) throw eventErr;
              // Non-quota errors: skip and continue
            }
          }
        });

        try {
          await Promise.all(workers);
        } catch (err) {
          if (err instanceof GeminiQuotaError) {
            await updatePipelineJob(jobId, {
              status: "failed",
              completedAt: Date.now(),
              error: "Gemini API quota exceeded. Email alert sent to admin.",
              totalQueued: queued,
              totalRejected: rejected,
              totalDuplicates: duplicates,
              totalFetched,
              totalSkipped,
              currentPage,
            });
            return;
          }
          throw err;
        }

        // Step 8: Bulk save batch results
        await Promise.all([
          bulkSaveReviewPosts(batchResults),
          bulkSaveDuplicateGroups(batchDuplicates),
          bulkMarkEventsProcessed(processedIds),
        ]);

        queued += batchQueued;
        rejected += batchRejected;
        duplicates += batchDuplicatesCount;

        await updatePipelineJob(jobId, {
          progress: totalFetched - totalSkipped,
          totalQueued: queued,
          totalRejected: rejected,
          totalDuplicates: duplicates,
        });
      }

      currentPage += PAGE_CHUNK;
    }

    // Step 10: Mark job complete
    await updatePipelineJob(jobId, {
      status: "completed",
      completedAt: Date.now(),
      continuationIndex: 0,
      currentPage: 1,
      totalQueued: queued,
      totalRejected: rejected,
      totalDuplicates: duplicates,
    });

    await recordSourceRun(sourceId, jobId);

    // Send notification email to all active reviewers/admins if new events were queued
    if (queued > 0) {
      try {
        const [users, stats, source] = await Promise.all([
          listAuthorizedUsersAdmin(),
          getReviewPostStats(),
          import("./sources").then((m) => m.getSource(sourceId)),
        ]);
        const recipientEmails = users
          .filter((u) => u.status === "active" && ["reviewer", "admin", "super_admin"].includes(u.role))
          .map((u) => u.email)
          .filter(Boolean) as string[];

        if (recipientEmails.length > 0) {
          await sendPipelineCompleteEmail({
            to: recipientEmails,
            queued,
            rejected,
            duplicates,
            sourceName: source?.name ?? "Oberlin College Calendar",
            totalPending: stats.pending,
          });
        }
      } catch {
        // Email failure should not fail the pipeline
      }
    }
  } catch (err) {
    await updatePipelineJob(jobId, {
      status: "failed",
      completedAt: Date.now(),
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

function buildPost(
  postId: string,
  extraction: Awaited<ReturnType<typeof runExtractionAgent>>,
  editor: { description: string; extendedDescription: string },
  status: ReviewPost["status"],
  rawDescription?: string,
  rawEvent?: import("./localist").LocalistEvent
): ReviewPost {
  const contactEmail = rawEvent?.custom_fields?.contact_email_address || undefined;
  const contactPhone = rawEvent?.custom_fields?.contact_phone_number || undefined;
  const roomNum = rawEvent?.room_number ? String(rawEvent.room_number) : undefined;
  const base = {
    id: postId,
    email: ADMIN_EMAIL,
    title: extraction.title,
    description: editor.description,
    extendedDescription: editor.extendedDescription,
    originalDescription: rawDescription ?? "",
    sponsors: extraction.sponsors,
    postTypeId: extraction.postTypeId,
    sessions: extraction.sessions,
    display: "all" as const,
    screensIds: [],
    status,
    sourceName: "Oberlin College Calendar",
    sourceUrl: extraction.calendarSourceUrl,
    calendarSourceName: extraction.calendarSourceName,
    calendarSourceUrl: extraction.calendarSourceUrl,
    image_cdn_url: extraction.image_cdn_url ?? undefined,
    imageUrl: extraction.image_cdn_url ?? undefined,
    aiConfidence: extraction.confidence,
    extractedMetadata: {
      extractedAt: new Date().toISOString(),
      model: "gemini-1.5-flash",
      sourceRecordId: postId.replace("oberlin-", ""),
    },
    createdAt: Date.now(),
  };

  if (extraction.eventType === "an") {
    const ann: AnnouncementPost = {
      ...base,
      eventType: "an",
      locationType: "ne",
      website: extraction.website ?? undefined,
      contactEmail,
      phone: contactPhone,
    };
    return ann;
  }

  const evt: EventPost = {
    ...base,
    eventType: "ot",
    locationType: extraction.locationType as EventPost["locationType"],
    location: extraction.location ?? undefined,
    urlLink: extraction.urlLink ?? undefined,
    website: extraction.website ?? undefined,
    contactEmail,
    phone: contactPhone,
    roomNum,
  };
  return evt;
}
