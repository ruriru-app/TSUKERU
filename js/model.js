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

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function requireString(value, label, { allowEmpty = true } = {}) {
    if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`${label}が不正です`);
  }

  function requireFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}が不正です`);
  }

  function validateRecordObject(records, allowedKeys, label, validateValue) {
    if (!isObject(records)) throw new Error(`${label}が不正です`);
    for (const [key, value] of Object.entries(records)) {
      if (!allowedKeys.has(key)) throw new Error(`${label}に対応する児童または評価列がありません`);
      validateValue(value);
    }
  }

  function migrateState(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('保存データを読み取れません');
    if (raw.appId !== APP_ID) throw new Error('TSUKERUの保存データではありません');
    if (Number(raw.schemaVersion) > SCHEMA_VERSION) throw new Error('このアプリより新しい形式の保存データです');
    if (Number(raw.schemaVersion) !== SCHEMA_VERSION) throw new Error('対応していない古い保存形式です');
    const state = structuredClone(raw);
    if (!Array.isArray(state.classes) || state.classes.length === 0) throw new Error('学級データがありません');
    if (!isObject(state.ui)) throw new Error('画面状態が不正です');
    if (typeof state.ui.kanaMode !== 'boolean' || typeof state.ui.numeric !== 'boolean') throw new Error('画面状態が不正です');
    requireUnique(state.classes, '学級ID');
    for (const classRecord of state.classes) {
      if (!isObject(classRecord)) throw new Error('学級データが不正です');
      requireString(classRecord.school, '学校名');
      requireString(classRecord.name, '学級名', { allowEmpty: false });
      requireString(classRecord.year, '学年・年度');
      if (!Number.isInteger(classRecord.count) || classRecord.count < 1 || classRecord.count > 200) throw new Error('学級人数が不正です');
      if (!Array.isArray(classRecord.students) || classRecord.students.length === 0 || !Array.isArray(classRecord.sheets) || classRecord.sheets.length === 0) throw new Error('学級データが不正です');
      if (classRecord.count !== classRecord.students.length) throw new Error('学級人数と名簿が一致しません');
      if (!Array.isArray(classRecord.weekdays) || classRecord.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('授業曜日が不正です');
      if (!isObject(classRecord.exceptions) || Object.entries(classRecord.exceptions).some(([date, kind]) => !/^\d{4}-\d{2}-\d{2}$/.test(date) || !['on', 'off'].includes(kind))) throw new Error('授業日程の例外が不正です');
      requireUnique(classRecord.students, '児童ID');
      const attendanceNumbers = new Set();
      for (const student of classRecord.students) {
        requireString(student.no, '出席番号', { allowEmpty: false });
        requireString(student.name, '児童氏名', { allowEmpty: false });
        requireString(student.kana, 'よみがな');
        if (!/^\d+$/.test(student.no) || Number(student.no) < 1 || attendanceNumbers.has(String(Number(student.no)))) throw new Error('出席番号が不正または重複しています');
        attendanceNumbers.add(String(Number(student.no)));
      }
      requireUnique(classRecord.sheets, 'チェック表ID');
      for (const sheet of classRecord.sheets) {
        if (!isObject(sheet)) throw new Error('チェック表データが不正です');
        requireString(sheet.name, 'チェック表名', { allowEmpty: false });
        if (!['submission', 'evaluation', 'number'].includes(sheet.type)) throw new Error('チェック表の種類が不正です');
        if (!Array.isArray(sheet.columns) || sheet.columns.length === 0) throw new Error('評価列データが不正です');
        requireUnique(sheet.columns, '評価列ID');
        for (const column of sheet.columns) {
          if (!isObject(column)) throw new Error('評価列データが不正です');
          requireString(column.title, '評価列タイトル', { allowEmpty: false });
          requireString(column.due, '提出期限');
          if (column.due && !/^\d{4}-\d{2}-\d{2}$/.test(column.due)) throw new Error('提出期限が不正です');
          for (const field of ['base', 'interval', 'penalty', 'redoPenalty', 'zeroDays']) requireFinite(column[field], '評価列の数値設定');
          if (!['days', 'lesson', 'none'].includes(column.basis)) throw new Error('評価列の減点方式が不正です');
          if (column.includeInTotal === undefined) column.includeInTotal = true;
          if (column.hidden === undefined) column.hidden = false;
          if (typeof column.zeroFloor !== 'boolean' || typeof column.includeInTotal !== 'boolean' || typeof column.hidden !== 'boolean') throw new Error('評価列の設定が不正です');
        }
        const allowedKeys = new Set(sheet.columns.flatMap(column => classRecord.students.map(student => recordKey(column.id, student.id))));
        validateRecordObject(sheet.values, allowedKeys, '記録値', value => {
          if (typeof value !== 'string') throw new Error('記録値が不正です');
        });
        validateRecordObject(sheet.meta, allowedKeys, '記録詳細', value => {
          if (!isObject(value)) throw new Error('記録詳細が不正です');
          for (const detail of Object.values(value)) {
            if (!(detail === null || ['string', 'number', 'boolean'].includes(typeof detail))) throw new Error('記録詳細が不正です');
          }
        });
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
