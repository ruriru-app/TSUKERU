
const $=x=>document.getElementById(x),today=()=>new Date().toLocaleDateString('sv-SE');
const M=globalThis.TSUKERUModel,D=globalThis.TSUKERUDomain,R=globalThis.TSUKERURoster,S=globalThis.TSUKERUStorage,B=globalThis.TSUKERUBackup,P=globalThis.TSUKERUPwa;
const names=M.DEMO_NAMES,kana=M.DEMO_KANA,colors={'○':'#F48BA8','△':'#A8D08D','×':'#8BB7E8','欠':'#C5C5C5','再':'#B59AD9','日付':'#F7D878'};
let appState=M.createDemoState({nowIso:new Date().toISOString()});
let classes=appState.classes.map(c=>c.id);
let classInfo=Object.fromEntries(appState.classes.map(c=>[c.id,c]));
let db=Object.fromEntries(appState.classes.map(c=>[c.id,c.sheets]));
let cls=appState.ui.activeClassId||classes[0],idx=Math.max(0,db[cls].findIndex(s=>s.id===appState.ui.activeSheetId));
let active=-1,method='',mode='○',override=false,numberRow=0,kanaMode=false,numeric=false;
let storageDb=null,saveQueue=null,persistenceReady=false,saveFailed=false;
let pendingRestoreEnvelope=null;
let pendingPwaUpdate=null,pwaReloadPending=false;
let rosterNames=names,rosterKana=kana;
const create=(name,type)=>M.createSheet(name,type,M.defaultIdFactory);
const sheet=()=>db[cls][idx],studentAt=i=>classInfo[cls]?.students?.[i],stableKey=(j,i)=>M.recordKey(sheet().columns[j].id,studentAt(i).id);
const meta=(j,i)=>sheet().meta[stableKey(j,i)]||{},val=(j,i)=>sheet().values[stableKey(j,i)]||'',setVal=(j,i,v)=>{sheet().values[stableKey(j,i)]=v;render()};
const isDate=v=>/^\d{4}-\d\d-\d\d$/.test(v),short=v=>isDate(v)?`${+v.slice(5,7)}/${+v.slice(8)}`:v,style=v=>({'○':'o','△':'tri','×':'x','欠':'abs','再':'redo'})[v]||(isDate(v)?'date':'');

function snapshotState(){
 return structuredClone({
  appId:M.APP_ID,schemaVersion:M.SCHEMA_VERSION,savedAt:new Date().toISOString(),
  ui:{activeClassId:cls,activeSheetId:sheet()?.id||null,lastColumnId:active>=0?sheet().columns[active]?.id||null:null,kanaMode,numeric},
  classes:classes.map(id=>{const source=classInfo[id],{sheets:_ignored,...classFields}=source;return {...classFields,id,students:(source.students||[]).map(({recordCount,...student})=>student),sheets:db[id]||[]}})
 });
}
function applyState(state){
 appState=M.migrateState(state);classes=appState.classes.map(c=>c.id);classInfo=Object.fromEntries(appState.classes.map(c=>[c.id,c]));db=Object.fromEntries(appState.classes.map(c=>[c.id,c.sheets]));
 cls=classes.includes(appState.ui?.activeClassId)?appState.ui.activeClassId:classes[0];idx=Math.max(0,(db[cls]||[]).findIndex(s=>s.id===appState.ui?.activeSheetId));active=-1;method='';kanaMode=!!appState.ui?.kanaMode;numeric=!!appState.ui?.numeric;syncRoster();
}
function createStarterState(){
 const state=M.createDemoState({nowIso:new Date().toISOString()}),first=state.classes[0];state.classes=[first];first.school='';first.name='クラス1';first.count=35;first.students=Array.from({length:35},(_,i)=>({id:M.defaultIdFactory('student'),no:String(i+1),name:'（未登録）',kana:''}));first.sheets.forEach(s=>{s.values={};s.meta={}});state.ui.activeClassId=first.id;state.ui.activeSheetId=first.sheets[0].id;return state;
}
function updateSaveStatus(status,error){
 const el=$('saveStatus');if(!el)return;saveFailed=status==='error';
 if(pendingPwaUpdate&&status!=='error'){el.dataset.state='update';el.textContent='更新版があります';return}
 if(!navigator.onLine&&status!=='error'){el.dataset.state='offline';el.textContent='オフライン・端末保存';return}
 const labels={loading:'保存準備中',dirty:'未保存の変更',saving:'保存中…',saved:'保存済み',error:'保存失敗・再試行',update:'更新版があります'};el.dataset.state=status;el.textContent=labels[status]||status;if(error)el.title=error.message||String(error);
}
function scheduleSave(){if(persistenceReady&&saveQueue)saveQueue.schedule(snapshotState())}
function downloadCurrentBackup(prefix='TSUKERU-backup'){B.downloadBackup(snapshotState(),new Date(),prefix)}
function retrySave(){
 if(pendingPwaUpdate){modal('<h3>TSUKERUの更新版があります</h3><p>入力内容を端末へ保存してから更新します。更新ボタンを押すまで画面は切り替わりません。</p><footer><button onclick="dismissModal()">後で</button><button onclick="installPwaUpdate()">保存して更新</button></footer>');return}
 if(saveFailed){modal('<h3>端末内保存に失敗しました</h3><p>先に緊急バックアップを保存できます。再試行しても失敗する場合は、ブラウザの空き容量と通常モードかを確認してください。</p><footer><button onclick="downloadCurrentBackup(\'TSUKERU-emergency\')">緊急バックアップ</button><button onclick="dismissModal();saveQueue.retry().catch(()=>{})">保存を再試行</button></footer>');return}
 if(saveQueue?.isDirty()){modal('<h3>未保存の変更があります</h3><p>通常はまもなく自動保存されます。画面を閉じる前に、今すぐ端末へ保存するか、緊急バックアップを保存できます。</p><footer><button onclick="downloadCurrentBackup(\'TSUKERU-emergency\')">緊急バックアップ</button><button onclick="saveNow()">今すぐ保存</button></footer>');return}
 if(persistenceReady)scheduleSave();
}
async function saveNow(){
 try{await saveQueue.flush();dismissModal()}catch(error){alert('保存できませんでした。緊急バックアップを保存してください。\n'+error.message)}
}
async function installPwaUpdate(){
 if(!pendingPwaUpdate)return dismissModal();
 if(saveFailed)return alert('端末内保存に失敗しているため更新できません。先にバックアップを保存してください。');
 try{if(saveQueue?.isDirty())await saveQueue.flush();pwaReloadPending=true;const apply=pendingPwaUpdate;pendingPwaUpdate=null;dismissModal();apply()}catch(error){pwaReloadPending=false;alert('保存を完了できなかったため更新を中止しました。\n'+error.message)}
}
async function initializePwa(){
 if(!P||!/^https?:$/.test(location.protocol))return;
 navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(pwaReloadPending)location.reload()});
 try{await P.registerPwa({onUpdate:apply=>{pendingPwaUpdate=apply;updateSaveStatus('update')},onOffline:()=>updateSaveStatus(saveFailed?'error':'offline')})}catch(error){console.warn('PWA registration failed',error)}
}
function chooseRestoreFile(){
 const input=document.createElement('input');input.type='file';input.accept='application/json,.json';input.onchange=()=>{if(input.files?.[0])handleRestoreFile(input.files[0])};input.click();
}
async function handleRestoreFile(file){
 try{
  const envelope=B.validateBackupEnvelope(await file.text()),summary=B.summarizeBackup(envelope);pendingRestoreEnvelope=envelope;
  modal(`<h3>バックアップから復元</h3><p>作成日時：${esc(new Date(summary.createdAt).toLocaleString('ja-JP'))}</p><p>学級：${summary.classCount} ／ 児童：${summary.studentCount} ／ 評価列：${summary.columnCount}</p><p class="warning">現在のデータは復元直前バックアップとして先にダウンロードされ、その後この内容へ置き換わります。</p><footer><button onclick="pendingRestoreEnvelope=null;dismissModal()">キャンセル</button><button onclick="confirmRestore()">復元する</button></footer>`,'classDialog');
 }catch(error){alert('復元できません：'+error.message)}
}
async function confirmRestore(){
 if(!pendingRestoreEnvelope||!storageDb)return alert('復元するバックアップをもう一度選んでください');
 const next=pendingRestoreEnvelope,previous=snapshotState();
 let replaced=false;
 try{
  if(saveQueue?.isDirty())await saveQueue.flush();
  downloadCurrentBackup('TSUKERU-before-restore');
  await S.writeCurrentState(storageDb,next.state);
  replaced=true;
  applyState(next.state);pendingRestoreEnvelope=null;persistenceReady=true;dismissModal();render();await saveQueue.flush();
 }catch(error){
  if(!replaced)return alert('復元を完了できませんでした。現在の画面データは維持しています。\n'+error.message);
  try{
   await S.writeCurrentState(storageDb,previous);applyState(previous);pendingRestoreEnvelope=null;persistenceReady=true;dismissModal();render();await saveQueue.flush();
   alert('復元を完了できなかったため、復元前のデータへ戻しました。\n'+error.message);
  }catch(rollbackError){
   persistenceReady=false;pendingRestoreEnvelope=null;updateSaveStatus('error',rollbackError);
   alert('復元と元データへの復帰に失敗しました。自動保存を止めて、先ほど保存した「TSUKERU-before-restore」バックアップを保管してください。\n'+rollbackError.message);
  }
 }
}
function chooseFirstRun(kind){
 applyState(kind==='blank'?createStarterState():M.createDemoState({nowIso:new Date().toISOString()}));persistenceReady=true;dismissModal();render();saveQueue.flush().catch(()=>{});if(kind==='blank')setTimeout(()=>openClassSettings(),0);
}
function showFirstRun(){
 modal('<h3>TSUKERUを始める</h3><p>データはこの端末のこのブラウザだけに保存されます。最初に名簿を登録するか、架空の名簿で操作を試してください。</p><p class="hint">学校の実際の名簿は、端末の管理方針に従って入力してください。</p><footer style="flex-wrap:wrap"><button onclick="chooseFirstRun(\'demo\')">架空名簿で試す</button><button onclick="chooseFirstRun(\'blank\')">名簿を登録して始める</button><button onclick="chooseRestoreFile()">バックアップから復元</button></footer>','classDialog');
}
async function initializePersistence(){
 try{
  storageDb=await S.openTsukeruDb(indexedDB);saveQueue=S.createSaveQueue({write:state=>S.writeCurrentState(storageDb,state),onStatus:updateSaveStatus,delayMs:250});
  const saved=await S.readCurrentState(storageDb);S.requestPersistentStorage(navigator.storage).catch(()=>{});
  if(saved&&saved.classes?.length){applyState(saved);persistenceReady=true;render()}
  else if(new URLSearchParams(location.search).get('demo')==='1'){applyState(M.createDemoState({nowIso:new Date().toISOString()}));persistenceReady=true;render()}
  else{render();showFirstRun()}
 }catch(error){render();updateSaveStatus('error',error);modal('<h3>端末内保存を開始できません</h3><p>このまま操作できますが、画面を閉じると入力が消える可能性があります。ChromeまたはSafariの通常モードで開き直してください。</p><footer><button onclick="dismissModal()">確認</button></footer>')}
 document.body.dataset.appReady='true';
}
addEventListener('online',()=>updateSaveStatus(saveFailed?'error':'saved'));
addEventListener('offline',()=>updateSaveStatus(saveFailed?'error':'offline'));
addEventListener('beforeunload',event=>{if(saveQueue?.isDirty()){event.preventDefault();event.returnValue=''}});
function daysBetween(a,b){return D.daysBetween(a,b)}

// All receipt/lesson calculations use the same class calendar (including exceptions).
function currentSchedule(){return {weekdays:classInfo[cls]?.weekdays,exceptions:classInfo[cls]?.exceptions}}
function dateIndex(iso){return D.dateIndex(iso)}
function dateFromIndex(n){return D.dateFromIndex(n)}
function datePlus(iso,n){return D.datePlus(iso,n)}
function classWeekdays(){return D.normalizeSchedule(currentSchedule()).weekdays}
function isClassLessonDay(iso){return D.isLessonDay(iso,currentSchedule())}
function lessonCount(a,b){return D.lessonCount(a,b,currentSchedule())}
function nextReceiptDayOnOrAfter(date){return D.nextReceiptDayOnOrAfter(date,currentSchedule())}
function nextLesson(d){return D.nextLessonAfter(d||today(),currentSchedule())}
function delayUnits(a,b,c){return D.delayUnits(a,b,c,currentSchedule())}
function penaltyFor(a,b,c){return D.penaltyFor(a,b,c,currentSchedule())}
// One read-only evaluation supplies the point value, warning and audit details.
// Actual submission dates, not the day the teacher types them, determine final marks.
function submissionEvaluation(j,i){
 return D.submissionEvaluation({column:sheet().columns[j],value:val(j,i),meta:meta(j,i),schedule:currentSchedule(),today:today()});
}
function submissionScore(j,i){return submissionEvaluation(j,i).current}
function scoreDetails(j,i){return submissionEvaluation(j,i)}

function openAudit(){
 if(sheet().type!=='submission'){modal('<h3>計算確認</h3><p>提出物チェックを選択してください。</p><footer><button onclick="dismissModal()">閉じる</button></footer>');return}
 const options=sheet().columns.map((c,j)=>`<option value="${j}" ${j===active?'selected':''}>${esc(c.title)}</option>`).join('');
 modal(`<h3>評価計算の確認</h3><p class="hint">各児童の記録・減点内訳・評価点を照合できます。確認のみで記録は変更しません。</p><label>確認する列<select id="auditColumn" onchange="drawAudit()">${options}</select></label><div id="auditBody"></div><footer><button onclick="dismissModal()">閉じる</button></footer>`);
 drawAudit();
}
function drawAudit(){
 const j=Number($('auditColumn').value),c=sheet().columns[j];
 const lines=rosterNames.map((n,i)=>{const d=scoreDetails(j,i),v=displayValue(j,i)||'－';const parts=[];
 if(d.redone){parts.push('初回遅延 −'+d.initial);parts.push('再提出 −'+d.redo);parts.push('返却 '+(d.returned?short(d.returned):'未記録'));}
 if(d.due)parts.push('基準 '+short(d.due));
 if(d.submitted)parts.push('提出 '+short(d.submitted));
 if(d.submitted&&c.basis==='lesson'&&d.due&&d.submitted>d.due&&d.assessed)parts.push('評価上の受付 '+short(d.assessed));
 if(d.delay!==null)parts.push('遅延 −'+d.delay);
 if(d.reason)parts.push(d.reason);
 return `<tr><td style="text-align:left;padding:5px;white-space:nowrap">${i+1} ${esc(n)}</td><td>${esc(v)}</td><td><b>${d.current===null?'未確定':d.current}</b></td></tr><tr><td colspan="3" style="text-align:left;padding:2px 5px;color:#666;font-size:11px;height:auto">${esc(parts.join(' ／ ')||'評価未確定')}</td></tr>`;
 }).join('');
 $('auditBody').innerHTML=`<p class="hint">${esc(c.title)}／満点${c.base}点／${c.basis==='lesson'?'授業日基準':c.basis==='none'?'減点なし':'日数基準'}／${c.interval}${c.basis==='lesson'?'回':'日'}ごとに−${c.penalty}点${c.includeInTotal===false?'／集計対象外':''}</p><div style="max-height:45dvh;overflow:auto"><table style="width:100%;min-width:0"><thead><tr><th style="height:28px">児童</th><th style="height:28px">記録</th><th style="height:28px">点数</th></tr></thead><tbody>${lines}</tbody></table></div>`;
}
function score(v,c,j,i){return D.scoreRecord({sheetType:sheet().type,column:c,value:v,meta:meta(j,i),schedule:currentSchedule(),today:today()})}

function total(i){
 const values=sheet().columns.map((c,j)=>c.includeInTotal===false?null:score(val(j,i),c,j,i)).filter(x=>typeof x==='number'&&Number.isFinite(x));
 return values.length?values.reduce((a,b)=>a+b,0):'－';
}
function toggleTotal(j,checked){
 const c=sheet().columns[j];if(!c)return;
 c.includeInTotal=!!checked;render();
}
function displayValue(j,i){
 const v=val(j,i);if(sheet().type!=='submission')return short(v);
 const r=submissionEvaluation(j,i);
 if(r.submitted)return (r.redone?'再':'')+(r.zeroLocked?'⚠':'')+short(r.submitted);
 return v;
}
function markStyle(j,i){
 const v=val(j,i);if(sheet().type!=='submission')return style(v);
 const r=submissionEvaluation(j,i);
 if(r.redone&&v)return 'redo';
 if(r.submitted&&r.zeroLocked)return 'zero';
 return style(v);
}
function storeSubmission(j,i,v){
 const s=sheet(),k=stableKey(j,i),old=s.values[k]||'';let m={...(s.meta[k]||{})};
 // Repeated marking is idempotent: it must not erase a return or completed submission.
 if(v==='再'&&(old==='再'||old==='再⚠')){render();return}
 if(v===old&&v!=='日付'){render();return}
 if(v==='日付'){
  const d=$('date').value||today();if(dateIndex(d)===null){alert('提出日を確認してください');return}
  m.submitted=d;
  if(m.redo||old.startsWith('再')){m.redo=true;v='再'}else v=d;
 }else if(v==='再'){
  m={...m,redo:true,submitted:null,initialSubmitted:m.initialSubmitted||m.submitted||(isDate(old)?old:old==='○'?s.columns[j].due:null),returned:null,redoDue:null};
 }else if(v==='○'){
  if(m.redo){m.submitted=today();v='再'}
  else if(submissionEvaluation(j,i).zeroLocked){m.submitted=m.submitted||today();v=m.submitted}
  else m={};
 }else if(v==='×'){
  m.submitted=null;
 }else if(v===''){
  m={};
 }else if(v==='欠'||v==='△'){
  m.submitted=null;
 }
 // Legacy zeroLocked was computed at input time. Never use it as an authority.
 delete m.zeroLocked;
 s.meta[k]=m;s.values[k]=v;render();
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function redoEditor(j,i){
 const m=meta(j,i),c=sheet().columns[j];
 modal(`<h3>再提出の個別管理｜${esc(rosterNames[i])}</h3><p class="hint">${esc(c.title)}。返却した日だけを指定します。減点の基準は返却後の次の授業です。</p>
 <label>初回提出日（任意）<input type="date" id="rInitial" value="${esc(m.initialSubmitted||'')}"></label>
 <label>返却日（未返却なら空欄）<input type="date" id="rReturned" value="${esc(m.returned||'')}"></label>
 <p class="hint">次の授業日：<strong id="rPreview">${m.returned?short(nextLesson(m.returned)):'未返却'}</strong>（クラス設定を参照）</p>
 <footer><button onclick="dismissModal()">キャンセル</button><button onclick="saveRedo(${j},${i})">保存</button></footer>`);
 $('rReturned').onchange=()=>{$('rPreview').textContent=$('rReturned').value?short(nextLesson($('rReturned').value)):'未返却'};
}
function saveRedo(j,i){
 const k=stableKey(j,i),m={...meta(j,i),redo:true,initialSubmitted:$('rInitial').value||null,returned:$('rReturned').value||null};
 m.redoDue=m.returned?nextLesson(m.returned):null;
 sheet().meta[k]=m;dismissModal();render();
}
function batchReturn(){
 if(active<0||sheet().type!=='submission')return;
 const eligible=rosterNames.map((n,i)=>({n,i,m:meta(active,i),v:val(active,i)})).filter(x=>(x.v==='再'||x.m.redo)&&!x.m.returned&&!x.m.submitted);
 if(!eligible.length){modal('<h3>再提出分を返却</h3><p>この列には、返却日が未設定の再提出待ちがありません。</p><footer><button onclick="dismissModal()">閉じる</button></footer>');return}
 modal(`<h3>再提出分を一括返却</h3><p class="hint">選択した児童に返却日を一括登録します。再提出期限の個別入力は不要です。</p><label>返却日<input type="date" id="batchDate" value="${today()}"></label><p class="hint">次の授業日を追加減点の基準にします（クラス設定を参照）。</p><div style="max-height:170px;overflow:auto">${eligible.map(x=>`<label><input type="checkbox" class="batchPerson" value="${x.i}" checked> ${x.i+1} ${esc(x.n)}</label>`).join('')}</div><footer><button onclick="dismissModal()">キャンセル</button><button onclick="saveBatchReturn()">まとめて記録</button></footer>`);
}
function saveBatchReturn(){
 const d=$('batchDate').value,ids=[...document.querySelectorAll('.batchPerson:checked')].map(e=>+e.value);
 if(!d||!ids.length){alert('返却日と対象者を指定してください');return}
 ids.forEach(i=>{const k=stableKey(active,i),m={...meta(active,i)};m.redo=true;m.returned=d;m.redoDue=nextLesson(d);sheet().meta[k]=m});
 dismissModal();render();
}
function redoDetails(j,i){const m=meta(j,i);if(m.redo){
 const submitted=m.submitted?`<p>再提出日：${esc(m.submitted)}</p>`:'<p>再提出：未完了</p>';
 modal(`<h3>再提出の詳細｜${esc(rosterNames[i])}</h3><p>初回提出：${esc(m.initialSubmitted||'未記録')}</p><p>返却日：${esc(m.returned||'未返却')}</p><p>追加減点の基準日：${esc(m.returned?nextLesson(m.returned):'未設定')}</p>${submitted}<footer><button onclick="dismissModal()">閉じる</button><button onclick="dismissModal();redoEditor(${j},${i})">個別修正</button></footer>`)
 }else redoEditor(j,i)
}
const lockIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#777" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',unlockIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#278a78" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></svg>';
function render(){
 const s=sheet();
 $('cl').innerHTML=classes.map(c=>`<option value="${esc(c)}" ${cls===c?'selected':''}>${esc(classLabel(c))}</option>`).join('')+'<option value="__settings__">⚙ クラス設定・追加</option>';
 $('sh').innerHTML=db[cls].map((x,i)=>`<option value="${i}" ${idx===i?'selected':''}>${esc(x.name)}</option>`).join('');
 let h=`<thead><tr><th class="name"><button onclick="kanaMode=!kanaMode;render()">${kanaMode?'ひらがな':'番号・氏名'}</button></th>`;
 s.columns.forEach((c,j)=>{
  if(c.hidden){h+=`<th class="hidden-marker"><button title="${esc(c.title)}を再表示（集計${c.includeInTotal===false?'対象外':'対象'}）" aria-label="${esc(c.title)}を再表示" onclick="sheet().columns[${j}].hidden=false;render()">💬</button></th>`;return}
  const missing=rosterNames.filter((_,i)=>val(j,i)==='×').length,redo=rosterNames.filter((_,i)=>val(j,i)==='再'&&!meta(j,i).submitted).length;
  h+=`<th class="head ${active===j?'active':''} ${c.includeInTotal===false?'excluded':''}"><span class="head-title">${esc(c.title)}</span><small>${c.due?short(c.due)+'〆 ':''}${missing?'未'+missing+' ':''}${redo?'再'+redo:''}</small><div class="head-actions"><button title="${active===j?'ロック':'編集する'}" onclick="lock(${j})">${active===j?unlockIcon:lockIcon}</button><button title="列のメニュー" onclick="menu(${j})">⋯</button><label class="total-choice" title="この列を合計点数に含める。非表示でもこの設定は維持されます。"><input class="total-toggle" type="checkbox" data-total="${j}" aria-label="${esc(c.title)}を集計に含める" ${c.includeInTotal!==false?'checked':''} onchange="toggleTotal(${j},this.checked)">集計</label></div></th><th class="add"><button title="右に列を追加" onclick="add(${j+1})">＋</button></th>`;
 });
 const count=s.columns.filter(c=>c.includeInTotal!==false).length;
 h+=`<th class="sum-head" title="チェックを付けた列だけ合計します。非表示の列も含みます。">集計<small>${count}列対象</small></th></tr></thead><tbody>`;
 rosterNames.forEach((n,i)=>{
  h+=`<tr><td class="name"><b>${i+1}</b>${esc(kanaMode?rosterKana[i]:n)}</td>`;
  s.columns.forEach((c,j)=>{
   if(c.hidden){h+='<td class="hidden-marker"></td>';return}
   const v=val(j,i),x=numeric?score(v,c,j,i):displayValue(j,i);
   h+=`<td><button class="cell ${numeric?'':markStyle(j,i)} ${active===j?'active':''}" data-redo="${j}:${i}" onclick="cell(${j},${i})">${esc(x??'－')}</button></td><td class="add"></td>`;
  });
  h+=`<td class="sum">${total(i)}</td></tr>`;
 });
 $('table').innerHTML=h+'</tbody>';$('view').textContent=numeric?'記録':'数値';
 $('status').textContent=active<0?'全列ロック中｜端末内保存の試用版｜別端末とは同期されません｜定期的に手動バックアップ｜架空名簿で確認できます':'編集中：'+s.columns[active].title+'｜この端末に自動保存（別端末とは同期されません）';
 palette();scheduleSave();requestAnimationFrame(()=>{if(typeof clampFloat==='function')clampFloat()});
}

function palette(){$('tools').hidden=active<0||$('fold').textContent==='+';$('numBox').hidden=method!=='number';$('palette').hidden=method==='number';$('dateBox').hidden=mode!=='日付'||method==='cycle'&&!override;let a=sheet().type==='evaluation'?['○','△','×','欠']:['○','△','×','欠','再','日付'];$('palette').innerHTML=a.map(x=>`<button style="background:${colors[x]}" ${method==='cycle'&&['○','△','×'].includes(x)?'disabled':''} onclick="mode='${x}';override=method==='cycle';if(mode==='日付')$('date').value=today();palette()">${x}</button>`).join('')+(method==='cycle'?'<button class="wide" onclick="override=false;palette()">↩ 連続へ</button>':'')+(method==='direct'?'<button class="wide" onclick="fill(\'○\')">残りを○</button><button class="wide" onclick="fill(\'×\')">残りを×</button>':'')+(sheet().type==='submission'?'<button class="wide" style="background:#eee6f8" onclick="batchReturn()">再提出分を返却</button>':'')}
function modal(h,extra=''){$('modal').innerHTML='<div class="overlay"><div class="dialog '+extra+'">'+h+'</div></div>'}function dismissModal(){$('modal').innerHTML=''}function lock(j){if(active===j){active=-1;method='';render();return}active=j;override=false;if(sheet().type==='number'){method='number';render();return}modal(`<h3>${esc(sheet().columns[j].title)}</h3><p>入力方式を選択</p><footer><button onclick="method='cycle';dismissModal();render()">連続タップ</button><button onclick="method='direct';dismissModal();render()">パレット指定</button></footer>`);render()}function cell(j,i){if(j!==active||numeric)return;if(method==='number'){numberRow=i;$('number').value=val(j,i);return}let v=method==='cycle'&&!override?['','○','△','×'][(['','○','△','×'].indexOf(val(j,i))+1)%4]:mode==='日付'?'日付':mode;if(sheet().type==='submission')storeSubmission(j,i,v);else setVal(j,i,v)}function fill(v){if(active<0)return;rosterNames.forEach((_,i)=>{if(!val(active,i))sheet().values[stableKey(active,i)]=v});render()}function add(j){modal(`<h3>列を追加</h3><label>タイトル<input id="title" placeholder="新しい課題"></label>${sheet().type==='submission'?`<label>提出期限<input type="date" id="due" value="${today()}"></label><label><input type="checkbox" id="inherit" checked> 左の列の減点設定を引き継ぐ</label><label>減点間隔（日）<input type="number" id="interval" value="${sheet().columns[j-1]?.interval||3}"></label><label>減点幅<input type="number" id="penalty" value="${sheet().columns[j-1]?.penalty||1}"></label>`:''}<footer><button onclick="dismissModal()">キャンセル</button><button onclick="saveAdd(${j})">追加</button></footer>`)}function saveAdd(j){let title=$('title').value.trim();if(!title)return alert('タイトルを入力してください');let prev=sheet().columns[j-1],c={id:M.defaultIdFactory('column'),title,includeInTotal:true,hidden:false,due:$('due')?.value||'',base:5,interval:Math.max(1,+$('interval')?.value||3),penalty:Math.max(0,+$('penalty')?.value||1),basis:prev?.basis||'days',redoPenalty:prev?.redoPenalty??1,zeroDays:prev?.zeroDays??30,zeroFloor:prev?.zeroFloor??true};if($('inherit')?.checked&&prev)c.base=prev.base;sheet().columns.splice(j,0,c);active=-1;dismissModal();render()}function updateIntervalLabel(){let b=$('editBasis')?.value,el=$('intervalQuestion');if(!el)return;el.textContent=b==='lesson'?'授業実施回数の何回ごとに減点しますか？':b==='days'?'何日ごとに減点しますか？':'減点なし（間隔の設定は不要）';let field=$('editInterval');if(field)field.disabled=b==='none'}function editColumn(j){let c=sheet().columns[j];modal(`<h3>列の設定：${esc(c.title)}</h3><label>タイトル<input id="editTitle" value="${esc(c.title)}"></label>${sheet().type==='submission'?`<label>提出期限<input id="editDue" type="date" value="${esc(c.due||'')}"></label><label>満点<input id="editBase" type="number" min="0" value="${c.base}"></label><label>減点方式<select id="editBasis" onchange="updateIntervalLabel()"><option value="days" ${c.basis==='days'?'selected':''}>日数基準</option><option value="lesson" ${c.basis==='lesson'?'selected':''}>授業日基準（クラス設定を参照）</option><option value="none" ${c.basis==='none'?'selected':''}>減点なし</option></select></label><label><span id="intervalQuestion">減点間隔</span><input id="editInterval" type="number" min="1" value="${c.interval}"></label><label>減点確定ごとに何点減らしますか？<input id="editPenalty" type="number" min="0" value="${c.penalty}"></label><label>再提出対象を減点する場合は何点引きますか？<input id="editRedo" type="number" min="0" value="${c.redoPenalty}"></label><p class="hint">※ 再提出が必要なことを児童に伝え、課題を返却するまでの間は、遅延による追加減点は確定しません。返却後、次の授業日を過ぎると、設定したルールに従って減点します。</p><label>未提出を0点確定する日数<input id="editZero" type="number" min="1" value="${c.zeroDays}"></label><label><input id="editFloor" type="checkbox" ${c.zeroFloor?'checked':''}> 減点が0点に達したら確定</label><p class="hint">変更した評価基準は、この列の全児童に適用されます。既存の提出日は変わりません。</p>`:''}<footer><button onclick="dismissModal()">戻る</button><button onclick="saveColumn(${j})">全員に適用</button></footer>`);updateIntervalLabel()}
function saveColumn(j){let c=sheet().columns[j];c.title=$('editTitle').value.trim()||c.title;if(sheet().type==='submission'){c.due=$('editDue').value;c.base=Math.max(0,+$('editBase').value||0);c.basis=$('editBasis').value;c.interval=Math.max(1,+$('editInterval').value||1);c.penalty=Math.max(0,+$('editPenalty').value||0);c.redoPenalty=Math.max(0,+$('editRedo').value||0);c.zeroDays=Math.max(1,+$('editZero').value||30);c.zeroFloor=$('editFloor').checked}dismissModal();render()}
function menu(j){modal(`<h3>${esc(sheet().columns[j].title)}</h3><footer style="flex-wrap:wrap"><button onclick="dismissModal();editColumn(${j})">列の設定</button><button onclick="sheet().columns[${j}].hidden=true;active=-1;dismissModal();render()">非表示</button><button onclick="dismissModal();add(${j+1})">設定を引き継いで追加</button><button onclick="dismissModal()">閉じる</button></footer>`)}

// Class management: independent from MITORI, using its registration workflow.
function syncRoster(){const r=classInfo[cls];rosterNames=r?.students?.map(x=>x.name)||names;rosterKana=r?.students?.map(x=>x.kana||x.name)||kana;}
function initClassInfo(){syncRoster()}
function parseRoster(text){return R.parseRoster(text).rows.map(row=>({...row,no:Number(row.no)}))}
function classLabel(key){const c=classInfo[key];return (c?.school?c.school+'｜':'')+(c?.name||key)}

let classEditingNew=false,classFormOwner=null;
const classDrafts=new Map();
function captureClassDraft(){
 if(!$('classForm')||!$('schoolName')||!classFormOwner)return;
 classDrafts.set(classFormOwner,{school:$('schoolName').value,name:$('className').value,year:$('schoolYear').value,count:$('classCount').value,weekdays:[...document.querySelectorAll('.weekday:checked')].map(e=>+e.value),rosterRaw:$('rosterPaste').value});
}
function openClassSettings(){
 captureClassDraft();
 const opts=classes.map(x=>`<option value="${esc(x)}" ${x===cls?'selected':''}>${esc(classLabel(x))}</option>`).join('');
 modal(`<h3>クラス設定</h3><div style="padding:10px;border:1px solid #eadfd8;border-radius:9px;background:#fffdfa"><strong>データのバックアップ</strong><p class="hint">名簿・評価などの個人情報を含みます。学校が指定するGoogleドライブ等の保存先だけに保管してください。別端末とは自動同期されません。</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button onclick="downloadCurrentBackup()">バックアップを保存</button><button onclick="chooseRestoreFile()">バックアップから復元</button></div></div><label>登録済みクラス<select id="classPick" onchange="selectClassEdit(this.value)">${opts}</select></label><div style="display:flex;gap:8px"><button onclick="newClassEdit()">＋クラスを追加</button><button onclick="editClassForm()">現在のクラスを編集</button></div><div id="classForm"></div><footer><button onclick="captureClassDraft();dismissModal()">閉じる</button></footer>`,'classDialog');editClassForm();
}
function selectClassEdit(value){captureClassDraft();cls=value;idx=0;active=-1;syncRoster();render();editClassForm()}
function newClassEdit(){editClassForm(true)}
function editClassForm(isNew=false){
 captureClassDraft();classEditingNew=isNew;classFormOwner=isNew?'__new__':cls;
 const c=classDrafts.get(classFormOwner)||(isNew?{school:'',name:'',year:'2026',count:35,weekdays:[],students:[]}:classInfo[cls]);
 const lines=c.rosterRaw!==undefined?c.rosterRaw:(c.students||[]).map(x=>`${x.no}\t${x.name}\t${x.kana||''}`).join('\n');
 $('classForm').innerHTML=`<hr><div class="two"><label>学校名<input id="schoolName" value="${esc(c.school)}" placeholder="例：○○小学校"></label><label>クラス名<input id="className" value="${esc(c.name)}" placeholder="例：6年1組"></label><label>学年・年度<input id="schoolYear" value="${esc(c.year||'2026')}" placeholder="例：2026年度"></label><label>人数<input id="classCount" type="number" min="1" max="200" value="${esc(c.count??35)}"></label></div><label>授業実施曜日</label><div class="week">${['日','月','火','水','木','金','土'].map((d,i)=>`<label><input type="checkbox" class="weekday" value="${i}" ${c.weekdays.includes(i)?'checked':''}>${d}</label>`).join('')}</div><p class="fieldhint">提出物の授業日基準の減点に使用します。通常と異なる日程は別画面で管理します。</p><button type="button" onclick="openExceptions()" ${isNew?'disabled':''}>📅 授業日程の例外を設定（登録済みクラス）</button><label>名簿登録（出席番号・氏名・よみがな）<textarea id="rosterPaste" placeholder="1&#9;山田太郎&#9;やまだたろう&#10;2&#9;佐藤花子&#9;さとうはなこ">${esc(lines)}</textarea></label><p class="fieldhint">Excel／スプレッドシートからタブ区切りで貼り付け。新規登録では空欄で空席を作れます。記録のある児童を名簿から消したり、人数を減らして隠したりする操作は保存できません。</p><p class="draft-note">例外日画面へ移動しても編集中の入力は保持します。クラス情報は「変更を保存」で反映します（再読み込みで下書きは消えます）。</p><div id="rosterPreview" class="fieldhint"></div><button onclick="previewRoster()">名簿を確認</button><footer><button onclick="openClassSettings()">戻る</button><button onclick="saveClassSettings()">${isNew?'クラスを登録':'変更を保存'}</button></footer>`;
}
function studentRecordCount(key,studentId){
 const recordKeys=new Set();
 (db[key]||[]).forEach(s=>{Object.entries(s.values||{}).forEach(([k,v])=>{if(k.endsWith(':'+studentId)&&v!=='')recordKeys.add(s.id+':'+k)});Object.entries(s.meta||{}).forEach(([k,v])=>{if(k.endsWith(':'+studentId)&&Object.keys(v||{}).length)recordKeys.add(s.id+':'+k)})});
 return recordKeys.size;
}
function rosterPlan(){
 const parsed=R.parseRoster($('rosterPaste').value),existing=classEditingNew?[]:(classInfo[cls]?.students||[]).map(student=>({...student,recordCount:studentRecordCount(cls,student.id)}));
 return {parsed,plan:R.planRosterImport(existing,parsed.rows),existing};
}
function previewRoster(){
 const {parsed,plan}=rosterPlan(),preview=$('rosterPreview');
 if(parsed.errors.length){preview.innerHTML='<strong>修正が必要です</strong><br>'+parsed.errors.map(error=>`${error.line}行目：${esc(error.message)}`).join('<br>');return}
 const summary=[`読み取り：${parsed.rows.length}人`,`変更なし：${plan.unchanged.length}人`,`表記修正：${plan.corrected.length}人`,`追加：${plan.added.length}人`,`番号変更候補：${plan.renumbered.length}人`,`貼り付けにない児童：${plan.missingWithRecords.length+plan.missingWithoutRecords.length}人`];
 const safety=(plan.reassignments.length?`<br><strong>要確認：${plan.reassignments.length}人は、別の児童との入れ替えに見えます。</strong>`:'')+(plan.correctedWithRecords.length?`<br>評価記録がある表記修正：${plan.correctedWithRecords.length}人（保存時に確認します）`:'');
 preview.innerHTML=summary.join(' ／ ')+(parsed.warnings.length?`<br>よみがな空欄：${parsed.warnings.length}人`:'')+safety+((plan.missingWithRecords.length||plan.missingWithoutRecords.length)?'<br><button type="button" onclick="saveRosterWithRemoval()">貼り付けにいない児童を削除…</button>':'');
}
function hasStudentRecord(key,studentId){
 return (db[key]||[]).some(s=>Object.entries(s.values).some(([k,v])=>k.endsWith(':'+studentId)&&v!=='')||Object.entries(s.meta||{}).some(([k,v])=>k.endsWith(':'+studentId)&&Object.keys(v||{}).length>0));
}
function saveRosterWithRemoval(){
 const {parsed,plan}=rosterPlan(),missing=[...plan.missingWithRecords,...plan.missingWithoutRecords];
 if(parsed.errors.length)return previewRoster();
 if(!missing.length)return alert('削除対象はいません');
 const detail=missing.slice(0,10).map(item=>`${item.student.no} ${item.student.name}（記録${item.recordCount}件）`).join('\n');
 if(!confirm(`貼り付けにない児童を名簿から削除します。\n${detail}${missing.length>10?'\nほか'+(missing.length-10)+'人':''}\n記録も端末から削除対象になります。続けますか？`))return;
 if(prompt('取り消せない操作です。続けるには「削除」と入力してください。')!=='削除')return;
 saveClassSettings(true);
}
function saveClassSettings(removeMissing=false){
 const school=$('schoolName').value.trim(),name=$('className').value.trim(),year=$('schoolYear').value.trim(),count=Number($('classCount').value),weekdays=[...document.querySelectorAll('.weekday:checked')].map(x=>Number(x.value)),{parsed,plan,existing}=rosterPlan(),students=parsed.rows;
 if(!school)return alert('学校名を入力してください');
 if(!name)return alert('クラス名を入力してください');
 if(!Number.isInteger(count)||count<1||count>200)return alert('人数を1〜200で設定してください');
 if(!weekdays.length)return alert('授業曜日を1つ以上選択してください');
 if(parsed.errors.length)return alert(parsed.errors.map(error=>`${error.line}行目：${error.message}`).join('\n'));
 if(!students.length)return alert('名簿を1人以上貼り付けてください');
 if(students.some(x=>Number(x.no)>count))return alert('出席番号が設定人数の範囲外です');
 const old=cls,previous=classEditingNew?null:classInfo[old];
 if(classes.some(key=>(classEditingNew||key!==old)&&classInfo[key]?.school===school&&classInfo[key]?.name===name))return alert('この学校には同じクラス名が既に登録されています');
 let allowRecordCorrection=plan.correctedWithRecords.length===0,allowReassignment=plan.reassignments.length===0;
 if(plan.reassignments.length){
  const detail=plan.reassignments.map(item=>`${item.before.no} ${item.before.name} → ${item.after.name}`).join('\n');
  if(!confirm(`出席番号は同じまま氏名が入れ替わっています。評価記録を別の氏名へ対応させる操作です。\n${detail}\n意図した入れ替えですか？`))return;
  if(prompt('記録との対応が変わります。続けるには「入れ替え」と入力してください。')!=='入れ替え')return;
  allowRecordCorrection=true;allowReassignment=true;
 }else if(plan.correctedWithRecords.length){
  const detail=plan.correctedWithRecords.map(item=>`${item.before.no} ${item.before.name} → ${item.after.name}`).join('\n');
  if(!confirm(`評価記録がある児童の表記を変更します。記録は同じ児童IDへ引き継がれます。\n${detail}\n氏名・よみがなの表記修正として保存しますか？`))return;
  allowRecordCorrection=true;
 }
 if(plan.renumbered.length&&!confirm('同じ氏名・よみがなで出席番号だけが変わっています。\n'+plan.renumbered.map(item=>`${item.before.no} → ${item.after.no} ${item.after.name}`).join('\n')+'\n同一児童の番号変更として記録を引き継ぎますか？'))return;
 const key=classEditingNew?M.defaultIdFactory('class'):old;
 const removeStudentIds=removeMissing?[...plan.missingWithRecords,...plan.missingWithoutRecords].map(item=>item.studentId):[];
 let imported=R.applyRosterImport(existing,plan,{idFactory:M.defaultIdFactory,allowRenumber:plan.renumbered.length>0,allowRecordCorrection,allowReassignment,removeStudentIds,allowRecordDeletion:removeMissing});
 if(removeMissing&&removeStudentIds.length){
  const suffixes=removeStudentIds.map(id=>':'+id);
  (db[old]||[]).forEach(s=>{for(const k of Object.keys(s.values||{}))if(suffixes.some(suffix=>k.endsWith(suffix)))delete s.values[k];for(const k of Object.keys(s.meta||{}))if(suffixes.some(suffix=>k.endsWith(suffix)))delete s.meta[k]});
 }
 const byNo=new Map(imported.map(student=>[Number(student.no),student]));
 const finalCount=Math.max(count,...imported.map(student=>Number(student.no)||0));
 const finalStudents=Array.from({length:finalCount},(_,i)=>byNo.get(i+1)||{id:M.defaultIdFactory('student'),no:String(i+1),name:'（未登録）',kana:''});
 if(classEditingNew){classes.push(key);db[key]=[create('提出物チェック','submission'),create('活動評価','evaluation'),create('点数記録','number')]}
 classInfo[key]={id:key,school,name,year,count:finalCount,weekdays,students:finalStudents,exceptions:previous?.exceptions||{},sheets:db[key]};
 classDrafts.delete(classFormOwner);classFormOwner=null;classEditingNew=false;
 cls=key;idx=0;active=-1;syncRoster();dismissModal();render();
}
function openExceptions(){
 if(classEditingNew)return alert('先にクラスを保存してください');
 captureClassDraft();
 const c=classInfo[cls],rows=Object.entries(c.exceptions||{}).sort(([a],[b])=>a.localeCompare(b));
 modal(`<h3>授業日程の例外｜${esc(classLabel(cls))}</h3><p class="hint">通常の授業曜日を上書きします。追加・更新すると、このクラスの評価を再計算します。クラス設定で編集中の入力は、戻ったときに復元します。</p><label>対象日<input type="date" id="exceptionDate" value="${today()}"></label><label>この日の扱い<select id="exceptionKind"><option value="off">授業なし（減点の回数に含めない）</option><option value="on">授業あり（減点の回数に含める）</option></select></label><button onclick="saveException()">例外日を追加・更新</button><div style="max-height:230px;overflow:auto;margin-top:12px">${rows.length?rows.map(([d,v])=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px;border-bottom:1px solid #ddd"><span>${esc(d)}　${v==='on'?'授業あり':'授業なし'}</span><button onclick="removeException('${d}')">削除</button></div>`).join(''):'<p class="hint">例外日の登録はありません。</p>'}</div><footer><button onclick="openClassSettings()">クラス設定へ戻る</button></footer>`,'classDialog');
}
function saveException(){
 const d=$('exceptionDate')?.value,k=$('exceptionKind')?.value;
 if(dateIndex(d)===null||!['on','off'].includes(k))return alert('日付と扱いを選択してください');
 classInfo[cls].exceptions??={};classInfo[cls].exceptions[d]=k;openExceptions();render();
}
function removeException(d){delete classInfo[cls].exceptions[d];openExceptions();render()}

initClassInfo();
let holdTimer=null,holdTriggered=false;
$('table').addEventListener('dblclick',e=>{let el=e.target.closest('[data-redo]');if(!el)return;let [j,i]=el.dataset.redo.split(':').map(Number);if(meta(j,i).redo)redoDetails(j,i)});
$('table').addEventListener('contextmenu',e=>{let el=e.target.closest('[data-redo]');if(!el)return;e.preventDefault();let [j,i]=el.dataset.redo.split(':').map(Number);redoDetails(j,i)});
$('keys').innerHTML=['7','8','9','4','5','6','1','2','3','.','0','⌫','Enter'].map(k=>`<button class="${k==='Enter'?'enter':''}" onclick="key('${k}')">${k}</button>`).join('');function key(k){let x=$('number');if(k==='Enter'){if(x.value!=='')setVal(active,numberRow,x.value);if(numberRow<rosterNames.length-1)numberRow++;x.value=val(active,numberRow)}else if(k==='⌫')x.value=x.value.slice(0,-1);else if(k!=='.'||!x.value.includes('.'))x.value+=k}$('cl').onchange=e=>{if(e.target.value==='__settings__'){openClassSettings();render();return}cls=e.target.value;idx=0;active=-1;syncRoster();render()};$('sh').onchange=e=>{idx=+e.target.value;active=-1;render()};$('view').onclick=()=>{numeric=!numeric;render()};$('date').value=today();$('today').onclick=()=>$('date').value=today();$('fold').onclick=()=>{$('fold').textContent=$('fold').textContent==='−'?'+':'−';palette()};let drag=null;$('drag').addEventListener('pointerdown',e=>{if(e.target.tagName==='BUTTON')return;let r=$('float').getBoundingClientRect();drag={dx:e.clientX-r.left,dy:e.clientY-r.top};$('drag').setPointerCapture(e.pointerId)});$('drag').addEventListener('pointermove',e=>{if(!drag)return;let f=$('float');f.style.left=Math.max(0,Math.min(innerWidth-f.offsetWidth,e.clientX-drag.dx))+'px';f.style.top=Math.max(0,Math.min(innerHeight-f.offsetHeight,e.clientY-drag.dy))+'px';f.style.right='auto'});$('drag').addEventListener('pointerup',()=>drag=null);function clampFloat(){let f=$('float'),r=f.getBoundingClientRect();if(r.right>innerWidth||r.bottom>innerHeight||r.left<0||r.top<42){f.style.left=Math.max(0,Math.min(innerWidth-f.offsetWidth,r.left))+'px';f.style.top=Math.max(42,Math.min(innerHeight-f.offsetHeight,r.top))+'px';f.style.right='auto'}}addEventListener('resize',clampFloat);initializePersistence().then(()=>{initializePwa();$('float').style.top=Math.max(120,innerHeight-$('float').offsetHeight-54)+'px';clampFloat()});


