"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { initialDuplicateGroups, initialReviewPosts } from "@/data/reviewPosts";
import type { DuplicateGroup, ReviewPost, ReviewStatus } from "@/lib/postTypes";

type ReviewStoreValue = {
  posts: ReviewPost[];
  duplicateGroups: DuplicateGroup[];
  updatePost: (id: string, updates: Partial<ReviewPost>) => void;
  updatePostsStatus: (ids: string[], status: ReviewStatus, rejectionReason?: string) => void;
  updateDuplicateGroup: (id: string, updates: Partial<DuplicateGroup>) => void;
  getPostById: (id: string) => ReviewPost | undefined;
};

const ReviewStoreContext = createContext<ReviewStoreValue | null>(null);
const postsStorageKey = "civic-calendar-review-posts";
const duplicateStorageKey = "civic-calendar-duplicate-groups";

function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const stored = window.localStorage.getItem(key);

  if (!stored) {
    return fallback;
  }

  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

function keepSupportedPosts(posts: ReviewPost[]) {
  return posts.filter((post) => post.eventType === "ot" || post.eventType === "an");
}

export function ReviewStoreProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<ReviewPost[]>(initialReviewPosts);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>(initialDuplicateGroups);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setPosts(keepSupportedPosts(readStoredValue(postsStorageKey, initialReviewPosts)));
    setDuplicateGroups(readStoredValue(duplicateStorageKey, initialDuplicateGroups));
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (hasLoaded) {
      window.localStorage.setItem(postsStorageKey, JSON.stringify(posts));
    }
  }, [hasLoaded, posts]);

  useEffect(() => {
    if (hasLoaded) {
      window.localStorage.setItem(duplicateStorageKey, JSON.stringify(duplicateGroups));
    }
  }, [duplicateGroups, hasLoaded]);

  const value = useMemo<ReviewStoreValue>(
    () => ({
      posts,
      duplicateGroups,
      updatePost: (id, updates) => {
        setPosts((current) =>
          current.map((post) => (post.id === id ? ({ ...post, ...updates } as ReviewPost) : post)),
        );
      },
      updatePostsStatus: (ids, status, rejectionReason) => {
        setPosts((current) =>
          current.map((post) =>
            ids.includes(post.id)
              ? ({ ...post, status, ...(rejectionReason ? { rejectionReason } : {}) } as ReviewPost)
              : post,
          ),
        );
      },
      updateDuplicateGroup: (id, updates) => {
        setDuplicateGroups((current) =>
          current.map((group) => (group.id === id ? { ...group, ...updates } : group)),
        );
      },
      getPostById: (id) => posts.find((post) => post.id === id),
    }),
    [duplicateGroups, posts],
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
