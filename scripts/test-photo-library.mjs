import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
const source=readFileSync(new URL('../door-gallery.js',import.meta.url),'utf8');
const c={window:{},esc:String,renderGallery:()=>{},render:()=>{},galleryFilter:{},STORE:{products:[],galleryProjects:[]},getOne:()=>null};vm.createContext(c);vm.runInContext(source,c);
const photos=c.window.EZFIX_PHOTO_LIBRARY;
test('every imported photo has a working full image and thumbnail with bounded dimensions',()=>{
 assert.equal(photos.length,58);assert.equal(new Set(photos.map(p=>p.id)).size,58);for(const p of photos){assert(existsSync(new URL('..'+p.url,import.meta.url)));assert(existsSync(new URL('..'+p.thumbnail,import.meta.url)));assert(Math.max(p.width,p.height)<=1600);assert(!p.manufacturer&&!p.modelId&&!p.doorSize);}
});
test('gallery filters combine visible style, color and opening count',()=>{
 vm.runInContext("Object.assign(installationFilters,{color:'Black',style:'Carriage house',openings:'2',search:''})",c);
 const list=vm.runInContext('filteredInstallationPhotos()',c);assert(list.length>0);assert(list.every(p=>p.color==='Black'&&p.style==='Carriage house'&&p.openings===2));
 vm.runInContext("installationFilters.search='impossible-no-match'",c);assert.equal(vm.runInContext('filteredInstallationPhotos().length',c),0);
});
test('prepared opening fits correspond to the actual number of doors',()=>{
 const r={window:{}};vm.createContext(r);const src=readFileSync(new URL('../visualizer-gallery-premium.js',import.meta.url),'utf8');vm.runInContext(src.slice(0,src.indexOf('\n(() => {',src.indexOf('})();'))),r);
 for(const p of [...photos,...c.window.EZFIX_INSPIRATION_LIBRARY].filter(p=>p.corners)){assert.equal(p.corners.length,p.openings);assert(p.corners.every(q=>r.window.DoorRealism.valid(q)));}
});
test('20 distinct AI inspiration photos are bundled and gallery opens the full photo',()=>{
 const list=c.window.EZFIX_INSPIRATION_LIBRARY;assert.equal(list.length,20);assert.equal(new Set(list.map(p=>p.url)).size,20);
 for(const p of list){assert.equal(p.aiGenerated,true);assert(existsSync(new URL('..'+p.url,import.meta.url)));assert(existsSync(new URL('..'+p.thumbnail,import.meta.url)));assert(!p.modelId&&!p.manufacturer);}
 const content={innerHTML:'',insertAdjacentHTML(){}},actions={};vm.runInContext("doorGalleryState.view='inspiration'",c);c.renderGallery(content,actions);
 assert.equal((content.innerHTML.match(/View &amp; try on home/g)||[]).length,20);assert.match(content.innerHTML,/AI-generated examples/);
 let modal;const saveButton={};c.showModal=m=>modal=m;c.document={getElementById:()=>saveButton};c.window.viewInspirationPhoto(list[0].id);assert(modal.body.includes(list[0].url));assert.equal(saveButton.textContent,'Use home in Visualizer');
});
