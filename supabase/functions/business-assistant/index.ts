import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {createBusinessAssistant} from '../_shared/business-assistant-handler.mjs';
Deno.serve(createBusinessAssistant({createClient,env:key=>Deno.env.get(key)}));
