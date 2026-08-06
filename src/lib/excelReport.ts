import ExcelJS from "exceljs";
import { Ticket } from "@/types/freshdesk";
import { COMPANY_NAME } from "@/config";
import {
  buildSummary, buildTicketRows, buildSLAReport,
  ReportSummary, SLAReport,
} from "@/lib/reportData";

/* ----------------------------------------------------------------------------
 * Aerchain enterprise palette (ARGB)
 * ------------------------------------------------------------------------- */
const C = {
  brand: "FF6B4EFF",
  brandDark: "FF5A3DE8",
  navy: "FF1A1A2E",
  navy2: "FF2A2A44",
  coral: "FFE8341C",
  emerald: "FF10B981",
  emeraldSoft: "FFE7F8F1",
  amber: "FFF59E0B",
  amberSoft: "FFFEF4E2",
  rose: "FFF43F5E",
  roseSoft: "FFFDEAED",
  violetSoft: "FFEEEBFF",
  skySoft: "FFE8F4FD",
  white: "FFFFFFFF",
  rowAlt: "FFF7F7FC",
  border: "FFE2E2EE",
  borderSoft: "FFEFEFF6",
  muted: "FF6B6B8A",
  ink: "FF1A1A2E",
};

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = (argb = C.border) => ({ style: "thin" as const, color: { argb } });
const allBorders = (argb = C.border) => ({ top: thin(argb), left: thin(argb), bottom: thin(argb), right: thin(argb) });

/* ----------------------------------------------------------------------------
 * Shared brand header band (rows 1-4)
 * ------------------------------------------------------------------------- */
const drawHeaderBand = (
  ws: ExcelJS.Worksheet,
  lastCol: string,
  title: string,
  subtitle: string,
  generatedAt: string,
) => {
  ws.mergeCells(`A1:${lastCol}1`);
  ws.mergeCells(`A2:${lastCol}2`);
  ws.mergeCells(`A3:${lastCol}3`);

  const t = ws.getCell("A1");
  t.value = `  AERCHAIN  ·  ${COMPANY_NAME.toUpperCase()} SUPPORT`;
  t.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFB9A8FF" } };
  t.fill = fill(C.navy);
  t.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 22;

  const s = ws.getCell("A2");
  s.value = `  ${title}`;
  s.font = { name: "Calibri", size: 20, bold: true, color: { argb: C.white } };
  s.fill = fill(C.navy);
  s.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(2).height = 34;

  const sub = ws.getCell("A3");
  sub.value = `  ${subtitle}      ·      Generated ${generatedAt}`;
  sub.font = { name: "Calibri", size: 10, color: { argb: "FFB7B7CC" } };
  sub.fill = fill(C.navy2);
  sub.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(3).height = 20;

  ws.getRow(4).height = 8; // spacer
};

/* a KPI tile occupying a merged 2-col block */
const drawKpi = (
  ws: ExcelJS.Worksheet,
  startCol: number,
  row: number,
  label: string,
  value: string | number,
  accent: string,
  soft: string,
) => {
  const c1 = ws.getColumn(startCol).letter;
  const c2 = ws.getColumn(startCol + 1).letter;
  ws.mergeCells(`${c1}${row}:${c2}${row}`);
  ws.mergeCells(`${c1}${row + 1}:${c2}${row + 1}`);

  const v = ws.getCell(`${c1}${row}`);
  v.value = value;
  v.font = { name: "Calibri", size: 22, bold: true, color: { argb: accent } };
  v.fill = fill(soft);
  v.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(row).height = 30;

  const l = ws.getCell(`${c1}${row + 1}`);
  l.value = label.toUpperCase();
  l.font = { name: "Calibri", size: 9, bold: true, color: { argb: C.muted } };
  l.fill = fill(soft);
  l.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(row + 1).height = 18;

  [`${c1}${row}`, `${c1}${row + 1}`].forEach((addr) => {
    ws.getCell(addr).border = allBorders(soft);
  });
};

const sectionTitle = (ws: ExcelJS.Worksheet, cell: string, mergeTo: string, text: string) => {
  ws.mergeCells(`${cell}:${mergeTo}`);
  const c = ws.getCell(cell);
  c.value = text;
  c.font = { name: "Calibri", size: 12, bold: true, color: { argb: C.ink } };
  c.alignment = { vertical: "middle", horizontal: "left" };
};

/* a styled mini-table with header + rows + optional bar */
const drawBreakdown = (
  ws: ExcelJS.Worksheet,
  startRow: number,
  colLabel: number,
  colValue: number,
  heading: [string, string],
  data: { label: string; count: number }[],
  accent: string,
) => {
  const lL = ws.getColumn(colLabel).letter;
  const lV = ws.getColumn(colValue).letter;

  // header
  const h1 = ws.getCell(`${lL}${startRow}`);
  h1.value = heading[0];
  const h2 = ws.getCell(`${lV}${startRow}`);
  h2.value = heading[1];
  [h1, h2].forEach((c, i) => {
    c.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.white } };
    c.fill = fill(accent);
    c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center" };
    c.border = allBorders(accent);
  });
  ws.getRow(startRow).height = 20;

  const max = Math.max(1, ...data.map((d) => d.count));
  data.forEach((d, i) => {
    const r = startRow + 1 + i;
    const alt = i % 2 === 1;
    const cl = ws.getCell(`${lL}${r}`);
    cl.value = d.label;
    cl.font = { name: "Calibri", size: 10, color: { argb: C.ink } };
    cl.fill = fill(alt ? C.rowAlt : C.white);
    cl.alignment = { vertical: "middle", horizontal: "left" };
    cl.border = allBorders(C.borderSoft);

    const cv = ws.getCell(`${lV}${r}`);
    // data bar via repeated block chars + count
    const barLen = Math.round((d.count / max) * 10);
    cv.value = `${"▮".repeat(Math.max(0, barLen))}  ${d.count}`;
    cv.font = { name: "Calibri", size: 10, bold: true, color: { argb: accent } };
    cv.fill = fill(alt ? C.rowAlt : C.white);
    cv.alignment = { vertical: "middle", horizontal: "left" };
    cv.border = allBorders(C.borderSoft);
    ws.getRow(r).height = 17;
  });
  return startRow + 1 + data.length;
};

/* ----------------------------------------------------------------------------
 * Dashboard cover sheet (shared by both workbooks)
 * ------------------------------------------------------------------------- */
const buildDashboardSheet = (
  wb: ExcelJS.Workbook,
  summary: ReportSummary,
  title: string,
) => {
  const ws = wb.addWorksheet("Dashboard", {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 16 },
  });
  ws.columns = Array.from({ length: 8 }, () => ({ width: 15 }));

  drawHeaderBand(ws, "H", title, `Period: ${summary.periodLabel}`, summary.generatedAt);

  // KPI tiles — two rows of four
  drawKpi(ws, 1, 6, "Total Tickets", summary.total, C.brand, C.violetSoft);
  drawKpi(ws, 3, 6, "Open", summary.open, C.amber, C.amberSoft);
  drawKpi(ws, 5, 6, "Resolved", summary.resolved, C.emerald, C.emeraldSoft);
  drawKpi(ws, 7, 6, "SLA Breached", summary.breached, C.rose, C.roseSoft);

  drawKpi(ws, 1, 9, "SLA Compliance", `${summary.slaCompliance}%`, C.emerald, C.emeraldSoft);
  drawKpi(ws, 3, 9, "Avg Resolution", summary.avgResolution, C.brand, C.violetSoft);
  drawKpi(ws, 5, 9, "Departments", summary.byDept.length, C.navy, C.skySoft);
  drawKpi(ws, 7, 9, "Priorities", summary.byPriority.filter((p) => p.count).length, C.navy, C.skySoft);

  // Breakdowns
  let r = 13;
  sectionTitle(ws, `A${r}`, `H${r}`, "Breakdown");
  ws.getRow(r).height = 22;
  r += 1;

  drawBreakdown(ws, r, 1, 2, ["Priority", "Count"], summary.byPriority, C.brand);
  drawBreakdown(ws, r, 4, 5, ["Status", "Count"], summary.byStatus, C.emerald);
  drawBreakdown(ws, r, 7, 8, ["Department", "Count"], summary.byDept.slice(0, 8), C.amber);

  // footer note
  const footRow = r + Math.max(summary.byPriority.length, summary.byStatus.length, summary.byDept.slice(0, 8).length) + 3;
  ws.mergeCells(`A${footRow}:H${footRow}`);
  const f = ws.getCell(`A${footRow}`);
  f.value = "Confidential — Aerchain Support Analytics. Figures reflect Freshdesk data at time of export.";
  f.font = { name: "Calibri", size: 8, italic: true, color: { argb: C.muted } };
  f.alignment = { horizontal: "left" };

  return ws;
};

/* ----------------------------------------------------------------------------
 * Raw tickets data sheet
 * ------------------------------------------------------------------------- */
const buildTicketsSheet = (wb: ExcelJS.Workbook, tickets: Ticket[]) => {
  const ws = wb.addWorksheet("Tickets Data", {
    views: [{ showGridLines: false, state: "frozen", ySplit: 5 }],
  });

  const cols = [
    { header: "Ticket", key: "id", width: 12 },
    { header: "Subject", key: "subject", width: 46 },
    { header: "Priority", key: "priority", width: 11 },
    { header: "Status", key: "status", width: 13 },
    { header: "Requester", key: "requester", width: 22 },
    { header: "Department", key: "department", width: 20 },
    { header: "Assignee", key: "assignee", width: 20 },
    { header: "Created", key: "created", width: 22 },
    { header: "Updated", key: "updated", width: 22 },
    { header: "Age (h)", key: "ageHours", width: 9 },
    { header: "SLA", key: "slaState", width: 12 },
    { header: "Resolution", key: "resolution", width: 12 },
    { header: "Tags", key: "tags", width: 26 },
  ];
  const lastCol = ws.getColumn(cols.length).letter;

  drawHeaderBand(ws, lastCol, "Ticket Register", `${tickets.length} tickets`, "");

  // header row at row 5
  const headerRow = 5;
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.brand);
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
    cell.border = allBorders(C.brandDark);
  });
  ws.getRow(headerRow).height = 22;

  const rows = buildTicketRows(tickets);
  const priColor: Record<string, string> = { Critical: C.rose, High: C.amber, Medium: C.brand, Low: C.emerald };
  const slaColor: Record<string, string> = { Breached: C.rose, "At Risk": C.amber, Met: C.emerald, "On Track": C.emerald };

  rows.forEach((row, i) => {
    const r = headerRow + 1 + i;
    const alt = i % 2 === 1;
    cols.forEach((c, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = (row as any)[c.key];
      cell.font = { name: "Calibri", size: 9.5, color: { argb: C.ink } };
      cell.fill = fill(alt ? C.rowAlt : C.white);
      cell.alignment = { vertical: "middle", horizontal: c.key === "ageHours" ? "center" : "left", wrapText: false };
      cell.border = allBorders(C.borderSoft);

      if (c.key === "id") cell.font = { name: "Consolas", size: 9.5, bold: true, color: { argb: C.brand } };
      if (c.key === "priority") cell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: priColor[row.priority] ?? C.ink } };
      if (c.key === "slaState") {
        cell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: slaColor[row.slaState] ?? C.ink } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
    });
    ws.getRow(r).height = 17;
  });

  // autofilter over the table
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: cols.length } };

  return ws;
};

/* ----------------------------------------------------------------------------
 * SLA data sheet
 * ------------------------------------------------------------------------- */
const buildSLASheet = (wb: ExcelJS.Workbook, report: SLAReport) => {
  const ws = wb.addWorksheet("SLA Detail", { views: [{ showGridLines: false }] });

  const cols = [
    { header: "Severity", width: 34 },
    { header: "Priority", width: 12 },
    { header: "Resolution Target", width: 18 },
    { header: "Total", width: 10 },
    { header: "Resolved", width: 11 },
    { header: "Met", width: 9 },
    { header: "Breached", width: 11 },
    { header: "Compliance", width: 13 },
    { header: "Avg Resolution", width: 15 },
  ];
  const lastCol = ws.getColumn(cols.length).letter;

  drawHeaderBand(ws, lastCol, "SLA Compliance Report", `Period: ${report.periodLabel}`, report.generatedAt);

  const headerRow = 5;
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.brand);
    cell.alignment = { vertical: "middle", horizontal: i < 3 ? "left" : "center" };
    cell.border = allBorders(C.brandDark);
  });
  ws.getRow(headerRow).height = 22;

  const compColor = (pct: number) => (pct >= 90 ? C.emerald : pct >= 75 ? C.amber : C.rose);
  const compSoft = (pct: number) => (pct >= 90 ? C.emeraldSoft : pct >= 75 ? C.amberSoft : C.roseSoft);

  report.rows.forEach((row, i) => {
    const r = headerRow + 1 + i;
    const alt = i % 2 === 1;
    const vals = [row.severity, row.priority, row.target, row.total, row.resolved, row.met, row.breached, `${row.compliance}%`, row.avgResolution];
    vals.forEach((v, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = v;
      cell.font = { name: "Calibri", size: 10, color: { argb: C.ink } };
      cell.fill = fill(alt ? C.rowAlt : C.white);
      cell.alignment = { vertical: "middle", horizontal: ci < 3 ? "left" : "center" };
      cell.border = allBorders(C.borderSoft);
    });
    // compliance cell colored
    const cc = ws.getCell(r, 8);
    cc.font = { name: "Calibri", size: 10, bold: true, color: { argb: compColor(row.compliance) } };
    cc.fill = fill(compSoft(row.compliance));
    // breached cell colored
    if (row.breached > 0) ws.getCell(r, 7).font = { name: "Calibri", size: 10, bold: true, color: { argb: C.rose } };
    ws.getRow(r).height = 19;
  });

  // totals row
  const tr = headerRow + 1 + report.rows.length;
  const t = report.totals;
  const totalVals = ["TOTAL", "—", "—", t.total, t.resolved, t.met, t.breached, `${t.compliance}%`, t.avgResolution];
  totalVals.forEach((v, ci) => {
    const cell = ws.getCell(tr, ci + 1);
    cell.value = v;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.navy);
    cell.alignment = { vertical: "middle", horizontal: ci < 3 ? "left" : "center" };
    cell.border = allBorders(C.navy);
  });
  ws.getRow(tr).height = 22;

  return ws;
};

/* ----------------------------------------------------------------------------
 * Save helper
 * ------------------------------------------------------------------------- */
const save = async (wb: ExcelJS.Workbook, filename: string) => {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const newBook = () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = `Aerchain · ${COMPANY_NAME} Support`;
  wb.created = new Date();
  return wb;
};

/* ----------------------------------------------------------------------------
 * Public exports
 * ------------------------------------------------------------------------- */

/** Tickets export: Dashboard cover + full ticket register. */
export const exportTicketsXLSX = async (tickets: Ticket[], periodLabel: string, filename: string) => {
  const wb = newBook();
  buildDashboardSheet(wb, buildSummary(tickets, periodLabel), "Tickets Report");
  buildTicketsSheet(wb, tickets);
  await save(wb, filename);
};

/** SLA export: Dashboard cover + SLA detail. */
export const exportSLAXLSX = async (tickets: Ticket[], periodLabel: string, filename: string) => {
  const wb = newBook();
  buildDashboardSheet(wb, buildSummary(tickets, periodLabel), "SLA Compliance Report");
  buildSLASheet(wb, buildSLAReport(tickets, periodLabel));
  await save(wb, filename);
};
