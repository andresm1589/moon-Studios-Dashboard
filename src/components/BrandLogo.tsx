import type { CSSProperties } from 'react';
import './brand-logo.css';

/** Original Moon Studios artwork, framed locally without altering its geometry. */
export function BrandLogo({
  className = '',
  variant = 'auto',
  compact = false,
  style,
}: {
  className?: string;
  variant?: 'auto' | 'light' | 'dark';
  compact?: boolean;
  style?: CSSProperties;
}) {
  return (
    <img
      src={compact ? '/brand/moon-symbol-transparent.svg' : '/brand/moon-wordmark.svg'}
      alt="Moon Studios"
      className={`moon-dashboard-brand${compact ? ' moon-dashboard-brand-symbol' : ''} ${className}`}
      data-variant={variant}
      decoding="async"
      draggable={false}
      style={style}
    />
  );
}
