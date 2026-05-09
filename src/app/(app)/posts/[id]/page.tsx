import { PostDetailClient } from "@/app/(app)/posts/[id]/PostDetailClient";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PostDetailClient id={id} />;
}
