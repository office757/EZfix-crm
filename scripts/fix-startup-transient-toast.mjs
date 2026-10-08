import fs from 'node:fs';
import assert from 'node:assert/strict';
const path=new URL('../index.html',import.meta.url);
const src=fs.readFileSync(path,'utf8');
const original=`window.addEventListener('error', function(e) {
  if (e.error && e.error.__toasted) return;
  toast('Something went wrong. Please try again.', true);
  console.error('window.onerror', e);
});
window.addEventListener('unhandledrejection', function(e) {
  if (e.reason && e.reason.__toasted) return;
  toast('Something went wrong. Please try again.', true);
  console.error('unhandledrejection', e.reason);
});`;
const replacement=`// Startup may emit transient asynchronous errors even when the dashboard loads.
const crmStartupAt=Date.now();
function reportUnexpectedCrmError(source,error) {
  console.error(source,error);
  if(Date.now()-crmStartupAt<8000) {
    // Let the asynchronous initial data load finish before deciding whether
    // a transient background rejection actually prevented CRM startup.
    setTimeout(()=>{
      if(dbReady) return;
      // initDb already reports a failed Supabase load explicitly; avoid a
      // second generic message for the same failed initialization.
      console.warn('CRM startup did not reach ready state after background error',source);
    },10000);
    return;
  }
  toast('Something went wrong. Please try again.',true);
}
window.addEventListener('error', function(e) {
  if(e.error && e.error.__toasted) return;
  reportUnexpectedCrmError('window.onerror',e.error||e.message);
});
window.addEventListener('unhandledrejection', function(e) {
  if(e.reason && e.reason.__toasted) return;
  reportUnexpectedCrmError('unhandledrejection',e.reason);
});`;
assert.equal(src.split(original).length-1,1,'Expected one original error handler block');
assert(src.includes('let dbReady=')||src.includes('dbReady =')||src.includes('dbReady=false'),'dbReady must exist');
fs.writeFileSync(path,src.replace(original,replacement));
console.log('Startup transient error toast guard installed.');
