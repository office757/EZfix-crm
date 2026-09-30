/* Explicit per-device enrollment. No permission prompt runs on page load. */
(() => {
 let busy=false;
 const allowed=()=>!!CURRENT_TEAM_MEMBER?.id&&((IS_OWNER&&!isTechnicianView())||(!IS_OWNER&&CURRENT_TEAM_MEMBER.role==='technician'));
 const status=message=>{const el=document.getElementById('phoneAlertsStatus');if(el)el.textContent=message;};
 const sameMember=id=>allowed()&&CURRENT_TEAM_MEMBER.id===id;
 async function enable(){
  if(busy)return;
  if(!allowed()){toast('Sign in with your own owner or technician account to enable phone alerts.',true);return;}
  const memberId=CURRENT_TEAM_MEMBER.id;
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){toast('On iPhone: open EZfix in Safari, choose Share → Add to Home Screen, then open that app and enable phone alerts.',true);return;}
  if(Notification.permission==='denied'){toast('Notifications are blocked. Enable them for EZfix in your device or browser settings, then try again.',true);return;}
  busy=true;status('Enabling phone alerts…');
  try{
   // Must originate in the tap handler for Safari/iOS permission prompts.
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw new Error('Phone alerts were not enabled. You can try again from the notification bell.');
   const {data:config,error}=await SB.functions.invoke('lead-dispatch',{body:{action:'public_key'}});
   if(error||!config?.ok||!config.public_key)throw new Error('Phone alerts could not connect. Please retry.');
   const registration=await navigator.serviceWorker.register('/dispatch-sw.js');
   await navigator.serviceWorker.ready;
   const raw=atob(config.public_key.replace(/-/g,'+').replace(/_/g,'/'));
   const key=Uint8Array.from(raw,c=>c.charCodeAt(0));
   const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
   if(!sameMember(memberId))throw new Error('Your account changed. Enable alerts again after signing in.');
   const {data:saved,error:saveError}=await SB.from('push_subscriptions').upsert({team_id:memberId,endpoint:subscription.endpoint,subscription:subscription.toJSON()},{onConflict:'endpoint'}).select('id,team_id');
   if(saveError||!saved?.some(row=>row.team_id===memberId))throw new Error('Device registration was not confirmed. Please retry.');
   if(!sameMember(memberId))throw new Error('Your account changed. Enable alerts again after signing in.');
   const message=IS_OWNER?'Phone alerts enabled for future new leads on this device.':'Phone alerts enabled for your lead offers on this device.';
   status(message);toast(message);
   const hint=document.getElementById('dispatchPushHint');if(hint)hint.textContent=message;
  }catch(error){status(error.message||'Phone alerts could not be enabled.');toast(error.message||'Phone alerts could not be enabled.',true);}
  finally{busy=false;}
 }
 window.PhoneAlerts={enable};
 const base=renderNotifPopover;
 renderNotifPopover=function(...args){const result=base.apply(this,args);const pop=document.getElementById('notifPopover');if(pop&&allowed()){
  const wrap=document.createElement('div');wrap.className='panel-body pad';
  const button=document.createElement('button');button.type='button';button.className='btn btn-sm';button.textContent='🔔 Enable phone alerts';button.onclick=enable;
  const hint=document.createElement('div');hint.id='phoneAlertsStatus';hint.className='muted';hint.style.fontSize='12px';hint.textContent=IS_OWNER?'New leads, even when EZfix is closed.':'Your lead offers, even when EZfix is closed.';
  wrap.append(button,hint);pop.prepend(wrap);
 }return result;};
 // Keep the existing technician button on the same verified enrollment path.
 if(window.Dispatch)window.Dispatch.enablePush=enable;
 function openLeadLink(){
  if(location.hash!=='#new-leads'||!dbReady||!CURRENT_TEAM_MEMBER)return;
  if(IS_OWNER&&!isTechnicianView()){history.replaceState(history.state,'',location.pathname+location.search);go('leads');}
 }
 window.addEventListener('hashchange',openLeadLink);
 const baseRender=render;render=function(...args){const result=baseRender.apply(this,args);openLeadLink();return result;};
})();
