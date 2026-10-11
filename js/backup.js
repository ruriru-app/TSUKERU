(function (root) {
  const FORMAT_VERSION = 1;

  function createdAtValue(now) {
    if (typeof now === 'string') return now;
    return (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  }

  function createBackupEnvelope(state, now = new Date()) {
    const model = root.TSUKERUModel;
    const normalized = model ? model.migrateState(state) : state;
    return { appId: 'TSUKERU', formatVersion: FORMAT_VERSION, createdAt: createdAtValue(now), state: structuredClone(normalized) };
  }

  function serializeBackup(envelope) {
    return JSON.stringify(envelope, null, 2);
  }

  function validateBackupEnvelope(raw) {
    let envelope;
    try { envelope = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw); }
    catch { throw new Error('バックアップJSONを読み取れません'); }
    if (!envelope || envelope.appId !== 'TSUKERU') throw new Error('TSUKERUのバックアップではありません');
    if (Number(envelope.formatVersion) > FORMAT_VERSION) throw new Error('このアプリより新しいバックアップ形式です');
    if (Number(envelope.formatVersion) !== FORMAT_VERSION) throw new Error('対応していないバックアップ形式です');
    if (!envelope.createdAt || Number.isNaN(Date.parse(envelope.createdAt))) throw new Error('バックアップの作成日時が不正です');
    const model = root.TSUKERUModel;
    if (!model) throw new Error('TSUKERUのデータ検証を開始できません');
    envelope.state = model.migrateState(envelope.state);
    if (envelope.state.classes.length === 0) throw new Error('学級データがありません');
    return envelope;
  }

  function summarizeBackup(envelope) {
    const classes = envelope.state?.classes || [];
    return {
      createdAt: envelope.createdAt,
      classCount: classes.length,
      studentCount: classes.reduce((sum, item) => sum + (item.students?.length || 0), 0),
      columnCount: Array.isArray(envelope.state?.sheetDefinitions)
        ? envelope.state.sheetDefinitions.reduce((sum, sheet) => sum + (sheet.columns?.length || 0), 0)
        : classes.reduce((sum, item) => sum + (item.sheets || []).reduce((sheetSum, sheet) => sheetSum + (sheet.columns?.length || 0), 0), 0)
    };
  }

  function backupFilename(now = new Date(), prefix = 'TSUKERU-backup') {
    let parts;
    if (typeof now === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.test(now)) parts = now.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/).slice(1);
    else {
      const date = now instanceof Date ? now : new Date(now);
      parts = [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'), String(date.getDate()).padStart(2,'0'), String(date.getHours()).padStart(2,'0'), String(date.getMinutes()).padStart(2,'0')];
    }
    return `${prefix}-${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}.json`;
  }

  function downloadBackup(state, now = new Date(), prefix = 'TSUKERU-backup') {
    const envelope = createBackupEnvelope(state, now);
    const blob = new Blob([serializeBackup(envelope)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = backupFilename(now, prefix);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return anchor.download;
  }

  root.TSUKERUBackup = Object.freeze({ FORMAT_VERSION, createBackupEnvelope, serializeBackup, validateBackupEnvelope, summarizeBackup, backupFilename, downloadBackup });
})(globalThis);
