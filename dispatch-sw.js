self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{};}catch{return;}
 if(!data.offer_id||!data.expires_at||Date.parse(data.expires_at)<=Date.now())return;
 event.waitUntil(self.registration.showNotification(String(data.title||'New EZfix lead'),{body:String(data.body||'Open Leads to respond.'),tag:'lead-offer-'+data.offer_id,renotify:true,data:{url:'/crm#lead-offers'}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(c=>new URL(c.url).origin===self.location.origin);if(existing){await existing.navigate('/crm#lead-offers');return existing.focus();}return self.clients.openWindow('/crm#lead-offers');})());});
