import { EmojiText } from '@/components/discord/EmojiText';
import React from 'react';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

/* ═══════════════════════════════
   MARKDOWN RENDERER
   Soporta: # ## ###, **bold**, *italic*, `code`, ```lang, - listas, > blockquote
═══════════════════════════════ */

const CodeBlock = ({ code, lang }: { code: string; lang: string }) => {

  // Colorización básica para JS/TS/Python/CSS/HTML/JSON
  const highlight = (text: string, language: string): React.ReactNode => {
    if (!language || language === 'text') {
      return <span className="text-zinc-300">{text}</span>;
    }

    const lines = text.split('\n');
    return lines.map((line, i) => (
      <span key={i}>
        {highlightLine(line, language)}
        {i < lines.length - 1 && '\n'}
      </span>
    ));
  };

  const highlightLine = (line: string, lang: string): React.ReactNode => {
    // Patrones en orden de prioridad
    const patterns: Array<{ regex: RegExp; className: string }> = [];

    if (['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(lang)) {
      patterns.push(
        { regex: /(\/\/.*$)/gm, className: 'text-zinc-500 italic' },
        { regex: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, className: 'text-emerald-400' },
        { regex: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|typeof|instanceof|throw|try|catch|finally|switch|case|break|continue|default|void|null|undefined|true|false|this|super|extends|implements|interface|type|enum|readonly|public|private|protected|static|abstract|declare|namespace|module|of|in|yield|get|set|as|satisfies)\b/g, className: 'text-blue-400' },
        { regex: /\b(\d+\.?\d*)\b/g, className: 'text-orange-400' },
        { regex: /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, className: 'text-yellow-300' },
      );
    } else if (['py', 'python'].includes(lang)) {
      patterns.push(
        { regex: /(#.*$)/gm, className: 'text-zinc-500 italic' },
        { regex: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, className: 'text-emerald-400' },
        { regex: /\b(def|class|return|if|elif|else|for|while|import|from|as|with|try|except|finally|raise|pass|break|continue|and|or|not|in|is|lambda|yield|async|await|True|False|None|global|nonlocal|del|assert)\b/g, className: 'text-blue-400' },
        { regex: /\b(\d+\.?\d*)\b/g, className: 'text-orange-400' },
        { regex: /([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, className: 'text-yellow-300' },
      );
    } else if (['json'].includes(lang)) {
      patterns.push(
        { regex: /("(?:[^"\\]|\\.)*")\s*:/g, className: 'text-blue-300' },
        { regex: /:\s*("(?:[^"\\]|\\.)*")/g, className: 'text-emerald-400' },
        { regex: /\b(true|false|null)\b/g, className: 'text-orange-400' },
        { regex: /\b(\d+\.?\d*)\b/g, className: 'text-orange-300' },
      );
    } else if (['css', 'scss'].includes(lang)) {
      patterns.push(
        { regex: /(\/\*[\s\S]*?\*\/)/g, className: 'text-zinc-500 italic' },
        { regex: /([.#][a-zA-Z][a-zA-Z0-9_-]*)/g, className: 'text-yellow-300' },
        { regex: /([a-zA-Z-]+)\s*:/g, className: 'text-blue-300' },
        { regex: /:\s*([^;{]+)/g, className: 'text-emerald-400' },
      );
    } else if (['html', 'xml'].includes(lang)) {
      patterns.push(
        { regex: /(&lt;\/?)([a-zA-Z][a-zA-Z0-9]*)/g, className: 'text-red-400' },
        { regex: /\s([a-zA-Z-]+)=/g, className: 'text-yellow-300' },
        { regex: /("(?:[^"\\]|\\.)*")/g, className: 'text-emerald-400' },
      );
    }

    if (patterns.length === 0) return <span className="text-zinc-300">{line}</span>;

    // Approach simple: split por keywords y strings
    const tokens = tokenizeLine(line, lang);
    return (
      <>
        {tokens.map((t, i) => (
          <span key={i} className={t.cls}>{t.text}</span>
        ))}
      </>
    );
  };

  return highlight(code, lang);
};

type Token = { text: string; cls: string };

const tokenizeLine = (line: string, lang: string): Token[] => {
  const isJsLike = ['js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx'].includes(lang);
  const isPython = ['py', 'python'].includes(lang);
  const isJson = lang === 'json';

  if (!isJsLike && !isPython && !isJson) {
    return [{ text: line, cls: 'text-zinc-300' }];
  }

  const jsKeywords = new Set(['const','let','var','function','return','if','else','for','while','class','import','export','from','async','await','new','typeof','instanceof','throw','try','catch','finally','switch','case','break','continue','default','void','null','undefined','true','false','this','super','extends','implements','interface','type','enum','readonly','public','private','protected','static','abstract','of','in','yield','get','set']);
  const pyKeywords = new Set(['def','class','return','if','elif','else','for','while','import','from','as','with','try','except','finally','raise','pass','break','continue','and','or','not','in','is','lambda','yield','async','await','True','False','None','global','nonlocal','del','assert']);

  const keywords = isJsLike ? jsKeywords : isPython ? pyKeywords : new Set<string>();

  const tokens: Token[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    // Comentario // o #
    if ((isJsLike && line[i] === '/' && line[i+1] === '/') || (isPython && line[i] === '#')) {
      tokens.push({ text: line.slice(i), cls: 'text-zinc-500 italic' });
      break;
    }

    // String
    if (line[i] === '"' || line[i] === "'" || (isJsLike && line[i] === '`')) {
      const quote = line[i];
      let j = i + 1;
      while (j < len && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      j++;
      tokens.push({ text: line.slice(i, j), cls: 'text-emerald-400' });
      i = j;
      continue;
    }

    // Número
    if (/\d/.test(line[i]) && (i === 0 || !/[a-zA-Z_$]/.test(line[i-1]))) {
      let j = i;
      while (j < len && /[\d.]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), cls: 'text-orange-400' });
      i = j;
      continue;
    }

    // Identificador / keyword
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      // Función si va seguida de (
      const afterSpaces = line.slice(j).trimStart();
      if (afterSpaces.startsWith('(') && !keywords.has(word)) {
        tokens.push({ text: word, cls: 'text-yellow-300' });
      } else if (keywords.has(word)) {
        tokens.push({ text: word, cls: 'text-blue-400' });
      } else {
        tokens.push({ text: word, cls: 'text-zinc-200' });
      }
      i = j;
      continue;
    }

    // Operador / puntuación
    if (/[{}[\]().,;:=+\-*/<>!&|?%^~]/.test(line[i])) {
      tokens.push({ text: line[i], cls: 'text-zinc-400' });
      i++;
      continue;
    }

    tokens.push({ text: line[i], cls: 'text-zinc-300' });
    i++;
  }

  return tokens;
};

const CopyButton = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-700"
    >
      {copied ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copiado</span></>
               : <><Copy className="w-3 h-3" /><span>Copiar</span></>}
    </button>
  );
};

// Parsear inline: **bold**, *italic*, `code`, ~~strike~~
const parseInline = (text: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*([\s\S]*?)\*\*/);
    // Italic
    const italicMatch = remaining.match(/^([\s\S]*?)\*([\s\S]*?)\*/);
    // Inline code
    const codeMatch = remaining.match(/^([\s\S]*?)`([^`]+)`/);
    // Strikethrough
    const strikeMatch = remaining.match(/^([\s\S]*?)~~([\s\S]*?)?~~/);

    const matches = [
      boldMatch ? { match: boldMatch, type: 'bold', start: boldMatch[1].length, end: boldMatch[1].length + boldMatch[0].length - boldMatch[1].length } : null,
      italicMatch ? { match: italicMatch, type: 'italic', start: italicMatch[1].length, end: italicMatch[1].length + italicMatch[0].length - italicMatch[1].length } : null,
      codeMatch ? { match: codeMatch, type: 'code', start: codeMatch[1].length, end: codeMatch[1].length + codeMatch[0].length - codeMatch[1].length } : null,
      strikeMatch ? { match: strikeMatch, type: 'strike', start: strikeMatch[1].length, end: strikeMatch[1].length + strikeMatch[0].length - strikeMatch[1].length } : null,
    ].filter(Boolean) as Array<{ match: RegExpMatchArray; type: string; start: number; end: number }>;

    if (matches.length === 0) {
      nodes.push(<EmojiText key={key++} text={remaining} />);
      break;
    }

    // El que aparece primero
    matches.sort((a, b) => a.start - b.start);
    const first = matches[0];

    if (first.match[1]) {
      nodes.push(<EmojiText key={key++} text={first.match[1]} />);
    }

    if (first.type === 'bold') {
      nodes.push(<strong key={key++} className="font-semibold text-white"><EmojiText text={first.match[2]} /></strong>);
    } else if (first.type === 'italic') {
      nodes.push(<em key={key++} className="italic text-zinc-300"><EmojiText text={first.match[2]} /></em>);
    } else if (first.type === 'code') {
      nodes.push(<code key={key++} className="font-mono text-xs bg-zinc-800 text-emerald-400 px-1.5 py-0.5 rounded border border-zinc-700">{first.match[2]}</code>);
    } else if (first.type === 'strike') {
      nodes.push(<span key={key++} className="line-through text-zinc-500"><EmojiText text={first.match[2]} /></span>);
    }

    remaining = remaining.slice(first.match[0].length);
  }

  return nodes;
};

export const MarkdownRenderer: React.FC<{ content: string; className?: string }> = ({ content, className = '' }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Bloque de código ```lang
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim().toLowerCase() || 'text';
      let codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // saltar el cierre ```
      const code = codeLines.join('\n');

      elements.push(
        <div key={key++} className="my-3 rounded-lg overflow-hidden border border-zinc-700/50">
          {/* Header del bloque */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700/50">
            <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">
              {lang === 'text' ? 'código' : lang}
            </span>
            <CopyButton code={code} />
          </div>
          {/* Código */}
          <pre className="bg-zinc-900 p-3 overflow-x-auto text-xs leading-relaxed font-mono">
            <CodeBlock code={code} lang={lang} />
          </pre>
        </div>
      );
      continue;
    }

    // Título # ## ###
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const classMap: Record<number, string> = {
        1: 'text-base font-semibold text-white mt-4 mb-2 pb-1.5 border-b border-zinc-800',
        2: 'text-sm font-semibold text-zinc-100 mt-3 mb-1.5',
        3: 'text-sm font-medium text-zinc-200 mt-2 mb-1',
      };
      elements.push(
        <div key={key++} className={classMap[level]}>
          {parseInline(text)}
        </div>
      );
      i++;
      continue;
    }

    // Blockquote >
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <div key={key++} className="my-2 pl-3 border-l-2 border-zinc-600 text-zinc-400 text-sm italic">
          {quoteLines.map((l, qi) => <div key={qi}>{parseInline(l)}</div>)}
        </div>
      );
      continue;
    }

    // Lista - o *
    if (/^(\s*[-*+]\s)/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^(\s*[-*+]\s)/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*+]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={key++} className="my-1.5 space-y-0.5 pl-1">
          {listItems.map((item, li) => (
            <li key={li} className="flex items-start gap-2 text-sm text-zinc-300">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-zinc-500 flex-shrink-0" />
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Lista numerada 1.
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      let numStart = parseInt(line.match(/^(\d+)/)?.[1] || '1');
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={key++} className="my-1.5 space-y-0.5 pl-1">
          {listItems.map((item, li) => (
            <li key={li} className="flex items-start gap-2 text-sm text-zinc-300">
              <span className="flex-shrink-0 text-zinc-500 text-xs font-mono mt-0.5 w-4 text-right">{numStart + li}.</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Separador ---
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={key++} className="my-3 border-zinc-800" />);
      i++;
      continue;
    }

    // Línea vacía → espacio
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    // Párrafo normal
    elements.push(
      <p key={key++} className="text-sm text-zinc-300 leading-relaxed">
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return (
    <div className={`markdown-content ${className}`}>
      {elements}
    </div>
  );
};

export default MarkdownRenderer;