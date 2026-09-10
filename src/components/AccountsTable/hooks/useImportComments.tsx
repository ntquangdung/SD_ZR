import { useEffect, useState } from "react";
import type { CommentRecord } from "@/types/domain";
import { getImportChunkItems, isUnixTimeInRange } from "@/utils/firestoreData";

export const useImportComments = (
  importId?: string,
  enabled: boolean = false,
  from?: Date | null,
  to?: Date | null
) => {
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !importId) {
      setComments([]);
      return;
    }

    const fetchComments = async () => {
      setLoading(true);
      try {
        // Lấy tất cả chunk
        let allComments = await getImportChunkItems<CommentRecord>(
          importId,
          "commentChunks",
        );

        // Nếu có filter thời gian, lọc theo commentTime
        if (from && to) {
          const fromTs = from.getTime();
          const toTs = to.getTime();
          allComments = allComments.filter((comment) =>
            isUnixTimeInRange(comment.commentTime, fromTs, toTs),
          );
        }

        setComments(allComments);
      } catch (err) {
        console.error("Fetch comments failed:", err);
        setComments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [importId, enabled, from, to]);

  return { comments, loading };
};
