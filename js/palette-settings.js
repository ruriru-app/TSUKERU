(function (root) {
  const P = root.TSUKERUPalette;
  const COLOR_NAMES = Object.freeze({
    rose: 'ローズ', sage: 'セージ', sky: 'スカイ', stone: 'グレー',
    lilac: 'ライラック', amber: 'アンバー', mint: 'ミント', peach: 'ピーチ',
    teal: 'ティール', indigo: 'インディゴ', slate: 'スレート', cream: 'クリーム'
  });
  const SIZE_NAMES = Object.freeze({ small: '小', standard: '標準', large: '大' });

  const clone = value => structuredClone(value);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function draftEntry(index, input = {}) {
    return {
      id: typeof input.id === 'string' ? input.id : `entry-draft-${index + 1}`,
      label: typeof input.label === 'string' ? input.label : '',
      color: P.ALLOWED_COLORS.includes(input.color) ? input.color : P.ALLOWED_COLORS[index % P.ALLOWED_COLORS.length],
      score: input.score ?? null,
      action: P.ENTRY_ACTIONS.includes(input.action) ? input.action : 'mark',
      visible: input.visible === undefined ? true : Boolean(input.visible)
    };
  }

  function createDraft(palette = null, { nowIso = new Date().toISOString() } = {}) {
    if (!palette) {
      return {
        id: '', name: '新しいパレット', size: 'standard', scoringEnabled: false,
        entries: [draftEntry(0, { color: 'rose' })], preset: null,
        createdAt: nowIso, updatedAt: nowIso
      };
    }
    const source = clone(palette);
    const isPreset = Boolean(source.preset);
    return {
      id: isPreset ? '' : source.id,
      name: isPreset ? `${source.name} のコピー` : source.name,
      size: P.PALETTE_SIZES.includes(source.size) ? source.size : 'standard',
      scoringEnabled: Boolean(source.scoringEnabled),
      entries: (source.entries || []).map((entry, index) => draftEntry(index, {
        ...entry,
        id: isPreset ? '' : entry.id
      })),
      preset: null,
      createdAt: isPreset ? nowIso : source.createdAt,
      updatedAt: nowIso
    };
  }

  function editorViewModel(draft) {
    return {
      scoreFieldsVisible: Boolean(draft && draft.scoringEnabled),
      size: P.PALETTE_SIZES.includes(draft && draft.size) ? draft.size : 'standard',
      availableSizes: [...P.PALETTE_SIZES]
    };
  }

  function moveEntry(draft, index, offset) {
    const next = clone(draft);
    const target = index + offset;
    if (index < 0 || target < 0 || index >= next.entries.length || target >= next.entries.length) return next;
    [next.entries[index], next.entries[target]] = [next.entries[target], next.entries[index]];
    return next;
  }

  function addEntry(draft, input = {}) {
    const next = clone(draft);
    next.entries.push(draftEntry(next.entries.length, input));
    return next;
  }

  function removeEntry(draft, index) {
    const next = clone(draft);
    if (next.entries.length <= 1 || index < 0 || index >= next.entries.length) return next;
    next.entries.splice(index, 1);
    return next;
  }

  function validateDraft(draft) {
    const errors = [];
    if (!draft || typeof draft !== 'object') return { ok: false, errors: [{ field: 'palette', message: 'パレットが不正です' }], palette: null };
    const name = typeof draft.name === 'string' ? draft.name.trim() : '';
    if (!name) errors.push({ field: 'name', message: 'パレット名を入力してください' });
    if (!P.PALETTE_SIZES.includes(draft.size)) errors.push({ field: 'size', message: '表示サイズを選んでください' });
    if (!Array.isArray(draft.entries) || draft.entries.length === 0) errors.push({ field: 'entries', message: 'ボタンを1つ以上追加してください' });
    const labels = new Map();
    const entries = Array.isArray(draft.entries) ? draft.entries.map((entry, row) => {
      const label = typeof entry.label === 'string' ? entry.label.trim() : '';
      if (!label) errors.push({ field: 'label', row, message: '表示文字を入力してください' });
      if (label) {
        if (labels.has(label)) errors.push({ field: 'label', row, message: `表示文字「${label}」が重複しています` });
        else labels.set(label, row);
      }
      if (!P.ALLOWED_COLORS.includes(entry.color)) errors.push({ field: 'color', row, message: '候補から色を選んでください' });
      let score = entry.score;
      if (score === '' || score === null || score === undefined) score = null;
      else if (typeof score === 'string' && score.trim() !== '') score = Number(score);
      if (!(score === null || (typeof score === 'number' && Number.isFinite(score)))) {
        errors.push({ field: 'score', row, message: '点数は数値または空欄にしてください' });
        score = null;
      }
      if (!P.ENTRY_ACTIONS.includes(entry.action)) errors.push({ field: 'action', row, message: 'ボタンの動作が不正です' });
      return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : `palette-draft-entry-${row + 1}`,
        label, color: entry.color, score, action: entry.action,
        visible: entry.visible === undefined ? true : Boolean(entry.visible)
      };
    }) : [];
    if (errors.length) return { ok: false, errors, palette: null };
    try {
      const palette = P.validatePalette({
        id: draft.id || 'palette-draft-validation', name, size: draft.size,
        scoringEnabled: Boolean(draft.scoringEnabled), entries, preset: null,
        createdAt: draft.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      return { ok: true, errors: [], palette };
    } catch (error) {
      return { ok: false, errors: [{ field: 'palette', message: error.message }], palette: null };
    }
  }

  function mount(rootElement, { getPreferences, savePreferences }) {
    if (!rootElement || typeof getPreferences !== 'function' || typeof savePreferences !== 'function') {
      throw new TypeError('パレット設定画面の接続先が不正です');
    }
    let preferences = P.normalizePreferences(getPreferences());
    let selectedId = preferences.palettes[0]?.id || null;
    let draft = selectedId ? createDraft(preferences.palettes[0]) : createDraft();
    let defaultKind = '';
    let errors = [];
    let notice = '';

    function refreshPreferences(next, nextSelectedId = selectedId) {
      preferences = P.validatePreferences(next);
      savePreferences(clone(preferences));
      selectedId = nextSelectedId;
      const selected = preferences.palettes.find(item => item.id === selectedId);
      draft = selected ? createDraft(selected) : createDraft();
      defaultKind = '';
      errors = [];
      render();
    }

    function defaultBadges(paletteId) {
      const labels = { submission: '提出物', activity: '活動評価', numeric: '点数記録' };
      return Object.entries(preferences.defaultPaletteIds)
        .filter(([, id]) => id === paletteId)
        .map(([kind]) => labels[kind]);
    }

    function renderPreview() {
      const preview = rootElement.querySelector('[data-palette-preview-buttons]');
      if (!preview) return;
      preview.className = `palette-preview-buttons palette-size-${draft.size}`;
      preview.innerHTML = draft.entries.filter(entry => entry.visible !== false).map(entry => {
        const score = draft.scoringEnabled && entry.score !== '' && entry.score !== null && entry.score !== undefined
          ? `<small>${escapeHtml(entry.score)}点</small>` : '';
        return `<button type="button" data-palette-color="${escapeHtml(entry.color)}"><span>${escapeHtml(entry.label || '文字')}</span>${score}</button>`;
      }).join('') || '<p class="settings-empty">表示するボタンがありません。</p>';
    }

    function captureSimpleFields() {
      const name = rootElement.querySelector('[data-palette-name]');
      const size = rootElement.querySelector('[data-palette-size]');
      const scoring = rootElement.querySelector('[data-palette-scoring]');
      const defaultSelect = rootElement.querySelector('[data-palette-default-kind]');
      if (name) draft.name = name.value;
      if (size) draft.size = size.value;
      if (scoring) draft.scoringEnabled = scoring.checked;
      if (defaultSelect) defaultKind = defaultSelect.value;
    }

    function render() {
      const list = preferences.palettes.map(palette => {
        const badges = defaultBadges(palette.id);
        return `<article class="palette-library-item ${selectedId === palette.id ? 'selected' : ''}">
          <button type="button" class="palette-library-select" data-select-palette="${escapeHtml(palette.id)}">
            <strong>${escapeHtml(palette.name)}</strong>
            <span>${palette.scoringEnabled ? '点数連動' : '記号のみ'}・${SIZE_NAMES[palette.size]}${palette.preset ? '・プリセット' : ''}</span>
            ${badges.length ? `<small>基本：${escapeHtml(badges.join('・'))}</small>` : ''}
          </button>
          <details class="palette-item-menu"><summary aria-label="${escapeHtml(palette.name)}のメニュー">…</summary><div>
            <button type="button" data-duplicate-palette="${escapeHtml(palette.id)}">複製</button>
            ${palette.preset ? '' : `<button type="button" data-rename-palette="${escapeHtml(palette.id)}">名前変更</button><button type="button" class="danger-outline" data-delete-palette="${escapeHtml(palette.id)}">削除</button>`}
          </div></details>
        </article>`;
      }).join('');
      const rowErrors = new Map();
      errors.filter(error => Number.isInteger(error.row)).forEach(error => {
        const messages = rowErrors.get(error.row) || [];
        messages.push(error.message);rowErrors.set(error.row, messages);
      });
      const fieldErrors = errors.filter(error => !Number.isInteger(error.row)).map(error => error.message);
      const entryRows = draft.entries.map((entry, index) => `<div class="palette-entry-row" data-palette-entry="${index}">
        <label>文字<input data-entry-label value="${escapeHtml(entry.label)}" maxlength="12"></label>
        <label>色<select data-entry-color>${P.ALLOWED_COLORS.map(color => `<option value="${color}" ${entry.color === color ? 'selected' : ''}>${COLOR_NAMES[color]}</option>`).join('')}</select></label>
        ${draft.scoringEnabled ? `<label>点数<input data-entry-score inputmode="decimal" value="${entry.score ?? ''}" placeholder="空欄"></label>` : ''}
        <label class="palette-visible-check"><input type="checkbox" data-entry-visible ${entry.visible !== false ? 'checked' : ''}>表示</label>
        <div class="palette-row-actions"><button type="button" data-entry-up="${index}" aria-label="上へ" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-entry-down="${index}" aria-label="下へ" ${index === draft.entries.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-entry-remove="${index}" aria-label="削除" ${draft.entries.length === 1 ? 'disabled' : ''}>×</button></div>
        ${rowErrors.has(index) ? `<p class="palette-row-error">${escapeHtml(rowErrors.get(index).join('・'))}</p>` : ''}
      </div>`).join('');
      rootElement.innerHTML = `<div class="palette-manager">
        <section class="palette-library" aria-label="保存済みパレット">
          <button type="button" class="palette-add" data-add-palette>＋パレットを追加</button>
          <div class="palette-library-scroll">${list}</div>
        </section>
        <section class="palette-workbench">
          <div class="palette-preview"><div><h3>プレビュー</h3><span>${escapeHtml(SIZE_NAMES[draft.size] || '標準')}</span></div><div data-palette-preview-buttons></div></div>
          <form class="palette-editor">
            <div class="palette-editor-heading"><div><h3>${selectedId ? 'パレットを編集' : 'パレットを作成'}</h3><p>${preferences.palettes.find(item => item.id === selectedId)?.preset ? 'プリセットは複製して保存されます。' : '列へ適用した内容は、その列にコピーして保持されます。'}</p></div><button type="submit" class="primary">パレットを保存</button></div>
            <div class="palette-editor-basics">
              <label>パレット名<input data-palette-name value="${escapeHtml(draft.name)}"></label>
              <label>ボタンの大きさ<select data-palette-size>${P.PALETTE_SIZES.map(size => `<option value="${size}" ${draft.size === size ? 'selected' : ''}>${SIZE_NAMES[size]}</option>`).join('')}</select></label>
              <label>基本として使う<select data-palette-default-kind><option value="">変更しない</option><option value="submission" ${defaultKind === 'submission' ? 'selected' : ''}>提出物</option><option value="activity" ${defaultKind === 'activity' ? 'selected' : ''}>活動評価</option><option value="numeric" ${defaultKind === 'numeric' ? 'selected' : ''}>点数記録</option></select></label>
              <label class="palette-score-switch"><input type="checkbox" data-palette-scoring ${draft.scoringEnabled ? 'checked' : ''}>点数と連動する</label>
            </div>
            <div class="palette-entry-list">${entryRows}</div>
            <button type="button" data-add-entry>＋ボタンを追加</button>
            ${fieldErrors.length ? `<p class="settings-message">${escapeHtml(fieldErrors.join('・'))}</p>` : ''}
            ${notice ? `<p class="palette-notice" role="status">${escapeHtml(notice)}</p>` : ''}
          </form>
        </section>
      </div>`;
      renderPreview();

      rootElement.querySelector('[data-add-palette]').addEventListener('click', () => {
        selectedId = null;draft = createDraft();defaultKind = '';errors = [];notice = '';render();
      });
      rootElement.querySelectorAll('[data-select-palette]').forEach(button => button.addEventListener('click', () => {
        selectedId = button.dataset.selectPalette;
        draft = createDraft(preferences.palettes.find(item => item.id === selectedId));
        defaultKind = '';errors = [];notice = '';render();
      }));
      rootElement.querySelectorAll('[data-duplicate-palette]').forEach(button => button.addEventListener('click', () => {
        const result = P.duplicatePalette(preferences, button.dataset.duplicatePalette);
        notice = '複製したパレットを選択しました。';refreshPreferences(result.preferences, result.paletteId);
      }));
      rootElement.querySelectorAll('[data-rename-palette]').forEach(button => button.addEventListener('click', () => {
        const palette = preferences.palettes.find(item => item.id === button.dataset.renamePalette);
        const name = root.prompt('新しいパレット名を入力してください', palette.name);
        if (name === null) return;
        try { refreshPreferences(P.updateUserPalette(preferences, palette.id, { name }), palette.id); }
        catch (error) { root.alert(error.message); }
      }));
      rootElement.querySelectorAll('[data-delete-palette]').forEach(button => button.addEventListener('click', () => {
        const palette = preferences.palettes.find(item => item.id === button.dataset.deletePalette);
        if (!root.confirm(`「${palette.name}」を削除します。すでに列へ適用した内容は残ります。必要な場合は、手動バックアップを「設定 → クラス設定 → バックアップから復元」で戻せます。続けますか？`)) return;
        const next = P.deleteUserPalette(preferences, palette.id);
        refreshPreferences(next, next.palettes[0]?.id || null);
      }));
      rootElement.querySelector('[data-palette-name]').addEventListener('input', event => { draft.name = event.target.value; });
      rootElement.querySelector('[data-palette-size]').addEventListener('change', event => { captureSimpleFields();draft.size = event.target.value;render(); });
      rootElement.querySelector('[data-palette-default-kind]').addEventListener('change', event => { defaultKind = event.target.value; });
      rootElement.querySelector('[data-palette-scoring]').addEventListener('change', event => { captureSimpleFields();draft.scoringEnabled = event.target.checked;render(); });
      rootElement.querySelectorAll('[data-palette-entry]').forEach(row => {
        const index = Number(row.dataset.paletteEntry);
        row.querySelector('[data-entry-label]').addEventListener('input', event => { draft.entries[index].label = event.target.value;renderPreview(); });
        row.querySelector('[data-entry-color]').addEventListener('change', event => { draft.entries[index].color = event.target.value;renderPreview(); });
        row.querySelector('[data-entry-score]')?.addEventListener('input', event => { draft.entries[index].score = event.target.value;renderPreview(); });
        row.querySelector('[data-entry-visible]').addEventListener('change', event => { draft.entries[index].visible = event.target.checked;renderPreview(); });
      });
      rootElement.querySelectorAll('[data-entry-up]').forEach(button => button.addEventListener('click', () => { captureSimpleFields();draft = moveEntry(draft, Number(button.dataset.entryUp), -1);render(); }));
      rootElement.querySelectorAll('[data-entry-down]').forEach(button => button.addEventListener('click', () => { captureSimpleFields();draft = moveEntry(draft, Number(button.dataset.entryDown), 1);render(); }));
      rootElement.querySelectorAll('[data-entry-remove]').forEach(button => button.addEventListener('click', () => { captureSimpleFields();draft = removeEntry(draft, Number(button.dataset.entryRemove));render(); }));
      rootElement.querySelector('[data-add-entry]').addEventListener('click', () => { captureSimpleFields();draft = addEntry(draft);render(); });
      rootElement.querySelector('.palette-editor').addEventListener('submit', event => {
        event.preventDefault();captureSimpleFields();
        const checked = validateDraft(draft);errors = checked.errors;
        if (!checked.ok) { notice = '';render();return; }
        try {
          let next;
          let paletteId;
          const existing = preferences.palettes.find(item => item.id === draft.id);
          if (existing && !existing.preset) {
            next = P.updateUserPalette(preferences, existing.id, checked.palette);
            paletteId = existing.id;
          } else {
            const input = { ...checked.palette, id: undefined, preset: null };
            input.entries = input.entries.map(entry => ({ ...entry, id: '' }));
            const created = P.createUserPalette(preferences, input);
            next = created.preferences;paletteId = created.paletteId;
          }
          if (defaultKind) next.defaultPaletteIds[defaultKind] = paletteId;
          notice = 'パレットを保存しました。';
          refreshPreferences(P.validatePreferences(next), paletteId);
        } catch (error) {
          errors = [{ field: 'palette', message: error.message }];notice = '';render();
        }
      });
    }

    render();
    return { refresh: render };
  }

  root.TSUKERUPaletteSettings = Object.freeze({
    COLOR_NAMES, SIZE_NAMES, createDraft, editorViewModel, moveEntry, addEntry, removeEntry,
    validateDraft, mount
  });
})(globalThis);
