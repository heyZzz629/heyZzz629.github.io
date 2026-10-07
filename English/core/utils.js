function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function load(k,d){try{const r=localStorage.getItem(k);return r?JSON.parse(r):d;}catch(e){return d;}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
let toastTimer;
function toast(msg,type){
  const el=document.getElementById('toast');
  if(!el)return;
  el.textContent=msg;el.className='toast show'+(type?' '+type:'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.className='toast'+(type?' '+type:'');},2200);
}
function shuffle(a){const b=a.slice();for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function now(){return Date.now();}
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function fmtTime(ts){if(!ts)return '\u2014';const d=new Date(ts);const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());}
function fmtRel(ts){if(!ts)return '';const d=Math.floor((now()-ts)/1000);if(d<60)return '\u521a\u521a';if(d<3600)return Math.floor(d/60)+'\u5206\u949f\u524d';if(d<86400)return Math.floor(d/3600)+'\u5c0f\u65f6\u524d';if(d<86400*7)return Math.floor(d/86400)+'\u5929\u524d';return fmtTime(ts).slice(0,10);}
function fmtDur(s){const m=Math.floor(s/60);const ss=s%60;return m+':'+String(ss).padStart(2,'0');}
function fmtDurHuman(sec){const h=Math.floor(sec/3600);const m=Math.floor(sec%3600/60);if(h>0)return h+'h '+m+'m';if(m>0)return m+'m';return sec+'s';}
function isMobile(){return window.matchMedia('(max-width: 760px)').matches;}
function normalize(s){
  return String(s||'').toLowerCase().trim()
    .replace(/[\u2019\u2018`\u00b4]/g,"'")
    .replace(/[.,!?;:]+$/g,'')
    .replace(/[\/|\u00b7\u3001]+/g,' ')
    .replace(/\s+/g,' ');
}
