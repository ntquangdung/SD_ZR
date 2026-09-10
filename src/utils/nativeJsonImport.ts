import type {
  CommentMedia,
  CommentRecord,
  MatchConfidence,
  ReactionRecord,
} from "@/types/domain";
import {
  buildFacebookCommentSearchUrl,
  normalizeHttpUrl,
  normalizeInlineText,
} from "./facebookData";

type UnknownRecord = Record<string, unknown>;

export const NATIVE_IMPORT_FORMAT = "facebook-activity-native-json";
export const NATIVE_IMPORT_SCHEMA_VERSION = 1;

export interface NativeImportAccount {
  accountName: string;
  comments: CommentRecord[];
  reactions: ReactionRecord[];
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberValue = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.map(normalizeInlineText).filter(Boolean))]
    : [];

const mediaList = (value: unknown): CommentMedia[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CommentMedia[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const uri = normalizeInlineText(item.uri);
    if (!uri || seen.has(uri)) continue;
    const rawType = normalizeInlineText(item.type).toUpperCase();
    const type: CommentMedia["type"] =
      rawType === "IMAGE" || rawType === "VIDEO" ? rawType : "MEDIA";
    const media: CommentMedia = { type, uri };
    const creationTimestamp = numberValue(item.creationTimestamp);
    if (creationTimestamp > 0) media.creationTimestamp = creationTimestamp;
    result.push(media);
    seen.add(uri);
  }
  return result;
};

const matchConfidence = (value: unknown): MatchConfidence | undefined => {
  const normalized = normalizeInlineText(value).toUpperCase();
  return ["HIGH", "MEDIUM", "LOW", "UNMATCHED"].includes(normalized)
    ? (normalized as MatchConfidence)
    : undefined;
};

const sanitizeComment = (value: unknown): CommentRecord | null => {
  if (!isRecord(value)) return null;
  const authorName = normalizeInlineText(value.authorName);
  const content = normalizeInlineText(value.content);
  const media = mediaList(value.media);
  if (!authorName && !content && media.length === 0) return null;

  const title = normalizeInlineText(value.title);
  const group = normalizeInlineText(value.group);
  const commentLocation =
    normalizeInlineText(value.commentLocation) || group || title;
  const commentLink = normalizeHttpUrl(value.commentLink);
  const postUrl = normalizeHttpUrl(value.postUrl);
  const confidence = matchConfidence(value.matchConfidence);
  const record: CommentRecord = {
    authorName: authorName || "Chưa xác định",
    content,
    commentTime: numberValue(value.commentTime),
    commentId: normalizeInlineText(value.commentId),
    title,
    group: group || commentLocation,
    commentLocation,
    commentLink,
    commentSearchUrl:
      normalizeHttpUrl(value.commentSearchUrl) ||
      buildFacebookCommentSearchUrl({ content, group: group || commentLocation, title }),
    media,
    postUrl,
  };

  if (confidence) record.matchConfidence = confidence;
  const matchDeltaSeconds = numberValue(value.matchDeltaSeconds);
  if (value.matchDeltaSeconds === null) record.matchDeltaSeconds = null;
  else if (value.matchDeltaSeconds !== undefined && matchDeltaSeconds >= 0) {
    record.matchDeltaSeconds = matchDeltaSeconds;
  }
  const method = normalizeInlineText(value.matchMethod);
  if (method) record.matchMethod = method;
  const matchedReactionTime = numberValue(value.matchedReactionTime);
  if (value.matchedReactionTime === null) record.matchedReactionTime = null;
  else if (matchedReactionTime > 0) record.matchedReactionTime = matchedReactionTime;
  const matchedReactionFbid = normalizeInlineText(value.matchedReactionFbid);
  if (matchedReactionFbid) record.matchedReactionFbid = matchedReactionFbid;
  return record;
};

const sanitizeReaction = (
  value: unknown,
  fallbackAccountName: string,
): ReactionRecord | null => {
  if (!isRecord(value)) return null;
  const reaction = normalizeInlineText(value.reaction);
  const linkPost = normalizeHttpUrl(value.linkPost);
  const reactionTime = numberValue(value.reactionTime);
  if (!reaction && !linkPost && reactionTime <= 0) return null;

  const rawTargetType = normalizeInlineText(value.targetType).toUpperCase();
  const targetType: ReactionRecord["targetType"] =
    rawTargetType === "COMMENT" || rawTargetType === "POST"
      ? rawTargetType
      : "UNKNOWN";

  return {
    reaction,
    linkPost,
    commentAuthorName:
      normalizeInlineText(value.commentAuthorName) || "Chưa xác định",
    ownerName: normalizeInlineText(value.ownerName) || "Chưa xác định",
    reactionTime,
    fbid: normalizeInlineText(value.fbid),
    matchNames: stringList(value.matchNames),
    targetGroupNames: stringList(value.targetGroupNames),
    targetAuthorNames: stringList(value.targetAuthorNames),
    targetType,
    accountName:
      normalizeInlineText(value.accountName) || fallbackAccountName,
  };
};

/**
 * Parses the app's lossless interchange format. Returns null for unrelated JSON
 * so callers can fall back to the standard Facebook JSON parsers.
 */
export const parseNativeImportJson = (
  value: unknown,
): NativeImportAccount[] | null => {
  if (!isRecord(value) || value.format !== NATIVE_IMPORT_FORMAT) return null;
  if (numberValue(value.schemaVersion) !== NATIVE_IMPORT_SCHEMA_VERSION) {
    throw new Error(
      `Phiên bản JSON không được hỗ trợ: ${normalizeInlineText(value.schemaVersion) || "không xác định"}`,
    );
  }
  if (!Array.isArray(value.accounts)) {
    throw new Error("JSON không có danh sách accounts hợp lệ");
  }

  const accounts = value.accounts.flatMap((item): NativeImportAccount[] => {
    if (!isRecord(item)) return [];
    const accountName = normalizeInlineText(item.accountName) || "Unknown";
    const comments = Array.isArray(item.comments)
      ? item.comments
          .map(sanitizeComment)
          .filter((comment): comment is CommentRecord => comment !== null)
      : [];
    const reactions = Array.isArray(item.reactions)
      ? item.reactions
          .map((reaction) => sanitizeReaction(reaction, accountName))
          .filter((reaction): reaction is ReactionRecord => reaction !== null)
      : [];
    return comments.length || reactions.length
      ? [{ accountName, comments, reactions }]
      : [];
  });

  if (!accounts.length) {
    throw new Error("JSON native không chứa comment hoặc reaction hợp lệ");
  }
  return accounts;
};
