import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { Card } from "antd";
import { useAccountsTable } from "./AccountsTable/hooks/useAccountsTable";
import type { AccountsTableFilter } from "./AccountsTable/hooks/useAccountsTable";
import dayjs from "dayjs";

interface ChartTooltipParam {
  dataIndex: number;
  axisValueLabel?: string;
  marker: string;
  seriesName: string;
  value: unknown;
}

interface EngagementChartProps {
  filter?: { from?: Date; to?: Date } | AccountsTableFilter;
  refreshSignal?: unknown;
}

export const EngagementChart: React.FC<EngagementChartProps> = ({
  filter,
  refreshSignal,
}) => {
  const { tableData } = useAccountsTable(filter, refreshSignal, "filter-chart");

  const option = useMemo(() => {
    const data = tableData || [];

    // Build a labels array (prefer accountName, fallback to date or id)
    const labels = data.map((d) => {
      if (d.accountName) return d.accountName;
      if (d.importedAt && d.importedAt.toDate) {
        return dayjs(d.importedAt.toDate()).format("D/M");
      }
      return d.id;
    });

    // Use numeric indices as x-axis categories and render labels via formatter
    const x = labels.map((_, i) => i);

    const comments = data.map((d) => d.commentsCount || 0);
    const likes = data.map((d) => d.reactionsCount || 0);

    const maxComments = Math.max(1, ...comments);
    const maxLikes = Math.max(1, ...likes);

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (rawParams: ChartTooltipParam | ChartTooltipParam[]) => {
          const params = Array.isArray(rawParams) ? rawParams : [rawParams];
          const idx = params[0]?.dataIndex ?? 0;
          const axisLabel = labels[idx] ?? params[0]?.axisValueLabel ?? "";
          const lines = params.map(
            (param) => `${param.marker} ${param.seriesName}: ${String(param.value)}`
          );
          return `<strong>${axisLabel}</strong><br/>${lines.join("<br/>")}`;
        },
      },
      legend: {
        data: ["Comments", "Likes"],
        textStyle: { color: "#ccc" },
        top: 8,
        right: 20,
      },
      grid: { left: "4%", right: "6%", bottom: "8%", containLabel: true },
      xAxis: [
        {
          type: "category",
          data: x,
          axisLabel: {
            color: "#ccc",
            rotate: 0,
            formatter: (value: string) => {
              const index = Number(value);
              return labels[index] ?? value;
            },
          },
          axisLine: { lineStyle: { color: "#2a2f4a" } },
        },
      ],
      yAxis: [
        {
          type: "value",
          name: "Comments",
          position: "left",
          max: Math.ceil(maxComments * 1.25),
          splitLine: { lineStyle: { color: "#1e2749" } },
          axisLabel: { color: "#ccc" },
        },
        {
          type: "value",
          name: "Likes",
          position: "right",
          max: Math.ceil(maxLikes * 1.25),
          splitLine: { show: false },
          axisLabel: { color: "#ccc" },
        },
      ],
      series: [
        {
          name: "Comments",
          type: "bar",
          data: comments,
          itemStyle: { color: "#4ECDC4" },
          yAxisIndex: 0,
          barWidth: Math.min(
            60,
            Math.max(20, Math.floor(600 / Math.max(1, x.length)))
          ),
          emphasis: { focus: "series" },
        },
        {
          name: "Likes",
          type: "line",
          data: likes,
          itemStyle: { color: "#667eea" },
          yAxisIndex: 1,
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
        },
      ],
      toolbox: { show: false },
      backgroundColor: "transparent",
    };
  }, [tableData]);

  return (
    <Card
      // title={<span style={{ color: "white", fontSize: 16 }}>📊 Engagement</span>}
      style={{
        background: "#151b3d",
        border: "1px solid #1e2749",
        borderRadius: 8,
        marginBottom: 24,
      }}
      bodyStyle={{ padding: "16px 16px 5px 16px" }}
    >
      <ReactECharts option={option} style={{ height: 360 }} />
    </Card>
  );
};

export default EngagementChart;
