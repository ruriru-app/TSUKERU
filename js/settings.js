(function (root) {
  const W = root.TSUKERUWorkspace;
  const P = root.TSUKERUPalette;
  const sections = [
    ['classes', 'クラス設定'],
    ['groups', '合同グループ設定'],
    ['sheets', 'シート設定'],
    ['archived', '保管済みシート'],
    ['palette', 'パレット設定'],
    ['reset', '年度データ削除']
  ];
  let activeSection = 'classes';
  let adapter = null;
  let mountPoint = null;
  let groupDraft = null;
  let sheetDraft = null;
  let paletteDrafts = null;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const classLabel = (state, classId) => {
    const item = state.classes.find(entry => entry.id === classId);
    return item ? `${item.school ? `${item.school}｜` : ''}${item.name}` : classId;
  };

  function shell() {
    const buttons = sections.map(([id, label]) => `<button type="button" data-settings-nav="${id}" class="${activeSection === id ? 'selected' : ''}">${label}</button>`).join('');
    const options = sections.map(([id, label]) => `<option value="${id}" ${activeSection === id ? 'selected' : ''}>${label}</option>`).join('');
    mountPoint.innerHTML = `<div class="settings-layout"><aside class="settings-sidebar" aria-label="設定メニュー"><h1>設定</h1><nav>${buttons}</nav></aside><div class="settings-main"><label class="settings-nav-select-wrap">設定メニュー<select class="settings-nav-select" aria-label="設定メニュー">${options}</select></label><div class="settings-content"></div></div></div>`;
    mountPoint.querySelectorAll('[data-settings-nav]').forEach(button => button.addEventListener('click', () => selectSection(button.dataset.settingsNav)));
    mountPoint.querySelector('.settings-nav-select').addEventListener('change', event => selectSection(event.target.value));
    renderSection();
  }

  function selectSection(sectionId) {
    if (!sections.some(([id]) => id === sectionId)) return;
    activeSection = sectionId;
    if (sectionId !== 'groups') groupDraft = null;
    if (sectionId !== 'sheets') sheetDraft = null;
    if (sectionId !== 'palette') paletteDrafts = null;
    shell();
  }

  function renderClasses(content, state) {
    const cards = state.classes.map(item => `<article class="settings-card"><div><strong>${escapeHtml(classLabel(state, item.id))}</strong><span>${item.students.length}人</span></div><button type="button" aria-label="${escapeHtml(item.name)}を編集" data-edit-class="${escapeHtml(item.id)}">編集</button></article>`).join('');
    content.innerHTML = `<div class="settings-section-heading"><div><h2>クラス設定</h2><p>名簿、授業曜日、学校名・クラス名を管理します。</p></div><button type="button" data-add-class>＋クラスを追加</button></div><div class="settings-card-list">${cards || '<p class="settings-empty">登録済みクラスはありません。</p>'}</div><div class="settings-backup"><h3>手動バックアップ</h3><p>名簿・評価を含みます。学校指定のGoogleドライブなど、安全な場所へ保管してください。</p><div><button type="button" data-export-backup>バックアップを保存</button><button type="button" data-import-backup>バックアップから復元</button></div></div>`;
    content.querySelector('[data-add-class]').addEventListener('click', () => adapter.addClass());
    content.querySelectorAll('[data-edit-class]').forEach(button => button.addEventListener('click', () => adapter.editClass(button.dataset.editClass)));
    content.querySelector('[data-export-backup]').addEventListener('click', () => adapter.exportBackup());
    content.querySelector('[data-import-backup]').addEventListener('click', () => adapter.importBackup());
  }

  function beginGroup(state, groupId = null) {
    const group = state.groups.find(item => item.id === groupId);
    groupDraft = group ? { id: group.id, name: group.name, classIds: [...group.classIds] } : { id: null, name: '', classIds: [] };
  }

  function renderGroupEditor(content, state) {
    if (!groupDraft) beginGroup(state);
    const groups = state.groups.map(group => { const shared=state.sheetDefinitions.filter(sheet=>sheet.scope.type==='group'&&sheet.scope.groupId===group.id&&!sheet.archivedAt).map(sheet=>sheet.name);return `<button type="button" class="group-summary" data-group-card data-edit-group="${escapeHtml(group.id)}"><strong>${escapeHtml(group.name)}</strong><span>${group.classIds.map(id => escapeHtml(classLabel(state, id))).join('・')}</span><span>${shared.length?`共有シート：${shared.map(escapeHtml).join('・')}`:'共有シート：なし'}</span></button>`; }).join('');
    const checks = state.classes.map(item => `<label><input type="checkbox" data-group-class value="${escapeHtml(item.id)}" ${groupDraft.classIds.includes(item.id) ? 'checked' : ''}>${escapeHtml(classLabel(state, item.id))}</label>`).join('');
    const order = groupDraft.classIds.map((id, index) => `<li><span>${escapeHtml(classLabel(state, id))}</span><span><button type="button" aria-label="${escapeHtml(classLabel(state, id))}を上へ" data-order-up="${index}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" aria-label="${escapeHtml(classLabel(state, id))}を下へ" data-order-down="${index}" ${index === groupDraft.classIds.length - 1 ? 'disabled' : ''}>↓</button></span></li>`).join('');
    content.innerHTML = `<div class="settings-section-heading"><div><h2>合同グループ設定</h2><p>同じ評価基準を使うクラスをまとめます。シートはここで選ばなくても作成できます。</p></div><button type="button" data-new-group>新しい合同グループ</button></div><div class="group-settings-grid"><div class="group-list">${groups || '<p class="settings-empty">合同グループはまだありません。</p>'}</div><form class="group-editor"><label>グループ名<input id="groupName" value="${escapeHtml(groupDraft.name)}" placeholder="例：6年合同"></label><fieldset><legend>含めるクラス</legend>${checks}</fieldset><div><h3>名簿をつなぐ順番</h3><ol data-group-order>${order || '<li class="settings-empty">クラスを選んでください。</li>'}</ol></div><p class="settings-message" role="status"></p><button type="submit" class="primary">${groupDraft.id ? '合同グループを更新' : '合同グループを登録'}</button>${groupDraft.id?'<button type="button" class="danger-outline" data-delete-group>合同グループを削除</button>':''}</form></div>`;
    content.querySelector('[data-new-group]').addEventListener('click', () => { beginGroup(state); renderSection(); });
    content.querySelectorAll('[data-edit-group]').forEach(button => button.addEventListener('click', () => { beginGroup(state, button.dataset.editGroup); renderSection(); }));
    content.querySelectorAll('[data-group-class]').forEach(input => input.addEventListener('change', () => {
      groupDraft.name = content.querySelector('#groupName').value;
      if (input.checked && !groupDraft.classIds.includes(input.value)) groupDraft.classIds.push(input.value);
      if (!input.checked) groupDraft.classIds = groupDraft.classIds.filter(id => id !== input.value);
      renderSection();
    }));
    content.querySelectorAll('[data-order-up]').forEach(button => button.addEventListener('click', () => moveGroupClass(Number(button.dataset.orderUp), -1)));
    content.querySelectorAll('[data-order-down]').forEach(button => button.addEventListener('click', () => moveGroupClass(Number(button.dataset.orderDown), 1)));
    content.querySelector('.group-editor').addEventListener('submit', event => saveGroup(event, state));
    content.querySelector('[data-delete-group]')?.addEventListener('click', () => { const message=content.querySelector('.settings-message');try{const next=W.deleteGroup(state,groupDraft.id);adapter.updateState(next);groupDraft=null;renderSection()}catch(error){message.textContent=error.message} });
  }

  function moveGroupClass(index, offset) {
    const name = mountPoint.querySelector('#groupName');
    if (name) groupDraft.name = name.value;
    const target = index + offset;
    if (target < 0 || target >= groupDraft.classIds.length) return;
    [groupDraft.classIds[index], groupDraft.classIds[target]] = [groupDraft.classIds[target], groupDraft.classIds[index]];
    renderSection();
  }

  function saveGroup(event, state) {
    event.preventDefault();
    groupDraft.name = mountPoint.querySelector('#groupName').value.trim();
    const message = mountPoint.querySelector('.settings-message');
    if (!groupDraft.name) { message.textContent = 'グループ名を入力してください。'; return; }
    if ((!groupDraft.id && groupDraft.classIds.length < 2) || (groupDraft.id && groupDraft.classIds.length < 1)) { message.textContent = groupDraft.id ? 'クラスを1つ以上残してください。' : 'クラスを2つ以上選んでください。'; return; }
    try {
      let next;
      if (groupDraft.id) {
        next = state;
        const original = state.groups.find(group => group.id === groupDraft.id);
        const removed = original.classIds.filter(classId => !groupDraft.classIds.includes(classId));
        for (const classId of removed) {
          if (!root.confirm(`${classLabel(state,classId)}を合同グループから外します。記録がある共有シートは、クラス専用シートとして残します。続けますか？`)) return;
          next = W.removeClassFromGroup(next, { groupId:groupDraft.id, classId, preserveRecordedSheet:true });
        }
        next = W.updateGroup(next, groupDraft.id, { name:groupDraft.name, classIds:groupDraft.classIds });
      } else next = W.createGroup(state, { name: groupDraft.name, classIds: groupDraft.classIds });
      adapter.updateState(next);
      const saved = groupDraft.id || next.groups.at(-1).id;
      beginGroup(next, saved);
      renderSection();
    } catch (error) {
      message.textContent = error.message;
    }
  }

  function newColumnDraft(title = '') {
    const token = root.crypto && typeof root.crypto.randomUUID === 'function' ? root.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    return { id: `column-${token}`, title, base: 0, interval: 3, penalty: 1, basis: 'days', redoPenalty: 1, zeroDays: 30, zeroFloor: true, includeInTotal: true, hidden: false, due: '' };
  }

  function scopeClassIds(state, draft = sheetDraft) {
    if (draft.scopeKind === 'class') return state.classes.some(item => item.id === draft.targetId) ? [draft.targetId] : [];
    return state.groups.find(item => item.id === draft.targetId)?.classIds || [];
  }

  function beginSheet(state, sheetId = null) {
    const sheet = state.sheetDefinitions.find(item => item.id === sheetId);
    if (sheet) {
      sheetDraft = {
        id: sheet.id, name: sheet.name, type: sheet.type,
        scopeKind: sheet.scope.type, targetId: sheet.scope.classId || sheet.scope.groupId,
        columns: structuredClone(sheet.columns), dueDatesByClass: structuredClone(sheet.dueDatesByClass)
      };
      return;
    }
    const firstClassId = state.classes[0]?.id || '';
    const column = newColumnDraft();
    sheetDraft = { id: null, name: '', type: 'submission', scopeKind: 'class', targetId: firstClassId, columns: [column], dueDatesByClass: { [firstClassId]: { [column.id]: '' } } };
  }

  function captureSheetDraft() {
    if (!sheetDraft || !mountPoint.querySelector('#sheetName')) return;
    sheetDraft.name = mountPoint.querySelector('#sheetName').value;
    sheetDraft.type = mountPoint.querySelector('#sheetType').value;
    sheetDraft.scopeKind = mountPoint.querySelector('#sheetScopeKind').value;
    sheetDraft.targetId = mountPoint.querySelector('#sheetScopeTarget').value;
    mountPoint.querySelectorAll('[data-column-row]').forEach((row, index) => {
      const column = sheetDraft.columns[index];
      column.title = row.querySelector('[data-column-title]').value;
      column.base = Number(row.querySelector('[data-column-points]').value || 0);
      column.includeInTotal = row.querySelector('[data-column-include]').checked;
    });
    mountPoint.querySelectorAll('[data-due-class]').forEach(input => {
      sheetDraft.dueDatesByClass[input.dataset.dueClass] ||= {};
      sheetDraft.dueDatesByClass[input.dataset.dueClass][input.dataset.dueColumn] = input.value;
    });
  }

  function sheetScopeOptions(state) {
    const options = sheetDraft.scopeKind === 'class'
      ? state.classes.map(item => [item.id, classLabel(state, item.id)])
      : state.groups.map(item => [item.id, item.name]);
    if (!options.some(([id]) => id === sheetDraft.targetId)) sheetDraft.targetId = options[0]?.[0] || '';
    return options.map(([id, label]) => `<option value="${escapeHtml(id)}" ${id === sheetDraft.targetId ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  }

  function renderSheetEditor(content, state) {
    const classIds = scopeClassIds(state);
    const rows = sheetDraft.columns.map((column, index) => {
      const dates = classIds.map(classId => `<label>${escapeHtml(classLabel(state, classId))}の締切<input type="date" data-due-class="${escapeHtml(classId)}" data-due-column="${escapeHtml(column.id)}" value="${escapeHtml(sheetDraft.dueDatesByClass[classId]?.[column.id] || '')}"></label>`).join('');
      return `<article class="sheet-column-editor" data-column-row><div class="sheet-column-top"><label>列名<input data-column-title value="${escapeHtml(column.title)}" placeholder="例：漢字ドリル"></label><label>配点（任意）<input data-column-points type="number" min="0" value="${column.base || ''}" placeholder="未設定"></label><label class="sheet-check"><input data-column-include type="checkbox" ${column.includeInTotal !== false ? 'checked' : ''}>集計に含める</label><span class="sheet-order"><button type="button" data-column-up="${index}" aria-label="${escapeHtml(column.title || `列${index + 1}`)}を上へ" ${index === 0 ? 'disabled' : ''}>←</button><button type="button" data-column-down="${index}" aria-label="${escapeHtml(column.title || `列${index + 1}`)}を下へ" ${index === sheetDraft.columns.length - 1 ? 'disabled' : ''}>→</button></span></div><div class="sheet-dates">${dates || '<span class="settings-empty">対象クラスを選んでください。</span>'}</div></article>`;
    }).join('');
    content.insertAdjacentHTML('beforeend', `<form class="sheet-editor"><h3>${sheetDraft.id ? 'シートを編集' : '新しいシート'}</h3><div class="sheet-basic"><label>シート名<input id="sheetName" value="${escapeHtml(sheetDraft.name)}" placeholder="例：提出物チェック"></label><label>種類<select id="sheetType"><option value="submission" ${sheetDraft.type === 'submission' ? 'selected' : ''}>提出物</option><option value="evaluation" ${sheetDraft.type === 'evaluation' ? 'selected' : ''}>活動評価</option><option value="number" ${sheetDraft.type === 'number' ? 'selected' : ''}>点数記録</option></select></label><label>利用対象<select id="sheetScopeKind" ${sheetDraft.id ? 'disabled' : ''}><option value="class" ${sheetDraft.scopeKind === 'class' ? 'selected' : ''}>クラス専用</option><option value="group" ${sheetDraft.scopeKind === 'group' ? 'selected' : ''}>合同グループで共有</option></select></label><label>クラス／合同グループ<select id="sheetScopeTarget" ${sheetDraft.id ? 'disabled' : ''}>${sheetScopeOptions(state)}</select></label></div><div class="sheet-columns"><div class="sheet-columns-title"><h3>評価列</h3><button type="button" data-add-column>列を追加</button></div>${rows}</div><p class="settings-message" role="status"></p><div class="sheet-editor-actions"><button type="button" data-cancel-sheet>キャンセル</button><button type="submit" class="primary">シートを保存</button></div></form>`);
    content.querySelector('#sheetScopeKind').addEventListener('change', event => { captureSheetDraft();sheetDraft.scopeKind = event.target.value;sheetDraft.targetId = '';renderSection(); });
    content.querySelector('#sheetScopeTarget').addEventListener('change', event => { captureSheetDraft();sheetDraft.targetId = event.target.value;renderSection(); });
    content.querySelector('[data-add-column]').addEventListener('click', () => { captureSheetDraft();sheetDraft.columns.push(newColumnDraft());renderSection(); });
    content.querySelectorAll('[data-column-up]').forEach(button => button.addEventListener('click', () => moveSheetColumn(Number(button.dataset.columnUp), -1)));
    content.querySelectorAll('[data-column-down]').forEach(button => button.addEventListener('click', () => moveSheetColumn(Number(button.dataset.columnDown), 1)));
    content.querySelector('[data-cancel-sheet]').addEventListener('click', () => { sheetDraft = null;renderSection(); });
    content.querySelector('.sheet-editor').addEventListener('submit', event => saveSheet(event, state));
  }

  function moveSheetColumn(index, offset) {
    captureSheetDraft();
    const target = index + offset;
    if (target < 0 || target >= sheetDraft.columns.length) return;
    [sheetDraft.columns[index], sheetDraft.columns[target]] = [sheetDraft.columns[target], sheetDraft.columns[index]];
    renderSection();
  }

  function saveSheet(event, state) {
    event.preventDefault();captureSheetDraft();
    const message = mountPoint.querySelector('.sheet-editor .settings-message');
    if (!sheetDraft.name.trim()) { message.textContent = 'シート名を入力してください。';return; }
    if (!sheetDraft.targetId) { message.textContent = '利用するクラスまたは合同グループを選んでください。';return; }
    if (sheetDraft.columns.some(column => !column.title.trim())) { message.textContent = 'すべての列名を入力してください。';return; }
    try {
      const payload = { name: sheetDraft.name, type: sheetDraft.type, columns: sheetDraft.columns, dueDatesByClass: sheetDraft.dueDatesByClass };
      const next = sheetDraft.id
        ? W.updateSheetDefinition(state, sheetDraft.id, payload)
        : W.createSheetDefinition(state, { ...payload, scope: sheetDraft.scopeKind === 'class' ? { type:'class', classId:sheetDraft.targetId } : { type:'group', groupId:sheetDraft.targetId } });
      adapter.updateState(next);sheetDraft = null;renderSection();
    } catch (error) { message.textContent = error.message; }
  }

  function renderSheets(content, state) {
    const active = state.sheetDefinitions.filter(sheet => !sheet.archivedAt);
    const cards = active.map(sheet => `<article class="settings-card" data-sheet-card><div><strong>${escapeHtml(sheet.name)}</strong><span>${sheet.type === 'submission' ? '提出物' : sheet.type === 'evaluation' ? '活動評価' : '点数記録'}｜${sheet.scope.type === 'class' ? escapeHtml(classLabel(state, sheet.scope.classId)) : escapeHtml(state.groups.find(item => item.id === sheet.scope.groupId)?.name || '合同グループ')}</span></div><span class="settings-card-actions"><button type="button" data-edit-sheet="${escapeHtml(sheet.id)}">編集</button><button type="button" data-archive-sheet="${escapeHtml(sheet.id)}">保管</button></span></article>`).join('');
    content.innerHTML = `<div class="settings-section-heading"><div><h2>シート設定</h2><p>シートと評価列はここで追加・編集します。記録画面では評価入力に集中できます。</p></div><button type="button" data-new-sheet>新しいシート</button></div><div class="settings-card-list">${cards || '<p class="settings-empty">使用中のシートはありません。</p>'}</div>`;
    content.querySelector('[data-new-sheet]').addEventListener('click', () => { beginSheet(state);renderSection(); });
    content.querySelectorAll('[data-edit-sheet]').forEach(button => button.addEventListener('click', () => { beginSheet(state, button.dataset.editSheet);renderSection(); }));
    content.querySelectorAll('[data-archive-sheet]').forEach(button => button.addEventListener('click', () => {
      const sheet = state.sheetDefinitions.find(item => item.id === button.dataset.archiveSheet);
      if (!root.confirm(`「${sheet.name}」を保管します。記録は削除されません。復元は「設定 → 保管済みシート」から行えます。続けますか？`)) return;
      adapter.updateState(W.archiveSheet(state, sheet.id));sheetDraft = null;renderSection();
    }));
    if (sheetDraft) renderSheetEditor(content, state);
  }

  function renderArchived(content, state) {
    const archived = state.sheetDefinitions.filter(sheet => sheet.archivedAt);
    const cards = archived.map(sheet => `<article class="settings-card" data-archived-sheet><div><strong>${escapeHtml(sheet.name)}</strong><span>保管日：${escapeHtml(new Date(sheet.archivedAt).toLocaleDateString('ja-JP'))}</span></div><button type="button" data-restore-sheet="${escapeHtml(sheet.id)}">復元</button></article>`).join('');
    content.innerHTML = `<div class="settings-section-heading"><div><h2>保管済みシート</h2><p>保管しても名簿・評価記録は残ります。必要なときに元の利用対象へ戻せます。</p></div></div><div class="settings-card-list">${cards || '<p class="settings-empty">保管済みシートはありません。</p>'}</div>`;
    content.querySelectorAll('[data-restore-sheet]').forEach(button => button.addEventListener('click', () => { adapter.updateState(W.restoreSheet(state, button.dataset.restoreSheet));renderSection(); }));
  }

  function paletteName(kind) {
    return kind === 'submission' ? '提出物' : kind === 'activity' ? '活動評価' : '点数記録';
  }

  function ensurePaletteDrafts(state) {
    if (paletteDrafts) return;
    paletteDrafts = Object.fromEntries(['submission','activity','numeric'].map(kind => [kind, P.paletteForSheet(state.preferences, kind)]));
  }

  function capturePaletteDrafts() {
    if (!paletteDrafts) return;
    mountPoint.querySelectorAll('[data-palette-kind]').forEach(section => {
      const kind = section.dataset.paletteKind;
      section.querySelectorAll('[data-palette-row]').forEach((row, index) => { paletteDrafts[kind][index].visible = row.querySelector('[data-palette-visible]').checked; });
    });
  }

  function movePalette(kind, index, offset) {
    capturePaletteDrafts();
    const target = index + offset;
    if (target < 0 || target >= paletteDrafts[kind].length) return;
    [paletteDrafts[kind][index], paletteDrafts[kind][target]] = [paletteDrafts[kind][target], paletteDrafts[kind][index]];
    renderSection();
  }

  function renderPalette(content, state) {
    ensurePaletteDrafts(state);
    const panels = ['submission','activity','numeric'].map(kind => {
      const rows = paletteDrafts[kind].map((entry, index) => `<li data-palette-row><span class="palette-swatch mark-${escapeHtml(P.colorTokenForMark(entry.value))}" data-palette-value>${escapeHtml(entry.value)}</span><label><input type="checkbox" data-palette-visible ${entry.visible ? 'checked' : ''}>表示</label><span><button type="button" data-palette-up="${index}" aria-label="${escapeHtml(entry.value)}を上へ" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-palette-down="${index}" aria-label="${escapeHtml(entry.value)}を下へ" ${index === paletteDrafts[kind].length - 1 ? 'disabled' : ''}>↓</button></span></li>`).join('');
      return `<section class="palette-settings" data-palette-kind="${kind}"><div><h3>${paletteName(kind)}</h3><button type="button" data-load-preset="${kind}">${paletteName(kind)}プリセットを読み込む</button></div><ol>${rows}</ol></section>`;
    }).join('');
    content.innerHTML = `<div class="settings-section-heading"><div><h2>パレット設定</h2><p>表示するボタンと順番を、この端末の基本として保存します。色は意味がずれないよう固定されています。</p></div></div><div class="palette-settings-grid">${panels}</div><p class="settings-message" role="status"></p><button type="button" class="primary settings-save-wide" data-save-palettes>この端末の基本パレットとして保存</button>`;
    content.querySelectorAll('[data-load-preset]').forEach(button => button.addEventListener('click', () => { paletteDrafts[button.dataset.loadPreset] = P.PRESETS[button.dataset.loadPreset].map(value => ({ value, visible:true }));renderSection(); }));
    content.querySelectorAll('[data-palette-kind]').forEach(section => {
      const kind = section.dataset.paletteKind;
      section.querySelectorAll('[data-palette-up]').forEach(button => button.addEventListener('click', () => movePalette(kind, Number(button.dataset.paletteUp), -1)));
      section.querySelectorAll('[data-palette-down]').forEach(button => button.addEventListener('click', () => movePalette(kind, Number(button.dataset.paletteDown), 1)));
    });
    content.querySelector('[data-save-palettes]').addEventListener('click', () => {
      capturePaletteDrafts();
      const next = W.migrateWorkspace(state);
      let preferences = next.preferences;
      for (const kind of ['submission','activity','numeric']) preferences = P.setPaletteDefault(preferences, kind, paletteDrafts[kind]);
      next.preferences = preferences;
      adapter.updateState(W.validateWorkspace(next));
      content.querySelector('.settings-message').textContent = 'この端末の基本パレットとして保存しました。';
    });
  }

  function renderReset(content, state) {
    const summary = W.academicDataSummary(state);
    content.innerHTML = `<div class="settings-section-heading"><div><h2>年度データ削除</h2><p>年度末などに、この端末内の名簿と評価記録を完全に消去します。</p></div></div><section class="danger-zone"><h3>削除されるデータ</h3><p class="reset-summary"><strong>${summary.classCount}クラス</strong> ／ <strong>${summary.studentCount}人</strong> ／ 合同グループ${summary.groupCount}件 ／ 使用中シート${summary.activeSheetCount}件 ／ 保管済みシート${summary.archivedSheetCount}件 ／ 記録${summary.recordCount}件</p><p>先にバックアップを保存してください。復元するときは「設定 → クラス設定 → バックアップから復元」を使います。</p><button type="button" data-reset-backup>削除前バックアップを保存</button><div class="danger-warning"><strong>注意</strong><p>この操作で消えるのは、この端末のTSUKERU内データです。すでに書き出したバックアップやGoogleドライブ上のファイルは削除されません。</p></div><label>続けるには「年度データを削除」と入力してください<input id="resetPhrase" autocomplete="off"></label><button type="button" class="danger-button" data-reset-academic disabled>年度データを完全に削除</button></section>`;
    content.querySelector('[data-reset-backup]').addEventListener('click', () => adapter.exportBackup('TSUKERU-before-annual-reset'));
    const phrase = content.querySelector('#resetPhrase'), button = content.querySelector('[data-reset-academic]');
    phrase.addEventListener('input', () => { button.disabled = phrase.value !== '年度データを削除'; });
    button.addEventListener('click', () => {
      if (phrase.value !== '年度データを削除') return;
      if (!root.confirm('名簿・評価・シート・保管済みシートをこの端末から削除します。元に戻せません。バックアップを確認しましたか？')) return;
      adapter.resetAcademic();
    });
  }

  function renderPlaceholder(content, title) {
    content.innerHTML = `<div class="settings-section-heading"><div><h2>${escapeHtml(title)}</h2><p>この設定は次の実装段階で追加します。</p></div></div>`;
  }

  function renderSection() {
    const content = mountPoint.querySelector('.settings-content');
    const state = adapter.getState();
    if (activeSection === 'classes') renderClasses(content, state);
    else if (activeSection === 'groups') renderGroupEditor(content, state);
    else if (activeSection === 'sheets') renderSheets(content, state);
    else if (activeSection === 'archived') renderArchived(content, state);
    else if (activeSection === 'palette') renderPalette(content, state);
    else if (activeSection === 'reset') renderReset(content, state);
    else renderPlaceholder(content, sections.find(([id]) => id === activeSection)[1]);
  }

  function mount(rootElement, nextAdapter, initialSection = activeSection) {
    mountPoint = rootElement;
    adapter = nextAdapter;
    activeSection = sections.some(([id]) => id === initialSection) ? initialSection : 'classes';
    shell();
  }

  root.TSUKERUSettings = Object.freeze({ mount, sections: sections.map(item => [...item]) });
})(globalThis);
