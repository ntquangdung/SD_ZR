import type JSZip from "jszip";
import {
  buildFacebookCommentSearchUrl,
  firstHttpUrl,
  normalizeContentText,
  normalizeHttpUrl,
  normalizeInlineText,
} from "./facebookData.ts";
import type {
  CommentMedia,
  CommentRecord,
  ReactionRecord,
} from "@/types/domain";

type UnknownRecord = Record<string, unknown>;

export interface JsonZipEntry {
  name: string;
  content: string;
}

export interface ProcessedZipData {
  firstFileName: string;
  totalJsonCount: number;
  fileCount: number;
  directories: string[];
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

const detectReactionTargetType = (
  url: string,
): ReactionRecord["targetType"] => {
  if (!url) return "UNKNOWN";
  return /(comment_id|reply_comment_id|comments\/|comment\/)/iu.test(url)
    ? "COMMENT"
    : "POST";
};

const mediaTypeFromUri = (uri: string): CommentMedia["type"] => {
  if (/\.(jpe?g|png|webp|gif)(?:\?.*)?$/iu.test(uri)) return "IMAGE";
  if (/\.(mp4|mov|avi|webm)(?:\?.*)?$/iu.test(uri)) return "VIDEO";
  return "MEDIA";
};

const collectCommentMedia = (...values: unknown[]): CommentMedia[] => {
  const result = new Map<string, CommentMedia>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!isRecord(value)) return;

    const uri = normalizeInlineText(value.uri);
    if (uri) {
      const media: CommentMedia = {
        type: mediaTypeFromUri(uri),
        uri,
      };
      const creationTimestamp = numberValue(value.creation_timestamp);
      if (creationTimestamp) media.creationTimestamp = creationTimestamp;
      result.set(uri, media);
    }
    Object.values(value).forEach(walk);
  };
  values.forEach(walk);
  return [...result.values()];
};

export const processJsonFromZip = async (
  zip: JSZip,
  onJsonFile: (entry: JsonZipEntry) => void | Promise<void>,
  shouldProcessPath: (path: string) => boolean = () => true,
): Promise<ProcessedZipData> => {
  const directories: string[] = [];
  let firstFileName = "";
  let totalJsonCount = 0;
  let fileCount = 0;

  const visit = async (currentZip: JSZip, prefix = ""): Promise<void> => {
    for (const entry of Object.values(currentZip.files)) {
      const fullPath = `${prefix}${entry.name}`.replace(/\/$/, "");
      const parts = fullPath.split("/").filter(Boolean);
      if (parts.some((part) => part.toLowerCase() === "__macosx")) continue;

      if (entry.dir) {
        directories.push(fullPath);
        continue;
      }

      const lowerName = fullPath.toLowerCase();
      try {
        if (lowerName.endsWith(".json")) {
          totalJsonCount += 1;
          if (!firstFileName) firstFileName = fullPath;
          if (!shouldProcessPath(fullPath)) continue;
          const content = await entry.async("string");
          fileCount += 1;
          await onJsonFile({ name: fullPath, content });
        } else if (lowerName.endsWith(".zip")) {
          const { default: JSZipRuntime } = await import("jszip");
          const nestedZip = await JSZipRuntime.loadAsync(
            await entry.async("arraybuffer"),
          );
          await visit(nestedZip, `${prefix}${entry.name}/`);
        }
      } catch (error) {
        console.warn(`Bỏ qua file ZIP/JSON không hợp lệ: ${fullPath}`, error);
      }
    }
  };

  await visit(zip);
  return { firstFileName, totalJsonCount, fileCount, directories };
};

export const isRelevantFacebookJsonPath = (path: string): boolean => {
  const fileName = path.split("/").pop()?.toLocaleLowerCase("en-US") || "";
  return (
    /^(?:your_)?likes_and_reactions(?:_\d+)?\.json$/u.test(fileName) ||
    /^(?:your_)?comments(?:_and_replies)?(?:_\d+)?\.json$/u.test(fileName) ||
    /^(?:your_)?group_comments(?:_\d+)?\.json$/u.test(fileName) ||
    /^your_comments_in_groups(?:_\d+)?\.json$/u.test(fileName)
  );
};

const collectNames = (value: unknown, names = new Set<string>()): string[] => {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectNames(entry, names));
  } else if (isRecord(value)) {
    if (["tên", "name"].includes(normalizeMatchKey(value.label))) {
      const name = normalizeInlineText(value.value);
      if (name) names.add(name);
    }
    Object.values(value).forEach((entry) => collectNames(entry, names));
  }
  return [...names];
};

const findLabel = (
  item: UnknownRecord,
  aliases: string[],
): UnknownRecord | undefined => {
  const labelValues = Array.isArray(item.label_values) ? item.label_values : [];
  const normalizedAliases = new Set(aliases.map(normalizeMatchKey));
  return labelValues.find(
    (entry): entry is UnknownRecord =>
      isRecord(entry) && normalizedAliases.has(normalizeMatchKey(entry.label)),
  );
};

const collectNamesFromSections = (
  value: unknown,
  sectionAliases: string[],
  names = new Set<string>(),
): string[] => {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectNamesFromSections(entry, sectionAliases, names));
    return [...names];
  }
  if (!isRecord(value)) return [...names];

  const aliases = new Set(sectionAliases.map(normalizeMatchKey));
  if (aliases.has(normalizeMatchKey(value.title))) {
    collectNames(value).forEach((name) => names.add(name));
    return [...names];
  }
  Object.values(value).forEach((entry) =>
    collectNamesFromSections(entry, sectionAliases, names),
  );
  return [...names];
};

const reactionEntries = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of [
    "likes_and_reactions_v2",
    "likes_and_reactions",
    "reactions_v2",
    "reactions",
  ]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
};

export const parseReactionRecords = (value: unknown): ReactionRecord[] => {
  const entries = reactionEntries(value);

  return entries.flatMap((entry): ReactionRecord[] => {
    if (!isRecord(entry) || !Array.isArray(entry.label_values)) return [];
    const labels = entry.label_values.filter(isRecord);
    const reactionLabel = findLabel(entry, ["Cảm xúc", "Reaction"]);
    if (!reactionLabel) return [];
    const urlLabel = findLabel(entry, ["URL", "Link"]);
    const directNameLabel = findLabel(entry, ["Tên", "Name"]);
    const matchNames = collectNames(labels);
    const targetGroupNames = collectNamesFromSections(labels, ["Nhóm", "Group"]);
    const targetAuthorNames = collectNamesFromSections(labels, ["Tác giả", "Author"]);

    const linkPost = firstHttpUrl(urlLabel?.href, urlLabel?.value);
    return [{
      reaction: normalizeInlineText(reactionLabel?.value),
      linkPost,
      commentAuthorName: matchNames[0] || "Chưa xác định",
      ownerName: normalizeInlineText(directNameLabel?.value) || "Chưa xác định",
      reactionTime: numberValue(entry.timestamp),
      fbid: normalizeInlineText(entry.fbid),
      matchNames,
      targetGroupNames,
      targetAuthorNames,
      targetType: detectReactionTargetType(linkPost),
    }];
  });
};

const buildCommentRecord = (
  comment: UnknownRecord,
  wrapper: UnknownRecord,
  parent: UnknownRecord,
): CommentRecord | null => {
  const authorName = normalizeInlineText(
    comment.author || comment.actor || comment.name || wrapper.author,
  );
  const content = normalizeContentText(
    comment.comment || comment.message || comment.content || comment.text,
  );
  const media = collectCommentMedia(
    comment.attachments,
    comment.media,
    wrapper.attachments,
    wrapper.media,
    parent.attachments,
    parent.media,
  );
  if (!authorName && !content && media.length === 0) return null;

  const title = normalizeInlineText(parent.title || wrapper.title).replace(/\.+$/, "");
  const group = normalizeInlineText(
    comment.group || comment.group_name || wrapper.group || parent.group,
  );
  const explicitCommentUrl = firstHttpUrl(
    comment.permalink_url,
    comment.comment_url,
  );
  const candidateUrl = firstHttpUrl(
    explicitCommentUrl,
    comment.url,
    comment.uri,
    comment.href,
    comment.link,
    wrapper.permalink_url,
    wrapper.url,
    wrapper.uri,
    parent.permalink_url,
    parent.url,
    parent.uri,
  );
  const containerUrl = firstHttpUrl(
    wrapper.permalink_url,
    wrapper.url,
    wrapper.uri,
    parent.permalink_url,
    parent.url,
    parent.uri,
  );
  const commentId = normalizeInlineText(
    comment.comment_id || comment.id || comment.fbid,
  );
  const isDirectCommentUrl =
    Boolean(explicitCommentUrl) ||
    detectReactionTargetType(candidateUrl) === "COMMENT" ||
    Boolean(normalizeHttpUrl(comment.comment_url));
  const commentLink = isDirectCommentUrl ? candidateUrl : "";
  const sourcePostUrl =
    containerUrl && detectReactionTargetType(containerUrl) !== "COMMENT"
      ? containerUrl
      : !isDirectCommentUrl
        ? candidateUrl
        : "";

  return {
    authorName,
    content,
    commentTime: numberValue(
      comment.timestamp || comment.creation_timestamp || comment.time || parent.timestamp,
    ),
    commentId,
    title,
    group,
    commentLocation: group || title,
    commentLink,
    commentSearchUrl: buildFacebookCommentSearchUrl({ content, group, title }),
    media,
    postUrl: sourcePostUrl,
  };
};

export const parseCommentRecords = (value: unknown): CommentRecord[] => {
  const records: CommentRecord[] = [];

  const visit = (node: unknown, parent: UnknownRecord | null = null): void => {
    if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry, parent));
      return;
    }
    if (!isRecord(node)) return;

    const context = normalizeInlineText(node.title) ? node : parent || node;
    if (isRecord(node.comment)) {
      const record = buildCommentRecord(node.comment, node, context);
      if (record) records.push(record);
    } else if (
      typeof node.comment === "string" ||
      ((typeof node.message === "string" ||
        typeof node.content === "string" ||
        typeof node.text === "string") &&
        (node.author !== undefined || node.actor !== undefined))
    ) {
      const record = buildCommentRecord(node, node, context);
      if (record) records.push(record);
    }

    Object.entries(node).forEach(([key, child]) => {
      if (key !== "comment") visit(child, context);
    });
  };

  visit(value);
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = record.commentId
      ? `id:${record.commentId}`
      : [
          record.commentTime,
          normalizeMatchKey(record.authorName),
          normalizeMatchKey(record.group),
          normalizeMatchKey(record.content),
          (record.media ?? []).map((item) => item.uri).sort().join("|"),
        ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const deduplicateCommentRecords = (
  records: CommentRecord[],
): CommentRecord[] => {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = record.commentId
      ? `id:${record.commentId}`
      : [
          record.commentTime,
          normalizeMatchKey(record.authorName),
          normalizeMatchKey(record.group),
          normalizeMatchKey(record.content),
          (record.media ?? []).map((item) => item.uri).sort().join("|"),
        ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const deduplicateReactionRecords = (
  records: ReactionRecord[],
): ReactionRecord[] => {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = [
      record.fbid,
      record.reactionTime,
      normalizeMatchKey(record.reaction),
      normalizeHttpUrl(record.linkPost),
    ].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeMatchKey = (value: unknown) =>
  normalizeInlineText(value).toLocaleLowerCase("vi-VN");

const nearestByTimestamp = (
  records: ReactionRecord[],
  timestamp: number,
): { reaction: ReactionRecord; delta: number } | null => {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (records[middle].reactionTime < timestamp) low = middle + 1;
    else high = middle;
  }

  let best: { reaction: ReactionRecord; delta: number } | null = null;
  for (const candidate of [records[low - 1], records[low]]) {
    if (!candidate) continue;
    const delta = Math.abs(timestamp - candidate.reactionTime);
    if (!best || delta < best.delta) best = { reaction: candidate, delta };
  }
  return best;
};

export const matchCommentsToPostUrls = (
  comments: CommentRecord[],
  reactions: ReactionRecord[],
): CommentRecord[] => {
  // Facebook stores comments and reactions in separate activity files. The
  // only reliable join keys available in many exports are the group name and
  // activity time. Use the nearest real URL in the same group, but never cross
  // accounts/groups and never bridge activity days.
  const maxDeltaSeconds = 24 * 60 * 60;
  const reactionsByGroup = new Map<string, ReactionRecord[]>();

  for (const reaction of reactions) {
    if (!normalizeHttpUrl(reaction.linkPost) || reaction.reactionTime <= 0) continue;
    const candidateNames = reaction.targetGroupNames?.length
      ? reaction.targetGroupNames
      : Array.isArray(reaction.matchNames)
        ? reaction.matchNames
      : [reaction.commentAuthorName, reaction.ownerName];
    for (const name of candidateNames) {
      const key = normalizeMatchKey(name);
      if (!key) continue;
      const bucket = reactionsByGroup.get(key) ?? [];
      bucket.push(reaction);
      reactionsByGroup.set(key, bucket);
    }
  }
  reactionsByGroup.forEach((bucket) =>
    bucket.sort((left, right) => left.reactionTime - right.reactionTime),
  );

  return comments.map((comment) => {
    if (normalizeHttpUrl(comment.postUrl)) {
      return {
        ...comment,
        matchDeltaSeconds: 0,
        matchConfidence: "HIGH",
        matchMethod: "SOURCE_POST_URL",
      };
    }
    const groupKey = normalizeMatchKey(comment.group);
    const bucket = groupKey ? reactionsByGroup.get(groupKey) ?? [] : [];
    const nearest =
      comment.commentTime > 0 && bucket.length
        ? nearestByTimestamp(bucket, comment.commentTime)
        : null;

    if (!nearest || nearest.delta > maxDeltaSeconds) {
      return {
        ...comment,
        postUrl: "",
        matchDeltaSeconds: null,
        matchConfidence: "UNMATCHED",
        matchMethod: "",
        matchedReactionTime: null,
        matchedReactionFbid: "",
      };
    }

    return {
      ...comment,
      postUrl: normalizeHttpUrl(nearest.reaction.linkPost),
      matchDeltaSeconds: nearest.delta,
      matchConfidence:
        nearest.delta <= 5 * 60
          ? "HIGH"
          : nearest.delta <= 60 * 60
            ? "MEDIUM"
            : "LOW",
      matchMethod: "EXACT_GROUP_NEAREST_TIMESTAMP",
      matchedReactionTime: nearest.reaction.reactionTime,
      matchedReactionFbid: nearest.reaction.fbid,
    };
  });
};

export const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError("Kích thước chunk phải là số nguyên dương");
  }
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );
};
