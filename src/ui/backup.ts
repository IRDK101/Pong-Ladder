// Back up / restore all local data as JSON: copy-paste (works everywhere) or file download/upload.

import type { AppStore } from '../data/storage';
import { h, type Overlay } from './dom';

export function showBackup(overlay: Overlay, store: AppStore, onClose: () => void, note = ''): void {
  const json = store.exportJson();
  const out = h('textarea', { id: 'backup-out', readonly: true, 'aria-label': 'Backup JSON' }, json);
  const status = h('p', { class: note.startsWith('Restore failed') ? 'error' : 'ok' }, note);
  const counts = `${store.characters.list().length} characters · ${store.matches.list().length} matches`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      status.textContent = 'Copied. Paste it somewhere safe.';
      status.className = 'ok';
    } catch {
      out.focus();
      out.select();
      status.textContent = 'Copy was blocked here. The text is selected: press Ctrl+C (Cmd+C on Mac).';
      status.className = 'dim';
    }
  };
  const filename = `pong-zimulator-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const download = async () => {
    // Inside the claude.ai viewer, files go through its own save prompt; elsewhere, a plain download.
    const claude = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
    const dl = claude?.use ? ((await claude.use('downloads').catch(() => null)) as { save(r: { filename: string; data: string }): Promise<unknown> } | null) : null;
    if (dl) {
      try {
        await dl.save({ filename, data: json });
        status.textContent = 'Saved the backup file.';
        status.className = 'ok';
      } catch (e) {
        const code = (e as { code?: string }).code;
        status.textContent = code === 'declined' ? 'Download cancelled.' : 'The download did not work here. Use Copy backup instead.';
        status.className = 'dim';
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const input = h('textarea', { id: 'backup-in', placeholder: 'Paste a backup here', 'aria-label': 'Paste a backup' });
  const restore = (text: string) => {
    try {
      const r = store.importJson(text);
      const bits = [`${r.characters} new characters`, `${r.matches} new matches`];
      const skipped = r.skipped.length ? ` Skipped ${r.skipped.length}: ${r.skipped.join('; ')}` : '';
      showBackup(overlay, store, onClose, `Restored: ${bits.join(', ')}.${skipped}`);
    } catch (e) {
      showBackup(overlay, store, onClose, `Restore failed: ${(e as Error).message}`);
    }
  };
  const file = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    'aria-label': 'Restore from a backup file',
    onchange: async (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) restore(await f.text());
    },
  });

  overlay.show(
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'row spread' }, h('h1', {}, 'Back up and restore'), h('button', { onclick: onClose }, 'Back to menu')),
      h('p', { class: 'dim' }, `This browser holds ${counts}. Signed-in players' levels and unlocks are also saved online; a backup moves everything else (characters you made here, players, match history) to another browser.`),
      note ? status : null,
      h('div', { class: 'box', style: 'display:flex;flex-direction:column;gap:10px' }, h('h2', {}, 'Back up'), out, h('div', { class: 'row' }, h('button', { class: 'primary', onclick: copy }, 'Copy backup'), h('button', { onclick: download }, 'Download file')), note ? null : status),
      h(
        'div',
        { class: 'box', style: 'display:flex;flex-direction:column;gap:10px' },
        h('h2', {}, 'Restore'),
        h('p', { class: 'dim' }, 'Restoring adds to what is here. Records with the same id are replaced by the backup copy.'),
        input,
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => restore(input.value) }, 'Restore pasted backup'), h('span', { class: 'dim' }, 'or'), file),
      ),
    ),
  );
}
