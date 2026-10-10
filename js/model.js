(function (root) {
  const APP_ID = 'TSUKERU';
  const SCHEMA_VERSION = 1;
  const DEMO_NAMES = ['小鳥遊 美咲','四月一日 陽菜','月見里 悠真','佐藤 結衣','田中 陽翔','青木 はる','伊藤 そうた','加藤 みお','山田 けん','中村 あい','渡辺 さき','森川 りお'];
  const DEMO_KANA = ['たかなし みさき','わたぬき ひな','やまなし ゆうま','さとう ゆい','たなか はると','あおき はる','いとう そうた','かとう みお','やまだ けん','なかむら あい','わたなべ さき','もりかわ りお'];

  function defaultIdFactory(prefix) {
    const uuid = root.crypto && typeof root.crypto.randomUUID === 'function'
      ? root.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${uuid}`;
  }

  function recordKey(columnId, studentId) {
    return `${columnId}:${studentId}`;
  }

  function createSheet(name, type, idFactory) {
    const titles = type === 'submission'
      ? ['漢字ドリル', '計算プリント', '音読カード']
      : type === 'number' ? ['テスト1', 'テスト2', 'テスト3'] : ['発音', 'やり取り', '発表'];
    return {
      id: idFactory('sheet'), name, type,
      columns: titles.map((title, index) => ({
        id: idFactory('column'), title,
        due: type === 'submission' ? ['2026-10-08', '2026-10-15', '2026-10-22'][index] : '',
        base: 5, interval: 3, penalty: 1, basis: 'days', redoPenalty: 1,
        zeroDays: 30, zeroFloor: true, redoDueMode: 'next', includeInTotal: true,
        hidden: false
      })),
      values: {}, meta: {}
    };
  }

  function createClass(name, idFactory) {
    const students = DEMO_NAMES.map((studentName, index) => ({
      id: idFactory('student'), no: String(index + 1), name: studentName, kana: DEMO_KANA[index]
    }));
    return {
      id: idFactory('class'), school: '', name, year: '2026', count: students.length,
      weekdays: [2, 4], exceptions: {}, students,
      sheets: [
        createSheet('提出物チェック', 'submission', idFactory),
        createSheet('活動評価', 'evaluation', idFactory),
        createSheet('点数記録', 'number', idFactory)
      ]
    };
  }

  function createBlankState({ nowIso = new Date().toISOString() } = {}) {
    return {
      appId: APP_ID, schemaVersion: SCHEMA_VERSION, savedAt: nowIso,
      ui: { activeClassId: null, activeSheetId: null, lastColumnId: null, kanaMode: false, numeric: false },
      classes: []
    };
  }

  function createDemoState({ idFactory = defaultIdFactory, nowIso = new Date().toISOString() } = {}) {
    const classes = ['6年1組', '6年2組', '5年1組'].map(name => createClass(name, idFactory));
    const first = classes[0];
    const sheet = first.sheets[0];
    const key = (columnIndex, studentIndex) => recordKey(sheet.columns[columnIndex].id, first.students[studentIndex].id);
    Object.assign(sheet.values, {
      [key(0,0)]: '○', [key(0,1)]: '×', [key(0,2)]: '再', [key(0,3)]: '2026-10-10',
      [key(0,4)]: '再', [key(1,0)]: '×', [key(1,1)]: '○', [key(1,2)]: '再'
    });
    sheet.meta[key(0,2)] = { redo: true, initialSubmitted: '2026-10-08', returned: null, submitted: null };
    sheet.meta[key(0,4)] = { redo: true, initialSubmitted: '2026-10-08', returned: null, submitted: null };
    sheet.meta[key(1,2)] = { redo: true, initialSubmitted: '2026-10-15', returned: null, submitted: null };
    return {
      appId: APP_ID, schemaVersion: SCHEMA_VERSION, savedAt: nowIso,
      ui: {
        activeClassId: first.id, activeSheetId: first.sheets[0].id,
        lastColumnId: null, kanaMode: false, numeric: false
      },
      classes
    };
  }

  function requireUnique(items, label) {
    const ids = items.map(item => item && item.id);
    if (ids.some(id => typeof id !== 'string' || !id)) throw new Error(`${label}がありません`);
    if (new Set(ids).size !== ids.length) throw new Error(`${label}が重複しています`);
  }

  function migrateState(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('保存データを読み取れません');
    if (raw.appId !== APP_ID) throw new Error('TSUKERUの保存データではありません');
    if (Number(raw.schemaVersion) > SCHEMA_VERSION) throw new Error('このアプリより新しい形式の保存データです');
    if (Number(raw.schemaVersion) !== SCHEMA_VERSION) throw new Error('対応していない古い保存形式です');
    const state = structuredClone(raw);
    if (!Array.isArray(state.classes)) throw new Error('学級データが不正です');
    requireUnique(state.classes, '学級ID');
    for (const classRecord of state.classes) {
      if (!Array.isArray(classRecord.students) || !Array.isArray(classRecord.sheets)) throw new Error('学級データが不正です');
      requireUnique(classRecord.students, '児童ID');
      requireUnique(classRecord.sheets, 'チェック表ID');
      for (const sheet of classRecord.sheets) {
        if (!Array.isArray(sheet.columns)) throw new Error('評価列データが不正です');
        requireUnique(sheet.columns, '評価列ID');
        sheet.values = sheet.values && typeof sheet.values === 'object' ? sheet.values : {};
        sheet.meta = sheet.meta && typeof sheet.meta === 'object' ? sheet.meta : {};
      }
    }
    return state;
  }

  function getClass(state, classId) {
    return state.classes.find(classRecord => classRecord.id === classId) || null;
  }

  function getSheet(classRecord, sheetId) {
    return classRecord && classRecord.sheets.find(sheet => sheet.id === sheetId) || null;
  }

  root.TSUKERUModel = Object.freeze({
    APP_ID, SCHEMA_VERSION, DEMO_NAMES, DEMO_KANA, defaultIdFactory,
    recordKey, createSheet, createBlankState, createDemoState, migrateState, getClass, getSheet
  });
})(globalThis);
