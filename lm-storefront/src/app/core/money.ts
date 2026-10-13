/** Format minor units using integer arithmetic, including currencies with zero decimals. */
export function formatMinorPrice(priceMinor: number | bigint, decimals: number, currency: string): string {
  if ((typeof priceMinor === 'number' ? !Number.isSafeInteger(priceMinor) || priceMinor < 0 : priceMinor < 0n)
      || !Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    throw new Error('Invalid minor-unit price or currency decimals.');
  }
  const minor = BigInt(priceMinor);
  const scale = 10n ** BigInt(decimals);
  const whole = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 }).format(minor / scale);
  const fraction = decimals === 0 ? '' : `.${(minor % scale).toString().padStart(decimals, '0')}`;
  return `${currency} ${whole}${fraction}`;
}
