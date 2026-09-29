import {createClient} from 'npm:@supabase/supabase-js@2.99.2';
import {createHandler} from './handler.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
Deno.serve(createHandler({db,bridgeKey:Deno.env.get('WA_LINKED_BRIDGE_KEY'),authenticate:async(header:string|null)=>{
 if(!header?.startsWith('Bearer '))return null;
 const {data:{user},error}=await db.auth.getUser(header.slice(7));if(error||!user)return null;
 const {data:member,error:memberError}=await db.from('team').select('role').eq('auth_user_id',user.id).eq('status','active').maybeSingle();
 return memberError||!member?null:{id:user.id,role:member.role};
}}));
