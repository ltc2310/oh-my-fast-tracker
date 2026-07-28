import { formatExportFilename } from '../../src/application/services/filename-formatter';

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
