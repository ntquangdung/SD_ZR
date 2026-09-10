import { useEffect, useState, useCallback } from "react";
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

export type AccountsTableFilter = DataFilter;
export interface AccountTableRecord extends ImportRecord {
  mediaCommentsCount: number;
  commentReactionsCount: number;
}

export const useAccountsTable = (
  filter?: AccountsTableFilter,
  refreshSignal?: unknown,
  loadingKey?: string,
  includeSpecialMetrics = false,
) => {
  const [tableData, setTableData] = useState<AccountTableRecord[]>([]);
  const [load, setLoading] = useState(false);
  const { showLoading, closeLoading } = useLoading();

  const getTableData = useCallback(async () => {
    setLoading(true);
    if (loadingKey) showLoading(loadingKey);
    try {
      // Always fetch imports ordered by importedAt desc. We don't filter imports by
      // `importedAt` when the user filters by comment/reaction time because items
      // inside an import can have timestamps in other months.
      const q = query(collection(db, "imports"), orderBy("importedAt", "desc"));
      const snapshot = await getDocs(q);
      const baseImports: ImportRecord[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<ImportRecord, "id">),
      }));

      const fromTs = filter?.from?.getTime();
      const toTs = filter?.to?.getTime();
      const needsChunkData =
        includeSpecialMetrics || (fromTs !== undefined && toTs !== undefined);
      let imports: AccountTableRecord[] = needsChunkData
        ? await Promise.all(baseImports.map(async (imp) => {
          try {
            const [comments, reactions] = await Promise.all([
              getImportChunkItems<CommentRecord>(imp.id, "commentChunks"),
              getImportChunkItems<ReactionRecord>(imp.id, "reactionChunks"),
            ]);
            const visibleComments =
              fromTs !== undefined && toTs !== undefined
                ? comments.filter((comment) =>
                    isUnixTimeInRange(comment.commentTime, fromTs, toTs),
                  )
                : comments;
            const visibleReactions =
              fromTs !== undefined && toTs !== undefined
                ? reactions.filter((reaction) =>
                    isUnixTimeInRange(reaction.reactionTime, fromTs, toTs),
                  )
                : reactions;

            return {
              ...imp,
              commentsCount: visibleComments.length,
              reactionsCount: visibleReactions.length,
              mediaCommentsCount: visibleComments.filter(
                (comment) => (comment.media?.length ?? 0) > 0,
              ).length,
              commentReactionsCount: visibleReactions.filter(
                (reaction) => reaction.targetType === "COMMENT",
              ).length,
            };
          } catch (err) {
            console.error("Error computing per-import counts:", err);
            return {
              ...imp,
              mediaCommentsCount: 0,
              commentReactionsCount: 0,
            };
          }
          }))
        : baseImports.map((imp) => ({
            ...imp,
            mediaCommentsCount: 0,
            commentReactionsCount: 0,
          }));

      // Apply client-side filters for name, likes and comments
      if (filter) {
        if (filter.name) {
          if (Array.isArray(filter.name)) {
            const selected = filter.name.map((n) => n.toString().toLowerCase());
            imports = imports.filter((item) =>
              selected.includes((item.accountName || "").toLowerCase()),
            );
          } else {
            const nameLower = filter.name.toString().toLowerCase();
            imports = imports.filter((item) =>
              (item.accountName || "").toLowerCase().includes(nameLower),
            );
          }
        }

        if (typeof filter.minLikes === "number") {
          imports = imports.filter(
            (item) => (item.reactionsCount || 0) >= (filter.minLikes || 0),
          );
        }

        if (typeof filter.minComments === "number") {
          imports = imports.filter(
            (item) => (item.commentsCount || 0) >= (filter.minComments || 0),
          );
        }
      }

      setTableData(imports);
    } catch (error) {
      console.error("Fetch tableData failed:", error);
    } finally {
      setLoading(false);
      if (loadingKey) closeLoading(loadingKey);
    }
  }, [closeLoading, filter, includeSpecialMetrics, loadingKey, showLoading]);

  useEffect(() => {
    getTableData();
  }, [getTableData, refreshSignal]);

  return { tableData, load, reloadTable: getTableData };
};
