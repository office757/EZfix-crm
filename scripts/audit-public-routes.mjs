import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Guard the clean-URL contract used by the existing sign-in iframe. */
export function auditRouteConfig(config, authShell) {
  assert.equal(config.cleanUrls, true, 'Clean URLs must remain enabled');
  const routes = (config.rewrites || []).filter(r => r.source === '/crm');
  assert.equal(routes.length, 1, 'Expected exactly one /crm rewrite');
  assert.equal(routes[0].destination, '/index', '/crm must target extensionless /index');
  assert.match(authShell, /src="\/crm"/, 'Sign-in iframe must target /crm');
  assert.ok(config.rewrites.some(r => r.source === '/' && r.destination === '/auth-shell'), 'Existing root route must remain');
  assert.ok(config.redirects.some(r => r.source === '/index.html' && r.destination === '/'), 'Legacy index redirect must remain');
  const headers = config.headers.find(r => r.source === '/(.*)')?.headers || [];
  for (const [key, value] of [['Referrer-Policy','same-origin'], ['X-Content-Type-Options','nosniff'], ['X-Frame-Options','SAMEORIGIN']]) {
    assert.ok(headers.some(h => h.key === key && h.value === value), `Required header missing: ${key}`);
  }
  return { configChecks: 9 };
}

/** GET-only route checks. This is not authenticated workflow or payment validation. */
export async function auditPublicRoutes(baseUrl, fetchImpl = globalThis.fetch) {
  const base = new URL(baseUrl);
  assert.equal(base.protocol, 'https:', 'Use an HTTPS deployment URL');
  assert.ok(!(base.username + base.password + base.search + base.hash), 'Use a plain origin, never a URL containing credentials or tokens');
  assert.ok(base.pathname === '/', 'Use the deployment origin only');
  const cases = [
    ['/', 'EZfix CRM'], ['/crm', 'EZfix CRM'], ['/crm?route_check=1', 'EZfix CRM'],
    ['/auth-shell', 'EZfix CRM — Sign in'], ['/invoice-pay', 'Invoice | EZfix Garage Doors Inc'],
    ['/estimate-sign', 'Review & Sign Estimate | EZfix Garage Doors Inc'], ['/set-password', 'Set EZfix CRM Password']
  ];
  const results = [];
  let rootHtml;
  for (const [path, title] of cases) {
    const response = await fetchImpl(new URL(path, base), { method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200, `${path} did not serve its own page (protection redirects are not a pass)`);
    assert.match(response.headers.get('content-type') || '', /text\/html/i, `${path} did not serve HTML`);
    const html = await response.text();
    assert.equal(html.match(/<title>([^<]*)<\/title>/i)?.[1], title, `${path} served the wrong page`);
    if (path === '/') rootHtml = html;
    if (path.startsWith('/crm')) assert.ok(html === rootHtml, `${path} must serve the exact current CRM, not another shell or stale copy`);
    if (title === 'EZfix CRM') {
      assert.ok(html.includes('EZFIX_CALENDAR_OVERLAPS_V1'), `${path} is missing the approved overlap fix`);
      assert.ok(html.includes('id="ezfix-calendar-premium"'), `${path} is missing the approved calendar CSS`);
      assert.match(html, /async function initDb\(\)/, `${path} is missing CRM initialization`);
      assert.match(html, /const session=await requireSession\(\)/, `${path} is missing the existing session guard`);
    }
    results.push({ path, status: response.status, title });
  }
  return { routeChecks: results.length, results };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2]) {
    const result = await auditPublicRoutes(process.argv[2]);
    result.results.forEach(r => console.log(`PASS ${r.path}: ${r.status} ${r.title}`));
    console.log(`Public route smoke: ${result.routeChecks}/${result.routeChecks} PASS (GET-only)`);
  } else {
    const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    const authShell = readFileSync(new URL('../auth-shell.html', import.meta.url), 'utf8');
    const result = auditRouteConfig(config, authShell);
    console.log(`Route configuration: ${result.configChecks}/${result.configChecks} PASS`);
  }
}
