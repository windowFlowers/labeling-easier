export function stableId(prefix: string, parts: Array<string | number>): string {
  return `${prefix}-${parts
    .join('-')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
