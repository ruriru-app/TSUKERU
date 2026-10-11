(function (root) {
  const FORMULA_PREFIX = /^[=+\-@]/;

  function textValue(value) {
    const text = String(value ?? '');
    return FORMULA_PREFIX.test(text) ? `'${text}` : text;
  }

  function cell(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    const text = textValue(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function headers(bundle) {
    const columns = bundle.classes[0]?.columns || [];
    return [
      '学校', '学年', 'クラス', '出席番号', '氏名', 'よみがな', 'シート名',
      ...columns.flatMap(column => [
        `${column.title} 記録`, `${column.title} 得点`, `${column.title} 再提出`,
        `${column.title} 配点`, `${column.title} 締切日`
      ]),
      '集計', '出力日時'
    ];
  }

  function rows(bundle) {
    const referenceColumns = bundle.classes[0]?.columns || [];
    return bundle.classes.flatMap(classData => {
      const columnIndex = new Map(classData.columns.map((column, index) => [column.id, index]));
      return classData.rows.map(row => [
        classData.school, classData.year, classData.className,
        row.no, row.name, row.kana, bundle.sheetName,
        ...referenceColumns.flatMap(reference => {
          const index = columnIndex.get(reference.id);
          const column = index === undefined ? null : classData.columns[index];
          const record = index === undefined ? null : row.cells[index];
          return [
            record?.display ?? '', record?.score ?? '', record?.redoStatus ?? '',
            column?.points ?? '', column?.due ?? ''
          ];
        }),
        row.total ?? '', bundle.exportedAt || ''
      ]);
    });
  }

  function serialize(bundle) {
    if (!bundle?.classes?.length) throw new Error('CSVへ出力するクラスがありません');
    return `\ufeff${[headers(bundle), ...rows(bundle)].map(row => row.map(cell).join(',')).join('\r\n')}`;
  }

  function stamp(now) {
    if (typeof now === 'string') {
      const match = now.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (match) return `${match[1]}${match[2]}${match[3]}-${match[4]}${match[5]}`;
    }
    const date = now instanceof Date ? now : new Date(now || Date.now());
    if (Number.isNaN(date.valueOf())) throw new Error('出力日時が不正です');
    const part = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}`;
  }

  function safeName(value) {
    const cleaned = String(value || 'チェック表')
      .replace(/[<>:"/\\|?*：\u0000-\u001f]/g, '_')
      .replace(/[ .]+$/g, '');
    return cleaned || 'チェック表';
  }

  function filename(bundle, now = new Date()) {
    return `TSUKERU-${safeName(bundle?.sheetName)}-${stamp(now)}.csv`;
  }

  function download(bundle, { documentRef = root.document, urlApi = root.URL, now = new Date() } = {}) {
    if (!documentRef?.createElement || !urlApi?.createObjectURL) throw new Error('この端末ではCSVを保存できません');
    const name = filename(bundle, now);
    const blob = new Blob([serialize(bundle)], { type: 'text/csv;charset=utf-8' });
    const url = urlApi.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    try {
      anchor.href = url;
      anchor.download = name;
      anchor.hidden = true;
      documentRef.body?.append?.(anchor);
      anchor.click();
    } finally {
      anchor.remove?.();
      urlApi.revokeObjectURL?.(url);
    }
    return name;
  }

  root.TSUKERUCsv = Object.freeze({ serialize, filename, download });
})(globalThis);
