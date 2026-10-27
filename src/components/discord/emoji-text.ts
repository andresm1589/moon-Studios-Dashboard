/** Segmentos de texto, sin generar HTML ni interpretar enlaces o código. */
export type EmojiPart =
  | { kind: 'text'; value: string }
  | { kind: 'unicode'; value: string }
  | { kind: 'discord'; value: string; name: string; id: string; animated: boolean };

const base = '(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F)';
const suffix = '[\\uFE0E\\uFE0F]?\\p{Emoji_Modifier}?';
const unicode = `(?:\\p{Regional_Indicator}{2}|[#*0-9]\\uFE0F?\\u20E3|${base}${suffix}(?:\\u200D\\p{Extended_Pictographic}${suffix})*(?:[\\u{E0020}-\\u{E007E}]+\\u{E007F})?)`;
const expression = `(?:https?:\\/\\/[^\\s<>]+|\u0060\u0060\u0060[\\s\\S]*?\u0060\u0060\u0060|\u0060[^\u0060\\n]*\u0060|<a?:[A-Za-z0-9_]{2,64}:\\d{15,22}>|${unicode})`;
const discord = /^<(a?):([A-Za-z0-9_]{2,64}):(\d{15,22})>$/;

export function splitEmojiText(text: string): EmojiPart[] {
  if (!text) return [];
  const parts: EmojiPart[] = [];
  let previous = 0;
  const appendText = (value: string) => {
    if (!value) return;
    const last = parts.at(-1);
    if (last?.kind === 'text') last.value += value;
    else parts.push({ kind: 'text', value });
  };
  for (const match of text.matchAll(new RegExp(expression, 'gu'))) {
    appendText(text.slice(previous, match.index));
    const value = match[0];
    const custom = discord.exec(value);
    if (custom) parts.push({ kind: 'discord', value, animated: custom[1] === 'a', name: custom[2], id: custom[3] });
    else if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('`')) appendText(value);
    else parts.push({ kind: 'unicode', value });
    previous = match.index! + value.length;
  }
  appendText(text.slice(previous));
  return parts;
}

export function discordEmojiUrl(id: string, animated = false): string {
  return /^\d{15,22}$/.test(id) ? `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=64&quality=lossless` : '';
}

/** Respeta los límites UTF-16 de input.maxLength y nunca corta el emoji insertado. */
export function insertEmojiText(value: string, emoji: string, start = value.length, end = start, maximum?: number) {
  let from = Math.max(0, Math.min(value.length, Math.floor(Number.isFinite(start) ? start : value.length)));
  let to = Math.max(0, Math.min(value.length, Math.floor(Number.isFinite(end) ? end : from)));
  if (from > to) [from, to] = [to, from];
  if (!emoji) return { value, selectionStart: from, selectionEnd: to, inserted: false };
  const insidePair = (index: number) => index > 0 && index < value.length && /[\uD800-\uDBFF]/.test(value[index - 1]) && /[\uDC00-\uDFFF]/.test(value[index]);
  if (from === to && insidePair(from)) from = to = from + 1;
  else { if (insidePair(from)) from--; if (insidePair(to)) to++; }
  const next = value.slice(0, from) + emoji + value.slice(to);
  if (typeof maximum === 'number' && Number.isFinite(maximum) && maximum >= 0 && next.length > maximum) {
    return { value, selectionStart: from, selectionEnd: to, inserted: false };
  }
  return { value: next, selectionStart: from + emoji.length, selectionEnd: from + emoji.length, inserted: !!emoji };
}
