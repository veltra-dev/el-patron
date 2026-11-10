import ExcelJS from "exceljs";

/** Arquivo pronto para mandar ao modelo. */
export type Attachment =
  | { kind: "pdf"; fileName: string; data: Buffer }
  | { kind: "table"; fileName: string; text: string; lines: number; truncated: boolean };

export class UnsupportedFileError extends Error {}

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_LINES = 800; // acima disso o arquivo é cortado e o modelo é avisado

function extOf(name: string) {
  return name.toLowerCase().split(".").pop() ?? "";
}

/** CSV de banco brasileiro costuma vir em Latin-1 (Windows-1252); tenta UTF-8 primeiro. */
function decodeText(data: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(data);
  }
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue); // fórmula
    if ("richText" in v) return v.richText.map((p) => p.text).join("");
    if ("text" in v) return String(v.text); // hyperlink
    if ("error" in v) return "";
  }
  return String(v).replace(/[\r\n]+/g, " ").trim();
}

async function readXlsx(data: Buffer): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const lines: string[] = [];
  for (const ws of wb.worksheets.slice(0, 5)) {
    if (ws.actualRowCount === 0) continue;
    if (wb.worksheets.length > 1) lines.push(`### Aba: ${ws.name}`);
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText);
      while (values.length && values.at(-1) === "") values.pop();
      if (values.some((v) => v !== "")) lines.push(values.join(" ; "));
    });
  }
  return lines;
}

export async function readAttachment(fileName: string, mimetype: string, data: Buffer): Promise<Attachment> {
  if (data.length > MAX_BYTES) throw new UnsupportedFileError("O arquivo passa de 20 MB. Tente mandar só o período que interessa.");
  const ext = extOf(fileName);
  const mime = mimetype.split(";")[0]!.trim().toLowerCase();

  if (ext === "pdf" || mime === "application/pdf") {
    return { kind: "pdf", fileName, data };
  }

  let lines: string[];
  if (ext === "xlsx" || mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    lines = await readXlsx(data);
  } else if (ext === "csv" || ext === "txt" || mime === "text/csv" || mime === "text/plain") {
    lines = decodeText(data).split(/\r?\n/).filter((l) => l.trim() !== "");
  } else if (ext === "xls" || ext === "ods") {
    throw new UnsupportedFileError("Esse formato de planilha antigo eu não leio. Salve como .xlsx ou .csv e me mande de novo.");
  } else {
    throw new UnsupportedFileError("Por enquanto eu leio planilhas (.xlsx, .csv) e PDFs.");
  }

  if (lines.length === 0) throw new UnsupportedFileError("A planilha parece estar vazia.");
  const truncated = lines.length > MAX_LINES;
  return {
    kind: "table",
    fileName,
    text: lines.slice(0, MAX_LINES).join("\n"),
    lines: lines.length,
    truncated,
  };
}
