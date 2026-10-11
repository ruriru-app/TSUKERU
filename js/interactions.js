(function (root) {
  function point(input = {}) {
    return {
      key: String(input.key ?? ''),
      time: Number.isFinite(input.time) ? input.time : Date.now(),
      x: Number.isFinite(input.x) ? input.x : 0,
      y: Number.isFinite(input.y) ? input.y : 0
    };
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function createDoubleActivation({ maxDelayMs = 450, maxDistancePx = 12 } = {}) {
    let down = null;
    let previousTap = null;

    function reset() {
      down = null;
      previousTap = null;
    }

    function pointerDown(input) {
      down = point(input);
      return false;
    }

    function pointerUp(input = {}) {
      const up = point(input);
      if (!down || input.cancelled || !up.key || up.key !== down.key || distance(down, up) > maxDistancePx) {
        reset();
        return false;
      }
      const tap = { ...up };
      down = null;
      if (previousTap && previousTap.key === tap.key && tap.time - previousTap.time <= maxDelayMs && distance(previousTap, tap) <= maxDistancePx) {
        previousTap = null;
        return true;
      }
      previousTap = tap;
      return false;
    }

    return Object.freeze({ pointerDown, pointerUp, reset });
  }

  function formatSavedAt(iso, locale = 'ja-JP') {
    const date = new Date(iso);
    if (Number.isNaN(date.valueOf())) return '';
    const parts = new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}`;
  }

  function createSaveStatusModel({ locale = 'ja-JP' } = {}) {
    const labels = Object.freeze({
      loading: '保存準備中', dirty: '未保存の変更', saving: '保存中…',
      saved: '保存済み', error: '保存失敗・再試行',
      offline: 'オフライン・端末保存', update: '更新版があります'
    });
    let state = {
      status: 'loading', label: labels.loading,
      lastSavedAt: null, savedAtText: '', error: ''
    };

    function update(status, { savedAt, error } = {}) {
      if (status === 'saved') state.lastSavedAt = savedAt || new Date().toISOString();
      state = {
        ...state,
        status,
        label: labels[status] || String(status),
        savedAtText: state.lastSavedAt ? formatSavedAt(state.lastSavedAt, locale) : '',
        error: error ? (error.message || String(error)) : ''
      };
      return structuredClone(state);
    }

    function snapshot() {
      return structuredClone(state);
    }

    return Object.freeze({ update, snapshot });
  }

  function formatTotalsForClipboard(values) {
    if (!Array.isArray(values)) throw new Error('コピーする集計結果が不正です');
    return values.map(value => value == null || value === '－' ? '' : String(value)).join('\r\n');
  }

  async function writeClipboardText(text, { clipboard = root.navigator?.clipboard, documentRef = root.document } = {}) {
    const value = String(text ?? '');
    if (typeof clipboard?.writeText === 'function') {
      await clipboard.writeText(value);
      return true;
    }
    if (!documentRef?.body || typeof documentRef.createElement !== 'function' || typeof documentRef.execCommand !== 'function') {
      throw new Error('このブラウザではクリップボードへコピーできません');
    }
    const textarea = documentRef.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    Object.assign(textarea.style, { position:'fixed', inset:'0 auto auto -9999px', opacity:'0' });
    documentRef.body.append(textarea);
    try {
      textarea.focus();
      textarea.select();
      if (!documentRef.execCommand('copy')) throw new Error('クリップボードへコピーできませんでした');
      return true;
    } finally {
      textarea.remove();
    }
  }

  root.TSUKERUInteractions = Object.freeze({
    createDoubleActivation, formatSavedAt, createSaveStatusModel,
    formatTotalsForClipboard, writeClipboardText
  });
})(globalThis);
