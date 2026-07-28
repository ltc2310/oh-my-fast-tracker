import { formatVND } from '../../src/application/services/vnd-formatter';

describe('formatVND', () => {
  it('formats zero as "0 ₫"', () => {
    expect(formatVND(0)).toBe('0 ₫');
  });

  it('formats small integers without separator', () => {
    expect(formatVND(999)).toBe('999 ₫');
  });

  it('formats thousands with period separator', () => {
    expect(formatVND(1000)).toBe('1.000 ₫');
    expect(formatVND(50000)).toBe('50.000 ₫');
  });

  it('formats millions with multiple period separators', () => {
    expect(formatVND(1234567)).toBe('1.234.567 ₫');
  });

  it('rounds decimal amounts to whole number', () => {
    expect(formatVND(1234.56)).toBe('1.235 ₫');
    expect(formatVND(1234.4)).toBe('1.234 ₫');
    expect(formatVND(0.5)).toBe('1 ₫');
    expect(formatVND(0.4)).toBe('0 ₫');
  });

  it('handles negative amounts', () => {
    expect(formatVND(-5000)).toBe('-5.000 ₫');
  });

  it('handles large amounts', () => {
    expect(formatVND(1000000000)).toBe('1.000.000.000 ₫');
  });
});
