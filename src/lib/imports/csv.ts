import { parse } from "csv-parse/sync";

const decoder = new TextDecoder("utf-8", { fatal: true });

export interface CsvRow {
  rowNumber: number;
  values: Record<string, string>;
}

export function parseCsv(contents: Uint8Array): CsvRow[] {
  const text = decoder.decode(contents);
  if (!text.trim()) return [];
  const records = parse(text, {
    bom: true,
    columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
    max_record_size: 100_000,
  }) as Record<string, string>[];
  return records.map((values, index) => ({ rowNumber: index + 2, values }));
}

export function stringValue(row: Record<string, string>, name: string): string | undefined {
  const value = row[name]?.trim();
  return value || undefined;
}

export function numberValue(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function dateValue(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? undefined : value;
}
