import {
  formatExportFilename,
  formatTrendExportFilename,
} from '../../src/application/services/filename-formatter';

describe('formatExportFilename', () => {
  it('should format dates with zero-padded day and month', () => {
    const from = new Date(2024, 0, 5); // Jan 5, 2024
    const to = new Date(2024, 0, 11); // Jan 11, 2024
    expect(formatExportFilename(from, to)).toBe(
      'bao-cao-chi-tieu-05-01-2024-11-01-2024.xlsx',
    );
  });

  it('should handle double-digit day and month without extra padding', () => {
    const from = new Date(2024, 11, 15); // Dec 15, 2024
    const to = new Date(2024, 11, 21); // Dec 21, 2024
    expect(formatExportFilename(from, to)).toBe(
      'bao-cao-chi-tieu-15-12-2024-21-12-2024.xlsx',
    );
  });

  it('should produce .xlsx extension', () => {
    const from = new Date(2025, 5, 1);
    const to = new Date(2025, 5, 7);
    expect(formatExportFilename(from, to)).toMatch(/\.xlsx$/);
  });

  it('should include bao-cao-chi-tieu prefix', () => {
    const from = new Date(2025, 0, 1);
    const to = new Date(2025, 0, 7);
    expect(formatExportFilename(from, to)).toMatch(/^bao-cao-chi-tieu-/);
  });
});

describe('formatTrendExportFilename', () => {
  it('should return correct pattern with userId, periodStart, and periodEnd', () => {
    expect(formatTrendExportFilename('user123', '2024-01', '2024-06')).toBe(
      'bao-cao-xu-huong-user123-2024-01-2024-06.xlsx',
    );
  });

  it('should produce .xlsx extension', () => {
    expect(formatTrendExportFilename('abc', '2025-01', '2025-03')).toMatch(
      /\.xlsx$/,
    );
  });

  it('should include bao-cao-xu-huong prefix', () => {
    expect(formatTrendExportFilename('u1', '2024-06', '2024-12')).toMatch(
      /^bao-cao-xu-huong-/,
    );
  });

  it('should embed the userId between prefix and period dates', () => {
    const result = formatTrendExportFilename('myuser', '2024-01', '2024-06');
    expect(result).toBe('bao-cao-xu-huong-myuser-2024-01-2024-06.xlsx');
  });
});
