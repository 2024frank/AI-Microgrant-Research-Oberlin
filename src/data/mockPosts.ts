export type PostStatus = "pending" | "approved" | "flagged" | "duplicate" | "archived";
export type PostType = "event" | "announcement";

export type CivicPost = {
  id: string;
  title: string;
  type: PostType;
  status: PostStatus;
  source: string;
  location: string;
  date: string;
  submittedBy: string;
  confidence: number;
  duplicateScore: number;
  description: string;
  tags: string[];
};

export const mockPosts: CivicPost[] = [];
