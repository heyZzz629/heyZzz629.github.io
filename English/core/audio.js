let allVoices=[];
let selectedVoiceName=localStorage.getItem('q7g-voice-name')||'';
let speechRate=parseFloat(localStorage.getItem('q7g-rate'))||0.92;
function loadVoices(){
  if(!('speechSynthesis' in window))return;
  const v=window.speechSynthesis.getVoices();
  if(v.length)allVoices=v.filter(x=>/^en(-|_)?/i.test(x.lang));
}
if('speechSynthesis' in window){loadVoices();window.speechSynthesis.onvoiceschanged=loadVoices;}
function voiceScore(v){
  const n=v.name.toLowerCase();
  let s=0;
  if(/microsoft/.test(n)&&/(aria|jenny|guy|michelle|ana|christopher|eric|roger|ava|andrew|emma|brian)/.test(n))s+=100;
  if(/google/.test(n)&&/(us|uk)\s+english/.test(n))s+=80;
  if(/samantha|alex|karen|daniel|moira|tessa/.test(n))s+=70;
  if(/microsoft/.test(n)&&/(zira|david|mark|hazel)/.test(n))s+=50;
  if(v.lang==='en-US')s+=10;
  if(v.localService)s+=5;
  if(/espeak|festival|flite/i.test(n))s-=200;
  return s;
}
function pickBestVoice(){
  if(!allVoices.length)return null;
  if(selectedVoiceName){const hit=allVoices.find(v=>v.name===selectedVoiceName);if(hit)return hit;}
  return allVoices.slice().sort((a,b)=>voiceScore(b)-voiceScore(a))[0]||null;
}
function speak(text){
  if(!('speechSynthesis' in window))return;
  try{
    window.speechSynthesis.cancel();
    if(!allVoices.length)loadVoices();
    const u=new SpeechSynthesisUtterance(text);
    const v=pickBestVoice();
    if(v){u.voice=v;u.lang=v.lang;}else{u.lang='en-US';}
    u.rate=speechRate;u.pitch=1.0;u.volume=1.0;
    window.speechSynthesis.speak(u);
  }catch(e){}
}
function stripHTML(s){return String(s||'').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/gi,' ').replace(/_{2,}/g,' blank ').replace(/\s+/g,' ').trim();}
function renderVoiceList(){
  const voiceListEl=document.getElementById('voiceList');
  if(!voiceListEl)return;
  if(!allVoices.length){voiceListEl.innerHTML='<div style="padding:16px;text-align:center;color:var(--text-sub);font-size:13px">\u672a\u68c0\u6d4b\u5230\u82f1\u6587\u8bed\u97f3</div>';return;}
  const sorted=allVoices.slice().sort((a,b)=>voiceScore(b)-voiceScore(a));
  const current=pickBestVoice();
  voiceListEl.innerHTML=sorted.map(v=>`
    <div class="voice-item${current&&v.name===current.name?' active':''}" data-name="${esc(v.name)}">
      <div class="vn">${esc(v.name)}</div>
      <div class="vl">${esc(v.lang)}</div>
      <button class="btn sm" data-test="${esc(v.name)}" style="flex:0 0 auto;padding:6px 10px">\ud83d\udd0a</button>
    </div>
  `).join('');
  voiceListEl.querySelectorAll('.voice-item').forEach(item=>{
    item.addEventListener('click',e=>{
      if(e.target.closest('[data-test]'))return;
      selectedVoiceName=item.dataset.name;
      localStorage.setItem('q7g-voice-name',selectedVoiceName);
      renderVoiceList();
      speak('Hello, this is my voice.');
    });
  });
  voiceListEl.querySelectorAll('[data-test]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const v=allVoices.find(x=>x.name===btn.dataset.test);
      if(!v)return;
      try{
        window.speechSynthesis.cancel();
        const u=new SpeechSynthesisUtterance('Hello, this is my voice.');
        u.voice=v;u.lang=v.lang;u.rate=speechRate;u.pitch=1.0;
        window.speechSynthesis.speak(u);
      }catch(err){}
    });
  });
}
