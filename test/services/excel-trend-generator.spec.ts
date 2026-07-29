import * as ExcelJS from 'exceljs';
import { ExcelTrendGeneratorService } from '../../src/application/services/ExcelTrendGeneratorService';
import { TrendReport } from '../../src/domain/entities/TrendReport';
import { MonthlyBreakdown } from '../../src/domain/entities/MonthlyBreakdown';
import { Transaction } from '../../src/domain/entities/Transaction';

describe('ExcelTrendGeneratorService', () => {
  let service: ExcelTrendGeneratorService;

  beforeEach(() => {
    service = new ExcelTrendGeneratorService();
  });

  async function parseWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    return workbook;
  }

  // --- Fixture data: 3 months with transactions and category data ---
  function buildFixture(): TrendReport {
    const transactions1: Transaction[] = [
      { userId: 'u1', amount: 500000, category: 'Ăn uống', note: 'Cơm trưa', spentAt: new Date('2026-01-10') },
      { userId: 'u1', amount: 200000, category: 'Di chuyển', note: 'Grab', spentAt: new Date('2026-01-15') },
    ];

    const transactions2: Transaction[] = [
      { userId: 'u1', amount: 800000, category: 'Ăn uống', note: 'Nhà hàng', spentAt: new Date('2026-02-05') },
      { userId: 'u1', amount: 150000, category: 'Mua sắm', note: 'Shopee', spentAt: new Date('2026-02-20') },
      { userId: 'u1', amount: 300000, category: 'Di chuyển', note: 'Taxi', spentAt: new Date('2026-02-12') },
    ];

    const transactions3: Transaction[] = []; // Empty month

    const monthlyBreakdown: MonthlyBreakdown[] = [
      {
        month: '2026-01',
        monthLabel: 'Tháng 1/2026',
        totalSpent: 700000,
        totalIncome: 0,
        transactionCount: 2,
        byCategory: { 'Ăn uống': 500000, 'Di chuyển': 200000 },
        topCategory: { name: 'Ăn uống', amount: 500000 },
        transactions: transactions1,
      },
      {
        month: '2026-02',
        monthLabel: 'Tháng 2/2026',
        totalSpent: 1250000,
        totalIncome: 0,
        transactionCount: 3,
        byCategory: { 'Ăn uống': 800000, 'Di chuyển': 300000, 'Mua sắm': 150000 },
        topCategory: { name: 'Ăn uống', amount: 800000 },
        transactions: transactions2,
      },
      {
        month: '2026-03',
        monthLabel: 'Tháng 3/2026',
        totalSpent: 0,
        totalIncome: 0,
        transactionCount: 0,
        byCategory: {},
        topCategory: null,
        transactions: transactions3,
      },
    ];

    const report: TrendReport = {
      userId: 'u1',
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      monthsCount: 3,
      overview: {
        totalSpent: 1950000,
        averageMonthlySpent: 650000,
        highestMonth: { month: '2026-02', amount: 1250000 },
        lowestMonth: { month: '2026-03', amount: 0 },
        overallDirection: 'decreasing',
        overallChangePercent: -100,
        hasIncompleteData: true,
        monthsWithData: 2,
      },
      monthlyBreakdown,
      categoryTrends: [
        { category: 'Ăn uống', monthlyAmounts: [500000, 800000, 0], changePercent: -100, direction: 'decreasing', averageMonthly: 433333 },
        { category: 'Di chuyển', monthlyAmounts: [200000, 300000, 0], changePercent: -100, direction: 'decreasing', averageMonthly: 166667 },
      ],
      topGrowingCategories: [],
      topShrinkingCategories: [
        { category: 'Ăn uống', monthlyAmounts: [500000, 800000, 0], changePercent: -100, direction: 'decreasing', averageMonthly: 433333 },
        { category: 'Di chuyển', monthlyAmounts: [200000, 300000, 0], changePercent: -100, direction: 'decreasing', averageMonthly: 166667 },
      ],
      generatedAt: '2026-04-01T10:00:00.000Z',
    };

    return report;
  }

  describe('workbook structure', () => {
    it('should have N+1 sheets for N months', async () => {
      const report = buildFixture();
      const buffer = await service.generate(report);
      const workbook = await parseWorkbook(buffer);

      // 3 months → 4 sheets (1 overview + 3 monthly)
      expect(workbook.worksheets.length).toBe(report.monthsCount + 1);
    });

    it('should have first sheet named "Tổng quan"', async () => {
      const report = buildFixture();
      const buffer = await service.generate(report);
      const workbook = await parseWorkbook(buffer);

      expect(workbook.worksheets[0].name).toBe('Tổng quan');
    });

    it('should have monthly sheets named T{M}-{YYYY} in chronological order', async () => {
      const report = buildFixture();
      const buffer = await service.generate(report);
      const workbook = await parseWorkbook(buffer);

      // Sheets after overview should be T1-2026, T2-2026, T3-2026
      expect(workbook.worksheets[1].name).toBe('T1-2026');
      expect(workbook.worksheets[2].name).toBe('T2-2026');
      expect(workbook.worksheets[3].name).toBe('T3-2026');
    });

    it('should have no sheet name exceeding 31 characters', async () => {
      const report = buildFixture();
      const buffer = await service.generate(report);
      const workbook = await parseWorkbook(buffer);

      for (const worksheet of workbook.worksheets) {
        expect(worksheet.name.length).toBeLessThanOrEqual(31);
      }
    });
  });

  describe('overview tab', () => {
    it('should contain summary statistics', async () => {
      const report = buildFixture();
      const buffer = await service.generate(report);
      const workbook = await parseWorkbook(buffer);
      const overview = workbook.worksheets[0];

      // Collect all cell values to search for expected content
      const allValues: string[] = [];
      overview.eachRow((row) => {
        row.eachCell((cell) => {
          allValues.push(String(cell.value ?? ''));
        });
      });
      const joined = allValues.join('|');

      // Report title
      expect(joined).toContain('BÁO CÁO XU HƯỚNG CHI TIÊU');

      // Summary stat labels
      expect(joined).toContain('Tổng chi tiêu');
      expect(joined).toContain('Trung bình/tháng');
      expect(joined).toContain('Tháng cao nhất');
      expect(joined).toContain('Tháng thấp nhất');
      expect(joined).toContain('Xu hướng chung');
      expect(joined).toContain('Thay đổi');

      // VND formatted values
      expect(joined).toContain('1.950.000 ₫');
      expect(joined).toContain('650.000 ₫');
    });
  });

  describe('monthly tabs', () => {
    it('should contain transaction tables with correct column headers', async () => {
      const report = buildFixture();
      const buffer = await service.generate(report);
      const workbook = await parseWorkbook(buffer);

      // Check T2-2026 (has transactions)
      const monthSheet = workbook.worksheets[2]; // T2-2026

      const allValues: string[] = [];
      monthSheet.eachRow((row) => {
        row.eachCell((cell) => {
          allValues.push(String(cell.value ?? ''));
        });
      });
      const joined = allValues.join('|');

      // Transaction table headers
      expect(joined).toContain('STT');
      expect(joined).toContain('Ngày');
      expect(joined).toContain('Danh mục');
      expect(joined).toContain('Ghi chú');
      expect(joined).toContain('Số tiền');

      // Category breakdown headers
      expect(joined).toContain('Danh mục');
      expect(joined).toContain('Số tiền');
    });

    it('should produce valid sheet with headers only for months with no transactions', async () => {
      const report = buildFixture();
      const buffer = await service.generate(report);
      const workbook = await parseWorkbook(buffer);

      // T3-2026 has no transactions
      const emptyMonthSheet = workbook.worksheets[3];

      // Should have transaction table headers but no data rows after them
      let transactionHeaderRow = 0;
      emptyMonthSheet.eachRow((row, rowNumber) => {
        if (String(row.getCell(1).value) === 'STT') {
          transactionHeaderRow = rowNumber;
        }
      });

      // Transaction headers should exist
      expect(transactionHeaderRow).toBeGreaterThan(0);

      // The row after headers should be empty (no transaction data)
      const nextRow = emptyMonthSheet.getRow(transactionHeaderRow + 1);
      // STT column should not have a numeric value (no data row)
      const sttValue = nextRow.getCell(1).value;
      expect(sttValue === null || sttValue === undefined || sttValue === '').toBeTruthy();
    });
  });
});
