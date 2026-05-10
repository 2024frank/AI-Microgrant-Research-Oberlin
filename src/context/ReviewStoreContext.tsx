"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";

import type { DuplicateGroup, ReviewPost, ReviewStatus } from "@/lib/postTypes";

type ReviewStoreValue = {
  posts: ReviewPost[];
  duplicateGroups: DuplicateGroup[];
  loading: boolean;
  refreshPosts: () => Promise<void>;
  updatePost: (id: string, updates: Partial<ReviewPost>) => void;
  updatePostsStatus: (ids: string[], status: ReviewStatus, rejectionReason?: string) => void;
  removePosts: (ids: string[]) => void;
  updateDuplicateGroup: (id: string, updates: Partial<DuplicateGroup>) => void;
  getPostById: (id: string) => ReviewPost | undefined;
};

const ReviewStoreContext = createContext<ReviewStoreValue | null>(null);

export function ReviewStoreProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<ReviewPost[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshPosts = useCallback(async () => {
    try {
      const [postsRes, { clientListDuplicateGroups }] = await Promise.all([
        fetch("/api/posts/list"),
        import("@/lib/reviewStoreClient"),
      ]);
      const data = await postsRes.json();
      const fetchedGroups = await clientListDuplicateGroups();
      if (data.posts) {
        // Queue only shows active posts — approved/rejected/published go to Archive
        const active = data.posts.filter((p: {status: string}) =>
          ["pending", "duplicate", "needs_correction"].includes(p.status)
        );
        setPosts(active);
      }
      setDuplicateGroups(fetchedGroups);
    } catch (err) {
      console.error("Posts load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPosts();
  }, [refreshPosts]);

  const value = useMemo<ReviewStoreValue>(
    () => ({
      posts,
      duplicateGroups,
      loading,
      refreshPosts,
      updatePost: (id, updates) => {
        setPosts((current) =>
          current.map((post) => (post.id === id ? ({ ...post, ...updates } as ReviewPost) : post))
        );
        import("@/lib/reviewStoreClient").then(({ clientUpdateReviewPost }) =>
          clientUpdateReviewPost(id, updates)
        );
      },
      updatePostsStatus: (ids, status, rejectionReason) => {
        setPosts((current) =>
          current.map((post) =>
            ids.includes(post.id)
              ? ({
                  ...post,
                  status,
                  ...(rejectionReason ? { rejectionReason } : {}),
                } as ReviewPost)
              : post
          )
        );
        import("@/lib/reviewStoreClient").then(({ clientUpdateReviewPost }) => {
          ids.forEach((id) =>
            clientUpdateReviewPost(id, {
              status,
              ...(rejectionReason ? { rejectionReason } : {}),
            })
          );
        });
      },
      removePosts: (ids) => {
        setPosts((current) => current.filter((post) => !ids.includes(post.id)));
        setDuplicateGroups((current) =>
          current
            .map((group) => ({
              ...group,
              postIds: group.postIds.filter((postId) => !ids.includes(postId)),
            }))
            .filter((group) => group.postIds.length >= 2)
        );
        import("@/lib/reviewStoreClient").then(({ clientDeleteReviewPost }) => {
          ids.forEach((id) => clientDeleteReviewPost(id));
        });
      },
      updateDuplicateGroup: (id, updates) => {
        setDuplicateGroups((current) =>
          current.map((group) => (group.id === id ? { ...group, ...updates } : group))
        );
        import("@/lib/reviewStoreClient").then(({ clientUpdateDuplicateGroup }) =>
          clientUpdateDuplicateGroup(id, updates)
        );
      },
      getPostById: (id) => posts.find((post) => post.id === id),
    }),
    [duplicateGroups, loading, posts, refreshPosts]
  );

  return <ReviewStoreContext.Provider value={value}>{children}</ReviewStoreContext.Provider>;
}

export function useReviewStore() {
  const context = useContext(ReviewStoreContext);
  if (!context) {
    throw new Error("useReviewStore must be used within ReviewStoreProvider");
  }
  return context;
}
