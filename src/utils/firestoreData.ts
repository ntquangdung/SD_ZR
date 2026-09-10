import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/service/firebase";
import type { ChunkDocument } from "@/types/domain";

export const getImportChunkItems = async <T>(
  importId: string,
  collectionName: "commentChunks" | "reactionChunks",
): Promise<T[]> => {
  const chunkQuery = query(
    collection(db, "imports", importId, collectionName),
    orderBy("index", "asc"),
  );
  const snapshot = await getDocs(chunkQuery);
  return snapshot.docs.flatMap(
    (chunk) => (chunk.data() as ChunkDocument<T>).items ?? [],
  );
};

export const isUnixTimeInRange = (
  timestampSeconds: number | undefined,
  fromMs: number,
  toMs: number,
): boolean => {
  const timestampMs = (timestampSeconds ?? 0) * 1000;
  return timestampMs >= fromMs && timestampMs <= toMs;
};
