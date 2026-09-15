import { Injectable } from '@nestjs/common';
import { FileStatus, Role } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { PrismaService } from '../common/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ReportQueryDto } from './dto/report-query.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private buScope(user: JwtPayload) {
    return {
      businessUnitId: user.businessUnitId,
      isActive: true,
      ...(user.role !== Role.ADMIN && { branchId: user.branchId }),
    };
  }

  private async toXlsx(
    sheetName: string,
    headers: string[],
    rows: (string | number | null)[][][],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName);

    const headerRow = ws.addRow(headers);
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    });

    rows.forEach(row => ws.addRow(row.map(v => v ?? '')));

    ws.columns.forEach(col => {
      let maxLen = 12;
      col?.eachCell?.({ includeEmpty: false }, cell => {
        maxLen = Math.max(maxLen, String(cell.value ?? '').length + 2);
      });
      col.width = Math.min(maxLen, 50);
    });

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  // ── Outstanding files ────────────────────────────────────────────────────

  async outstanding(user: JwtPayload) {
    const now = new Date();
    const rows = await this.prisma.dispatch.findMany({
      where: { actualReturnAt: null, file: this.buScope(user) },
      orderBy: { createdAt: 'desc' },
      include: {
        file: { select: { fileNumber: true, customerName: true, currentLocation: true } },
        dispatchedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return rows.map(r => ({
      fileNumber: r.file.fileNumber,
      customerName: r.file.customerName,
      dispatchedTo: r.dispatchedTo,
      department: r.department,
      dispatchDate: r.createdAt.toISOString(),
      expectedReturn: r.expectedReturnAt?.toISOString() ?? null,
      overdue: r.expectedReturnAt ? r.expectedReturnAt < now : false,
      dispatchedBy: `${r.dispatchedBy.firstName} ${r.dispatchedBy.lastName}`,
    }));
  }

  async outstandingXlsx(user: JwtPayload): Promise<Buffer> {
    const data = await this.outstanding(user);
    return this.toXlsx(
      'Outstanding Files',
      ['File #', 'Customer', 'Dispatched To', 'Department', 'Dispatch Date', 'Expected Return', 'Overdue', 'Dispatched By'],
      data.map(r => [
        [r.fileNumber],
        [r.customerName],
        [r.dispatchedTo],
        [r.department],
        [r.dispatchDate ? new Date(r.dispatchDate).toLocaleDateString() : ''],
        [r.expectedReturn ? new Date(r.expectedReturn).toLocaleDateString() : '—'],
        [r.overdue ? 'YES' : 'No'],
        [r.dispatchedBy],
      ]),
    );
  }

  // ── Daily dispatches ─────────────────────────────────────────────────────

  async dailyDispatches(user: JwtPayload, date: string) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return this.prisma.dispatch.findMany({
      where: { createdAt: { gte: start, lte: end }, file: this.buScope(user) },
      orderBy: { createdAt: 'asc' },
      include: {
        file: { select: { fileNumber: true, customerName: true } },
        dispatchedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async dailyDispatchesXlsx(user: JwtPayload, date: string): Promise<Buffer> {
    const data = await this.dailyDispatches(user, date);
    return this.toXlsx(
      `Dispatches ${date}`,
      ['File #', 'Customer', 'Dispatched To', 'Department', 'Reason', 'Dispatched By', 'Expected Return'],
      data.map(r => [
        [r.file.fileNumber],
        [r.file.customerName],
        [r.dispatchedTo],
        [r.department],
        [r.reason ?? ''],
        [`${r.dispatchedBy.firstName} ${r.dispatchedBy.lastName}`],
        [r.expectedReturnAt ? new Date(r.expectedReturnAt).toLocaleDateString() : '—'],
      ]),
    );
  }

  // ── Daily returns ────────────────────────────────────────────────────────

  async dailyReturns(user: JwtPayload, date: string) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return this.prisma.dispatch.findMany({
      where: { actualReturnAt: { gte: start, lte: end }, file: this.buScope(user) },
      orderBy: { actualReturnAt: 'asc' },
      include: {
        file: { select: { fileNumber: true, customerName: true } },
        dispatchedBy: { select: { firstName: true, lastName: true } },
        return: { include: { receivedBy: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async dailyReturnsXlsx(user: JwtPayload, date: string): Promise<Buffer> {
    const data = await this.dailyReturns(user, date);
    return this.toXlsx(
      `Returns ${date}`,
      ['File #', 'Customer', 'Dispatched To', 'Department', 'Return Date', 'Received By', 'Notes'],
      data.map(r => [
        [r.file.fileNumber],
        [r.file.customerName],
        [r.dispatchedTo],
        [r.department],
        [r.actualReturnAt ? new Date(r.actualReturnAt).toLocaleDateString() : ''],
        [r.return ? `${r.return.receivedBy.firstName} ${r.return.receivedBy.lastName}` : ''],
        [r.return?.notes ?? ''],
      ]),
    );
  }

  // ── Missing files ────────────────────────────────────────────────────────

  async missingFiles(user: JwtPayload) {
    return this.prisma.file.findMany({
      where: { ...this.buScope(user), status: FileStatus.MISSING },
      orderBy: { updatedAt: 'desc' },
      include: {
        branch: { select: { name: true, code: true } },
        businessUnit: { select: { name: true } },
      },
    });
  }

  async missingFilesXlsx(user: JwtPayload): Promise<Buffer> {
    const data = await this.missingFiles(user);
    return this.toXlsx(
      'Missing Files',
      ['File #', 'Customer', 'Last Known Location', 'Branch', 'Business Unit', 'Date Flagged'],
      data.map(r => [
        [r.fileNumber],
        [r.customerName],
        [r.currentLocation ?? '—'],
        [`${r.branch.name} (${r.branch.code})`],
        [r.businessUnit.name],
        [new Date(r.updatedAt).toLocaleDateString()],
      ]),
    );
  }

  // ── By department ────────────────────────────────────────────────────────

  async byDepartment(user: JwtPayload) {
    const now = new Date();
    const openDispatches = await this.prisma.dispatch.findMany({
      where: { actualReturnAt: null, file: this.buScope(user) },
      select: { department: true, expectedReturnAt: true },
    });

    const map = new Map<string, { total: number; overdue: number }>();
    for (const d of openDispatches) {
      const entry = map.get(d.department) ?? { total: 0, overdue: 0 };
      entry.total++;
      if (d.expectedReturnAt && d.expectedReturnAt < now) entry.overdue++;
      map.set(d.department, entry);
    }

    return Array.from(map.entries())
      .map(([department, stats]) => ({ department, ...stats }))
      .sort((a, b) => b.total - a.total);
  }

  async byDepartmentXlsx(user: JwtPayload): Promise<Buffer> {
    const data = await this.byDepartment(user);
    return this.toXlsx(
      'Files by Department',
      ['Department', 'Total Held', 'Overdue'],
      data.map(r => [[r.department], [r.total], [r.overdue]]),
    );
  }

  // ── Monthly stats ────────────────────────────────────────────────────────

  async monthlyStats(user: JwtPayload, year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const [dispatches, returns] = await Promise.all([
      this.prisma.dispatch.findMany({
        where: { createdAt: { gte: start, lte: end }, file: this.buScope(user) },
        select: { createdAt: true },
      }),
      this.prisma.dispatch.findMany({
        where: { actualReturnAt: { gte: start, lte: end }, file: this.buScope(user) },
        select: { actualReturnAt: true },
      }),
    ]);

    const daysInMonth = new Date(year, month, 0).getDate();
    const rows = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        date,
        dispatched: dispatches.filter(d => new Date(d.createdAt).getDate() === day).length,
        returned: returns.filter(r => new Date(r.actualReturnAt!).getDate() === day).length,
      };
    });

    return { year, month, rows, totalDispatched: dispatches.length, totalReturned: returns.length };
  }

  async monthlyStatsXlsx(user: JwtPayload, year: number, month: number): Promise<Buffer> {
    const { rows } = await this.monthlyStats(user, year, month);
    return this.toXlsx(
      `Stats ${year}-${String(month).padStart(2, '0')}`,
      ['Date', 'Dispatched', 'Returned'],
      rows.map(r => [[r.date], [r.dispatched], [r.returned]]),
    );
  }

  // ── PDF export helper ────────────────────────────────────────────────────

  private async toPdf(title: string, headers: string[], rows: string[][]): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    const pageW = 841.89; // A4 landscape
    const pageH = 595.28;
    const margin = 40;
    const rowH = 18;
    const headerH = 24;
    const colCount = headers.length;
    const colW = (pageW - margin * 2) / colCount;

    let page = doc.addPage([pageW, pageH]);
    let y = pageH - margin;

    const drawRow = (cells: string[], isBold: boolean, bgColor?: { r: number; g: number; b: number }) => {
      if (bgColor) {
        page.drawRectangle({ x: margin, y: y - (isBold ? headerH : rowH), width: pageW - margin * 2, height: isBold ? headerH : rowH, color: rgb(bgColor.r, bgColor.g, bgColor.b) });
      }
      cells.forEach((cell, i) => {
        page.drawText(String(cell).slice(0, 28), {
          x: margin + i * colW + 4,
          y: y - (isBold ? headerH : rowH) + 5,
          size: isBold ? 9 : 8,
          font: isBold ? boldFont : font,
          color: isBold ? rgb(1, 1, 1) : rgb(0.1, 0.1, 0.1),
          maxWidth: colW - 6,
        });
      });
      y -= isBold ? headerH : rowH;
    };

    // Title
    page.drawText(title, { x: margin, y, size: 14, font: boldFont, color: rgb(0.1, 0.1, 0.3) });
    y -= 24;

    // Header row
    drawRow(headers, true, { r: 0.11, g: 0.31, b: 0.85 });

    for (const row of rows) {
      if (y < margin + rowH) {
        page = doc.addPage([pageW, pageH]);
        y = pageH - margin;
        drawRow(headers, true, { r: 0.11, g: 0.31, b: 0.85 });
      }
      drawRow(row, false);
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  // PDF variants for each existing report

  async outstandingPdf(user: JwtPayload): Promise<Buffer> {
    const data = await this.outstanding(user);
    return this.toPdf('Outstanding Files', ['File #', 'Customer', 'Dispatched To', 'Dept', 'Dispatch Date', 'Overdue'],
      data.map(r => [r.fileNumber, r.customerName, r.dispatchedTo, r.department, new Date(r.dispatchDate).toLocaleDateString(), r.overdue ? 'YES' : 'No']));
  }

  async dailyDispatchesPdf(user: JwtPayload, date: string): Promise<Buffer> {
    const data = await this.dailyDispatches(user, date);
    return this.toPdf(`Dispatches ${date}`, ['File #', 'Customer', 'Dispatched To', 'Dept', 'Reason', 'Expected Return'],
      data.map(r => [r.file.fileNumber, r.file.customerName, r.dispatchedTo, r.department, r.reason ?? '', r.expectedReturnAt ? new Date(r.expectedReturnAt).toLocaleDateString() : '—']));
  }

  async dailyReturnsPdf(user: JwtPayload, date: string): Promise<Buffer> {
    const data = await this.dailyReturns(user, date);
    return this.toPdf(`Returns ${date}`, ['File #', 'Customer', 'Dispatched To', 'Dept', 'Return Date', 'Received By'],
      data.map(r => [r.file.fileNumber, r.file.customerName, r.dispatchedTo, r.department, r.actualReturnAt ? new Date(r.actualReturnAt).toLocaleDateString() : '', r.return ? `${r.return.receivedBy.firstName} ${r.return.receivedBy.lastName}` : '']));
  }

  async missingFilesPdf(user: JwtPayload): Promise<Buffer> {
    const data = await this.missingFiles(user);
    return this.toPdf('Missing Files', ['File #', 'Customer', 'Last Location', 'Branch', 'Business Unit'],
      data.map(r => [r.fileNumber, r.customerName, r.currentLocation ?? '—', r.branch.name, r.businessUnit.name]));
  }

  async byDepartmentPdf(user: JwtPayload): Promise<Buffer> {
    const data = await this.byDepartment(user);
    return this.toPdf('Files by Department', ['Department', 'Total Held', 'Overdue'],
      data.map(r => [r.department, String(r.total), String(r.overdue)]));
  }

  async monthlyStatsPdf(user: JwtPayload, year: number, month: number): Promise<Buffer> {
    const { rows } = await this.monthlyStats(user, year, month);
    return this.toPdf(`Monthly Stats ${year}-${String(month).padStart(2, '0')}`, ['Date', 'Dispatched', 'Returned'],
      rows.map(r => [r.date, String(r.dispatched), String(r.returned)]));
  }

  // ── Movement History report ──────────────────────────────────────────────

  async movementHistory(user: JwtPayload, fileId?: string, dateFrom?: string, dateTo?: string) {
    const from = dateFrom ? new Date(dateFrom) : undefined;
    const to = dateTo ? new Date(dateTo + 'T23:59:59.999Z') : undefined;

    return this.prisma.fileMovement.findMany({
      where: {
        file: this.buScope(user),
        ...(fileId ? { fileId } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        file: { select: { fileNumber: true, customerName: true } },
        performedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async movementHistoryXlsx(user: JwtPayload, fileId?: string, dateFrom?: string, dateTo?: string): Promise<Buffer> {
    const data = await this.movementHistory(user, fileId, dateFrom, dateTo);
    return this.toXlsx(
      'Movement History',
      ['Date', 'File #', 'Customer', 'Action', 'Department', 'From', 'To', 'Performed By', 'Notes'],
      data.map(r => [
        [new Date(r.createdAt).toLocaleString()],
        [r.file.fileNumber],
        [r.file.customerName],
        [r.action],
        [r.department ?? ''],
        [r.fromLocation ?? ''],
        [r.toLocation ?? ''],
        [`${r.performedBy.firstName} ${r.performedBy.lastName}`],
        [r.notes ?? ''],
      ]),
    );
  }

  async movementHistoryPdf(user: JwtPayload, fileId?: string, dateFrom?: string, dateTo?: string): Promise<Buffer> {
    const data = await this.movementHistory(user, fileId, dateFrom, dateTo);
    return this.toPdf('File Movement History', ['Date', 'File #', 'Action', 'Dept', 'From', 'To', 'By'],
      data.map(r => [
        new Date(r.createdAt).toLocaleDateString(),
        r.file.fileNumber,
        r.action,
        r.department ?? '',
        r.fromLocation ?? '',
        r.toLocation ?? '',
        `${r.performedBy.firstName} ${r.performedBy.lastName}`,
      ]));
  }
}
