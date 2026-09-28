(function(){
'use strict';
const $=id=>document.getElementById(id);
const token=location.hash.slice(1);
const endpoint='https://fylbalenuqpovwncwbah.supabase.co/functions/v1/lead-offer-response';
let offer=null,busy=false,offset=0,checking=false;
const channel=c=>({sms:'SMS',whatsapp:'WhatsApp',in_app:'the app'}[c]||'another channel');
function draw(){
 const state=offer?.status;
 $('actions').hidden=state!=='pending';$('confirmDecline').hidden=true;$('retry').hidden=true;
 $('zipBox').hidden=!offer?.zip;$('zip').textContent=offer?.zip||'';
 $('openApp').hidden=!state||state==='pending';
 const labels={pending:['📬','A new lead for you','Review the ZIP code below. Accept to add this job to your workday.'],accepted:['✅','You’re confirmed',`Accepted via ${channel(offer?.responded_channel)}. This lead is already yours — no second approval needed.`],declined:['↩️','Offer declined','Your response is saved in every channel. The office can offer this lead to someone else.'],expired:['⏳','This offer has expired','The response window has ended. Open EZfix to see your current offers.'],cancelled:['📭','Offer no longer available','This offer was withdrawn. Check EZfix for your latest work.']};
 const [icon,title,detail]=labels[state]||['📭','Link unavailable','Open the link from your lead notification, or check your offers in EZfix.'];
 $('icon').textContent=icon;$('title').textContent=title;$('detail').textContent=detail;
 tick();
}
function tick(){
 const seconds=offer?Math.max(0,Math.ceil((Date.parse(offer.expires_at)-Date.now()-offset)/1000)):0;
 $('timer').textContent=offer?.status==='pending'?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`:'';
 $('accept').disabled=busy||!seconds;$('decline').disabled=busy||!seconds;$('confirmPass').disabled=busy||!seconds;
 if(offer?.status==='pending'&&!seconds){$('timer').textContent='Response window ended';$('confirmDecline').hidden=true;}
}
async function request(action,accept){
 const res=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,action,...(action==='respond'?{accept}:{})}),signal:AbortSignal.timeout(12000)});
 const data=await res.json();if(!res.ok||!data.ok)throw new Error(data.error||'Could not confirm the response. Check again.');
 offer=data.offer;offset=Date.parse(offer.server_time)-Date.now();return data;
}
async function check(silent=false){
 if(checking||busy)return;checking=true;
 try{await request('status');$('feedback').textContent='';draw();}
 catch(e){if(!silent){$('title').textContent=offer?'Check your connection':'Unable to open this offer';$('detail').textContent=e.message;$('retry').hidden=false;$('openApp').hidden=false;}}
 finally{checking=false;}
}
async function respond(accept){
 if(busy||offer?.status!=='pending')return;busy=true;tick();$('feedback').textContent='Saving your response…';
 try{await request('respond',accept);$('feedback').textContent='';draw();}
 catch{ // A timed-out response may already have committed. Read before offering retry.
  try{await request('status');draw();$('feedback').textContent=offer.status==='pending'?'Not confirmed yet. Please try again.':'';}
  catch{$('feedback').textContent='Connection interrupted. Check the offer before trying again.';$('actions').hidden=true;$('confirmDecline').hidden=true;$('retry').hidden=false;}
 }finally{busy=false;tick();}
}
$('accept').onclick=()=>respond(true);
$('decline').onclick=()=>{$('confirmDecline').hidden=false;};
$('confirmPass').onclick=()=>respond(false);
$('keep').onclick=()=>{$('confirmDecline').hidden=true;};
$('retry').onclick=()=>check();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)check(true);});
setInterval(tick,1000);setInterval(()=>{if(!document.hidden&&offer?.status==='pending')check(true);},5000);
if(/^[A-Za-z0-9_-]{43}$/.test(token))check();else{draw();$('openApp').hidden=false;}
})();
