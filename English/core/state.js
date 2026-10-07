(function autoMigrate(){
  const pairs=[
    ['q7g-lib-v4','q7g-lib-v3'],['q7g-lib-v4','q7g-lib-v2'],
    ['q7g-wrong-v4','q7g-wrong-v3'],['q7g-wrong-v4','q7g-wrong-v2'],['q7g-wrong-v4','q7g-wrong'],
    ['q7g-papers-v4','q7g-papers-v3'],['q7g-papers-v4','q7g-papers-v2'],['q7g-papers-v4','q7g-papers'],
    ['q7g-session-v3','q7g-session-v2'],['q7g-session-v3','q7g-session'],
    ['q7g-note-v1','q7g-note-v2'],['q7g-goal-v1','q7g-goal-v2'],
    ['q7g-ach-v1','q7g-ach-v2'],['q7g-star-v1','q7g-star-v5'],
    ['q7g-ui-v1','q7g-ui'],
    ['q7g-wrongnote-v1','q7g-wrongnote'],
    ['q7g-freenotes-v1','q7g-freenotes'],
    ['q7g-notemeta-v1','q7g-notemeta']
  ];
  pairs.forEach(([t,s])=>{try{if(!localStorage.getItem(t)&&localStorage.getItem(s))localStorage.setItem(t,localStorage.getItem(s));}catch(e){}});
})();

const CAT_LABEL={plural:'\u5355\u590d\u6570',third:'\u4e09\u5355',be:'be \u52a8\u8bcd',pron:'\u4ee3\u8bcd',tense:'\u65f6\u6001',misc:'\u7efc\u5408',hard:'\ud83d\udd25 \u91cd\u96be\u70b9'};
const CAT_NOTE_MAP={plural:['plural'],third:['third'],be:['be'],pron:['pron'],tense:['tense'],misc:['misc','other'],hard:['tense','misc','other']};
const K={
  lib:'q7g-lib-v4',wrong:'q7g-wrong-v4',papers:'q7g-papers-v4',session:'q7g-session-v3',
  theme:'q7g-theme',star:'q7g-star-v1',daily:'q7g-daily-v4',stats:'q7g-stats-v1',
  note:'q7g-note-v1',goal:'q7g-goal-v1',achieve:'q7g-ach-v1',ui:'q7g-ui-v1',
  wrongNote:'q7g-wrongnote-v1',shuffleOpt:'q7g-shuffle-opt-v1',
  freeNotes:'q7g-freenotes-v1',noteMeta:'q7g-notemeta-v1'
};
let libState=load(K.lib,{});
let wrongBook=load(K.wrong,[]);
let papers=load(K.papers,[]);
let currentSession=load(K.session,null);
let starSet=new Set(load(K.star,[]));
let pickedIds=new Set();
let noteMap=load(K.note,{});
let wrongNotes=load(K.wrongNote,{});
let freeNotes=load(K.freeNotes,[]);
let noteMeta=load(K.noteMeta,{});
let shuffleOptionsOn=load(K.shuffleOpt,false);
let stats=load(K.stats,{totalAnswered:0,totalCorrect:0,dailyLog:{},streak:0,lastStudyDate:'',hasClearedWrong:false,totalSeconds:0});
let unlockedAchievements=new Set(load(K.achieve,[]));
let dailyGoal=load(K.goal,20);
let currentUI=localStorage.getItem(K.ui)||'default';
let currentTab='lib';
let timerHandle=null;

function getSt(qid){if(libState[qid]===undefined)libState[qid]=0;return libState[qid];}
function setSt(qid,s){libState[qid]=s;save(K.lib,libState);}
function markCorrect(qid){if(getSt(qid)!==2)setSt(qid,2);}
function markWrong(qid){setSt(qid,1);}
function isStar(qid){return starSet.has(qid);}
function toggleStar(qid){if(starSet.has(qid))starSet.delete(qid);else starSet.add(qid);save(K.star,[...starSet]);}

const SRS_INTERVALS=[0,1,2,4,7,15,30];
function srsNextTime(level){return now()+SRS_INTERVALS[Math.min(level||0,SRS_INTERVALS.length-1)]*86400000;}
function isDue(item){return item&&item.nextReview&&item.nextReview<=now();}

const ACHIEVEMENTS=[
  {id:'first',icon:'\ud83c\udf31',name:'\u521d\u5b66\u8005',desc:'\u5b8c\u6210\u7b2c\u4e00\u6b21\u7ec3\u4e60',check:(s)=>s.totalAnswered>=1},
  {id:'a10',icon:'\ud83d\udcd6',name:'\u5c0f\u8bd5\u725b\u5200',desc:'\u7b54\u5bf9 10 \u9898',check:(s)=>s.totalCorrect>=10},
  {id:'a50',icon:'\ud83d\udcda',name:'\u52e4\u594b\u5b66\u8005',desc:'\u7b54\u5bf9 50 \u9898',check:(s)=>s.totalCorrect>=50},
  {id:'a100',icon:'\ud83c\udf93',name:'\u5b66\u5bcc\u4e94\u8f66',desc:'\u7b54\u5bf9 100 \u9898',check:(s)=>s.totalCorrect>=100},
  {id:'a200',icon:'\ud83d\udc68\u200d\ud83c\udf93',name:'\u8bed\u6cd5\u8fbe\u4eba',desc:'\u7b54\u5bf9 200 \u9898',check:(s)=>s.totalCorrect>=200},
  {id:'s3',icon:'\ud83d\udd25',name:'\u4e09\u65e5\u4e4b\u7ea6',desc:'\u8fde\u7eed\u5b66\u4e60 3 \u5929',check:(s)=>s.streak>=3},
  {id:'s7',icon:'\u26a1',name:'\u4e00\u5468\u4e0d\u65ad',desc:'\u8fde\u7eed\u5b66\u4e60 7 \u5929',check:(s)=>s.streak>=7},
  {id:'s30',icon:'\ud83c\udfd4',name:'\u6708\u5ea6\u575a\u5b88',desc:'\u8fde\u7eed\u5b66\u4e60 30 \u5929',check:(s)=>s.streak>=30},
  {id:'master',icon:'\ud83d\udc51',name:'\u5168\u90e8\u638c\u63e1',desc:'\u4e3b\u9898\u5e93\u5168\u90e8\u5df2\u638c\u63e1',check:()=>QUESTIONS.every(q=>getSt(q.id)===2)},
  {id:'star',icon:'\u2b50',name:'\u6536\u85cf\u5bb6',desc:'\u6536\u85cf 10 \u9053\u9898',check:()=>starSet.size>=10},
  {id:'clean',icon:'\ud83e\uddf9',name:'\u6e05\u9053\u592b',desc:'\u6e05\u7a7a\u9519\u9898\u672c',check:(s)=>s.hasClearedWrong},
  {id:'paper',icon:'\ud83d\udcdd',name:'\u81ea\u6d4b\u8fbe\u4eba',desc:'\u751f\u6210\u7b2c\u4e00\u4efd\u8bd5\u5377',check:()=>papers.length>=1},
  {id:'note',icon:'\u270d\ufe0f',name:'\u7b14\u8bb0\u5927\u5e08',desc:'\u5199 5 \u6761\u7b14\u8bb0',check:()=>Object.keys(noteMap).length>=5},
  {id:'time1h',icon:'\u23f1',name:'\u4e00\u5c0f\u65f6\u4e13\u6ce8',desc:'\u7d2f\u8ba1\u5b66\u4e60 1 \u5c0f\u65f6',check:(s)=>(s.totalSeconds||0)>=3600},
  {id:'quick5',icon:'\u26a1',name:'\u788e\u7247\u5b66\u4e60',desc:'\u5b8c\u6210\u4e00\u6b21\u5feb\u901f 5 \u9898',check:(s)=>!!s.usedQuickFive},
  {id:'srs',icon:'\ud83d\udd14',name:'\u590d\u4e60\u8fbe\u4eba',desc:'\u5b8c\u6210\u4e00\u6b21\u95f4\u9694\u590d\u4e60',check:(s)=>!!s.usedSrs},
  {id:'nb10',icon:'\ud83d\udcd3',name:'\u7b14\u8bb0\u8fbe\u4eba',desc:'\u7d2f\u8ba1 10 \u6761\u7b14\u8bb0',check:()=>typeof getAllNotes==='function'&&getAllNotes().length>=10},
  {id:'nbfree5',icon:'\ud83d\udd8b',name:'\u81ea\u7531\u5199\u624b',desc:'\u5199 5 \u6761\u81ea\u7531\u7b14\u8bb0',check:()=>freeNotes.length>=5}
];

function recordAnswer(correct,qid,seconds){
  const today=todayStr();
  if(!stats.dailyLog[today])stats.dailyLog[today]={answered:0,correct:0,answeredIds:[]};
  if(!stats.dailyLog[today].answeredIds)stats.dailyLog[today].answeredIds=[];
  if(!stats.dailyLog[today].seconds)stats.dailyLog[today].seconds=0;
  if(seconds&&seconds>0&&seconds<300){
    stats.dailyLog[today].seconds+=seconds;
    stats.totalSeconds=(stats.totalSeconds||0)+seconds;
  }
  if(qid && stats.dailyLog[today].answeredIds.includes(qid))return;
  if(qid)stats.dailyLog[today].answeredIds.push(qid);
  stats.totalAnswered++;
  if(correct)stats.totalCorrect++;
  stats.dailyLog[today].answered++;
  if(correct)stats.dailyLog[today].correct++;
  if(stats.lastStudyDate!==today){
    const y=new Date(Date.now()-86400000);
    const yStr=y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');
    if(stats.lastStudyDate===yStr)stats.streak++;
    else stats.streak=1;
    stats.lastStudyDate=today;
  }
  save(K.stats,stats);
  checkAchievements();
  checkGoal();
}
function checkAchievements(){
  const newOnes=[];
  ACHIEVEMENTS.forEach(a=>{
    if(unlockedAchievements.has(a.id))return;
    try{if(a.check(stats)){unlockedAchievements.add(a.id);newOnes.push(a);}}catch(e){}
  });
  if(newOnes.length){
    save(K.achieve,[...unlockedAchievements]);
    newOnes.forEach((a,i)=>setTimeout(()=>showAchieveToast(a),i*700));
  }
}
function showAchieveToast(a){
  const el=document.getElementById('achieveToast');
  if(!el)return;
  document.getElementById('achieveToastTitle').textContent='\u89e3\u9501\uff1a'+a.name;
  document.getElementById('achieveToastSub').textContent=a.desc;
  el.querySelector('.ico').textContent=a.icon;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2600);
}
function checkGoal(){
  const today=todayStr();
  const t=stats.dailyLog[today]||{answered:0};
  if(t.answered===dailyGoal)toast('\ud83c\udf89 \u4eca\u65e5\u76ee\u6807\u8fbe\u6210\uff01\u5b8c\u6210 '+dailyGoal+' \u9898','ok');
}
