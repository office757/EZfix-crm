import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const success="Thank you! Your request has been received. EZfix Garage Doors will contact you shortly.";
const reply=(t:string,s=200)=>new Response(t,{status:s,headers:{...cors,"content-type":"text/plain; charset=utf-8"}});
const clean=(v:unknown,m=1000)=>String(v??"").trim().slice(0,m);
const digits=(v:string)=>v.replace(/\D/g,"").slice(-10);
const pick=(o:any,n:string[])=>{for(const k of n)if(o?.[k]!=null&&String(o[k]).trim())return o[k];return""};
const parseDate=(v:string)=>{const s=clean(v,30);let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)return `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?s:"";};
const attr=(b:any,n:string[],m=500)=>clean(pick(b,n),m)||null;
const CURRENT_SMS_DISCLOSURE="I agree to receive SMS messages from EZfix Garage Doors Inc regarding my service request, appointments, technician updates, estimates, invoices, payment links, and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.";
const consentChecked=(b:any)=>{
 const raw=clean(pick(b,["sms_consent","sms-consent","smsConsent","SMS Consent","sms_opt_in","sms-opt-in","consent_sms","consent-sms"]),1200);
 if(!raw)return false;
 const v=raw.toLowerCase();
 return ["1","true","yes","on","checked","accepted"].includes(v)||v.includes("i agree to receive sms");
};
const e164US=(v:string)=>{const d=String(v||"").replace(/\D/g,"");const ten=d.length===11&&d.startsWith("1")?d.slice(1):d.length===10?d:"";return ten?"+1"+ten:"";};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors}); if(req.method!=="POST")return reply("Request could not be processed.",405);
 const ct=req.headers.get("content-type")||"";let b:any={};try{if(ct.includes("json"))b=await req.json();else{const fd=await req.formData();for(const[k,v]of fd.entries())b[k]=typeof v==="string"?v:v.name}}catch{return reply("Request could not be processed.",400)}
 const name=clean(pick(b,["name","full_name","full-name","your-name","first_name","first-name"]),160),email=clean(pick(b,["email","your-email","email_address","email-address"]),254).toLowerCase(),phone=clean(pick(b,["phone","tel","telephone","your-phone","phone_number","phone-number"]),50),address=clean(pick(b,["address","service_address","service-address","your-address"]),300),service=clean(pick(b,["service_type","service-type","service","service_requested","service-requested"]),200);
 const preferredDate=parseDate(pick(b,["preferred_date","preferred-date"])),time=clean(pick(b,["preferred_time","preferred-time"]),100),problem=clean(pick(b,["problem_description","problem-description","message","notes","your-message","comments"]),2000);
 if(!name||(!phone&&!email))return reply("Please enter your name and a phone number or email address.",400);
 const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}"),key=keys.default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");const db=createClient(Deno.env.get("SUPABASE_URL")!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
 const since=new Date(Date.now()-600000).toISOString();let dup:any=null;if(email){const{data}=await db.from("leads").select("id").eq("source","Website").ilike("email",email).is("deleted_at",null).gte("created_at",since).limit(1);dup=data?.[0]}if(!dup&&digits(phone).length===10){const{data}=await db.from("leads").select("id,phone").eq("source","Website").is("deleted_at",null).gte("created_at",since).limit(20);dup=(data||[]).find((x:any)=>digits(x.phone||"")===digits(phone))}if(dup)return reply(success);
 const leadId="lead_web_"+crypto.randomUUID(),emergency=/emergency|asap/i.test(time);const notes=problem||null;
 const gclid=attr(b,["gclid","GCLID"]),gbraid=attr(b,["gbraid","GBRAID"]),wbraid=attr(b,["wbraid","WBRAID"]),utmSource=attr(b,["utm_source","utm-source"]),utmMedium=attr(b,["utm_medium","utm-medium"]),utmCampaign=attr(b,["utm_campaign","utm-campaign"]),utmTerm=attr(b,["utm_term","utm-term"]),utmContent=attr(b,["utm_content","utm-content"]),googleAdsCustomerId=attr(b,["google_ads_customer_id","google-ads-customer-id","customer_id"],64),campaignId=attr(b,["campaign_id","campaign-id"],64),adGroupId=attr(b,["ad_group_id","ad-group-id"],64),criterionId=attr(b,["criterion_id","criterion-id"],64);
 const landingPage=attr(b,["landing_page","landing-page","page_url","page-url","url"],1200)||clean(req.headers.get("referer"),1200)||null;
 const {error:le}=await db.from("leads").insert({id:leadId,name,email:email||null,phone:phone||null,address:address||null,service_requested:service||null,source:"Website",source_provider:"WordPress Avada",source_channel:"Website Form",status:"new",assignment_status:"unassigned",notes,app_data:{website_form_id:641,preferred_date:preferredDate||null,preferred_time:time||null,problem_description:problem||null,emergency,website_received_at:new Date().toISOString(),utm_source:utmSource,utm_medium:utmMedium,utm_campaign:utmCampaign,gclid:!!gclid}});

 if(le){console.error(le);return reply("Your request could not be saved. Please call EZfix Garage Doors.",500)}
 if(consentChecked(b)){
   const phoneE164=e164US(phone);
   if(phoneE164){
     const sourceUrl=landingPage||clean(req.headers.get("referer"),1200)||"https://ezfixgaragedoorsinc.com/contact/";
     const now=new Date().toISOString();
     const {error:ce}=await db.from("sms_consent").upsert({
       phone_e164:phoneE164,
       status:"opted_in",
       source:"website_form",
       evidence_message_id:null,
       last_keyword:"WEB_FORM_OPT_IN",
       opted_in_at:now,
       opted_out_at:null,
       notes:"Explicit website checkbox opt-in captured by Contact Form 7 form 641.",
       consent_text:CURRENT_SMS_DISCLOSURE,
       consent_version:"website-form-641-v1",
       source_url:sourceUrl,
       form_submission_id:"web:"+leadId,
       signer_name:name||null,
       signature_data_url:null,
       consent_invoice_id:null,
       consented_by_team_id:null,
       updated_at:now
     },{onConflict:"phone_e164"});
     if(ce)console.error("website sms consent upsert failed",ce);
   }
 }
 const hasAttribution=!!(gclid||gbraid||wbraid||utmSource||utmMedium||utmCampaign||utmTerm||utmContent||landingPage||googleAdsCustomerId||campaignId||adGroupId||criterionId);
 if(hasAttribution){const {error:ae}=await db.from("lead_attribution").upsert({lead_id:leadId,gclid,gbraid,wbraid,utm_source:utmSource,utm_medium:utmMedium,utm_campaign:utmCampaign,utm_term:utmTerm,utm_content:utmContent,landing_page:landingPage,google_ads_customer_id:googleAdsCustomerId,campaign_id:campaignId,ad_group_id:adGroupId,criterion_id:criterionId,source_evidence:{provider:"website_form",form_id:641,referer:clean(req.headers.get("referer"),1200)||null},captured_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"lead_id"});if(ae)console.error("lead attribution insert failed",ae)}
 if(preferredDate&&time){
   const jobId="job_web_"+crypto.randomUUID(),jobNo="WEB-"+Date.now().toString().slice(-8);
   const {error:je}=await db.from("jobs").insert({id:jobId,customer_name:name,title:service||"Website Service Request",description:problem||service||"Website service request",complaint:problem||null,status:"scheduled",scheduled_date:preferredDate,appointment_window:emergency?"Emergency / ASAP":time,job_number:jobNo,app_data:{source:"website_form",lead_id:leadId,address,phone,email,technician_assignment_required:true,emergency}});
   if(!je){await db.from("leads").update({converted_job_id:jobId}).eq("id",leadId);await db.from("ai_alerts").insert({rule_key:"website_job_unassigned",severity:emergency?"critical":"warning",title:emergency?"Emergency website request — assign technician":"Website appointment — assign technician",detail:`${name} requested ${preferredDate} ${time}. ${problem||service||""}`.slice(0,1000),related_type:"job",related_id:jobId,status:"open",evidence:{lead_id:leadId,preferred_date:preferredDate,preferred_time:time,emergency}})} else console.error("job insert failed",je);
 }
 return reply(success);
});