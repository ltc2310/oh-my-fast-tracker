import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { MonthComparisonResult } from '../../domain/entities/MonthComparisonResult';
import { Transaction } from '../../domain/entities/Transaction';
import { formatVND } from './vnd-formatter';

// Reuse the same styling constants as ExcelTrendGeneratorService for visual consistency
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
export class ExcelCompareGeneratorService {
  async generate(result: MonthComparisonResult): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // Tab 1: Comparison overview ("So sánh")
    this.buildComparisonTab(workbook, result);

    // Tab 2: Month A details
    this.buildMonthDetailTab(workbook, result.monthA);

    // Tab 3: Month B details
    this.buildMonthDetailTab(workbook, result.monthB);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildComparisonTab(workbook: ExcelJS.Workbook, result: MonthComparisonResult): void {
    const worksheet = workbook.addWorksheet('So sánh');
    const columnCount = 5;

    // --- Header section ---
    const titleRow = worksheet.addRow(['SO SÁNH CHI TIÊU']);
    worksheet.mergeCells(titleRow.number, 1, titleRow.number, columnCount);
    const titleCell = titleRow.getCell(1);
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    const subtitleRow = worksheet.addRow([`${result.monthA.label} vs ${result.monthB.label}`]);
    worksheet.mergeCells(subtitleRow.number, 1, subtitleRow.number, columnCount);
    const subtitleCell = subtitleRow.getCell(1);
    subtitleCell.font = { italic: true, size: 11 };
    subtitleCell.alignment = { horizontal: 'center' };

    // Row 3: Generation date (Asia/Ho_Chi_Minh timezone)
    const genDateStr = this.formatDateTimeVN(new Date());
    const genDateRow = worksheet.addRow([`Ngày xuất: ${genDateStr}`]);
    worksheet.mergeCells(genDateRow.number, 1, genDateRow.number, columnCount);
    const genDateCell = genDateRow.getCell(1);
    genDateCell.font = { italic: true, size: 11 };
    genDateCell.alignment = { horizontal: 'center' };

    // Empty separator
    worksheet.addRow([]);

    // --- Comparison table ---
    const headerRow = worksheet.addRow(['Danh mục', result.monthA.label, result.monthB.label, 'Chênh lệch', '% Thay đổi']);
    this.applyHeaderStyle(headerRow, columnCount);

    // Category diff rows sorted by |absoluteDiff| descending
    const sortedDiffs = [...result.categoryDiffs].sort(
      (a, b) => Math.abs(b.absoluteDiff) - Math.abs(a.absoluteDiff),
    );

    for (let i = 0; i < sortedDiffs.length; i++) {
      const diff = sortedDiffs[i];
      const percentDisplay = diff.percentChange === null
        ? 'Mới'
        : `${diff.percentChange >= 0 ? '+' : ''}${diff.percentChange.toFixed(1)}%`;

      const row = worksheet.addRow([
        diff.category,
        formatVND(diff.amountA),
        formatVND(diff.amountB),
        formatVND(diff.absoluteDiff),
        percentDisplay,
      ]);

      for (let col = 1; col <= columnCount; col++) {
        row.getCell(col).border = ALL_BORDERS;
      }

      // Apply alternating row styling
      if (i % 2 === 1) {
        for (let col = 1; col <= columnCount; col++) {
          row.getCell(col).fill = ALTERNATING_ROW_FILL;
        }
      }
    }

    // "Tổng cộng" summary row
    const totalPercentDisplay = result.totalPercentChange === null
      ? 'Mới'
      : `${result.totalPercentChange >= 0 ? '+' : ''}${result.totalPercentChange.toFixed(1)}%`;

    const sumRow = worksheet.addRow([
      'Tổng cộng',
      formatVND(result.monthA.totalSpent),
      formatVND(result.monthB.totalSpent),
      formatVND(result.totalDifference),
      totalPercentDisplay,
    ]);

    for (let col = 1; col <= columnCount; col++) {
      sumRow.getCell(col).border = ALL_BORDERS;
      sumRow.getCell(col).fill = ACCENT_FILL;
    }
    sumRow.getCell(1).font = { bold: true };
    sumRow.getCell(4).font = { bold: true };
    sumRow.getCell(5).font = { bold: true };

    this.autoSizeColumns(worksheet);
  }

  private buildMonthDetailTab(
    workbook: ExcelJS.Workbook,
    monthData: MonthComparisonResult['monthA'],
  ): void {
    const sheetName = `Tháng ${monthData.month}-${monthData.year}`;
    const worksheet = workbook.addWorksheet(sheetName);

    // --- Category breakdown table ---
    this.buildCategoryBreakdownTable(worksheet, monthData);

    // Empty separator
    worksheet.addRow([]);

    // --- Transaction detail table ---
    this.buildTransactionDetailTable(worksheet, monthData.transactions);

    this.autoSizeColumns(worksheet);
  }

  private buildCategoryBreakdownTable(
    worksheet: ExcelJS.Worksheet,
    monthData: MonthComparisonResult['monthA'],
  ): void {
    // Section header
    const sectionRow = worksheet.addRow([monthData.label]);
    sectionRow.getCell(1).font = { bold: true, size: 13 };

    // Table header
    const headerRow = worksheet.addRow(['Danh mục', 'Số tiền']);
    this.applyHeaderStyle(headerRow, 2);

    // Get categories sorted by amount descending
    const categories = Object.entries(monthData.byCategory)
      .sort((a, b) => b[1] - a[1]);

    if (categories.length === 0) {
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

    // "Tổng cộng" row for category breakdown
    const totalRow = worksheet.addRow(['Tổng cộng', formatVND(monthData.totalSpent)]);
    for (let col = 1; col <= 2; col++) {
      totalRow.getCell(col).border = ALL_BORDERS;
      totalRow.getCell(col).fill = ACCENT_FILL;
    }
    totalRow.getCell(1).font = { bold: true };
    totalRow.getCell(2).font = { bold: true };
  }

  private buildTransactionDetailTable(
    worksheet: ExcelJS.Worksheet,
    transactions: Transaction[],
  ): void {
    // Section header
    const detailHeaderRow = worksheet.addRow(['CHI TIẾT GIAO DỊCH']);
    detailHeaderRow.getCell(1).font = { bold: true, size: 11 };

    // Table header
    const headerRow = worksheet.addRow(['STT', 'Ngày', 'Danh mục', 'Ghi chú', 'Số tiền']);
    this.applyHeaderStyle(headerRow, 5);

    if (transactions.length === 0) {
      return;
    }

    // Sort transactions by spentAt descending
    const sorted = [...transactions].sort((a, b) => {
      const dateA = a.spentAt ?? a.createdAt ?? new Date(0);
      const dateB = b.spentAt ?? b.createdAt ?? new Date(0);
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    let totalExpense = 0;
    let totalIncome = 0;

    for (let i = 0; i < sorted.length; i++) {
      const txn = sorted[i];
      const effectiveDate = txn.spentAt ?? txn.createdAt ?? new Date(0);
      const isIncome = txn.amount < 0;
      const displayAmount = isIncome
        ? formatVND(Math.abs(txn.amount))
        : formatVND(txn.amount);

      const row = worksheet.addRow([
        i + 1,
        this.formatDateDMY(new Date(effectiveDate)),
        txn.category,
        txn.note || '',
        displayAmount,
      ]);

      // Apply borders
      for (let col = 1; col <= 5; col++) {
        row.getCell(col).border = ALL_BORDERS;
      }

      // Apply alternating row styling
      if (i % 2 === 1) {
        for (let col = 1; col <= 5; col++) {
          row.getCell(col).fill = ALTERNATING_ROW_FILL;
        }
      }

      if (isIncome) {
        totalIncome += Math.abs(txn.amount);
      } else {
        totalExpense += txn.amount;
      }
    }

    // "Tổng chi" sum row
    const sumRow = worksheet.addRow(['', '', '', 'Tổng chi', formatVND(totalExpense)]);
    for (let col = 1; col <= 5; col++) {
      sumRow.getCell(col).border = ALL_BORDERS;
      sumRow.getCell(col).fill = ACCENT_FILL;
    }
    sumRow.getCell(4).font = { bold: true };
    sumRow.getCell(5).font = { bold: true };

    // "Tổng thu" row if there's income
    if (totalIncome > 0) {
      const incomeRow = worksheet.addRow(['', '', '', 'Tổng thu', formatVND(totalIncome)]);
      for (let col = 1; col <= 5; col++) {
        incomeRow.getCell(col).border = ALL_BORDERS;
        incomeRow.getCell(col).fill = ACCENT_FILL;
      }
      incomeRow.getCell(4).font = { bold: true };
      incomeRow.getCell(5).font = { bold: true };
    }
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

  private formatDateDMY(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

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
}
