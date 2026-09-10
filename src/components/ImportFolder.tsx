import { Button, Modal, Upload, message, Progress, Input } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import {
  addDoc,
  collection,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/service/firebase";
import { forwardRef, useImperativeHandle, useState } from "react";
import "../styles/header.scss";
import { useLoading } from "@/hooks/useLoading";
import { normalizeHttpUrl, normalizeInlineText } from "@/utils/facebookData";
import {
  chunkArray,
  deduplicateCommentRecords,
  deduplicateReactionRecords,
  matchCommentsToPostUrls,
  isRelevantFacebookJsonPath,
  parseCommentRecords,
  parseReactionRecords,
  processJsonFromZip,
} from "@/utils/facebookImport";
import { parseNativeImportJson } from "@/utils/nativeJsonImport";
import type { CommentRecord, ReactionRecord } from "@/types/domain";
// Keep documents comfortably below Firestore's 1 MiB document limit even
// when records contain long URLs, media metadata and several matching names.
const COMMENT_CHUNK_SIZE = 300;
const REACTION_CHUNK_SIZE = 500;

interface ParsedFile {
  name: string;
  size: number;
  comments: CommentRecord[];
  reactions: ReactionRecord[];
  accountName?: string;
  preserveUrls?: boolean;
}

const groupParsedFilesByAccount = (
  files: ParsedFile[],
  fallbackName: string,
): Record<string, ParsedFile[]> => {
  const groups: Record<string, ParsedFile[]> = {};
  for (const file of files) {
    if (file.accountName) {
      (groups[file.accountName] ??= []).push(file);
      continue;
    }
    const parts = file.name.split("/").filter(Boolean);
    const accountArchive = [...parts]
      .reverse()
      .find((part) => /\.zip$/i.test(part));
    const accountKey = accountArchive
      ? accountArchive.replace(/\.zip$/i, "")
      : fallbackName || "Unknown";
    (groups[accountKey] ??= []).push(file);
  }
  return groups;
};

const getAccountNameFromComments = (
  fallback: string,
  files: ParsedFile[],
): string => {
  const authorCounts = new Map<string, number>();
  for (const file of files) {
    for (const comment of file.comments) {
      const author = normalizeInlineText(comment.authorName);
      if (author) authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
    }
  }

  const mostFrequentAuthor = [...authorCounts.entries()].sort(
    ([nameA, countA], [nameB, countB]) =>
      countB - countA || nameA.localeCompare(nameB, "vi"),
  )[0]?.[0];

  return mostFrequentAuthor || normalizeInlineText(fallback) || "Unknown";
};

export interface FormDrawerHandle {
  open: () => void;
  close: () => void;
}

interface ImportZipProps {
  onImportSuccess?: () => void;
}

export const ImportZip = forwardRef<FormDrawerHandle, ImportZipProps>(
  ({ onImportSuccess }, ref) => {
    const [open, setOpen] = useState(false);
    const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [progress, setProgress] = useState(0);
    const [accountNameFolder, setAccountNameFolder] = useState("");
    const [originalFolderName, setOriginalFolderName] = useState("");

    /* =========================
      ZIP / JSON UPLOAD HANDLER
  ========================= */
    const handleImportUpload = async (file: File) => {
      const lowerFileName = file.name.toLocaleLowerCase("en-US");
      const isZip = lowerFileName.endsWith(".zip");
      const isJson = lowerFileName.endsWith(".json");
      if (!isZip && !isJson) {
        message.error("Chỉ hỗ trợ file .zip hoặc .json");
        return Upload.LIST_IGNORE;
      }

      showLoading("reading-import");
      try {
        setParsedFiles([]);
        setProgress(0);

        const uploadName = file.name.replace(/\.(?:zip|json)$/i, "");
        const nextParsedFiles: ParsedFile[] = [];

        if (isZip) {
          // JSZip is loaded only when a ZIP import actually starts.
          const { default: JSZip } = await import("jszip");
          const zip = await JSZip.loadAsync(file);
          let loaded = 0;
          const { totalJsonCount, fileCount } = await processJsonFromZip(
            zip,
            ({ name, content }) => {
              try {
                const data: unknown = JSON.parse(content);
                const comments = parseCommentRecords(data);
                const reactions = parseReactionRecords(data);
                if (comments.length || reactions.length) {
                  nextParsedFiles.push({
                    name,
                    size: content.length,
                    comments,
                    reactions,
                  });
                }
              } catch (error) {
                console.warn(`Bỏ qua JSON không hợp lệ: ${name}`, error);
              } finally {
                loaded += 1;
                setProgress(Math.min(95, loaded));
              }
            },
            isRelevantFacebookJsonPath,
          );

          if (!totalJsonCount) {
            message.error("ZIP không chứa file JSON");
            return Upload.LIST_IGNORE;
          }
          if (!fileCount || !nextParsedFiles.length) {
            message.warning(
              `ZIP có ${totalJsonCount} file JSON nhưng không có dữ liệu comment/reaction được hỗ trợ`,
            );
            return Upload.LIST_IGNORE;
          }
        } else {
          const content = await file.text();
          const data: unknown = JSON.parse(content);
          const nativeAccounts = parseNativeImportJson(data);
          if (nativeAccounts) {
            nativeAccounts.forEach((account, index) => {
              nextParsedFiles.push({
                name: `${file.name}/account-${index + 1}.json`,
                size: content.length,
                accountName: account.accountName,
                preserveUrls: true,
                comments: account.comments,
                reactions: account.reactions,
              });
            });
          } else {
            const comments = parseCommentRecords(data);
            const reactions = parseReactionRecords(data);
            if (comments.length || reactions.length) {
              nextParsedFiles.push({
                name: file.name,
                size: content.length,
                comments,
                reactions,
              });
            }
          }
          if (!nextParsedFiles.length) {
            message.warning("JSON không có dữ liệu comment/reaction được hỗ trợ");
            return Upload.LIST_IGNORE;
          }
          setProgress(95);
        }

        setOriginalFolderName(uploadName);
        setAccountNameFolder(uploadName);
        setParsedFiles(nextParsedFiles);
        setProgress(100);
        setFileList([
          {
            uid: file.name,
            name: file.name,
            status: "done",
            size: file.size,
          },
        ]);

        const previewGroups = groupParsedFilesByAccount(nextParsedFiles, uploadName);
        const importSummary = Object.values(previewGroups).reduce(
          (summary, files) => {
            const comments = deduplicateCommentRecords(
              files.flatMap((parsedFile) => parsedFile.comments),
            );
            const reactions = deduplicateReactionRecords(
              files.flatMap((parsedFile) => parsedFile.reactions),
            );
            const matchedComments = files.every((file) => file.preserveUrls)
              ? comments
              : matchCommentsToPostUrls(comments, reactions);
            summary.comments += comments.length;
            summary.reactions += reactions.length;
            summary.media += comments.reduce(
              (count, comment) => count + (comment.media?.length ?? 0),
              0,
            );
            summary.commentReactions += reactions.filter(
              (reaction) => reaction.targetType === "COMMENT",
            ).length;
            summary.directCommentLinks += matchedComments.filter((comment) =>
              normalizeHttpUrl(comment.commentLink),
            ).length;
            summary.postLinks += matchedComments.filter((comment) =>
              normalizeHttpUrl(comment.postUrl),
            ).length;
            summary.unlinkedComments += matchedComments.filter(
              (comment) =>
                !normalizeHttpUrl(comment.commentLink) &&
                !normalizeHttpUrl(comment.postUrl),
            ).length;
            return summary;
          },
          {
            comments: 0,
            reactions: 0,
            media: 0,
            commentReactions: 0,
            directCommentLinks: 0,
            postLinks: 0,
            unlinkedComments: 0,
          },
        );
        message.success(
          `Đã đọc ${importSummary.comments} comment, ${importSummary.reactions} reaction, ` +
            `${importSummary.media} media, ${importSummary.commentReactions} reaction comment; ` +
            `link trực tiếp ${importSummary.directCommentLinks}, Post URL ${importSummary.postLinks}, ` +
            `chưa có link ${importSummary.unlinkedComments}`,
          8,
        );
        return false;
      } catch (error) {
        console.error("Không thể đọc file import", error);
        message.error(
          error instanceof Error ? error.message : "Không thể đọc file import",
        );
        return Upload.LIST_IGNORE;
      } finally {
        closeLoading("reading-import");
      }
    };

    const { showLoading, closeLoading } = useLoading();

    const handleConfirm = async () => {
      if (!parsedFiles.length) return;

      const groupMap = groupParsedFilesByAccount(
        parsedFiles,
        accountNameFolder.trim() || originalFolderName || "Unknown",
      );

      try {
        showLoading("import-data");

        // Process each group separately as its own import record
        for (const [groupName, files] of Object.entries(groupMap)) {
          const normalizedGroupName = getAccountNameFromComments(groupName, files);
          const importRef = await addDoc(collection(db, "imports"), {
            importedAt: serverTimestamp(),
            totalFiles: files.length,
            status: "processing",
          });

          const allComments: CommentRecord[] = [];
          const allReactions: ReactionRecord[] = [];

          for (const file of files) {
            const comments = file.comments;
            if (comments.length) {
              allComments.push(...comments);
            }

            const reactions = file.reactions;
            if (reactions.length) {
              allReactions.push(...reactions);
            }
          }

          const uniqueComments = deduplicateCommentRecords(allComments);
          const uniqueReactions = deduplicateReactionRecords(allReactions);
          const commentsCount = uniqueComments.length;
          const reactionsCount = uniqueReactions.length;

          const matchedComments = files.every((file) => file.preserveUrls)
            ? uniqueComments
            : matchCommentsToPostUrls(uniqueComments, uniqueReactions);

          // Save comment chunks for this import (create at least one empty chunk if none)
          const commentChunks = chunkArray(matchedComments, COMMENT_CHUNK_SIZE);
          if (commentChunks.length === 0) {
            await addDoc(collection(db, "imports", importRef.id, "commentChunks"), {
              index: 0,
              items: [],
              count: 0,
            });
          } else {
            for (let i = 0; i < commentChunks.length; i++) {
              await addDoc(collection(db, "imports", importRef.id, "commentChunks"), {
                index: i,
                items: commentChunks[i],
                count: commentChunks[i].length,
              });
            }
          }

          // Save reaction chunks for this import (create at least one empty chunk if none)
          const reactionChunks = chunkArray(uniqueReactions, REACTION_CHUNK_SIZE);
          if (reactionChunks.length === 0) {
            await addDoc(collection(db, "imports", importRef.id, "reactionChunks"), {
              index: 0,
              items: [],
              count: 0,
            });
          } else {
            for (let i = 0; i < reactionChunks.length; i++) {
              await addDoc(collection(db, "imports", importRef.id, "reactionChunks"), {
                index: i,
                items: reactionChunks[i],
                count: reactionChunks[i].length,
              });
            }
          }

          // Update metadata
          await updateDoc(importRef, {
            accountName: normalizedGroupName,
            commentsCount,
            reactionsCount,
            directCommentLinksCount: matchedComments.filter(
              (comment) => normalizeHttpUrl(comment.commentLink),
            ).length,
            matchedPostLinksCount: matchedComments.filter(
              (comment) => normalizeHttpUrl(comment.postUrl),
            ).length,
            unlinkedCommentsCount: matchedComments.filter(
              (comment) =>
                !normalizeHttpUrl(comment.commentLink) &&
                !normalizeHttpUrl(comment.postUrl),
            ).length,
            status: "completed",
          });
        }

        setParsedFiles([]);
        setFileList([]);
        setProgress(0);
        setAccountNameFolder("");
        setOriginalFolderName("");
        setOpen(false);

        message.success("Import thành công 🎉");
        onImportSuccess?.();
      } catch (error) {
        console.log(error);
        message.error("Import thất bại ❌");
      } finally {
        closeLoading("import-data"); // Tắt loading
      }
    };

    /* =========================
      MODAL CONTROL
  ========================= */
    const handleModalClose = () => {
      setParsedFiles([]);
      setFileList([]);
      setProgress(0);
      setAccountNameFolder("");
      setOriginalFolderName("");
      setOpen(false);
    };

    useImperativeHandle(ref, () => ({
      open: () => setOpen(true),
      close: () => handleModalClose(),
    }));

    return (
      <Modal
        title="Import dữ liệu Facebook"
        open={open}
        onCancel={handleModalClose}
        onOk={handleConfirm}
        okText="Import"
        cancelText="Hủy"
        width={650}
        okButtonProps={{ disabled: !parsedFiles.length }}
        className="import-zip-modal"
        centered
      >
        {/* Upload UI */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: '#ccc', display: 'block', marginBottom: 6 }}>Tên account (tùy chọn)</label>
          <Input
            placeholder={originalFolderName || 'Tên folder (mặc định)'}
            value={accountNameFolder}
            onChange={(e) => setAccountNameFolder(e.target.value)}
          />
        </div>
        <div className="upload-dragger-ui">
          <div className="ant-upload ant-upload-drag">
            <div className="ant-upload ant-upload-btn">
              <Upload
                accept=".zip,.json,application/zip,application/json"
                beforeUpload={handleImportUpload}
                fileList={fileList}
                maxCount={1}
                onRemove={() => {
                  setParsedFiles([]);
                  setFileList([]);
                  setProgress(0);
                  setAccountNameFolder("");
                  setOriginalFolderName("");
                }}
              >
                <Button icon={<UploadOutlined />}>Chọn file ZIP hoặc JSON</Button>
              </Upload>
            </div>

            <p className="ant-upload-text">Click để chọn file ZIP hoặc JSON</p>
            <p className="ant-upload-hint">
              Hỗ trợ ZIP Facebook, JSON Facebook và JSON native do công cụ tạo
            </p>
          </div>
        </div>

        {progress > 0 && <Progress percent={progress} />}
      </Modal>
    );
  }
);
