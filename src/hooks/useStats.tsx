import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/service/firebase";
import { useLoading } from "@/hooks/useLoading";
import type {
  CommentRecord,
  DataFilter,
  ImportRecord,
  ReactionRecord,
} from "@/types/domain";
import { getImportChunkItems, isUnixTimeInRange } from "@/utils/firestoreData";

export type StatsFilter = Pick<DataFilter, "from" | "to" | "name">;

interface Stats {
  likes: number;
  comments: number;
  mediaComments: number;
  commentReactions: number;
  shares: number;
  totalImport: number;
}

const EMPTY_STATS: Stats = {
  likes: 0,
  comments: 0,
  mediaComments: 0,
  commentReactions: 0,
  shares: 0,
  totalImport: 0,
};

const matchesAccountFilter = (
  accountName: string | undefined,
  nameFilter: StatsFilter["name"],
): boolean => {
  if (!nameFilter) return true;
  const normalizedAccount = (accountName || "").toLocaleLowerCase("vi-VN");
  if (Array.isArray(nameFilter)) {
    return nameFilter.some(
      (name) => name.toLocaleLowerCase("vi-VN") === normalizedAccount,
    );
  }
  return normalizedAccount.includes(nameFilter.toLocaleLowerCase("vi-VN"));
};

export const useStats = (filter?: StatsFilter) => {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(false);
  const { showLoading, closeLoading } = useLoading();

  const getStats = useCallback(async () => {
    setLoading(true);
    showLoading("filter-stats");
    try {
      const importsQuery = query(
        collection(db, "imports"),
        orderBy("importedAt", "desc"),
      );
      const snapshot = await getDocs(importsQuery);
      const imports = snapshot.docs
        .map((document) => ({
          id: document.id,
          ...(document.data() as Omit<ImportRecord, "id">),
        }))
        .filter((item) => matchesAccountFilter(item.accountName, filter?.name));

      const fromMs = filter?.from?.getTime();
      const toMs = filter?.to?.getTime();
      const counts = await Promise.all(
        imports.map(async (item) => {
          const [comments, reactions] = await Promise.all([
            getImportChunkItems<CommentRecord>(item.id, "commentChunks"),
            getImportChunkItems<ReactionRecord>(item.id, "reactionChunks"),
          ]);
          const visibleComments =
            fromMs !== undefined && toMs !== undefined
              ? comments.filter((comment) =>
                  isUnixTimeInRange(comment.commentTime, fromMs, toMs),
                )
              : comments;
          const visibleReactions =
            fromMs !== undefined && toMs !== undefined
              ? reactions.filter((reaction) =>
                  isUnixTimeInRange(reaction.reactionTime, fromMs, toMs),
                )
              : reactions;
          return {
            commentsCount: visibleComments.length,
            reactionsCount: visibleReactions.length,
            mediaCommentsCount: visibleComments.filter(
              (comment) => (comment.media?.length ?? 0) > 0,
            ).length,
            commentReactionsCount: visibleReactions.filter(
              (reaction) => reaction.targetType === "COMMENT",
            ).length,
          };
        }),
      );

      setStats(
        counts.reduce<Stats>(
          (total, count) => ({
            likes: total.likes + count.reactionsCount,
            comments: total.comments + count.commentsCount,
            mediaComments: total.mediaComments + count.mediaCommentsCount,
            commentReactions:
              total.commentReactions + count.commentReactionsCount,
            shares: total.shares,
            totalImport:
              total.totalImport +
              (count.commentsCount > 0 || count.reactionsCount > 0 ? 1 : 0),
          }),
          EMPTY_STATS,
        ),
      );
    } catch (error) {
      console.error("Fetch stats failed:", error);
      setStats(EMPTY_STATS);
    } finally {
      setLoading(false);
      closeLoading("filter-stats");
    }
  }, [closeLoading, filter, showLoading]);

  useEffect(() => {
    void getStats();
  }, [getStats]);

  return { stats, loading, reloadStats: getStats };
};
