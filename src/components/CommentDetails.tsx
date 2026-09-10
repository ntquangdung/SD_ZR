import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Modal,
  List,
  Avatar,
  Empty,
  Typography,
  Spin,
  Tooltip,
  Pagination,
  Input,
} from "antd";
import { useLoading } from "@/hooks/useLoading";
import {
  buildFacebookCommentSearchUrl,
  normalizeHttpUrl,
} from "@/utils/facebookData";
import type { CommentMedia } from "@/types/domain";

const { Text } = Typography;

interface CommentItem {
  id?: string;
  authorName?: string;
  content?: string;
  commentTime?: number;
  title?: string;
  group?: string;
  commentLink?: string;
  commentSearchUrl?: string;
  commentLocation?: string;
  postUrl?: string;
  matchDeltaSeconds?: number | null;
  matchConfidence?: "HIGH" | "MEDIUM" | "LOW" | "UNMATCHED";
  matchMethod?: string;
  media?: CommentMedia[];
}

const formatCommentMedia = (media: CommentMedia[] = []) =>
  media
    .map((item) => {
      const label = item.type === "IMAGE"
        ? "Hình ảnh"
        : item.type === "VIDEO"
          ? "Video"
          : "Media";
      return `[${label}: ${item.uri}]`;
    })
    .join(" ");

interface CommentDetailsProps {
  visible: boolean;
  onClose: () => void;
  title?: string | null;
  comments: CommentItem[];
  loading?: boolean;
}

const CommentDetails: React.FC<CommentDetailsProps> = ({
  visible,
  onClose,
  title,
  comments,
  loading = false,
}) => {
  const [state, setState] = useState<{
    pageSize: number;
    current: number;
    searchTerm: string;
  }>({ pageSize: 10, current: 1, searchTerm: "" });
  const { pageSize, current, searchTerm } = state;
  const { isAnyLoading } = useLoading();

  const filteredComments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const source = Array.isArray(comments) ? [...comments] : [];

    let result = source;
    if (term) {
      result = result.filter((c) => {
        return (
          (c.authorName || "").toLowerCase().includes(term) ||
          (c.title || "").toLowerCase().includes(term) ||
          (c.content || "").toLowerCase().includes(term) ||
          formatCommentMedia(c.media).toLowerCase().includes(term) ||
          (c.commentLink || "").toLowerCase().includes(term)
        );
      });
    }

    // Sort by commentTime descending (newest first). Treat missing times as 0.
    result.sort((a, b) => (b.commentTime || 0) - (a.commentTime || 0));
    return result;
  }, [comments, searchTerm]);

  const total = filteredComments.length;
  const paginatedComments = filteredComments.slice(
    (current - 1) * pageSize,
    current * pageSize,
  );
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      setState((s) => ({ ...s, current: 1 }));
      if (listContainerRef.current) listContainerRef.current.scrollTop = 0;
    }, 0);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    // whenever search term changes, reset to first page and scroll to top
    const t = setTimeout(() => {
      setState((s) => ({ ...s, current: 1 }));
      if (listContainerRef.current) listContainerRef.current.scrollTop = 0;
    }, 0);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    // clear search when modal is closed
    if (visible) return;
    const t = setTimeout(() => setState((s) => ({ ...s, searchTerm: "" })), 0);
    return () => clearTimeout(t);
  }, [visible]);
  return (
    <Modal
      title={`Comments${title ? ` — ${title}` : ""}`}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={720}
      centered
    >
      {loading && !isAnyLoading() ? (
        <Spin style={{ display: "block", margin: "40px auto" }} />
      ) : comments.length === 0 ? (
        <Empty description="No comments" />
      ) : (
        <>
          <Input
            placeholder="Search comments, author or title"
            value={searchTerm}
            onChange={(e) =>
              setState((s) => ({ ...s, searchTerm: e.target.value }))
            }
            style={{ marginBottom: 12 }}
            allowClear
          />
          {filteredComments.length === 0 ? (
            <Empty description="No matching comments" />
          ) : (
            <div
              ref={listContainerRef}
              style={{
                maxHeight: "500px",
                overflowY: "auto",
                border: "1px solid #ccc",
                borderRadius: 4,
                padding: 8,
              }}
            >
              <List
                dataSource={paginatedComments}
                renderItem={(item) => {
                  const mediaText = formatCommentMedia(item.media);
                  const displayContent = [item.content, mediaText]
                    .filter(Boolean)
                    .join(" ") || "[Media]";
                  const commentLink = normalizeHttpUrl(item.commentLink);
                  const postUrl = normalizeHttpUrl(item.postUrl);
                  const commentSearchUrl =
                    normalizeHttpUrl(item.commentSearchUrl) ||
                    buildFacebookCommentSearchUrl({
                      content: item.content,
                      group: item.group,
                      title: item.title,
                    });
                  return (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Avatar>{(item.authorName || "U").charAt(0)}</Avatar>
                      }
                      title={
                        <div
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          <div>
                            <strong>
                              {(item?.title || "").replace(/\.+$/, "")}

                              {item?.group ? (
                                <>
                                  {" "}
                                  <span
                                    style={{ color: "#888", marginLeft: 8 }}
                                  >
                                    trong{" "}
                                  </span>
                                  <span>{`${item.group}`}</span>
                                </>
                              ) : null}
                            </strong>
                          </div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.commentTime
                              ? new Date(
                                  item.commentTime * 1000,
                                ).toLocaleString("vi-VN")
                              : ""}
                          </Text>
                        </div>
                      }
                      description={
                        <div>
                          <Tooltip title={displayContent}>
                            <Text
                              ellipsis
                              style={{
                                maxWidth: "400px",
                                display: "block",
                              }}
                            >
                              {displayContent}
                            </Text>
                          </Tooltip>
                          {commentLink ? (
                            <a
                              href={commentLink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Mở bình luận
                            </a>
                          ) : null}
                          {!commentLink && postUrl ? (
                            <a
                              href={postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Mở bài viết đã ghép
                              {item.matchConfidence
                                ? ` · ${item.matchConfidence}`
                                : ""}
                              {typeof item.matchDeltaSeconds === "number"
                                ? ` · lệch ${item.matchDeltaSeconds}s`
                                : ""}
                            </a>
                          ) : null}
                          {!commentLink && !postUrl && commentSearchUrl ? (
                            <a
                              href={commentSearchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Tìm vị trí trên Facebook
                            </a>
                          ) : null}
                        </div>
                      }
                    />
                  </List.Item>
                  );
                }}
              />
            </div>
          )}
        </>
      )}

      <div
        style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}
      >
        <Pagination
          current={current}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          pageSizeOptions={["5", "10", "20", "50"]}
          onChange={(page, size) => {
            setState((s) => ({ ...s, current: page }));
            if (typeof size === "number")
              setState((s) => ({ ...s, pageSize: size }));
            if (listContainerRef.current)
              listContainerRef.current.scrollTop = 0;
          }}
          showTotal={(t) => `Total ${t} items`}
        />
      </div>
    </Modal>
  );
};

export default CommentDetails;
