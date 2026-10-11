(function (root) {
  const APP_ID = 'TSUKERU';
  const SCHEMA_VERSION = 3;
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
    const workspace = root.TSUKERUWorkspace;
    if (!workspace) throw new Error('TSUKERUの保存形式を初期化できません');
    return workspace.createEmptyWorkspace({ nowIso });
  }

  function createLegacyDemoState({ idFactory = defaultIdFactory, nowIso = new Date().toISOString() } = {}) {
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
      appId: APP_ID, schemaVersion: 1, savedAt: nowIso,
      ui: {
        activeClassId: first.id, activeSheetId: first.sheets[0].id,
        lastColumnId: null, kanaMode: false, numeric: false
      },
      classes
    };
  }

  function migrateState(raw) {
    const workspace = root.TSUKERUWorkspace;
    if (!workspace) throw new Error('TSUKERUの保存形式を読み込めません');
    const state = workspace.migrateWorkspace(raw);
    if (root.TSUKERUPalette) state.preferences = root.TSUKERUPalette.normalizePreferences(state.preferences);
    return attachLegacyViews(state);
  }

  function createDemoState(options = {}) {
    return migrateState(createLegacyDemoState(options));
  }

  function attachLegacyViews(state) {
    const workspace = root.TSUKERUWorkspace;
    for (const classRecord of state.classes) {
      const sheets = workspace.availableSheetsForClass(state, classRecord.id).map(definition => {
        const bucket = workspace.ensureClassRecord(state, classRecord.id, definition.id);
        return {
          get id() { return definition.id; },
          get name() { return definition.name; },
          set name(value) { definition.name = value; },
          get type() { return definition.type; },
          set type(value) { definition.type = value; },
          get columns() { return definition.columns; },
          set columns(value) { definition.columns = value; },
          values: bucket.values,
          meta: bucket.meta
        };
      });
      Object.defineProperty(classRecord, 'sheets', { value: sheets, writable: true, configurable: true, enumerable: false });
    }
    Object.defineProperties(state.ui, {
      activeClassId: {
        get() { return this.currentClassId; },
        set(value) { this.currentClassId = value; },
        configurable: true,
        enumerable: false
      },
      activeSheetId: {
        get() { return this.currentSheetId; },
        set(value) { this.currentSheetId = value; },
        configurable: true,
        enumerable: false
      }
    });
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
    recordKey, createSheet, createBlankState, createLegacyDemoState, createDemoState,
    migrateState, attachLegacyViews, getClass, getSheet
  });
})(globalThis);
