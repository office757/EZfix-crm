/* Photographic door references supplied by EZfix. No manufacturer or sales SKU
 * is inferred from an installation photo. Add references to this manifest after
 * checking the opening, panel count, windows and usable source resolution. */
(() => {
  'use strict';
  const families = [
    ['square-short', 'Square Short Panel', 'Raised panels'],
    ['square-long', 'Square Long Panel', 'Raised panels'],
    ['carriage-short', 'Carriage Short Panel', 'Carriage doors'],
    ['grooved-short', 'Grooved Short Panel', 'Carriage doors'],
    ['grooved-long', 'Grooved Long Panel', 'Carriage doors'],
    ['carriage-vertical', 'Carriage Vertical Panel', 'Carriage doors'],
    ['flush', 'Flush Panel', 'Modern doors'],
    ['wood-carriage', 'Wood Carriage Panel', 'Wood doors']
  ].map(([id, label, group]) => ({id, label, group}));
  // photo, opening, family, window layout, finish, panel columns, sections,
  // clockwise opening coordinates (% of the ORIGINAL photo), window band.
  // Optional closed-top reuses this door's photographed solid second section.
  const records = [
    ['101',0,'square-short','closed','White',4,4,[10.5,22.6,90.8,22.2,86.8,66.4,14.2,66.5]],
    ['023',0,'square-short','closed','White',8,4,[19.9,36.8,81.9,37.3,81.1,73.1,20.6,71.4]],
    ['015',0,'square-short','closed','White',8,4,[13.8,32.1,71.8,32.1,71.2,78,14.3,78]],
    ['043',0,'square-short','closed','White',4,4,[21.1,16.1,87.8,16,83.9,81.8,24,82.7]],
    ['039',0,'square-short','clear','White',4,4,[15.7,42.3,46.1,42.9,45.5,74.4,15.2,73.8],[.06,.19]],
    ['039',1,'square-short','clear','White',4,4,[54.9,43.9,85.4,44.7,84.4,75.5,54.5,74.9],[.06,.19]],
    ['091',0,'square-short','grid','White',8,4,[7.8,37.1,86.6,37.8,85.8,83.6,8.1,83.1],[.065,.18]],
    ['042',0,'square-short','closed','White',4,4,[10.6,21.1,90.1,22.6,84.6,53.5,18.7,58.5]],
    ['010',0,'square-short','closed','White',4,4,[11.4,40.1,47.7,41.2,47.3,68.1,5.4,68.7]],
    ['064',0,'square-short','clear','White',4,4,[8.125,42.1667,34.25,42.1667,34.3125,73.9167,8.0625,72.4167],[.06,.19]],
    ['064',1,'square-short','clear','White',4,4,[40.625,41.6667,74.625,41.0,74.8125,77.3333,40.3125,74.6667],[.06,.19]],
    ['090',0,'square-short','clear-second','Blue',4,4,[22.2836,41.5746,75.3223,43.9917,75.5064,75.1381,18.7845,75.8978],[.285,.425]],
    ['037',0,'square-short','diamond','Green',4,4,[17.0,10.0,79.375,22.6667,74.875,79.5,21.375,91.0],[.06,.2]],
    ['062',0,'grooved-long','grid','White',2,4,[29.25,42.5,45.4,42.0,45.6,62.2,29.45,62.4],[.045,.2]],
    ['062',1,'grooved-long','grid','White',2,4,[49.8,41.6,66.75,41.1,66.9,61.45,50,61.6],[.045,.2]],
    ['040',0,'square-short','grid','White',4,4,[4.2,26.4,97.4,22.7,93.0,81.1,10.5,75.0],[.04,.205]],
    ['017',0,'square-long','clear','White',4,4,[21.3,35.8,83.1,35.5,82.2,70.6,22.3,71.8],[.055,.185]],
    ['017',0,'square-long','closed','White',4,4,[21.3,35.8,83.1,35.5,82.2,70.6,22.3,71.8],null,'closed-top'],
    ['036',0,'square-long','clear','Brown',2,4,[28.7,39.75,77.2,39.8,76.5,66.5,29.2,66.2],[.045,.2]],
    ['078',0,'square-long','double-sunburst','White',2,6,[8,6.5,81,7.8,78.7,82,8,84],[.04,.43]],
    ['140',0,'square-long','arched-grid','White',2,4,[14.1,35.3,43.2,35.4,42.8,65.5,14.1,65.6],[.055,.175]],
    ['140',1,'square-long','arched-grid','White',2,4,[52.6,35.8,80.8,36.1,80.6,65.5,52.6,65.7],[.055,.175]],
    ['035',0,'square-long','diagonal','Black',2,5,[14.1667,13.4375,89.6667,10.3125,83.8333,65.6875,17.0833,62.8125],[0.04,0.16]],
    ['057',0,'carriage-short','six-lite','White',4,4,[23,8.2,79.6,15.5,75,68,26,73],[.045,.215]],
    ['097',0,'grooved-short','six-lite','Black',4,4,[14,20,86,21,82.5,67,17.5,67],[.055,.21]],
    ['050',0,'square-short','clear','White',7,4,[6.7,26.7,83.9,26.7,83.6,66.7,8.8,75.0],[.035,.215]],
    ['047',1,'carriage-short','closed','White',4,4,[50.4,31.4,88.8,29.2,87.4,69.6,50.7,66.9]],
    ['105',0,'grooved-short','eight-lite','White',4,5,[19.7,23.7,88.6,24.8,85.2,68.1,21.5,67],[.035,.185]],
    ['107',0,'grooved-short','eight-lite','White',4,5,[14.5,20.5625,84.0833,23.8125,79.4167,68.0625,14.0833,67.0],[.035,.185]],
    ['112',0,'grooved-short','eight-lite','White',8,4,[3.25,34.6667,87.0,34.5833,85.625,78.6667,5.0625,90.0],[.04,.2]],
    ['065',0,'grooved-long','four-lite','Black',2,4,[16.8,12,83.8,13,81.9,77,20.8,79],[.055,.21]],
    ['041',0,'grooved-long','clear','Black',2,4,[6.6,41.8,44.2,42.3,44.3,79.3,7.1,79.7],[.035,.21]],
    ['041',1,'grooved-long','clear','Black',2,4,[49.3,42.8,86.8,42.7,86.8,79.3,49.2,79.6],[.035,.21]],
    ['134',0,'grooved-long','arched-grid','White',2,4,[5.5,14.2,53.1,16.5,52.6,83.8,8.1,89.4],[.06,.205]],
    ['134',1,'grooved-long','arched-grid','White',2,4,[60,17.4,95.9,19.1,94.7,79.4,59.8,83],[.06,.205]],
    ['106',0,'carriage-vertical','eight-lite','Black',4,3,[5.4,18.4,43.6,15.8,45,56.1,9.4,57.8],[.045,.225]],
    ['106',1,'carriage-vertical','eight-lite','Black',4,3,[54.5,15.6,94.1,13.3,92.8,55.2,55.7,55.5],[.045,.225]],
    ['056',0,'square-short','closed','White',4,4,[9.9167,19.375,84.9167,22.625,77.9167,68.9375,10.8333,67.1875]],
    ['118',0,'square-short','closed','White',4,4,[11.8333,22.9375,91.75,21.4375,85.5833,65.0,19.1667,65.25]],
    ['099',0,'flush','side-stack','Black',1,4,[2.6,5.5,92.8,15.9,86.8,86.1,1.4,97.8],[.05,.94]],
    ['038',0,'square-long','eight-lite','White',2,4,[13,21.5,84.6,29.2,81.2,66.9,16.3,82.8],[.04,.205]],
    ['086',0,'wood-carriage','eight-lite','Brown',4,1,[39.1,50.8,87.1,50.7,87.1,79.1,39,78.2],[.04,.27]],
    ['007',0,'square-short','clear-second','White',4,5,[22.1,41.4,77.1,44.3,75.9,75.3,18.1,76.1],[.285,.425]],
    ['139',0,'square-short','grid-second','Gray',4,5,[9,38.8,34.7,39.2,34.5,67.8,9,68],[.245,.375]],
    ['139',1,'square-short','grid-second','Gray',4,5,[42.9,39.4,66.8,39.6,66.9,67.7,42.8,67.7],[.245,.375]],
    ['139',2,'square-short','grid-second','Gray',4,5,[75.1,39.9,98.9,40,98.8,68,75,67.9],[.245,.375]],
    ['109',0,'square-short','clear','Black',4,4,[12.4309,46.4088,35.6354,44.5672,36.8094,75.9669,13.3978,74.1252],[.045,.19]],
    ['010',1,'square-short','closed','White',4,4,[55.3,41.9,87.4,42.9,91.5,67.4,57.5,68.0]],
    ['111',0,'square-short','grid','Green',4,4,[17.4033,43.9227,47.0304,43.9227,46.9613,76.7035,17.3343,76.7956],[.055,.19]],
    ['111',1,'square-short','grid','Green',4,4,[55.5939,44.4751,84.3232,44.4751,84.1851,76.7035,55.5939,76.7956],[.055,.19]]
  ];
  const layouts = {
    closed: 'Closed / no windows', clear: 'Clear rectangular windows', grid: 'Four-lite grid',
    diamond: 'Diamond inserts', diagonal: 'Diagonal inserts', 'arched-grid': 'Arched divided windows', sunburst: 'Sunburst inserts',
    'double-sunburst': 'Sunburst · two sections', 'six-lite': 'Six-lite divided windows',
    'eight-lite': 'Eight-lite divided windows', 'four-lite': 'Four vertical lites',
    'side-stack': 'Vertical side windows', 'clear-second': 'Clear windows · second section',
    'grid-second': 'Four-lite grid · second section'
  };
  const palette = [
    ['original','As photographed',''],['white','White','#eeeae4'],['black','Black','#292a2b'],
    ['charcoal','Charcoal','#505254'],['gray','Gray','#959896'],['almond','Almond','#dccfb9'],
    ['sandstone','Sandstone','#bcb09a'],['brown','Brown','#735345'],['bronze','Bronze','#625647'],
    ['navy','Navy','#354e64'],['forest','Forest green','#425541'],['red','Deep red','#803f35']
  ].map(([id,label,hex])=>({id,label,hex}));
  const sources = records.map(([photo,opening,family,layout,finish,columns,sections,xy,band,panelFill]) => ({
    id:'photo-'+photo+'-'+opening+(panelFill?'-closed':''), photoId:'installation-'+photo, opening, family, layout, finish, columns, sections,panelFill,
    url:'/assets/installation-photos/installation-'+photo+'.jpg',
    corners:Array.from({length:4},(_,i)=>({x:xy[i*2],y:xy[i*2+1]})), band,
    hardware: photo!=='097'&&(['carriage-short','grooved-short','carriage-vertical'].includes(family)||['038','062','086','106','134'].includes(photo)),
    hardwareRows:({'057':[.22,.75],'105':[.18,.74],'107':[.18,.74],'106':[.322,.682]})[photo],
    hardwareBand:photo==='106'?.014:.025,
    cut:photo==='106'?.16:0,
    colorable: family!=='wood-carriage'
  }));
  const byId=new Map(sources.map(s=>[s.id,s]));
  function isWide(s){return s.family==='wood-carriage'||s.columns>=(['square-long','grooved-long'].includes(s.family)?4:6);}
  function adaptSource(s,width){
    const wide=width>=12;if(s.family==='flush')return {...s,repeat:1,bodyScale:wide&&s.layout==='side-stack'?2:1};
    if(wide===isWide(s))return {...s,repeat:1};
    if(wide)return {...s,repeat:2,columns:s.columns*2};
    const q=s.corners,cols=Math.ceil(s.columns/2),span=cols/s.columns,corners=[[0,0],[span,0],[span,1],[0,1]].map(([u,v])=>window.DoorRealism.project(q,u,v));
    return {...s,repeat:1,columns:cols,corners,cropSpan:span};
  }
  function choice(d) {
    const family=families.find(f=>f.id===d?.photoDesignId);if(!family)return null;
    const conf=d.visualDesign||{},width=window.DoorRealism.clamp(d.customSize?d.customWidth:d.width,4,30,9),height=window.DoorRealism.clamp(d.customSize?d.customHeight:d.height,4,20,7);
    const available=sources.filter(s=>s.family===family.id);
    const selected=adaptSource(available.find(s=>s.id===conf.sourceId)||available.find(s=>isWide(s)===(width>=12))||available[0],width);
    const colors=selected.colorable?palette:[palette[0]];
    const color=colors.find(x=>x.id===conf.finish)||palette[0];
    const variants=available.map(s=>({id:s.id,label:layouts[s.layout],source:s,placement:s.layout==='closed'?'Closed':s.layout==='side-stack'?'Side':s.layout.includes('second')?'Second section':s.layout==='double-sunburst'?'Two sections':'Top'}));
    const variant=variants.find(v=>v.id===selected.id);
    return {photographic:true,f:family,p:null,panel:{id:family.id,label:family.label,variants},variant,source:selected,
      width,height,colors,color,finish:color.id,glass:null,hardware:selected.hardware?{label:'As photographed'}:null,
      key:['photo-v2',selected.id,color.id,width,height].join('|')};
  }
  function normalize(d) {
    const c=choice(d);if(!c)return null;
    d.visualDesign={type:'photographic',sourceId:c.source.id,panel:c.f.id,window:c.source.id,finish:c.finish};
    return c;
  }
  const photos=new Map(),previews=new Map(),thumbs=new Map(),rasters=new WeakMap(),surfaces=new WeakMap();
  function load(url) {
    if(!photos.has(url)){const task=window.DoorDesign.loadImage(url);photos.set(url,task);task.catch(()=>photos.delete(url));if(photos.size>8)photos.delete(photos.keys().next().value);}
    return photos.get(url);
  }
  function sample(rgba,w,h,x,y,out,i) {
    const xx=Math.max(0,Math.min(w-1,x-.5)),yy=Math.max(0,Math.min(h-1,y-.5)),ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy;
    const a=(iy*w+ix)*4,b=(iy*w+Math.min(w-1,ix+1))*4,c=(Math.min(h-1,iy+1)*w+ix)*4,d=(Math.min(h-1,iy+1)*w+Math.min(w-1,ix+1))*4;
    for(let ch=0;ch<4;ch++)out[i+ch]=rgba[a+ch]*(1-fx)*(1-fy)+rgba[b+ch]*fx*(1-fy)+rgba[c+ch]*(1-fx)*fy+rgba[d+ch]*fx*fy;
  }
  function raster(img,s) {
    let entries=rasters.get(img);if(!entries){entries=new Map();rasters.set(img,entries);}
    const key=JSON.stringify(s.corners);if(entries.has(key))return entries.get(key);
    const original=s.corners.map(p=>({x:p.x*img.naturalWidth/100,y:p.y*img.naturalHeight/100}));
    const left=Math.max(0,Math.floor(Math.min(...original.map(p=>p.x)))-2),top=Math.max(0,Math.floor(Math.min(...original.map(p=>p.y)))-2);
    const right=Math.min(img.naturalWidth,Math.ceil(Math.max(...original.map(p=>p.x)))+2),bottom=Math.min(img.naturalHeight,Math.ceil(Math.max(...original.map(p=>p.y)))+2);
    // Read only the native opening, not a full 12-megapixel house on a phone.
    const cv=document.createElement('canvas');cv.width=Math.max(1,right-left);cv.height=Math.max(1,bottom-top);const ctx=cv.getContext('2d');ctx.drawImage(img,left,top,cv.width,cv.height,0,0,cv.width,cv.height);
    const result={data:ctx.getImageData(0,0,cv.width,cv.height).data,width:cv.width,height:cv.height,q:original.map(p=>({x:p.x-left,y:p.y-top}))};entries.set(key,result);if(entries.size>4)entries.delete(entries.keys().next().value);return result;
  }
  const headerFrames={
    'photo-106-0':[[.071,.053,.419,.252],[.556,.052,.413,.252]],
    'photo-106-1':[[.058,.045,.426,.252],[.528,.047,.431,.252]]
  };
  const windowBounds={
    'photo-106-0':[[.091,.073,.363,.205],[.583,.073,.36,.205]],
    'photo-106-1':[[.09,.064,.363,.215],[.56,.064,.369,.215]]
  };
  function sourceCoordinates(s,x,v){
    const unit=(x*(s.repeat||1))%1,bodyScale=s.bodyScale||1,split=1-.3/bodyScale,sourceU=bodyScale>1?(unit<split?unit*.7/split:.7+(unit-split)*bodyScale):unit;
    const originalU=Math.max(s.cut?.04:.002,Math.min(s.cut?.96:.998,sourceU)),header=s.cut&&v<.2&&!headerFrames[s.id]?.some(([x,y,w,h])=>sourceU>=x&&sourceU<=x+w&&v>=y&&v<=y+h),u=header?.5+Math.min(.025,Math.abs(sourceU-.5)*.05):originalU;
    // Extend the photographed blank center stile across the header at the
    // same height. Preserve the native window molding and divided glass.
    return {u,v:s.panelFill==='closed-top'&&v<.25?v+.25:s.cut?Math.max(.04,v):v,originalU,blend:header?Math.min(1,(.2-v)/.08):1};
  }
  const headerPixel=new Float64Array(4);
  function sampleSource(raw,s,x,y,out,i){
    const uv=sourceCoordinates(s,x,y),p=window.DoorRealism.project(raw.q,uv.u,uv.v);sample(raw.data,raw.width,raw.height,p.x,p.y,out,i);
    if(uv.blend<1){const p=window.DoorRealism.project(raw.q,uv.originalU,uv.v);sample(raw.data,raw.width,raw.height,p.x,p.y,headerPixel,0);for(let ch=0;ch<3;ch++)out[i+ch]=out[i+ch]*uv.blend+headerPixel[ch]*(1-uv.blend);}
    // The source's white diagonal jamb can overlap the outer molding crop.
    // Remove that trim while retaining every white insert inside the glass.
    if(s.cut&&y<.2&&(out[i]+out[i+1]+out[i+2])/3>80&&!windowBounds[s.id]?.some(([u,v,w,h])=>(x*(s.repeat||1))%1>=u&&(x*(s.repeat||1))%1<=u+w&&y>=v&&y<=v+h)){const clean=window.DoorRealism.project(raw.q,.515,uv.v);sample(raw.data,raw.width,raw.height,clean.x,clean.y,out,i);}
    if(s.photoId==='installation-099'&&uv.u<.11&&y>.74&&out[i+1]>out[i]+7&&out[i+1]>out[i+2]+10){const clean=window.DoorRealism.project(raw.q,.22,uv.v);sample(raw.data,raw.width,raw.height,clean.x,clean.y,out,i);}
  }
  function rectify(img,s,maxWidth=4096,ratio,raw=raster(img,s)) {
    const q=raw.q;
    const ew=Math.max(Math.hypot(q[1].x-q[0].x,q[1].y-q[0].y),Math.hypot(q[2].x-q[3].x,q[2].y-q[3].y));
    const eh=Math.max(Math.hypot(q[3].x-q[0].x,q[3].y-q[0].y),Math.hypot(q[2].x-q[1].x,q[2].y-q[1].y));
    // Preserve both native axes. A wide door cropped to a single opening
    // must not lose half its vertical detail to a forced physical ratio.
    const nw=ew*(s.repeat||1)*(s.bodyScale||1),nh=eh,scale=Math.min(1,maxWidth/nw,maxWidth/nh,Math.sqrt(3000000/(nw*nh)));
    const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(nw*scale));cv.height=Math.max(1,Math.round(nh*scale));
    const ctx=cv.getContext('2d'),frame=ctx.createImageData(cv.width,cv.height);
    for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){
      sampleSource(raw,s,(x+.5)/cv.width,(y+.5)/cv.height,frame.data,(y*cv.width+x)*4);
    }
    ctx.putImageData(frame,0,0);return cv;
  }
  function paneRegions(s,rgba,w,h) {
    if(!s.band)return [];
    if(s.layout==='side-stack')return [0,1,2,3].map(i=>({x:1-(1-.77)/(s.bodyScale||1),y:.055+i*.231,width:.155/(s.bodyScale||1),height:.155}));
    const native=byId.get(s.id)||s,count=['carriage-short','grooved-short','carriage-vertical'].includes(s.family)?native.columns/2:native.columns;
    // A dark-pixel flood fill splits reflected sky and divided glass into
    // unrelated rectangles. Protect each complete photographed window.
    const measured={
      'photo-105-0':[[.084,0,.369,.164],[.543,0,.374,.168]],
      'photo-107-0':[[.087,.022,.358,.151],[.548,.02,.365,.155]],
      'photo-057-0':[[.074,.035,.383,.171],[.511,.028,.403,.179]],
      ...windowBounds
    }[s.id];
    const start=.045,gap=.035,span=.91,width=(span-gap*(count-1))/count;
    const bands=s.layout==='double-sunburst'?[[.015,.14],[.18,.305]]:[native.band];
    const base=measured?measured.map(([x,y,width,height])=>({x,y,width,height})):bands.flatMap(([a,b])=>Array.from({length:count},(_,i)=>({x:start+i*(width+gap),y:a,width,height:b-a})));
    const crop=s.cropSpan||1,repeats=s.repeat||1;
    return Array.from({length:repeats},(_,n)=>base.filter(p=>p.x<crop).map(p=>({...p,x:(p.x/crop+n)/repeats,width:Math.min(p.width,crop-p.x)/crop/repeats}))).flat();
  }
  function protectedPixel(s,panes,x,y,lum,hardwareCutoff=80) {
    if(panes.some(p=>x>=p.x&&x<=p.x+p.width&&y>=p.y&&y<=p.y+p.height))return true;
    if(!s.hardware||lum>hardwareCutoff)return false;
    x=(x*(s.repeat||1))%1;
    return (Math.abs(x-.5)<.075&&y>.35&&y<.62)||(x<.24||x>.76)&&(s.hardwareRows||[.25,.51,.73,.91]).some(v=>Math.abs(y-v)<(s.hardwareBand||.025));
  }
  function paintProfile(rgba,w,h,c,panes,field) {
    if(c.finish==='original'||c.color.label.toLowerCase()===c.source.finish.toLowerCase())return null;
    const rgb=c.color.hex.slice(1).match(/../g).map(x=>parseInt(x,16)),targetLum=(rgb[0]+rgb[1]+rgb[2])/3,samples=[];
    for(let y=Math.floor(h*.25);y<h*.94;y+=Math.max(1,Math.floor(h/80)))for(let x=0;x<w;x+=Math.max(1,Math.floor(w/100))){const i=(y*w+x)*4,lum=(rgba[i]+rgba[i+1]+rgba[i+2])/3;if(!protectedPixel(c.source,panes,x/w,y/h,lum))samples.push(lum);}
    samples.sort((a,b)=>a-b);const base=Math.max(20,samples[Math.floor(samples.length*.78)]||200);
    return {rgb,targetLum,base,field};
  }
  function paintPixel(rgba,i,x,y,s,panes,profile){
    if(!profile)return;const lum=(rgba[i]+rgba[i+1]+rgba[i+2])/3,{rgb,targetLum,base,field}=profile;
    const broad=field?window.DoorRealism.fieldAt(field,x,y)*field.base:base;if(protectedPixel(s,panes,x,y,lum,Math.min(80,broad*.4)))return;
    if(base<110&&targetLum>base*1.4){
      // A black coat contains bright, almost colorless reflections. Scaling
      // those by white albedo turns its subtle grain into clipped stripes.
      // Change the diffuse coat while retaining bounded photographed relief.
      const diffuse=Math.max(.025,broad/base),detail=(lum-broad)*Math.min(1.5,targetLum/base);
      for(let ch=0;ch<3;ch++)rgba[i+ch]=Math.max(0,rgb[ch]*diffuse+detail);
      return;
    }
    const shade=Math.max(.025,Math.min(1.3,lum/base));
    // Dielectric highlights survive a dark coat. Multiplying every bright
    // bevel by black albedo erased the photographed relief and satin finish.
    const spec=Math.max(0,lum-base)*(.18+.75*(1-targetLum/255)),relief=Math.max(0,lum-broad)*.55*(1-targetLum/255);
    for(let ch=0;ch<3;ch++)rgba[i+ch]=Math.max(0,rgb[ch]*shade+Math.max(spec,relief));
  }
  function paint(rgba,w,h,c,panes,profile=paintProfile(rgba,w,h,c,panes)) {
    if(!profile)return;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      paintPixel(rgba,(y*w+x)*4,(x+.5)/w,(y+.5)/h,c.source,panes,profile);
    }
  }
  async function prepare(d) {
    const c=normalize(d);if(!c)return null;if(d.designPreview?.key===c.key)return d.designPreview;
    let task=previews.get(c.key);
    if(!task){task=(async()=>{
      const img=await load(c.source.url),raw=raster(img,c.source),cv=rectify(img,c.source,4096,undefined,raw),ctx=cv.getContext('2d');
      const frame=ctx.getImageData(0,0,cv.width,cv.height),panes=paneRegions(c.source,frame.data,cv.width,cv.height);
      const small=document.createElement('canvas');small.width=Math.min(256,cv.width);small.height=Math.max(1,Math.round(small.width*cv.height/cv.width));small.getContext('2d').drawImage(cv,0,0,small.width,small.height);
      const material=window.DoorRealism.lightingField(small,panes),painting=paintProfile(frame.data,cv.width,cv.height,c,panes,material);
      paint(frame.data,cv.width,cv.height,c,panes,painting);ctx.putImageData(frame,0,0);
      const preview={key:c.key,url:cv.toDataURL('image/png'),label:[c.f.label,c.variant.label,c.color.label].join(' · '),photographic:true,
        sourceId:c.source.id,sourcePhotoUrl:c.source.url,sourceCorners:c.source.corners,sourceFinish:c.source.finish,sourceMaterial:c.source.colorable?'painted-steel':'wood',
        originalFinish:c.finish==='original'||c.color.label.toLowerCase()===c.source.finish.toLowerCase(),nativeGeometry:(c.source.repeat||1)===1&&(c.source.bodyScale||1)===1&&!c.source.panelFill,glassRegions:panes,columns:c.source.columns,sections:c.source.sections,nativeWidth:cv.width,nativeHeight:cv.height};
      // Non-serialized native pixels let the compositor sample the original
      // photograph once, instead of rectifying then blurring it a second time.
      surfaces.set(preview,{raw,source:c.source,panes,painting,material});return preview;
    })();previews.set(c.key,task);task.catch(()=>previews.delete(c.key));if(previews.size>12)previews.delete(previews.keys().next().value);}
    const preview=await task;if(choice(d)?.key===c.key)d.designPreview=preview;return preview;
  }
  async function thumbnail(id) {
    if(!byId.has(id))return '';let task=thumbs.get(id);
    if(!task){const s=byId.get(id);task=load(s.url).then(img=>rectify(img,s,360).toDataURL('image/jpeg',.9));thumbs.set(id,task);task.catch(()=>thumbs.delete(id));}
    return task;
  }
  function photoTile(s,selected,idx) {
    return '<button type="button" class="vd-choice photo-reference '+(selected?'active':'')+'" aria-pressed="'+selected+'" data-photo-choice="'+s.id+'" onclick="setVisPhotoOption('+idx+',\'source\',this.dataset.photoChoice)"><img data-photo-thumb="'+s.id+'" alt="'+esc(families.find(f=>f.id===s.family).label)+' · '+esc(layouts[s.layout])+'"><span>'+esc(s.finish)+' · '+s.columns+' panels × '+s.sections+' sections</span></button>';
  }
  function controls(d,idx) {
    const c=normalize(d);if(!c)return '';
    const available=sources.filter(s=>s.family===c.f.id),selected=c.source;
    const unique=[...new Set(available.map(s=>s.layout))],option=(value,label,active)=>'<option value="'+esc(value)+'" '+(active?'selected':'')+'>'+esc(label)+'</option>';
    let body=window.DoorDesign.optionSection('Windows & inserts',c.variant.label,'<select id="visWindowSelect" aria-label="Photographed windows" onchange="setVisPhotoOption('+idx+',\'layout\',this.value)">'+unique.map(l=>option(l,layouts[l],l===selected.layout)).join('')+'</select><div class="vd-choice-grid vd-windows">'+unique.map(l=>{const s=available.find(s=>s.layout===l);return '<button type="button" class="vd-choice '+(l===selected.layout?'active':'')+'" data-layout="'+l+'" aria-pressed="'+(l===selected.layout)+'" onclick="setVisPhotoOption('+idx+',\'layout\',this.dataset.layout)"><img data-photo-thumb="'+s.id+'" alt=""><span>'+esc(layouts[l])+'</span></button>';}).join('')+'</div>');
    body+=window.DoorDesign.optionSection('Color',c.finish==='original'?selected.finish+' · as photographed':c.color.label,'<select id="visColorSelect" aria-label="Door finish" onchange="setVisPhotoOption('+idx+',\'finish\',this.value)">'+c.colors.map(x=>option(x.id,x.label,x.id===c.finish)).join('')+'</select><div class="vd-choice-grid studio-color-grid">'+c.colors.map(x=>'<button type="button" class="vd-choice '+(x.id===c.finish?'active':'')+'" data-finish="'+x.id+'" aria-pressed="'+(x.id===c.finish)+'" onclick="setVisPhotoOption('+idx+',\'finish\',this.dataset.finish)"><i class="studio-color-chip" style="background:'+(x.hex||'#e0ddd6')+'"></i><span>'+esc(x.label)+'</span></button>').join('')+'</div>');
    body+=window.DoorDesign.optionSection('Photographed reference',selected.finish+' · '+selected.columns+' × '+selected.sections,'<p class="muted">Choose a real installation with the panel proportions and details you want.</p><div class="vd-choice-grid">'+available.filter(s=>s.layout===selected.layout).map(s=>photoTile(s,s.id===selected.id,idx)).join('')+'</div>');
    body+='<label class="photo-product-label"><span>Product name for estimate (optional)</span><input aria-label="Product name for estimate" maxlength="160" placeholder="Your product or manufacturer name" value="'+esc(d.productDescription||'')+'" onchange="setVisPhotoOption('+idx+',\'description\',this.value)"></label>';
    return '<section class="vd-config">'+body+'<p class="vd-disclosure">Real installation photograph. Windows, inserts and hardware appear as photographed. Painted colors are previews; confirm the supplied product and finish.</p></section>';
  }
  async function hydrate(root=document) {
    if(typeof root.querySelectorAll!=='function')return;
    const nodes=[...root.querySelectorAll('[data-photo-thumb]')];
    let next=0;await Promise.all(Array.from({length:Math.min(3,nodes.length)},async()=>{while(next<nodes.length){const img=nodes[next++];if(!img.isConnected)continue;try{const id=img.dataset.photoThumb,url=await thumbnail(id);if(img.isConnected&&img.dataset.photoThumb===id)img.src=url;}catch{if(img.isConnected)img.alt='Reference image unavailable';}}}));
  }
  function preferred(family,d,layout,house) {
    let list=sources.filter(s=>s.family===family&&(!layout||s.layout===layout));if(!list.length)return null;
    const home=house||visState.houseImage;
    const own=list.find(s=>s.photoId===home?.referenceId&&(!d.pos?.corners||s.corners.every((p,i)=>Math.hypot(p.x-d.pos.corners[i].x,p.y-d.pos.corners[i].y)<1)));
    if(own)return own;
    const wide=Number(d.customSize?d.customWidth:d.width)>=12;
    return list.find(s=>isWide(s)===wide)||list[0];
  }
  function copyDesign(from,to) {
    to.photoDesignId=from.photoDesignId;to.visualDesign={...from.visualDesign};to.productDescription=from.productDescription||'';
    to.referenceProductId='';to.modelId='';to.manufacturerId='';to.collectionKey='';to.construction='';delete to.designPreview;delete to.visualDesignOverride;
  }
  async function refresh(target) {
    render();try{await Promise.all(target.doors.slice(0,target.doorCount).map(d=>window.DoorDesign.prepare(d)));if(target===visState&&route.page==='visualizer')render();}catch(e){if(target===visState)toast(e.message,true);}
  }
  async function select(idx,family,id) {
    const d=visState.doors[idx];if(!d||!families.some(f=>f.id===family))return;
    const source=id&&byId.get(id)?.family===family?byId.get(id):preferred(family,d);if(!source)return;
    window.VisualizerEdits?.checkpoint();const target=visState;
    const fresh={photoDesignId:family,visualDesign:{sourceId:source.id,finish:'original'},productDescription:d.productDescription};copyDesign(fresh,d);
    d.realism={...d.realism,light:1,depth:0,shadows:1};
    if(visState.applyToAll)visState.doors.slice(0,visState.doorCount).forEach(x=>{if(x!==d){copyDesign(d,x);const own=preferred(family,x,source.layout);if(own)x.visualDesign.sourceId=own.id;x.realism={...x.realism,light:1,depth:0,shadows:1};}});
    if(window.__visCatalogState)window.__visCatalogState.tab='design';await refresh(target);
  }
  async function setOption(idx,key,value) {
    const d=visState.doors[idx],c=choice(d);if(!c)return;
    let selected=c.source;
    if(key==='source'){const s=byId.get(value);if(!s||s.family!==c.f.id)return;selected=s;}
    else if(key==='layout'){selected=preferred(c.f.id,d,value);if(!selected)return;}
    else if(key==='finish'){if(!c.colors.some(x=>x.id===value))return;}
    else if(key==='description'){value=String(value).slice(0,160);}
    else return;
    window.VisualizerEdits?.checkpoint();const target=visState;normalize(d);
    if(key==='source'||key==='layout')d.visualDesign.sourceId=selected.id;
    else if(key==='finish')d.visualDesign.finish=value;else d.productDescription=value;
    delete d.designPreview;normalize(d);
    if(visState.applyToAll)visState.doors.slice(0,visState.doorCount).forEach(x=>{if(x!==d){copyDesign(d,x);if(key==='layout'){const own=preferred(c.f.id,x,selected.layout);if(own)x.visualDesign.sourceId=own.id;}}});
    await refresh(target);
  }
  function description(d) {
    const c=choice(d);return c?[c.f.label,c.variant.label,c.finish==='original'?c.source.finish+' · as photographed':c.color.label+' finish',c.source.columns+' panels across',c.source.sections+' sections',c.source.hardware?'Hardware as photographed':''].filter(Boolean).join(' · '):'';
  }
  const legacy=window.DoorDesign;
  const original={};for(const key of ['choice','normalize','prepare','overlay','controls','description'])original[key]=legacy[key];
  legacy.choice=d=>d?.photoDesignId?choice(d):original.choice(d);
  legacy.normalize=d=>d?.photoDesignId?normalize(d):original.normalize(d);
  legacy.prepare=d=>d?.photoDesignId?prepare(d):original.prepare(d);
  legacy.overlay=d=>d?.photoDesignId?(choice(d)?.key===d.designPreview?.key?d.designPreview.url:''):original.overlay(d);
  legacy.controls=(d,idx)=>d?.photoDesignId?controls(d,idx):original.controls(d,idx);
  legacy.description=d=>d?.photoDesignId?description(d):original.description(d);
  window.PhotoDoor={families,sources,layouts,palette,choice,normalize,prepare,rectify,sample,raster,sampleSource,paint,paintPixel,paintProfile,paneRegions,protectedPixel,thumbnail,hydrate,preferred,copyDesign,description,isWide,adaptSource,surface:p=>surfaces.get(p)};
  window.selectVisPhotoDesign=select;window.setVisPhotoOption=setOption;
})();
