import {
  Button,
  Space,
  DatePicker,
  Select,
  Tooltip,
  Modal,
  message,
  Avatar,
  Dropdown,
} from "antd";
import {
  FileTextOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useCallback, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLoading } from "@/hooks/useLoading";
import { useAuth } from "@/hooks/useAuth";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import {
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/service/firebase";

import "../styles/header.scss";
import { ImportZip, type FormDrawerHandle } from "./ImportFolder";
import type { DataFilter } from "@/types/domain";

interface HeaderProps {
  onImportSuccess?: () => void;
  onAdvancedFilterChange?: (filter: DataFilter) => void;
}

export const Header = ({
  onImportSuccess,
  onAdvancedFilterChange,
}: HeaderProps) => {
  const drawerImportFolderRef = useRef<FormDrawerHandle>(null);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [accountOptions, setAccountOptions] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<
    string[] | undefined
  >(undefined);
  const { showLoading, closeLoading } = useLoading();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleImportFolderClick = () => {
    drawerImportFolderRef.current?.open();
  };

  const handleRangeChange = (dates: null | [Dayjs | null, Dayjs | null]) => {
    if (!dates || !dates[0] || !dates[1]) {
      setRange(null);
      return;
    }

    setRange([dates[0], dates[1]]);
  };

  const fetchAccounts = useCallback(async () => {
    try {
      const q = query(collection(db, "imports"), orderBy("importedAt", "desc"));
      const snap = await getDocs(q);
      // keep order and allow duplicate display names (use unique keys when rendering)
      const names = snap.docs
        .map((d) => (d.data().accountName || "Unknown").toString())
        .filter(Boolean);
      setAccountOptions(names);
    } catch (err) {
      console.error("Fetch account names failed:", err);
    }
  }, []);
  const handleDeleteAll = () => {
    const modalRef = Modal.confirm({
      title: "Xác nhận xóa tất cả imports?",
      icon: <ExclamationCircleOutlined />,
      centered: true,
      content:
        "Hành động này sẽ xóa toàn bộ imports, comments và reactions liên quan.",
      okText: "Xóa tất cả",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        modalRef.update({
          cancelButtonProps: { disabled: true },
          okButtonProps: { loading: true },
        });

        try {
          const q = query(
            collection(db, "imports"),
            orderBy("importedAt", "desc"),
          );
          const snap = await getDocs(q);
          for (const docSnap of snap.docs) {
            const id = docSnap.id;
            try {
              const commentChunksSnap = await getDocs(
                collection(db, "imports", id, "commentChunks"),
              );
              for (const c of commentChunksSnap.docs) {
                await deleteDoc(doc(db, "imports", id, "commentChunks", c.id));
              }
            } catch (e) {
              console.warn(e);
            }

            try {
              const reactionChunksSnap = await getDocs(
                collection(db, "imports", id, "reactionChunks"),
              );
              for (const r of reactionChunksSnap.docs) {
                await deleteDoc(doc(db, "imports", id, "reactionChunks", r.id));
              }
            } catch (e) {
              console.warn(e);
            }

            await deleteDoc(doc(db, "imports", id));
          }

          message.success("Đã xóa tất cả imports");
          await fetchAccounts();
          onImportSuccess?.();
        } catch (err) {
          console.error("Delete all failed:", err);
          message.error("Xóa thất bại");
          throw err;
        }
      },
    });
  };

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  const handleFilterClick = () => {
    try {
      showLoading("apply-advanced-filter");
      let from: Date | undefined = undefined;
      let to: Date | undefined = undefined;
      if (range && range[0] && range[1]) {
        from = dayjs(range[0]).startOf("day").toDate();
        to = dayjs(range[1]).endOf("day").toDate();
      }

      const nameToSend =
        selectedAccounts && selectedAccounts.length > 0
          ? selectedAccounts
          : undefined;
      onAdvancedFilterChange?.({ from, to, name: nameToSend });
    } catch (error) {
      console.error("Apply advanced filter failed:", error);
    } finally {
      closeLoading("apply-advanced-filter");
    }
    if (!range && !selectedAccounts?.length) {
      return;
    }
  };

  const handleClear = () => {
    setRange(null);
    setSelectedAccounts(undefined);
    onAdvancedFilterChange?.({});
  };

  const handleImportSuccessWrapper = async () => {
    await fetchAccounts();
    onImportSuccess?.();
  };

  return (
    <div className="header-container">
      <div className="logo-section">
        <div className="logo-icon">📊</div>
        <span className="title">FB Pulse Tracker</span>
      </div>
      <Space>
        <Button icon={<FileTextOutlined />} onClick={handleImportFolderClick}>
          Import
        </Button>
        <DatePicker.RangePicker
          value={range}
          onChange={handleRangeChange}
          placeholder={["Ngày bắt đầu", "Ngày kết thúc"]}
          allowClear
        />
        <Select
          placeholder="Chọn người dùng"
          style={{ width: 240 }}
          value={selectedAccounts}
          onChange={(val) => setSelectedAccounts(val as string[])}
          // show first 3 tags, collapse the rest into "+N others" so earliest selections stay visible
          maxTagCount={"responsive"}
          mode="multiple"
          maxTagPlaceholder={(omitted) => {
            const labels = (omitted || []).map((o) => {
              if (!o) return "";
              if (typeof o === "string") return o;
              if (typeof o === "object") return o.label ?? o.value ?? String(o);
              return String(o);
            });

            return (
              <Tooltip title={labels.join(", ")}>
                <span>{`+${labels.length}`}</span>
              </Tooltip>
            );
          }}
        >
          {accountOptions.map((name, idx) => (
            <Select.Option key={`${name}-${idx}`} value={name}>
              {name}
            </Select.Option>
          ))}
        </Select>
        <Button type="primary" onClick={handleFilterClick}>
          Lọc dữ liệu
        </Button>
        <Button onClick={handleClear}>Xóa bộ lọc</Button>

        <Button danger icon={<DeleteOutlined />} onClick={handleDeleteAll}>
          Xóa tất cả dữ liệu
        </Button>
        {user ? (
          <Dropdown
            menu={{
              items: [
                {
                  key: "info",
                  label: (
                    <div style={{ padding: 8, minWidth: 50 }}>
                      <div style={{ fontWeight: 600 }}>
                        {user.displayName ?? ""}
                      </div>
                      <div style={{ color: "rgba(0,0,0,0.65)", fontSize: 12 }}>
                        {user.email}
                      </div>
                    </div>
                  ),
                  disabled: true,
                },
                {
                  key: "admin",
                  label: (
                    <div
                      style={{ padding: 8 }}
                      onClick={() => navigate("/admin")}
                    >
                      Admin
                    </div>
                  ),
                },
                {
                  key: "logout",
                  label: (
                    <div style={{ padding: 8 }} onClick={() => logout()}>
                      Đăng xuất
                    </div>
                  ),
                },
              ],
            }}
            placement="bottomRight"
            trigger={["click"]}
          >
            <Avatar
              icon={<UserOutlined />}
              style={{
                background: "#fff",
                color: "#0a0e27",
                cursor: "pointer",
              }}
            />
          </Dropdown>
        ) : null}
      </Space>

      <ImportZip
        ref={drawerImportFolderRef}
        onImportSuccess={handleImportSuccessWrapper}
      />
    </div>
  );
};
