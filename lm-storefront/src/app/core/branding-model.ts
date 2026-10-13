function luminance(color: string): number {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : '234d46';
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}

export function contrastRatio(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
}

export function brandContrast(color: string): string {
  return contrastRatio(color, '#000000') >= contrastRatio(color, '#ffffff') ? '#000000' : '#ffffff';
}

function readableDarkColor(color: string, surface: string, minimum: number): string {
  const original = /^#[0-9a-f]{6}$/i.test(color) ? color : '#234d46';
  for (let step = 0; step <= 20; step++) {
    const weight = step / 20;
    const hex = [1,3,5].map(offset => {
      const channel = parseInt(original.slice(offset, offset + 2),16);
      return Math.round(channel + (255 - channel) * weight).toString(16).padStart(2,'0');
    }).join('');
    const candidate = '#' + hex;
    if (contrastRatio(candidate, surface) >= minimum) return candidate;
  }
  return '#ffffff';
}

export function brandSurfaceColor(color: string, mode: 'light' | 'dark' = 'light'): string {
  return mode === 'dark' ? readableDarkColor(color, '#1c2420', 3) : color;
}

export function brandTextColor(color: string, mode: 'light' | 'dark' = 'light'): string {
  if (mode === 'dark') return readableDarkColor(color, '#242e28', 4.5);
  return brandContrast(color) === '#ffffff' ? color : '#191f1d';
}
