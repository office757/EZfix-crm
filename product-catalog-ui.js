(() => {
  'use strict';
  const baseRenderProductPicker = renderProductPicker;
  const dataOf = p => p?.appData && typeof p.appData === 'object' ? p.appData : (p?.app_data && typeof p.app_data === 'object' ? p.app_data : {});
  const valueOf = (p,key) => p?.[key] ?? dataOf(p)?.[key] ?? '';
  const normalizeCatalogText = value => String(value ?? '').toLowerCase().replace(/[×x]/g,' ').replace(/["']/g,' ').replace(/[^a-z0-9.]+/g,' ').replace(/\s+/g,' ').trim();
  const searchTokens = value => normalizeCatalogText(value).split(' ').filter(Boolean);
  const productHaystack = p => normalizeCatalogText([
    p.name,p.details,p.category,p.manufacturer,p.model,p.sku,
    valueOf(p,'collection'),valueOf(p,'series'),valueOf(p,'modelNumber'),valueOf(p,'productName'),
    valueOf(p,'material'),valueOf(p,'construction'),valueOf(p,'insulationType'),valueOf(p,'panelStyle'),
    valueOf(p,'fullSize'),valueOf(p,'wireSize'),valueOf(p,'insideDiameter'),valueOf(p,'length'),
    valueOf(p,'weightRating'),valueOf(p,'colorCode'),valueOf(p,'doorHeight')
  ].filter(v=>v!==null&&v!=='').join(' '));
  const matchesSearch = (p,query) => {
    const tokens=searchTokens(query);
    if(!tokens.length) return true;
    const hay=productHaystack(p);
    return tokens.every(t=>hay.includes(t));
  };
  const uniq = values => [...new Set(values.filter(v=>v!==null&&v!==undefined&&String(v).trim()!==''))];
  const numSort = (a,b) => Number(a)-Number(b);
  const optionList = (values,current,label,formatter=v=>v) => '<option value="">'+label+'</option>'+values.map(v=>'<option value="'+esc(String(v))+'" '+(String(current||'')===String(v)?'selected':'')+'>'+esc(formatter(v))+'</option>').join('');
  const backButton = onclick => '<button class="btn btn-sm" style="margin-bottom:10px" onclick="'+onclick+'">← Back</button>';
  const resultCount = (shown,total) => '<div class="muted" style="font-size:11px;margin:0 0 10px">'+total.toLocaleString()+' match'+(total===1?'':'es')+(shown<total?' · showing first '+shown.toLocaleString():'')+'</div>';
  function renderDoorCard(p){
    const image=valueOf(p,'imageUrl'), collection=valueOf(p,'collection'), model=valueOf(p,'modelNumber')||p.model||'', rv=valueOf(p,'rValue'), material=valueOf(p,'material'), construction=valueOf(p,'construction'), official=valueOf(p,'officialUrl');
    const short=valueOf(p,'description')||p.details||'';
    return '<article class="picker-card gd-catalog-card" onclick="pickItemFromPicker(\''+esc(p.id)+'\')">'+
      (image?'<img class="gd-catalog-image" loading="lazy" src="'+esc(image)+'" alt="'+esc(p.name)+'">':'<div class="gd-catalog-image gd-catalog-placeholder">Garage Door</div>')+
      '<div class="gd-catalog-main"><div class="picker-card-top"><b>'+esc(p.manufacturer||'Garage Door')+(model?' · '+esc(model):'')+'</b>'+(p.rate?'<span class="picker-card-price">'+money(p.rate)+'</span>':'<span class="picker-card-price muted">$—</span>')+'</div>'+
      '<div class="gd-catalog-name">'+esc(valueOf(p,'productName')||p.name)+'</div>'+
      '<div class="muted" style="font-size:11.5px">'+esc(collection||'')+'</div>'+
      (short?'<div class="gd-catalog-desc">'+esc(String(short).slice(0,180))+(String(short).length>180?'…':'')+'</div>':'')+
      '<div class="gd-spec-chips">'+(rv!==''&&rv!==null?'<span>R-'+esc(rv)+'</span>':'')+(material?'<span>'+esc(material)+'</span>':'')+(construction?'<span>'+esc(construction)+'</span>':'')+'</div>'+
      '<div class="picker-card-bottom">'+(official?'<a href="'+esc(official)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">Official product</a>':'<span></span>')+'<button class="btn btn-sm" onclick="event.stopPropagation();pickItemFromPicker(\''+esc(p.id)+'\')">+ Add</button></div></div></article>';
  }
  function renderGarageDoors(body,activeProducts){
    const products=activeProducts.filter(p=>valueOf(p,'catalogKind')==='garage_door_model');
    const makers=uniq(products.map(p=>p.manufacturer)).sort();
    const maker=pickerState.doorManufacturer||'', query=pickerState.search||'';
    const collections=uniq(products.filter(p=>!maker||p.manufacturer===maker).map(p=>valueOf(p,'collection'))).sort();
    if(pickerState.doorCollection && !collections.includes(pickerState.doorCollection)) pickerState.doorCollection='';
    const filtered=products.filter(p=>(!maker||p.manufacturer===maker)&&(!pickerState.doorCollection||valueOf(p,'collection')===pickerState.doorCollection)&&matchesSearch(p,query))
      .sort((a,b)=>String(a.manufacturer||'').localeCompare(String(b.manufacturer||''))||String(valueOf(a,'collection')).localeCompare(String(valueOf(b,'collection')))||String(a.model||a.name||'').localeCompare(String(b.model||b.name||'')));
    const shown=filtered.slice(0,120);
    body.innerHTML=backButton("pickerState.view='categories';pickerState.categoryId=null;pickerState.search='';renderProductPicker()")+
      '<div class="catalog-special-head"><div><h3>Garage Doors</h3><div class="muted">Search current verified residential models</div></div></div>'+
      '<div class="search-box" style="margin:12px 0"><input id="pickerSearchInput" placeholder="Search Garage Doors" value="'+esc(query)+'" oninput="pickerState.search=this.value;renderProductPickerKeepFocus()"></div>'+
      '<div class="catalog-filter-row"><select onchange="pickerState.doorManufacturer=this.value;pickerState.doorCollection=\'\';renderProductPicker()">'+optionList(makers,maker,'All manufacturers')+'</select>'+
      '<select onchange="pickerState.doorCollection=this.value;renderProductPicker()">'+optionList(collections,pickerState.doorCollection,'All collections')+'</select></div>'+
      resultCount(shown.length,filtered.length)+shown.map(renderDoorCard).join('')+pickerCustomItemButton();
  }
  function renderSpringHome(body){
    const active=STORE.products.filter(p=>p.active!==false&&valueOf(p,'catalogKind')==='spring_size');
    const torsion=active.filter(p=>valueOf(p,'springType')==='torsion'&&!valueOf(p,'sizeOptional')).length;
    const extension=active.filter(p=>valueOf(p,'springType')==='extension'&&!valueOf(p,'sizeOptional')).length;
    body.innerHTML=backButton("pickerState.view='categories';pickerState.categoryId=null;renderProductPicker()")+
      '<div class="catalog-special-head"><div><h3>Springs</h3><div class="muted">Exact size is optional</div></div></div>'+
      '<div class="spring-type-grid"><button class="launcher-tile" onclick="pickerState.springType=\'torsion\';pickerState.view=\'spring_sizes\';pickerState.search=\'\';renderProductPicker()"><span class="launcher-tile-emoji">🌀</span><span class="launcher-tile-label">Torsion Springs</span><span class="launcher-tile-count">'+torsion.toLocaleString()+' verified sizes</span></button>'+
      '<button class="launcher-tile" onclick="pickerState.springType=\'extension\';pickerState.view=\'spring_sizes\';pickerState.search=\'\';renderProductPicker()"><span class="launcher-tile-emoji">↔️</span><span class="launcher-tile-label">Extension Springs</span><span class="launcher-tile-count">'+extension.toLocaleString()+' verified sizes</span></button></div>';
  }
  function renderSpringCard(p,type){
    const full=valueOf(p,'fullSize')||p.details||p.model||'', unspecified=!!valueOf(p,'sizeOptional');
    let meta='';
    if(type==='torsion'&&!unspecified) meta='Wire '+valueOf(p,'wireSize')+' · ID '+valueOf(p,'insideDiameter')+'" · Length '+valueOf(p,'length')+'"';
    if(type==='extension'&&!unspecified) meta=[valueOf(p,'doorHeight')?valueOf(p,'doorHeight')+' ft door':'',valueOf(p,'weightRating')?valueOf(p,'weightRating')+' lb':'',valueOf(p,'colorCode')||'',valueOf(p,'endType')||''].filter(Boolean).join(' · ');
    return '<div class="picker-card spring-size-card" onclick="pickItemFromPicker(\''+esc(p.id)+'\')"><div class="picker-card-top"><b>'+esc(unspecified?(type==='torsion'?'Torsion Spring - Size Not Specified':'Extension Spring - Size Not Specified'):full)+'</b><span class="picker-card-price muted">$—</span></div>'+
      (meta?'<div class="muted" style="font-size:11.5px;margin-top:4px">'+esc(meta)+'</div>':'')+
      '<div class="picker-card-bottom"><span>'+esc(p.sku||'')+'</span><button class="btn btn-sm" onclick="event.stopPropagation();pickItemFromPicker(\''+esc(p.id)+'\')">+ Add</button></div></div>';
  }
  function renderSpringSizes(body,activeProducts,type){
    const products=activeProducts.filter(p=>valueOf(p,'catalogKind')==='spring_size'&&valueOf(p,'springType')===type);
    const unspecified=products.find(p=>valueOf(p,'sizeOptional'));
    const sized=products.filter(p=>!valueOf(p,'sizeOptional'));
    const query=pickerState.search||'';
    let filtered=sized.filter(p=>matchesSearch(p,query));
    let filters='';
    if(type==='torsion'){
      const wires=uniq(sized.map(p=>valueOf(p,'wireSize'))).sort(numSort), ids=uniq(sized.map(p=>valueOf(p,'insideDiameter'))).sort(numSort), lengths=uniq(sized.map(p=>valueOf(p,'length'))).sort(numSort);
      filtered=filtered.filter(p=>(!pickerState.springWire||String(valueOf(p,'wireSize'))===String(pickerState.springWire))&&(!pickerState.springId||String(valueOf(p,'insideDiameter'))===String(pickerState.springId))&&(!pickerState.springLength||String(valueOf(p,'length'))===String(pickerState.springLength)));
      filters='<div class="catalog-filter-row spring-filters"><select onchange="pickerState.springWire=this.value;renderProductPicker()">'+optionList(wires,pickerState.springWire,'Wire size',v=>Number(v).toFixed(3).replace(/^0/,''))+'</select><select onchange="pickerState.springId=this.value;renderProductPicker()">'+optionList(ids,pickerState.springId,'Inside diameter',v=>v+' in')+'</select><select onchange="pickerState.springLength=this.value;renderProductPicker()">'+optionList(lengths,pickerState.springLength,'Length',v=>v+' in')+'</select></div>';
    } else {
      const lengths=uniq(sized.map(p=>valueOf(p,'length'))).sort(numSort), weights=uniq(sized.map(p=>valueOf(p,'weightRating'))).sort(numSort), colors=uniq(sized.map(p=>valueOf(p,'colorCode'))).sort(), heights=uniq(sized.map(p=>valueOf(p,'doorHeight'))).sort(numSort);
      filtered=filtered.filter(p=>(!pickerState.extensionLength||String(valueOf(p,'length'))===String(pickerState.extensionLength))&&(!pickerState.extensionWeight||String(valueOf(p,'weightRating'))===String(pickerState.extensionWeight))&&(!pickerState.extensionColor||String(valueOf(p,'colorCode'))===String(pickerState.extensionColor))&&(!pickerState.extensionHeight||String(valueOf(p,'doorHeight'))===String(pickerState.extensionHeight)));
      filters='<div class="catalog-filter-row spring-filters"><select onchange="pickerState.extensionHeight=this.value;renderProductPicker()">'+optionList(heights,pickerState.extensionHeight,'Door height',v=>v+' ft')+'</select><select onchange="pickerState.extensionLength=this.value;renderProductPicker()">'+optionList(lengths,pickerState.extensionLength,'Spring length',v=>v+' in')+'</select><select onchange="pickerState.extensionWeight=this.value;renderProductPicker()">'+optionList(weights,pickerState.extensionWeight,'Weight rating',v=>v+' lb')+'</select><select onchange="pickerState.extensionColor=this.value;renderProductPicker()">'+optionList(colors,pickerState.extensionColor,'Color code')+'</select></div>';
    }
    const shown=filtered.slice(0,100), label=type==='torsion'?'Torsion Springs':'Extension Springs';
    body.innerHTML=backButton("pickerState.view='items';pickerState.search='';renderProductPicker()")+
      '<div class="catalog-special-head"><div><h3>'+label+'</h3><div class="muted">Select an exact size, or leave size unspecified</div></div></div>'+
      (unspecified?'<div style="margin:10px 0">'+renderSpringCard(unspecified,type)+'</div>':'')+
      '<div class="search-box" style="margin:12px 0"><input id="pickerSearchInput" placeholder="'+(type==='torsion'?'Search wire, ID, length, or full size':'Search size, length, color, weight, or SKU')+'" value="'+esc(query)+'" oninput="pickerState.search=this.value;renderProductPickerKeepFocus()"></div>'+
      filters+resultCount(shown.length,filtered.length)+shown.map(p=>renderSpringCard(p,type)).join('');
  }
  renderProductPicker = function(){
    const body=document.getElementById('pickerBody'); if(!body)return;
    const activeProducts=STORE.products.filter(p=>p.active!==false);
    if(pickerState.categoryId==='garage_doors'&&pickerState.view==='items') return renderGarageDoors(body,activeProducts);
    if(pickerState.categoryId==='springs'&&pickerState.view==='items') return renderSpringHome(body);
    if(pickerState.categoryId==='springs'&&pickerState.view==='spring_sizes') return renderSpringSizes(body,activeProducts,pickerState.springType==='extension'?'extension':'torsion');
    const term=String(pickerState.search||'').trim();
    if(term){
      const results=activeProducts.filter(p=>matchesSearch(p,term)).sort((a,b)=>(b.favorite?1:0)-(a.favorite?1:0)||String(a.name||'').localeCompare(String(b.name||'')));
      body.innerHTML='<div class="search-box" style="margin-bottom:12px"><input id="pickerSearchInput" placeholder="🔍 Search products & services..." value="'+esc(pickerState.search)+'" oninput="pickerState.search=this.value;pickerState.view=\'search\';renderProductPickerKeepFocus()"></div>'+renderPickerItemList(results.slice(0,150),'Results for "'+esc(pickerState.search)+'"')+(results.length>150?resultCount(150,results.length):'')+pickerCustomItemButton();
      return;
    }
    return baseRenderProductPicker();
  };
  window.renderProductPicker=renderProductPicker;
})();

[executed on device: DESKTOP-1E5RUBH (4ce28b28-6a84-43a7-ad22-df40b4da76cb)]