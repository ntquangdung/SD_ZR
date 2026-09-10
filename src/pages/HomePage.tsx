import { Header } from "@/components/Header";
import { StatsCards } from "@/components/StatsCards";
import EngagementChart from "@/components/EngagementChart";
import { AccountsTable } from "@/components/AccountsTable";
import { useRef, useState, useMemo } from "react";
import dayjs from "dayjs";
import { useStats } from "@/hooks/useStats";
import type { DataFilter } from "@/types/domain";

interface AccountsTableRef {
  reloadTable: () => void;
}

// No preset date filters — show all data by default. Advanced header filters can be used.

export default function HomePage() {
  const accountsTableRef = useRef<AccountsTableRef>(null);
  const [advancedFilter, setAdvancedFilter] = useState<DataFilter>({});

  // Memoize effectiveFilter so reference is stable and hooks don't refetch on every render
  // Apply filter when user selected a full date range OR when only `name` is provided.
  const effectiveFilter = useMemo(() => {
    const hasRange = !!(advancedFilter.from && advancedFilter.to);
    const hasName = !!advancedFilter.name;
    if (hasRange || hasName) return advancedFilter;
    return undefined;
  }, [advancedFilter]);

  const {
    stats,
    loading: statsLoading,
    reloadStats,
  } = useStats(effectiveFilter);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Tạo label ngày: nếu có advanced range hiển thị range, nếu không hiển thị 'All time'
  let dateLabel = "All time";
  if (effectiveFilter && effectiveFilter.from && effectiveFilter.to) {
    const from = dayjs(effectiveFilter.from);
    const to = dayjs(effectiveFilter.to);
    dateLabel = from.isSame(to, "day")
      ? from.format("D/M/YYYY")
      : `${from.format("D/M/YYYY")} - ${to.format("D/M/YYYY")}`;
  }

  const handleImportSuccess = () => {
    accountsTableRef.current?.reloadTable();
    reloadStats();
    setRefreshSignal((s) => s + 1);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0e27",
        padding: "24px",
      }}
      className="home-page-container"
    >
      <Header
        onImportSuccess={handleImportSuccess}
        onAdvancedFilterChange={(f) => setAdvancedFilter(f)}
      />
      <StatsCards
        stats={stats}
        loading={statsLoading}
        dateLabel={dateLabel}
      />
      <EngagementChart
        filter={effectiveFilter}
        refreshSignal={refreshSignal}
      />
      <AccountsTable
        ref={accountsTableRef}
        filter={effectiveFilter}
        reloadStats={reloadStats}
        refreshSignal={refreshSignal}
        onDataChange={() => setRefreshSignal((s) => s + 1)}
      />
    </div>
  );
}
