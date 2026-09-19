import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import type { WorkBook, WorkSheet } from "xlsx";
import type { CommentRecord, ReactionRecord } from "@/types/domain";
import { DUPLICATE_URL_SHEET_NAMES } from "@/utils/duplicateUrlReport";
import { exportAllImportsToExcel } from "./exportAllImportsToExcel";

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getChunks: vi.fn(),
  writeFile: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("xlsx", async (importOriginal) => ({
  ...await importOriginal<typeof import("xlsx")>(),
  writeFile: mocks.writeFile,
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  doc: (_db: unknown, _collection: string, id: string) => id,
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
}));
vi.mock("antd", () => ({
  message: { success: mocks.success, info: mocks.info, error: mocks.error },
}));
vi.mock("@/service/firebase", () => ({ db: {} }));
vi.mock("@/utils/firestoreData", () => ({ getImportChunkItems: mocks.getChunks }));

const postUrl = "https://www.facebook.com/groups/123/posts/456/";
const commentUrl = `${postUrl}?comment_id=111`;

const comment = (overrides: Partial<CommentRecord> = {}): CommentRecord => ({
  authorName: "Ngọc Dung",
  content: "Nội dung bình luận",
  commentTime: 1_000,
  title: "Đã bình luận",
  group: "",
  commentLocation: "Nhóm học tiếng Trung",
  commentLink: "",
  commentSearchUrl: "",
  postUrl,
  ...overrides,
});

const reaction = (overrides: Partial<ReactionRecord> = {}): ReactionRecord => ({
  reaction: "Thích",
  linkPost: postUrl,
  commentAuthorName: "Chủ bài viết",
  ownerName: "Chủ bài viết",
  reactionTime: 1_004,
  fbid: "456",
  targetType: "POST",
  targetGroupNames: ["Nhóm học tiếng Trung"],
  ...overrides,
});

interface FixtureImport {
  id: string;
  accountName: string;
  comments: CommentRecord[];
  reactions: ReactionRecord[];
}

const setImports = (imports: FixtureImport[]) => {
  const docs = imports.map((entry) => ({
    id: entry.id,
    exists: () => true,
    data: () => ({ accountName: entry.accountName }),
  }));
  mocks.getDocs.mockResolvedValue({ empty: docs.length === 0, docs });
  mocks.getDoc.mockImplementation(async (id: string) =>
    docs.find((doc) => doc.id === id) ?? { exists: () => false },
  );
  mocks.getChunks.mockImplementation(async (id: string, name: string) => {
    const entry = imports.find((entry) => entry.id === id);
    return name === "commentChunks" ? entry?.comments ?? [] : entry?.reactions ?? [];
  });
};

const exportedWorkbook = (): WorkBook => {
  expect(mocks.error).not.toHaveBeenCalled();
  expect(mocks.writeFile).toHaveBeenCalledOnce();
  return mocks.writeFile.mock.calls[0][0] as WorkBook;
};

const reportRows = (sheet: WorkSheet) =>
  XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1 })
    .filter((row) => typeof row[0] === "number");

describe("exportAllImportsToExcel URL duplicate reports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports exactly the final filtered URL cells and preserves comments, media and comment reactions", async () => {
    const imports: FixtureImport[] = [
      {
        id: "import-a", accountName: "O'Brien",
        comments: [
          comment({ commentTime: 100, content: "Outside the filter" }),
          comment({ authorName: "", content: "" }),
          comment(),
          comment({ content: "", media: [{ type: "IMAGE", uri: "media/photo.jpg" }] }),
          comment({ commentLink: commentUrl }),
          comment({ postUrl: "", commentSearchUrl: postUrl }),
        ],
        reactions: [
          reaction(),
          reaction({ linkPost: commentUrl, targetType: "COMMENT" }),
          reaction({ reactionTime: 3_000 }),
        ],
      },
      {
        id: "import-b", accountName: "O'Brien",
        comments: [comment(), comment({ commentLink: `${postUrl}?comment_id=222` })],
        reactions: [],
      },
    ];
    const before = structuredClone(imports);
    setImports(imports);

    await exportAllImportsToExcel(undefined, {
      from: new Date(900_000), to: new Date(2_000_000),
    });

    const workbook = exportedWorkbook();
    expect(workbook.SheetNames).toEqual([
      "O'Brien", "O'Brien_2", ...Object.values(DUPLICATE_URL_SHEET_NAMES),
    ]);
    const source = workbook.Sheets["O'Brien"];
    expect(source.A2.v).toBe("Comment");
    expect(source.A3.v).toBe("Comment - Media");
    expect(source.C3.v).toBe("[Hình ảnh: media/photo.jpg]");
    expect(source.G4.v).toBe(commentUrl);
    expect(source.G5.v).toBe("");
    expect(source.G5.l).toBeUndefined();
    expect(source.A6.v).toBe("Reaction");
    expect(source.A7.v).toBe("Reaction comment");
    expect(source.G7.l.Target).toBe(commentUrl);
    expect(source.H8.f).toBe("SUBTOTAL(9,H2:H7)");
    expect(source.I8.f).toBe("SUBTOTAL(9,I2:I7)");
    expect(source["!autofilter"]?.ref).toBe("A1:I7");
    expect(source["!cols"]?.slice(7).every((column) => column.hidden)).toBe(true);

    const summary = reportRows(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.summary]);
    expect(summary).toHaveLength(2);
    expect(summary.find((row) => row[1] === postUrl)?.slice(1, 7))
      .toEqual([postUrl, 4, 3, 1, 1, 2]);
    expect(summary.find((row) => row[1] === commentUrl)?.slice(1, 7))
      .toEqual([commentUrl, 2, 1, 1, 1, 1]);

    const detailsSheet = workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.details];
    const details = reportRows(detailsSheet);
    expect(details).toHaveLength(6);
    expect(details.filter((row) => row[1] === postUrl).map((row) => [row[4], row[5], row[6], row[7]]))
      .toEqual([
        ["import-a", "O'Brien", 2, "G2"],
        ["import-a", "O'Brien", 3, "G3"],
        ["import-a", "O'Brien", 6, "G6"],
        ["import-b", "O'Brien_2", 2, "G2"],
      ]);
    // Every detail points to an actual cell with the reported URL and type.
    details.forEach((row) => {
      const sheet = workbook.Sheets[String(row[5])];
      expect(sheet[String(row[7])].v).toBe(row[1]);
      expect(sheet[`A${row[6]}`].v).toBe(row[8]);
    });
    expect(imports).toEqual(before);
    expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining("2 URL trùng tại 6 dòng"));

    // A real XLSX serialization/readback checks Unicode, formulas and links.
    const roundTrip = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
    expect(roundTrip.Sheets["O'Brien"].C3.v).toBe("[Hình ảnh: media/photo.jpg]");
    expect(roundTrip.Sheets["O'Brien"].G7.l?.Target).toBe(commentUrl);
    expect(Object.values(roundTrip.Sheets[DUPLICATE_URL_SHEET_NAMES.details])
      .some((cell) => cell?.l?.Target === "#'O''Brien'!G2")).toBe(true);
  });

  it("reserves report names case-insensitively and counts only selected imports once", async () => {
    const summaryName = DUPLICATE_URL_SHEET_NAMES.summary;
    const imports = [summaryName, summaryName.toLowerCase(), DUPLICATE_URL_SHEET_NAMES.details, "Not selected"]
      .map((accountName, index) => ({
        id: `import-${index}`, accountName, comments: [comment()], reactions: [],
      }));
    setImports(imports);

    await exportAllImportsToExcel(["import-0", "import-0", "import-1", "import-2", "missing"]);

    const workbook = exportedWorkbook();
    expect(workbook.SheetNames).toEqual([
      `${summaryName}_2`, `${summaryName.toLowerCase()}_3`,
      `${DUPLICATE_URL_SHEET_NAMES.details}_2`, ...Object.values(DUPLICATE_URL_SHEET_NAMES),
    ]);
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(reportRows(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.summary])[0][2]).toBe(3);
    const details = reportRows(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.details]);
    expect(details.map((row) => row[5])).toEqual(workbook.SheetNames.slice(0, 3));
    expect(details.every((row) => row[6] === 2)).toBe(true);
  });

  it("applies the account-name filter before counting duplicates", async () => {
    setImports([
      { id: "a", accountName: "Ngọc Dung", comments: [comment()], reactions: [] },
      { id: "b", accountName: "Mỹ Uyên", comments: [comment()], reactions: [] },
    ]);

    await exportAllImportsToExcel(undefined, { name: ["Ngọc Dung"] });

    const workbook = exportedWorkbook();
    expect(workbook.SheetNames).toEqual(["Ngọc Dung", ...Object.values(DUPLICATE_URL_SHEET_NAMES)]);
    expect(reportRows(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.summary])).toEqual([]);
    expect(reportRows(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.details])).toEqual([]);
    expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining("không có URL trùng"));
  });

  it("keeps existing fallback post URL matching and reports its reused URLs without changing the stored records", async () => {
    const comments = [
      comment({ postUrl: "", group: "Nhóm học tiếng Trung" }),
      comment({ postUrl: "", group: "Nhóm học tiếng Trung", commentTime: 1_002 }),
    ];
    setImports([{ id: "a", accountName: "Ngọc Dung", comments, reactions: [reaction()] }]);

    await exportAllImportsToExcel();

    const workbook = exportedWorkbook();
    expect(["G2", "G3", "G4"].map((address) => workbook.Sheets["Ngọc Dung"][address].v))
      .toEqual([postUrl, postUrl, postUrl]);
    expect(reportRows(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.summary])[0].slice(2, 5))
      .toEqual([3, 2, 1]);
    expect(comments.every((row) => row.postUrl === "")).toBe(true);
  });

  it("handles a date filter with no rows without phantom duplicates or circular subtotal formulas", async () => {
    setImports([{ id: "a", accountName: "Ngọc Dung", comments: [comment(), comment()], reactions: [reaction()] }]);

    await exportAllImportsToExcel(undefined, { from: new Date(2_000_000), to: new Date(3_000_000) });

    const workbook = exportedWorkbook();
    expect(workbook.Sheets["Ngọc Dung"].H2.f).toBe("0");
    expect(workbook.Sheets["Ngọc Dung"].I2.f).toBe("0");
    expect(reportRows(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.summary])).toEqual([]);
    expect(reportRows(workbook.Sheets[DUPLICATE_URL_SHEET_NAMES.details])).toEqual([]);
  });

  it("does not export an empty workbook when there are no imports", async () => {
    setImports([]);
    await exportAllImportsToExcel();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.info).toHaveBeenCalledWith("Không có imports để export");
  });

  it("does not export a partial workbook if a chunk fails to load", async () => {
    setImports([{ id: "a", accountName: "Ngọc Dung", comments: [comment()], reactions: [] }]);
    mocks.getChunks.mockRejectedValueOnce(new Error("offline"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await exportAllImportsToExcel();
      expect(mocks.writeFile).not.toHaveBeenCalled();
      expect(mocks.error).toHaveBeenCalledWith("Export thất bại ❌");
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([
    [32_766, "Báo cáo URL trùng vượt giới hạn"],
    [65_531, "Sheet Ngọc Dung vượt giới hạn Excel"],
  ] as const)("explains Excel capacity limits for %i URL occurrences without exporting a partial file", async (count, expectedMessage) => {
    setImports([{
      id: "a", accountName: "Ngọc Dung",
      comments: Array<CommentRecord>(count).fill(comment()), reactions: [],
    }]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await exportAllImportsToExcel();
      expect(mocks.writeFile).not.toHaveBeenCalled();
      expect(mocks.success).not.toHaveBeenCalled();
      expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining(expectedMessage));
    } finally {
      consoleError.mockRestore();
    }
  });
});
