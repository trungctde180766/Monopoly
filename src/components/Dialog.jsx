import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function Dialog({ title, eyebrow, onClose, children, className = '', closeLabel = 'Đóng' }) {
  const panel = useRef(null), titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const focusable = () => [...panel.current.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter(e => e.getClientRects().length);
    (focusable()[0] || panel.current).focus();
    const onKey = event => {
      if (event.key === 'Escape' && closeRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const element = panel.current;
    element.addEventListener('keydown', onKey);
    return () => { element.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className={`game-dialog-backdrop ${className}`}>
    <section ref={panel} className="game-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="dialog-heading"><div>{eyebrow && <p className="dialog-eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div>{onClose && <button className="icon-button" onClick={onClose} aria-label={closeLabel}><X size={19} /></button>}</header>
      {children}
    </section>
  </div>;
}
