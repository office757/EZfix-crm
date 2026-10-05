import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const lock=JSON.parse(readFileSync('docs/approved-appearance-lock.json','utf8')),hash=v=>createHash('sha256').update(v).digest('hex');
for(const [path,expected] of Object.entries(lock.assets))assert.equal(hash(readFileSync(path)),expected,'Approved presentation changed: '+path);
const html=readFileSync('index.html','utf8'),shell=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
assert.equal(hash(shell),lock.staticHtmlShellSha256,'Approved static markup or inline styling changed.');
console.log(`Approved appearance: ${Object.keys(lock.assets).length} CSS/logo/icon assets and static HTML match ${lock.approvedCommit}`);
