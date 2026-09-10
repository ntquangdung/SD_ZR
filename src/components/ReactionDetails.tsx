import React, { useEffect, useMemo, useRef, useState } from "react";
import "@/styles/reaction-details.scss";
import {
  Modal,
  List,
  Avatar,
  Empty,
  Typography,
  Spin,
  Tag,
  Input,
  Pagination,
} from "antd";
import { useLoading } from "@/hooks/useLoading";
import {
  LikeOutlined,
  HeartOutlined,
  SmileOutlined,
  FrownOutlined,
  StarOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

interface ReactionItem {
  id?: string;
  actor?: string;
  reactionType?: string;
  reactionTime?: number;
  title?: string;
  reaction?: string;
  name?: string;
  accountName?: string;
  ownerName?: string;
  commentAuthorName?: string;
  linkPost?: string;
  targetType?: "POST" | "COMMENT" | "UNKNOWN";
  targetGroupNames?: string[];
  targetAuthorNames?: string[];
}

interface ReactionDetailsProps {
  visible: boolean;
  onClose: () => void;
  title?: string | null;
  reactions: ReactionItem[];
  loading?: boolean;
}

/** map reaction -> icon */
const getReactionDisplay = (type?: string) => {
  const t = (type || "").toLowerCase();
  switch (t) {
    case "love":
      return { icon: <HeartOutlined />, color: "magenta", text: "Love" };
    case "haha":
    case "hh":
      return { icon: <SmileOutlined />, color: "gold", text: "Haha" };
    case "sad":
      return { icon: <FrownOutlined />, color: "blue", text: "Sad" };
    case "wow":
      return { icon: <StarOutlined />, color: "purple", text: "Wow" };
    default:
      return { icon: <LikeOutlined />, color: "blue", text: "Like" };
  }
};

const ReactionDetails: React.FC<ReactionDetailsProps> = ({
  visible,
  onClose,
  title,
  reactions,
  loading,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { isAnyLoading } = useLoading();

  /** filter + sort by time desc */
  const filteredReactions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const src = Array.isArray(reactions) ? [...reactions] : [];

    let res = src;
    if (q) {
      res = res.filter((r) =>
        [
          r.actor,
          r.name,
          r.commentAuthorName,
          r.title,
          r.reactionType,
          ...(r.targetGroupNames ?? []),
          ...(r.targetAuthorNames ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    // Sort by reactionTime descending (newest first). Missing times treated as 0.
    res.sort((a, b) => (b.reactionTime || 0) - (a.reactionTime || 0));
    return res;
  }, [reactions, searchTerm]);

  const total = filteredReactions.length;

  const paginated = useMemo(() => {
    const start = (current - 1) * pageSize;
    return filteredReactions.slice(start, start + pageSize);
  }, [filteredReactions, current, pageSize]);

  /** reset scroll when search/page change */
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [searchTerm, current, pageSize]);

  return (
    <Modal
      className="reaction-modal"
      title={`Reactions${title ? ` — ${title}` : ""}`}
      open={visible}
      onCancel={() => {
        setSearchTerm("");
        setCurrent(1);
        onClose();
      }}
      footer={null}
      width={720}
      centered
    >
      {loading && !isAnyLoading() ? (
        <Spin style={{ display: "block", margin: "40px auto" }} />
      ) : reactions.length === 0 ? (
        <Empty description="No reactions" />
      ) : (
        <>
          <Input
            placeholder="Search actor, title or reaction"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            allowClear
            style={{ marginBottom: 12 }}
          />

          {filteredReactions.length === 0 ? (
            <Empty description="No matching reactions" />
          ) : (
            <div ref={listRef} style={{ maxHeight: 500, overflowY: "auto" }}>
              <List
                dataSource={paginated}
                renderItem={(item) => {
                  const r = getReactionDisplay(
                    item.reactionType || item.reaction
                  );

                  return (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          <Avatar>
                            {
                              (item.actor ||
                                item.name ||
                                item.commentAuthorName ||
                                "U")[0]
                            }
                          </Avatar>
                        }
                        title={
                          <div className="reaction-row">
                            <strong>
                              {item.accountName || item.ownerName}
                            </strong>

                            <span>đã</span>

                            <Tag icon={r.icon} color={r.color}>
                              {r.text}
                            </Tag>

                            <strong>
                              {item.title ||
                                item.targetAuthorNames?.[0] ||
                                item.targetGroupNames?.[0] ||
                                item.actor ||
                                item.name ||
                                item.commentAuthorName}
                            </strong>

                            {item.linkPost && (
                              <a
                                href={item.linkPost}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {item.targetType === "COMMENT"
                                  ? "Mở bình luận"
                                  : "Mở bài viết"}
                              </a>
                            )}
                          </div>
                        }
                        description={
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.reactionTime
                              ? new Date(
                                  item.reactionTime * 1000
                                ).toLocaleString("vi-VN")
                              : "No timestamp"}
                          </Text>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 12,
            }}
          >
            <Pagination
              current={current}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              pageSizeOptions={["5", "10", "20", "50"]}
              onChange={(p, s) => {
                setCurrent(p);
                setPageSize(s);
              }}
              showTotal={(t) => `Total ${t} items`}
            />
          </div>
        </>
      )}
    </Modal>
  );
};

export default ReactionDetails;
