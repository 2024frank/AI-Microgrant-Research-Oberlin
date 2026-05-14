import { NextResponse } from "next/server";
import { ensureMysqlSchema, getMysqlPool } from "@/lib/mysql";
import { ensureDefaultSources } from "@/lib/sources";

export const dynamic = "force-dynamic";

async function clearCollection(name: string) {
  await ensureMysqlSchema();
  const tableMap: Record<string, string> = {
    reviewPosts: "review_posts",
    duplicateGroups: "duplicate_groups",
    processedEventIds: "processed_event_ids",
    pipelineJobs: "pipeline_jobs",
    postFeedback: "post_feedback",
    aiLearningEvents: "ai_learning_events",
    sourceBuilderSessions: "source_builder_sessions",
    sources: "sources",
    appUsers: "app_users",
    accessRequests: "access_requests",
    teamChatMessages: "team_chat_messages",
    sourceConfigs: "source_configs",
    sourceBuilderUiChats: "source_builder_ui_chats",
  };
  const table = tableMap[name];
  if (!table) return 0;
  const [result] = await getMysqlPool().execute(`DELETE FROM ${table}`);
  return Number((result as { affectedRows?: number }).affectedRows ?? 0);
}

export async function POST() {
  try {
    const [
      posts,
      dupes,
      processed,
      jobs,
      feedback,
      learning,
      builder,
      sourcesCleared,
      appUsers,
      accessReq,
      teamChat,
      sourceCfgs,
      uiChats,
    ] = await Promise.all([
      clearCollection("reviewPosts"),
      clearCollection("duplicateGroups"),
      clearCollection("processedEventIds"),
      clearCollection("pipelineJobs"),
      clearCollection("postFeedback"),
      clearCollection("aiLearningEvents"),
      clearCollection("sourceBuilderSessions"),
      clearCollection("sources"),
      clearCollection("appUsers"),
      clearCollection("accessRequests"),
      clearCollection("teamChatMessages"),
      clearCollection("sourceConfigs"),
      clearCollection("sourceBuilderUiChats"),
    ]);

    await ensureDefaultSources();

    return NextResponse.json({
      success: true,
      cleared: {
        posts,
        duplicates: dupes,
        processedIds: processed,
        jobs,
        feedback,
        learning,
        sourceBuilderSessions: builder,
        sources: sourcesCleared,
        appUsers,
        accessRequests: accessReq,
        teamChatMessages: teamChat,
        sourceConfigs: sourceCfgs,
        sourceBuilderUiChats: uiChats,
      },
      reseeded: { defaultLocalistSource: "localist-oberlin" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reset failed" },
      { status: 500 }
    );
  }
}
