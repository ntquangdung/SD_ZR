import { useEffect, useState } from "react";
import type { ReactionRecord } from "@/types/domain";
import { getImportChunkItems, isUnixTimeInRange } from "@/utils/firestoreData";

export const useImportReactions = (
  importId?: string,
  enabled: boolean = false,
  from?: Date | null,
  to?: Date | null
) => {
  const [reactions, setReactions] = useState<ReactionRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !importId) {
      setReactions([]);
      return;
    }

    const fetchReactions = async () => {
      setLoading(true);
      try {
        // Lấy tất cả chunk
        let allReactions = await getImportChunkItems<ReactionRecord>(
          importId,
          "reactionChunks",
        );

        // Nếu có filter thời gian, lọc theo reactionTime
        if (from && to) {
          const fromTs = from.getTime();
          const toTs = to.getTime();
          allReactions = allReactions.filter((reaction) =>
            isUnixTimeInRange(reaction.reactionTime, fromTs, toTs),
          );
        }

        setReactions(allReactions);
      } catch (err) {
        console.error("Fetch reactions failed:", err);
        setReactions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchReactions();
  }, [importId, enabled, from, to]);

  return { reactions, loading };
};
