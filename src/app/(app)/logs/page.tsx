import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { ActivityItem, mockActivity } from "@/data/mockActivity";

export default function LogsPage() {
  const columns: DataTableColumn<ActivityItem>[] = [
    { key: "time", header: "Time", render: (item) => item.time },
    { key: "actor", header: "Actor", render: (item) => item.actor },
    { key: "action", header: "Action", render: (item) => item.action },
    { key: "target", header: "Target", render: (item) => item.target },
    { key: "severity", header: "Severity", render: (item) => item.severity },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Activity Logs
        </h1>
        <p className="mt-2 text-[var(--muted)]">Audit trail for source sync, AI review, and admin decisions.</p>
      </div>
      <DataTable
        columns={columns}
        emptyText="No activity logs yet."
        rows={mockActivity}
        getRowKey={(item) => item.id}
      />
    </div>
  );
}
