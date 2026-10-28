import { unzipSync } from 'fflate';

const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;

export function parseXlsxRows(bytes: Uint8Array): string[][] {
  const total = inspectZip(bytes);
  if (total > MAX_UNCOMPRESSED_BYTES) throw new Error('Workbook expands beyond the 20 MB safety limit.');
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { throw new Error('The workbook ZIP content is corrupted or unsupported.'); }
  const workbookXml = decode(files['xl/workbook.xml']);
  const relsXml = decode(files['xl/_rels/workbook.xml.rels']);
  if (!workbookXml || !relsXml) throw new Error('This file is missing required XLSX workbook metadata.');
  const firstSheet = /<sheet\b[^>]*\br:id="([^"]+)"/i.exec(workbookXml)?.[1];
  if (!firstSheet) throw new Error('The workbook has no worksheet.');
  const relation = [...relsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)].map(match => attrs(match[1])).find(item => item.Id === firstSheet);
  if (!relation?.Target || relation.Target.includes('..')) throw new Error('The workbook worksheet link is invalid.');
  const target = relation.Target.startsWith('/') ? relation.Target.slice(1) : `xl/${relation.Target.replace(/^\.\//, '')}`;
  const sheetXml = decode(files[target]);
  if (!sheetXml) throw new Error('The first workbook worksheet could not be found.');
  const sharedStrings = [...decode(files['xl/sharedStrings.xml']).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map(match => textRuns(match[1]));
  const dateStyles = findDateStyles(decode(files['xl/styles.xml']));
  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const values: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const cellAttrs = attrs(cellMatch[1]);
      const column = columnIndex(cellAttrs.r ?? 'A1');
      if (column > 30) continue;
      const content = cellMatch[2];
      const type = cellAttrs.t;
      const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(content)?.[1] ?? '';
      let value = type === 'inlineStr' ? textRuns(/<is\b[^>]*>([\s\S]*?)<\/is>/i.exec(content)?.[1] ?? '')
        : type === 's' ? sharedStrings[Number(raw)] ?? '' : decodeXml(raw);
      if ((!type || type === 'n') && raw && dateStyles.has(Number(cellAttrs.s))) value = excelSerialToIso(Number(raw), dateStyles.get(Number(cellAttrs.s)) === 'time');
      values[column - 1] = value.slice(0, 500);
    }
    if (values.some(value => value?.trim())) rows.push(Array.from({ length: Math.min(30, Math.max(values.length, 1)) }, (_, index) => values[index] ?? ''));
    if (rows.length > 101) throw new Error('Use a worksheet with no more than 100 data rows.');
  }
  return rows;
}

function inspectZip(bytes: Uint8Array): number {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('This file is not an XLSX ZIP workbook.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('The workbook ZIP directory is invalid.');
  const entries = view.getUint16(eocd + 10, true), directorySize = view.getUint32(eocd + 12, true), directoryStart = view.getUint32(eocd + 16, true);
  if (!entries || entries > 300 || directorySize > 2 * 1024 * 1024 || directoryStart + directorySize > eocd) throw new Error('The workbook contains too many or invalid ZIP entries.');
  let offset = directoryStart, total = 0;
  for (let entry = 0; entry < entries; entry++) {
    if (view.getUint32(offset, true) !== 0x02014b50 || offset + 46 > bytes.length) throw new Error('The workbook ZIP directory is corrupted.');
    const flags = view.getUint16(offset + 8, true), compressed = view.getUint32(offset + 20, true), expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
    if (flags & 1) throw new Error('Encrypted Excel workbooks are not supported.');
    if (expanded > 8 * 1024 * 1024 || expanded > Math.max(compressed * 100, 1024 * 1024)) throw new Error('This workbook contains an unusually large compressed item.');
    total += expanded;
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return total;
}

function attrs(value: string): Record<string, string> { return Object.fromEntries([...value.matchAll(/([\w:.-]+)="([^"]*)"/g)].map(match => [match[1], decodeXml(match[2])])); }
function decode(bytes?: Uint8Array): string { return bytes ? new TextDecoder().decode(bytes) : ''; }
function textRuns(value: string): string { return [...value.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map(match => decodeXml(match[1])).join(''); }
function decodeXml(value: string): string { return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, entity => {
  if (entity === '&amp;') return '&'; if (entity === '&lt;') return '<'; if (entity === '&gt;') return '>'; if (entity === '&quot;') return '"'; if (entity === '&apos;') return "'";
  const hex = entity[2]?.toLowerCase() === 'x'; const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
  return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
}); }
function columnIndex(ref: string): number { const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A'; return [...letters].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0); }
function findDateStyles(xml: string): Map<number, 'date' | 'time'> {
  const formats = new Map<number, string>([[14, 'mm-dd-yy'], [15, 'd-mmm-yy'], [16, 'd-mmm'], [17, 'mmm-yy'], [18, 'h:mm AM/PM'], [19, 'h:mm:ss AM/PM'], [20, 'h:mm'], [21, 'h:mm:ss'], [22, 'm/d/yy h:mm']]);
  for (const match of xml.matchAll(/<numFmt\b([^>]*)\/?\s*>/gi)) { const attr = attrs(match[1]); if (attr.numFmtId && attr.formatCode) formats.set(Number(attr.numFmtId), attr.formatCode); }
  const result = new Map<number, 'date' | 'time'>();
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/i.exec(xml)?.[1] ?? '';
  let style = 0;
  for (const match of xfs.matchAll(/<xf\b([^>]*)\/?\s*>/gi)) { const format = formats.get(Number(attrs(match[1]).numFmtId)); if (format && /[dmy]/i.test(format)) result.set(style, 'date'); else if (format && /[hs]/i.test(format)) result.set(style, 'time'); style++; }
  return result;
}
function excelSerialToIso(serial: number, timeOnly: boolean): string {
  if (!Number.isFinite(serial) || serial < 0 || serial > 100_000) return String(serial);
  if (timeOnly) { const minutes = Math.round((serial % 1) * 1440); return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000)).toISOString().slice(0, 10);
}
