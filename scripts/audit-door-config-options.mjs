import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),ctx={window:{}};
for(const file of ['door-design-data.js','door-config-options.js'])vm.runInNewContext(readFileSync(new URL(file,root),'utf8'),ctx);
const catalog=ctx.window.DOOR_CONFIG_OPTIONS,designs=ctx.window.DOOR_DESIGN_DATA;
let panels=0,colors=0;
for(const [id,f] of Object.entries(catalog)){
 assert.equal(new URL(f.source).hostname,'www.amarr.com');
 for(const [panel,options] of Object.entries(f.panels)){
  assert.ok(designs.families[id].panels.some(x=>x.id===panel),'Known panel '+id+'/'+panel);panels++;
  assert.equal(new Set(options.colors.map(x=>x.id)).size,options.colors.length,'Unique finish choices');
  for(const c of options.colors){assert.ok(c.label);assert.ok(/^#[\da-f]{6}$/i.test(c.hex)||c.image,'Finish sample '+c.id);colors++;}
  for(const item of [...options.colors,...options.windows,...f.glass,...f.hardware])if(item.image){assert.match(item.image,/^\/assets\/door-options\/[\w.-]+$/);assert.ok(existsSync(new URL(item.image.slice(1),root)));}
 }
}
const classica=catalog['amarr-classica'].panels.tuscany;
assert.ok(classica.colors.some(x=>x.id==='black'));
assert.ok(classica.windows.some(x=>x.id==='thames'));
assert.ok(!classica.colors.some(x=>x.id==='unverified-custom-color'));
assert.ok(catalog['amarr-classica'].hardware.some(x=>x.id==='canterbury'));
assert.ok(!catalog['amarr-lincoln'].hardware.length,'Do not borrow hardware from another collection');
assert.ok(catalog['amarr-hillcrest'].panels['lp-bead-board'],'Manufacturer naming alias is resolved');
console.log(`Amarr catalog options: ${Object.keys(catalog).length} collections, ${panels} panels, ${colors} finish choices and bundled thumbnails PASS`);
