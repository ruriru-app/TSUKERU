(function (root) {
  const MAX_COLUMNS = 9;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function displayDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return String(value || '');
    return `${match[1]}/${match[2]}/${match[3]}`;
  }

  function shortDate(value) {
    const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    return match ? `${Number(match[1])}/${Number(match[2])}` : String(value || '');
  }

  function chunkColumns(columns, size = MAX_COLUMNS) {
    if (!Array.isArray(columns)) throw new Error('印刷する列が不正です');
    if (!Number.isInteger(size) || size < 1) throw new Error('列の分割数が不正です');
    const groups = [];
    for (let index = 0; index < columns.length; index += size) groups.push(columns.slice(index, index + size));
    return groups;
  }

  function columnHeader(column) {
    return `<th class="check-column" scope="col">`
      + `<span class="column-title">${escapeHtml(column.title)}</span>`
      + `<span class="column-points">${column.points == null ? '配点なし' : `${escapeHtml(column.points)}点`}</span>`
      + `<span class="column-due">${column.due ? escapeHtml(shortDate(column.due)) : 'なし'}</span>`
      + `</th>`;
  }

  function recordCell(cell, blank) {
    if (blank) return '<td class="record-cell"></td>';
    const score = typeof cell.score === 'number' ? `<span class="cell-score">${escapeHtml(cell.score)}</span>` : '';
    const redo = cell.redoStatus ? `<span class="cell-redo">${escapeHtml(cell.redoStatus)}</span>` : '';
    return `<td class="record-cell"><span class="cell-record">${escapeHtml(cell.display)}</span>${score}${redo}</td>`;
  }

  function sectionRows(classData, group, blank) {
    const byId = new Map(classData.columns.map((column, index) => [column.id, index]));
    return classData.rows.map(row => {
      const cells = group.map(column => recordCell(row.cells[byId.get(column.id)], blank)).join('');
      const number = blank ? '' : escapeHtml(row.no);
      const name = blank ? '' : escapeHtml(row.name);
      const total = blank || row.total == null ? '' : escapeHtml(row.total);
      return `<tr data-row-kind="student"><td class="student-no">${number}</td>`
        + `<td class="student-name">${name}</td>${cells}<td class="total-cell">${total}</td></tr>`;
    }).join('');
  }

  function section(bundle, classData, group, groupIndex, groupCount, blank) {
    const columns = group.map(column => '<col class="check-column">').join('');
    const label = blank ? '空欄ひな形' : '記録入り';
    return `<section class="print-section" data-class-id="${escapeHtml(classData.classId)}" data-column-group="${groupIndex + 1}">`
      + `<header class="print-header"><div><h1>${escapeHtml(bundle.sheetName)}</h1>`
      + `<p>${escapeHtml(classData.school)}　${escapeHtml(classData.year)}年度　${escapeHtml(classData.className)}</p></div>`
      + `<div class="print-meta"><span>${label}</span><span>出力日 ${escapeHtml(displayDate(bundle.exportedAt))}</span>`
      + `<span>${groupIndex + 1} / ${groupCount}</span></div></header>`
      + `<table class="checklist" style="--column-count:${group.length}"><colgroup>`
      + `<col class="no-column"><col class="name-column">${columns}<col class="total-column"></colgroup>`
      + `<thead><tr><th class="no-column" scope="col">番号</th><th class="name-column" scope="col">氏名</th>`
      + `${group.map(columnHeader).join('')}<th class="total-column" scope="col">合計</th></tr></thead>`
      + `<tbody>${sectionRows(classData, group, blank)}</tbody></table></section>`;
  }

  function styles() {
    return `
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing: border-box; }
      html { color: #5e5550; background: #fff; font-family: system-ui, "Yu Gothic", "Hiragino Sans", sans-serif; }
      body { margin: 0; }
      .print-section { padding-top: 4mm; break-inside: auto; page-break-inside: auto; }
      .print-section + .print-section { break-before: page; page-break-before: always; }
      .print-header { width: min(100%, calc(53mm + var(--column-count, 9) * 15.5mm)); min-height: 12mm; margin: 0 auto 2mm; display: flex; align-items: end; justify-content: space-between; gap: 4mm; }
      .print-header h1 { margin: 0 0 1mm; font-size: 13pt; line-height: 1.15; }
      .print-header p { margin: 0; font-size: 9pt; }
      .print-meta { display: flex; flex-direction: column; align-items: end; white-space: nowrap; font-size: 7pt; line-height: 1.35; }
      .checklist { --identity-width: 53mm; width: min(100%, calc(var(--identity-width) + var(--column-count) * 15.5mm)); margin: 0 auto; table-layout: fixed; border-collapse: collapse; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      th, td { border: .25mm solid #cfc5be; text-align: center; overflow: hidden; }
      th { background: #f8f1e8; font-weight: 650; }
      .no-column { width: 9mm; }
      .name-column { width: 32mm; text-align: left; padding-left: 1.5mm; white-space: nowrap; text-overflow: ellipsis; }
      th.no-column, th.name-column, .total-column { text-align: center; padding-left: 0; }
      .total-column { width: 12mm; }
      th.check-column { height: 43mm; padding: 1mm .5mm; vertical-align: bottom; }
      .column-title { writing-mode: vertical-rl; text-orientation: upright; display: block; height: 28mm; margin: 0 auto 1mm; overflow: hidden; font-size: 8.5pt; line-height: 1.2; }
      .column-points, .column-due { display: block; white-space: nowrap; font-size: 6pt; line-height: 1.35; }
      tbody tr { height: 5.5mm; }
      td { height: 5.5mm; padding: .25mm .4mm; font-size: 7.5pt; line-height: 1.05; }
      .record-cell { position: relative; }
      .cell-record, .cell-score, .cell-redo { display: block; white-space: nowrap; }
      .cell-score { color: #2d736c; font-size: 6pt; }
      .cell-redo { color: #775d8c; font-size: 5pt; }
      .total-cell { background: #eef8f6; font-weight: 700; }
      @media screen { body { padding: 10mm; background: #ece8e3; } .print-section { max-width: 210mm; min-height: 281mm; margin: 0 auto 10mm; padding: 8mm; background: #fff; box-shadow: 0 2mm 8mm rgba(80,65,55,.16); } }
      @media print { body { background: #fff; } }
    `;
  }

  function buildDocument(bundle, { blank = false } = {}) {
    if (!bundle?.classes?.length) throw new Error('印刷するクラスがありません');
    const sections = bundle.classes.flatMap(classData => {
      const groups = chunkColumns(classData.columns, MAX_COLUMNS);
      if (!groups.length) throw new Error('印刷する列がありません');
      return groups.map((group, index) => section(bundle, classData, group, index, groups.length, blank));
    }).join('');
    const title = `${bundle.sheetName} - ${blank ? '空欄ひな形' : '記録入り'}`;
    return '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
      + `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>`
      + `<style>${styles()}</style></head><body>${sections}</body></html>`;
  }

  function open(bundle, { blank = false, windowRef = root } = {}) {
    const printWindow = windowRef?.open?.('', '_blank');
    if (!printWindow) return { ok: false, reason: 'popup-blocked' };
    printWindow.document.open();
    printWindow.document.write(buildDocument(bundle, { blank }));
    printWindow.document.close();
    printWindow.focus?.();
    printWindow.print?.();
    return { ok: true };
  }

  root.TSUKERUPrint = Object.freeze({ chunkColumns, buildDocument, open });
})(globalThis);
