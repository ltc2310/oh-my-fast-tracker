import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { TrendReport } from '../../domain/entities/TrendReport';
import { MonthlyBreakdown } from '../../domain/entities/MonthlyBreakdown';
import { Transaction } from '../../domain/entities/Transaction';
import { formatVND } from './vnd-formatter';

// Reuse the same styling constants as ExcelGeneratorService for visual consistency
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF4472C4' },
};

const ACCENT_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF2CC' },
};

const ALTERNATING_ROW_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF2F7FC' },
};

const THIN_BORDER: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } };

const ALL_BORDERS: Partial<ExcelJS.Borders> = {
  top: THIN_BORDER,
  bottom: THIN_BORDER,
  left: THIN_BORDER,
  right: THIN_BORDER,
};

@Injectable()
export class ExcelTrendGeneratorService {
  async generate(report: TrendReport): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // 1. Overview tab ("Tổng quan")
    this.buildOverviewTab(workbook, report);

    // 2. Monthly detail tabs (chronological order)
    for (const breakdown of report.monthlyBreakdown) {
      this.buildMonthlyTab(workbook, breakdown);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildOverviewTab(workbook: ExcelJS.Workbook, report: TrendReport): void {
    const worksheet = workbook.addWorksheet('Tổng quan');
    const columnCount = 2;

    // --- Header section ---
    this.buildOverviewHeader(worksheet, report, columnCount);

    // --- Summary stats table ---
    this.buildSummaryStatsTable(worksheet, report);

    // --- Top growing categories table ---
    this.buildTopCategoriesTable(
      worksheet,
      'DANH MỤC TĂNG MẠNH NHẤT',
      report.topGrowingCategories.map((c) => ({
        name: c.category,
        changePercent: c.changePercent,
      })),
    );

    // --- Top shrinking categories table ---
    this.buildTopCategoriesTable(
      worksheet,
      'DANH MỤC GIẢM MẠNH NHẤT',
      report.topShrinkingCategories.map((c) => ({
        name: c.category,
        changePercent: c.changePercent,
      })),
    );

    this.autoSizeColumns(worksheet);
  }

  private buildOverviewHeader(
    worksheet: ExcelJS.Worksheet,
    report: TrendReport,
    columnCount: number,
  ): void {
    // Row 1: Title
    const titleRow = worksheet.addRow(['BÁO CÁO XU HƯỚNG CHI TIÊU']);
    worksheet.mergeCells(titleRow.number, 1, titleRow.number, columnCount);
    const titleCell = titleRow.getCell(1);
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    // Row 2: Period string
    const periodStr = `Từ ${this.formatDateVN(report.periodStart)} đến ${this.formatDateVN(report.periodEnd)}`;
    const periodRow = worksheet.addRow([periodStr]);
    worksheet.mergeCells(periodRow.number, 1, periodRow.number, columnCount);
    const periodCell = periodRow.getCell(1);
    periodCell.font = { italic: true, size: 11 };
    periodCell.alignment = { horizontal: 'center' };

    // Row 3: Generation date (Asia/Ho_Chi_Minh timezone)
    const genDateStr = this.formatDateTimeVN(new Date());
    const genDateRow = worksheet.addRow([`Ngày xuất: ${genDateStr}`]);
    worksheet.mergeCells(genDateRow.number, 1, genDateRow.number, columnCount);
    const genDateCell = genDateRow.getCell(1);
    genDateCell.font = { italic: true, size: 11 };
    genDateCell.alignment = { horizontal: 'center' };

    // Empty separator
    worksheet.addRow([]);
  }

  private buildSummaryStatsTable(
    worksheet: ExcelJS.Worksheet,
    report: TrendReport,
  ): void {
    // Section header
    const sectionRow = worksheet.addRow(['TỔNG QUAN']);
    sectionRow.getCell(1).font = { bold: true, size: 13 };

    // Table header
    const headerRow = worksheet.addRow(['Chỉ số', 'Giá trị']);
    this.applyHeaderStyle(headerRow, 2);

    // Direction symbol
    const directionSymbol = this.getDirectionSymbol(report.overview.overallDirection);
    const directionLabel = this.getDirectionLabel(report.overview.overallDirection);

    // Data rows
    const statsRows = [
      ['Tổng chi tiêu', formatVND(report.overview.totalSpent)],
      ['Trung bình/tháng', formatVND(report.overview.averageMonthlySpent)],
      ['Tháng cao nhất', `${this.formatMonthLabel(report.overview.highestMonth.month)} (${formatVND(report.overview.highestMonth.amount)})`],
      ['Tháng thấp nhất', `${this.formatMonthLabel(report.overview.lowestMonth.month)} (${formatVND(report.overview.lowestMonth.amount)})`],
      ['Xu hướng chung', `${directionSymbol} ${directionLabel}`],
      ['Thay đổi', `${report.overview.overallChangePercent >= 0 ? '+' : ''}${report.overview.overallChangePercent.toFixed(1)}%`],
    ];

    for (const [label, value] of statsRows) {
      const row = worksheet.addRow([label, value]);
      for (let col = 1; col <= 2; col++) {
        row.getCell(col).border = ALL_BORDERS;
      }
    }

    // Empty separator
    worksheet.addRow([]);
  }

  private buildTopCategoriesTable(
    worksheet: ExcelJS.Worksheet,
    title: string,
    categories: Array<{ name: string; changePercent: number }>,
  ): void {
    // Section header
    const sectionRow = worksheet.addRow([title]);
    sectionRow.getCell(1).font = { bold: true, size: 11 };

    if (categories.length === 0) {
      worksheet.addRow(['Không có dữ liệu']);
      worksheet.addRow([]);
      return;
    }

    // Table header
    const headerRow = worksheet.addRow(['Danh mục', 'Thay đổi (%)']);
    this.applyHeaderStyle(headerRow, 2);

    // Data rows
    for (const cat of categories) {
      const sign = cat.changePercent >= 0 ? '+' : '';
      const row = worksheet.addRow([cat.name, `${sign}${cat.changePercent.toFixed(1)}%`]);
      for (let col = 1; col <= 2; col++) {
        row.getCell(col).border = ALL_BORDERS;
      }
    }

    // Empty separator
    worksheet.addRow([]);
  }

  private buildMonthlyTab(
    workbook: ExcelJS.Workbook,
    breakdown: MonthlyBreakdown,
  ): void {
    const sheetName = this.formatSheetName(breakdown.month);
    const worksheet = workbook.addWorksheet(sheetName);

    // --- Category breakdown table ---
    this.buildCategoryBreakdownTable(worksheet, breakdown);

    // Empty separator
    worksheet.addRow([]);

    // --- Transaction detail table ---
    this.buildTransactionDetailTable(worksheet, breakdown);

    this.autoSizeColumns(worksheet);
  }

  private buildCategoryBreakdownTable(
    worksheet: ExcelJS.Worksheet,
    breakdown: MonthlyBreakdown,
  ): void {
    // Section header
    const sectionRow = worksheet.addRow([breakdown.monthLabel]);
    sectionRow.getCell(1).font = { bold: true, size: 13 };

    // Table header
    const headerRow = worksheet.addRow(['Danh mục', 'Số tiền']);
    this.applyHeaderStyle(headerRow, 2);

    // Get categories sorted by amount descending
    const categories = Object.entries(breakdown.byCategory)
      .sort((a, b) => b[1] - a[1]);

    if (categories.length === 0) {
      // Empty table with note
      const emptyRow = worksheet.addRow(['Không có giao dịch', '']);
      for (let col = 1; col <= 2; col++) {
        emptyRow.getCell(col).border = ALL_BORDERS;
      }
      return;
    }

    for (const [category, amount] of categories) {
      const row = worksheet.addRow([category, formatVND(amount)]);
      for (let col = 1; col <= 2; col++) {
        row.getCell(col).border = ALL_BORDERS;
      }
    }
  }

  private buildTransactionDetailTable(
    worksheet: ExcelJS.Worksheet,
    breakdown: MonthlyBreakdown,
  ): void {
    // Section header
    const detailHeaderRow = worksheet.addRow(['CHI TIẾT GIAO DỊCH']);
    detailHeaderRow.getCell(1).font = { bold: true, size: 11 };

    // Table header
    const headerRow = worksheet.addRow(['STT', 'Ngày', 'Danh mục', 'Ghi chú', 'Số tiền']);
    this.applyHeaderStyle(headerRow, 5);

    const transactions = breakdown.transactions ?? [];

    if (transactions.length === 0) {
      // Empty table — headers only
      return;
    }

    // Sort transactions by spentAt descending
    const sorted = [...transactions].sort((a, b) => {
      const dateA = a.spentAt ?? a.createdAt ?? new Date(0);
      const dateB = b.spentAt ?? b.createdAt ?? new Date(0);
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    // Data rows with sequential STT
    const dataStartRow = headerRow.number + 1;
    let totalAmount = 0;

    for (let i = 0; i < sorted.length; i++) {
      const txn = sorted[i];
      const effectiveDate = txn.spentAt ?? txn.createdAt ?? new Date(0);
      const row = worksheet.addRow([
        i + 1,
        this.formatDateDMY(new Date(effectiveDate)),
        txn.category,
        txn.note || '',
        formatVND(txn.amount),
      ]);

      // Apply borders
      for (let col = 1; col <= 5; col++) {
        row.getCell(col).border = ALL_BORDERS;
      }

      // Apply alternating row styling (odd data rows: i=1,3,5...)
      if (i % 2 === 1) {
        for (let col = 1; col <= 5; col++) {
          row.getCell(col).fill = ALTERNATING_ROW_FILL;
        }
      }

      totalAmount += txn.amount;
    }

    // "Tổng cộng" sum row
    const sumRow = worksheet.addRow(['', '', '', 'Tổng cộng', formatVND(totalAmount)]);
    for (let col = 1; col <= 5; col++) {
      sumRow.getCell(col).border = ALL_BORDERS;
      sumRow.getCell(col).fill = ACCENT_FILL;
    }
    sumRow.getCell(4).font = { bold: true };
    sumRow.getCell(5).font = { bold: true };
  }

  private applyHeaderStyle(row: ExcelJS.Row, columnCount: number): void {
    for (let col = 1; col <= columnCount; col++) {
      const cell = row.getCell(col);
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = HEADER_FILL;
      cell.border = ALL_BORDERS;
    }
  }

  private autoSizeColumns(worksheet: ExcelJS.Worksheet): void {
    const minWidth = 8;
    const maxWidth = 50;

    worksheet.columns.forEach((column) => {
      let maxContentWidth = minWidth;

      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const cellValue = String(cell.value ?? '');
        const length = cellValue.length + 2;
        if (length > maxContentWidth) {
          maxContentWidth = length;
        }
      });

      column.width = Math.min(Math.max(maxContentWidth, minWidth), maxWidth);
    });
  }

  /**
   * Formats a month key "YYYY-MM" into sheet name "T{M}-{YYYY}".
   * Ensures no forbidden characters and stays within 31-char limit.
   */
  private formatSheetName(monthKey: string): string {
    const [year, monthStr] = monthKey.split('-');
    const month = parseInt(monthStr, 10);
    return `T${month}-${year}`;
  }

  /**
   * Formats an ISO date string "YYYY-MM-DD" into "dd/MM/yyyy" for display.
   */
  private formatDateVN(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }

  /**
   * Formats a month key "YYYY-MM" into a readable label like "Tháng 2/2026".
   */
  private formatMonthLabel(monthKey: string): string {
    if (!monthKey) return '';
    const [year, monthStr] = monthKey.split('-');
    const month = parseInt(monthStr, 10);
    return `Tháng ${month}/${year}`;
  }

  /**
   * Formats a Date into "dd/MM/yyyy" display format.
   */
  private formatDateDMY(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Formats the current date/time in Asia/Ho_Chi_Minh timezone.
   */
  private formatDateTimeVN(date: Date): string {
    const formatOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };

    const parts = new Intl.DateTimeFormat('en-GB', formatOptions).formatToParts(date);
    const partsMap: Record<string, string> = {};
    for (const part of parts) {
      partsMap[part.type] = part.value;
    }

    return `${partsMap.day}/${partsMap.month}/${partsMap.year} ${partsMap.hour}:${partsMap.minute}`;
  }

  private getDirectionSymbol(direction: 'increasing' | 'decreasing' | 'stable'): string {
    switch (direction) {
      case 'increasing':
        return '↑';
      case 'decreasing':
        return '↓';
      case 'stable':
        return '→';
    }
  }

  private getDirectionLabel(direction: 'increasing' | 'decreasing' | 'stable'): string {
    switch (direction) {
      case 'increasing':
        return 'Tăng';
      case 'decreasing':
        return 'Giảm';
      case 'stable':
        return 'Ổn định';
    }
  }
}
