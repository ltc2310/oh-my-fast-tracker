import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { WeeklySummary } from '../../domain/entities/WeeklySummary';
import { Transaction } from '../../domain/entities/Transaction';
import { formatVND } from './vnd-formatter';

export interface ExcelGeneratorOptions {
  from: Date;
  to: Date;
}

// Structural fill colors (at most two for emphasis)
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
export class ExcelGeneratorService {
  async generate(
    summary: WeeklySummary,
    options: ExcelGeneratorOptions,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Báo cáo');

    const columnCount = 5;

    this.buildHeaderSection(worksheet, options, columnCount);
    this.buildSummarySection(worksheet, summary);
    this.buildChartSection(worksheet, summary);
    this.buildTransactionsSection(worksheet, summary.transactions);

    this.applyStyles(worksheet, summary);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildHeaderSection(
    worksheet: ExcelJS.Worksheet,
    options: ExcelGeneratorOptions,
    columnCount: number,
  ): void {
    // Row 1: Title "BÁO CÁO CHI TIÊU" — merged, centered, bold 16pt
    const titleRow = worksheet.addRow(['BÁO CÁO CHI TIÊU']);
    worksheet.mergeCells(1, 1, 1, columnCount);
    const titleCell = titleRow.getCell(1);
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    // Row 2: Date range — italic 11pt, centered
    const fromStr = this.formatDateVN(options.from);
    const toStr = this.formatDateVN(options.to);
    const dateRangeRow = worksheet.addRow([`Từ ${fromStr} đến ${toStr}`]);
    worksheet.mergeCells(2, 1, 2, columnCount);
    const dateRangeCell = dateRangeRow.getCell(1);
    dateRangeCell.font = { italic: true, size: 11 };
    dateRangeCell.alignment = { horizontal: 'center' };

    // Row 3: Generation date in Asia/Ho_Chi_Minh — italic 11pt, centered
    const genDateStr = this.formatDateTimeVN(new Date());
    const genDateRow = worksheet.addRow([`Ngày xuất: ${genDateStr}`]);
    worksheet.mergeCells(3, 1, 3, columnCount);
    const genDateCell = genDateRow.getCell(1);
    genDateCell.font = { italic: true, size: 11 };
    genDateCell.alignment = { horizontal: 'center' };

    // Row 4: Empty separator
    worksheet.addRow([]);
  }

  private buildSummarySection(
    worksheet: ExcelJS.Worksheet,
    summary: WeeklySummary,
  ): void {
    // "TỔNG QUAN" section header — bold 13pt
    const sectionHeaderRow = worksheet.addRow(['TỔNG QUAN']);
    sectionHeaderRow.getCell(1).font = { bold: true, size: 13 };

    // Total spending row with VND formatting
    worksheet.addRow([`Tổng chi tiêu: ${formatVND(summary.total)}`]);

    // Total income row (if any)
    if (summary.totalIncome && summary.totalIncome > 0) {
      worksheet.addRow([`Tổng thu nhập: ${formatVND(summary.totalIncome)}`]);
    }

    // Empty row before category table
    worksheet.addRow([]);

    // Category table header
    const catHeaderRow = worksheet.addRow(['Danh mục', 'Số tiền']);
    catHeaderRow.getCell(1).font = { bold: true };
    catHeaderRow.getCell(2).font = { bold: true };

    // Category rows sorted descending by amount
    const sortedCategories = [...summary.byCategory].sort(
      (a, b) => b.total - a.total,
    );

    for (const category of sortedCategories) {
      worksheet.addRow([category.category, formatVND(category.total)]);
    }
  }

  private buildChartSection(
    worksheet: ExcelJS.Worksheet,
    summary: WeeklySummary,
  ): void {
    if (summary.byCategory.length < 2) {
      return;
    }

    // Empty row gap between category table and chart section
    worksheet.addRow([]);

    // Chart section header
    const chartHeaderRow = worksheet.addRow(['BIỂU ĐỒ PHÂN BỔ']);
    chartHeaderRow.getCell(1).font = { bold: true, size: 11 };

    // Calculate percentages and display each category with its percentage
    const total = summary.byCategory.reduce((sum, cat) => sum + cat.total, 0);
    const sortedCategories = [...summary.byCategory].sort(
      (a, b) => b.total - a.total,
    );

    for (const category of sortedCategories) {
      const percentage = total > 0
        ? Math.round((category.total / total) * 100)
        : 0;
      worksheet.addRow([`${category.category} ${percentage}%`]);
    }
  }

  private buildTransactionsSection(
    worksheet: ExcelJS.Worksheet,
    transactions: Transaction[],
  ): void {
    // Empty separator row before transactions section
    worksheet.addRow([]);

    // Section header — bold 13pt
    const sectionHeaderRow = worksheet.addRow(['CHI TIẾT GIAO DỊCH']);
    sectionHeaderRow.getCell(1).font = { bold: true, size: 13 };

    // Table header row
    const headerRow = worksheet.addRow([
      'STT',
      'Ngày',
      'Danh mục',
      'Ghi chú',
      'Số tiền',
    ]);
    for (let col = 1; col <= 5; col++) {
      headerRow.getCell(col).font = { bold: true };
    }

    // Sort transactions by effective date (spentAt ?? createdAt) descending
    const sorted = [...transactions].sort((a, b) => {
      const dateA = a.spentAt ?? a.createdAt ?? new Date(0);
      const dateB = b.spentAt ?? b.createdAt ?? new Date(0);
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    // Data rows with sequential STT
    let totalExpense = 0;
    let totalIncome = 0;
    for (let i = 0; i < sorted.length; i++) {
      const txn = sorted[i];
      const effectiveDate = txn.spentAt ?? txn.createdAt ?? new Date(0);
      // Income (negative amount) displayed as positive value
      const isIncome = txn.amount < 0;
      const displayAmount = isIncome
        ? formatVND(Math.abs(txn.amount))
        : formatVND(txn.amount);

      worksheet.addRow([
        i + 1,
        this.formatDateVN(new Date(effectiveDate)),
        txn.category,
        txn.note || '',
        displayAmount,
      ]);

      if (isIncome) {
        totalIncome += Math.abs(txn.amount);
      } else {
        totalExpense += txn.amount;
      }
    }

    // "Tổng chi" sum row — bold
    const expenseRow = worksheet.addRow([
      '',
      '',
      '',
      'Tổng chi',
      formatVND(totalExpense),
    ]);
    expenseRow.getCell(4).font = { bold: true };
    expenseRow.getCell(5).font = { bold: true };

    // "Tổng thu" row if there's income
    if (totalIncome > 0) {
      const incomeRow = worksheet.addRow([
        '',
        '',
        '',
        'Tổng thu',
        formatVND(totalIncome),
      ]);
      incomeRow.getCell(4).font = { bold: true };
      incomeRow.getCell(5).font = { bold: true };
    }
  }

  private applyStyles(
    worksheet: ExcelJS.Worksheet,
    summary: WeeklySummary,
  ): void {
    this.styleTableHeaders(worksheet);
    this.styleTableDataCells(worksheet, summary);
    this.styleTransactionAlternatingRows(worksheet, summary);
    this.styleTotalRow(worksheet);
    this.autoSizeColumns(worksheet);
  }

  private styleTableHeaders(worksheet: ExcelJS.Worksheet): void {
    worksheet.eachRow((row) => {
      const firstCellValue = String(row.getCell(1).value ?? '');
      const isTableHeader =
        firstCellValue === 'Danh mục' || firstCellValue === 'STT';

      if (!isTableHeader) return;

      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.fill = HEADER_FILL;
        cell.border = ALL_BORDERS;
      });
    });
  }

  private styleTableDataCells(
    worksheet: ExcelJS.Worksheet,
    summary: WeeklySummary,
  ): void {
    const categoryHeaderRow = this.findRowByFirstCell(worksheet, 'Danh mục');
    const transactionHeaderRow = this.findRowByFirstCell(worksheet, 'STT');

    if (categoryHeaderRow) {
      this.applyBordersToTableRows(
        worksheet,
        categoryHeaderRow,
        summary.byCategory.length,
        2,
      );
    }

    if (transactionHeaderRow) {
      const transactionCount = summary.transactions.length;
      // +1 for "Tổng chi" row, +1 more if there's income
      const hasIncome = summary.transactions.some(t => t.amount < 0);
      const extraRows = hasIncome ? 2 : 1;
      this.applyBordersToTableRows(
        worksheet,
        transactionHeaderRow,
        transactionCount + extraRows,
        5,
      );
    }
  }

  private applyBordersToTableRows(
    worksheet: ExcelJS.Worksheet,
    headerRowNumber: number,
    dataRowCount: number,
    columnCount: number,
  ): void {
    for (let r = headerRowNumber + 1; r <= headerRowNumber + dataRowCount; r++) {
      const row = worksheet.getRow(r);
      for (let col = 1; col <= columnCount; col++) {
        row.getCell(col).border = ALL_BORDERS;
      }
    }
  }

  private styleTransactionAlternatingRows(
    worksheet: ExcelJS.Worksheet,
    summary: WeeklySummary,
  ): void {
    const transactionHeaderRow = this.findRowByFirstCell(worksheet, 'STT');
    if (!transactionHeaderRow) return;

    const transactionCount = summary.transactions.length;
    for (let i = 0; i < transactionCount; i++) {
      const rowNumber = transactionHeaderRow + 1 + i;
      const row = worksheet.getRow(rowNumber);

      // Even data rows (0-indexed: i=1,3,5... → 2nd, 4th, 6th rows) get light fill
      if (i % 2 === 1) {
        for (let col = 1; col <= 5; col++) {
          row.getCell(col).fill = ALTERNATING_ROW_FILL;
        }
      }
    }
  }

  private styleTotalRow(worksheet: ExcelJS.Worksheet): void {
    worksheet.eachRow((row) => {
      const cell4Value = String(row.getCell(4).value ?? '');
      if (cell4Value === 'Tổng chi' || cell4Value === 'Tổng thu') {
        for (let col = 1; col <= 5; col++) {
          row.getCell(col).fill = ACCENT_FILL;
        }
      }
    });
  }

  private autoSizeColumns(worksheet: ExcelJS.Worksheet): void {
    const minWidth = 8;
    const maxWidth = 50;

    worksheet.columns.forEach((column) => {
      let maxContentWidth = minWidth;

      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const cellValue = String(cell.value ?? '');
        const length = cellValue.length + 2; // padding
        if (length > maxContentWidth) {
          maxContentWidth = length;
        }
      });

      column.width = Math.min(Math.max(maxContentWidth, minWidth), maxWidth);
    });
  }

  private findRowByFirstCell(
    worksheet: ExcelJS.Worksheet,
    value: string,
  ): number | null {
    let foundRow: number | null = null;
    worksheet.eachRow((row, rowNumber) => {
      if (foundRow) return;
      if (String(row.getCell(1).value ?? '') === value) {
        foundRow = rowNumber;
      }
    });
    return foundRow;
  }

  private formatDateVN(date: Date): string {
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
