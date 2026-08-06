import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Ticket } from "@/types/freshdesk";
import { COMPANY_NAME } from "@/config";
import { buildSLAReport, buildSummary } from "@/lib/reportData";

/* RGB tuples for the Aerchain palette */
const RGB = {
  brand: [107, 78, 255] as [number, number, number],
  navy: [26, 26, 46] as [number, number, number],
  emerald: [16, 185, 129] as [number, number, number],
  amber: [245, 158, 11] as [number, number, number],
  rose: [244, 63, 94] as [number, number, number],
  muted: [107, 107, 138] as [number, number, number],
  ink: [26, 26, 46] as [number, number, number],
  violetSoft: [238, 235, 255] as [number, number, number],
  emeraldSoft: [231, 248, 241] as [number, number, number],
  amberSoft: [254, 244, 226] as [number, number, number],
  roseSoft: [253, 234, 237] as [number, number, number],
  line: [226, 226, 238] as [number, number, number],
};

export const exportSLAPDF = (tickets: Ticket[], periodLabel: string, filename: string) => {
  const report = buildSLAReport(tickets, periodLabel);
  const summary = buildSummary(tickets, periodLabel);

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;

  /* ── Header band ──────────────────────────────────────────────── */
  doc.setFillColor(...RGB.navy);
  doc.rect(0, 0, W, 96, "F");

  // coral "A" mark
  doc.setFillColor(232, 52, 28);
  doc.triangle(M, 56, M + 11, 30, M + 22, 56, "F");

  doc.setTextColor(185, 168, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`AERCHAIN  ·  ${COMPANY_NAME.toUpperCase()} SUPPORT`, M + 34, 38);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(21);
  doc.text("SLA Compliance Report", M + 34, 62);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(183, 183, 204);
  doc.text(`Period: ${periodLabel}      ·      Generated ${report.generatedAt}`, M + 34, 80);

  /* ── KPI tiles ────────────────────────────────────────────────── */
  let y = 124;
  const kpis: [string, string, [number, number, number], [number, number, number]][] = [
    ["Total Tickets", String(summary.total), RGB.brand, RGB.violetSoft],
    ["SLA Compliance", `${summary.slaCompliance}%`, RGB.emerald, RGB.emeraldSoft],
    ["Breached", String(summary.breached), RGB.rose, RGB.roseSoft],
    ["Avg Resolution", summary.avgResolution, RGB.amber, RGB.amberSoft],
  ];
  const gap = 12;
  const tileW = (W - M * 2 - gap * 3) / 4;
  const tileH = 58;
  kpis.forEach((k, i) => {
    const x = M + i * (tileW + gap);
    doc.setFillColor(...k[3]);
    doc.roundedRect(x, y, tileW, tileH, 6, 6, "F");
    doc.setTextColor(...k[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.text(k[1], x + tileW / 2, y + 28, { align: "center" });
    doc.setTextColor(...RGB.muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(k[0].toUpperCase(), x + tileW / 2, y + 44, { align: "center" });
  });

  /* ── SLA table ────────────────────────────────────────────────── */
  y += tileH + 26;
  doc.setTextColor(...RGB.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("SLA Performance by Severity", M, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Severity", "Priority", "Target", "Total", "Resolved", "Met", "Breached", "Compliance", "Avg Res."]],
    body: report.rows.map((r) => [
      r.severity, r.priority, r.target, r.total, r.resolved, r.met, r.breached, `${r.compliance}%`, r.avgResolution,
    ]),
    foot: [[
      "TOTAL", "", "", report.totals.total, report.totals.resolved, report.totals.met,
      report.totals.breached, `${report.totals.compliance}%`, report.totals.avgResolution,
    ]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, lineColor: RGB.line, lineWidth: 0.5, textColor: RGB.ink },
    headStyles: { fillColor: RGB.brand, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, halign: "center" },
    footStyles: { fillColor: RGB.navy, textColor: [255, 255, 255], fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { halign: "left", cellWidth: 130 },
      1: { halign: "left" },
      2: { halign: "left" },
      3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" },
      6: { halign: "center" }, 7: { halign: "center" }, 8: { halign: "center" },
    },
    alternateRowStyles: { fillColor: [247, 247, 252] },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        const pct = report.rows[data.row.index].compliance;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = pct >= 90 ? RGB.emerald : pct >= 75 ? RGB.amber : RGB.rose;
      }
      if (data.section === "body" && data.column.index === 6) {
        const b = report.rows[data.row.index].breached;
        if (b > 0) { data.cell.styles.fontStyle = "bold"; data.cell.styles.textColor = RGB.rose; }
      }
    },
  });

  /* ── Priority / status breakdown table ────────────────────────── */
  let afterY = (doc as any).lastAutoTable.finalY + 26;
  doc.setTextColor(...RGB.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Volume Breakdown", M, afterY);
  afterY += 8;

  const maxRows = Math.max(summary.byPriority.length, summary.byStatus.length);
  const breakdownBody = Array.from({ length: maxRows }, (_, i) => [
    summary.byPriority[i]?.label ?? "",
    summary.byPriority[i] ? String(summary.byPriority[i].count) : "",
    summary.byStatus[i]?.label ?? "",
    summary.byStatus[i] ? String(summary.byStatus[i].count) : "",
  ]);

  autoTable(doc, {
    startY: afterY,
    head: [["By Priority", "Count", "By Status", "Count"]],
    body: breakdownBody,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, lineColor: RGB.line, lineWidth: 0.5, textColor: RGB.ink },
    headStyles: { fillColor: RGB.emerald, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 1: { halign: "center" }, 3: { halign: "center" } },
    alternateRowStyles: { fillColor: [247, 247, 252] },
    tableWidth: W - M * 2,
  });

  /* ── Footer on every page ─────────────────────────────────────── */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...RGB.line);
    doc.line(M, H - 34, W - M, H - 34);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...RGB.muted);
    doc.text("Confidential — Aerchain Support Analytics", M, H - 20);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 20, { align: "right" });
  }

  doc.save(filename);
};
