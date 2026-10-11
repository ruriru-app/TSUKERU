(function (root) {
  function fail(message) {
    throw new Error(message);
  }

  function exactRecordKey(columnId, studentId) {
    return `${columnId}:${studentId}`;
  }

  function shortDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return String(value || '');
    const [, month, day] = value.split('-');
    return `${Number(month)}/${Number(day)}`;
  }

  function sheetFor(state, sheetId) {
    const sheet = state?.sheetDefinitions?.find(item => item.id === sheetId);
    if (!sheet || sheet.archivedAt) fail('出力するチェック表が見つかりません');
    return sheet;
  }

  function scopeClassIds(state, sheet) {
    if (sheet.scope?.type === 'class') return [sheet.scope.classId];
    if (sheet.scope?.type === 'group') {
      const group = state.groups?.find(item => item.id === sheet.scope.groupId);
      if (!group) fail('チェック表の合同グループが見つかりません');
      const members = new Set(group.classIds);
      return state.classes.filter(item => members.has(item.id)).map(item => item.id);
    }
    fail('チェック表の対象クラスが不正です');
  }

  function resolveClassIds(state, { sheetId, mode, currentClassId }) {
    const sheet = sheetFor(state, sheetId);
    const allowed = scopeClassIds(state, sheet);
    if (mode === 'all') return allowed;
    if (mode !== 'current') fail('出力範囲が不正です');
    if (!allowed.includes(currentClassId)) fail('現在のクラスはこのチェック表の対象ではありません');
    return [currentClassId];
  }

  function dueFor(sheet, classId, column) {
    return sheet.dueDatesByClass?.[classId]?.[column.id] ?? column.due ?? '';
  }

  function redoStatus(value, meta) {
    if (!(meta?.redo || String(value || '').startsWith('再'))) return '';
    if (meta?.submitted) return '再提出済み';
    if (meta?.returned) return '返却済み';
    return '再提出待ち';
  }

  function displayValue(sheetType, value, evaluation) {
    if (sheetType !== 'submission') return shortDate(value);
    if (!evaluation?.submitted) return String(value || '');
    return `${evaluation.redone ? '再' : ''}${evaluation.zeroLocked ? '⚠' : ''}${shortDate(evaluation.submitted)}`;
  }

  function buildClass(rootDomain, state, sheet, classId, today) {
    const classRecord = state.classes.find(item => item.id === classId);
    if (!classRecord) fail('出力するクラスが見つかりません');
    const allowed = scopeClassIds(state, sheet);
    if (!allowed.includes(classId)) fail('選択したクラスはこのチェック表の対象ではありません');
    const bucket = state.classRecords?.[classId]?.[sheet.id] || { values: {}, meta: {} };
    const schedule = { weekdays: classRecord.weekdays, exceptions: classRecord.exceptions };
    const columns = sheet.columns.map(column => ({
      id: column.id,
      title: column.title,
      due: dueFor(sheet, classId, column),
      points: Number.isFinite(Number(column.base)) ? Number(column.base) : null,
      includeInTotal: column.includeInTotal !== false
    }));
    const rows = classRecord.students.map(student => {
      const cells = sheet.columns.map(column => {
        const key = exactRecordKey(column.id, student.id);
        const raw = bucket.values?.[key] ?? '';
        const meta = bucket.meta?.[key] || {};
        const classColumn = { ...column, due: dueFor(sheet, classId, column) };
        const evaluation = sheet.type === 'submission'
          ? rootDomain.submissionEvaluation({ column: classColumn, value: raw, meta, schedule, today })
          : null;
        const result = rootDomain.scoreRecord({
          sheetType: sheet.type, column: classColumn, value: raw, meta, schedule, today
        });
        return {
          columnId: column.id,
          raw: String(raw),
          display: displayValue(sheet.type, raw, evaluation),
          score: typeof result === 'number' && Number.isFinite(result) ? result : null,
          redoStatus: redoStatus(raw, meta)
        };
      });
      const scores = cells.flatMap((cell, index) => (
        columns[index].includeInTotal && typeof cell.score === 'number' ? [cell.score] : []
      ));
      return {
        studentId: student.id,
        no: String(student.no),
        name: student.name,
        kana: student.kana,
        cells,
        total: scores.length ? scores.reduce((sum, value) => sum + value, 0) : null
      };
    });
    return {
      classId,
      school: classRecord.school,
      year: classRecord.year,
      className: classRecord.name,
      columns,
      rows
    };
  }

  function createBundle(state, { sheetId, classIds, today, exportedAt }) {
    const domain = root.TSUKERUDomain;
    if (!domain) fail('評価計算を読み込めません');
    const sheet = sheetFor(state, sheetId);
    if (!Array.isArray(classIds) || !classIds.length) fail('出力するクラスを選択してください');
    if (new Set(classIds).size !== classIds.length) fail('出力するクラスが重複しています');
    return {
      sheetId: sheet.id,
      sheetName: sheet.name,
      sheetType: sheet.type,
      exportedAt,
      classes: classIds.map(classId => buildClass(domain, state, sheet, classId, today))
    };
  }

  root.TSUKERUExportModel = Object.freeze({ resolveClassIds, createBundle });
})(globalThis);
