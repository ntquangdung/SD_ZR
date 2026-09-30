import type { CellObject } from "xlsx";
import {
  collection,
  getDocs,
  orderBy,
  query,
  doc,
  getDoc,
} from "firebase/firestore";
import { message } from "antd";
import { db } from "@/service/firebase";
import type {
  CommentRecord,
  DataFilter,
  ImportRecord,
  ReactionRecord,
} from "@/types/domain";
import { getImportChunkItems } from "@/utils/firestoreData";
import {
  normalizeHttpUrl,
  normalizeInlineText,
} from "@/utils/facebookData";
import { matchCommentsToPostUrls } from "@/utils/facebookImport";
import {
  appendDuplicateUrlReport,
  DUPLICATE_URL_SHEET_NAMES,
  type ExportedUrlRow,
} from "@/utils/duplicateUrlReport";
import { appendCommentUrlTotals, COMMENT_TOTALS_SHEET_NAME } from "@/utils/commentUrlTotals";

// If selectedIds is provided, export only those imports; otherwise export all.
type ExcelValue = string | number;
type StyledCell = CellObject & { s?: object };

const reserveAccountSheetName = (accountName: string, usedNames: Set<string>) => {
  const baseName = accountName
    .replace(/[:\\/?*[\]|]/g, "")
    .trim()
    .slice(0, 31)
    .replace(/^'+|'+$/g, "") || "Sheet";
  let name = baseName;
  let counter = 1;
  while (usedNames.has(name.toLowerCase())) {
    const suffix = `_${++counter}`;
    name = baseName.slice(0, 31 - suffix.length) + suffix;
  }
  usedNames.add(name.toLowerCase());
  return name;
};

export const exportAllImportsToExcel = async (
  selectedIds?: string[],
  filter?: DataFilter,
) => {
  try {
    // XLSX is large and only needed after the user clicks Export.
    const XLSX = await import("xlsx");

    const importsList: Array<{ id: string; data: Omit<ImportRecord, "id"> }> = [];

    if (selectedIds && selectedIds.length > 0) {
      for (const id of new Set(selectedIds)) {
        const importDocRef = doc(db, "imports", id);
        const importSnap = await getDoc(importDocRef);
        if (importSnap.exists()) {
          importsList.push({
            id: importSnap.id,
            data: importSnap.data() as Omit<ImportRecord, "id">,
          });
        }
      }
    } else {
      const importsSnap = await getDocs(
        query(collection(db, "imports"), orderBy("importedAt", "desc"))
      );
        if (importsSnap.empty) {
          message.info("Không có imports để export");
          return;
        }

      for (const importDoc of importsSnap.docs) {
        const data = importDoc.data() as Omit<ImportRecord, "id">;
        // apply name filter at import level if provided (supports array)
        if (filter?.name) {
          const nm = (data.accountName || "").toString();
          if (Array.isArray(filter.name)) {
            if (!filter.name.includes(nm)) continue;
          } else {
            if (!nm.includes(filter.name)) continue;
          }
        }
        importsList.push({ id: importDoc.id, data });
      }
    }

    if (importsList.length === 0) {
      message.info("Không có imports khớp để export");
      return;
    }

    const workbook = XLSX.utils.book_new();
    const exportedRows: ExportedUrlRow[] = [];
    // Excel sheet names are case-insensitive. Reserve report names up front so
    // source links always point to the final, unambiguous account sheet name.
    const usedSheetNames = new Set(
      [COMMENT_TOTALS_SHEET_NAME, ...Object.values(DUPLICATE_URL_SHEET_NAMES)]
        .map((name) => name.toLowerCase()),
    );

    for (const importEntry of importsList) {
      const importId = importEntry.id;
      const accountName =
        normalizeInlineText(importEntry.data.accountName) || "Unknown";
      const finalName = reserveAccountSheetName(accountName, usedSheetNames);

      const rows: ExcelValue[][] = [];
      const hyperlinkCells: Array<{ row: number; column: number; url: string }> = [];
      // The final two helper columns stay hidden and power filter-aware totals.
      rows.push([
        "Type",
        "Tên người dùng",
        "Nội dung/Reaction",
        "Ngày",
        "Tiêu đề/Post",
        "Nơi bình luận",
        "Comment URL / Post URL",
        "IsComment",
        "IsReaction",
      ]);

      // Load both datasets first. Old imports may not have `postUrl`; in that
      // case we safely rebuild Comment -> Post URL before creating Excel rows.
      const [storedComments, reactionItems] = await Promise.all([
        getImportChunkItems<CommentRecord>(importId, "commentChunks"),
        getImportChunkItems<ReactionRecord>(importId, "reactionChunks"),
      ]);
      const rebuiltComments = matchCommentsToPostUrls(
        storedComments,
        reactionItems,
      );
      const comments = storedComments.map((comment, index) =>
        normalizeHttpUrl(comment.postUrl) ? comment : rebuiltComments[index],
      );

      comments.forEach((cmt) => {
          // if filter date range provided, skip comments outside range
          if (filter?.from && filter?.to) {
            const ct = (cmt.commentTime || 0) * 1000;
            if (ct < filter.from.getTime() || ct > filter.to.getTime()) return;
          }

          const authorName = normalizeInlineText(cmt.authorName);
          // Excel rows stay compact: line breaks and repeated whitespace become one space.
          const mediaItems = cmt.media ?? [];
          const mediaText = mediaItems
            .map((media) => {
              const label = media.type === "IMAGE"
                ? "Hình ảnh"
                : media.type === "VIDEO"
                  ? "Video"
                  : "Media";
              return `[${label}: ${media.uri}]`;
            })
            .join(" ");
          const content = normalizeInlineText(
            [cmt.content, mediaText].filter(Boolean).join(" "),
          );
          const title = normalizeInlineText(cmt.title);
          const commentLocation =
            normalizeInlineText(cmt.commentLocation) ||
            normalizeInlineText(cmt.group) ||
            title;
          const directCommentUrl = normalizeHttpUrl(cmt.commentLink);
          const postUrl = normalizeHttpUrl(cmt.postUrl);
          const bestAvailableUrl = directCommentUrl || postUrl;

          // Old imports can contain Facebook event containers that have only
          // timestamp/title. They are not real comment records.
          if (!authorName && !content) return;

          rows.push([
            mediaItems.length > 0 ? "Comment - Media" : "Comment",
            authorName,
            content,
            cmt.commentTime
              ? new Date(cmt.commentTime * 1000).toLocaleString("vi-VN")
              : "",
            title,
            commentLocation,
            bestAvailableUrl,
            1,
            0,
          ]);
          if (bestAvailableUrl) {
            hyperlinkCells.push({
              row: rows.length - 1,
              column: 6,
              url: bestAvailableUrl,
            });
          }
      });

      // reactions
      reactionItems.forEach((r) => {
          // if filter date range provided, skip reactions outside range
          if (filter?.from && filter?.to) {
            const rt = (r.reactionTime || 0) * 1000;
            if (rt < filter.from.getTime() || rt > filter.to.getTime()) return;
          }

          const reactionLink = normalizeHttpUrl(r.linkPost);
          const reactionLocation = normalizeInlineText(
            r.targetGroupNames?.[0] || r.matchNames?.[0],
          );
          const reactionTarget = normalizeInlineText(
            r.targetAuthorNames?.[0] || r.ownerName,
          );
          rows.push([
            r.targetType === "COMMENT" ? "Reaction comment" : "Reaction",
            accountName,
            normalizeInlineText(r.reaction),
            r.reactionTime
              ? new Date(r.reactionTime * 1000).toLocaleString("vi-VN")
              : "",
            r.targetType === "COMMENT"
              ? `Reaction vào bình luận${reactionTarget ? ` của ${reactionTarget}` : ""}`
              : reactionTarget,
            reactionLocation,
            reactionLink,
            0,
            1,
          ]);
          if (reactionLink) {
            hyperlinkCells.push({
              row: rows.length - 1,
              column: 6,
              url: reactionLink,
            });
          }
      });

      // Include the header and totals row; never write a workbook beyond
      // Excel's worksheet/hyperlink limits or silently discard occurrences.
      if (rows.length + 1 > 1_048_576 || hyperlinkCells.length > 65_530) {
        throw new RangeError(
          `Sheet ${finalName} vượt giới hạn Excel (1.048.576 dòng hoặc 65.530 liên kết). Hãy thu hẹp khoảng ngày hoặc xuất ít lượt import hơn.`,
        );
      }

      // Capture only the rows actually exported, after filtering/skipping empty
      // containers. Keep blank URLs for comment totals; the duplicate URL
      // report excludes those itself. Headers/totals are never activities.
      rows.forEach((row, index) => {
        if (index === 0) return;
        exportedRows.push({
          url: String(row[6]),
          sheetName: finalName,
          rowNumber: index + 1,
          accountName,
          importId,
          type: String(row[0]),
          content: String(row[2]),
          date: String(row[3]),
          title: String(row[4]),
          location: String(row[5]),
        });
      });

      // totals using SUBTOTAL over helper columns so they update when user filters in Excel
      // We'll create a single merged cell across A:G with a concatenated formula
      const dataStartRow = 2; // header is row 1
      const dataEndRow = rows.length; // current last row index (before adding totals)

      // Helper columns are H/I.
      const subtotalComments = dataEndRow >= dataStartRow
        ? `SUBTOTAL(9,H${dataStartRow}:H${dataEndRow})`
        : "0";
      const subtotalReactions = dataEndRow >= dataStartRow
        ? `SUBTOTAL(9,I${dataStartRow}:I${dataEndRow})`
        : "0";
      const concatFormula = `="Tổng: Comments: " & ${subtotalComments} & " - Reactions: " & ${subtotalReactions}`;

      // Put the concatenated formula in A and keep H/I numeric for filtering.
      rows.push([
        concatFormula,
        "",
        "",
        "",
        "",
        "",
        "",
        `=${subtotalComments}`,
        `=${subtotalReactions}`,
      ]);

      const sheet = XLSX.utils.aoa_to_sheet(rows);
      // Ensure totals are formula cells so Excel recalculates them after filtering.
      const lastRowIndex = rows.length;
      const aAddr = XLSX.utils.encode_cell({ r: lastRowIndex - 1, c: 0 });
      const hAddr = XLSX.utils.encode_cell({ r: lastRowIndex - 1, c: 7 });
      const iAddr = XLSX.utils.encode_cell({ r: lastRowIndex - 1, c: 8 });
      const concatF = `CONCATENATE("Tổng: Comments: ",${subtotalComments}," - Reactions: ",${subtotalReactions})`;
      const totalLabelCell: StyledCell = {
        t: "s",
        f: concatF,
        s: {
          font: { name: "Calibri", sz: 18, bold: true, color: { rgb: "FF000000" } },
          alignment: { horizontal: "center", vertical: "center" },
        },
      };
      const commentTotalCell: StyledCell = {
        t: "n",
        f: subtotalComments,
        s: { font: { bold: true } },
      };
      const reactionTotalCell: StyledCell = {
        t: "n",
        f: subtotalReactions,
        s: { font: { bold: true } },
      };
      sheet[aAddr] = totalLabelCell;
      sheet[hAddr] = commentTotalCell;
      sheet[iAddr] = reactionTotalCell;
      // Add real clickable hyperlinks instead of relying on Excel auto-detection.
      for (const hyperlink of hyperlinkCells) {
        const address = XLSX.utils.encode_cell({
          r: hyperlink.row,
          c: hyperlink.column,
        });
        if (!sheet[address]) continue;
        sheet[address].l = {
          Target: hyperlink.url,
          Tooltip: "Mở liên kết",
        };
      }

      // merge A..G on the last row to center the totals text
      try {
        const merge = { s: { r: lastRowIndex - 1, c: 0 }, e: { r: lastRowIndex - 1, c: 6 } };
        sheet["!merges"] = sheet["!merges"] || [];
        sheet["!merges"].push(merge);
      } catch (e) {
        console.warn("Could not apply merge for totals row", e);
      }
      sheet["!cols"] = [
        { wch: 15 },
        { wch: 25 },
        { wch: 60 },
        { wch: 25 },
        { wch: 50 },
        { wch: 35 },
        { wch: 55 },
        { wch: 8, hidden: true },
        { wch: 8, hidden: true },
      ];
      // Add AutoFilter so Excel can filter by the header columns (e.g., Type)
      try {
        sheet["!autofilter"] = { ref: `A1:I${dataEndRow}` };
      } catch (e) {
        // non-fatal: continue without autofilter if something goes wrong
        console.warn("Could not add autofilter to sheet", e);
      }
      XLSX.utils.book_append_sheet(workbook, sheet, finalName);
    }

    const report = appendDuplicateUrlReport(workbook, exportedRows, XLSX);
    appendCommentUrlTotals(workbook, exportedRows, XLSX);
    XLSX.writeFile(workbook, "accounts-comments-reactions.xlsx", { cellStyles: true });
    message.success(
      report.duplicateUrlCount > 0
        ? `Export thành công: ${report.duplicateUrlCount} URL trùng tại ${report.occurrenceCount} dòng. Xem các sheet URL trùng.`
        : "Export thành công — không có URL trùng trong dữ liệu đã xuất ✅",
    );
  } catch (err) {
    message.error(err instanceof RangeError ? err.message : "Export thất bại ❌");
    console.error("Export thất bại ❌", err);
  }
};
