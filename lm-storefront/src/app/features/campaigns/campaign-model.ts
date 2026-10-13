export interface CampaignSlide {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
  readonly actionUrl: string;
}

export function validateCampaigns(value: unknown): readonly CampaignSlide[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error('Respuesta de campañas inválida.');
  const ids = new Set<string>();
  return value.map(row => {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(row.id) || ids.has(row.id)) throw new Error('Referencia de campaña inválida.');
    ids.add(row.id);
    for (const [key, max] of [['title', 120], ['message', 500], ['actionLabel', 80], ['actionUrl', 2048]] as const) {
      const text = row[key];
      if (typeof text !== 'string' || text.length > max || (text.length > 0 && !text.trim()) || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) throw new Error('Contenido de campaña inválido.');
    }
    if (!row.title.trim() || Boolean(row.actionLabel) !== Boolean(row.actionUrl) || (row.actionUrl && !safeCampaignUrl(row.actionUrl))) throw new Error('Enlace de campaña inválido.');
    return {id:row.id, title:row.title, message:row.message, actionLabel:row.actionLabel, actionUrl:row.actionUrl};
  });
}

export function safeCampaignUrl(value: string): boolean {
  if (/[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value, 'https://lumio.example');
    if (value.startsWith('/') && !value.startsWith('//')) return url.origin === 'https://lumio.example';
    return /^https?:\/\/[^/]/i.test(value) && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

/** Preserve the visible record when an administrator reorders the feed. */
export function campaignIndex(slides: readonly CampaignSlide[], selectedId: string | null): number {
  const index = slides.findIndex(slide => slide.id === selectedId);
  return Math.max(0, index);
}

export function nextCampaignIndex(current: number, direction: -1 | 1, size: number): number {
  if (size === 0) return 0;
  return (current + direction + size) % size;
}
