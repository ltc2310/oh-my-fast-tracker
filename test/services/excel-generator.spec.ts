import * as ExcelJS from 'exceljs';
import { ExcelGeneratorService } from '../../src/application/services/ExcelGeneratorService';
import { WeeklySummary } from '../../src/domain/entities/WeeklySummary';

describe('ExcelGeneratorService', () => {
  let service: ExcelGeneratorService;

  beforeEach(() => {
    service = new ExcelGeneratorService();
  });

  async function parseWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    // Type assertion needed due to Buffer type mismatch between Node.js and ExcelJS typings
    await workbook.xlsx.load(buffer as never);
    return workbook;
  }

  describe('header section', () => {
    it('should have title "BÁO CÁO CHI TIÊU" in row 1 with bold 16pt centered', async () => {
      const summary: WeeklySummary = {
        total: 0,
        byCategory: [],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];
      const titleCell = worksheet.getCell('A1');

      expect(titleCell.value).toBe('BÁO CÁO CHI TIÊU');
      expect(titleCell.font?.bold).toBe(true);
      expect(titleCell.font?.size).toBe(16);
      expect(titleCell.alignment?.horizontal).toBe('center');
    });

    it('should have date range in row 2 with italic 11pt centered', async () => {
      const summary: WeeklySummary = {
        total: 0,
        byCategory: [],
        transactions: [],
        from: new Date('2024-03-15'),
        to: new Date('2024-03-21'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-03-15'),
        to: new Date('2024-03-21'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];
      const dateCell = worksheet.getCell('A2');

      expect(dateCell.value).toBe('Từ 15/03/2024 đến 21/03/2024');
      expect(dateCell.font?.italic).toBe(true);
      expect(dateCell.font?.size).toBe(11);
      expect(dateCell.alignment?.horizontal).toBe('center');
    });

    it('should have generation date in row 3 with italic 11pt centered', async () => {
      const summary: WeeklySummary = {
        total: 0,
        byCategory: [],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];
      const genDateCell = worksheet.getCell('A3');
      const value = genDateCell.value as string;

      expect(value).toMatch(/^Ngày xuất: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
      expect(genDateCell.font?.italic).toBe(true);
      expect(genDateCell.font?.size).toBe(11);
      expect(genDateCell.alignment?.horizontal).toBe('center');
    });

    it('should have empty row 4 as separator', async () => {
      const summary: WeeklySummary = {
        total: 0,
        byCategory: [],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];
      const row4 = worksheet.getRow(4);

      expect(row4.getCell(1).value).toBeNull();
    });
  });

  describe('summary section', () => {
    it('should have "TỔNG QUAN" header with bold 13pt', async () => {
      const summary: WeeklySummary = {
        total: 1500000,
        byCategory: [{ category: 'Ăn uống', total: 1500000 }],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];
      const sectionHeader = worksheet.getCell('A5');

      expect(sectionHeader.value).toBe('TỔNG QUAN');
      expect(sectionHeader.font?.bold).toBe(true);
      expect(sectionHeader.font?.size).toBe(13);
    });

    it('should display total spending formatted as VND', async () => {
      const summary: WeeklySummary = {
        total: 1234567,
        byCategory: [{ category: 'Ăn uống', total: 1234567 }],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];
      const totalCell = worksheet.getCell('A6');

      expect(totalCell.value).toBe('Tổng chi tiêu: 1.234.567 ₫');
    });

    it('should display category table sorted descending by amount', async () => {
      const summary: WeeklySummary = {
        total: 3000000,
        byCategory: [
          { category: 'Di chuyển', total: 500000 },
          { category: 'Ăn uống', total: 2000000 },
          { category: 'Mua sắm', total: 500000 },
        ],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];

      // Row 8 is category table header (row5=TỔNG QUAN, row6=total, row7=empty, row8=header)
      expect(worksheet.getCell('A8').value).toBe('Danh mục');
      expect(worksheet.getCell('B8').value).toBe('Số tiền');

      // First data row should be highest amount
      expect(worksheet.getCell('A9').value).toBe('Ăn uống');
      expect(worksheet.getCell('B9').value).toBe('2.000.000 ₫');

      // Next rows
      expect(worksheet.getCell('A10').value).toBe('Di chuyển');
      expect(worksheet.getCell('B10').value).toBe('500.000 ₫');
    });

    it('should handle empty categories with 0 ₫ total', async () => {
      const summary: WeeklySummary = {
        total: 0,
        byCategory: [],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];

      // Total should show 0 ₫
      expect(worksheet.getCell('A6').value).toBe('Tổng chi tiêu: 0 ₫');

      // Category table header should exist
      expect(worksheet.getCell('A8').value).toBe('Danh mục');
      expect(worksheet.getCell('B8').value).toBe('Số tiền');

      // No data rows after header
      expect(worksheet.getCell('A9').value).toBeNull();
    });
  });

  describe('transactions section', () => {
    it('should sort transactions descending by date with sequential STT', async () => {
      const summary: WeeklySummary = {
        total: 300000,
        byCategory: [{ category: 'Ăn uống', total: 300000 }],
        transactions: [
          {
            userId: 'user1',
            amount: 100000,
            category: 'Ăn uống',
            note: 'Oldest',
            spentAt: new Date('2024-01-01'),
          },
          {
            userId: 'user1',
            amount: 100000,
            category: 'Ăn uống',
            note: 'Newest',
            spentAt: new Date('2024-01-07'),
          },
          {
            userId: 'user1',
            amount: 100000,
            category: 'Ăn uống',
            note: 'Middle',
            spentAt: new Date('2024-01-04'),
          },
        ],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];

      // Find the transaction table header row (STT)
      let headerRowNum = 0;
      worksheet.eachRow((row, rowNumber) => {
        if (String(row.getCell(1).value) === 'STT') {
          headerRowNum = rowNumber;
        }
      });
      expect(headerRowNum).toBeGreaterThan(0);

      // STT 1 should have the most recent date (07/01/2024)
      const row1 = worksheet.getRow(headerRowNum + 1);
      expect(row1.getCell(1).value).toBe(1);
      expect(row1.getCell(2).value).toBe('07/01/2024');
      expect(row1.getCell(4).value).toBe('Newest');

      // STT 2 should have the middle date (04/01/2024)
      const row2 = worksheet.getRow(headerRowNum + 2);
      expect(row2.getCell(1).value).toBe(2);
      expect(row2.getCell(2).value).toBe('04/01/2024');
      expect(row2.getCell(4).value).toBe('Middle');

      // STT 3 should have the oldest date (01/01/2024)
      const row3 = worksheet.getRow(headerRowNum + 3);
      expect(row3.getCell(1).value).toBe(3);
      expect(row3.getCell(2).value).toBe('01/01/2024');
      expect(row3.getCell(4).value).toBe('Oldest');
    });

    it('should produce valid workbook with 0 ₫ in Tổng cộng row when transactions are empty', async () => {
      const summary: WeeklySummary = {
        total: 0,
        byCategory: [],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];

      // Find the "Tổng cộng" row
      let totalRowNum = 0;
      worksheet.eachRow((row, rowNumber) => {
        if (String(row.getCell(4).value) === 'Tổng cộng') {
          totalRowNum = rowNumber;
        }
      });
      expect(totalRowNum).toBeGreaterThan(0);

      const totalRow = worksheet.getRow(totalRowNum);
      expect(totalRow.getCell(4).value).toBe('Tổng cộng');
      expect(totalRow.getCell(5).value).toBe('0 ₫');
      expect(totalRow.getCell(4).font?.bold).toBe(true);
      expect(totalRow.getCell(5).font?.bold).toBe(true);
    });
  });

  describe('pie chart section', () => {
    it('should include "BIỂU ĐỒ PHÂN BỔ" section when categories >= 2', async () => {
      const summary: WeeklySummary = {
        total: 3000000,
        byCategory: [
          { category: 'Ăn uống', total: 2000000 },
          { category: 'Di chuyển', total: 1000000 },
        ],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];

      // Find "BIỂU ĐỒ PHÂN BỔ" cell
      let chartHeaderRowNum = 0;
      worksheet.eachRow((row, rowNumber) => {
        if (String(row.getCell(1).value) === 'BIỂU ĐỒ PHÂN BỔ') {
          chartHeaderRowNum = rowNumber;
        }
      });
      expect(chartHeaderRowNum).toBeGreaterThan(0);

      // Verify percentage labels in subsequent rows
      const label1 = String(
        worksheet.getRow(chartHeaderRowNum + 1).getCell(1).value,
      );
      const label2 = String(
        worksheet.getRow(chartHeaderRowNum + 2).getCell(1).value,
      );

      expect(label1).toMatch(/Ăn uống 67%/);
      expect(label2).toMatch(/Di chuyển 33%/);
    });

    it('should omit "BIỂU ĐỒ PHÂN BỔ" section when categories < 2', async () => {
      const summary: WeeklySummary = {
        total: 1000000,
        byCategory: [{ category: 'Ăn uống', total: 1000000 }],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      const workbook = await parseWorkbook(buffer);
      const worksheet = workbook.worksheets[0];

      // Verify no cell contains "BIỂU ĐỒ PHÂN BỔ"
      let found = false;
      worksheet.eachRow((row) => {
        if (String(row.getCell(1).value) === 'BIỂU ĐỒ PHÂN BỔ') {
          found = true;
        }
      });
      expect(found).toBe(false);
    });
  });

  describe('buffer output', () => {
    it('should return a valid Buffer', async () => {
      const summary: WeeklySummary = {
        total: 100000,
        byCategory: [{ category: 'Test', total: 100000 }],
        transactions: [],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      };

      const buffer = await service.generate(summary, {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-07'),
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
