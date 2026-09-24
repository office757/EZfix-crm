const fs=require('fs');
const p=process.argv[2]||'index.html';
let s=fs.readFileSync(p,'utf8');

if(!s.includes('marketing-integration-status')){
  s=s.replace("const [square,googleAds,readiness,emailRes]=await Promise.all([","const [square,googleAds,readiness,integrationStatus,emailRes]=await Promise.all([");
  s=s.replace("   call('marketing-connector-readiness',{}),","   call('marketing-connector-readiness',{}),\n   call('marketing-integration-status',{}),");
  s=s.replace("aiManagerState.marketingHealth={square,googleAds,readiness,sms:getSmsDeliveryHealth()","aiManagerState.marketingHealth={square,googleAds,readiness,integrationStatus,sms:getSmsDeliveryHealth()");
}
if(!s.includes("tool:'accounts'")){
  s=s.replace("const [square,googleAds,readiness,integrationStatus,emailRes]=await Promise.all([","const [square,googleAds,googleAccounts,readiness,integrationStatus,emailRes]=await Promise.all([");
  s=s.replace("   call('google-ads-readonly',{tool:'status',input:{}}),","   call('google-ads-readonly',{tool:'status',input:{}}),\n   call('google-ads-readonly',{tool:'accounts',input:{limit:50}}),");
  s=s.replace("aiManagerState.marketingHealth={square,googleAds,readiness,integrationStatus","aiManagerState.marketingHealth={square,googleAds,googleAccounts,readiness,integrationStatus");
}
const marker="window.discoverGoogleAdsAccounts=discoverGoogleAdsAccounts;";
if(!s.includes('async function selectGoogleAdsAccount(')&&s.includes(marker)){
  const funcs="\nasync function selectGoogleAdsAccount(customerId){ if(!IS_OWNER)return toast('Owner access required',true); try{ const {data:{session}}=await SB.auth.getSession();if(!session?.access_token)throw new Error('Authentication required'); const r=await fetch(SUPABASE_PROJECT_URL+'/functions/v1/google-ads-select-account',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+session.access_token},body:JSON.stringify({customer_id:String(customerId||'')})}); const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok)throw new Error(j?.error||('Google Ads account selection failed ('+r.status+')')); toast('Google Ads account selected');await loadMarketingConnectionHealth(); }catch(e){toast(e?.message||'Could not select Google Ads account',true);} }\nwindow.selectGoogleAdsAccount=selectGoogleAdsAccount;\nasync function syncGoogleAdsReporting(){ if(!IS_OWNER)return toast('Owner access required',true); try{ const {data:{session}}=await SB.auth.getSession();if(!session?.access_token)throw new Error('Authentication required'); const r=await fetch(SUPABASE_PROJECT_URL+'/functions/v1/google-ads-sync-readonly',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+session.access_token},body:'{}'}); const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok)throw new Error(j?.error||('Google Ads reporting sync failed ('+r.status+')')); toast('Google Ads reporting synced: '+Number(j.campaigns||0)+' campaigns');await loadMarketingConnectionHealth();render(); }catch(e){toast(e?.message||'Could not sync Google Ads reporting',true);} }\nwindow.syncGoogleAdsReporting=syncGoogleAdsReporting;";
  s=s.replace(marker,marker+funcs);
}
if(!s.includes('const discoveredAccounts=')){
  const v=" const adsOauth=oauthByProvider.get('google_ads')||{}, gbpOauth=oauthByProvider.get('google_business_profile')||{}, metaOauth=oauthByProvider.get('meta')||{};";
  s=s.replace(v,v+"\n const discoveredAccounts=Array.isArray(mh?.googleAccounts?.data?.result?.accounts)?mh.googleAccounts.data.result.accounts:[], selectedCustomerId=String(googleConnection?.selected_customer_id||'');");
}
fs.writeFileSync(p,s);
console.log('Owner Office Google UI foundation reconciled');
