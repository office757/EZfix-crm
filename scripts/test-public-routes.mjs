import assert from 'node:assert/strict';
import { auditRouteConfig, auditPublicRoutes } from './audit-public-routes.mjs';
const config = {
  cleanUrls: true,
  rewrites: [{source:'/',destination:'/auth-shell'},{source:'/crm',destination:'/index'}],
  redirects: [{source:'/index.html',destination:'/'}],
  headers: [{source:'/(.*)',headers:[{key:'Referrer-Policy',value:'same-origin'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'SAMEORIGIN'}]}]
};
const shell = '<iframe src="/crm"></iframe>';
const crm = '<title>EZfix CRM</title><style id="ezfix-calendar-premium"></style><script>/* EZFIX_CALENDAR_OVERLAPS_V1 */ async function initDb(){const session=await requireSession();}</script>';
const titles = new Map([['/auth-shell','EZfix CRM — Sign in'],['/invoice-pay','Invoice | EZfix Garage Doors Inc'],['/estimate-sign','Review & Sign Estimate | EZfix Garage Doors Inc'],['/set-password','Set EZfix CRM Password']]);
const base = 'https://example.test/';
const makeFetch = transform => async (url, options) => {
  assert.equal(options.method,'GET'); assert.equal(options.redirect,'manual'); assert.equal(url.origin,base.slice(0,-1));
  const path=url.pathname;
  const body=titles.has(path)?`<title>${titles.get(path)}</title>`:crm;
  return transform?.(path,body) || new Response(body,{status:200,headers:{'content-type':'text/html'}});
};
const invalid = (mutate, html=shell) => { const c=structuredClone(config);mutate(c);assert.throws(()=>auditRouteConfig(c,html)); };
let passed=0;
async function test(name,run){await run();passed++;console.log('PASS '+name);}
await test('Current route contract',()=>assert.equal(auditRouteConfig(config,shell).configChecks,9));
await test('Old .html rewrite is rejected',()=>invalid(c=>c.rewrites[1].destination='/index.html'));
await test('Missing CRM route is rejected',()=>invalid(c=>c.rewrites.pop()));
await test('Duplicate CRM routes are rejected',()=>invalid(c=>c.rewrites.push(c.rewrites[1])));
await test('Disabled clean URLs are rejected',()=>invalid(c=>c.cleanUrls=false));
await test('Wrong iframe target is rejected',()=>invalid(()=>{},'<iframe src="/missing"></iframe>'));
await test('Security header removal is rejected',()=>invalid(c=>c.headers[0].headers.pop()));
await test('GET-only checks cover all seven pages',async()=>assert.equal((await auditPublicRoutes(base,makeFetch())).routeChecks,7));
await test('404 is a failure',()=>assert.rejects(auditPublicRoutes(base,makeFetch(p=>p==='/crm'?new Response('',{status:404}):null))));
await test('Protection redirect is a failure',()=>assert.rejects(auditPublicRoutes(base,makeFetch(()=>new Response('',{status:302})))));
await test('Wrong sign-in page is a failure',()=>assert.rejects(auditPublicRoutes(base,makeFetch(()=>new Response('<title>Provider Sign In</title>',{headers:{'content-type':'text/html'}})))));
await test('Stale CRM copy is a failure',()=>assert.rejects(auditPublicRoutes(base,makeFetch((p,b)=>p==='/crm'?new Response(b+'stale',{headers:{'content-type':'text/html'}}):null))));
await test('Missing session guard is a failure',()=>assert.rejects(auditPublicRoutes(base,makeFetch((p,b)=>new Response(b.replace('const session=await requireSession()','removed'),{headers:{'content-type':'text/html'}})))));
await test('Missing approved calendar fix is a failure',()=>assert.rejects(auditPublicRoutes(base,makeFetch((p,b)=>new Response(b.replace('EZFIX_CALENDAR_OVERLAPS_V1','removed'),{headers:{'content-type':'text/html'}})))));
await test('Non-HTML response is a failure',()=>assert.rejects(auditPublicRoutes(base,makeFetch((p,b)=>new Response(b,{headers:{'content-type':'text/plain'}})))));
await test('Credential-bearing origin is rejected without a request',()=>assert.rejects(auditPublicRoutes('https://user:secret@example.test/',()=>assert.fail('unexpected request'))));
await test('Query-bearing origin is rejected without a request',()=>assert.rejects(auditPublicRoutes('https://example.test/?token=secret',()=>assert.fail('unexpected request'))));
console.log(`Public route guard tests: ${passed}/${passed} PASS`);
