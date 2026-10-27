import { Fragment, useMemo, useState } from 'react';
import { discordEmojiUrl, splitEmojiText, type EmojiPart } from './emoji-text';
import { useEmojiReducedMotion } from './emoji-motion';
import { urlTwemoji } from './twemoji';
import './emoji-ui.css';

function UnicodeEmoji({ value, size }: { value: string; size: number }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="ms-emoji-fallback">{value}</span> : <img className="ms-emoji-image" src={urlTwemoji(value)} alt={value} width={size} height={size} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />;
}

function CustomEmoji({ part, size }: { part: Extract<EmojiPart, { kind: 'discord' }>; size: number }) {
  const reduced = useEmojiReducedMotion();
  const [failed, setFailed] = useState(false);
  return failed ? <span className="ms-emoji-fallback" title={part.value}>:{part.name}:</span> : <img className="ms-emoji-image" src={discordEmojiUrl(part.id, part.animated && !reduced)} alt={`:${part.name}:`} title={`:${part.name}:`} width={size} height={size} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />;
}

/** Conserva el texto y deja a React escaparlo. No admite HTML, scripts ni URLs de imágenes arbitrarias. */
export function EmojiText({ text, className, size = 20 }: { text: string; className?: string; size?: number }) {
  const parts = useMemo(() => splitEmojiText(text), [text]);
  const dimension = Number.isFinite(size) ? Math.max(12, Math.min(64, size)) : 20;
  return <span className={`ms-emoji-text${className ? ` ${className}` : ''}`}>{parts.map((part, index) => <Fragment key={`${index}:${part.value}`}>
    {part.kind === 'text' ? part.value : part.kind === 'unicode' ? <UnicodeEmoji value={part.value} size={dimension} /> : <CustomEmoji part={part} size={dimension} />}
  </Fragment>)}</span>;
}
