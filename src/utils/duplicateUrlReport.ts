import type { WorkBook, WorkSheet } from "xlsx";
import { normalizeHttpUrl } from "./facebookData";

export interface ExportedUrlRow {
  url: string;
  sheetName: string;
  rowNumber: number;
  accountName: string;
  importId: string;
  type: string;
  content: string;
  date: string;
  title: string;
  location: string;
}

export const DUPLICATE_URL_SHEET_NAMES = {
  summary: "URL trùng - Tổng hợp",
  details: "URL trùng - Chi tiết",
} as const;

const MAX_EXCEL_ROWS = 1_048_576;
const MAX_CELL_CHARACTERS = 32_767;
const MAX_SHEET_HYPERLINKS = 65_530;
const CRITERION =
  "Chỉ so sánh URL HTTP(S) đầy đủ sau chuẩn hóa như cột G của các sheet đã xuất; giữ nguyên query, comment_id, reply_comment_id và fragment. Bỏ qua URL trống/không hợp lệ. Chỉ báo cáo URL xuất hiện từ 2 lần.";
const CAUTION =
  "URL trùng không đồng nghĩa bình luận trùng: nhiều bình luận/reaction có thể cùng một bài viết. Báo cáo không xóa dữ liệu hay thay đổi cách ghép URL. Nội dung mô tả quá dài được rút gọn theo giới hạn ô Excel.";

type ReportGroup = {
  url: string;
  rows: ExportedUrlRow[];
};

// Map insertion order keeps groups and positions in their exported sheet order.
const groupDuplicateUrls = (rows: readonly ExportedUrlRow[]): ReportGroup[] => {
  const groups = new Map<string, ExportedUrlRow[]>();
  for (const row of rows) {
    const url = normalizeHttpUrl(row.url);
    if (!url) continue;
    const matches = groups.get(url);
    if (matches) matches.push(row);
    else groups.set(url, [row]);
  }
  return Array.from(groups, ([url, matches]) => ({ url, rows: matches }))
    .filter((group) => group.rows.length > 1);
};

const internalLink = (sheetName: string, cell: string) =>
  `#'${sheetName.replace(/'/g, "''")}'!${cell}`;

const cellText = (value: string): string =>
  value.length <= MAX_CELL_CHARACTERS
    ? value
    : `${value.slice(0, MAX_CELL_CHARACTERS - 1)}…`;

const addNotes = (
  sheet: WorkSheet,
  column: string,
  XLSX: typeof import("xlsx"),
) => {
  XLSX.utils.sheet_add_aoa(sheet, [["Ghi chú"], [CRITERION], [CAUTION]], {
    origin: `${column}1`,
  });
  sheet.A1.c = [{ a: "Báo cáo URL trùng", t: `${CRITERION}\n${CAUTION}` }];
};

export const appendDuplicateUrlReport = (
  workbook: WorkBook,
  rows: readonly ExportedUrlRow[],
  XLSX: typeof import("xlsx"),
): { duplicateUrlCount: number; occurrenceCount: number } => {
  const groups = groupDuplicateUrls(rows);
  const occurrenceCount = groups.reduce((total, group) => total + group.rows.length, 0);
  // Validate before appending either sheet, so no incomplete report is produced.
  if (groups.length + 1 > MAX_EXCEL_ROWS || occurrenceCount + 1 > MAX_EXCEL_ROWS) {
    throw new RangeError("Báo cáo URL trùng vượt giới hạn 1.048.576 dòng/sheet của Excel. Hãy xuất ít lượt import hơn.");
  }
  // Each row has both a web URL and an internal navigation hyperlink.
  if (groups.length * 2 > MAX_SHEET_HYPERLINKS || occurrenceCount * 2 > MAX_SHEET_HYPERLINKS) {
    throw new RangeError("Báo cáo URL trùng vượt giới hạn 65.530 hyperlink/sheet của Excel (tối đa 32.765 vị trí có 2 liên kết). Hãy xuất ít lượt import hơn.");
  }
  const existingNames = new Set(workbook.SheetNames.map((name) => name.toLowerCase()));
  for (const name of Object.values(DUPLICATE_URL_SHEET_NAMES)) {
    if (existingNames.has(name.toLowerCase())) {
      throw new Error(`Tên sheet dành cho báo cáo URL trùng đã được sử dụng: ${name}`);
    }
  }
  for (const group of groups) {
    if (group.url.length > MAX_CELL_CHARACTERS || group.rows.some((row) => row.url.length > MAX_CELL_CHARACTERS)) {
      throw new RangeError("URL trong báo cáo vượt giới hạn 32.767 ký tự/ô Excel. Không thể xuất đầy đủ URL này.");
    }
    for (const row of group.rows) {
      if (!Number.isInteger(row.rowNumber) || row.rowNumber < 1 || row.rowNumber > MAX_EXCEL_ROWS) {
        throw new RangeError(`Vị trí dòng Excel không hợp lệ trong sheet ${row.sheetName}: ${row.rowNumber}`);
      }
    }
  }

  const summaryRows: (string | number)[][] = [[
    "Nhóm URL", "URL trùng", "Số lần xuất hiện", "Số comment", "Số reaction",
    "Số tên tài khoản", "Số lượt import", "Phạm vi", "Xem vị trí",
  ]];
  const detailRows: (string | number)[][] = [[
    "Nhóm URL", "URL gốc", "Số lần xuất hiện", "Tài khoản", "Import ID",
    "Sheet nguồn", "Dòng Excel", "Ô URL nguồn", "Type", "Nội dung/Reaction",
    "Ngày", "Tiêu đề/Post", "Nơi bình luận", "Đến ô nguồn",
  ]];
  const firstDetailRows: number[] = [];

  groups.forEach((group, index) => {
    const importCount = new Set(group.rows.map((row) => row.importId)).size;
    firstDetailRows.push(detailRows.length + 1);
    summaryRows.push([
      index + 1,
      group.url,
      group.rows.length,
      group.rows.filter((row) => row.type === "Comment" || row.type === "Comment - Media").length,
      group.rows.filter((row) => row.type === "Reaction" || row.type === "Reaction comment").length,
      new Set(group.rows.map((row) => row.accountName)).size,
      importCount,
      importCount > 1 ? "Khác lượt import" : "Cùng lượt import",
      "Xem tất cả vị trí",
    ]);
    for (const row of group.rows) {
      detailRows.push([
        index + 1, row.url, group.rows.length, cellText(row.accountName),
        cellText(row.importId), row.sheetName, row.rowNumber, `G${row.rowNumber}`,
        cellText(row.type), cellText(row.content), cellText(row.date),
        cellText(row.title), cellText(row.location), "Đến ô URL gốc",
      ]);
    }
  });

  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  const details = XLSX.utils.aoa_to_sheet(detailRows);
  summary["!autofilter"] = { ref: `A1:I${summaryRows.length}` };
  details["!autofilter"] = { ref: `A1:N${detailRows.length}` };

  let detailRow = 2;
  groups.forEach((group, index) => {
    summary[`B${index + 2}`].l = { Target: group.url, Tooltip: "Mở URL" };
    summary[`I${index + 2}`].l = {
      Target: internalLink(DUPLICATE_URL_SHEET_NAMES.details, `A${firstDetailRows[index]}`),
      Tooltip: "Xem từng vị trí xuất hiện của URL này",
    };
    for (const row of group.rows) {
      details[`B${detailRow}`].l = { Target: normalizeHttpUrl(row.url), Tooltip: "Mở URL" };
      details[`N${detailRow}`].l = {
        Target: internalLink(row.sheetName, `G${row.rowNumber}`),
        Tooltip: `Mở sheet ${row.sheetName}, ô G${row.rowNumber}`,
      };
      detailRow++;
    }
  });

  if (groups.length === 0) {
    const emptyMessage = [["Không có URL trùng trong dữ liệu đã xuất."]];
    XLSX.utils.sheet_add_aoa(summary, emptyMessage, { origin: "A2" });
    XLSX.utils.sheet_add_aoa(details, emptyMessage, { origin: "A2" });
  }
  addNotes(summary, "K", XLSX);
  addNotes(details, "P", XLSX);
  summary["!cols"] = [
    { wch: 12 }, { wch: 65 }, { wch: 20 }, { wch: 16 }, { wch: 16 },
    { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 3 }, { wch: 75 },
  ];
  details["!cols"] = [
    { wch: 12 }, { wch: 65 }, { wch: 20 }, { wch: 25 }, { wch: 30 },
    { wch: 31 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 60 },
    { wch: 25 }, { wch: 50 }, { wch: 35 }, { wch: 22 }, { wch: 3 }, { wch: 75 },
  ];
  XLSX.utils.book_append_sheet(workbook, summary, DUPLICATE_URL_SHEET_NAMES.summary);
  XLSX.utils.book_append_sheet(workbook, details, DUPLICATE_URL_SHEET_NAMES.details);
  return { duplicateUrlCount: groups.length, occurrenceCount };
};
