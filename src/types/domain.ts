export interface FirestoreTimestampLike {
  toDate: () => Date;
}

export interface ImportRecord {
  id: string;
  accountName?: string;
  commentsCount?: number;
  reactionsCount?: number;
  sharesCount?: number;
  importedAt?: FirestoreTimestampLike | null;
  status?: string;
  totalFiles?: number;
  directCommentLinksCount?: number;
  matchedPostLinksCount?: number;
  unlinkedCommentsCount?: number;
}

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNMATCHED";
export type MediaType = "IMAGE" | "VIDEO" | "MEDIA";

export interface CommentMedia {
  type: MediaType;
  uri: string;
  creationTimestamp?: number;
}

export interface CommentRecord {
  id?: string;
  authorName: string;
  content: string;
  commentTime: number;
  commentId?: string;
  title: string;
  group: string;
  commentLocation: string;
  commentLink: string;
  commentSearchUrl: string;
  media?: CommentMedia[];
  postUrl?: string;
  matchDeltaSeconds?: number | null;
  matchConfidence?: MatchConfidence;
  matchMethod?: string;
  matchedReactionTime?: number | null;
  matchedReactionFbid?: string;
}

export interface ReactionRecord {
  id?: string;
  reaction: string;
  linkPost: string;
  commentAuthorName: string;
  ownerName: string;
  reactionTime: number;
  fbid: string;
  matchNames?: string[];
  targetGroupNames?: string[];
  targetAuthorNames?: string[];
  targetType?: "POST" | "COMMENT" | "UNKNOWN";
  accountName?: string;
}

export interface ChunkDocument<T> {
  index?: number;
  count?: number;
  items?: T[];
}

export interface DataFilter {
  from?: Date | null;
  to?: Date | null;
  name?: string | string[];
  minLikes?: number | null;
  minComments?: number | null;
}
