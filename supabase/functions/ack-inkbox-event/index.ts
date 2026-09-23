import { createClient } from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function context(req:Request){
 const h=req.headers.get("Authorization")??""; if(!h.startsWith("Bearer ")) return null;
 const token=h.slice(7); const c=createClient(url,anon,{global:{headers:{Authorization:h}}});
 const {data,error}=await c.auth.getUser(token); if(error||!data.user) return null;
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:member}=await admin.from("team").select("id").eq("auth_user_id",data.user.id).eq("status","active").maybeSingle();
 return member?{admin,member}:null;
}
Deno.serve(async(req)=>{
 if(req.method!=="POST") return Response.json({error:"Method not allowed"},{status:405});
 const ctx=await context(req); if(!ctx) return Response.json({error:"Unauthorized"},{status:401});
 let body:any; try{body=await req.json()}catch{return Response.json({error:"Invalid JSON body"},{status:400})}
 const id=body?.providerEventId; if(typeof id!=="string"||!id) return Response.json({error:"providerEventId is required"},{status:400});
 const {data,error}=await ctx.admin.from("inkbox_events").update({processing_status:"processed",processed_at:new Date().toISOString()}).eq("provider_event_id",id).eq("processing_status","unprocessed").select("id");
 if(error) return Response.json({error:"Update failed"},{status:500});
 return Response.json({acknowledged:true,alreadyProcessed:(data?.length??0)===0});
});