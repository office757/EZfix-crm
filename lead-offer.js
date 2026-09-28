(function(){
'use strict';
const $=id=>document.getElementById(id);
const token=location.hash.slice(1);
const endpoint='https://fylbalenuqpovwncwbah.supabase.co/functions/v1/lead-offer-response';
let offer=null,busy=false,offset=0,checking=false,revision=0,declineOpen=false,uncertain=false,feedback='',readError='',displayedState;
const channel=c=>({sms:'SMS',whatsapp:'WhatsApp',in_app:'the app'}[c]||'another channel');
const remaining=()=>offer?Math.max(0,Math.ceil((Date.parse(offer.expires_at)-Date.now()-offset)/1000)):0;
const currentState=()=>uncertain?'checking':offer?.status==='pending'&&!remaining()?'expired':offer?.status;
function draw(){
 const state=currentState();displayedState=state;
 if(state!=='pending')declineOpen=false;
 $('actions').hidden=state!=='pending'||uncertain;
 $('confirmDecline').hidden=!declineOpen||busy||uncertain;
 $('retry').hidden=!readError&&!uncertain;$('retry').disabled=busy||checking;
 $('zipBox').hidden=!offer?.zip;$('zip').textContent=offer?.zip||'';
 $('openApp').hidden=state==='pending'&&!uncertain&&!readError;
 const labels={pending:['📬','A new lead for you','Review the ZIP code below. Accept to add this job to your workday.'],accepted:['✅','You’re confirmed',`Accepted via ${channel(offer?.responded_channel)}. This lead is already yours — no second approval needed.`],declined:['↩️','Offer declined','Your response is saved in every channel. The office can offer this lead to someone else.'],expired:['⏳','This offer has expired','The response window has ended. Open EZfix to see your current offers.'],cancelled:['📭','Offer no longer available','This offer was withdrawn. Check EZfix for your latest work.']};
 labels.checking=['🔄','Confirming your response','Your response may already be saved. Check the offer to confirm.'];
 const [icon,title,detail]=labels[state]||['📭','Link unavailable','Open the link from your lead notification, or check your offers in EZfix.'];
 $('icon').textContent=icon;$('title').textContent=!offer&&readError?'Unable to open this offer':title;$('detail').textContent=!offer&&readError?readError:detail;
 $('feedback').textContent=busy?'Saving your response…':feedback||readError;
 tick();
}
function tick(){
 const state=currentState(),seconds=remaining();
 if(state!==displayedState){draw();return;}
 $('timer').textContent=state==='pending'?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`:state==='expired'?'Response window ended':'';
 $('accept').disabled=$('decline').disabled=$('confirmPass').disabled=busy||uncertain||state!=='pending';
}
async function request(action,accept){
 const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,action,...(action==='respond'?{accept}:{})}),signal:AbortSignal.timeout(12000)});
 const data=await res.json();if(!res.ok||!data.ok)throw new Error(data.error||'Could not confirm the response. Check again.');
 return data.offer;
}
function applyOffer(next){offer=next;offset=Date.parse(next.server_time)-Date.now();uncertain=false;readError='';feedback='';}
async function check(silent=false){
 if(checking||busy)return;checking=true;const at=revision;$('retry').disabled=true;
 try{const next=await request('status');if(at===revision)applyOffer(next);}
 catch(e){if(at===revision)readError=silent&&offer?'Connection interrupted. Checking again when connected.':e.message;}
 finally{if(at===revision){checking=false;draw();}}
}
async function respond(accept){
 if(busy||uncertain||currentState()!=='pending')return;
 // Invalidate any status read started before this explicit response.
 revision++;checking=false;busy=true;declineOpen=false;readError='';feedback='';draw();
 try{applyOffer(await request('respond',accept));}
 catch{ // A timed-out response may already have committed. Read before offering retry.
  try{applyOffer(await request('status'));feedback=offer.status==='pending'?'Not confirmed yet. Please try again.':'';}
  catch{uncertain=true;feedback='Connection interrupted. Check the offer before trying again.';}
 }finally{busy=false;draw();}
}
$('accept').onclick=()=>respond(true);
$('decline').onclick=()=>{declineOpen=true;draw();};
$('confirmPass').onclick=()=>respond(false);
$('keep').onclick=()=>{declineOpen=false;draw();};
$('retry').onclick=()=>check();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)check(true);});
window.addEventListener('online',()=>check(true));
window.addEventListener('hashchange',()=>location.reload());
setInterval(tick,1000);setInterval(()=>{if(!document.hidden&&(offer?.status==='pending'||uncertain))check(true);},5000);
if(/^[A-Za-z0-9_-]{43}$/.test(token))check();else{draw();$('openApp').hidden=false;}
})();
