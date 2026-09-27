(() => {
'use strict';
const baseRenderAiManagerAds=renderAiManagerAds;
const marketingConnectionState={
  loaded:false,loading:false,error:null,readiness:null,integration:null,
  accounts:[],connection:null,lastResult:null,lastAction:null
};
window.marketingConnectionState=marketingConnectionState;

async function callMarketingEdge(name,body={}){
  const {data,error}=await SB.functions.invoke(name,{body});
  if(error) throw new Error(error.message||name+' failed');
  if(!data || data.ok===false) {
    const e=new Error(data?.error||name+' failed');
    e.code=data?.code||null; e.data=data; throw e;
  }
  return data;
}
async function loadMarketingConnectionState(showToast=false){
  if(!IS_OWNER)return;
  marketingConnectionState.loading=true; marketingConnectionState.error=null;
  if(aiManagerState.subview==='google_ads') render();
  const results=await Promise.allSettled([
    callMarketingEdge('marketing-connector-readiness',{}),
    callMarketingEdge('marketing-integration-status',{}),
    SB.from('google_ads_accounts').select('id,connection_id,customer_id,descriptive_name,currency_code,time_zone,is_manager,selected,updated_at').order('customer_id'),
    SB.from('google_ads_connections').select('id,status,google_account_email,selected_customer_id,login_customer_id,token_expires_at,last_error,last_synced_at,updated_at').order('created_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  marketingConnectionState.readiness=results[0].status==='fulfilled'?results[0].value:null;
  marketingConnectionState.integration=results[1].status==='fulfilled'?results[1].value:null;
  marketingConnectionState.accounts=results[2].status==='fulfilled'&&!results[2].value.error?(results[2].value.data||[]):[];
  marketingConnectionState.connection=results[3].status==='fulfilled'&&!results[3].value.error?(results[3].value.data||null):null;
  const rejected=results.find(x=>x.status==='rejected');
  marketingConnectionState.error=rejected?String(rejected.reason?.message||rejected.reason):null;
  marketingConnectionState.loading=false; marketingConnectionState.loaded=true;
  if(showToast) toast(marketingConnectionState.error?'Connection status loaded with an error':'Marketing connection status refreshed',!!marketingConnectionState.error);
  if(aiManagerState.subview==='google_ads') render();
}
window.loadMarketingConnectionState=loadMarketingConnectionState;

async function connectGoogleAds(){
  if(!IS_OWNER)return toast('Owner access required',true);
  let popup=null;
  try{popup=window.open('about:blank','ezfixGoogleAdsOAuth','width=720,height=820,noopener')}catch{}
  marketingConnectionState.lastAction='Starting Google OAuth…';render();
  try{
    const data=await callMarketingEdge('marketing-oauth-start',{provider:'google_ads'});
    marketingConnectionState.lastAction='Google authorization opened. Complete approval, then return and refresh connection status.';
    if(popup){popup.location.href=data.authorization_url}else{window.location.href=data.authorization_url}
    render();
  }catch(e){
    if(popup)try{popup.close()}catch{}
    marketingConnectionState.lastAction=null; marketingConnectionState.error=e.message||String(e);render();toast(marketingConnectionState.error,true);
  }
}
window.connectGoogleAds=connectGoogleAds;

async function discoverGoogleAdsAccounts(){
  marketingConnectionState.lastAction='Discovering accessible Google Ads accounts…';render();
  try{
    const data=await callMarketingEdge('google-ads-discover-accounts',{});
    marketingConnectionState.lastResult=data; marketingConnectionState.lastAction='Discovered '+Number(data.account_count||0)+' accessible account(s).';
    await loadMarketingConnectionState(false); toast(marketingConnectionState.lastAction);
  }catch(e){marketingConnectionState.lastAction=null;marketingConnectionState.error=e.message||String(e);render();toast(marketingConnectionState.error,true)}
}
window.discoverGoogleAdsAccounts=discoverGoogleAdsAccounts;

async function selectGoogleAdsAccount(customerId){
  if(!/^\d{1,20}$/.test(String(customerId||'')))return toast('Invalid Google Ads customer ID',true);
  marketingConnectionState.lastAction='Selecting account '+customerId+'…';render();
  try{
    const data=await callMarketingEdge('google-ads-select-account',{customer_id:String(customerId)});
    marketingConnectionState.lastResult=data;marketingConnectionState.lastAction='Google Ads account selected.';
    await loadMarketingConnectionState(false);toast('Google Ads account selected');
  }catch(e){marketingConnectionState.lastAction=null;marketingConnectionState.error=e.message||String(e);render();toast(marketingConnectionState.error,true)}
}
window.selectGoogleAdsAccount=selectGoogleAdsAccount;

async function syncGoogleAdsReadOnly(){
  marketingConnectionState.lastAction='Syncing read-only campaign reporting…';render();
  try{
    const data=await callMarketingEdge('google-ads-sync-readonly',{});
    marketingConnectionState.lastResult=data;
    marketingConnectionState.lastAction='Sync complete · '+Number(data.campaigns||0)+' campaigns · '+Number(data.daily_metric_rows||0)+' daily metric rows.';
    try{aiManagerState.ads=await callAiManagerTool('get_google_ads_summary')}catch{}
    await loadMarketingConnectionState(false);toast('Google Ads read-only sync complete');
  }catch(e){marketingConnectionState.lastAction=null;marketingConnectionState.error=e.message||String(e);render();toast(marketingConnectionState.error,true)}
}
window.syncGoogleAdsReadOnly=syncGoogleAdsReadOnly;

function boolStep(label,ok,detail){
  return '<div class="mkt-step '+(ok?'ok':'')+'"><span>'+(ok?'✓':'•')+'</span><div><b>'+esc(label)+'</b><small>'+esc(detail||'')+'</small></div></div>';
}
function formatCustomerId(v){const s=String(v||'').replace(/\D/g,'');return s.length===10?s.slice(0,3)+'-'+s.slice(3,6)+'-'+s.slice(6):s||'—'}
function marketingWizardHtml(){
  const s=marketingConnectionState,r=s.readiness?.connectors?.google_ads||{},conn=s.connection||{};
  const oauthConnection=(s.integration?.oauth_connections||[]).find(x=>x.provider==='google_ads');
  const oauthConnected=oauthConnection?.status==='connected'||r.connected||conn.status==='connected';
  const selected=conn.selected_customer_id||s.accounts.find(x=>x.selected)?.customer_id||'';
  const credentialReady=!!r.oauth_ready,apiReady=!!r.api_ready;
  const accountCount=s.accounts.length||Number(s.integration?.google_ads?.accounts||0);
  const syncReady=oauthConnected&&!!selected;
  const setupComplete=apiReady&&oauthConnected&&accountCount>0&&!!selected;
  return '<section class="mkt-wizard">'+
    '<div class="mkt-wizard-head"><div><span>GOOGLE ADS CONNECTION</span><h2>Read-only Marketing Connection</h2><p>Connect official Google Ads reporting without giving the CRM permission to edit campaigns, budgets, bids, keywords or ads.</p></div><div class="mkt-safe">READ ONLY</div></div>'+
    (s.loading?'<div class="mkt-loading">Checking connector status…</div>':'')+
    (s.error?'<div class="mkt-error">'+esc(s.error)+'</div>':'')+
    '<div class="mkt-steps">'+
      boolStep('OAuth Client ID',!!r.oauth_client_id_configured,r.oauth_client_id_configured?'Configured securely server-side':'Missing server credential')+
      boolStep('OAuth Client Secret',!!r.oauth_client_secret_configured,r.oauth_client_secret_configured?'Configured securely server-side':'Missing server credential')+
      boolStep('Google Ads Developer Token',!!r.developer_token_configured,r.developer_token_configured?'Configured securely server-side':'Required for Google Ads API')+
      boolStep('Google Authorization',oauthConnected,oauthConnected?'Google account authorized':'OAuth approval not completed')+
      boolStep('Accessible Accounts',accountCount>0,accountCount?accountCount+' account(s) discovered':'Run account discovery after OAuth')+
      boolStep('Reporting Account',!!selected,selected?'Customer '+formatCustomerId(selected):'Select the account to report on')+
    '</div>'+
    '<div class="mkt-actions">'+
      '<button class="btn btn-sm" onclick="loadMarketingConnectionState(true)" '+(s.loading?'disabled':'')+'>Refresh Status</button>'+
      (!apiReady?'<span class="mkt-blocked">Complete the three Google credentials in server environment before OAuth.</span>':'')+
      (apiReady&&!oauthConnected?'<button class="btn btn-primary" onclick="connectGoogleAds()">Connect Google Ads</button>':'')+
      (oauthConnected?'<button class="btn" onclick="discoverGoogleAdsAccounts()">Discover Accounts</button>':'')+
      (syncReady?'<button class="btn btn-primary" onclick="syncGoogleAdsReadOnly()">Sync Reporting Now</button>':'')+
    '</div>'+
    (s.lastAction?'<div class="mkt-action-note">'+esc(s.lastAction)+'</div>':'')+
    (s.accounts.length?'<div class="mkt-account-list"><div class="mkt-subhead"><b>Accessible Google Ads Accounts</b><span>'+s.accounts.length+'</span></div>'+s.accounts.map(a=>'<div class="mkt-account '+(String(a.customer_id)===String(selected)?'selected':'')+'"><div><b>'+(a.descriptive_name?esc(a.descriptive_name):'Google Ads '+formatCustomerId(a.customer_id))+'</b><small>Customer ID '+esc(formatCustomerId(a.customer_id))+(a.currency_code?' · '+esc(a.currency_code):'')+(a.time_zone?' · '+esc(a.time_zone):'')+'</small></div>'+(String(a.customer_id)===String(selected)?'<span class="mkt-selected">Selected</span>':'<button class="btn btn-sm" onclick="selectGoogleAdsAccount(\''+esc(a.customer_id)+'\')">Select</button>')+'</div>').join('')+'</div>':'')+
    (conn.last_error?'<div class="mkt-error"><b>Last Google Ads error</b><br>'+esc(conn.last_error)+'</div>':'')+
    '<div class="mkt-guardrail"><b>Safety:</b> '+(setupComplete?'Connection path is complete. Reporting remains read-only.':'No Google Ads write capability is enabled.')+'</div>'+
  '</section>';
}
renderAiManagerAds=function(b,a){
  baseRenderAiManagerAds(b,a);
  b.insertAdjacentHTML('afterbegin',marketingWizardHtml());
  if(!marketingConnectionState.loaded&&!marketingConnectionState.loading)setTimeout(()=>loadMarketingConnectionState(false),0);
};
window.renderAiManagerAds=renderAiManagerAds;
})();