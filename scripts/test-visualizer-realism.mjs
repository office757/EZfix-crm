import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../visualizer-gallery-premium.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(source.slice(0,source.indexOf('\n(() => {',source.indexOf('})();'))),context);
const R=context.window.DoorRealism,q=[{x:12,y:18},{x:88,y:8},{x:95,y:90},{x:8,y:84}];
test('perspective maps each texture corner to the matching opening corner',()=>{
 [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const p=R.project(q,u,v);assert(Math.abs(p.x-q[i].x)<1e-9);assert(Math.abs(p.y-q[i].y)<1e-9);});
});
test('fit refuses crossed, collapsed, concave and corrupt saved openings',()=>{
 assert(R.valid(q));assert(!R.valid([q[0],q[2],q[1],q[3]]));assert(!R.valid(q.map(()=>({x:50,y:50}))));assert(!R.valid([q[0],q[1],{x:40,y:30},q[3]]));assert(!R.valid([{x:NaN,y:2},...q.slice(1)]));assert(!R.valid([{x:-1,y:2},...q.slice(1)]));
});
test('normalized opening coordinates stay aligned across export sizes',()=>{
 const d={pos:{corners:q}},small=R.corners(d,400,300),large=R.corners(d,1600,1200);small.forEach((p,i)=>{assert.equal(p.x*4,large[i].x);assert.equal(p.y*4,large[i].y);});
});
test('legacy rectangle positions retain rotation and physical aspect ratio',()=>{
 const p=R.corners({pos:{x:50,y:50,widthPct:40,rotation:0,scale:1}},1000,750,.5);assert.equal(p[1].x-p[0].x,400);assert.equal(p[3].y-p[0].y,200);
});
