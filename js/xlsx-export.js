(function (root) {
  const encoder = new TextEncoder();
  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function escapeXml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    })[character]);
  }

  function columnName(index) {
    let value = index + 1;
    let result = '';
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }

  function stringCell(reference, value, style = 0) {
    return `<c r="${reference}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }

  function valueCell(reference, value, style = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `<c r="${reference}" t="n"${style ? ` s="${style}"` : ''}><v>${value}</v></c>`;
    }
    return stringCell(reference, value ?? '', style);
  }

  function worksheetXml(bundle, classData) {
    const rows = [
      ['シート名', bundle.sheetName],
      ['学校', classData.school, '学年', classData.year, 'クラス', classData.className],
      ['出力日時', bundle.exportedAt || ''],
      [],
      [
        '出席番号', '氏名', 'よみがな',
        ...classData.columns.flatMap(column => [
          `${column.title} 記録\n配点:${column.points ?? '－'}\n締切:${column.due || 'なし'}`,
          `${column.title} 得点`, `${column.title} 再提出`
        ]),
        '集計'
      ],
      ...classData.rows.map(row => [
        row.no, row.name, row.kana,
        ...row.cells.flatMap(cell => [cell.display, cell.score ?? '', cell.redoStatus]),
        row.total ?? ''
      ])
    ];
    const xmlRows = rows.map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => valueCell(
        `${columnName(columnIndex)}${rowIndex + 1}`,
        value,
        rowIndex === 4 || (rowIndex < 3 && columnIndex % 2 === 0) ? 1 : 0
      )).join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');
    const lastColumn = columnName(Math.max(0, rows[4].length - 1));
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
      + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      + `<cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/></cols>`
      + `<sheetData>${xmlRows}</sheetData><autoFilter ref="A5:${lastColumn}5"/>`
      + `</worksheet>`;
  }

  function uniqueSheetNames(classes) {
    const used = new Set();
    return classes.map((classData, index) => {
      const source = String(classData.className || `クラス${index + 1}`)
        .replace(/[\\/*?:\[\]]/g, '_').replace(/^'+|'+$/g, '').trim() || `クラス${index + 1}`;
      let counter = 1;
      let candidate;
      do {
        const suffix = counter === 1 ? '' : `(${counter})`;
        candidate = `${[...source].slice(0, 31 - [...suffix].length).join('')}${suffix}`;
        counter += 1;
      } while (used.has(candidate));
      used.add(candidate);
      return candidate;
    });
  }

  function contentTypes(sheetCount) {
    const sheets = Array.from({ length: sheetCount }, (_, index) => (
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
      + `<Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
      + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
  }

  function workbookXml(names) {
    const sheets = names.map((name, index) => (
      `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    )).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheets>${sheets}</sheets></workbook>`;
  }

  function workbookRelationships(sheetCount) {
    const sheets = Array.from({ length: sheetCount }, (_, index) => (
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    )).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
      + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}`
      + `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
      + `</Relationships>`;
  }

  const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="11"/><name val="Yu Gothic"/></font></fonts>`
    + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
    + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
    + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1"/></xf></cellXfs>`
    + `</styleSheet>`;

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concat(parts) {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }

  function zipStore(files) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    for (const [name, text] of files) {
      const nameBytes = encoder.encode(name);
      const data = typeof text === 'string' ? encoder.encode(text) : text;
      const checksum = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, 0, true);
      localView.setUint16(12, 33, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      localParts.push(local, data);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, 0, true);
      centralView.setUint16(14, 33, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint32(42, localOffset, true);
      central.set(nameBytes, 46);
      centralParts.push(central);
      localOffset += local.length + data.length;
    }
    const central = concat(centralParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, central.length, true);
    endView.setUint32(16, localOffset, true);
    return concat([...localParts, central, end]);
  }

  function createWorkbook(bundle) {
    if (!bundle?.classes?.length) throw new Error('Excelへ出力するクラスがありません');
    const names = uniqueSheetNames(bundle.classes);
    const files = [
      ['[Content_Types].xml', contentTypes(bundle.classes.length)],
      ['_rels/.rels', ROOT_RELS],
      ['xl/workbook.xml', workbookXml(names)],
      ['xl/_rels/workbook.xml.rels', workbookRelationships(bundle.classes.length)],
      ['xl/styles.xml', STYLES],
      ...bundle.classes.map((classData, index) => [
        `xl/worksheets/sheet${index + 1}.xml`, worksheetXml(bundle, classData)
      ])
    ];
    return zipStore(files);
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

  function filename(bundle, now = new Date()) {
    const safe = String(bundle?.sheetName || 'チェック表')
      .replace(/[<>:"/\\|?*：\u0000-\u001f]/g, '_').replace(/[ .]+$/g, '') || 'チェック表';
    return `TSUKERU-${safe}-${stamp(now)}.xlsx`;
  }

  function download(bundle, { documentRef = root.document, urlApi = root.URL, now = new Date() } = {}) {
    if (!documentRef?.createElement || !urlApi?.createObjectURL) throw new Error('この端末ではExcelを保存できません');
    const name = filename(bundle, now);
    const blob = new Blob([createWorkbook(bundle)], { type: XLSX_TYPE });
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

  root.TSUKERUXlsx = Object.freeze({ createWorkbook, filename, download });
})(globalThis);
