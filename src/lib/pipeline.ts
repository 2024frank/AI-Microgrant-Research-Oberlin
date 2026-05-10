import { fetchLocalistEvents } from "./localist";
import { runExtractionAgent, runEditorAgent } from "./gemini";
import { fetchExistingCHPosts, isDuplicateOfCHPost } from "./communityHub";
import {
  updatePipelineJob,
  getPipelineJob,
} from "./pipelineJobs";
import {
  saveReviewPost,
  saveDuplicateGroup,
  isEventProcessed,
  markEventProcessed,
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

export async function runPipeline(jobId: string, sourceId: string): Promise<void> {
  const job = await getPipelineJob(jobId);
  if (!job) return;

  try {
    // Step 1: Fetch Localist events
    const rawEvents = await fetchLocalistEvents(180);

    await updatePipelineJob(jobId, {
      totalFetched: rawEvents.length,
      progressTotal: rawEvents.length,
    });

    // Step 2 & 3: Filter already-processed + fetch CH posts for dedup
    const [chPosts] = await Promise.all([fetchExistingCHPosts()]);

    let queued = 0;
    let rejected = 0;
    let duplicates = 0;
    let skipped = 0;
    const duplicateGroups: Map<string, DuplicateGroup> = new Map();

    // Step 4-9: Process each event
    for (let i = 0; i < rawEvents.length; i++) {
      const rawEvent = rawEvents[i];

      // Idempotency check
      const alreadyProcessed = await isEventProcessed(String(rawEvent.id));
      if (alreadyProcessed) {
        skipped++;
        await updatePipelineJob(jobId, {
          progress: i + 1,
          totalSkipped: skipped,
        });
        continue;
      }

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

          await saveReviewPost(rejectedPost);
          await markEventProcessed(String(rawEvent.id));
          rejected++;
          await updatePipelineJob(jobId, {
            progress: i + 1,
            totalRejected: rejected,
          });
          continue;
        }

        // Step 5: Editor Agent
        const editor = await runEditorAgent(extraction, rawEvent);

        // Step 6: Community Hub dedup check
        const tempPost = buildPost(postId, extraction, editor, "pending", rawDesc, rawEvent);
        const chDuplicate = isDuplicateOfCHPost(tempPost, chPosts);

        let finalStatus: ReviewPost["status"] = "pending";
        let duplicateGroupId: string | undefined;

        if (chDuplicate) {
          finalStatus = "duplicate";
          const groupId = `ch-${chDuplicate.id}-${postId}`;
          duplicateGroupId = groupId;
          const group: DuplicateGroup = {
            id: groupId,
            postIds: [postId, `community-hub-${chDuplicate.id}`],
            similarityScore: 0.85,
            matchingSignals: ["startTime", "location"],
            conflictFields: [],
            recommendation: "Review against Community Hub post",
            status: "open",
          };
          duplicateGroups.set(groupId, group);
          duplicates++;
        } else {
          queued++;
        }

        // Step 7: Write to Firestore
        const finalPost = buildPost(postId, extraction, editor, finalStatus, rawDesc, rawEvent);
        if (duplicateGroupId) {
          (finalPost as Record<string, unknown>).duplicateGroupId = duplicateGroupId;
          (finalPost as Record<string, unknown>).duplicateWarning =
            "Potential duplicate found in Community Hub";
        }

        await saveReviewPost(finalPost);
        await markEventProcessed(String(rawEvent.id));
      } catch {
        // Don't fail the whole pipeline for a single event
      }

      await updatePipelineJob(jobId, {
        progress: i + 1,
        totalQueued: queued,
        totalRejected: rejected,
        totalDuplicates: duplicates,
        totalSkipped: skipped,
      });
    }

    // Step 8: Save duplicate groups
    for (const group of duplicateGroups.values()) {
      await saveDuplicateGroup(group);
    }

    // Step 10: Mark job complete
    await updatePipelineJob(jobId, {
      status: "completed",
      completedAt: Date.now(),
      totalQueued: queued,
      totalRejected: rejected,
      totalDuplicates: duplicates,
      totalSkipped: skipped,
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
      model: "gemini-2.5-flash",
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
