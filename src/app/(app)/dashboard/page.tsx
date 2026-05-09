import { AlertTriangle, CalendarCheck, Copy, Database } from "lucide-react";

import { ActivityFeed } from "@/components/ActivityFeed";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { PostTypeBadge } from "@/components/PostTypeBadge";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { mockActivity } from "@/data/mockActivity";
import { CivicPost, mockPosts } from "@/data/mockPosts";

export default function DashboardPage() {
  const columns: DataTableColumn<CivicPost>[] = [
    {
      key: "title",
      header: "Post",
      render: (post) => (
        <div>
          <p className="font-semibold">{post.title}</p>
          <p className="text-xs text-[var(--muted)]">{post.source}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (post) => <PostTypeBadge type={post.type} /> },
    { key: "status", header: "Status", render: (post) => <StatusBadge status={post.status} /> },
    { key: "date", header: "Date", render: (post) => post.date },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Content Overview
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Monitor incoming civic posts, source health, duplicate risk, and review workload.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CalendarCheck} label="Pending Reviews" value="0" detail="No pending reviews." />
        <StatCard icon={Database} label="Connected Sources" value="0" detail="No sources connected yet." tone="teal" />
        <StatCard icon={Copy} label="Duplicate Warnings" value="0" detail="No duplicate groups found." tone="danger" />
        <StatCard icon={AlertTriangle} label="Extraction Jobs" value="0" detail="No extraction jobs have run." />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-[var(--font-public-sans)] text-xl font-semibold text-[var(--text)]">
                Recent Event Table
              </h2>
            </div>
            <DataTable
              columns={columns}
              emptyText="No posts have been extracted yet."
              rows={mockPosts.slice(0, 4)}
              getRowKey={(post) => post.id}
            />
          </div>

          <div>
            <h2 className="mb-3 font-[var(--font-public-sans)] text-xl font-semibold text-[var(--text)]">
              Pending Reviews
            </h2>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
              No pending reviews.
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <ActivityFeed items={mockActivity} emptyText="No activity logs yet." />
          <div>
            <h2 className="mb-3 font-[var(--font-public-sans)] text-xl font-semibold text-[var(--text)]">
              Source Activity
            </h2>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--muted)]">
              No source activity yet.
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
            <h2 className="font-[var(--font-public-sans)] text-lg font-semibold text-[var(--text)]">
              AI Analysis
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">No AI analysis available yet.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
