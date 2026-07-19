import { describe, it, expect } from 'vitest';
import { validatePercentages, calculateShare, calculateDustAllocation, formatCurrency } from '../utils/math';

describe('SplitCast Pure Logic Tests', () => {
  describe('validatePercentages', () => {
    it('should validate when sum is exactly 100', () => {
      expect(validatePercentages([50, 50])).toBe(true);
      expect(validatePercentages([70, 20, 10])).toBe(true);
      expect(validatePercentages([33.33, 33.33, 33.34])).toBe(true);
    });

    it('should fail when sum is not 100', () => {
      expect(validatePercentages([50, 49])).toBe(false);
      expect(validatePercentages([60, 20, 10])).toBe(false);
      expect(validatePercentages([])).toBe(false);
    });
  });

  describe('calculateShare', () => {
    it('should calculate standard share without rounding issues', () => {
      expect(calculateShare(100, 5000)).toBe(50); // 50% of 100
      expect(calculateShare(250, 2000)).toBe(50); // 20% of 250
    });

    it('should truncate precision to 4 decimal places', () => {
      // 33.33% of 10
      expect(calculateShare(10, 3333)).toBe(3.333);
    });
  });

  describe('calculateDustAllocation', () => {
    it('should allocate 50/50 exactly', () => {
      const shares = [5000, 5000];
      const distribution = calculateDustAllocation(100, shares);
      expect(distribution).toEqual([50, 50]);
    });

    it('should route rounding dust to the last recipient', () => {
      const sharesBps = [7000, 2000, 1000]; // 70/20/10 split
      // 99 * 70% = 69.3 -> 69.3
      // 99 * 20% = 19.8 -> 19.8
      // Last gets: 99 - (69.3 + 19.8) = 99 - 89.1 = 9.9
      // (Standard BPS cut without dust would have been 99 * 10% = 9.9, so no dust in this case)
      expect(calculateDustAllocation(99, sharesBps)).toEqual([69.3, 19.8, 9.9]);

      // Uneven division producing dust:
      // Amount = 10
      // Split = 3333, 3333, 3334 (33.33%, 33.33%, 33.34%)
      // Recipient 1: 10 * 0.3333 = 3.333
      // Recipient 2: 10 * 0.3333 = 3.333
      // Recipient 3 (last): 10 - (3.333 + 3.333) = 3.334
      const unevenShares = [3333, 3333, 3334];
      expect(calculateDustAllocation(10, unevenShares)).toEqual([3.333, 3.333, 3.334]);
    });
  });

  describe('formatCurrency', () => {
    it('should format numbers with exactly 4 decimal places', () => {
      expect(formatCurrency(100.5)).toBe('100.5000');
      expect(formatCurrency(0)).toBe('0.0000');
      expect(formatCurrency(12.345678)).toBe('12.3457'); // rounds up last digit
    });
  });
});
