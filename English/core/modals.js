let _cr=null;
function askConfirm(msg,opts){
  opts=opts||{};
  return new Promise(resolve=>{
    _cr=resolve;
    const box=document.getElementById('confirmBox');
    box.classList.toggle('danger',!!opts.danger);
    document.getElementById('confirmIcon').textContent=opts.icon||'\u26a0\ufe0f';
    document.getElementById('confirmTitle').textContent=opts.title||'\u786e\u8ba4\u64cd\u4f5c';
    document.getElementById('confirmMsg').innerHTML=msg;
    const ok=document.getElementById('confirmOk');
    ok.textContent=opts.okText||'\u786e\u5b9a';
    ok.className='btn '+(opts.danger?'danger-solid':'primary');
    document.getElementById('confirmCancel').textContent=opts.cancelText||'\u53d6\u6d88';
    document.getElementById('confirmModal').classList.add('show');
  });
}
function closeConfirm(r){document.getElementById('confirmModal').classList.remove('show');if(_cr){_cr(r);_cr=null;}}

let _pr=null;
function askPrompt(opts){
  opts=opts||{};
  return new Promise(resolve=>{
    _pr=resolve;
    document.getElementById('promptTitle').textContent=opts.title||'\u8bf7\u8f93\u5165';
    document.getElementById('promptMsg').textContent=opts.msg||'';
    const inp=document.getElementById('promptInput');
    inp.value=opts.value||'';inp.placeholder=opts.placeholder||'';
    document.getElementById('promptModal').classList.add('show');
    if(!isMobile())setTimeout(()=>{inp.focus();inp.select();},100);
  });
}
function closePrompt(r){document.getElementById('promptModal').classList.remove('show');if(_pr){_pr(r);_pr=null;}}

document.addEventListener('DOMContentLoaded',()=>{
  const confirmOk=document.getElementById('confirmOk');
  const confirmCancel=document.getElementById('confirmCancel');
  const confirmModal=document.getElementById('confirmModal');
  if(confirmOk)confirmOk.addEventListener('click',()=>closeConfirm(true));
  if(confirmCancel)confirmCancel.addEventListener('click',()=>closeConfirm(false));
  if(confirmModal)confirmModal.addEventListener('click',e=>{if(e.target===confirmModal)closeConfirm(false);});

  const promptOk=document.getElementById('promptOk');
  const promptCancel=document.getElementById('promptCancel');
  const promptInput=document.getElementById('promptInput');
  const promptModal=document.getElementById('promptModal');
  if(promptOk)promptOk.addEventListener('click',()=>{const v=promptInput.value.trim();closePrompt(v||null);});
  if(promptCancel)promptCancel.addEventListener('click',()=>closePrompt(null));
  if(promptInput)promptInput.addEventListener('keydown',e=>{if(e.key==='Enter'){const v=e.target.value.trim();closePrompt(v||null);}});
  if(promptModal)promptModal.addEventListener('click',e=>{if(e.target===promptModal)closePrompt(null);});
});
