import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const VERIFY_TOKEN=Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN")||"";
const APP_SECRET=Deno.env.get("META_APP_SECRET")||"";

function toHex(bytes){
  let out="";for(const b of bytes)out+=b.toString(16).padStart(2,"0");return out;
}
function safeEqual(a,b){
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
async function verify(raw,header){
  if(!APP_SECRET||!header.startsWith("sha256="))return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(APP_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw));
  return safeEqual("sha256="+toHex(new Uint8Array(sig)),header.toLowerCase());
}
const rank={pending:0,queued:1,accepted:2,sent:3,delivered:4,read:5,failed:6};
const later=(a,b)=>(rank[b]??0)>=(rank[a]??0)?b:a;

async function rest(path,init={}){
  const headers=new Headers(init.headers||{});
  headers.set("apikey",SERVICE);
  headers.set("Authorization","Bearer "+SERVICE);
  headers.set("Content-Type","application/json");
  const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers});
  if(!r.ok)throw new Error("PostgREST "+r.status+": "+(await r.text()).slice(0,300));
  const body=await r.text();
  return body?JSON.parse(body):null;
}

Deno.serve(async(req)=>{
  const requestUrl=new globalThis.URL(req.url);
  if(req.method==="GET"){
    const mode=requestUrl.searchParams.get("hub.mode");
    const token=requestUrl.searchParams.get("hub.verify_token");
    const challenge=requestUrl.searchParams.get("hub.challenge")||"";
    if(mode==="subscribe"&&VERIFY_TOKEN&&token===VERIFY_TOKEN)return new Response(challenge,{status:200});
    return new Response("Forbidden",{status:403});
  }
  if(req.method!=="POST")return new Response("Method Not Allowed",{status:405});
  if(!SUPABASE_URL||!SERVICE)return new Response("Server unavailable",{status:503});

  const raw=await req.text();
  const signature=req.headers.get("x-hub-signature-256")||"";
  if(!await verify(raw,signature))return new Response("Invalid signature",{status:401});

  let body;try{body=JSON.parse(raw)}catch{return new Response("Bad Request",{status:400})}
  const statuses=[];
  for(const entry of Array.isArray(body?.entry)?body.entry:[]){
    for(const change of Array.isArray(entry?.changes)?entry.changes:[]){
      const value=change?.value||{};
      if(Array.isArray(value.statuses))statuses.push(...value.statuses);
    }
  }

  for(const s of statuses){
    const providerId=String(s?.id||"").trim();
    const incoming=String(s?.status||"").toLowerCase();
    if(!providerId||!["sent","delivered","read","failed"].includes(incoming))continue;

    const rows=await rest("wa_notifications?select=id,status,app_data&provider_message_id=eq."+encodeURIComponent(providerId)+"&limit=1");
    const n=Array.isArray(rows)?rows[0]:null;
    if(!n)continue;

    const current=String(n.status||"").toLowerCase();
    const effective=later(current,incoming);
    const ts=Number(s?.timestamp||0);
    const eventAt=ts>0?new Date(ts*1000).toISOString():new Date().toISOString();
    const err=Array.isArray(s?.errors)&&s.errors[0]?s.errors[0]:null;
    const failureReason=incoming==="failed"?String(err?.title||err?.message||"WhatsApp delivery failed").slice(0,1000):null;
    const appData={
      ...(n.app_data||{}),
      status:effective,
      provider_message_id:providerId,
      ...(failureReason?{failure_reason:failureReason}:{})
    };
    const patch={
      status:effective,
      updated_at:new Date().toISOString(),
      app_data:appData,
      ...(incoming==="sent"?{sent_at:eventAt}:{}),
      ...(incoming==="delivered"?{delivered_at:eventAt}:{}),
      ...(incoming==="read"?{read_at:eventAt}:{}),
      ...(incoming==="failed"?{failed_at:eventAt,failure_reason:failureReason}:{})
    };

    await rest("wa_notifications?id=eq."+encodeURIComponent(String(n.id)),{
      method:"PATCH",
      headers:{"Prefer":"return=minimal"},
      body:JSON.stringify(patch)
    });
  }
  return new Response("EVENT_RECEIVED",{status:200});
});