import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import {
  appendDuplicateUrlReport,
  DUPLICATE_URL_SHEET_NAMES,
  type ExportedUrlRow,
} from "./duplicateUrlReport";

const POST = "https://www.facebook.com/groups/123/posts/456/";
const makeRow = (overrides: Partial<ExportedUrlRow> = {}): ExportedUrlRow => ({
  url: POST,
  sheetName: "Ngọc Dung",
  rowNumber: 2,
  accountName: "Ngọc Dung",
  importId: "import-1",
  type: "Comment",
  content: "Nội dung bình luận",
  date: "14:16:13 11/8/2026",
  title: "Đã bình luận về một bài viết",
  location: "Nhóm học tiếng Trung",
  ...overrides,
});

const makeWorkbook = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Type"]]), "Ngọc Dung");
  return workbook;
};

describe("appendDuplicateUrlReport", () => {
  it("counts every exported comment, media comment and reaction across accounts/imports without removing rows", () => {
    const workbook = makeWorkbook();
    const sourceSheetBefore = JSON.stringify(workbook.Sheets["Ngọc Dung"]);
    const rows = [
      makeRow(),
      makeRow({ rowNumber: 7, type: "Comment - Media", content: "[Hình ảnh: media/1.jpg]" }),
      makeRow({ rowNumber: 9, type: "Reaction" }),
      makeRow({ sheetName: "Mỹ Uyên", accountName: "Mỹ Uyên", importId: "import-2", rowNumber: 4, type: "Reaction comment" }),
      makeRow({ url: `${POST}?comment_id=99`, rowNumber: 10 }),
    ];
    const inputBefore = structuredClone(rows);

    expect(appendDuplicateUrlReport(workbook, rows, XLSX)).toEqual({ duplicateUrlCount: 1, occurrenceCount: 4 });
    const summary = workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.summary];
    const details = workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.details];
    expect(XLSX.utils.sheet_to_json(summary, { header: 1, range: "A2:I2" })[0]).toEqual([
      1, POST, 4, 2, 2, 2, 2, "Khác lượt import", "Xem tất cả vị trí",
    ]);
    expect([details.G2.v, details.G3.v, details.G4.v, details.G5.v]).toEqual([2, 7, 9, 4]);
    expect(details.I3.v).toBe("Comment - Media");
    expect(details.J3.v).toBe("[Hình ảnh: media/1.jpg]");
    expect(details.I5.v).toBe("Reaction comment");
    expect(summary["!autofilter"]?.ref).toBe("A1:I2");
    expect(details["!autofilter"]?.ref).toBe("A1:N5");
    expect(rows).toEqual(inputBefore);
    expect(JSON.stringify(workbook.Sheets["Ngọc Dung"])).toBe(sourceSheetBefore);
    expect(summary.K3.v).toContain("URL trùng không đồng nghĩa bình luận trùng");
  });

  it("keeps same-account separate imports visible and groups in first occurrence order", () => {
    const workbook = makeWorkbook();
    const secondUrl = `${POST}?comment_id=12&reply_comment_id=34#reply`;
    const rows = [
      makeRow(),
      makeRow({ url: secondUrl, rowNumber: 3 }),
      makeRow({ url: secondUrl, rowNumber: 4 }),
      makeRow({ importId: "import-2", sheetName: "Ngọc Dung_2", rowNumber: 2 }),
    ];
    expect(appendDuplicateUrlReport(workbook, rows, XLSX)).toEqual({ duplicateUrlCount: 2, occurrenceCount: 4 });
    const summary = workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.summary];
    expect(summary.B2.v).toBe(POST);
    expect(summary.B3.v).toBe(secondUrl);
    expect(summary.F2.v).toBe(1);
    expect(summary.G2.v).toBe(2);
    expect(summary.H2.v).toBe("Khác lượt import");
    expect(summary.H3.v).toBe("Cùng lượt import");
    expect(summary.I2.l?.Target).toBe("#'URL trùng - Chi tiết'!A2");
    expect(summary.I3.l?.Target).toBe("#'URL trùng - Chi tiết'!A4");
  });

  it("does not merge different comment IDs, reply IDs, query values/order or fragments", () => {
    const workbook = makeWorkbook();
    const urls = [
      POST, `${POST}?comment_id=1`, `${POST}?comment_id=2`,
      `${POST}?comment_id=1&reply_comment_id=1`, `${POST}?comment_id=1&reply_comment_id=2`,
      `${POST}?reply_comment_id=1&comment_id=1`, `${POST}?comment_id=1#one`, `${POST}?comment_id=1#two`,
    ];
    const result = appendDuplicateUrlReport(workbook, urls.map((url, index) => makeRow({ url, rowNumber: index + 2 })), XLSX);
    expect(result).toEqual({ duplicateUrlCount: 0, occurrenceCount: 0 });
  });

  it("ignores invalid/empty URLs and creates a clear empty report without fictitious detail rows", () => {
    const workbook = makeWorkbook();
    const rows = ["", "  ", "not-a-url", "javascript:alert(1)", "ftp://example.com/file"]
      .flatMap((url) => [makeRow({ url }), makeRow({ url })]);
    expect(appendDuplicateUrlReport(workbook, rows, XLSX)).toEqual({ duplicateUrlCount: 0, occurrenceCount: 0 });
    for (const name of Object.values(DUPLICATE_URL_SHEET_NAMES)) {
      const sheet = workbook.Sheets[name];
      expect(sheet.A2.v).toBe("Không có URL trùng trong dữ liệu đã xuất.");
      expect(sheet.B2).toBeUndefined();
      expect(sheet["!autofilter"]?.ref).toMatch(/1:[IN]1$/);
    }
  });

  it("applies the existing HTTP URL normalization before comparing", () => {
    const workbook = makeWorkbook();
    const result = appendDuplicateUrlReport(workbook, [
      makeRow({ url: "HTTPS://WWW.FACEBOOK.COM:443/groups/123/posts/456/" }),
      makeRow({ rowNumber: 3 }),
    ], XLSX);
    expect(result).toEqual({ duplicateUrlCount: 1, occurrenceCount: 2 });
    expect(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.summary].B2.v).toBe(POST);
  });

  it("preserves exact URLs and escaped source links through XLSX write/read", async () => {
    const workbook = makeWorkbook();
    const sourceName = "Dũng O'Brien";
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Type"]]), sourceName);
    const url = `${POST}?comment_id=123&reply_comment_id=456#reply`;
    appendDuplicateUrlReport(workbook, [
      makeRow({ url, sheetName: sourceName, rowNumber: 17 }),
      makeRow({ url, rowNumber: 103 }),
    ], XLSX);
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const readBack = XLSX.read(bytes, { type: "buffer" });
    expect(readBack.SheetNames).toEqual(["Ngọc Dung", sourceName, DUPLICATE_URL_SHEET_NAMES.summary, DUPLICATE_URL_SHEET_NAMES.details]);
    const details = readBack.Sheets[DUPLICATE_URL_SHEET_NAMES.details];
    expect(details.B2.v).toBe(url);
    // SheetJS's reader does not unescape XML entities in relationship Targets.
    // Verify the actual OOXML has exactly one escaping layer, as Excel expects.
    const zip = await JSZip.loadAsync(bytes);
    const relationships = await zip.file("xl/worksheets/_rels/sheet4.xml.rels")!.async("string");
    expect(relationships).toContain('Target="https://www.facebook.com/groups/123/posts/456/?comment_id=123&amp;reply_comment_id=456"');
    expect(relationships).not.toContain("&amp;amp;");
    expect(details.B2.l?.Target?.replace(/&amp;/g, "&")).toBe(url);
    expect(details.G2.v).toBe(17);
    expect(details.H2.v).toBe("G17");
    expect(details.N2.l?.Target).toBe("#'Dũng O''Brien'!G17");
    expect(details.N3.l?.Target).toBe("#'Ngọc Dung'!G103");
    expect(readBack.Sheets[DUPLICATE_URL_SHEET_NAMES.summary].I2.l?.Target).toBe("#'URL trùng - Chi tiết'!A2");
  });

  it("fails before changing workbook if report names conflict or a URL exceeds Excel limits", () => {
    const workbook = makeWorkbook();
    const longUrl = `https://example.com/${"x".repeat(32_767)}`;
    const originalNames = [...workbook.SheetNames];
    expect(() => appendDuplicateUrlReport(workbook, [makeRow({ url: longUrl }), makeRow({ url: longUrl })], XLSX))
      .toThrow("32.767");
    expect(workbook.SheetNames).toEqual(originalNames);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["existing"]]), DUPLICATE_URL_SHEET_NAMES.summary.toUpperCase());
    expect(() => appendDuplicateUrlReport(workbook, [], XLSX)).toThrow("đã được sử dụng");
    expect(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.details]).toBeUndefined();
  });

  it("bounds description cells but never silently changes an oversized URL or source position", () => {
    const workbook = makeWorkbook();
    appendDuplicateUrlReport(workbook, [makeRow({ content: "x".repeat(40_000) }), makeRow({ rowNumber: 3 })], XLSX);
    expect(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.details].J2.v).toHaveLength(32_767);
    expect(() => appendDuplicateUrlReport(makeWorkbook(), [makeRow({ rowNumber: 1_048_577 }), makeRow()], XLSX)).toThrow("Vị trí dòng Excel không hợp lệ");
  });

  it("treats formula-looking descriptions and identities as literal text", () => {
    const workbook = makeWorkbook();
    const content = '=HYPERLINK("https://example.com/", "click")';
    appendDuplicateUrlReport(workbook, [makeRow({ accountName: "=1+1", content }), makeRow({ rowNumber: 3 })], XLSX);
    const details = workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.details];
    expect(details.D2).toMatchObject({ t: "s", v: "=1+1" });
    expect(details.D2.f).toBeUndefined();
    expect(details.J2).toMatchObject({ t: "s", v: content });
    expect(details.J2.f).toBeUndefined();
  });

  it("rejects reports exceeding the Excel hyperlink limit without modifying source sheets", () => {
    const workbook = makeWorkbook();
    const rows = Array<ExportedUrlRow>(32_766).fill(makeRow());
    expect(() => appendDuplicateUrlReport(workbook, rows, XLSX)).toThrow("65.530 hyperlink");
    expect(workbook.SheetNames).toEqual(["Ngọc Dung"]);
  });
});
