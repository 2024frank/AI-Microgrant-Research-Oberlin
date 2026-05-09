"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { useReviewStore } from "@/context/ReviewStoreContext";
import type { DuplicateGroup } from "@/lib/postTypes";

export default function DuplicateDetectionPage() {
  const { duplicateGroups, getPostById, updateDuplicateGroup, updatePostsStatus } = useReviewStore();
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const openGroups = duplicateGroups.filter((group) => group.status === "open");

  function toggleGroup(id: string) {
    setSelectedGroups((current) =>
      current.includes(id) ? current.filter((groupId) => groupId !== id) : [...current, id],
    );
  }

  function resolveGroup(group: DuplicateGroup) {
    updateDuplicateGroup(group.id, { status: "resolved" });
  }

  function rejectDuplicate(group: DuplicateGroup) {
    const duplicateIds = group.postIds.slice(1);
    updatePostsStatus(duplicateIds, "rejected", "Rejected as duplicate.");
    resolveGroup(group);
  }

  function bulkResolve() {
    selectedGroups.forEach((id) => updateDuplicateGroup(id, { status: "resolved" }));
    setSelectedGroups([]);
  }

  function bulkRejectDuplicates() {
    selectedGroups.forEach((id) => {
      const group = duplicateGroups.find((item) => item.id === id);
      if (group) {
        updatePostsStatus(group.postIds.slice(1), "rejected", "Rejected as duplicate.");
        updateDuplicateGroup(id, { status: "resolved" });
      }
    });
    setSelectedGroups([]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Candidate Comparison
        </h1>
        <p className="mt-2 text-[var(--muted)]">Resolve AI-flagged duplicate content before publication.</p>
      </div>
      <section className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
        <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)] disabled:opacity-50" disabled={selectedGroups.length === 0} onClick={bulkResolve} type="button">
          Mark Selected Resolved
        </button>
        <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)] disabled:opacity-50" disabled={selectedGroups.length === 0} onClick={bulkRejectDuplicates} type="button">
          Reject Selected Duplicates
        </button>
        <span className="text-sm text-[var(--muted)]">{selectedGroups.length} selected</span>
      </section>
      {openGroups.length === 0 ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
          <p className="font-semibold text-[var(--text)]">No duplicate groups found.</p>
          <p className="mt-2">Duplicate warnings will appear after posts are extracted.</p>
        </section>
      ) : (
        <div className="space-y-4">
          {openGroups.map((group) => {
            const groupPosts = group.postIds.map(getPostById).filter(Boolean);

            return (
              <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-5" key={group.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`Select duplicate group ${group.id}`}
                        checked={selectedGroups.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                        type="checkbox"
                      />
                      <h2 className="font-[var(--font-public-sans)] text-xl font-semibold">Duplicate Group</h2>
                      <StatusBadge status="warning" />
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted)]">Similarity score: {group.similarityScore}%</p>
                    <p className="mt-2 text-sm text-[var(--text)]">{group.recommendation}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)]" onClick={() => resolveGroup(group)} type="button">Keep Primary</button>
                    <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)]" onClick={() => resolveGroup(group)} type="button">Merge Details</button>
                    <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)]" onClick={() => rejectDuplicate(group)} type="button">Reject Duplicate</button>
                    <button className="rounded border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-high)]" onClick={() => resolveGroup(group)} type="button">Mark Not Duplicate</button>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {groupPosts.map((post, index) => (
                    post ? (
                      <article className="rounded border border-[var(--border)] bg-[#131313] p-4" key={post.id}>
                        <p className="font-[var(--font-plex)] text-[11px] uppercase tracking-[0.05em] text-[var(--muted)]">
                          {index === 0 ? "Primary candidate" : "Likely duplicate"}
                        </p>
                        <h3 className="mt-2 font-[var(--font-public-sans)] text-lg font-semibold">{post.title}</h3>
                        <dl className="mt-3 space-y-2 text-sm">
                          <div><dt className="text-[var(--muted)]">Source</dt><dd>{post.sourceName}</dd></div>
                          <div><dt className="text-[var(--muted)]">Date</dt><dd>{post.sessions[0]?.startTime ? new Date(post.sessions[0].startTime * 1000).toLocaleString() : "Not set"}</dd></div>
                          <div><dt className="text-[var(--muted)]">Status</dt><dd>{post.status}</dd></div>
                        </dl>
                        <Link className="mt-3 inline-flex text-sm font-semibold text-[#ffb3b3]" href={`/posts/${post.id}`}>
                          Open Post
                        </Link>
                      </article>
                    ) : null
                  ))}
                </div>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                  <div><p className="text-[var(--muted)]">Same/similar signals</p><p>{group.matchingSignals.join(", ")}</p></div>
                  <div><p className="text-[var(--muted)]">Conflict fields</p><p>{group.conflictFields.join(", ")}</p></div>
                  <div><p className="text-[var(--muted)]">Decision state</p><p>{group.status}</p></div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
