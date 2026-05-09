import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { PostTypeBadge } from "@/components/PostTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { CivicPost, mockPosts } from "@/data/mockPosts";

export default function ArchivePage() {
  const archived = mockPosts.filter((post) => post.status === "archived");
  const columns: DataTableColumn<CivicPost>[] = [
    { key: "title", header: "Title", render: (post) => post.title },
    { key: "type", header: "Type", render: (post) => <PostTypeBadge type={post.type} /> },
    { key: "status", header: "Status", render: (post) => <StatusBadge status={post.status} /> },
    { key: "source", header: "Source", render: (post) => post.source },
    { key: "date", header: "Date", render: (post) => post.date },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-public-sans)] text-3xl font-bold tracking-[-0.02em] text-[var(--text)]">
          Archive
        </h1>
        <p className="mt-2 text-[var(--muted)]">Historical civic posts retained for audit and reporting.</p>
      </div>
      <DataTable
        columns={columns}
        emptyText="No archived posts yet."
        rows={archived}
        getRowKey={(post) => post.id}
      />
    </div>
  );
}
