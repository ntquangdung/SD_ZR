import { Card, Spin } from "antd";
import {
  LikeOutlined,
  CommentOutlined,
  MessageOutlined,
  PictureOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import { useLoading } from "@/hooks/useLoading";
import "@/styles/stats-cards.scss";

interface Stats {
  likes: number;
  comments: number;
  mediaComments: number;
  commentReactions: number;
  shares: number;
  totalImport?: number;
}

interface StatsCardsProps {
  stats: Stats;
  loading?: boolean;
  dateLabel: string;
}

export const StatsCards = ({
  stats,
  loading = false,
  dateLabel,
}: StatsCardsProps) => {
  const { isAnyLoading } = useLoading();
  const statsData = [
    {
      key: "likes",
      label: "Tổng số Reactions",
      value: stats.likes,
      color: "#5B8DEE",
      icon: <LikeOutlined style={{ fontSize: 20, color: "#fff" }} />,
    },
    {
      key: "comments",
      label: "Tổng số Comments",
      value: stats.comments,
      color: "#4ECDC4",
      icon: <CommentOutlined style={{ fontSize: 20, color: "#fff" }} />,
    },
    {
      key: "mediaComments",
      label: "Comment hình ảnh",
      value: stats.mediaComments,
      color: "#F59E0B",
      icon: <PictureOutlined />,
    },
    {
      key: "commentReactions",
      label: "Reaction comment",
      value: stats.commentReactions,
      color: "#A78BFA",
      icon: <MessageOutlined />,
    },
    {
      key: "imports",
      label: "Tổng số Import",
      value: stats.totalImport ?? 0,
      color: "#FF6B9D",
      icon: <ShareAltOutlined style={{ fontSize: 20, color: "#fff" }} />,
    },
  ];

  return (
    <div className="stats-grid">
      {statsData.map((stat) => (
        <Card className="stats-card" key={stat.key}>
            {loading && !isAnyLoading() ? (
              <div className="stats-card__loading">
                <Spin size="large" />
              </div>
            ) : (
              <div className="stats-card__content">
                <div className="stats-card__copy">
                  <div className="stats-card__label">{stat.label}</div>
                  <div className="stats-card__value">{stat.value}</div>
                  <div className="stats-card__date">{dateLabel}</div>
                </div>
                <div
                  className="stats-card__icon"
                  style={{ background: stat.color }}
                >
                  {stat.icon}
                </div>
              </div>
            )}
        </Card>
      ))}
    </div>
  );
};
