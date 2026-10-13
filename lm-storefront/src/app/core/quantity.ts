export function validQuantity(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0;
}

export function positiveQuantity(value: string): number | null {
  return /^[1-9]\d*$/.test(value) && validQuantity(Number(value)) ? Number(value) : null;
}

export function adjustQuantity(value: string, delta: -1 | 1): string | null {
  const current = positiveQuantity(value);
  if (current === null || !validQuantity(current + delta)) return null;
  return String(current + delta);
}
