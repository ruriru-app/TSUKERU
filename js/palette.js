(function (root) {
  const PRESETS = Object.freeze({
    submission: Object.freeze(['○', '×', '欠', '再', '日付', '再返']),
    activity: Object.freeze(['A', 'B', 'C', '欠']),
    numeric: Object.freeze(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
  });
  const TYPE_KEYS = Object.freeze({
    submission: 'submission', activity: 'activity', evaluation: 'activity',
    numeric: 'numeric', number: 'numeric'
  });
  const PALETTE_SIZES = Object.freeze(['small', 'standard', 'large']);
  const ALLOWED_COLORS = Object.freeze([
    'rose', 'sage', 'sky', 'stone', 'lilac', 'amber',
    'mint', 'peach', 'teal', 'indigo', 'slate', 'cream'
  ]);
  const ENTRY_ACTIONS = Object.freeze(['mark', 'date', 'redo', 'batchReturn']);
  const BUILTIN_IDS = Object.freeze({
    submission: 'palette-preset-submission',
    activity: 'palette-preset-activity',
    numeric: 'palette-preset-numeric'
  });
  const BUILTIN_DATE = '2026-01-01T00:00:00.000Z';
  const BUILTIN_SETTINGS = Object.freeze({
    submission: Object.freeze({
      name: '提出物',
      entries: Object.freeze([
        ['○', 'rose', 'mark'], ['×', 'sky', 'mark'], ['欠', 'stone', 'mark'],
        ['再', 'lilac', 'redo'], ['日付', 'amber', 'date'], ['再返', 'lilac', 'batchReturn']
      ])
    }),
    activity: Object.freeze({
      name: '活動評価',
      entries: Object.freeze([
        ['A', 'rose', 'mark'], ['B', 'sage', 'mark'], ['C', 'sky', 'mark'], ['欠', 'stone', 'mark']
      ])
    }),
    numeric: Object.freeze({
      name: '数値',
      entries: Object.freeze(PRESETS.numeric.map(label => [label, 'cream', 'mark']))
    })
  });

  function clone(value) {
    return structuredClone(value);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function paletteKey(sheetType) {
    return TYPE_KEYS[sheetType] || null;
  }

  function defaultIdFactory(prefix) {
    const uuid = root.crypto && typeof root.crypto.randomUUID === 'function'
      ? root.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${uuid}`;
  }

  function validIso(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function makeBuiltinPalette(key) {
    const settings = BUILTIN_SETTINGS[key];
    return {
      id: BUILTIN_IDS[key], name: settings.name, size: 'standard', scoringEnabled: false,
      entries: settings.entries.map(([label, color, action], index) => ({
        id: `${BUILTIN_IDS[key]}-entry-${index + 1}`,
        label, color, score: null, action, visible: true
      })),
      preset: key, createdAt: BUILTIN_DATE, updatedAt: BUILTIN_DATE
    };
  }

  function builtinPalettes() {
    return Object.keys(PRESETS).map(makeBuiltinPalette);
  }

  function normalizeEntry(entry, index, paletteId) {
    if (!isObject(entry)) throw new TypeError('パレット項目が不正です');
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (!label) throw new TypeError('パレットの表示文字を入力してください');
    const color = entry.color;
    if (!ALLOWED_COLORS.includes(color)) throw new TypeError('パレットの色が候補外です');
    const score = entry.score === undefined || entry.score === null || entry.score === '' ? null : entry.score;
    if (!(score === null || (typeof score === 'number' && Number.isFinite(score)))) throw new TypeError('パレットの点数が不正です');
    const action = entry.action === undefined ? 'mark' : entry.action;
    if (!ENTRY_ACTIONS.includes(action)) throw new TypeError('パレットの動作が不正です');
    const id = typeof entry.id === 'string' && entry.id.trim()
      ? entry.id.trim()
      : `${paletteId}-entry-${index + 1}`;
    return {
      id, label, color, score, action,
      visible: entry.visible === undefined ? true : Boolean(entry.visible)
    };
  }

  function validatePalette(palette) {
    if (!isObject(palette)) throw new TypeError('パレットが不正です');
    const id = typeof palette.id === 'string' ? palette.id.trim() : '';
    const name = typeof palette.name === 'string' ? palette.name.trim() : '';
    if (!id) throw new TypeError('パレットIDが不正です');
    if (!name) throw new TypeError('パレット名を入力してください');
    if (!PALETTE_SIZES.includes(palette.size)) throw new TypeError('パレットの表示サイズが不正です');
    if (typeof palette.scoringEnabled !== 'boolean') throw new TypeError('パレットの点数設定が不正です');
    if (!Array.isArray(palette.entries) || palette.entries.length === 0 || palette.entries.length > 30) throw new TypeError('パレット項目が不正です');
    if (!(palette.preset === null || Object.keys(PRESETS).includes(palette.preset))) throw new TypeError('パレットのプリセット設定が不正です');
    if (!validIso(palette.createdAt) || !validIso(palette.updatedAt)) throw new TypeError('パレットの更新日時が不正です');
    const entries = palette.entries.map((entry, index) => normalizeEntry(entry, index, id));
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new TypeError('パレット項目IDが重複しています');
    if (new Set(entries.map(entry => entry.label)).size !== entries.length) throw new TypeError('パレットの表示文字が重複しています');
    return {
      id, name, size: palette.size, scoringEnabled: palette.scoringEnabled,
      entries, preset: palette.preset, createdAt: palette.createdAt, updatedAt: palette.updatedAt
    };
  }

  function validateSnapshot(snapshot) {
    if (!isObject(snapshot)) throw new TypeError('列のパレット設定が不正です');
    const paletteId = typeof snapshot.paletteId === 'string' && snapshot.paletteId ? snapshot.paletteId : 'palette-snapshot';
    const checked = validatePalette({
      id: paletteId, name: snapshot.name, size: snapshot.size,
      scoringEnabled: snapshot.scoringEnabled, entries: snapshot.entries,
      preset: null, createdAt: BUILTIN_DATE, updatedAt: BUILTIN_DATE
    });
    return {
      paletteId: checked.id, name: checked.name, size: checked.size,
      scoringEnabled: checked.scoringEnabled, entries: checked.entries
    };
  }

  function snapshotPalette(palette) {
    const checked = validatePalette(palette);
    return {
      paletteId: checked.id, name: checked.name, size: checked.size,
      scoringEnabled: checked.scoringEnabled, entries: clone(checked.entries)
    };
  }

  function normalizeLegacyEntries(entries, key) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const allowed = new Set(PRESETS[key]);
    const seen = new Set();
    const normalized = [];
    for (const entry of entries) {
      const value = typeof entry === 'string' ? entry : entry && entry.value;
      const visible = typeof entry === 'string' ? true : entry && entry.visible;
      if (!allowed.has(value) || typeof visible !== 'boolean' || seen.has(value)) return null;
      seen.add(value);
      normalized.push({ value, visible });
    }
    return normalized;
  }

  function normalizePaletteDefaults(preferences = {}) {
    const source = isObject(preferences) ? preferences : {};
    const normalized = { ...clone(source), paletteDefaults: {} };
    const defaults = isObject(source.paletteDefaults) ? source.paletteDefaults : {};
    for (const key of Object.keys(PRESETS)) {
      const entries = normalizeLegacyEntries(defaults[key], key);
      if (entries) normalized.paletteDefaults[key] = entries;
    }
    return normalized;
  }

  function paletteFromLegacy(key, legacyEntries, id, nowIso) {
    const builtin = makeBuiltinPalette(key);
    const byLabel = new Map(builtin.entries.map(entry => [entry.label, entry]));
    return validatePalette({
      id, name: `${BUILTIN_SETTINGS[key].name}（以前の設定）`, size: 'standard', scoringEnabled: false,
      entries: legacyEntries.map((legacy, index) => ({
        ...byLabel.get(legacy.value), id: `${id}-entry-${index + 1}`, visible: legacy.visible
      })),
      preset: null, createdAt: nowIso, updatedAt: nowIso
    });
  }

  function validatePreferences(preferences) {
    if (!isObject(preferences) || !Array.isArray(preferences.palettes) || !isObject(preferences.defaultPaletteIds)) {
      throw new TypeError('パレット設定が不正です');
    }
    if (Object.hasOwn(preferences, 'paletteDefaults')) throw new TypeError('旧パレット設定が残っています');
    const palettes = preferences.palettes.map(validatePalette);
    if (new Set(palettes.map(palette => palette.id)).size !== palettes.length) throw new TypeError('パレットIDが重複しています');
    const paletteIds = new Set(palettes.map(palette => palette.id));
    for (const key of Object.keys(PRESETS)) {
      if (!paletteIds.has(preferences.defaultPaletteIds[key])) throw new TypeError('既定パレットが見つかりません');
      const builtin = palettes.find(palette => palette.id === BUILTIN_IDS[key]);
      if (!builtin || builtin.preset !== key) throw new TypeError('初期パレットが不正です');
    }
    return { ...clone(preferences), palettes, defaultPaletteIds: { ...preferences.defaultPaletteIds } };
  }

  function normalizePreferences(preferences = {}, { nowIso = new Date().toISOString(), idFactory = defaultIdFactory } = {}) {
    const source = isObject(preferences) ? clone(preferences) : {};
    if (Array.isArray(source.palettes) || isObject(source.defaultPaletteIds)) return validatePreferences(source);

    const palettes = builtinPalettes();
    const defaultPaletteIds = { ...BUILTIN_IDS };
    const legacy = normalizePaletteDefaults(source).paletteDefaults;
    for (const key of Object.keys(PRESETS)) {
      if (!legacy[key]) continue;
      const id = idFactory(`palette-${key}`);
      if (typeof id !== 'string' || !id || palettes.some(palette => palette.id === id)) throw new TypeError('パレットIDが不正または重複しています');
      palettes.push(paletteFromLegacy(key, legacy[key], id, nowIso));
      defaultPaletteIds[key] = id;
    }
    delete source.paletteDefaults;
    return validatePreferences({ ...source, palettes, defaultPaletteIds });
  }

  function prepareUserPalette(input, { nowIso, idFactory }, existing = null) {
    const id = existing ? existing.id : (typeof input.id === 'string' && input.id ? input.id : idFactory('palette'));
    const createdAt = existing ? existing.createdAt : (validIso(input.createdAt) ? input.createdAt : nowIso);
    const entries = Array.isArray(input.entries) ? input.entries.map((entry, index) => ({
      ...entry, id: typeof entry.id === 'string' && entry.id ? entry.id : `${id}-entry-${index + 1}`
    })) : [];
    return validatePalette({
      id, name: input.name, size: input.size || 'standard',
      scoringEnabled: input.scoringEnabled === true, entries, preset: null,
      createdAt, updatedAt: nowIso
    });
  }

  function createUserPalette(preferences, input, { nowIso = new Date().toISOString(), idFactory = defaultIdFactory } = {}) {
    const normalized = normalizePreferences(preferences, { nowIso, idFactory });
    const palette = prepareUserPalette(input, { nowIso, idFactory });
    if (normalized.palettes.some(item => item.id === palette.id)) throw new TypeError('パレットIDが重複しています');
    normalized.palettes.push(palette);
    return { preferences: validatePreferences(normalized), paletteId: palette.id };
  }

  function duplicatePalette(preferences, paletteId, { nowIso = new Date().toISOString(), idFactory = defaultIdFactory } = {}) {
    const normalized = normalizePreferences(preferences, { nowIso, idFactory });
    const source = normalized.palettes.find(item => item.id === paletteId);
    if (!source) throw new TypeError('複製するパレットが見つかりません');
    const id = idFactory('palette');
    const duplicate = prepareUserPalette({
      ...clone(source), id, name: `${source.name} のコピー`,
      entries: source.entries.map((entry, index) => ({ ...entry, id: `${id}-entry-${index + 1}` }))
    }, { nowIso, idFactory });
    if (normalized.palettes.some(item => item.id === duplicate.id)) throw new TypeError('パレットIDが重複しています');
    normalized.palettes.push(duplicate);
    return { preferences: validatePreferences(normalized), paletteId: duplicate.id };
  }

  function updateUserPalette(preferences, paletteId, changes, { nowIso = new Date().toISOString(), idFactory = defaultIdFactory } = {}) {
    const normalized = normalizePreferences(preferences, { nowIso, idFactory });
    const index = normalized.palettes.findIndex(item => item.id === paletteId);
    if (index < 0) throw new TypeError('更新するパレットが見つかりません');
    if (normalized.palettes[index].preset) throw new TypeError('初期プリセットは複製してから編集してください');
    const merged = { ...normalized.palettes[index], ...clone(changes), id: paletteId, preset: null };
    normalized.palettes[index] = prepareUserPalette(merged, { nowIso, idFactory }, normalized.palettes[index]);
    return validatePreferences(normalized);
  }

  function deleteUserPalette(preferences, paletteId) {
    const normalized = normalizePreferences(preferences);
    const palette = normalized.palettes.find(item => item.id === paletteId);
    if (!palette) throw new TypeError('削除するパレットが見つかりません');
    if (palette.preset) throw new TypeError('初期プリセットは削除できません');
    normalized.palettes = normalized.palettes.filter(item => item.id !== paletteId);
    for (const key of Object.keys(PRESETS)) {
      if (normalized.defaultPaletteIds[key] === paletteId) normalized.defaultPaletteIds[key] = BUILTIN_IDS[key];
    }
    return validatePreferences(normalized);
  }

  function paletteForColumn(preferences, sheetType, column = {}) {
    if (column && column.paletteSnapshot) return clone(validateSnapshot(column.paletteSnapshot));
    const key = paletteKey(sheetType);
    if (!key) throw new TypeError('パレットの種類が不正です');
    const normalized = normalizePreferences(preferences);
    const palette = normalized.palettes.find(item => item.id === normalized.defaultPaletteIds[key]);
    if (!palette) throw new TypeError('既定パレットが見つかりません');
    return snapshotPalette(palette);
  }

  function maxPaletteScore(snapshot) {
    const checked = validateSnapshot(snapshot);
    if (!checked.scoringEnabled) return null;
    const scores = checked.entries.map(entry => entry.score).filter(score => typeof score === 'number');
    return scores.length ? Math.max(...scores) : null;
  }

  function scoreForValue(snapshot, value) {
    const checked = validateSnapshot(snapshot);
    if (!checked.scoringEnabled) return { matched: false, score: null };
    const storedValue = String(value ?? '');
    const entry = checked.entries.find(item => item.label === storedValue)
      || (/^\d{4}-\d{2}-\d{2}$/.test(storedValue) ? checked.entries.find(item => item.action === 'date') : null)
      || (storedValue === '再' ? checked.entries.find(item => item.action === 'redo') : null);
    return entry
      ? { matched: true, score: entry.score }
      : { matched: false, score: null };
  }

  function paletteForSheet(preferences, sheetType) {
    const key = paletteKey(sheetType);
    if (!key) return [];
    try {
      return paletteForColumn(preferences, sheetType, {}).entries.map(entry => ({
        value: entry.label, visible: entry.visible
      }));
    } catch {
      return PRESETS[key].map(value => ({ value, visible: true }));
    }
  }

  function setPaletteDefault(preferences, sheetType, orderedButtons) {
    const key = paletteKey(sheetType);
    if (!key) throw new TypeError('パレットの種類が不正です');
    const entries = normalizeLegacyEntries(orderedButtons, key);
    if (!entries) throw new TypeError('パレットのボタン設定が不正です');
    const normalized = normalizePreferences(preferences);
    const currentId = normalized.defaultPaletteIds[key];
    const current = normalized.palettes.find(item => item.id === currentId);
    const id = current && !current.preset ? current.id : defaultIdFactory(`palette-${key}`);
    const next = paletteFromLegacy(key, entries, id, new Date().toISOString());
    if (current && !current.preset) {
      next.createdAt = current.createdAt;
      normalized.palettes[normalized.palettes.findIndex(item => item.id === current.id)] = next;
    } else normalized.palettes.push(next);
    normalized.defaultPaletteIds[key] = next.id;
    return validatePreferences(normalized);
  }

  function colorTokenForMark(mark) {
    if (mark === 'A' || mark === '○') return 'positive';
    if (mark === 'B' || mark === '△') return 'middle';
    if (mark === 'C' || mark === '×') return 'negative';
    if (mark === '欠') return 'absent';
    if (mark === '再' || mark === '再返') return 'redo';
    if (mark === '日付' || /^\d{4}-\d{2}-\d{2}$/.test(String(mark || ''))) return 'date';
    return '';
  }

  root.TSUKERUPalette = Object.freeze({
    PRESETS, PALETTE_SIZES, ALLOWED_COLORS, ENTRY_ACTIONS, BUILTIN_IDS,
    normalizePaletteDefaults, paletteForSheet, setPaletteDefault, colorTokenForMark,
    normalizePreferences, validatePreferences, validatePalette, validateSnapshot,
    createUserPalette, duplicatePalette, updateUserPalette, deleteUserPalette,
    paletteForColumn, snapshotPalette, maxPaletteScore, scoreForValue
  });
})(globalThis);
