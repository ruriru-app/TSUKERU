(function (root) {
  const numberHeaders = new Set(['出席番号', '番号', 'no', 'No.', 'NO']);
  const nameHeaders = new Set(['氏名', '名前', '児童名', '生徒名']);

  function normalizedNumber(value) {
    const text = String(value ?? '').trim();
    return /^\d+$/.test(text) && Number(text) > 0 ? String(Number(text)) : null;
  }

  function isHeader(parts) {
    return numberHeaders.has(parts[0]) && nameHeaders.has(parts[1]);
  }

  function parseRoster(text) {
    const rows = [];
    const errors = [];
    const warnings = [];
    const seen = new Map();
    const lines = String(text ?? '').replace(/\r/g, '').split('\n');
    lines.forEach((rawLine, index) => {
      if (!rawLine.trim()) return;
      const separator = rawLine.includes('\t') ? '\t' : /[,，]/.test(rawLine) ? /[,，]/ : null;
      if (!separator) {
        errors.push({ code: 'UNRECOGNIZED_ROW', line: index + 1, message: '列を判定できません' });
        return;
      }
      const parts = rawLine.split(separator).map(value => value.trim());
      if (isHeader(parts)) return;
      const no = normalizedNumber(parts[0]);
      const name = String(parts[1] ?? '').trim();
      const kana = parts.slice(2).join(separator === '\t' ? '\t' : ' ').trim();
      if (!String(parts[0] ?? '').trim()) {
        errors.push({ code: 'MISSING_NUMBER', line: index + 1, message: '出席番号が空欄です' });
        return;
      }
      if (!no) {
        errors.push({ code: 'INVALID_NUMBER', line: index + 1, message: '出席番号は1以上の整数にしてください' });
        return;
      }
      if (!name) {
        errors.push({ code: 'MISSING_NAME', line: index + 1, no, message: '氏名が空欄です' });
        return;
      }
      if (seen.has(no)) {
        errors.push({ code: 'DUPLICATE_NUMBER', line: index + 1, no, firstLine: seen.get(no), message: `出席番号${no}が重複しています` });
        return;
      }
      seen.set(no, index + 1);
      rows.push({ no, name, kana });
      if (!kana) warnings.push({ code: 'MISSING_KANA', line: index + 1, no, message: 'よみがなが空欄です' });
    });
    return { rows, errors, warnings };
  }

  function recordCount(student) {
    return Math.max(0, Number(student.recordCount) || 0);
  }

  function planRosterImport(existingStudents, parsedRows) {
    const existing = Array.isArray(existingStudents) ? existingStudents : [];
    const rows = Array.isArray(parsedRows) ? parsedRows : [];
    const byNo = new Map(existing.map(student => [normalizedNumber(student.no), student]));
    const matchedStudentIds = new Set();
    const matchedRowNumbers = new Set();
    const unchanged = [];
    const corrected = [];
    const identityOwners = new Map(existing.map(student => [`${student.name}\u0000${student.kana || ''}`, student.id]));

    for (const row of rows) {
      const student = byNo.get(normalizedNumber(row.no));
      if (!student) continue;
      matchedStudentIds.add(student.id);
      matchedRowNumbers.add(normalizedNumber(row.no));
      const item = { studentId: student.id, before: { no: normalizedNumber(student.no), name: student.name, kana: student.kana || '' }, after: { ...row, no: normalizedNumber(row.no) }, recordCount: recordCount(student) };
      if (item.before.name === item.after.name && item.before.kana === item.after.kana) unchanged.push(item);
      else corrected.push(item);
    }

    const unmatchedExisting = existing.filter(student => !matchedStudentIds.has(student.id));
    const unmatchedRows = rows.filter(row => !matchedRowNumbers.has(normalizedNumber(row.no)));
    const renumbered = [];
    const usedRenumberIds = new Set();
    const usedRenumberNos = new Set();
    for (const row of unmatchedRows) {
      const candidates = unmatchedExisting.filter(student => !usedRenumberIds.has(student.id) && student.name === row.name && (student.kana || '') === (row.kana || ''));
      if (candidates.length !== 1) continue;
      const student = candidates[0];
      usedRenumberIds.add(student.id);
      usedRenumberNos.add(normalizedNumber(row.no));
      matchedStudentIds.add(student.id);
      renumbered.push({ studentId: student.id, before: { no: normalizedNumber(student.no), name: student.name, kana: student.kana || '' }, after: { ...row, no: normalizedNumber(row.no) }, recordCount: recordCount(student) });
    }

    const added = unmatchedRows.filter(row => !usedRenumberNos.has(normalizedNumber(row.no))).map(row => ({ row: { ...row, no: normalizedNumber(row.no) } }));
    const missing = existing.filter(student => !matchedStudentIds.has(student.id)).map(student => ({ studentId: student.id, student, recordCount: recordCount(student) }));
    const reassignments = corrected.filter(item => {
      const owner = identityOwners.get(`${item.after.name}\u0000${item.after.kana || ''}`);
      return owner && owner !== item.studentId;
    });
    return {
      unchanged, corrected, added, renumbered,
      correctedWithRecords: corrected.filter(item => item.recordCount > 0),
      reassignments,
      missingWithRecords: missing.filter(item => item.recordCount > 0),
      missingWithoutRecords: missing.filter(item => item.recordCount === 0)
    };
  }

  function applyRosterImport(existingStudents, plan, options = {}) {
    const idFactory = options.idFactory || (() => `student-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const byId = new Map((existingStudents || []).map(student => [student.id, { ...student, no: normalizedNumber(student.no) }]));
    const reassignmentIds = new Set((plan.reassignments || []).map(item => item.studentId));
    for (const item of plan.corrected || []) {
      const student = byId.get(item.studentId);
      if (item.recordCount > 0 && !options.allowRecordCorrection) continue;
      if (reassignmentIds.has(item.studentId) && !options.allowReassignment) continue;
      if (student) Object.assign(student, item.after);
    }
    if (options.allowRenumber) {
      for (const item of plan.renumbered || []) {
        const student = byId.get(item.studentId);
        if (student) Object.assign(student, item.after);
      }
    }
    const removeIds = new Set(options.removeStudentIds || []);
    for (const item of [...(plan.missingWithoutRecords || []), ...(plan.missingWithRecords || [])]) {
      if (!removeIds.has(item.studentId)) continue;
      if (item.recordCount > 0 && !options.allowRecordDeletion) continue;
      byId.delete(item.studentId);
    }
    for (const item of plan.added || []) {
      const id = idFactory('student');
      byId.set(id, { id, ...item.row });
    }
    return [...byId.values()].sort((a, b) => Number(a.no) - Number(b.no) || a.name.localeCompare(b.name, 'ja'));
  }

  root.TSUKERURoster = Object.freeze({ normalizedNumber, parseRoster, planRosterImport, applyRosterImport });
})(globalThis);
