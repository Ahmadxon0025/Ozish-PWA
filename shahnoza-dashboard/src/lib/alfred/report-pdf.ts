import "server-only";
import PDFDocument from "pdfkit";

/**
 * Renders an Alfred-generated report (KPIs, thematic sections, an open-tasks
 * table, an optional callout) into a styled A4 PDF. Pure pdfkit — no headless
 * browser, so it runs fine inside a normal Node serverless function.
 *
 * Layout note: pdfkit's `doc.y` auto-advances after a flowing `.text()` call,
 * even when given explicit x/y — so every multi-column bit here (header,
 * meta box, KPI grid, table) tracks its own local `y`/`cy` and writes the
 * result back into `doc.y` once, rather than trusting the cursor mid-layout.
 */

export interface ReportKpi {
  label: string;
  value: string;
}

export interface ReportSection {
  heading: string;
  bullets: string[];
}

export interface ReportOpenTask {
  title: string;
  due: string | null;
}

export interface ReportInput {
  title: string;
  preparedBy?: string | null;
  recipient?: string | null;
  date?: string | null;
  kpis: ReportKpi[];
  sections: ReportSection[];
  openTasks: ReportOpenTask[];
  note?: string | null;
}

const INK = "#14201c";
const MUTED = "#5b6b66";
const LINE = "#dbe4e0";
const BRAND = "#0f766e";
const BRAND_DARK = "#0b4f4a";
const BRAND_SOFT = "#eaf5f3";
const WARN = "#b45309";
const WARN_SOFT = "#fdf3e7";

const PAGE_MARGIN = 42;

function clampText(s: string, max = 4000): string {
  const t = String(s ?? "").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export async function renderReportPdf(input: ReportInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageWidth = doc.page.width - PAGE_MARGIN * 2;

  function ensureSpace(h: number) {
    if (doc.y + h > doc.page.height - PAGE_MARGIN) doc.addPage();
  }

  // ---------- header ----------
  const headerTop = doc.y;
  const metaW = 170;
  const metaX = PAGE_MARGIN + pageWidth - metaW;
  const titleColW = pageWidth - 44 - metaW - 12;

  // logo swatch (fixed position, doesn't touch the cursor)
  doc.rect(PAGE_MARGIN, headerTop, 34, 34).fill(BRAND);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text("H", PAGE_MARGIN, headerTop + 9, { width: 34, align: "center", lineBreak: false });

  // title + subtitle (left column)
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(17)
    .text(clampText(input.title, 120), PAGE_MARGIN + 44, headerTop, { width: titleColW });
  const titleBottom = doc.y;
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(9.5)
    .text("Jamoa faoliyati va joriy vazifalar bo'yicha hisobot", PAGE_MARGIN + 44, titleBottom + 2, {
      width: titleColW,
    });
  const leftColBottom = doc.y;

  // meta box (right column, fixed position)
  const metaY = headerTop;
  const metaH = 54;
  doc.roundedRect(metaX, metaY, metaW, metaH, 6).lineWidth(0.75).strokeColor(LINE).stroke();
  const metaRows: Array<[string, string]> = [
    ["Tayyorladi", clampText(input.preparedBy || "Siz", 30)],
    ["Sana", clampText(input.date || new Date().toISOString().slice(0, 10), 20)],
    ["Kimga", clampText(input.recipient || "—", 30)],
  ];
  let my = metaY + 7;
  for (const [k, v] of metaRows) {
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(k, metaX + 9, my, { width: metaW - 18, lineBreak: false });
    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(v, metaX + 9, my, { width: metaW - 18, align: "right", lineBreak: false });
    my += 15.5;
  }

  doc.y = Math.max(leftColBottom, headerTop + 34, metaY + metaH) + 10;
  doc.x = PAGE_MARGIN;
  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + pageWidth, doc.y).lineWidth(2).strokeColor(BRAND).stroke();
  doc.y += 14;

  // ---------- KPI grid ----------
  if (input.kpis?.length) {
    sectionTitle(doc, "Umumiy ko'rsatkichlar", pageWidth);
    const cols = 3;
    const gap = 10;
    const cardW = (pageWidth - gap * (cols - 1)) / cols;
    const cardH = 46;
    const kpis = input.kpis.slice(0, 12);
    for (let i = 0; i < kpis.length; i += cols) {
      ensureSpace(cardH + 8);
      const cy = doc.y;
      const rowItems = kpis.slice(i, i + cols);
      rowItems.forEach((k, idx) => {
        const x = PAGE_MARGIN + idx * (cardW + gap);
        doc.roundedRect(x, cy, cardW, cardH, 8).fillAndStroke(BRAND_SOFT, LINE);
        doc
          .fillColor(BRAND_DARK)
          .font("Helvetica")
          .fontSize(7.5)
          .text(clampText(k.label, 40).toUpperCase(), x + 10, cy + 8, { width: cardW - 20, lineBreak: false });
        doc
          .fillColor(INK)
          .font("Helvetica-Bold")
          .fontSize(16)
          .text(clampText(k.value, 24), x + 10, cy + 20, { width: cardW - 20, lineBreak: false });
      });
      doc.y = cy + cardH + 8;
    }
    doc.x = PAGE_MARGIN;
    doc.y += 4;
  }

  // ---------- completed-work sections ----------
  if (input.sections?.length) {
    sectionTitle(doc, "Bajarilgan ishlar", pageWidth);
    let n = 1;
    for (const s of input.sections.slice(0, 20)) {
      ensureSpace(24);
      doc.x = PAGE_MARGIN;
      doc
        .fillColor(INK)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(`${n}. ${clampText(s.heading, 100)}`, PAGE_MARGIN, doc.y, { width: pageWidth });
      doc.y += 4;
      for (const b of (s.bullets || []).slice(0, 15)) {
        doc.font("Helvetica").fontSize(9.5);
        const bulletText = clampText(b, 300);
        const h = doc.heightOfString(bulletText, { width: pageWidth - 16 });
        ensureSpace(h + 4);
        const by = doc.y;
        doc.fillColor(BRAND).text("•", PAGE_MARGIN + 4, by, { width: 10, lineBreak: false });
        doc.fillColor("#2b3833").text(bulletText, PAGE_MARGIN + 16, by, { width: pageWidth - 16 });
        doc.x = PAGE_MARGIN;
        doc.y = Math.max(doc.y, by + h) + 3;
      }
      doc.y += 8;
      n++;
    }
  }

  // ---------- open tasks table ----------
  if (input.openTasks?.length) {
    sectionTitle(doc, `Hozirgi ochiq vazifalar (${input.openTasks.length} ta)`, pageWidth);
    const rowH = 20;
    const dueColW = 100;
    const tTitleColW = pageWidth - dueColW;

    function tableHeader() {
      ensureSpace(rowH + 4);
      const y = doc.y;
      doc.rect(PAGE_MARGIN, y, pageWidth, rowH).fill(BRAND_DARK);
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .text("Vazifa", PAGE_MARGIN + 8, y + 6, { width: tTitleColW - 16, lineBreak: false });
      doc.text("Muddat", PAGE_MARGIN + tTitleColW, y + 6, { width: dueColW - 8, align: "right", lineBreak: false });
      doc.x = PAGE_MARGIN;
      doc.y = y + rowH;
    }
    tableHeader();

    input.openTasks.slice(0, 60).forEach((t, i) => {
      if (doc.y + rowH > doc.page.height - PAGE_MARGIN) {
        doc.addPage();
        tableHeader();
      }
      const y = doc.y;
      if (i % 2 === 1) doc.rect(PAGE_MARGIN, y, pageWidth, rowH).fill("#fafcfb");
      doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(9)
        .text(clampText(t.title, 90), PAGE_MARGIN + 8, y + 5, { width: tTitleColW - 16, lineBreak: false });
      doc
        .fillColor(MUTED)
        .text(clampText(t.due || "—", 20), PAGE_MARGIN + tTitleColW, y + 5, {
          width: dueColW - 8,
          align: "right",
          lineBreak: false,
        });
      doc.moveTo(PAGE_MARGIN, y + rowH).lineTo(PAGE_MARGIN + pageWidth, y + rowH).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.x = PAGE_MARGIN;
      doc.y = y + rowH;
    });
    doc.y += 10;
  }

  // ---------- callout ----------
  if (input.note && input.note.trim()) {
    const text = clampText(input.note, 800);
    doc.font("Helvetica").fontSize(9.5);
    const textH = doc.heightOfString(text, { width: pageWidth - 28 });
    ensureSpace(textH + 24);
    const y = doc.y;
    const boxH = textH + 20;
    doc.roundedRect(PAGE_MARGIN, y, pageWidth, boxH, 6).fillAndStroke(WARN_SOFT, "#f2dcbd");
    doc.rect(PAGE_MARGIN, y, 3, boxH).fill(WARN);
    doc
      .fillColor("#6b4a17")
      .font("Helvetica")
      .fontSize(9.5)
      .text(text, PAGE_MARGIN + 14, y + 10, { width: pageWidth - 28 });
    doc.x = PAGE_MARGIN;
    doc.y = y + boxH + 10;
  }

  // ---------- footer on every page ----------
  // Writing inside the bottom margin trips pdfkit's automatic "overflow ->
  // new page" logic even with an explicit y, so the bottom margin is
  // temporarily zeroed for just this call (standard pdfkit footer pattern).
  const range = doc.bufferedPageRange();
  const savedBottomMargin = doc.page.margins.bottom;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(
        `Ozish jamoasi · ${input.date || new Date().toISOString().slice(0, 10)} · sahifa ${i + 1}/${range.count}`,
        PAGE_MARGIN,
        doc.page.height - PAGE_MARGIN + 10,
        { width: pageWidth, align: "center", lineBreak: false },
      );
    doc.page.margins.bottom = savedBottomMargin;
  }

  doc.end();
  return done;
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string, width: number) {
  if (doc.y + 24 > doc.page.height - PAGE_MARGIN) doc.addPage();
  doc.x = PAGE_MARGIN;
  doc
    .fillColor(BRAND_DARK)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(text, PAGE_MARGIN, doc.y, { width, lineBreak: false });
  const lineY = doc.y + 4;
  doc.moveTo(PAGE_MARGIN, lineY).lineTo(PAGE_MARGIN + width, lineY).lineWidth(0.75).strokeColor(LINE).stroke();
  doc.y = lineY + 10;
}
