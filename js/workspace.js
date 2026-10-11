(function (root) {
  const APP_ID = 'TSUKERU';
  const SCHEMA_VERSION = 3;

  class WorkspaceValidationError extends Error {
    constructor(message) {
      super(message);
      this.name = 'WorkspaceValidationError';
    }
  }

  function fail(message) {
    throw new WorkspaceValidationError(message);
  }

  function paletteApi() {
    if (!root.TSUKERUPalette) fail('パレット設定を読み込めません');
    return root.TSUKERUPalette;
  }

  function normalizePreferences(preferences, options = {}) {
    try {
      return paletteApi().normalizePreferences(preferences, options);
    } catch (error) {
      fail(error && error.message ? error.message : 'パレット設定が不正です');
    }
  }

  function validatePreferences(preferences) {
    try {
      paletteApi().validatePreferences(preferences);
    } catch (error) {
      fail(error && error.message ? error.message : 'パレット設定が不正です');
    }
  }

  function clone(value) {
    return structuredClone(value);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function requireObject(value, label) {
    if (!isObject(value)) fail(`${label}が不正です`);
  }

  function requireString(value, label, { allowEmpty = true } = {}) {
    if (typeof value !== 'string' || (!allowEmpty && !value.trim())) fail(`${label}が不正です`);
  }

  function requireFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label}が不正です`);
  }

  const SAFE_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,127}$/u;

  function requireUnique(items, label) {
    const ids = items.map(item => item && item.id);
    if (ids.some(id => typeof id !== 'string' || !SAFE_ID_PATTERN.test(id))) fail(`${label}が不正です`);
    if (new Set(ids).size !== ids.length) fail(`${label}が重複しています`);
  }

  function validDate(value) {
    return typeof value === 'string' && (!value || /^\d{4}-\d{2}-\d{2}$/.test(value));
  }

  function recordKey(columnId, studentId) {
    return `${columnId}:${studentId}`;
  }

  function defaultIdFactory(prefix) {
    const uuid = root.crypto && typeof root.crypto.randomUUID === 'function'
      ? root.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${uuid}`;
  }

  function defaultUi() {
    return {
      view: 'home', currentClassId: null, currentSheetId: null,
      currentGroupId: null, recordMode: 'class', lastColumnId: null,
      kanaMode: false, numeric: false
    };
  }

  function createEmptyWorkspace({ nowIso = new Date().toISOString() } = {}) {
    return {
      appId: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      savedAt: nowIso,
      classes: [],
      groups: [],
      sheetDefinitions: [],
      classRecords: {},
      preferences: normalizePreferences({}, { nowIso }),
      ui: defaultUi()
    };
  }

  function validateClass(classRecord) {
    requireObject(classRecord, '学級データ');
    requireString(classRecord.school, '学校名');
    requireString(classRecord.name, '学級名', { allowEmpty: false });
    requireString(classRecord.year, '学年・年度');
    if (!Array.isArray(classRecord.students) || classRecord.students.length === 0) fail('学級データが不正です');
    if (!Number.isInteger(classRecord.count) || classRecord.count !== classRecord.students.length || classRecord.count > 200) fail('学級人数が不正です');
    if (!Array.isArray(classRecord.weekdays) || classRecord.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) fail('授業曜日が不正です');
    requireObject(classRecord.exceptions, '授業日程の例外');
    if (Object.entries(classRecord.exceptions).some(([date, kind]) => !/^\d{4}-\d{2}-\d{2}$/.test(date) || !['on', 'off'].includes(kind))) fail('授業日程の例外が不正です');
    requireUnique(classRecord.students, '児童ID');
    const attendanceNumbers = new Set();
    for (const student of classRecord.students) {
      requireObject(student, '児童データ');
      requireString(student.no, '出席番号', { allowEmpty: false });
      requireString(student.name, '児童氏名', { allowEmpty: false });
      requireString(student.kana, 'よみがな');
      const normalizedNumber = String(Number(student.no));
      if (!/^\d+$/.test(student.no) || Number(student.no) < 1 || attendanceNumbers.has(normalizedNumber)) fail('出席番号が不正または重複しています');
      attendanceNumbers.add(normalizedNumber);
    }
  }

  function validateColumn(column) {
    requireObject(column, '評価列データ');
    requireString(column.title, '評価列タイトル', { allowEmpty: false });
    if (column.due !== undefined && !validDate(column.due)) fail('提出期限が不正です');
    for (const field of ['base', 'interval', 'penalty', 'redoPenalty', 'zeroDays']) requireFinite(column[field], '評価列の数値設定');
    if (!['days', 'lesson', 'none'].includes(column.basis)) fail('評価列の減点方式が不正です');
    if (typeof column.zeroFloor !== 'boolean' || typeof column.includeInTotal !== 'boolean' || typeof column.hidden !== 'boolean') fail('評価列の設定が不正です');
    if (!(column.inputMethod === null || ['cycle', 'direct', 'number'].includes(column.inputMethod))) fail('評価列の入力方法が不正です');
    try {
      paletteApi().validateSnapshot(column.paletteSnapshot);
    } catch (error) {
      fail(error && error.message ? error.message : '列のパレット設定が不正です');
    }
  }

  function validateRecordObject(records, allowedKeys, label, validateValue) {
    requireObject(records, label);
    for (const [key, value] of Object.entries(records)) {
      if (!allowedKeys.has(key)) fail(`${label}に対応する児童または評価列がありません`);
      validateValue(value);
    }
  }

  function sheetAppliesToClass(state, sheet, classId) {
    if (sheet.scope.type === 'class') return sheet.scope.classId === classId;
    const group = state.groups.find(item => item.id === sheet.scope.groupId);
    return Boolean(group && group.classIds.includes(classId));
  }

  function validateWorkspace(state) {
    requireObject(state, '保存データ');
    if (state.appId !== APP_ID) fail('TSUKERUの保存データではありません');
    if (Number(state.schemaVersion) > SCHEMA_VERSION) fail('このアプリより新しい形式の保存データです');
    if (Number(state.schemaVersion) !== SCHEMA_VERSION) fail('対応していない古い保存形式です');
    if (!Array.isArray(state.classes) || !Array.isArray(state.groups) || !Array.isArray(state.sheetDefinitions)) fail('保存データの一覧が不正です');
    requireObject(state.classRecords, 'クラス別記録');
    requireObject(state.preferences, 'ユーザー設定');
    validatePreferences(state.preferences);
    requireObject(state.ui, '画面状態');

    requireUnique(state.classes, '学級ID');
    state.classes.forEach(validateClass);
    const classIds = new Set(state.classes.map(item => item.id));

    requireUnique(state.groups, '合同グループID');
    for (const group of state.groups) {
      requireObject(group, '合同グループ');
      requireString(group.name, '合同グループ名', { allowEmpty: false });
      if (!Array.isArray(group.classIds) || new Set(group.classIds).size !== group.classIds.length || group.classIds.some(id => !classIds.has(id))) fail('合同グループの所属クラスが不正です');
    }
    const groupIds = new Set(state.groups.map(item => item.id));

    requireUnique(state.sheetDefinitions, 'チェック表ID');
    for (const sheet of state.sheetDefinitions) {
      requireObject(sheet, 'チェック表データ');
      requireString(sheet.name, 'チェック表名', { allowEmpty: false });
      if (!['submission', 'evaluation', 'number'].includes(sheet.type)) fail('チェック表の種類が不正です');
      requireObject(sheet.scope, 'チェック表の利用対象');
      if (sheet.scope.type === 'class') {
        if (!classIds.has(sheet.scope.classId)) fail('チェック表の対象クラスが不正です');
      } else if (sheet.scope.type === 'group') {
        if (!groupIds.has(sheet.scope.groupId)) fail('チェック表の合同グループが不正です');
      } else fail('チェック表の利用対象が不正です');
      if (!Array.isArray(sheet.columns) || sheet.columns.length === 0) fail('評価列データが不正です');
      requireUnique(sheet.columns, '評価列ID');
      sheet.columns.forEach(validateColumn);
      requireObject(sheet.dueDatesByClass, 'クラス別締切日');
      for (const [classId, dates] of Object.entries(sheet.dueDatesByClass)) {
        if (!classIds.has(classId)) fail('クラス別締切日の対象が不正です');
        requireObject(dates, 'クラス別締切日');
        const columnIds = new Set(sheet.columns.map(column => column.id));
        if (Object.entries(dates).some(([columnId, date]) => !columnIds.has(columnId) || !validDate(date))) fail('クラス別締切日が不正です');
      }
      if (!(sheet.archivedAt === null || (typeof sheet.archivedAt === 'string' && !Number.isNaN(Date.parse(sheet.archivedAt))))) fail('保管日時が不正です');
      if (!(sheet.archivedScope === undefined || sheet.archivedScope === null || isObject(sheet.archivedScope))) fail('保管前の利用対象が不正です');
    }

    const sheetsById = new Map(state.sheetDefinitions.map(sheet => [sheet.id, sheet]));
    for (const [classId, sheets] of Object.entries(state.classRecords)) {
      if (!classIds.has(classId)) fail('クラス別記録の対象クラスが不正です');
      requireObject(sheets, 'クラス別記録');
      const classRecord = state.classes.find(item => item.id === classId);
      for (const [sheetId, bucket] of Object.entries(sheets)) {
        const sheet = sheetsById.get(sheetId);
        if (!sheet || !sheetAppliesToClass(state, sheet, classId)) fail('クラス別記録のチェック表が不正です');
        requireObject(bucket, 'クラス別記録');
        const allowedKeys = new Set(sheet.columns.flatMap(column => classRecord.students.map(student => recordKey(column.id, student.id))));
        validateRecordObject(bucket.values, allowedKeys, '記録値', value => {
          if (typeof value !== 'string') fail('記録値が不正です');
        });
        validateRecordObject(bucket.meta, allowedKeys, '記録詳細', value => {
          requireObject(value, '記録詳細');
          for (const detail of Object.values(value)) {
            if (!(detail === null || ['string', 'number', 'boolean'].includes(typeof detail))) fail('記録詳細が不正です');
          }
        });
      }
    }

    if (!['home', 'record', 'settings'].includes(state.ui.view)) fail('画面状態が不正です');
    if (!(state.ui.currentClassId === null || classIds.has(state.ui.currentClassId))) fail('選択クラスが不正です');
    if (!(state.ui.currentSheetId === null || sheetsById.has(state.ui.currentSheetId))) fail('選択チェック表が不正です');
    if (!(state.ui.currentGroupId === null || groupIds.has(state.ui.currentGroupId))) fail('選択合同グループが不正です');
    if (!['class', 'combined'].includes(state.ui.recordMode)) fail('名簿表示状態が不正です');
    if (!(state.ui.lastColumnId === null || typeof state.ui.lastColumnId === 'string')) fail('選択評価列が不正です');
    if (typeof state.ui.kanaMode !== 'boolean' || typeof state.ui.numeric !== 'boolean') fail('画面状態が不正です');
    return state;
  }

  function migrateLegacy(raw) {
    if (!Array.isArray(raw.classes) || raw.classes.length === 0) fail('学級データがありません');
    const state = createEmptyWorkspace({ nowIso: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString() });
    const legacyUi = isObject(raw.ui) ? raw.ui : {};
    for (const legacyClass of raw.classes) {
      requireObject(legacyClass, '学級データ');
      if (!Array.isArray(legacyClass.sheets) || legacyClass.sheets.length === 0) fail('学級データが不正です');
      const { sheets, ...classFields } = clone(legacyClass);
      state.classes.push(classFields);
      state.classRecords[classFields.id] = {};
      for (const legacySheet of sheets) {
        requireObject(legacySheet, 'チェック表データ');
        const columns = clone(legacySheet.columns || []).map(column => ({
          ...column,
          includeInTotal: column.includeInTotal === undefined ? true : column.includeInTotal,
          hidden: column.hidden === undefined ? false : column.hidden,
          paletteSnapshot: paletteApi().paletteForColumn(state.preferences, legacySheet.type, column),
          inputMethod: null
        }));
        const dueDates = Object.fromEntries(columns.map(column => [column.id, column.due || '']));
        state.sheetDefinitions.push({
          id: legacySheet.id,
          name: legacySheet.name,
          type: legacySheet.type,
          scope: { type: 'class', classId: classFields.id },
          columns,
          dueDatesByClass: { [classFields.id]: dueDates },
          archivedAt: null,
          archivedScope: null
        });
        state.classRecords[classFields.id][legacySheet.id] = {
          values: clone(legacySheet.values || {}),
          meta: clone(legacySheet.meta || {})
        };
      }
    }
    const classIds = new Set(state.classes.map(item => item.id));
    const sheetIds = new Set(state.sheetDefinitions.map(item => item.id));
    const currentClassId = classIds.has(legacyUi.activeClassId) ? legacyUi.activeClassId : null;
    const currentSheetId = sheetIds.has(legacyUi.activeSheetId) ? legacyUi.activeSheetId : null;
    state.ui = {
      view: currentClassId && currentSheetId ? 'record' : 'home',
      currentClassId,
      currentSheetId,
      currentGroupId: null,
      recordMode: 'class',
      lastColumnId: typeof legacyUi.lastColumnId === 'string' ? legacyUi.lastColumnId : null,
      kanaMode: Boolean(legacyUi.kanaMode),
      numeric: Boolean(legacyUi.numeric)
    };
    return validateWorkspace(state);
  }

  function normalizeV3(raw) {
    const state = clone(raw);
    state.groups = Array.isArray(state.groups) ? state.groups : [];
    state.sheetDefinitions = Array.isArray(state.sheetDefinitions) ? state.sheetDefinitions : [];
    state.classRecords = isObject(state.classRecords) ? state.classRecords : {};
    state.preferences = normalizePreferences(isObject(state.preferences) ? state.preferences : {}, {
      nowIso: validIsoDate(state.savedAt) ? state.savedAt : new Date().toISOString()
    });
    state.ui = { ...defaultUi(), ...(isObject(state.ui) ? state.ui : {}) };
    for (const sheet of state.sheetDefinitions) {
      if (!isObject(sheet.dueDatesByClass)) sheet.dueDatesByClass = {};
      if (sheet.archivedAt === undefined) sheet.archivedAt = null;
      if (sheet.archivedScope === undefined) sheet.archivedScope = null;
      if (Array.isArray(sheet.columns)) {
        for (const column of sheet.columns) {
          if (column.includeInTotal === undefined) column.includeInTotal = true;
          if (column.hidden === undefined) column.hidden = false;
        }
      }
    }
    return validateWorkspace(state);
  }

  function migrateV2(raw) {
    const state = clone(raw);
    state.schemaVersion = SCHEMA_VERSION;
    state.groups = Array.isArray(state.groups) ? state.groups : [];
    state.sheetDefinitions = Array.isArray(state.sheetDefinitions) ? state.sheetDefinitions : [];
    state.classRecords = isObject(state.classRecords) ? state.classRecords : {};
    state.preferences = normalizePreferences(isObject(state.preferences) ? state.preferences : {}, {
      nowIso: validIsoDate(state.savedAt) ? state.savedAt : new Date().toISOString()
    });
    state.ui = { ...defaultUi(), ...(isObject(state.ui) ? state.ui : {}) };
    for (const sheet of state.sheetDefinitions) {
      if (!isObject(sheet.dueDatesByClass)) sheet.dueDatesByClass = {};
      if (sheet.archivedAt === undefined) sheet.archivedAt = null;
      if (sheet.archivedScope === undefined) sheet.archivedScope = null;
      if (Array.isArray(sheet.columns)) {
        for (const column of sheet.columns) {
          if (column.includeInTotal === undefined) column.includeInTotal = true;
          if (column.hidden === undefined) column.hidden = false;
          column.paletteSnapshot = paletteApi().paletteForColumn(state.preferences, sheet.type, column);
          column.inputMethod = ['cycle', 'direct', 'number'].includes(column.inputMethod) ? column.inputMethod : null;
        }
      }
    }
    return validateWorkspace(state);
  }

  function validIsoDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value));
  }

  function migrateWorkspace(rawState) {
    if (!isObject(rawState)) fail('保存データを読み取れません');
    if (rawState.appId !== APP_ID) fail('TSUKERUの保存データではありません');
    const version = Number(rawState.schemaVersion);
    if (version > SCHEMA_VERSION) fail('このアプリより新しい形式の保存データです');
    if (version === SCHEMA_VERSION && Array.isArray(rawState.sheetDefinitions)) return normalizeV3(rawState);
    if (version === 2 && Array.isArray(rawState.sheetDefinitions)) return migrateV2(rawState);
    if (version === 1 || (version === 2 && Array.isArray(rawState.classes))) return migrateLegacy(clone(rawState));
    fail('対応していない古い保存形式です');
  }

  function availableSheetsForClass(state, classId, { includeArchived = false } = {}) {
    const classRecord = state.classes.find(item => item.id === classId);
    if (!classRecord) return [];
    return state.sheetDefinitions.filter(sheet => {
      if (!includeArchived && sheet.archivedAt) return false;
      return sheetAppliesToClass(state, sheet, classId);
    });
  }

  function sheetsForGroup(state, groupId, { includeArchived = false } = {}) {
    if (!state?.groups?.some(group => group.id === groupId)) return [];
    return (state.sheetDefinitions || []).filter(sheet => (
      sheet.scope.type === 'group'
      && sheet.scope.groupId === groupId
      && (includeArchived || !sheet.archivedAt)
    ));
  }

  function dueSummaryForColumn(state, sheetId, columnId) {
    const sheet = state?.sheetDefinitions?.find(item => item.id === sheetId);
    if (!sheet) fail('チェック表が見つかりません');
    const column = sheet.columns.find(item => item.id === columnId);
    if (!column) fail('評価列が見つかりません');
    const values = classIdsForScope(state, sheet.scope).map(classId => (
      sheet.dueDatesByClass[classId]?.[columnId] ?? column.due ?? ''
    ));
    if (values.every(value => !value)) return { kind: 'none', value: '' };
    if (new Set(values).size === 1) return { kind: 'same', value: values[0] };
    return { kind: 'mixed', value: '' };
  }

  function ensureClassRecord(state, classId, sheetId) {
    const sheet = state.sheetDefinitions.find(item => item.id === sheetId);
    if (!state.classes.some(item => item.id === classId) || !sheet || !sheetAppliesToClass(state, sheet, classId)) fail('クラス別記録の対象が不正です');
    if (!isObject(state.classRecords[classId])) state.classRecords[classId] = {};
    if (!isObject(state.classRecords[classId][sheetId])) state.classRecords[classId][sheetId] = { values: {}, meta: {} };
    return state.classRecords[classId][sheetId];
  }

  function requireClassIds(state, classIds) {
    if (!Array.isArray(classIds) || classIds.length === 0 || new Set(classIds).size !== classIds.length) fail('合同グループの所属クラスが不正です');
    const known = new Set(state.classes.map(item => item.id));
    if (classIds.some(id => !known.has(id))) fail('合同グループの所属クラスが不正です');
  }

  function createGroup(state, { name, classIds }, { idFactory = defaultIdFactory } = {}) {
    const next = migrateWorkspace(state);
    requireString(name, '合同グループ名', { allowEmpty: false });
    requireClassIds(next, classIds);
    const id = idFactory('group');
    if (typeof id !== 'string' || !id || next.groups.some(group => group.id === id)) fail('合同グループIDが不正または重複しています');
    next.groups.push({ id, name: name.trim(), classIds: [...classIds] });
    return validateWorkspace(next);
  }

  function updateGroup(state, groupId, { name, classIds }) {
    const next = migrateWorkspace(state);
    const group = next.groups.find(item => item.id === groupId);
    if (!group) fail('合同グループが見つかりません');
    requireString(name, '合同グループ名', { allowEmpty: false });
    requireClassIds(next, classIds);
    if (group.classIds.some(classId => !classIds.includes(classId))) fail('クラスを外す操作は記録を確認してから行ってください');
    group.name = name.trim();
    group.classIds = [...classIds];
    return validateWorkspace(next);
  }

  function promoteSheetToGroup(state, { sheetId, groupId }) {
    const next = migrateWorkspace(state);
    const sheet = next.sheetDefinitions.find(item => item.id === sheetId);
    const group = next.groups.find(item => item.id === groupId);
    if (!sheet) fail('共有するチェック表が見つかりません');
    if (!group) fail('合同グループが見つかりません');
    if (sheet.scope.type !== 'class') fail('このチェック表はすでに共有されています');
    const ownerClassId = sheet.scope.classId;
    if (!group.classIds.includes(ownerClassId)) fail('元のクラスが合同グループに含まれていません');
    sheet.scope = { type: 'group', groupId };
    for (const classId of group.classIds) {
      const existing = isObject(sheet.dueDatesByClass[classId]) ? sheet.dueDatesByClass[classId] : {};
      sheet.dueDatesByClass[classId] = Object.fromEntries(sheet.columns.map(column => [
        column.id,
        validDate(existing[column.id]) ? existing[column.id] : classId === ownerClassId ? column.due || '' : ''
      ]));
      ensureClassRecord(next, classId, sheetId);
    }
    return validateWorkspace(next);
  }

  function detachSheetFromGroup(state, { sheetId, idFactory = defaultIdFactory }) {
    const next = migrateWorkspace(state);
    const sheetIndex = next.sheetDefinitions.findIndex(item => item.id === sheetId);
    const sheet = next.sheetDefinitions[sheetIndex];
    if (!sheet || sheet.archivedAt || sheet.scope.type !== 'group') fail('共有を解除するチェック表が見つかりません');
    const group = next.groups.find(item => item.id === sheet.scope.groupId);
    if (!group) fail('合同グループが見つかりません');

    const usedIds = new Set(next.sheetDefinitions.map(item => item.id));
    const replacements = group.classIds.map((classId, index) => {
      const id = index === 0 ? sheet.id : idFactory('sheet');
      if (typeof id !== 'string' || !SAFE_ID_PATTERN.test(id) || (index > 0 && usedIds.has(id))) fail('チェック表IDが不正または重複しています');
      usedIds.add(id);
      const dates = isObject(sheet.dueDatesByClass[classId]) ? clone(sheet.dueDatesByClass[classId]) : {};
      return {
        ...clone(sheet), id,
        scope: { type: 'class', classId },
        columns: sheet.columns.map(column => ({ ...clone(column), due: dates[column.id] ?? column.due ?? '' })),
        dueDatesByClass: { [classId]: dates },
        archivedAt: null,
        archivedScope: null
      };
    });

    const buckets = group.classIds.map(classId => clone(next.classRecords[classId]?.[sheet.id] || { values: {}, meta: {} }));
    next.sheetDefinitions.splice(sheetIndex, 1, ...replacements);
    group.classIds.forEach((classId, index) => {
      const replacementId = replacements[index].id;
      const bucket = buckets[index];
      if (replacementId !== sheet.id) {
        next.classRecords[classId][replacementId] = bucket;
        delete next.classRecords[classId][sheet.id];
      }
    });
    const currentReplacement = replacements.find(item => item.scope.classId === next.ui.currentClassId) || replacements[0];
    if (next.ui.currentSheetId === sheet.id) next.ui.currentSheetId = currentReplacement.id;
    if (next.ui.currentGroupId === group.id) next.ui.currentGroupId = null;
    next.ui.recordMode = 'class';
    return validateWorkspace(next);
  }

  function rowsForSheet(state, { sheetId, classId, groupId = null, mode = 'class' }) {
    const current = migrateWorkspace(state);
    const sheet = current.sheetDefinitions.find(item => item.id === sheetId);
    if (!sheet) fail('チェック表が見つかりません');
    let classIds;
    if (mode === 'combined') {
      const targetGroupId = groupId || (sheet.scope.type === 'group' ? sheet.scope.groupId : null);
      const group = current.groups.find(item => item.id === targetGroupId);
      if (!group || sheet.scope.type !== 'group' || sheet.scope.groupId !== group.id) fail('合同表示の対象が不正です');
      classIds = group.classIds;
    } else {
      if (!sheetAppliesToClass(current, sheet, classId)) fail('クラス別表示の対象が不正です');
      classIds = [classId];
    }
    return classIds.flatMap(id => {
      const classRecord = current.classes.find(item => item.id === id);
      return [
        { kind: 'section', classId: id, className: classRecord.name, rowKey: `section:${id}` },
        ...classRecord.students.map(student => ({
          kind: 'student', classId: id, studentId: student.id,
          rowKey: `${id}:${student.id}`, no: student.no, name: student.name,
          kana: student.kana, student: clone(student)
        }))
      ];
    });
  }

  function bucketHasRecords(bucket) {
    return Boolean(bucket && (Object.keys(bucket.values || {}).length || Object.keys(bucket.meta || {}).length));
  }

  function removeClassFromGroup(state, { groupId, classId, preserveRecordedSheet, idFactory = defaultIdFactory }) {
    const next = migrateWorkspace(state);
    const group = next.groups.find(item => item.id === groupId);
    if (!group || !group.classIds.includes(classId)) fail('合同グループの対象クラスが見つかりません');
    const sharedSheets = next.sheetDefinitions.filter(sheet => sheet.scope.type === 'group' && sheet.scope.groupId === groupId);
    const recordedSheets = sharedSheets.filter(sheet => bucketHasRecords(next.classRecords[classId]?.[sheet.id]));
    if (recordedSheets.length && preserveRecordedSheet !== true) fail('記録をクラス専用シートとして残す確認が必要です');

    group.classIds = group.classIds.filter(id => id !== classId);
    for (const sheet of sharedSheets) {
      const bucket = next.classRecords[classId]?.[sheet.id];
      if (bucketHasRecords(bucket)) {
        const detachedId = idFactory('sheet');
        if (typeof detachedId !== 'string' || !detachedId || next.sheetDefinitions.some(item => item.id === detachedId)) fail('チェック表IDが不正または重複しています');
        const dates = isObject(sheet.dueDatesByClass[classId]) ? clone(sheet.dueDatesByClass[classId]) : {};
        next.sheetDefinitions.push({
          ...clone(sheet),
          id: detachedId,
          scope: { type: 'class', classId },
          columns: sheet.columns.map(column => ({ ...clone(column), due: dates[column.id] ?? column.due ?? '' })),
          dueDatesByClass: { [classId]: dates }
        });
        next.classRecords[classId][detachedId] = clone(bucket);
      }
      if (next.classRecords[classId]) delete next.classRecords[classId][sheet.id];
      delete sheet.dueDatesByClass[classId];
    }
    return validateWorkspace(next);
  }

  function deleteGroup(state, groupId, { idFactory = defaultIdFactory } = {}) {
    const next = migrateWorkspace(state);
    const targetGroup = next.groups.find(group => group.id === groupId);
    if (!targetGroup) fail('合同グループが見つかりません');
    const sharedSheets = next.sheetDefinitions.filter(sheet => sheet.scope.type === 'group' && sheet.scope.groupId === groupId);
    if (sharedSheets.some(sheet => !sheet.archivedAt)) fail('共有シートが残っているため合同グループを削除できません');
    for (const sheet of sharedSheets) {
      const detachedIds = new Set();
      const replacements = targetGroup.classIds.map((classId, index) => {
        const id = index === 0 ? sheet.id : idFactory('sheet');
        if (typeof id !== 'string' || !id || detachedIds.has(id) || (index > 0 && next.sheetDefinitions.some(item => item.id === id))) fail('チェック表IDが不正または重複しています');
        detachedIds.add(id);
        const dates = isObject(sheet.dueDatesByClass[classId]) ? clone(sheet.dueDatesByClass[classId]) : {};
        return {
          ...clone(sheet), id,
          scope: { type: 'class', classId },
          archivedScope: { type: 'class', classId },
          columns: sheet.columns.map(column => ({ ...clone(column), due: dates[column.id] ?? column.due ?? '' })),
          dueDatesByClass: { [classId]: dates }
        };
      });
      for (const classId of targetGroup.classIds) {
        const bucket = clone(next.classRecords[classId]?.[sheet.id] || { values: {}, meta: {} });
        if (!isObject(next.classRecords[classId])) next.classRecords[classId] = {};
        delete next.classRecords[classId][sheet.id];
        const replacement = replacements.find(item => item.scope.classId === classId);
        next.classRecords[classId][replacement.id] = bucket;
      }
      next.sheetDefinitions = next.sheetDefinitions.filter(item => item.id !== sheet.id);
      next.sheetDefinitions.push(...replacements);
    }
    next.groups = next.groups.filter(group => group.id !== groupId);
    if (next.ui.currentGroupId === groupId) next.ui.currentGroupId = null;
    return validateWorkspace(next);
  }

  function classIdsForScope(state, scope) {
    requireObject(scope, 'チェック表の利用対象');
    if (scope.type === 'class') {
      if (!state.classes.some(item => item.id === scope.classId)) fail('チェック表の対象クラスが不正です');
      return [scope.classId];
    }
    if (scope.type === 'group') {
      const group = state.groups.find(item => item.id === scope.groupId);
      if (!group) fail('チェック表の合同グループが不正です');
      if (!group.classIds.length) fail('合同グループにクラスがありません');
      return [...group.classIds];
    }
    fail('チェック表の利用対象が不正です');
  }

  function normalizedColumn(column, idFactory, sheetType, preferences) {
    const id = typeof column.id === 'string' && column.id ? column.id : idFactory('column');
    let paletteSnapshot;
    try {
      paletteSnapshot = column.paletteSnapshot
        ? paletteApi().validateSnapshot(column.paletteSnapshot)
        : paletteApi().paletteForColumn(preferences, sheetType, column);
    } catch (error) {
      fail(error && error.message ? error.message : '列のパレット設定が不正です');
    }
    const paletteMaximum = paletteApi().maxPaletteScore(paletteSnapshot);
    return {
      id,
      title: String(column.title || '').trim(),
      due: validDate(column.due) ? column.due : '',
      base: paletteMaximum === null
        ? (Number.isFinite(Number(column.base)) ? Number(column.base) : 0)
        : paletteMaximum,
      interval: Number.isFinite(Number(column.interval)) ? Math.max(1, Number(column.interval)) : 3,
      penalty: Number.isFinite(Number(column.penalty)) ? Math.max(0, Number(column.penalty)) : 1,
      basis: ['days', 'lesson', 'none'].includes(column.basis) ? column.basis : 'days',
      redoPenalty: Number.isFinite(Number(column.redoPenalty)) ? Math.max(0, Number(column.redoPenalty)) : 1,
      zeroDays: Number.isFinite(Number(column.zeroDays)) ? Math.max(1, Number(column.zeroDays)) : 30,
      zeroFloor: column.zeroFloor === undefined ? true : Boolean(column.zeroFloor),
      includeInTotal: column.includeInTotal === undefined ? true : Boolean(column.includeInTotal),
      hidden: column.hidden === undefined ? false : Boolean(column.hidden),
      paletteSnapshot,
      inputMethod: ['cycle', 'direct', 'number'].includes(column.inputMethod) ? column.inputMethod : null
    };
  }

  function normalizeDueDates(classIds, columns, dueDatesByClass) {
    const source = isObject(dueDatesByClass) ? dueDatesByClass : {};
    return Object.fromEntries(classIds.map(classId => [classId, Object.fromEntries(columns.map(column => {
      const value = source[classId]?.[column.id] ?? column.due ?? '';
      return [column.id, validDate(value) ? value : ''];
    }))]));
  }

  function createSheetDefinition(state, { name, type, scope, columns, dueDatesByClass = {} }, { idFactory = defaultIdFactory } = {}) {
    const next = migrateWorkspace(state);
    const classIds = classIdsForScope(next, scope);
    requireString(name, 'チェック表名', { allowEmpty: false });
    if (!['submission', 'evaluation', 'number'].includes(type)) fail('チェック表の種類が不正です');
    if (!Array.isArray(columns) || !columns.length) fail('評価列データが不正です');
    const normalizedColumns = columns.map(column => normalizedColumn(column, idFactory, type, next.preferences));
    const id = idFactory('sheet');
    const dates = normalizeDueDates(classIds, normalizedColumns, dueDatesByClass);
    normalizedColumns.forEach(column => { column.due = dates[classIds[0]][column.id] || ''; });
    next.sheetDefinitions.push({
      id, name: name.trim(), type, scope: clone(scope), columns: normalizedColumns,
      dueDatesByClass: dates, archivedAt: null, archivedScope: null
    });
    for (const classId of classIds) {
      if (!isObject(next.classRecords[classId])) next.classRecords[classId] = {};
      next.classRecords[classId][id] = { values: {}, meta: {} };
    }
    return validateWorkspace(next);
  }

  function updateSheetDefinition(state, sheetId, { name, type, columns, dueDatesByClass = {} }) {
    const next = migrateWorkspace(state);
    const sheet = next.sheetDefinitions.find(item => item.id === sheetId);
    if (!sheet || sheet.archivedAt) fail('更新するチェック表が見つかりません');
    requireString(name, 'チェック表名', { allowEmpty: false });
    if (!['submission', 'evaluation', 'number'].includes(type)) fail('チェック表の種類が不正です');
    if (!Array.isArray(columns) || !columns.length) fail('評価列データが不正です');
    const oldColumnIds = new Set(sheet.columns.map(column => column.id));
    const normalizedColumns = columns.map(column => normalizedColumn(column, defaultIdFactory, type, next.preferences));
    const nextColumnIds = new Set(normalizedColumns.map(column => column.id));
    const removed = [...oldColumnIds].filter(id => !nextColumnIds.has(id));
    if (removed.length) {
      const hasRecords = Object.values(next.classRecords).some(bySheet => {
        const bucket = bySheet[sheetId];
        return bucket && [...Object.keys(bucket.values), ...Object.keys(bucket.meta)].some(key => removed.some(id => key.startsWith(`${id}:`)));
      });
      if (hasRecords) fail('記録がある列は削除できません');
    }
    const classIds = classIdsForScope(next, sheet.scope);
    sheet.name = name.trim();
    sheet.type = type;
    sheet.columns = normalizedColumns;
    sheet.dueDatesByClass = normalizeDueDates(classIds, normalizedColumns, dueDatesByClass);
    sheet.columns.forEach(column => { column.due = sheet.dueDatesByClass[classIds[0]][column.id] || ''; });
    return validateWorkspace(next);
  }

  function archiveSheet(state, sheetId, archivedAt = new Date().toISOString()) {
    const next = migrateWorkspace(state);
    const sheet = next.sheetDefinitions.find(item => item.id === sheetId);
    if (!sheet) fail('保管するチェック表が見つかりません');
    if (typeof archivedAt !== 'string' || Number.isNaN(Date.parse(archivedAt))) fail('保管日時が不正です');
    if (sheet.archivedAt) fail('このチェック表はすでに保管されています');
    sheet.archivedScope = clone(sheet.scope);
    sheet.archivedAt = archivedAt;
    return validateWorkspace(next);
  }

  function restoreSheet(state, sheetId) {
    const next = migrateWorkspace(state);
    const sheet = next.sheetDefinitions.find(item => item.id === sheetId);
    if (!sheet) fail('復元するチェック表が見つかりません');
    if (!sheet.archivedAt) fail('このチェック表は保管されていません');
    if (sheet.archivedScope) sheet.scope = clone(sheet.archivedScope);
    sheet.archivedAt = null;
    sheet.archivedScope = null;
    return validateWorkspace(next);
  }

  function clearRecordCell(state, classId, sheetId, columnId, studentId) {
    const next = migrateWorkspace(state);
    const classRecord = next.classes.find(item => item.id === classId);
    if (!classRecord) fail('クラスが見つかりません');
    if (!classRecord.students.some(student => student.id === studentId)) fail('児童が見つかりません');
    const sheet = next.sheetDefinitions.find(item => item.id === sheetId);
    if (!sheet || !sheetAppliesToClass(next, sheet, classId)) fail('チェック表が見つかりません');
    if (!sheet.columns.some(column => column.id === columnId)) fail('評価列が見つかりません');
    const bucket = ensureClassRecord(next, classId, sheetId);
    const key = recordKey(columnId, studentId);
    delete bucket.values[key];
    delete bucket.meta[key];
    return validateWorkspace(next);
  }

  function recordCountForColumn(state, sheetId, columnId, classIds) {
    const keys = new Set();
    for (const classId of classIds) {
      const bucket = state.classRecords[classId]?.[sheetId];
      const columnKeys = new Set((state.classes.find(item => item.id === classId)?.students || []).map(student => recordKey(columnId, student.id)));
      for (const key of [...Object.keys(bucket?.values || {}), ...Object.keys(bucket?.meta || {})]) {
        if (columnKeys.has(key)) keys.add(`${classId}:${key}`);
      }
    }
    return keys.size;
  }

  function columnDeletionSummary(state, sheetId, columnId) {
    const current = migrateWorkspace(state);
    const sheet = current.sheetDefinitions.find(item => item.id === sheetId);
    if (!sheet) fail('チェック表が見つかりません');
    if (!sheet.columns.some(column => column.id === columnId)) fail('評価列が見つかりません');
    const classIds = classIdsForScope(current, sheet.scope);
    return { recordCount: recordCountForColumn(current, sheetId, columnId, classIds), classIds };
  }

  function deleteSheetColumn(state, sheetId, columnId) {
    const next = migrateWorkspace(state);
    const sheet = next.sheetDefinitions.find(item => item.id === sheetId);
    if (!sheet) fail('チェック表が見つかりません');
    const columnIndex = sheet.columns.findIndex(column => column.id === columnId);
    if (columnIndex < 0) fail('評価列が見つかりません');
    if (sheet.columns.length === 1) fail('最後の1列は削除できません');
    sheet.columns.splice(columnIndex, 1);
    for (const dates of Object.values(sheet.dueDatesByClass)) delete dates[columnId];
    for (const [classId, sheets] of Object.entries(next.classRecords)) {
      const bucket = sheets[sheetId];
      if (!bucket) continue;
      const columnKeys = new Set((next.classes.find(item => item.id === classId)?.students || []).map(student => recordKey(columnId, student.id)));
      for (const key of Object.keys(bucket.values)) if (columnKeys.has(key)) delete bucket.values[key];
      for (const key of Object.keys(bucket.meta)) if (columnKeys.has(key)) delete bucket.meta[key];
    }
    if (next.ui.currentSheetId === sheetId && next.ui.lastColumnId === columnId) {
      next.ui.lastColumnId = sheet.columns[0]?.id || null;
    }
    return validateWorkspace(next);
  }

  function sheetDeletionSummary(state, sheetId) {
    const current = migrateWorkspace(state);
    const sheet = current.sheetDefinitions.find(item => item.id === sheetId);
    if (!sheet) fail('チェック表が見つかりません');
    const classIds = classIdsForScope(current, sheet.scope);
    const cells = new Set();
    for (const classId of classIds) {
      const bucket = current.classRecords[classId]?.[sheetId];
      for (const key of [...Object.keys(bucket?.values || {}), ...Object.keys(bucket?.meta || {})]) cells.add(`${classId}:${key}`);
    }
    return { recordCount: cells.size, classIds };
  }

  function deleteArchivedSheet(state, sheetId) {
    const next = migrateWorkspace(state);
    const sheet = next.sheetDefinitions.find(item => item.id === sheetId);
    if (!sheet) fail('チェック表が見つかりません');
    if (!sheet.archivedAt) fail('使用中のチェック表です。先に保管してください');
    next.sheetDefinitions = next.sheetDefinitions.filter(item => item.id !== sheetId);
    for (const sheets of Object.values(next.classRecords)) delete sheets[sheetId];
    if (next.ui.currentSheetId === sheetId) {
      next.ui.currentSheetId = null;
      next.ui.lastColumnId = null;
    }
    return validateWorkspace(next);
  }

  function academicDataSummary(state) {
    const current = migrateWorkspace(state);
    return {
      classCount: current.classes.length,
      studentCount: current.classes.reduce((sum, item) => sum + item.students.length, 0),
      groupCount: current.groups.length,
      activeSheetCount: current.sheetDefinitions.filter(sheet => !sheet.archivedAt).length,
      archivedSheetCount: current.sheetDefinitions.filter(sheet => Boolean(sheet.archivedAt)).length,
      recordCount: Object.values(current.classRecords).reduce((total, sheets) => total + Object.values(sheets).reduce(
        (sheetTotal, bucket) => sheetTotal + Object.keys(bucket.values || {}).length,
        0
      ), 0)
    };
  }

  function resetAcademicData(state) {
    const current = migrateWorkspace(state);
    const empty = createEmptyWorkspace();
    empty.preferences = clone(current.preferences);
    return validateWorkspace(empty);
  }

  root.TSUKERUWorkspace = Object.freeze({
    APP_ID, SCHEMA_VERSION, WorkspaceValidationError,
    createEmptyWorkspace, migrateWorkspace, validateWorkspace,
    ensureClassRecord, availableSheetsForClass, sheetsForGroup, dueSummaryForColumn,
    createGroup, updateGroup, promoteSheetToGroup, detachSheetFromGroup, rowsForSheet,
    removeClassFromGroup, deleteGroup, createSheetDefinition, updateSheetDefinition,
    archiveSheet, restoreSheet, clearRecordCell, columnDeletionSummary, deleteSheetColumn,
    sheetDeletionSummary, deleteArchivedSheet, resetAcademicData, academicDataSummary
  });
})(globalThis);
