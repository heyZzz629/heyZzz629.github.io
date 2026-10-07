var views={lib:'viewLib',notes:'viewNotes',practice:'viewPractice',dash:'viewDash',wrong:'viewWrong',paper:'viewPaper'};
var toolbars={lib:'libTools',notes:'notesTools',practice:'practiceTools',dash:'dashTools',wrong:'wrongTools',paper:'paperTools'};

var LISTEN_MAP={};
if(typeof LISTENING_BANK!=='undefined'){LISTENING_BANK.forEach(function(q){LISTEN_MAP[q.id]=q;});}

function switchTab(target){
  var btn=document.querySelector('.tab[data-tab="'+target+'"]');
  if(!btn)return;
  currentTab=target;
  document.querySelectorAll('.tab').forEach(function(b){b.classList.toggle('active',b===btn);});
  Object.keys(views).forEach(function(k){document.getElementById(views[k]).hidden=(k!==currentTab);});
  Object.keys(toolbars).forEach(function(k){document.getElementById(toolbars[k]).hidden=(k!==currentTab);});
  if(currentTab==='lib')renderLib();
  else if(currentTab==='notes')renderNotes();
  else if(currentTab==='dash')renderDash();
  else if(currentTab==='wrong')renderWrongBook();
  else if(currentTab==='paper')renderPaperView();
  updateWrongBadge();
  if(typeof updateNotebookBadge==='function')updateNotebookBadge();
}

document.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(cmdPanel.classList.contains('show'))closeCmd();else openCmd();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='b'){e.preventDefault();if(document.getElementById('notebookModal').classList.contains('show'))closeNotebook();else openNotebook();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();openNoteEditor({key:'',src:'f',refId:null,title:'',content:'',tags:[],isNew:true,isNewFree:true});return;}
  if(e.key==='Escape'){
    if(document.getElementById('noteEditorModal').classList.contains('show'))closeNoteEditor();
    else if(document.getElementById('notebookModal').classList.contains('show'))closeNotebook();
    else if(cmdPanel.classList.contains('show'))closeCmd();
    else if(searchFS.classList.contains('show'))searchFS.classList.remove('show');
    else if(sheet.classList.contains('show'))closeSheet();
    else if(document.getElementById('uiModal').classList.contains('show'))document.getElementById('uiModal').classList.remove('show');
    else if(document.getElementById('confirmModal').classList.contains('show'))closeConfirm(false);
    else if(document.getElementById('promptModal').classList.contains('show'))closePrompt(null);
    else if(document.getElementById('voiceModal').classList.contains('show'))document.getElementById('voiceModal').classList.remove('show');
    else if(document.getElementById('previewModal').classList.contains('show')){document.getElementById('previewModal').classList.remove('show');document.body.classList.remove('printing');}
  }
  if(currentSession&&!e.target.matches('input,textarea')){
    if(e.key>='1'&&e.key<='4'){var btn=document.querySelector('#qOpts .q-opt[data-i="'+(+e.key-1)+'"]');if(btn&&!btn.classList.contains('locked'))btn.click();}
    if(e.key==='Enter'){var n=document.getElementById('nextQBtn');if(n)n.click();}
    var cur=currentSession;
    if(cur&&cur.answers[cur.qids[cur.idx]]!==undefined){
      if(e.key==='j'||e.key==='J'){if(cur.idx<cur.qids.length-1){cur.idx++;saveSession();renderSession();}}
      if(e.key==='k'||e.key==='K'){if(cur.idx>0){cur.idx--;saveSession();renderSession();}}
    }
  }
});

function checkResume(){
  if(!currentSession||!currentSession.qids||!currentSession.qids.length)return;
  if(currentSession.idx>=currentSession.qids.length){currentSession=null;localStorage.removeItem(K.session);return;}
  if(!currentSession._typeMap)currentSession._typeMap={};
  if(!currentSession._playCounts)currentSession._playCounts={};
  if(!currentSession.answers)currentSession.answers={};
  if(!currentSession._optOrder)currentSession._optOrder={};
  if(!currentSession._lastAnswerTs)currentSession._lastAnswerTs=now();
  var total=currentSession.qids.length;
  var answered=Object.keys(currentSession.answers).length;
  askConfirm('\u4e0a\u6b21\u7684\u7ec3\u4e60\u300c'+esc(currentSession.title)+'\u300d\u8fd8\u6ca1\u505a\u5b8c\uff0c\u5df2\u5b8c\u6210 <b>'+answered+'/'+total+'</b> \u9898\u3002',{title:'\u7ee7\u7eed\u4e0a\u6b21\u7684\u7ec3\u4e60\uff1f',icon:'\u23ef',okText:'\u7ee7\u7eed',cancelText:'\u91cd\u65b0\u5f00\u59cb'}).then(function(ok){
    if(ok){
      document.getElementById('practiceSetup').hidden=true;
      document.getElementById('practicePlaying').hidden=false;
      document.getElementById('practiceResult').hidden=true;
      document.getElementById('playQGridWrap').hidden=true;
      currentTab='practice';
      document.querySelectorAll('.tab').forEach(function(b){b.classList.toggle('active',b.dataset.tab==='practice');});
      Object.keys(views).forEach(function(k){document.getElementById(views[k]).hidden=(k!==currentTab);});
      Object.keys(toolbars).forEach(function(k){document.getElementById(toolbars[k]).hidden=(k!==currentTab);});
      startTimer();renderSession();
    }else{currentSession=null;localStorage.removeItem(K.session);}
  });
}

function initApp(){
  applyUI(currentUI);
  applyShuffleBtn();
  renderDailyTip();

  document.querySelectorAll('.tab').forEach(function(btn){btn.addEventListener('click',function(){switchTab(btn.dataset.tab);});});

  var hrf=document.getElementById('heroRefreshBtn');
  if(hrf)hrf.addEventListener('click',function(){
    if(currentTab!=='lib')switchTab('lib');
    renderLib();updateWrongBadge();
    if(typeof updateNotebookBadge==='function')updateNotebookBadge();
    renderDailyTip();toast('\u5df2\u5237\u65b0\u5b66\u4e60\u6982\u89c8','ok');
  });
  var heb=document.getElementById('heroExportBtn');
  if(heb)heb.addEventListener('click',function(){exportAllData();});

  initLibUI();
  initPracticeUI();
  initWrongUI();
  initPaperUI();
  initNotebookUI();
  initDashUI();
  initToolsUI();

  switchTab('lib');
  setTimeout(checkResume,350);
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initApp);}else{initApp();}
