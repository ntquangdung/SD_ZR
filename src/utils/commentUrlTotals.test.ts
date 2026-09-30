import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { appendCommentUrlTotals, COMMENT_TOTALS_SHEET_NAME, summarizeCommentUrls } from "./commentUrlTotals";

const url = "https://www.facebook.com/groups/1/posts/2/";
const row = (accountName = "Ngọc Dung", type = "Comment", link = url) => ({ accountName, type, url: link });

describe("comment URL totals", () => {
  it("counts repeated URL occurrences after the first, not just the number of duplicate groups", () => {
    expect(summarizeCommentUrls(Array.from({ length: 5 }, () => row()))).toEqual([{
      accountName: "Ngọc Dung", comments: 5, mediaComments: 0, total: 5,
      duplicates: 4, afterDeduplication: 1, withoutUrl: 0,
    }]);
  });

  it("combines text/media for duplicate counting and counts the same URL independently per account", () => {
    const rows = [row(), row("Ngọc Dung", "Comment - Media"), row("Mỹ Uyên"),
      row("Mỹ Uyên", "Comment - Media", `${url}?comment_id=3`), row("Ngọc Dung", "Reaction"),
      row("Ngọc Dung", "Reaction comment")];
    const before = structuredClone(rows);
    expect(summarizeCommentUrls(rows)).toEqual([
      { accountName: "Ngọc Dung", comments: 1, mediaComments: 1, total: 2, duplicates: 1, afterDeduplication: 1, withoutUrl: 0 },
      { accountName: "Mỹ Uyên", comments: 1, mediaComments: 1, total: 2, duplicates: 0, afterDeduplication: 2, withoutUrl: 0 },
    ]);
    expect(summarizeCommentUrls([rows[1], rows[0]])[0]).toMatchObject({ total: 2, duplicates: 1, afterDeduplication: 1 });
    expect(rows).toEqual(before);
  });

  it("merges normalized names across imports without merging different direct comment URLs", () => {
    const rows = [row(), row("  NGỌC   DUNG  ", "Comment", "HTTPS://WWW.FACEBOOK.COM:443/groups/1/posts/2/"),
      row("Ngọc Dung".normalize("NFD")), row("Ngọc Dung", "Comment", `${url}?comment_id=3`),
      row("Ngọc Dung", "Comment", `${url}?comment_id=4`)];
    expect(summarizeCommentUrls(rows)).toHaveLength(1);
    expect(summarizeCommentUrls(rows)[0]).toMatchObject({ total: 5, duplicates: 2, afterDeduplication: 3 });
  });

  it("counts missing/invalid URLs separately rather than treating them as a duplicate URL", () => {
    const rows = [row("Ngọc Dung", "Comment", ""), row("Ngọc Dung", "Comment - Media", ""),
      row("Ngọc Dung", "Comment", "javascript:alert(1)"), row("Ngọc Dung", "Comment", "not-a-url")];
    expect(summarizeCommentUrls(rows)[0]).toMatchObject({ comments: 3, mediaComments: 1,
      total: 4, duplicates: 0, afterDeduplication: 4, withoutUrl: 4 });
  });

  it("creates cached numeric totals and formulas, preserving all original sheets", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["original"]]), "Source");
    const before = structuredClone(workbook.Sheets.Source);
    appendCommentUrlTotals(workbook, [row(), row(), row("Ngọc Dung", "Comment - Media"), row("Mỹ Uyên")], XLSX);
    expect(workbook.SheetNames).toEqual([COMMENT_TOTALS_SHEET_NAME, "Source"]);
    expect(workbook.Sheets.Source).toEqual(before);
    const sheet = workbook.Sheets[COMMENT_TOTALS_SHEET_NAME];
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1, range: "A2:G3" })).toEqual([
      ["Ngọc Dung", 2, 1, 3, 2, 1, 0], ["Mỹ Uyên", 1, 0, 1, 0, 1, 0],
    ]);
    expect(sheet.D2).toMatchObject({ t: "n", v: 3, f: "SUM(B2:C2)" });
    expect(sheet.F2).toMatchObject({ t: "n", v: 1, f: "D2-E2" });
    expect(sheet.B4).toMatchObject({ v: 3, f: "SUBTOTAL(9,B2:B3)" });
    expect(sheet.E4).toMatchObject({ v: 2, f: "SUBTOTAL(9,E2:E3)" });
    expect(sheet.F4).toMatchObject({ v: 2, f: "D4-E4" });
    expect(sheet["!autofilter"]?.ref).toBe("A1:G3");
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const readBack = XLSX.read(bytes, { type: "buffer" }).Sheets[COMMENT_TOTALS_SHEET_NAME];
    expect(readBack.F4).toMatchObject({ t: "n", v: 2, f: "D4-E4" });
  });

  it("exports zero without circular formulas when there are no comments", () => {
    const workbook = XLSX.utils.book_new();
    appendCommentUrlTotals(workbook, [row("Ngọc Dung", "Reaction comment")], XLSX);
    const sheet = workbook.Sheets[COMMENT_TOTALS_SHEET_NAME];
    expect(sheet.B2).toMatchObject({ v: 0, f: "0" });
    expect(sheet.D2).toMatchObject({ v: 0, f: "SUM(B2:C2)" });
    expect(sheet.F2).toMatchObject({ v: 0, f: "D2-E2" });
  });

  it("keeps formula-looking names literal", () => {
    const workbook = XLSX.utils.book_new();
    appendCommentUrlTotals(workbook, [row("=1+1")], XLSX);
    expect(workbook.Sheets[COMMENT_TOTALS_SHEET_NAME].A2).toMatchObject({ t: "s", v: "=1+1" });
    expect(workbook.Sheets[COMMENT_TOTALS_SHEET_NAME].A2.f).toBeUndefined();
  });
});
