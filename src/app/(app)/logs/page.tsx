"use client";

import { useEffect, useState } from "react";
import type { PipelineJob } from "@/lib/pipelineJobs";
import { DataTable, type DataTableColumn } from "@/components/DataTable";

export default function LogsPage() {
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { clientListPipelineJobs: listPipelineJobs } = await import("@/lib/pipelineJobsClient");
      const j = await listPipelineJobs(50);
      setJobs(j);
      setLoading(false);
    }
    load();
  }, []);

  function formatDuration(job: PipelineJob) {
    if (!job.completedAt) return "In progress";
    const ms = job.completedAt - job.startedAt;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.round(s / 60)}m ${s % 60}s`;
  }

  const columns: DataTableColumn<PipelineJob>[] = [
    {
      key: "startedAt",
      header: "Run Date",
      render: (job) => (
        <span className="tabular-nums">{new Date(job.startedAt).toLocaleString()}</span>
      ),
    },
    {
      key: "sourceName",
      header: "Source",
      render: (job) => job.sourceName,
    },
    {
      key: "totalFetched",
      header: "Fetched",
      render: (job) => job.totalFetched,
    },
    {
      key: "totalQueued",
      header: "Queued",
      render: (job) => <span className="text-teal-400">{job.totalQueued}</span>,
    },
    {
      key: "totalRejected",
      header: "Rejected",
      render: (job) => <span className="text-red-400">{job.totalRejected}</span>,
    },
    {
      key: "totalDuplicates",
      header: "Duplicates",
      render: (job) => <span className="text-amber-400">{job.totalDuplicates}</span>,
    },
    {
      key: "duration",
      header: "Duration",
      render: (job) => formatDuration(job),
    },
    {
      key: "status",
      header: "Status",
      render: (job) => (
        <span
          className={
            job.status === "completed"
              ? "text-teal-400"
              : job.status === "failed"
              ? "text-red-400"
              : "text-amber-400"
          }
        >
          {job.status}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Pipeline Logs
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Audit trail for all pipeline runs — fetched, queued, rejected, duplicates.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading logs…</p>
      ) : (
        <DataTable
          columns={columns}
          emptyText="No pipeline runs yet. Go to Sources and click Run Now."
          rows={jobs}
          getRowKey={(job) => job.id}
        />
      )}
    </div>
  );
}
