(function (root) {
  const PRESETS = Object.freeze({
    submission: Object.freeze(['○', '×', '欠', '再', '日付', '再返']),
    activity: Object.freeze(['A', 'B', 'C', '欠']),
    numeric: Object.freeze(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
  });

  const TYPE_KEYS = Object.freeze({
    submission: 'submission',
    activity: 'activity',
    evaluation: 'activity',
    numeric: 'numeric',
    number: 'numeric'
  });

  function clone(value) {
    return structuredClone(value);
  }

  function paletteKey(sheetType) {
    return TYPE_KEYS[sheetType] || null;
  }

  function presetEntries(key) {
    return PRESETS[key].map(value => ({ value, visible: true }));
  }

  function normalizeEntries(entries, key) {
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
    const source = preferences && typeof preferences === 'object' && !Array.isArray(preferences) ? preferences : {};
    const normalized = { ...clone(source), paletteDefaults: {} };
    const defaults = source.paletteDefaults && typeof source.paletteDefaults === 'object' && !Array.isArray(source.paletteDefaults)
      ? source.paletteDefaults
      : {};
    for (const key of Object.keys(PRESETS)) {
      const entries = normalizeEntries(defaults[key], key);
      if (entries) normalized.paletteDefaults[key] = entries;
    }
    return normalized;
  }

  function paletteForSheet(preferences, sheetType) {
    const key = paletteKey(sheetType);
    if (!key) return [];
    const normalized = normalizePaletteDefaults(preferences);
    return clone(normalized.paletteDefaults[key] || presetEntries(key));
  }

  function setPaletteDefault(preferences, sheetType, orderedButtons) {
    const key = paletteKey(sheetType);
    if (!key) throw new TypeError('パレットの種類が不正です');
    const entries = normalizeEntries(orderedButtons, key);
    if (!entries) throw new TypeError('パレットのボタン設定が不正です');
    const normalized = normalizePaletteDefaults(preferences);
    normalized.paletteDefaults[key] = entries;
    return normalized;
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
    PRESETS, normalizePaletteDefaults, paletteForSheet,
    setPaletteDefault, colorTokenForMark
  });
})(globalThis);
