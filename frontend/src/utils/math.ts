/**
 * Validates that a list of percentages sums to exactly 100%
 */
export const validatePercentages = (percentages: number[]): boolean => {
  if (percentages.length === 0) return false;
  const sum = percentages.reduce((acc, val) => acc + val, 0);
  return Math.abs(sum - 100) < 0.0001;
};

/**
 * Calculates a recipient's share based on amount and basis points
 */
export const calculateShare = (amount: number, bps: number): number => {
  return Math.floor((amount * (bps / 10000)) * 10000) / 10000;
};

/**
 * Computes split distributions, routing rounding dust to the last recipient
 */
export const calculateDustAllocation = (amount: number, sharesBps: number[]): number[] => {
  if (sharesBps.length === 0) return [];
  
  const n = sharesBps.length;
  let totalAllocated = 0;
  const distributions: number[] = [];

  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      // Last recipient gets remaining dust
      const share = amount - totalAllocated;
      distributions.push(Math.max(0, Number(share.toFixed(4))));
    } else {
      const share = Number((Math.floor((amount * (sharesBps[i] / 10000)) * 10000) / 10000).toFixed(4));
      totalAllocated += share;
      distributions.push(share);
    }
  }

  return distributions;
};

/**
 * Formats a numeric token amount with constant decimal places
 */
export const formatCurrency = (amount: number): string => {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
};
