import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const body={innerHTML:''};
let rendered=[];
const written=[];
const context=vm.createContext({
  STORE:{products:[]}, document:{getElementById:()=>body}, window:{},
  esc:value=>value, categoryIdOf:p=>p.categoryId,
  renderPickerItemList:items=>{rendered=items;return items.map(p=>p.name).join(',');},
  closeProductPicker:()=>{}, dbAdd:async(col,item)=>written.push({col,item}), logAudit:()=>{}
});
vm.runInContext([
  section('function snakeToCamel(', 'function toDbRow('),
  section('function fromDbRow(', 'function newId('),
  section('function catalogItemType(', 'function categoryIdOf('),
  section('function showRelatedLaborForProduct(', 'window.showRelatedLaborForProduct='),
  section('const CATALOG_SEED = [', 'window.seedGarageDoorCatalog =')
].join('\n'),context);
const run=code=>vm.runInContext(code,context);
const plain=value=>JSON.parse(JSON.stringify(value));
let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};

await check('Database JSON metadata survives normalization, with either key style',()=>{
  for(const extra of [{itemType:'labor',relatedLaborIds:['a']},{item_type:'labor',related_labor_ids:['a']}]){
    context.row={id:'test',taxable:true,app_data:extra};
    assert.equal(run('catalogItemType(fromDbRow(row))'),'labor');
    assert.deepEqual(plain(run('relatedLaborIdsOf(fromDbRow(row))')),['a']);
  }
});
await check('Explicit item type takes priority over tax and supports all stored shapes',()=>{
  for(const item of [{itemType:'product'},{item_type:'product'},{appData:{itemType:'product'}},{app_data:{item_type:'product'}}]){
    context.item={...item,taxable:false};
    assert.equal(run('catalogItemType(item)'),'product');
  }
  assert.equal(run('catalogItemType({taxable:false})'),'labor');
  assert.equal(run('catalogItemType({taxable:true})'),'product');
});
await check('Related labor popup uses explicit cross-category mapping and excludes unrelated or inactive items',()=>{
  context.STORE.products=[
    {id:'mapped',name:'Mapped labor',itemType:'labor',categoryId:'labor'},
    {id:'unrelated',name:'Unrelated labor',itemType:'labor',categoryId:'openers'},
    {id:'inactive',name:'Inactive labor',itemType:'labor',active:false},
    {id:'part',name:'Physical part',itemType:'product'}
  ];
  run("showRelatedLaborForProduct(fromDbRow({name:'Opener',category_id:'openers',app_data:{itemType:'product',relatedLaborIds:['mapped','inactive','part']}}))");
  assert.deepEqual(rendered.map(p=>p.id),['mapped']);
  assert.match(body.innerHTML,/Related Labor/);
});
await check('Legacy items without a mapping keep the active same-category fallback',()=>{
  run("showRelatedLaborForProduct({name:'Opener',categoryId:'openers'})");
  assert.deepEqual(rendered.map(p=>p.id),['unrelated']);
});
await check('Malformed related IDs cannot crash the picker',()=>{
  assert.deepEqual(plain(run("relatedLaborIdsOf({relatedLaborIds:'invalid'})")),[]);
  assert.deepEqual(plain(run("relatedLaborIdsOf({relatedLaborIds:[null,2,'','valid']})")),['valid']);
});
await check('Default catalog has physical-only product descriptions and explicit labor separation',()=>{
  const seed=plain(run('CATALOG_SEED'));
  assert.equal(seed.length,84);
  assert.equal(seed.filter(p=>p.itemType==='product').length,36);
  assert.equal(seed.filter(p=>p.itemType==='labor').length,48);
  for(const p of seed){
    if(p.itemType==='product'){
      assert.doesNotMatch(p.details,/\b(install\w*|labor|programming|testing|replacement service)\b/i,p.name);
      assert.ok(p.relatedLaborIds.length,p.name);
    } else assert.match(p.details,/Labor only; physical parts are separate line items\./,p.name);
  }
});
await check('Seeding keeps existing prices, assigns tax by type and never invents new prices',async()=>{
  const existing={name:'Torsion Spring Replacement',rate:325,id:'existing'};
  context.STORE.products=[existing];
  const result=plain(await run('seedGarageDoorCatalog(true)'));
  assert.deepEqual(result,{added:83,skipped:1});
  assert.deepEqual(existing,{name:'Torsion Spring Replacement',rate:325,id:'existing'});
  assert.equal(written.length,83);
  for(const {col,item} of written){
    assert.equal(col,'products');
    assert.equal(item.rate,0);
    assert.equal(item.taxable,item.itemType==='product');
    assert.ok(Array.isArray(item.relatedLaborIds));
  }
});
console.log(`Catalog labor metadata audit: ${checks}/${checks} PASS`);
