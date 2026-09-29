import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const base=new URL('../services/whatsapp-bridge/',import.meta.url);
execFileSync(process.execPath,['--test',...['bridge','relay','cloud','ui'].map(name=>fileURLToPath(new URL(name+'.test.mjs',base)))],{stdio:'inherit'});
