import { describe, expect, it } from "vitest";
import type { CommentRecord, ReactionRecord } from "@/types/domain";
import {
  matchCommentsToPostUrls,
  parseReactionRecords,
} from "./facebookImport";

const makeComment = (
  commentTime: number,
  group = "Nhóm học tiếng Trung",
  postUrl = "",
): CommentRecord => ({
  authorName: "Người dùng",
  content: "Nội dung bình luận",
  commentTime,
  title: "Đã bình luận về một bài viết",
  group,
  commentLocation: group,
  commentLink: "",
  commentSearchUrl: "",
  postUrl,
});

const makeReaction = (
  reactionTime: number,
  linkPost = "https://www.facebook.com/groups/123/posts/456/",
  group = "Nhóm học tiếng Trung",
  targetType: ReactionRecord["targetType"] = "POST",
): ReactionRecord => ({
  reaction: "Thích",
  linkPost,
  commentAuthorName: "Người đăng",
  ownerName: "Người dùng",
  reactionTime,
  fbid: "456",
  matchNames: [group],
  targetGroupNames: [group],
  targetAuthorNames: ["Người đăng"],
  targetType,
});

describe("matchCommentsToPostUrls", () => {
  it("keeps the same post URL for multiple comments when it is the nearest match", () => {
    const reaction = makeReaction(1_000);
    const result = matchCommentsToPostUrls(
      [makeComment(1_010), makeComment(1_020)],
      [reaction],
    );

    expect(result.map((comment) => comment.postUrl)).toEqual([
      reaction.linkPost,
      reaction.linkPost,
    ]);
    expect(result.map((comment) => comment.matchConfidence)).toEqual([
      "HIGH",
      "HIGH",
    ]);
  });

  it("keeps an exact-group match up to seven days and marks it low confidence", () => {
    const fourDays = 4 * 24 * 60 * 60;
    const reaction = makeReaction(1_000 + fourDays);
    const [result] = matchCommentsToPostUrls([makeComment(1_000)], [reaction]);

    expect(result.postUrl).toBe(reaction.linkPost);
    expect(result.matchConfidence).toBe("LOW");
    expect(result.matchMethod).toBe(
      "EXACT_GROUP_NEAREST_TIMESTAMP_EXTENDED",
    );
  });

  it("does not invent a match when the nearest post reaction is over seven days away", () => {
    const eightDays = 8 * 24 * 60 * 60;
    const [result] = matchCommentsToPostUrls(
      [makeComment(1_000)],
      [makeReaction(1_000 + eightDays)],
    );

    expect(result.postUrl).toBe("");
    expect(result.matchConfidence).toBe("UNMATCHED");
    expect(result.matchMethod).toBe("NEAREST_POST_REACTION_OVER_7_DAYS");
  });

  it("continues to parse reaction-comment records without changing them", () => {
    const [result] = parseReactionRecords([
      {
        timestamp: 1_000,
        fbid: "456",
        label_values: [
          { label: "Reaction", value: "Like" },
          {
            label: "URL",
            href: "https://www.facebook.com/example/posts/123?comment_id=456",
          },
        ],
      },
    ]);

    expect(result.linkPost).toBe(
      "https://www.facebook.com/example/posts/123?comment_id=456",
    );
    expect(result.targetType).toBe("COMMENT");
  });

  it("preserves a post URL that exists directly in the source comment", () => {
    const sourceUrl = "https://www.facebook.com/groups/123/posts/999/";
    const [result] = matchCommentsToPostUrls(
      [makeComment(1_000, "Nhóm học tiếng Trung", sourceUrl)],
      [],
    );

    expect(result.postUrl).toBe(sourceUrl);
    expect(result.matchMethod).toBe("SOURCE_POST_URL");
  });
});
