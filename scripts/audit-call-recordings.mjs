import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rpc=readFileSync(new URL('../supabase/migrations/20260927185552_validate_call_recording_storage_asset.sql',import.meta.url),'utf8');
const storage=readFileSync(new URL('../supabase/migrations/20260927185635_restrict_call_recording_storage.sql',import.meta.url),'utf8');
let n=0; const check=(name,fn)=>{fn();n++;console.log('PASS '+name)};

check('Call recording fallback marker is installed once',()=>assert.equal((html.match(/EZFIX_CALL_RECORDING_FALLBACK_V1/g)||[]).length,1));
check('recording_asset is loaded from calls',()=>assert.match(html,/recording_url','recording_asset','provider_data/));
check('Private recording asset URL is renewed on calls refresh',()=>assert.match(html,/recordingAsset\?\.url/));
check('Provider recording URL remains fallback',()=>assert.match(html,/recordingAsset\?\.url \|\| c\?\.recordingUrl/));
check('Upload uses isolated call-recordings folder',()=>assert.match(html,/uploadAsset\(file,'call-recordings'\)/));
check('Client caps recordings at 100MB',()=>assert.match(html,/file\.size>104857600/));
check('Client accepts common audio formats',()=>assert.match(html,/m4a\|mp3\|wav\|aac\|ogg/));
check('Browser attaches through RPC not direct calls update',()=>{assert.match(html,/SB\.rpc\('set_call_recording_asset'/);assert.doesNotMatch(html,/from\(['"]calls['"]\)\.update\([^)]*recording/i)});
check('Recording controls are Owner/Admin only',()=>assert.match(html,/IS_OWNER \|\| CURRENT_TEAM_MEMBER\?\.role==='admin'/));
check('Existing audio player remains',()=>assert.match(html,/<audio controls preload="metadata"/));
check('RPC verifies Owner/Admin',()=>assert.match(rpc,/v_role not in \('owner','admin'\)/));
check('RPC verifies actual Storage object',()=>assert.match(rpc,/from storage\.objects[\s\S]*bucket_id='crm-assets'[\s\S]*name=v_path/));
check('RPC validates 100MB server-side',()=>assert.match(rpc,/v_size > 104857600|v_size>104857600/));
check('Storage read isolates call-recordings to Owner/Admin',()=>assert.match(storage,/name not like 'call-recordings\/%'[\s\S]*current_app_role/));
check('Storage insert isolates call-recordings to Owner/Admin',()=>assert.match(storage,/for insert[\s\S]*name not like 'call-recordings\/%'[\s\S]*current_app_role/));
check('All classic inline scripts parse',()=>{for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){const open=m[0].slice(0,m[0].indexOf('>')+1);if(/\bsrc=|\btype\s*=\s*["']module/i.test(open))continue;if(m[1].trim())new vm.Script(m[1]);}});
console.log('Call recording audit: '+n+'/'+n+' PASS');