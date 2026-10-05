/* Small, dependency-free accounting exports. Customer PDFs remain server-generated. */
(function(root){
'use strict';
const date=doc=>{const payments=(doc.payments||[]).map(p=>p.date||p.at).filter(Boolean).sort();return payments.at(-1)||doc.date||doc.createdAt||'';};
const year=doc=>String(date(doc)).slice(0,4);
const csvCell=value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
const csv=rows=>'\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
const filename=doc=>'Receipt-'+String(doc.number||'invoice').replace(/[^a-zA-Z0-9._-]/g,'_')+'-'+String(doc.id).replace(/[^a-zA-Z0-9._-]/g,'_')+'.pdf';
const filter=(docs,selected,search)=>docs.filter(d=>(!selected||year(d)===String(selected))&&(!search||[d.number,d.customerName,d.customerId].join(' ').toLowerCase().includes(search.toLowerCase().trim())));
const crc=data=>{let c=0xffffffff;for(const b of data){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
function zip(entries){
 if(entries.length>65535)throw new Error('Too many files for one archive.');
 const chunks=[],central=[];let offset=0,size=0;const encoder=new TextEncoder();
 for(const entry of entries){
  const name=encoder.encode(entry.name),data=entry.data;
  if(!(data instanceof Uint8Array)||data.length>0xffffffff||offset+data.length>0xffffffff)throw new Error('Archive is too large.');
  const checksum=crc(data),header=new Uint8Array(30+name.length),v=new DataView(header.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);header.set(name,30);
  const directory=new Uint8Array(46+name.length),d=new DataView(directory.buffer);
  d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,checksum,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);directory.set(name,46);
  chunks.push(header,data);central.push(directory);offset+=header.length+data.length;size+=directory.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
 return new Blob([...chunks,...central,end],{type:'application/zip'});
}
const api={date,year,csv,filename,filter,zip};root.ReceiptArchiveUtils=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
