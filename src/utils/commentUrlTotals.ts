import type { WorkBook } from "xlsx";
import { normalizeHttpUrl, normalizeInlineText } from "./facebookData";

export const COMMENT_TOTALS_SHEET_NAME = "Tổng hợp comment";
export const COMMENT_COUNT_RULE =
  "Trùng = các dòng comment cùng tài khoản + cùng URL từ lần thứ 2, kể cả comment-media hoặc khác lượt import. Giữ 1 lần cho mỗi cặp tài khoản/URL. So sánh nguyên URL cột G, không bỏ comment_id/query. Nhận diện tài khoản theo tên hiển thị (bỏ khác biệt hoa/thường, khoảng trắng), không phải ID Facebook.";

interface ActivityRow {
  accountName: string;
  type: string;
  url: string;
}

export interface CommentUrlTotal {
  accountName: string;
  comments: number;
  mediaComments: number;
  total: number;
  duplicates: number;
  afterDeduplication: number;
  withoutUrl: number;
}

/** Reporting metric only: never deletes records or changes their links. */
export const summarizeCommentUrls = (
  rows: readonly ActivityRow[],
): CommentUrlTotal[] => {
  const accounts = new Map<string, {
    result: CommentUrlTotal;
    urls: Set<string>;
  }>();
  for (const row of rows) {
    if (row.type !== "Comment" && row.type !== "Comment - Media") continue;
    const accountName = normalizeInlineText(row.accountName).normalize("NFC") || "Unknown";
    const accountKey = accountName.toLocaleLowerCase("vi-VN");
    let account = accounts.get(accountKey);
    if (!account) {
      account = {
        result: { accountName, comments: 0, mediaComments: 0, total: 0,
          duplicates: 0, afterDeduplication: 0, withoutUrl: 0 },
        urls: new Set(),
      };
      accounts.set(accountKey, account);
    }
    const { result, urls } = account;
    const url = normalizeHttpUrl(row.url);
    const hasMedia = row.type === "Comment - Media";
    if (hasMedia) result.mediaComments++;
    else result.comments++;
    result.total++;
    if (!url) {
      result.withoutUrl++;
    } else if (urls.has(url)) {
      result.duplicates++;
      continue;
    } else {
      urls.add(url);
    }
    result.afterDeduplication++;
  }
  return [...accounts.values()].map(({ result }) => result);
};

export const appendCommentUrlTotals = (
  workbook: WorkBook,
  rows: readonly ActivityRow[],
  XLSX: typeof import("xlsx"),
): void => {
  const accounts = summarizeCommentUrls(rows);
  const values: (string | number)[][] = [[
    "Tài khoản", "Số lượng comment thường", "Số lượng comment - media", "Tổng comment",
    "Số lượng comment trùng", "Tổng comment sau khi trừ trùng", "Comment chưa có URL",
  ]];
  for (const account of accounts) {
    values.push([account.accountName, account.comments, account.mediaComments,
      account.total, account.duplicates, account.afterDeduplication, account.withoutUrl]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(values);
  for (let row = 2; row <= values.length; row++) {
    sheet[`D${row}`].f = `SUM(B${row}:C${row})`;
    sheet[`F${row}`].f = `D${row}-E${row}`;
  }
  const totalRow = values.length + 1;
  sheet[`A${totalRow}`] = { t: "s", v: "Tổng" };
  for (const [column, key] of [
    ["B", "comments"], ["C", "mediaComments"], ["D", "total"],
    ["E", "duplicates"], ["F", "afterDeduplication"], ["G", "withoutUrl"],
  ] as const) {
    sheet[`${column}${totalRow}`] = {
      t: "n",
      v: accounts.reduce((sum, account) => sum + account[key], 0),
      f: column === "D" ? `SUM(B${totalRow}:C${totalRow})`
        : column === "F" ? `D${totalRow}-E${totalRow}`
        : accounts.length ? `SUBTOTAL(9,${column}2:${column}${values.length})` : "0",
      z: "#,##0",
    };
  }
  sheet["!ref"] = `A1:G${totalRow}`;
  sheet["!autofilter"] = { ref: `A1:G${values.length}` };
  XLSX.utils.sheet_add_aoa(sheet, [
    ["Cách tính"], [COMMENT_COUNT_RULE],
    ["Tổng comment = Comment + Comment - Media. Tổng sau trừ trùng = Tổng comment - Comment trùng. Không cộng reaction."],
    ["Mỗi dòng chưa có URL vẫn tính 1, không suy đoán là trùng. Cột Comment chưa có URL đã nằm trong tổng, không cộng thêm."],
    ["Tính trên dữ liệu đã chọn khi xuất. Số dòng gốc và các sheet chi tiết vẫn giữ nguyên."],
    ["Lọc tài khoản ở bảng này sẽ cập nhật dòng Tổng. Lọc/sửa các sheet chi tiết không tính lại bảng tổng này; cần xuất lại từ tool."],
  ], { origin: "I1" });
  sheet["!cols"] = [
    { wch: 28 }, { wch: 30 }, { wch: 30 }, { wch: 20 },
    { wch: 30 }, { wch: 40 }, { wch: 28 }, { wch: 3 }, { wch: 100 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, COMMENT_TOTALS_SHEET_NAME);
  // Put the requested business total before the preserved source/import sheets.
  workbook.SheetNames = [COMMENT_TOTALS_SHEET_NAME,
    ...workbook.SheetNames.filter((name) => name !== COMMENT_TOTALS_SHEET_NAME)];
};
