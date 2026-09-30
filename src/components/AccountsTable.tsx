import {
  useState,
  forwardRef,
  useImperativeHandle,
  useEffect,
  type Key,
} from "react";
import { Card, Table, Button, Space, Tooltip } from "antd";
import type { TableColumnsType } from "antd";
import {
  FolderOpenOutlined,
  MessageOutlined,
  PictureOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useAccountsTable } from "./AccountsTable/hooks/useAccountsTable";
import type {
  AccountTableRecord,
  AccountsTableFilter,
} from "./AccountsTable/hooks/useAccountsTable";
import CommentDetails from "./CommentDetails";
import ReactionDetails from "./ReactionDetails";
import "../styles/accounts-table.scss";

import { useImportComments } from "./AccountsTable/hooks/useImportComments";
import { useImportReactions } from "./AccountsTable/hooks/useImportReactions";
import { exportAllImportsToExcel } from "./exportAllImportsToExcel";
import { message, Modal } from "antd";
import { useLoading } from "@/hooks/useLoading";
import { deleteDoc, doc, collection, getDocs } from "firebase/firestore";
import { db } from "@/service/firebase";


export interface AccountsTableRef {
  reloadTable: () => void;
}

interface AccountsTableProps {
  filter?: AccountsTableFilter | undefined;
  reloadStats?: () => void;
  refreshSignal?: unknown;
  onDataChange?: () => void;
}

export const AccountsTable = forwardRef<AccountsTableRef, AccountsTableProps>(
  ({ reloadStats, filter, refreshSignal, onDataChange }, ref) => {
    const { tableData, reloadTable } = useAccountsTable(
      filter,
      refreshSignal,
      "filter-accounts",
      true,
    );
    const { showLoading, closeLoading } = useLoading();

    useImperativeHandle(ref, () => ({
      reloadTable,
    }));

    const [selectedImport, setSelectedImport] = useState<AccountTableRecord | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isReactionModalOpen, setIsReactionModalOpen] = useState(false);
    const [commentView, setCommentView] = useState<"all" | "media">("all");
    const [reactionView, setReactionView] = useState<"all" | "comment">("all");
    const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);


    const { comments, loading } = useImportComments(
      selectedImport?.id,
      isModalOpen,
      filter?.from,
      filter?.to
    );

    const { reactions, loading: reactionsLoading } = useImportReactions(
      selectedImport?.id,
      isReactionModalOpen,
      filter?.from,
      filter?.to
    );

    useEffect(() => {
      // clear selection when data changes
      setSelectedRowKeys([]);
    }, [tableData]);

    const handleDeleteImport = async (importId: string) => {
      const modalRef = Modal.confirm({
        title: "Xác nhận xóa?",
        icon: <ExclamationCircleOutlined />,
        centered: true,
        content:
          "Hành động này sẽ xóa toàn bộ import, comments và reactions liên quan.",
        okText: "Xóa",
        okType: "danger",
        cancelText: "Hủy",

        onOk: async () => {
          // disable cancel and show loading on OK while operation runs
          modalRef.update({
            cancelButtonProps: { disabled: true },
            okButtonProps: { loading: true },
          });

          try {
            // xóa commentChunks
            const commentChunksSnap = await getDocs(
              collection(db, "imports", importId, "commentChunks")
            );
            for (const docSnap of commentChunksSnap.docs) {
              await deleteDoc(
                doc(db, "imports", importId, "commentChunks", docSnap.id)
              );
            }

            // xóa reactionChunks
            const reactionChunksSnap = await getDocs(
              collection(db, "imports", importId, "reactionChunks")
            );
            for (const docSnap of reactionChunksSnap.docs) {
              await deleteDoc(
                doc(db, "imports", importId, "reactionChunks", docSnap.id)
              );
            }

            // xóa document chính
            await deleteDoc(doc(db, "imports", importId));

            message.success("Xóa import thành công ✅");

            // 🔄 reload table, reload stats và notify parent để refresh chart
            reloadTable();
            if (reloadStats) reloadStats();
            if (onDataChange) onDataChange();
          } catch (err) {
            console.error("Xóa import thất bại:", err);
            message.error("Xóa import thất bại ❌");
            throw err;
          }
        },
      });
    };

    const columns: TableColumnsType<AccountTableRecord> = [
      {
        title: "TÊN NGƯỜI DÙNG",
        dataIndex: "accountName",
        render: (text: string) => (
          <Tooltip title={text}>
            <span style={{ color: "white" }}>{text}</span>
          </Tooltip>
        ),
      },
      {
        title: "REACTIONS",
        dataIndex: "reactionsCount",
        key: "reactionsCount",
        align: "center" as const,
        render: (text: number, record) => {
          const count = text || 0;
          const disabled = count === 0;
          return (
            <Tooltip title={disabled ? "No likes" : "View reactions"}>
              <Button
                type="text"
                onClick={() => {
                  if (disabled) return;
                  setReactionView("all");
                  setSelectedImport(record);
                  setIsReactionModalOpen(true);
                }}
                disabled={disabled}
              >
                <span
                  className="data-cell"
                  style={{
                    padding: "4px 8px",
                    background: disabled ? "#2b3146" : "#053e5e",
                    borderRadius: 6,
                    color: "#fff",
                  }}
                >
                  {count}
                </span>
              </Button>
            </Tooltip>
          );
        },
      },
      {
        title: "COMMENTS",
        dataIndex: "commentsCount",
        render: (text: number, record) => {
          const count = text || 0;
          const disabled = count === 0;
          return (
            <Tooltip title={disabled ? "No comments" : "View comments"}>
              <Button
                type="text"
                onClick={() => {
                  if (disabled) return;
                  setCommentView("all");
                  setSelectedImport(record);
                  setIsModalOpen(true);
                }}
                disabled={disabled}
              >
                <span
                  className="data-cell"
                  style={{
                    padding: "4px 8px",
                    background: disabled ? "#2b3146" : "#0b5f4a",
                    borderRadius: 6,
                    color: "#fff",
                  }}
                >
                  {count}
                </span>
              </Button>
            </Tooltip>
          );
        },
      },

      {
        title: "COMMENT MEDIA",
        dataIndex: "mediaCommentsCount",
        key: "mediaCommentsCount",
        align: "center" as const,
        render: (value: number, record) => {
          const count = value || 0;
          const disabled = count === 0;
          return (
            <Tooltip title={disabled ? "Không có comment media" : "Xem comment có media"}>
              <Button
                type="text"
                disabled={disabled}
                icon={<PictureOutlined />}
                onClick={() => {
                  if (disabled) return;
                  setCommentView("media");
                  setSelectedImport(record);
                  setIsModalOpen(true);
                }}
              >
                <span className="metric-pill metric-pill--media">{count}</span>
              </Button>
            </Tooltip>
          );
        },
      },
      {
        title: "REACTION COMMENT",
        dataIndex: "commentReactionsCount",
        key: "commentReactionsCount",
        align: "center" as const,
        render: (value: number, record) => {
          const count = value || 0;
          const disabled = count === 0;
          return (
            <Tooltip title={disabled ? "Không có reaction vào comment" : "Xem reaction vào comment"}>
              <Button
                type="text"
                disabled={disabled}
                icon={<MessageOutlined />}
                onClick={() => {
                  if (disabled) return;
                  setReactionView("comment");
                  setSelectedImport(record);
                  setIsReactionModalOpen(true);
                }}
              >
                <span className="metric-pill metric-pill--comment-reaction">{count}</span>
              </Button>
            </Tooltip>
          );
        },
      },

      {
        title: "THỜI GIAN IMPORT",
        dataIndex: "importedAt",
        key: "importedAt",
        align: "center" as const,
        render: (value: AccountTableRecord["importedAt"]) => {
          if (!value) return "-";

          const date = value.toDate();

          return (
            <span className="data-cell">{date.toLocaleString("vi-VN")}</span>
          );
        },
      },

      {
        title: "HÀNH ĐỘNG",
        key: "actions",
        align: "center" as const,
        render: (_, record) => (
          <Space>
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteImport(record.id)}
            />
          </Space>
        ),
      },
    ];

    return (
      <Card
        className="accounts-table-card"
        extra={
          <div className="export-actions">
            <Space wrap>
              <Button
                type="primary"
                icon={<FolderOpenOutlined />}
                className="folder-button"
                onClick={async () => {
                  try {
                    showLoading("export");
                    await exportAllImportsToExcel(undefined, filter);
                  } finally {
                    closeLoading("export");
                  }
                }}
              >
                Export tất cả
              </Button>
              <Button
                type="default"
                className="export-selected-button"
                disabled={selectedRowKeys.length === 0}
                onClick={async () => {
                  try {
                    showLoading("export");
                    await exportAllImportsToExcel(
                      selectedRowKeys as string[],
                      filter,
                    );
                  } finally {
                    closeLoading("export");
                  }
                }}
              >
                Export theo lựa chọn
              </Button>
            </Space>
            <Tooltip title="Sheet Tổng hợp comment có số gốc, số trùng theo tài khoản + URL và tổng sau khi trừ trùng. Hai sheet URL trùng giữ đầy đủ vị trí comment, media và reaction. Không xóa dữ liệu.">
              <span className="export-report-hint">
                Excel kèm tổng comment sau trừ trùng và 2 sheet tra cứu URL trùng
              </span>
            </Tooltip>
          </div>
        }
      >
        <Table
          columns={columns}
          dataSource={tableData}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          pagination={false}
          // show 10 rows and allow scrolling when more rows exist

          scroll={{
            x: 1000,
            y: tableData.length > 10 ? 500 : undefined,
          }}
          style={{
            background: "transparent",
          }}
          className="custom-table"
          rowKey={(record) => record.id}
        />

        <CommentDetails
          visible={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedImport(null);
          }}
          title={
            commentView === "media"
              ? `${selectedImport?.accountName || ""} · Media`
              : selectedImport?.accountName
          }
          comments={
            commentView === "media"
              ? comments.filter((comment) => (comment.media?.length ?? 0) > 0)
              : comments
          }
          loading={loading}
        />

        <ReactionDetails
          visible={isReactionModalOpen}
          onClose={() => {
            setIsReactionModalOpen(false);
            setSelectedImport(null);
          }}
          title={
            reactionView === "comment"
              ? `${selectedImport?.accountName || ""} · Comment`
              : selectedImport?.accountName
          }
          reactions={reactions
            .filter(
              (reaction) =>
                reactionView === "all" || reaction.targetType === "COMMENT",
            )
            .map((reaction) => ({
              ...reaction,
              accountName: selectedImport?.accountName,
            }))}
          loading={reactionsLoading}
        />
      </Card>
    );
  }
);
