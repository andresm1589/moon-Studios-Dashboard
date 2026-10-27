// Status and role colors remain recognizable, with a readable ink in each theme.
// Keep the original hex for charts, translucent fills and saved project colors.
const inks: Record<string, string> = {
  '#34d399': 'green', '#4ade80': 'green', '#22c55e': 'green', '#10b981': 'green', '#3ecf8e': 'green',
  '#60a5fa': 'blue', '#3b82f6': 'blue', '#3178c6': 'blue', '#818cf8': 'indigo', '#a5b4fc': 'indigo', '#6366f1': 'indigo', '#646cff': 'indigo', '#5865f2': 'indigo',
  '#a78bfa': 'purple', '#c084fc': 'purple', '#8b5cf6': 'purple',
  '#f472b6': 'pink', '#ec4899': 'pink', '#f43f5e': 'pink',
  '#f59e0b': 'amber', '#fbbf24': 'amber', '#facc15': 'amber', '#eab308': 'amber',
  '#fb923c': 'orange', '#f97316': 'orange',
  '#f87171': 'red', '#ef4444': 'red', '#fca5a5': 'red',
  '#38bdf8': 'cyan', '#22d3ee': 'cyan', '#61dafb': 'cyan', '#06b6d4': 'cyan', '#14b8a6': 'cyan', '#0ea5e9': 'cyan',
  '#94a3b8': 'slate', '#9ca3af': 'slate', '#6b7280': 'slate', '#64748b': 'slate',
};

export function panelInk(color?: string): string | undefined {
  if (!color) return color;
  if (color.startsWith('var(--accent-user')) return 'var(--accent-user-ink, var(--moon-ink))';
  const tone = inks[color.toLowerCase()];
  return tone ? `var(--moon-tone-${tone})` : color;
}
