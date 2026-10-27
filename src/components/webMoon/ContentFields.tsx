import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { fieldLabel, newEntry, type ContentValue, type ContentPath } from './fieldHelpers';

type Props = {
  value: ContentValue;
  defaults?: ContentValue;
  path?: ContentPath;
  onChange: (path: ContentPath, value: ContentValue) => void;
  disabled?: boolean;
};

export function ContentFields({ value, defaults, path = [], onChange, disabled }: Props) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return <div className="mc-fields">{Object.entries(value).map(([key, current]) => {
    if (key === 'id' || key === 'schemaVersion' || key === 'version') return null;
    const nestedPath = [...path, key];
    const name = fieldLabel(key);
    const defaultValue = defaults && typeof defaults === 'object' && !Array.isArray(defaults) ? defaults[key] : undefined;
    const inputId = `moon-field-${nestedPath.join('-')}`;
    if (Array.isArray(current)) {
      const template = Array.isArray(defaultValue) ? defaultValue[0] : current[0];
      const fixed = key === 'sections' || key === 'sectionOrder';
      return <fieldset className="mc-collection" key={key}>
        <legend>{name} <span>{current.length}</span></legend>
        {current.map((item, index) => {
          const object = item && typeof item === 'object' && !Array.isArray(item) ? item : null;
          const summary = object ? String(object.title || object.name || object.label || object.question || object.author || object.id || `Elemento ${index + 1}`) : String(item || `Elemento ${index + 1}`);
          return <div className="mc-entry" key={object?.id ? String(object.id) : `${key}-${index}`}>
            <div className="mc-entry-header"><span><i>{String(index + 1).padStart(2, '0')}</i>{fixed ? fieldLabel(summary) : summary}</span><div className="mc-entry-actions">
              <button type="button" className="mc-icon-button" title={`Subir ${summary}`} aria-label={`Subir ${summary}`} disabled={disabled || index === 0} onClick={() => { const items = [...current]; [items[index - 1], items[index]] = [items[index], items[index - 1]]; onChange(nestedPath, items); }}><ArrowUp /></button>
              <button type="button" className="mc-icon-button" title={`Bajar ${summary}`} aria-label={`Bajar ${summary}`} disabled={disabled || index === current.length - 1} onClick={() => { const items = [...current]; [items[index + 1], items[index]] = [items[index], items[index + 1]]; onChange(nestedPath, items); }}><ArrowDown /></button>
              {!fixed && <button type="button" className="mc-icon-button mc-danger" title={`Eliminar ${summary}`} aria-label={`Eliminar ${summary}`} disabled={disabled} onClick={() => { if (window.confirm(`¿Eliminar «${summary}» del contenido? Puedes recuperar el último borrador con «Descartar».`)) onChange(nestedPath, current.filter((_, i) => i !== index)); }}><Trash2 /></button>}
            </div></div>
            {object ? <ContentFields value={item} defaults={template} path={[...nestedPath, index]} onChange={onChange} disabled={disabled} /> : !fixed ? <label className="mc-field"><span>{name} {index + 1}</span><input value={String(item ?? '')} disabled={disabled} onChange={e => onChange([...nestedPath, index], e.target.value)} /></label> : null}
          </div>;
        })}
        {!current.length && <p className="mc-empty">Todavía no hay elementos. Añade el primero para mostrar esta colección.</p>}
        {!fixed && <button type="button" className="wb-btn" disabled={disabled || template === undefined || current.length >= 40} onClick={() => onChange(nestedPath, [...current, newEntry(template ?? '')])}><Plus />Añadir elemento</button>}
      </fieldset>;
    }
    if (current && typeof current === 'object') return <fieldset className="mc-group" key={key}><legend>{name}</legend><ContentFields value={current} defaults={defaultValue} path={nestedPath} onChange={onChange} disabled={disabled} /></fieldset>;
    if (typeof current === 'boolean') return <label className="mc-toggle" key={key} htmlFor={inputId}><span>{name}</span><input id={inputId} type="checkbox" checked={current} disabled={disabled} onChange={e => onChange(nestedPath, e.target.checked)} /><i aria-hidden="true" /></label>;
    const multiline = /description|text|quote|answer|bio|subtitle|body|intro|note/i.test(key);
    const isUrl = /href|url|image|logo|discord|whatsapp|canonical/i.test(key);
    return <label className={`mc-field${multiline ? ' mc-field-wide' : ''}`} key={key} htmlFor={inputId}>
      <span>{name}</span>
      {multiline ? <textarea id={inputId} value={String(current ?? '')} rows={3} maxLength={6000} disabled={disabled} onChange={e => onChange(nestedPath, e.target.value)} /> : <input id={inputId} value={String(current ?? '')} type={typeof current === 'number' ? 'number' : key === 'email' ? 'email' : 'text'} inputMode={isUrl ? 'url' : undefined} maxLength={2000} disabled={disabled} onChange={e => onChange(nestedPath, typeof current === 'number' ? Number(e.target.value) : e.target.value)} />}
      {isUrl && <small>{path[0] === 'announcement' || path[0] === 'brand' ? 'Usa una URL https:// o una ruta interna como /proyectos.' : 'Usa una URL completa como https://tu-sitio.com.'}</small>}
      {key === 'icon' && <small>Nombre del icono. Ejemplos: Code2, Palette, Bot, Globe, Sparkles.</small>}
      {key === 'repository' && <small>Formato usuario/repositorio. Ejemplo: moonstudios/mi-app.</small>}
    </label>;
  })}</div>;
}
