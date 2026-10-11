(function (root) {
  function dateIndex(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const milliseconds = Date.parse(`${iso}T00:00:00Z`);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === iso
      ? Math.floor(milliseconds / 86400000)
      : null;
  }

  function dateFromIndex(index) {
    return Number.isFinite(index) ? new Date(index * 86400000).toISOString().slice(0, 10) : null;
  }

  function datePlus(iso, days) {
    const start = dateIndex(iso);
    return start === null ? null : dateFromIndex(start + days);
  }

  function daysBetween(startIso, endIso) {
    const start = dateIndex(startIso);
    const end = dateIndex(endIso);
    return start === null || end === null ? 0 : Math.max(0, end - start);
  }

  function normalizeSchedule(schedule = {}) {
    const weekdays = Array.isArray(schedule.weekdays)
      ? [...new Set(schedule.weekdays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
      : [2, 4];
    const exceptions = schedule.exceptions && typeof schedule.exceptions === 'object' ? schedule.exceptions : {};
    return { weekdays, exceptions };
  }

  function isLessonDay(iso, schedule) {
    const index = dateIndex(iso);
    if (index === null) return false;
    const { weekdays, exceptions } = normalizeSchedule(schedule);
    if (exceptions[iso] === 'off') return false;
    if (exceptions[iso] === 'on') return true;
    return weekdays.includes(new Date(index * 86400000).getUTCDay());
  }

  function lessonCount(startIso, endIso, schedule) {
    const start = dateIndex(startIso);
    const end = dateIndex(endIso);
    if (start === null || end === null || end <= start) return 0;
    const { weekdays, exceptions } = normalizeSchedule(schedule);
    const length = end - start;
    const firstDay = new Date((start + 1) * 86400000).getUTCDay();
    let count = Math.floor(length / 7) * weekdays.length;
    for (let offset = 0; offset < length % 7; offset += 1) {
      if (weekdays.includes((firstDay + offset) % 7)) count += 1;
    }
    for (const [iso, kind] of Object.entries(exceptions)) {
      const index = dateIndex(iso);
      if (index === null || index <= start || index > end) continue;
      const ordinary = weekdays.includes(new Date(index * 86400000).getUTCDay());
      if (kind === 'on' && !ordinary) count += 1;
      if (kind === 'off' && ordinary) count -= 1;
    }
    return count;
  }

  function nextReceiptDayOnOrAfter(iso, schedule) {
    const start = dateIndex(iso);
    if (start === null) return null;
    const { weekdays, exceptions } = normalizeSchedule(schedule);
    const candidates = [];
    const startDay = new Date(start * 86400000).getUTCDay();
    for (const weekday of weekdays) {
      let candidate = start + ((weekday - startDay + 7) % 7);
      while (exceptions[dateFromIndex(candidate)] === 'off') candidate += 7;
      candidates.push(dateFromIndex(candidate));
    }
    for (const [date, kind] of Object.entries(exceptions)) {
      if (kind === 'on' && dateIndex(date) !== null && date >= iso) candidates.push(date);
    }
    return candidates.filter(date => isLessonDay(date, schedule)).sort()[0] || null;
  }

  function nextLessonAfter(iso, schedule) {
    return nextReceiptDayOnOrAfter(datePlus(iso, 1), schedule);
  }

  function delayUnits(startIso, endIso, column, schedule) {
    if (!startIso || !endIso || endIso <= startIso) return 0;
    if (column.basis !== 'lesson') return daysBetween(startIso, endIso);
    const assessed = nextReceiptDayOnOrAfter(endIso, schedule);
    return assessed ? Math.max(1, lessonCount(startIso, assessed, schedule)) : null;
  }

  function penaltyFor(startIso, endIso, column, schedule) {
    if (column.basis === 'none' || !startIso || !endIso || endIso <= startIso) return 0;
    const units = delayUnits(startIso, endIso, column, schedule);
    return units === null
      ? null
      : Math.ceil(units / Math.max(1, Number(column.interval) || 1)) * (Number(column.penalty) || 0);
  }

  function submissionEvaluation({ column, value = '', meta = {}, schedule, today }) {
    const currentValue = String(value || '');
    const redone = Boolean(meta.redo) || currentValue.startsWith('再');
    const submitted = meta.submitted || (/^\d{4}-\d{2}-\d{2}$/.test(currentValue) ? currentValue : null);
    const returned = meta.returned || null;
    const due = redone ? (returned ? nextLessonAfter(returned, schedule) : null) : (column.due || null);
    const base = Math.max(0, Number(column.base) || 0);
    const limit = column.zeroDays == null ? 30 : Math.max(0, Number(column.zeroDays) || 0);
    const result = {
      due, submitted, returned, redone, initial: 0,
      redo: redone ? (Number(column.redoPenalty) || 0) : 0,
      delay: null, current: null, zeroLocked: false, reason: '', assessed: null
    };
    if (!currentValue || currentValue === '欠') {
      result.reason = currentValue === '欠' ? '欠席（評価対象外）' : '未記録';
      return result;
    }
    if (currentValue === '○' && !redone) {
      result.current = base;
      return result;
    }
    if (currentValue === '△' && !submitted) {
      result.reason = '△の配点はこの試作品では未設定';
      return result;
    }
    const effective = (origin, date) => column.basis === 'lesson' && origin && date > origin
      ? nextReceiptDayOnOrAfter(date, schedule)
      : date;
    const expired = (origin, end) => Boolean(origin && end && limit > 0 && daysBetween(origin, end) >= limit);
    if (redone && meta.initialSubmitted) {
      result.initial = penaltyFor(column.due, meta.initialSubmitted, column, schedule);
      const initialDate = effective(column.due, meta.initialSubmitted);
      if (result.initial === null || !initialDate) {
        result.reason = '初回提出の受付日が未設定';
        return result;
      }
      if (expired(column.due, initialDate) || (column.zeroFloor && base - result.initial <= 0)) {
        result.current = 0;
        result.zeroLocked = true;
        result.reason = '初回提出の時点で0点確定';
        return result;
      }
    }
    if (redone && !returned) {
      result.reason = '未返却：遅延による追加減点は停止中';
      return result;
    }
    if (redone && !due) {
      result.reason = '返却後の授業日が未設定';
      return result;
    }
    if (redone && submitted && submitted < returned) {
      result.reason = '再提出日が返却日より前です。日付を確認してください';
      return result;
    }
    if (!submitted && !due) {
      result.reason = '提出期限が未設定';
      return result;
    }
    const endpoint = submitted || today;
    const assessed = effective(due, endpoint);
    if (!assessed) {
      result.reason = '次の授業日が未設定';
      return result;
    }
    result.assessed = assessed;
    result.delay = penaltyFor(due, endpoint, column, schedule);
    if (result.delay === null) {
      result.reason = '次の授業日が未設定';
      return result;
    }
    const computed = base - result.initial - result.redo - result.delay;
    const byPeriod = expired(due, submitted ? assessed : endpoint);
    const byFloor = computed <= 0 && (result.initial + result.redo + result.delay > 0 || base === 0);
    result.zeroLocked = byPeriod || (byFloor && (Boolean(submitted) || column.zeroFloor));
    result.reason = byPeriod ? '設定期間の経過により0点確定' : result.zeroLocked ? '減点の下限により0点確定' : '';
    result.current = submitted ? (result.zeroLocked ? 0 : Math.max(0, computed)) : result.zeroLocked ? 0 : null;
    return result;
  }

  function scoreRecord({ sheetType, column, value, meta, schedule, today }) {
    if (sheetType === 'submission') return submissionEvaluation({ column, value, meta, schedule, today }).current;
    if (!value || value === '欠' || value === '再') return null;
    if (sheetType === 'number') return Number.isNaN(Number(value)) ? null : Number(value);
    if (sheetType === 'evaluation') return ({ A: 3, B: 2, C: 1, '○': 3, '△': 2, '×': 1 })[value] ?? null;
    return null;
  }

  root.TSUKERUDomain = Object.freeze({
    dateIndex, dateFromIndex, datePlus, daysBetween, normalizeSchedule,
    isLessonDay, lessonCount, nextReceiptDayOnOrAfter, nextLessonAfter,
    delayUnits, penaltyFor, submissionEvaluation, scoreRecord
  });
})(globalThis);
