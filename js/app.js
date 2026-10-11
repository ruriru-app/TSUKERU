
const $=x=>document.getElementById(x),today=()=>new Date().toLocaleDateString('sv-SE');
const M=globalThis.TSUKERUModel,W=globalThis.TSUKERUWorkspace,D=globalThis.TSUKERUDomain,R=globalThis.TSUKERURoster,S=globalThis.TSUKERUStorage,B=globalThis.TSUKERUBackup,P=globalThis.TSUKERUPwa,Palette=globalThis.TSUKERUPalette,Interactions=globalThis.TSUKERUInteractions,Settings=globalThis.TSUKERUSettings,ExportModel=globalThis.TSUKERUExportModel,CsvExport=globalThis.TSUKERUCsv,XlsxExport=globalThis.TSUKERUXlsx,PrintExport=globalThis.TSUKERUPrint;
const names=M.DEMO_NAMES,kana=M.DEMO_KANA,colors={'A':'#E4F4E7','○':'#E4F4E7','B':'#FFF3C9','△':'#FFF3C9','C':'#F9E0E0','×':'#F9E0E0','欠':'#EDEDED','再':'#EEE6F8','再返':'#EEE6F8','日付':'#FFF1BF'};
let appState=M.createDemoState({nowIso:new Date().toISOString()});
let classes=appState.classes.map(c=>c.id);
let classInfo=Object.fromEntries(appState.classes.map(c=>[c.id,c]));
let db=Object.fromEntries(appState.classes.map(c=>[c.id,c.sheets]));
let cls=appState.ui.currentClassId||classes[0],idx=0;
let active=-1,method='',mode='○',modeAction='mark',override=false,clearReturn=null,numberRow=0,numberTarget=null,kanaMode=false,numeric=false;
let storageDb=null,saveQueue=null,persistenceReady=false,saveFailed=false;
let pendingRestoreEnvelope=null;
let pendingPwaUpdate=null,pwaReloadPending=false;
let settingsSection='classes';
let rosterNames=names,rosterKana=kana;
const columnDoubleActivation=Interactions.createDoubleActivation({maxDelayMs:450,maxDistancePx:12});
const saveStatusModel=Interactions.createSaveStatusModel({locale:'ja-JP'});
const create=(name,type)=>M.createSheet(name,type,M.defaultIdFactory);
const sheetList=()=>{const views=db[cls]||[],groupId=appState.ui?.recordMode==='combined'?appState.ui?.currentGroupId:null;if(!groupId)return views;const ids=new Set(W.sheetsForGroup(appState,groupId).map(item=>item.id));return views.filter(view=>ids.has(view.id))};
const sheet=()=>sheetList()[idx],studentAt=i=>classInfo[cls]?.students?.[i],stableKey=(j,i)=>M.recordKey(sheet().columns[j].id,studentAt(i).id);
idx=Math.max(0,sheetList().findIndex(s=>s.id===appState.ui.currentSheetId));
const meta=(j,i)=>sheet().meta[stableKey(j,i)]||{},val=(j,i)=>sheet().values[stableKey(j,i)]||'',setVal=(j,i,v)=>{sheet().values[stableKey(j,i)]=v;render()};
const isDate=v=>/^\d{4}-\d\d-\d\d$/.test(v),short=v=>isDate(v)?`${+v.slice(5,7)}/${+v.slice(8)}`:v,style=v=>({'A':'o','○':'o','B':'tri','△':'tri','C':'x','×':'x','欠':'abs','再':'redo'})[v]||(isDate(v)?'date':'');

function snapshotState(){
 appState.savedAt=new Date().toISOString();
 appState.ui={
  view:appState.ui?.view||'record',currentClassId:cls||null,currentSheetId:sheet()?.id||null,
  currentGroupId:appState.ui?.currentGroupId||null,recordMode:appState.ui?.recordMode||'class',
  lastColumnId:active>=0?sheet().columns[active]?.id||null:null,kanaMode,numeric
 };
 for(const classId of classes){
  for(const view of db[classId]||[]){
   const definition=appState.sheetDefinitions.find(item=>item.id===view.id);if(!definition)continue;
   if(definition.scope.type==='class')definition.dueDatesByClass[classId]=Object.fromEntries(view.columns.map(column=>[column.id,column.due||'']));
  }
 }
 return W.validateWorkspace(structuredClone(appState));
}
function applyState(state){
 appState=M.migrateState(state);classes=appState.classes.map(c=>c.id);classInfo=Object.fromEntries(appState.classes.map(c=>[c.id,c]));db=Object.fromEntries(appState.classes.map(c=>[c.id,c.sheets]));
 cls=classes.includes(appState.ui?.currentClassId)?appState.ui.currentClassId:classes[0];idx=Math.max(0,sheetList().findIndex(s=>s.id===appState.ui?.currentSheetId));active=-1;method='';kanaMode=!!appState.ui?.kanaMode;numeric=!!appState.ui?.numeric;syncRoster();return appState;
}
function createStarterState(){
 const state=M.createLegacyDemoState({nowIso:new Date().toISOString()}),first=state.classes[0];state.classes=[first];first.school='';first.name='クラス1';first.count=35;first.students=Array.from({length:35},(_,i)=>({id:M.defaultIdFactory('student'),no:String(i+1),name:'（未登録）',kana:''}));first.sheets.forEach(s=>{s.values={};s.meta={}});state.ui.activeClassId=first.id;state.ui.activeSheetId=first.sheets[0].id;return M.migrateState(state);
}
function updateSaveStatus(status,error){
 const el=$('saveStatus');if(!el)return;saveFailed=status==='error';
 const stored=saveStatusModel.update(status,{error,savedAt:status==='saved'?new Date().toISOString():undefined});
 const shown=pendingPwaUpdate&&status!=='error'?{...stored,status:'update',label:'更新版があります'}:!navigator.onLine&&status!=='error'?{...stored,status:'offline',label:'オフライン・端末保存'}:stored;
 el.dataset.state=shown.status;el.innerHTML=`<span>${esc(shown.label)}</span><small>${esc(shown.savedAtText||'まだ保存されていません')}</small>`;el.title=shown.error||'';
}
function scheduleSave(){if(persistenceReady&&saveQueue)saveQueue.schedule(snapshotState())}
function downloadCurrentBackup(prefix='TSUKERU-backup'){B.downloadBackup(snapshotState(),new Date(),prefix)}
function exportClassIds(mode){return ExportModel.resolveClassIds(snapshotState(),{sheetId:sheet()?.id,mode,currentClassId:cls})}
function openExportDialog(){
 if(!sheet())return alert('出力するシートがありません');
 let allIds=[];try{allIds=exportClassIds('all')}catch(error){return alert(error.message)}
 const currentName=classLabel(cls),allLabel='このシートの全クラス';
 modal(`<button type="button" class="dialog-close" aria-label="閉じる" onclick="dismissModal()">×</button><h3>チェック表を出力</h3><p class="hint">現在表示している「${esc(sheet().name)}」を書き出します。</p><div class="export-options"><fieldset><legend>形式</legend><div class="export-format-grid"><label class="export-option"><input type="radio" name="exportFormat" value="xlsx" checked><span>Excel（.xlsx）<small>クラスごとに別シートで保存</small></span></label><label class="export-option"><input type="radio" name="exportFormat" value="csv"><span>CSV（UTF-8）<small>全クラスを1つの表で保存</small></span></label><label class="export-option"><input type="radio" name="exportFormat" value="print-records"><span>記録入りPDF・印刷<small>A4縦の印刷画面を開く</small></span></label><label class="export-option"><input type="radio" name="exportFormat" value="print-blank"><span>空欄ひな形PDF・印刷<small>氏名と記録を載せない空欄版</small></span></label></div></fieldset><fieldset><legend>対象</legend><div class="export-scope"><label class="export-option"><input type="radio" name="exportScope" value="current" checked><span>現在のクラス<small>${esc(currentName)}</small></span></label><label class="export-option"><input type="radio" name="exportScope" value="all"><span>${allLabel}<small>${allIds.length}クラス</small></span></label></div></fieldset><div class="export-privacy"><strong>個人情報を含みます</strong><br>出力したファイルやPDFは、学校が指定するGoogleドライブ等の保存先で管理してください。別端末へ自動同期はされません。</div></div><p id="exportError" class="export-error" role="alert"></p><footer><button onclick="dismissModal()">キャンセル</button><button id="runExportButton" class="primary" onclick="runSelectedExport()">出力する</button></footer>`,'export-dialog');
}
function runSelectedExport(){const format=document.querySelector('input[name="exportFormat"]:checked')?.value,scope=document.querySelector('input[name="exportScope"]:checked')?.value;runExport(format,scope)}
function runExport(format,mode){
 const errorBox=$('exportError');if(errorBox)errorBox.textContent='';
 try{
  if(!['xlsx','csv','print-records','print-blank'].includes(format))throw new Error('出力形式を選択してください');
  const state=snapshotState(),sheetId=sheet()?.id,classIds=ExportModel.resolveClassIds(state,{sheetId,mode,currentClassId:cls});
  const bundle=ExportModel.createBundle(state,{sheetId,classIds,today:today(),exportedAt:new Date().toISOString()});
  if(format==='xlsx')XlsxExport.download(bundle);
  else if(format==='csv')CsvExport.download(bundle);
  else{
   const result=PrintExport.open(bundle,{blank:format==='print-blank',windowRef:window});
   if(!result.ok&&result.reason==='popup-blocked')throw new Error('印刷画面を開けませんでした。ブラウザのポップアップを許可して、もう一度お試しください。');
  }
  dismissModal();return {ok:true,classIds};
 }catch(error){
  const message=error?.message||'出力できませんでした。もう一度お試しください。';
  if(errorBox)errorBox.textContent=message;else alert(message);
  return {ok:false,error:message};
 }
}
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
  const saved=await S.migrateStoredState({read:()=>S.readCurrentState(storageDb),write:state=>S.writeCurrentState(storageDb,state),migrate:M.migrateState});S.requestPersistentStorage(navigator.storage).catch(()=>{});
  if(saved&&saved.classes?.length){applyState(saved);appState.ui.view='home';persistenceReady=true;render()}
  else if(new URLSearchParams(location.search).get('demo')==='1'){applyState(M.createDemoState({nowIso:new Date().toISOString()}));appState.ui.view=new URLSearchParams(location.search).get('view')==='home'?'home':'record';persistenceReady=true;render()}
  else{render();showFirstRun()}
 }catch(error){render();updateSaveStatus('error',error);modal('<h3>端末内保存を開始できません</h3><p>このまま操作できますが、画面を閉じると入力が消える可能性があります。ChromeまたはSafariの通常モードで開き直してください。</p><footer><button onclick="dismissModal()">確認</button></footer>')}
 document.body.dataset.appReady='true';
}
addEventListener('online',()=>{if(saveFailed)updateSaveStatus('error');else if(persistenceReady)scheduleSave();else updateSaveStatus('loading')});
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
 const column=sheet().columns[active],combined=sheetDefinition()?.scope.type==='group'&&appState.ui.recordMode==='combined';
 const eligible=recordRows().filter(row=>row.kind==='student').map(row=>({
  ...row,m:recordMeta(row.classId,row.studentId,column.id),v:recordValue(row.classId,row.studentId,column.id)
 })).filter(row=>(row.v==='再'||row.m.redo)&&!row.m.returned&&!row.m.submitted);
 if(!eligible.length){modal('<h3>再提出分を返却</h3><p>この列には、返却日が未設定の再提出待ちがありません。</p><footer><button onclick="dismissModal()">閉じる</button></footer>');return}
 modal(`<h3>再提出分を一括返却</h3><p class="hint">選択した児童に返却日を一括登録します。再提出期限の個別入力は不要です。</p><label>返却日<input type="date" id="batchDate" value="${today()}"></label><p class="hint">次の授業日を追加減点の基準にします（各クラスの設定を参照）。</p><div style="max-height:170px;overflow:auto">${eligible.map(row=>`<label><input type="checkbox" class="batchPerson" data-batch-class-id="${esc(row.classId)}" data-batch-student-id="${esc(row.studentId)}" checked> ${combined?esc(classLabel(row.classId))+'｜':''}${esc(row.no)} ${esc(row.name)}</label>`).join('')}</div><footer><button onclick="dismissModal()">キャンセル</button><button onclick="saveBatchReturn()">まとめて記録</button></footer>`);
}
function saveBatchReturn(){
 const d=$('batchDate').value,targets=[...document.querySelectorAll('.batchPerson:checked')];
 if(!d||!targets.length){alert('返却日と対象者を指定してください');return}
 const columnId=sheet().columns[active].id;
 targets.forEach(input=>{const classId=input.dataset.batchClassId,studentId=input.dataset.batchStudentId,bucket=recordBucket(classId),k=M.recordKey(columnId,studentId),m={...(bucket.meta[k]||{})};m.redo=true;m.returned=d;m.redoDue=D.nextLessonAfter(d,scheduleForClass(classId));bucket.meta[k]=m});
 dismissModal();render();
}
function redoDetails(j,i){const m=meta(j,i);if(m.redo){
 const submitted=m.submitted?`<p>再提出日：${esc(m.submitted)}</p>`:'<p>再提出：未完了</p>';
 modal(`<h3>再提出の詳細｜${esc(rosterNames[i])}</h3><p>初回提出：${esc(m.initialSubmitted||'未記録')}</p><p>返却日：${esc(m.returned||'未返却')}</p><p>追加減点の基準日：${esc(m.returned?nextLesson(m.returned):'未設定')}</p>${submitted}<footer><button onclick="dismissModal()">閉じる</button><button onclick="dismissModal();redoEditor(${j},${i})">個別修正</button></footer>`)
 }else redoEditor(j,i)
}
const lockIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#777" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',unlockIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#278a78" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></svg>';
function isHeaderControl(target){return Boolean(target?.closest?.('button,input,label,select,a,summary'))}
function columnPointerDown(event,columnId){if(isHeaderControl(event.target))return;columnDoubleActivation.pointerDown({key:columnId,time:event.timeStamp,x:event.clientX,y:event.clientY})}
function columnPointerUp(event,columnId,index){if(isHeaderControl(event.target)){columnDoubleActivation.reset();return}if(columnDoubleActivation.pointerUp({key:columnId,time:event.timeStamp,x:event.clientX,y:event.clientY,cancelled:event.type==='pointercancel'})){event.preventDefault();toggleColumnLock(index)}}
function columnPalette(column){return Palette.paletteForColumn(appState.preferences,sheet().type,column)}
function colorForColumnValue(column,value){const snapshot=columnPalette(column),entry=snapshot.entries.find(item=>item.label===String(value??'')||(item.action==='date'&&isDate(value)));return entry?.color||''}
function cycleValues(column){return ['',...columnPalette(column).entries.filter(entry=>entry.visible!==false&&entry.action==='mark').map(entry=>entry.label)]}
function showHome(){active=-1;method='';appState.ui.view='home';render()}
function openSettings(section='classes'){active=-1;method='';settingsSection=section;appState.ui.view='settings';dismissModal();render()}
function shareChangeWarning(sheetName,groupName){return `「${sheetName}」を「${groupName}」で共有します。\n\n現在のクラスの名簿と記録は残り、他のクラスは空欄から始まります。列名・パレット・配点は合同グループで共通になります。\n\n元に戻すには「設定 → 合同グループ設定 → 共有を解除」を使います。必要な場合は、事前にバックアップを保存し、クラス設定の「バックアップから復元」を使ってください。\n\n共有しますか？`}
function openClassRecord(classId){
 if(!classes.includes(classId))return;
 const preferred=sheet()?.id||appState.ui.currentSheetId;cls=classId;appState.ui.recordMode='class';appState.ui.currentGroupId=null;const available=sheetList();
 idx=Math.max(0,available.findIndex(item=>item.id===preferred));active=-1;method='';appState.ui.view='record';appState.ui.currentClassId=cls;appState.ui.currentSheetId=sheet()?.id||null;syncRoster();render();
}
function openGroupRecord(groupId){
 const group=appState.groups.find(item=>item.id===groupId);if(!group)return;
 const preferredId=sheet()?.id||appState.ui.currentSheetId,preferredDefinition=appState.sheetDefinitions.find(item=>item.id===preferredId);let shared=W.sheetsForGroup(appState,groupId);
 if(!shared.length&&preferredDefinition?.scope.type==='class'&&group.classIds.includes(cls)&&preferredDefinition.scope.classId===cls){
  if(!confirm(shareChangeWarning(preferredDefinition.name,group.name))){render();return}
  try{applyState(W.promoteSheetToGroup(appState,{sheetId:preferredDefinition.id,groupId}));shared=W.sheetsForGroup(appState,groupId)}catch(error){alert(error.message);return}
 }
 if(!shared.length){render();modal(`<h3>${esc(group.name)}</h3><p>この合同グループには共有シートがありません。所属クラスの記録画面で共有したいシートを開いてから、もう一度この合同グループを選んでください。</p><footer><button onclick="dismissModal()">閉じる</button><button onclick="dismissModal();openSettings('groups')">合同グループ設定</button></footer>`);return}
 cls=group.classIds.includes(cls)?cls:group.classIds[0];appState.ui.currentClassId=cls;appState.ui.currentGroupId=groupId;appState.ui.recordMode='combined';appState.ui.view='record';
 const targetId=shared.some(item=>item.id===preferredId)?preferredId:shared.some(item=>item.id===appState.ui.currentSheetId)?appState.ui.currentSheetId:shared[0].id;
 idx=Math.max(0,sheetList().findIndex(item=>item.id===targetId));appState.ui.currentSheetId=sheet()?.id||targetId;active=-1;method='';numberTarget=null;syncRoster();render();
}
function renderHome(){
 const cards=classes.map(classId=>{const info=classInfo[classId],sheetCount=(db[classId]||[]).length;return `<button type="button" class="class-card" data-class-card="${esc(classId)}" aria-label="${esc(classLabel(classId))}の記録を開く" onclick="openClassRecord('${esc(classId)}')"><strong>${esc(classLabel(classId))}</strong><span>${info.students.length}人の名簿</span><span>${sheetCount}件のシート</span></button>`}).join('');
 $('homeView').innerHTML=`<div class="home-heading"><div><h1 id="homeTitle">記録するクラスを選ぶ</h1><p>授業で使うクラスを選ぶと、前回のシートまたは先頭のシートを開きます。</p></div></div>${cards?`<div class="class-grid">${cards}</div>`:'<div class="empty-home">クラスがまだありません。設定からクラスと名簿を登録してください。</div>'}`;
}
function sheetDefinition(){return appState.sheetDefinitions.find(item=>item.id===sheet()?.id)||null}
function recordRows(){
 const definition=sheetDefinition();if(!definition)return[];
 const combined=definition.scope.type==='group'&&appState.ui.recordMode==='combined';
 const rows=W.rowsForSheet(appState,{sheetId:definition.id,classId:cls,groupId:definition.scope.groupId||null,mode:combined?'combined':'class'});
 return combined?rows:rows.filter(row=>row.kind==='student');
}
function recordBucket(classId){return appState.classRecords[classId]?.[sheet().id]}
function recordValue(classId,studentId,columnId){return recordBucket(classId)?.values?.[M.recordKey(columnId,studentId)]||''}
function recordMeta(classId,studentId,columnId){return recordBucket(classId)?.meta?.[M.recordKey(columnId,studentId)]||{}}
function columnForClass(column,classId){const definition=sheetDefinition(),due=definition?.dueDatesByClass?.[classId]?.[column.id];return {...column,due:due??column.due??''}}
function scheduleForClass(classId){return {weekdays:classInfo[classId]?.weekdays,exceptions:classInfo[classId]?.exceptions}}
function recordEvaluation(classId,studentId,column){return D.submissionEvaluation({column:columnForClass(column,classId),value:recordValue(classId,studentId,column.id),meta:recordMeta(classId,studentId,column.id),schedule:scheduleForClass(classId),today:today()})}
function recordScore(classId,studentId,column){return D.scoreRecord({sheetType:sheet().type,column:columnForClass(column,classId),value:recordValue(classId,studentId,column.id),meta:recordMeta(classId,studentId,column.id),schedule:scheduleForClass(classId),today:today()})}
function recordDisplay(classId,studentId,column){const value=recordValue(classId,studentId,column.id);if(sheet().type!=='submission')return short(value);const result=recordEvaluation(classId,studentId,column);return result.submitted?(result.redone?'再':'')+(result.zeroLocked?'⚠':'')+short(result.submitted):value}
function recordMarkStyle(classId,studentId,column){const value=recordValue(classId,studentId,column.id);if(sheet().type!=='submission')return style(value);const result=recordEvaluation(classId,studentId,column);if(result.redone&&value)return'redo';if(result.submitted&&result.zeroLocked)return'zero';return style(value)}
function recordTotal(classId,studentId){const values=sheet().columns.map(column=>column.includeInTotal===false?null:recordScore(classId,studentId,column)).filter(value=>typeof value==='number'&&Number.isFinite(value));return values.length?values.reduce((sum,value)=>sum+value,0):'－'}
function setRecordMode(mode){const definition=sheetDefinition();if(mode==='combined'&&definition?.scope.type!=='group')return;const currentId=definition?.id;appState.ui.recordMode=mode;appState.ui.currentGroupId=definition?.scope.groupId||null;idx=Math.max(0,sheetList().findIndex(item=>item.id===currentId));appState.ui.currentSheetId=sheet()?.id||currentId||null;active=-1;render()}
function renderRecordModeToggle(){let toggle=$('recordModeToggle');if(!toggle){toggle=document.createElement('div');toggle.id='recordModeToggle';toggle.className='record-mode-toggle';$('sh').after(toggle)}const shared=sheetDefinition()?.scope.type==='group';toggle.hidden=!shared;if(shared)toggle.innerHTML=`<button type="button" data-record-mode="class" class="${appState.ui.recordMode!=='combined'?'selected':''}" onclick="setRecordMode('class')">クラス別</button><button type="button" data-record-mode="combined" class="${appState.ui.recordMode==='combined'?'selected':''}" onclick="setRecordMode('combined')">合同</button>`;else appState.ui.recordMode='class'}
function render(){
 const selectedTarget=appState.ui.recordMode==='combined'&&appState.ui.currentGroupId?`group:${appState.ui.currentGroupId}`:`class:${cls}`;
 const classOptions=classes.map(c=>`<option value="class:${esc(c)}" ${selectedTarget===`class:${c}`?'selected':''}>${esc(classLabel(c))}</option>`).join('');
 const groupOptions=appState.groups.map(group=>`<option value="group:${esc(group.id)}" ${selectedTarget===`group:${group.id}`?'selected':''}>${esc(group.name)}</option>`).join('');
 $('cl').innerHTML=`<optgroup label="クラス">${classOptions}</optgroup>${groupOptions?`<optgroup label="合同グループ">${groupOptions}</optgroup>`:''}<option value="__settings__">⚙ クラス設定・追加</option>`;
 $('sh').innerHTML=sheetList().map((x,i)=>`<option value="${i}" ${idx===i?'selected':''}>${esc(x.name)}</option>`).join('');
 const isHome=appState.ui.view==='home',isSettings=appState.ui.view==='settings';document.body.dataset.view=isHome?'home':isSettings?'settings':'record';
 $('recordControls').hidden=isHome||isSettings;$('exportButton').hidden=isHome||isSettings;$('homeView').hidden=!isHome;$('recordView').hidden=isHome||isSettings;$('settingsView').hidden=!isSettings;$('float').hidden=isHome||isSettings;
 if(isHome){renderHome();scheduleSave();return}
 if(isSettings){
  Settings.mount($('settingsView'),{
   getState:()=>appState,
   updateState:next=>{applyState(next);appState.ui.view='settings';scheduleSave();return appState},
   exportBackup:prefix=>downloadCurrentBackup(prefix),importBackup:()=>chooseRestoreFile(),
   editClass:classId=>{cls=classId;idx=0;syncRoster();openClassSettings()},
   addClass:()=>{openClassSettings();newClassEdit()},navigate:view=>{appState.ui.view=view;render()},
   resetAcademic:()=>{applyState(W.resetAcademicData(appState));appState.ui.view='home';render()}
  },settingsSection);
  scheduleSave();return
 }
 const s=sheet();
 renderRecordModeToggle();
 const rows=recordRows(),studentRows=rows.filter(row=>row.kind==='student');
 let h=`<thead><tr><th class="name"><button onclick="kanaMode=!kanaMode;render()">${kanaMode?'ひらがな':'番号・氏名'}</button></th>`;
 s.columns.forEach((c,j)=>{
  if(c.hidden){h+=`<th class="hidden-marker"><button title="${esc(c.title)}を再表示（集計${c.includeInTotal===false?'対象外':'対象'}）" aria-label="${esc(c.title)}を再表示" onclick="sheet().columns[${j}].hidden=false;render()">💬</button></th>`;return}
  const missing=studentRows.filter(row=>recordValue(row.classId,row.studentId,c.id)==='×').length,redo=studentRows.filter(row=>recordValue(row.classId,row.studentId,c.id)==='再'&&!recordMeta(row.classId,row.studentId,c.id).submitted).length,definition=sheetDefinition(),combinedDue=definition?.scope.type==='group'&&appState.ui.recordMode==='combined',dueSummary=combinedDue?W.dueSummaryForColumn(appState,definition.id,c.id):null,due=definition?.dueDatesByClass?.[cls]?.[c.id]??c.due,dueText=dueSummary?.kind==='mixed'?'締切 クラス別':dueSummary?.kind==='same'?'締切 '+short(dueSummary.value):dueSummary?.kind==='none'?'締切なし':due?'締切 '+short(due):'締切なし';
  h+=`<th class="head ${active===j?'active':''} ${c.includeInTotal===false?'excluded':''}" data-column-index="${j}" data-column-id="${esc(c.id)}" onpointerdown="columnPointerDown(event,'${esc(c.id)}')" onpointerup="columnPointerUp(event,'${esc(c.id)}',${j})" onpointercancel="columnPointerUp(event,'${esc(c.id)}',${j})"><div class="head-menu"><button type="button" title="列のメニュー" aria-label="${esc(c.title)}のメニュー" onclick="menu(${j})">…</button></div><span class="head-title">${esc(c.title)}</span><span class="head-points">${c.base>0?esc(c.base)+'点':''}</span><small class="head-due">${dueText}${missing?' ／ 未'+missing:''}${redo?' ／ 再'+redo:''}</small><div class="head-actions"><span class="lock-state" title="${active===j?'ロック解除中':'ロック中'}" aria-label="${active===j?'ロック解除中':'ロック中'}">${active===j?unlockIcon:lockIcon}</span><label class="total-choice" title="この列を合計点数に含める。非表示でもこの設定は維持されます。"><input class="total-toggle" type="checkbox" data-total="${j}" aria-label="${esc(c.title)}を集計に含める" ${c.includeInTotal!==false?'checked':''} onchange="toggleTotal(${j},this.checked)"></label></div></th><th class="add"><button title="右に列を追加" onclick="add(${j+1})">＋</button></th>`;
 });
 const count=s.columns.filter(c=>c.includeInTotal!==false).length;
 h+=`<th class="sum-head" title="チェックを付けた列だけ合計します。非表示の列も含みます。"><span>✓を付けた列の集計</span><small>${count}列対象</small></th></tr></thead><tbody>`;
 rows.forEach(row=>{
  if(row.kind==='section'){h+=`<tr class="class-separator"><th colspan="${2+s.columns.length*2}">${esc(classLabel(row.classId))}</th></tr>`;return}
  const classStudent=classInfo[row.classId].students.find(item=>item.id===row.studentId),studentIndex=classInfo[row.classId].students.findIndex(item=>item.id===row.studentId);
  h+=`<tr><td class="name"><b>${esc(row.no)}</b>${esc(kanaMode?(classStudent.kana||classStudent.name):classStudent.name)}</td>`;
  s.columns.forEach((c,j)=>{
   if(c.hidden){h+='<td class="hidden-marker"></td>';return}
   const v=recordValue(row.classId,row.studentId,c.id),x=numeric?recordScore(row.classId,row.studentId,c):recordDisplay(row.classId,row.studentId,c),legacyRedo=appState.ui.recordMode==='combined'?'':` data-redo="${j}:${studentIndex}"`;
   const paletteColor=numeric?'':colorForColumnValue(c,recordValue(row.classId,row.studentId,c.id));
   h+=`<td><button class="cell ${numeric?'':recordMarkStyle(row.classId,row.studentId,c)} ${active===j?'active':''}"${legacyRedo} ${paletteColor?`data-palette-color="${esc(paletteColor)}"`:''} data-class-id="${esc(row.classId)}" data-student-id="${esc(row.studentId)}" data-column-id="${esc(c.id)}" onclick="cellById('${esc(row.classId)}','${esc(row.studentId)}','${esc(c.id)}')">${esc(x??'－')}</button></td><td class="add"></td>`;
  });
  h+=`<td class="sum">${recordTotal(row.classId,row.studentId)}</td></tr>`;
 });
 $('table').innerHTML=h+'</tbody>';$('view').textContent=numeric?'記録':'数値';
 palette();scheduleSave();requestAnimationFrame(()=>{if(typeof clampFloat==='function')clampFloat()});
}

function palette(){
 const tools=$('tools'),paletteBox=$('palette');tools.hidden=active<0||$('fold').textContent==='+';$('numBox').hidden=method!=='number';$('dateBox').hidden=true;paletteBox.hidden=method==='number';$('float').classList.toggle('palette-grid-active',active>=0&&method!=='number');
 if(active<0||!sheet()?.columns[active]){paletteBox.innerHTML='';return}
 const type=sheet().type,snapshot=columnPalette(sheet().columns[active]),legacyFill=method==='direct'&&snapshot.layoutVersion<2&&!snapshot.entries.some(entry=>['fillCircle','fillCross','fillA','fillC'].includes(entry.action)),entries=[...snapshot.entries];
 if(legacyFill){const activity=type==='evaluation';entries.push({id:'legacy-fill-positive',label:`残りを${activity?'A':'○'}`,color:'cream',score:null,action:activity?'fillA':'fillCircle',slotSpan:2,visible:true},{id:'legacy-fill-negative',label:`残りを${activity?'C':'×'}`,color:'cream',score:null,action:activity?'fillC':'fillCross',slotSpan:2,visible:true})}
 entries.push({id:'system-clear',label:'消去',color:'stone',score:null,action:'clear',slotSpan:1,visible:true});
 const layout=Palette.paletteLayout({...snapshot,entries});paletteBox.className=`buttons palette-size-${snapshot.size}`;paletteBox.dataset.paletteColumns=String(layout.columns);paletteBox.style.setProperty('--palette-columns',String(layout.columns));$('dateBox').hidden=modeAction!=='date'||method==='cycle'&&!override;
 paletteBox.innerHTML=layout.buttons.map((button,index)=>{const entry=button.entry;
  const label=esc(entry.label),color=esc(entry.color);
  return `<button data-palette-entry="${index}" data-palette-color="${color}" class="${entry.action==='clear'&&modeAction==='clear'?'selected-clear':''}" style="grid-row:${button.row};grid-column:${button.column}/span ${button.slotSpan}" ${method==='cycle'&&!['batchReturn','fillCircle','fillCross','fillA','fillC','clear'].includes(entry.action)?'disabled':''}>${label}</button>`;
 }).join('')+(method==='cycle'?'<button class="wide palette-cycle-return" onclick="override=false;palette()">↩ 連続へ</button>':'');
 paletteBox.querySelectorAll('[data-palette-entry]').forEach(button=>button.addEventListener('click',()=>{const entry=layout.buttons[Number(button.dataset.paletteEntry)].entry;if(entry.action==='batchReturn'){batchReturn();return}if(entry.action==='fillCircle'){fill('○');return}if(entry.action==='fillCross'){fill('×');return}if(entry.action==='fillA'){fill('A');return}if(entry.action==='fillC'){fill('C');return}if(entry.action==='clear'){if(modeAction!=='clear')clearReturn={mode,modeAction,override};mode='';modeAction='clear';override=true;palette();return}clearReturn=null;mode=entry.label;modeAction=entry.action;override=method==='cycle';if(modeAction==='date')$('date').value=today();palette()}));
}
function storeSubmissionById(classId,studentId,columnId,value){const bucket=recordBucket(classId),key=M.recordKey(columnId,studentId),column=sheet().columns.find(item=>item.id===columnId),old=bucket.values[key]||'';let details={...(bucket.meta[key]||{})};if(value==='再'&&(old==='再'||old==='再⚠')){render();return}if(value===old&&value!=='日付'){render();return}if(value==='日付'){const date=$('date').value||today();if(dateIndex(date)===null){alert('提出日を確認してください');return}details.submitted=date;if(details.redo||old.startsWith('再')){details.redo=true;value='再'}else value=date}else if(value==='再'){details={...details,redo:true,submitted:null,initialSubmitted:details.initialSubmitted||details.submitted||(isDate(old)?old:old==='○'?columnForClass(column,classId).due:null),returned:null,redoDue:null}}else if(value==='○'){if(details.redo){details.submitted=today();value='再'}else if(recordEvaluation(classId,studentId,column).zeroLocked){details.submitted=details.submitted||today();value=details.submitted}else details={}}else if(value==='×'||value==='欠'||value==='△'){details.submitted=null}else if(value===''){details={}}delete details.zeroLocked;bucket.meta[key]=details;bucket.values[key]=value;render()}
function clearCellById(classId,studentId,columnId){
 const sheetId=sheet()?.id,inputMethod=method,returnState=clearReturn||{mode,modeAction:'mark',override:false},numberState=inputMethod==='number'?{classId,studentId,columnId}:null;
 if(!sheetId)return;
 try{
  const next=W.clearRecordCell(appState,classId,sheetId,columnId,studentId);next.ui={...next.ui,view:'record',currentClassId:cls,currentSheetId:sheetId,currentGroupId:appState.ui.currentGroupId,recordMode:appState.ui.recordMode};applyState(next);
  idx=Math.max(0,sheetList().findIndex(item=>item.id===sheetId));active=sheet()?.columns.findIndex(item=>item.id===columnId)??-1;method=inputMethod;mode=returnState.mode;modeAction=returnState.modeAction;override=returnState.override;clearReturn=null;numberTarget=numberState;render();if(numberState&&$('number'))$('number').value='';
 }catch(error){alert(error.message)}
}
function cellById(classId,studentId,columnId){const columnIndex=sheet().columns.findIndex(item=>item.id===columnId);if(columnIndex!==active||numeric)return;if(method==='number'){numberTarget={classId,studentId,columnId};$('number').value=recordValue(classId,studentId,columnId);return}if(modeAction==='clear'){clearCellById(classId,studentId,columnId);return}if(method==='direct'&&!['mark','date','redo'].includes(modeAction))return;const cycle=cycleValues(sheet().columns[columnIndex]),old=recordValue(classId,studentId,columnId),position=cycle.indexOf(old),directValue=modeAction==='date'?'日付':modeAction==='redo'?'再':mode,value=method==='cycle'&&!override?cycle[((position<0?0:position)+1)%cycle.length]:directValue;if(sheet().type==='submission')storeSubmissionById(classId,studentId,columnId,value);else{recordBucket(classId).values[M.recordKey(columnId,studentId)]=value;render()}}
function modal(h,extra=''){$('modal').innerHTML='<div class="overlay"><div class="dialog '+extra+'">'+h+'</div></div>'}
function dismissModal(){$('modal').innerHTML=''}
function configureColumnInput(j,{forceDialog=false}={}){
 const column=sheet().columns[j];if(!column)return;
 if(!forceDialog&&column.inputMethod){toggleColumnLock(j);return}
 const current=column.paletteSnapshot?.paletteId||appState.preferences.defaultPaletteIds[sheet().type==='evaluation'?'activity':sheet().type==='number'?'numeric':'submission'];
 const options=appState.preferences.palettes.map(item=>`<option value="${esc(item.id)}" ${item.id===current?'selected':''}>${esc(item.name)}${item.scoringEnabled?'（点数連動）':''}</option>`).join('');
 const methods=sheet().type==='number'?`<label><input type="radio" name="columnInputMethod" value="number" ${column.inputMethod!=='direct'?'checked':''}> テンキー</label><label><input type="radio" name="columnInputMethod" value="direct" ${column.inputMethod==='direct'?'checked':''}> パレットボタン</label><p class="hint">10や25なども、パレットボタンなら1回で入力できます。</p>`:`<label><input type="radio" name="columnInputMethod" value="cycle" ${column.inputMethod==='cycle'?'checked':''}> 連続タップ</label><label><input type="radio" name="columnInputMethod" value="direct" ${column.inputMethod==='direct'||!column.inputMethod?'checked':''}> パレット指定</label>`;
 modal(`<button type="button" class="dialog-close" aria-label="閉じる" onclick="dismissModal()">×</button><h3>${esc(column.title)}</h3><p>入力方法とパレットを選択</p><label>使用するパレット<select id="columnPaletteId">${options}</select></label><fieldset class="input-methods"><legend>入力方法</legend>${methods}</fieldset><p class="hint">初回だけ選択します。後から列メニューの「入力方法・パレット」で変更できます。</p><footer><button onclick="dismissModal()">キャンセル</button><button class="primary" onclick="saveColumnInputConfig(${j})">この設定で入力</button></footer>`,'column-input-dialog');
 if(sheet().type==='number')$('columnPaletteId').addEventListener('change',event=>{if(event.target.value!==appState.preferences.defaultPaletteIds.numeric){const direct=document.querySelector('input[name="columnInputMethod"][value="direct"]');if(direct)direct.checked=true}});
}
function saveColumnInputConfig(j){
 const column=sheet().columns[j],paletteId=$('columnPaletteId')?.value,input=document.querySelector('input[name="columnInputMethod"]:checked')?.value;
 const selected=appState.preferences.palettes.find(item=>item.id===paletteId);if(!column||!selected||!input)return alert('入力方法とパレットを確認してください');
 column.paletteSnapshot=Palette.snapshotPalette(selected);column.inputMethod=input;const maximum=Palette.maxPaletteScore(column.paletteSnapshot);if(maximum!==null)column.base=maximum;
 const initial=Palette.firstCellInputEntry(column.paletteSnapshot);active=j;method=input;override=false;mode=initial?.label||'';modeAction=initial?.action||'';dismissModal();render();
}
function toggleColumnLock(j){const column=sheet().columns[j];if(!column)return;clearReturn=null;if(active===j){active=-1;method='';override=false;render();return}if(!column.inputMethod){active=-1;method='';configureColumnInput(j);return}const initial=Palette.firstCellInputEntry(column.paletteSnapshot);active=j;method=column.inputMethod;override=false;mode=initial?.label||'';modeAction=initial?.action||'';render()}
function lock(j){toggleColumnLock(j)}
function cell(j,i){if(j!==active||numeric)return;if(method==='number'){numberRow=i;$('number').value=val(j,i);return}if(modeAction==='clear'){const student=studentAt(i),column=sheet().columns[j];if(student&&column)clearCellById(cls,student.id,column.id);return}if(method==='direct'&&!['mark','date','redo'].includes(modeAction))return;const cycle=cycleValues(sheet().columns[j]),position=cycle.indexOf(val(j,i)),directValue=modeAction==='date'?'日付':modeAction==='redo'?'再':mode;let v=method==='cycle'&&!override?cycle[((position<0?0:position)+1)%cycle.length]:directValue;if(sheet().type==='submission')storeSubmission(j,i,v);else setVal(j,i,v)}
function fill(v){if(active<0)return;const column=sheet().columns[active];recordRows().filter(row=>row.kind==='student').forEach(row=>{const key=M.recordKey(column.id,row.studentId),bucket=recordBucket(row.classId);if(!bucket.values[key])bucket.values[key]=v});render()}
function add(j){modal(`<h3>列を追加</h3><label>タイトル<input id="title" placeholder="新しい課題"></label>${sheet().type==='submission'?`<label>提出期限<input type="date" id="due" value="${today()}"></label><label><input type="checkbox" id="inherit" checked> 左の列の減点設定を引き継ぐ</label><label>減点間隔（日）<input type="number" id="interval" value="${sheet().columns[j-1]?.interval||3}"></label><label>減点幅<input type="number" id="penalty" value="${sheet().columns[j-1]?.penalty||1}"></label>`:''}<footer><button onclick="dismissModal()">キャンセル</button><button onclick="saveAdd(${j})">追加</button></footer>`)}
function saveAdd(j){let title=$('title').value.trim();if(!title)return alert('タイトルを入力してください');let prev=sheet().columns[j-1],paletteSnapshot=Palette.paletteForColumn(appState.preferences,sheet().type,{}),maximum=Palette.maxPaletteScore(paletteSnapshot),c={id:M.defaultIdFactory('column'),title,includeInTotal:true,hidden:false,due:$('due')?.value||'',base:maximum??5,interval:Math.max(1,+$('interval')?.value||3),penalty:Math.max(0,+$('penalty')?.value||1),basis:prev?.basis||'days',redoPenalty:prev?.redoPenalty??1,zeroDays:prev?.zeroDays??30,zeroFloor:prev?.zeroFloor??true,paletteSnapshot,inputMethod:null};if($('inherit')?.checked&&prev&&maximum===null)c.base=prev.base;sheet().columns.splice(j,0,c);active=-1;dismissModal();render()}
function updateIntervalLabel(){let b=$('editBasis')?.value,el=$('intervalQuestion');if(!el)return;el.textContent=b==='lesson'?'授業実施回数の何回ごとに減点しますか？':b==='days'?'何日ごとに減点しますか？':'減点なし（間隔の設定は不要）';let field=$('editInterval');if(field)field.disabled=b==='none'}
function editColumn(j){
 let c=sheet().columns[j],due=columnForClass(c,cls).due,combined=sheetDefinition()?.scope.type==='group'&&appState.ui.recordMode==='combined';
 const dueField=combined?'<p class="hint">締切日は列メニューの「クラス別締切日」で設定します。</p>':`<label>提出期限<input id="editDue" type="date" value="${esc(due||'')}"></label>`;
 modal(`<h3>列の設定：${esc(c.title)}</h3><label>タイトル<input id="editTitle" value="${esc(c.title)}"></label>${sheet().type==='submission'?`${dueField}<label>満点<input id="editBase" type="number" min="0" value="${c.base}"></label><label>減点方式<select id="editBasis" onchange="updateIntervalLabel()"><option value="days" ${c.basis==='days'?'selected':''}>日数基準</option><option value="lesson" ${c.basis==='lesson'?'selected':''}>授業日基準（クラス設定を参照）</option><option value="none" ${c.basis==='none'?'selected':''}>減点なし</option></select></label><label><span id="intervalQuestion">減点間隔</span><input id="editInterval" type="number" min="1" value="${c.interval}"></label><label>減点確定ごとに何点減らしますか？<input id="editPenalty" type="number" min="0" value="${c.penalty}"></label><label>再提出対象を減点する場合は何点引きますか？<input id="editRedo" type="number" min="0" value="${c.redoPenalty}"></label><p class="hint">※ 再提出が必要なことを児童に伝え、課題を返却するまでの間は、遅延による追加減点は確定しません。返却後、次の授業日を過ぎると、設定したルールに従って減点します。</p><label>未提出を0点確定する日数<input id="editZero" type="number" min="1" value="${c.zeroDays}"></label><label><input id="editFloor" type="checkbox" ${c.zeroFloor?'checked':''}> 減点が0点に達したら確定</label><p class="hint">変更した評価基準は、この列の全児童に適用されます。既存の提出日は変わりません。</p>`:''}<footer><button onclick="dismissModal()">戻る</button><button onclick="saveColumn(${j})">全員に適用</button></footer>`);updateIntervalLabel()
}
function saveColumn(j){let c=sheet().columns[j];c.title=$('editTitle').value.trim()||c.title;if(sheet().type==='submission'){const due=$('editDue')?.value,definition=sheetDefinition();if(due!==undefined){if(definition?.scope.type==='group'){definition.dueDatesByClass[cls]||={};definition.dueDatesByClass[cls][c.id]=due}else c.due=due}c.base=Math.max(0,+$('editBase').value||0);c.basis=$('editBasis').value;c.interval=Math.max(1,+$('editInterval').value||1);c.penalty=Math.max(0,+$('editPenalty').value||0);c.redoPenalty=Math.max(0,+$('editRedo').value||0);c.zeroDays=Math.max(1,+$('editZero').value||30);c.zeroFloor=$('editFloor').checked}dismissModal();render()}
function editGroupDueDates(j){
 const definition=sheetDefinition(),group=appState.groups.find(item=>item.id===definition?.scope.groupId),column=sheet().columns[j];if(!definition||!group||!column)return;
 const fields=group.classIds.map(classId=>`<label class="group-due-row"><span>${esc(classLabel(classId))}</span><input type="date" data-group-due-class="${esc(classId)}" value="${esc(definition.dueDatesByClass[classId]?.[column.id]||'')}"></label>`).join('');
 modal(`<h3>クラス別締切日：${esc(column.title)}</h3><p class="hint">列名・配点・集計設定は合同グループで共通です。締切日だけクラスごとに設定できます。</p><div class="group-due-list">${fields}</div><footer><button onclick="dismissModal()">キャンセル</button><button class="primary" onclick="saveGroupDueDates(${j})">締切日を保存</button></footer>`,'classDialog');
}
function saveGroupDueDates(j){
 const definition=sheetDefinition(),group=appState.groups.find(item=>item.id===definition?.scope.groupId),column=sheet().columns[j];if(!definition||!group||!column)return;
 group.classIds.forEach(classId=>{definition.dueDatesByClass[classId]||={};definition.dueDatesByClass[classId][column.id]=document.querySelector(`[data-group-due-class="${CSS.escape(classId)}"]`)?.value||''});
 column.due=definition.dueDatesByClass[group.classIds[0]]?.[column.id]||'';dismissModal();render();
}
function menu(j){const definition=sheetDefinition(),share=definition?.scope.type==='class'&&appState.groups.some(group=>group.classIds.includes(cls))?'<button onclick="dismissModal();shareSheet()">合同グループで共有</button>':'',groupDue=definition?.scope.type==='group'&&appState.ui.recordMode==='combined'&&sheet().type==='submission'?`<button onclick="dismissModal();editGroupDueDates(${j})">クラス別締切日</button>`:'';modal(`<h3>${esc(sheet().columns[j].title)}</h3><footer style="flex-wrap:wrap"><button onclick="dismissModal();configureColumnInput(${j},{forceDialog:true})">入力方法・パレット</button><button onclick="dismissModal();editColumn(${j})">列の設定</button>${groupDue}<button onclick="sheet().columns[${j}].hidden=true;active=-1;dismissModal();render()">非表示</button><button onclick="dismissModal();add(${j+1})">設定を引き継いで追加</button>${share}<button class="danger-outline" onclick="dismissModal();openColumnDelete(${j})">列を削除…</button><button onclick="dismissModal()">閉じる</button></footer>`)}
function openColumnDelete(j){
 const definition=sheetDefinition(),column=sheet()?.columns[j];if(!definition||!column)return;
 if(definition.columns.length===1){modal(`<h3>列を削除できません</h3><p>最後の1列は削除できません。シート全体を削除する場合は、設定からシートを保管し、「保管済みシート」で完全削除してください。</p><footer><button onclick="dismissModal()">閉じる</button></footer>`,'column-delete-dialog');return}
 try{
  const summary=W.columnDeletionSummary(appState,definition.id,column.id),group=definition.scope.type==='group'?appState.groups.find(item=>item.id===definition.scope.groupId):null,target=group?`合同グループ「${group.name}」`:(summary.classIds.map(classLabel).join('、')||'対象クラス');
  modal(`<h3>列を完全に削除</h3><p><strong>${esc(column.title)}</strong>を削除します。</p><p>入力済み記録：<strong>${summary.recordCount}件</strong><br>影響する対象：${esc(target)}</p><div class="danger-warning"><strong>元に戻せません</strong><p>削除前にバックアップを保存してください。復元するときは、削除前のバックアップを「設定 → クラス設定」から読み込みます。</p></div><label>続けるには「削除」と入力してください<input id="deleteColumnPhrase" autocomplete="off"></label><footer><button onclick="dismissModal()">キャンセル</button><button id="deleteColumnConfirm" class="danger-button" disabled onclick="confirmColumnDelete('${esc(definition.id)}','${esc(column.id)}')">列を完全に削除</button></footer>`,'column-delete-dialog');
  $('deleteColumnPhrase').addEventListener('input',()=>{$('deleteColumnConfirm').disabled=$('deleteColumnPhrase').value!=='削除'});
 }catch(error){alert(error.message)}
}
function confirmColumnDelete(sheetId,columnId){
 if($('deleteColumnPhrase')?.value!=='削除')return;const definition=appState.sheetDefinitions.find(item=>item.id===sheetId),column=definition?.columns.find(item=>item.id===columnId);if(!definition||!column)return alert('削除する列が見つかりません');
 if(!confirm(`「${column.title}」を完全に削除します。よろしいですか？`))return;
 try{applyState(W.deleteSheetColumn(appState,sheetId,columnId));appState.ui.view='record';active=-1;method='';clearReturn=null;numberTarget=null;dismissModal();render()}catch(error){alert(error.message)}
}
function shareSheet(){const groups=appState.groups.filter(group=>group.classIds.includes(cls));if(!groups.length){modal('<h3>合同グループで共有</h3><p>先に設定で合同グループを作成してください。</p><footer><button onclick="dismissModal()">閉じる</button><button onclick="dismissModal();openSettings(\'groups\')">合同グループ設定</button></footer>');return}modal(`<h3>合同グループで共有</h3><p>このシートの列名・配点・集計設定を合同グループで共通にします。締切日はクラスごとに設定できます。</p><label>合同グループ<select id="shareGroup">${groups.map(group=>`<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('')}</select></label><footer><button onclick="dismissModal()">キャンセル</button><button onclick="confirmShareSheet()">共有する</button></footer>`)}
function confirmShareSheet(){const groupId=$('shareGroup').value,definition=sheetDefinition(),group=appState.groups.find(item=>item.id===groupId);if(!definition||!group)return;if(!confirm(shareChangeWarning(definition.name,group.name)))return;const classId=cls,sheetId=definition.id;applyState(W.promoteSheetToGroup(appState,{sheetId,groupId}));cls=classId;idx=Math.max(0,(db[cls]||[]).findIndex(item=>item.id===sheetId));appState.ui.view='record';appState.ui.currentGroupId=groupId;appState.ui.recordMode='class';dismissModal();render()}

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
 const classFields={id:key,school,name,year,count:finalCount,weekdays,students:finalStudents,exceptions:previous?.exceptions||{}};
 if(classEditingNew){
  const legacy={appId:M.APP_ID,schemaVersion:1,savedAt:new Date().toISOString(),ui:{activeClassId:key,activeSheetId:null,lastColumnId:null,kanaMode:false,numeric:false},classes:[{...classFields,sheets:[create('提出物チェック','submission'),create('活動評価','evaluation'),create('点数記録','number')]}]};
  legacy.ui.activeSheetId=legacy.classes[0].sheets[0].id;
  const fragment=M.migrateState(legacy);
  appState.classes.push(fragment.classes[0]);
  appState.sheetDefinitions.push(...fragment.sheetDefinitions);
  appState.classRecords[key]=fragment.classRecords[key];
  applyState(appState);
 }else{
  Object.assign(previous,classFields);
  classInfo[key]=previous;
 }
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
$('clearNumber').onclick=()=>{if(numberTarget)clearCellById(numberTarget.classId,numberTarget.studentId,numberTarget.columnId);else alert('先に消去するセルを選んでください')};
$('keys').innerHTML=['7','8','9','4','5','6','1','2','3','.','0','⌫','Enter'].map(k=>`<button class="${k==='Enter'?'enter':''}" onclick="key('${k}')">${k}</button>`).join('');function key(k){let x=$('number');if(k==='Enter'){if(numberTarget){if(x.value!=='')recordBucket(numberTarget.classId).values[M.recordKey(numberTarget.columnId,numberTarget.studentId)]=x.value;const rows=recordRows().filter(row=>row.kind==='student'),position=rows.findIndex(row=>row.classId===numberTarget.classId&&row.studentId===numberTarget.studentId),next=rows[Math.min(position+1,rows.length-1)];numberTarget=next?{classId:next.classId,studentId:next.studentId,columnId:numberTarget.columnId}:numberTarget;x.value=recordValue(numberTarget.classId,numberTarget.studentId,numberTarget.columnId);render()}else{if(x.value!=='')setVal(active,numberRow,x.value);if(numberRow<rosterNames.length-1)numberRow++;x.value=val(active,numberRow)}}else if(k==='⌫')x.value=x.value.slice(0,-1);else if(k!=='.'||!x.value.includes('.'))x.value+=k}$('cl').onchange=e=>{const target=e.target.value;if(target==='__settings__'){openSettings('classes');return}if(target.startsWith('group:')){openGroupRecord(target.slice(6));return}if(target.startsWith('class:'))openClassRecord(target.slice(6))};$('sh').onchange=e=>{idx=+e.target.value;active=-1;numberTarget=null;appState.ui.currentSheetId=sheet()?.id||null;render()};$('view').onclick=()=>{numeric=!numeric;render()};$('date').value=today();$('today').onclick=()=>$('date').value=today();$('fold').onclick=()=>{$('fold').textContent=$('fold').textContent==='−'?'+':'−';palette()};let drag=null;$('drag').addEventListener('pointerdown',e=>{if(e.target.tagName==='BUTTON')return;let r=$('float').getBoundingClientRect();drag={dx:e.clientX-r.left,dy:e.clientY-r.top};$('drag').setPointerCapture(e.pointerId)});$('drag').addEventListener('pointermove',e=>{if(!drag)return;let f=$('float');f.style.left=Math.max(0,Math.min(innerWidth-f.offsetWidth,e.clientX-drag.dx))+'px';f.style.top=Math.max(0,Math.min(innerHeight-f.offsetHeight,e.clientY-drag.dy))+'px';f.style.right='auto'});$('drag').addEventListener('pointerup',()=>drag=null);function clampFloat(){let f=$('float'),r=f.getBoundingClientRect();if(f.hidden)return;if(r.right>innerWidth||r.bottom>innerHeight||r.left<0||r.top<42){f.style.left=Math.max(0,Math.min(innerWidth-f.offsetWidth,r.left))+'px';f.style.top=Math.max(42,Math.min(innerHeight-f.offsetHeight,r.top))+'px';f.style.right='auto'}}addEventListener('resize',clampFloat);initializePersistence().then(()=>{initializePwa();$('float').style.top=Math.max(120,innerHeight-$('float').offsetHeight-54)+'px';clampFloat()});


