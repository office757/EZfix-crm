self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{};}catch{return;}
 const expiry=Date.parse(data.expires_at);if(!Number.isFinite(expiry)||expiry<=Date.now())return;
 const owner=data.kind==='owner_lead'&&typeof data.event_id==='string';
 if(!owner&&!data.offer_id)return;
 const url=owner?'/crm#new-leads':'/crm#lead-offers';
 event.waitUntil(self.registration.showNotification(String(data.title||'New EZfix lead'),{icon:'/assets/ezfix-app-icon-192.png?v=2',body:String(data.body||'Open Leads to respond.'),tag:(owner?'owner-lead-':'lead-offer-')+(owner?data.event_id:data.offer_id),renotify:true,data:{url}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const url=event.notification.data?.url==='/crm#new-leads'?'/crm#new-leads':'/crm#lead-offers';const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(c=>new URL(c.url).origin===self.location.origin);if(existing){await existing.navigate(url);return existing.focus();}return self.clients.openWindow(url);})());});
