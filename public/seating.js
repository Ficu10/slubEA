(function(){
  // Clean, self-contained seating UI
  const hall = document.getElementById('hall');
  const searchInput = document.getElementById('searchInput');
  const searchSuggestions = document.getElementById('searchSuggestions');
  const searchBtn = document.getElementById('searchBtn');
  const clearBtn = document.getElementById('clearBtn');
  const controls = document.querySelector('.seating-controls');

  const seatingKey = 'wesele_seating_v1';
  const API_BASE = window.API_URL || '';

  let positions = [];
  let assignments = {};
  let drawings = [];
  let avatarScale = 100; // percent (50-200)
  let history = { past: [], future: [] };
  let snapToGrid = false;

  // default template (used if server has none)
  const defaultPositions = [
    { x:20,y:30,size:14,shape:'circle' },{ x:50,y:30,size:14,shape:'circle' },{ x:80,y:30,size:14,shape:'circle' },
    { x:20,y:55,size:14,shape:'circle' },{ x:50,y:55,size:14,shape:'circle' },{ x:80,y:55,size:14,shape:'circle' },
    { x:20,y:80,size:14,shape:'circle' },{ x:50,y:80,size:14,shape:'circle' },{ x:80,y:80,size:14,shape:'circle' },
  ];

  // UTIL
  function isAdmin(){ return !!localStorage.getItem('adminToken'); }
  function saveLocal(){ localStorage.setItem(seatingKey, JSON.stringify({ positions, assignments, drawings, avatarScale })); }

  async function loadFromServer(){
    try{
      const res = await fetch(API_BASE + '/api/seating');
      if (!res.ok) throw new Error('no-server');
      const json = await res.json();
      positions = json.positions && json.positions.length ? json.positions : defaultPositions.slice();
      assignments = json.assignments || {};
      drawings = json.drawings || [];
      avatarScale = json.avatarScale || avatarScale;
      return;
    }catch(e){
      // fallback to localStorage
      try{ const s = localStorage.getItem(seatingKey); if (s){ const j = JSON.parse(s); positions = j.positions || defaultPositions.slice(); assignments = j.assignments || {}; drawings = j.drawings || []; avatarScale = j.avatarScale || avatarScale; return; } }catch(_){ }
      positions = defaultPositions.slice(); assignments = {}; drawings = [];
    }
  }
  function undo(){ if (!history.past.length) return; const cur = { positions: JSON.parse(JSON.stringify(positions)), assignments: JSON.parse(JSON.stringify(assignments)), drawings: JSON.parse(JSON.stringify(drawings)), avatarScale }; history.future.push(cur); const prev = history.past.pop(); positions = prev.positions; assignments = prev.assignments; drawings = prev.drawings; avatarScale = prev.avatarScale || avatarScale; saveToServer(); renderAll(); }

  function redo(){ if (!history.future.length) return; const cur = { positions: JSON.parse(JSON.stringify(positions)), assignments: JSON.parse(JSON.stringify(assignments)), drawings: JSON.parse(JSON.stringify(drawings)), avatarScale }; history.past.push(cur); const nx = history.future.pop(); positions = nx.positions; assignments = nx.assignments; drawings = nx.drawings; avatarScale = nx.avatarScale || avatarScale; saveToServer(); renderAll(); }

  // Rendering
  function clearHall(){ hall.innerHTML = '<div class="hall-label">Sala weselna</div>'; }

  function renderAll(){
    clearHall();
    positions.forEach((p, i) => renderTable(i, p));
    drawAllStrokes();
    adjustHallPadding();
  }

  // Adjust hall padding so the visible area expands/shrinks to include tables + margin
  function adjustHallPadding(){
    if (!positions || !positions.length) return;
    let minX=100, minY=100, maxX=0, maxY=0;
    for(const p of positions){ const x = Number(p.x)||0; const y = Number(p.y)||0; minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); }
    const base = 6; // base padding percent
    // compute per-side padding: increase if tables are nearer to the edge, decrease if centered
    const padLeft = Math.max(2, Math.round(base + Math.max(0, base - minX)));
    const padTop = Math.max(2, Math.round(base + Math.max(0, base - minY)));
    const padRight = Math.max(2, Math.round(base + Math.max(0, maxX - (100 - base))));
    const padBottom = Math.max(2, Math.round(base + Math.max(0, maxY - (100 - base))));
    hall.style.paddingTop = padTop + '%'; hall.style.paddingRight = padRight + '%'; hall.style.paddingBottom = padBottom + '%'; hall.style.paddingLeft = padLeft + '%';
  }

  function renderTable(index, p){
    const id = 't' + (index+1);
    const el = document.createElement('div');
    el.className = 'table';
    el.dataset.index = index;
    el.id = id;
    // size: use percentage width/height for responsiveness
    if (p.shape === 'rect'){
      el.classList.add('rect');
      el.style.width = (p.w||28) + '%';
      el.style.height = (p.h||16) + '%';
      el.style.borderRadius = p.radius?'12px':'12px';
    } else {
      // compute pixel size so circles stay perfect even when hall is tall
      try{
        const hallRect = hall.getBoundingClientRect();
        const basePct = p.size || 14; // percent relative to hall min dimension
        const sizePx = Math.round((basePct/100) * Math.min(Math.max(60, hallRect.width), Math.max(60, hallRect.height)));
        el.style.width = sizePx + 'px';
        el.style.height = sizePx + 'px';
        el.style.borderRadius = '50%';
      }catch(e){ // fallback to percent-based sizing
        el.style.width = (p.size||14) + '%'; el.style.aspectRatio = '1 / 1'; el.style.borderRadius = '50%';
      }
    }
    el.style.left = p.x + '%'; el.style.top = p.y + '%';
    el.style.position = 'absolute';
    el.style.transform = 'translate(-50%,-50%)';
    el.style.display = 'flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center';
    el.style.boxSizing = 'border-box';
    el.style.border = '3px solid var(--green)';
    // center label: show table label (or index) in the middle of the table
    const lbl = document.createElement('div'); lbl.className = 'num'; lbl.style.pointerEvents='none'; lbl.textContent = p.label || (index+1);
    el.appendChild(lbl);

    // person icons
    renderPeople(el, 't'+(index+1));

    // events
    el.addEventListener('click', (e)=>{ if (e.defaultPrevented) return; selectTable(index, el); });

    // drag
    makeDraggable(el, index);

    hall.appendChild(el);
  }

  function renderPeople(tableEl, tableId){
    // remove existing persons
    Array.from(tableEl.querySelectorAll('.person')).forEach(n=>n.remove());
    const arr = assignments[tableId] || [];
    if (!arr.length) return;
    const count = arr.length;
    const distance = 60; // percent from center
    for(let i=0;i<count;i++){
      const angle = (i / count) * Math.PI * 2 - Math.PI/2;
      const defaultCx = 50 + Math.cos(angle) * distance;
      const defaultCy = 50 + Math.sin(angle) * distance;
      const person = document.createElement('div'); person.className = 'person';
      // compute avatar size based on table size (percent) and global avatarScale
      let computedSize = 36;
      try{
        const idx = parseInt((tableId||'t1').replace('t',''),10) - 1;
        const p = positions[idx] || {};
        const tablePct = p.shape === 'rect' ? (p.w || 28) : (p.size || 14);
        const hallRect = hall.getBoundingClientRect();
        const tablePx = (hallRect.width || 300) * (tablePct / 100);
        computedSize = Math.round(Math.max(24, Math.min(160, tablePx * 0.32 * (avatarScale/100))));
      }catch(e){}
      Object.assign(person.style, { position:'absolute', transform:'translate(-50%,-50%)', width: computedSize + 'px', height: computedSize + 'px', borderRadius:'50%', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 2px rgba(0,0,0,0.12)', cursor:'pointer', border:'1px solid rgba(0,0,0,0.06)'});
      const item = arr[i] || '';
      const name = (typeof item === 'string')? item : (item && item.name) || '';
      const initials = (name.split(' ').map(s=>s[0]||'').slice(0,2).join('').toUpperCase()) || 'G';
      person.dataset.idx = i; person.dataset.table = tableId;
      person.title = name;
      // determine position: if person has saved pos use it, otherwise compute circular layout
      const savedPos = (item && item.pos) || null;
      const posX = savedPos ? savedPos.x : defaultCx;
      const posY = savedPos ? savedPos.y : defaultCy;
      person.style.left = posX + '%'; person.style.top = posY + '%';
      // avatar image if present
      const avatarObj = (item && item.avatar) || null;
      if (avatarObj){
        const img = document.createElement('img'); img.alt = name; Object.assign(img.style,{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }); person.appendChild(img);
        // set placeholder initials until we resolve URL
        img.src = '';
        ensureAvatarUrl(avatarObj).then(url=>{ if (url) img.src = url; else img.remove(); }).catch(()=>{ img.remove(); });
      } else {
        person.textContent = initials;
      }
      const label = document.createElement('div'); label.className = 'person-label'; label.textContent = name; label.style.display='none';
      person.addEventListener('mouseenter', ()=> label.style.display = 'block');
      person.addEventListener('mouseleave', ()=> label.style.display = 'none');
      // click/edit handler - guard against clicks caused by dragging
      person.addEventListener('click', (ev)=>{ if (person._moved){ person._moved = false; ev.stopPropagation(); return; } ev.stopPropagation(); onPersonClick(tableId, i); });

      // dragging persons: allow moving between tables (admin only)
      person.addEventListener('pointerdown', (e)=>{
        if (!isAdmin()) return; e.stopPropagation(); e.preventDefault();
        const origTableId = tableId; const origIndex = i;
        const origParent = person.parentElement;
        const parentRect = origParent.getBoundingClientRect();
        const hallRect = hall.getBoundingClientRect();
        const startLeftPct = parseFloat(person.style.left) || 50;
        const startTopPct = parseFloat(person.style.top) || 50;
        const startX = parentRect.left + (startLeftPct/100) * parentRect.width;
        const startY = parentRect.top + (startTopPct/100) * parentRect.height;
        const pointerOffsetX = e.clientX - startX;
        const pointerOffsetY = e.clientY - startY;
        // move element to hall for free dragging
        document.body.style.userSelect = 'none';
        hall.appendChild(person);
        // set initial position relative to hall
        try{
          const curLeftPct = ((startX - hallRect.left) / hallRect.width) * 100;
          const curTopPct = ((startY - hallRect.top) / hallRect.height) * 100;
          person.style.left = Math.max(0, Math.min(100, curLeftPct)) + '%';
          person.style.top = Math.max(0, Math.min(100, curTopPct)) + '%';
        }catch(e){}
        let moving = true; let moved = false; let currentTarget = null;
        const onMove = (ev)=>{
          if (!moving) return;
          const rectNow = hall.getBoundingClientRect();
          // detect table under pointer
          const elAt = document.elementFromPoint(ev.clientX, ev.clientY);
          const possibleTable = elAt && elAt.closest ? elAt.closest('.table') : null;
          if (possibleTable !== currentTarget){ if (currentTarget) currentTarget.classList.remove('drag-over'); currentTarget = possibleTable; if (currentTarget) currentTarget.classList.add('drag-over'); }
          if (currentTarget){
            // compute pointer-relative position inside the hovered table
            const tRect = currentTarget.getBoundingClientRect();
            const relXpx = ev.clientX - tRect.left - pointerOffsetX;
            const relYpx = ev.clientY - tRect.top - pointerOffsetY;
            const px = Math.max(0, Math.min(100, (relXpx / tRect.width) * 100));
            const py = Math.max(0, Math.min(100, (relYpx / tRect.height) * 100));
            // convert that table-relative percent into hall percent so person appears inside table
            const hallXpx = (tRect.left - rectNow.left) + (px/100) * tRect.width;
            const hallYpx = (tRect.top - rectNow.top) + (py/100) * tRect.height;
            const hallPctX = (hallXpx / rectNow.width) * 100;
            const hallPctY = (hallYpx / rectNow.height) * 100;
            person.style.left = hallPctX + '%'; person.style.top = hallPctY + '%';
          } else {
            const relX = ((ev.clientX - rectNow.left - pointerOffsetX) / rectNow.width) * 100;
            const relY = ((ev.clientY - rectNow.top - pointerOffsetY) / rectNow.height) * 100;
            const clampedX = Math.max(0, Math.min(100, relX));
            const clampedY = Math.max(0, Math.min(100, relY));
            person.style.left = clampedX + '%'; person.style.top = clampedY + '%';
          }
          moved = true;
        };
        const onUp = async (ev)=>{
          moving = false; document.body.style.userSelect = 'auto'; document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
          if (!moved) return;
          person._moved = true;
          // prefer the currentTarget (hovered during drag) to elementFromPoint
          const dropEl = document.elementFromPoint(ev.clientX, ev.clientY);
          const probeTable = dropEl && dropEl.closest ? dropEl.closest('.table') : null;
          const targetTable = currentTarget || probeTable;
          const srcList = assignments[origTableId] ? assignments[origTableId].slice() : [];
          const item = srcList[origIndex];
          // remove original (best-effort)
          if (srcList && srcList.length){
            if (typeof item === 'object' && item && item.name && srcList[origIndex] && ((typeof srcList[origIndex] === 'string' && srcList[origIndex] === item.name) || (srcList[origIndex].name === item.name))){
              srcList.splice(origIndex,1);
            } else if (srcList[origIndex] && srcList[origIndex] === item){
              srcList.splice(origIndex,1);
            } else {
              for(let k=0;k<srcList.length;k++){ const it = srcList[k]; const nm = typeof it==='string'? it : (it && it.name); const iname = typeof item==='string'? item : (item && item.name); if (nm === iname){ srcList.splice(k,1); break; } }
            }
            if (srcList.length) assignments[origTableId] = srcList; else delete assignments[origTableId];
          }
          if (currentTarget && currentTarget.id) {
            // ensure we remove highlight
            currentTarget.classList.remove('drag-over');
          }
          if (targetTable && targetTable.id){
            const tRect = targetTable.getBoundingClientRect();
            const relXpx = ev.clientX - tRect.left - pointerOffsetX;
            const relYpx = ev.clientY - tRect.top - pointerOffsetY;
            const px = Math.max(0, Math.min(100, (relXpx / tRect.width) * 100));
            const py = Math.max(0, Math.min(100, (relYpx / tRect.height) * 100));
            const newKey = targetTable.id;
            const list = assignments[newKey] || [];
            let newItem;
            if (typeof item === 'string') newItem = { name: item, pos: { x: px, y: py } };
            else { newItem = JSON.parse(JSON.stringify(item || {})); newItem.pos = { x: px, y: py }; }
            list.push(newItem); assignments[newKey] = list;
          } else {
            // restore to original table at drop position relative to original parent
            const tRect = origParent.getBoundingClientRect();
            const relXpx = ev.clientX - tRect.left;
            const relYpx = ev.clientY - tRect.top;
            const px = Math.max(0, Math.min(100, (relXpx / tRect.width) * 100));
            const py = Math.max(0, Math.min(100, (relYpx / tRect.height) * 100));
            const restoreList = assignments[origTableId] || [];
            let restoredItem;
            if (typeof item === 'string') restoredItem = { name: item, pos: { x: px, y: py } };
            else restoredItem = JSON.parse(JSON.stringify(item || {})); restoredItem.pos = { x: px, y: py };
            restoreList.splice(origIndex,0,restoredItem); assignments[origTableId] = restoreList;
          }
          pushHistory(); await saveToServer(); renderAll();
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
      tableEl.appendChild(person); tableEl.appendChild(label);
    }
  }

  function onPersonClick(tableId, idx){
    // show person detail modal (includes edit controls for admin)
    showPersonModal(tableId, idx);
  }

  // Show modal listing people at a table (clicking a table shows this)
  function showTablePeopleModal(index){
    const tableId = 't'+(index+1);
    const arr = assignments[tableId] || [];
    const modal = document.createElement('div'); Object.assign(modal.style,{ position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:20000 });
    const box = document.createElement('div'); Object.assign(box.style,{ background:'#fff', padding:'12px', borderRadius:'8px', minWidth:'320px', maxWidth:'720px', maxHeight:'80vh', overflow:'auto' });
    const title = document.createElement('div'); title.textContent = 'Przy ' + tableId + ' siedzą:'; title.style.fontWeight='700'; title.style.marginBottom='8px';
    const grid = document.createElement('div'); Object.assign(grid.style,{ display:'flex',flexWrap:'wrap',gap:'10px' });
    arr.forEach((it, i)=>{
      const item = typeof it === 'string'? { name: it } : it || { name: '' };
      const card = document.createElement('div'); Object.assign(card.style,{ width:'96px', textAlign:'center', cursor:'pointer' });
      const av = document.createElement('div'); Object.assign(av.style,{ width:'72px', height:'72px', margin:'0 auto 6px', borderRadius:'50%', overflow:'hidden', background:'#eee', display:'flex',alignItems:'center',justifyContent:'center' });
      if (item.avatar){ const img = document.createElement('img'); img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover'; av.appendChild(img); ensureAvatarUrl(item.avatar).then(u=>{ if (u) img.src = u; }); } else { const initials = (item.name||'').split(' ').map(s=>s[0]||'').slice(0,2).join('').toUpperCase()||'G'; const span = document.createElement('div'); span.textContent = initials; span.style.fontWeight='700'; av.appendChild(span); }
      const nm = document.createElement('div'); nm.textContent = item.name || ''; nm.style.fontSize='13px'; nm.style.marginBottom='6px';
      card.appendChild(av); card.appendChild(nm);
      card.addEventListener('click', ()=>{ modal.remove(); showPersonModal(tableId, i); });
      grid.appendChild(card);
    });
    const btnRow = document.createElement('div'); Object.assign(btnRow.style,{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'10px' });
    const close = document.createElement('button'); close.textContent='Zamknij'; close.className='btn-outline'; close.addEventListener('click', ()=> modal.remove());
    btnRow.appendChild(close);
    if (isAdmin()){
      const add = document.createElement('button'); add.textContent='Dodaj osobę'; add.className='btn-outline'; add.style.background='var(--green)'; add.style.color='#fff'; add.addEventListener('click', ()=>{ modal.remove(); addPersonToTable(index); });
      const editTableBtn = document.createElement('button'); editTableBtn.textContent='Edytuj stolik'; editTableBtn.className='btn-outline'; editTableBtn.addEventListener('click', ()=>{ modal.remove(); showToolbarFor(document.getElementById(tableId), index); });
      btnRow.appendChild(editTableBtn); btnRow.appendChild(add);
    }
    box.appendChild(title); box.appendChild(grid); box.appendChild(btnRow); modal.appendChild(box); document.body.appendChild(modal);
  }

  // Show modal for a single person; allows viewing and editing (admin)
  function showPersonModal(tableId, idx){
    const list = assignments[tableId] || [];
    const item = list[idx]; if (!item) return;
    const person = (typeof item === 'string')? { name: item } : JSON.parse(JSON.stringify(item));
    const modal = document.createElement('div'); Object.assign(modal.style,{ position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:21000 });
    const box = document.createElement('div'); Object.assign(box.style,{ background:'#fff', padding:'14px', borderRadius:'10px', minWidth:'320px', maxWidth:'520px' });
    const imgWrap = document.createElement('div'); Object.assign(imgWrap.style,{ width:'160px', height:'160px', margin:'0 auto 10px', borderRadius:'8px', overflow:'hidden', background:'#f3f3f3', display:'flex',alignItems:'center',justifyContent:'center' });
    const img = document.createElement('img'); img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover'; if (person.avatar) ensureAvatarUrl(person.avatar).then(u=>{ if (u) img.src = u; });
    if (person.avatar) imgWrap.appendChild(img); else { const initials = (person.name||'').split(' ').map(s=>s[0]||'').slice(0,2).join('').toUpperCase()||'G'; const sp = document.createElement('div'); sp.textContent=initials; sp.style.fontSize='48px'; sp.style.fontWeight='700'; imgWrap.appendChild(sp); }
    const nameInput = document.createElement('input'); nameInput.value = person.name || ''; Object.assign(nameInput.style,{ width:'100%', padding:'8px', marginBottom:'8px' });
    const infoInput = document.createElement('textarea'); infoInput.placeholder='Informacje o osobie (np. dieta, rola)'; infoInput.value = person.info || ''; Object.assign(infoInput.style,{ width:'100%', padding:'8px', minHeight:'80px', boxSizing:'border-box' });
    const btnRow = document.createElement('div'); Object.assign(btnRow.style,{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'8px' });
    const close = document.createElement('button'); close.textContent='Zamknij'; close.className='btn-outline'; close.addEventListener('click', ()=> modal.remove());
    btnRow.appendChild(close);
    if (isAdmin()){
      const changeAvatar = document.createElement('button'); changeAvatar.textContent='Zmień awatar'; changeAvatar.className='btn-outline'; changeAvatar.addEventListener('click', async ()=>{ const f = await pickAndUploadAvatar(); if (f){ person.avatar = f; if (f.url) img.src = f.url; } });
      const save = document.createElement('button'); save.textContent='Zapisz'; save.className='btn-outline'; save.style.background='var(--green)'; save.style.color='#fff'; save.addEventListener('click', ()=>{
        // apply changes
        const listRef = assignments[tableId] || [];
        const newObj = { name: nameInput.value || '', info: infoInput.value || '' };
        if (person.avatar) newObj.avatar = person.avatar;
        const orig = listRef[idx]; if (typeof orig === 'string') listRef[idx] = newObj; else listRef[idx] = Object.assign(orig||{}, newObj);
        assignments[tableId] = listRef.length? listRef : undefined; pushHistory(); saveToServer(); renderAll(); modal.remove();
      });
      const del = document.createElement('button'); del.textContent='Usuń'; del.className='btn-outline'; del.style.background='#c0392b'; del.style.color='#fff'; del.addEventListener('click', ()=>{ if (confirm('Usunąć osobę?')){ const l = assignments[tableId] || []; l.splice(idx,1); assignments[tableId] = l.length? l : undefined; pushHistory(); saveToServer(); renderAll(); modal.remove(); } });
      btnRow.appendChild(changeAvatar); btnRow.appendChild(del); btnRow.appendChild(save);
    }
    box.appendChild(imgWrap); box.appendChild(nameInput); box.appendChild(infoInput); box.appendChild(btnRow); modal.appendChild(box); document.body.appendChild(modal);
  }

  // selection toolbar
  let selectedIndex = null;
  let toolbar = null;
  let editMode = true; // when true, clicking a table opens toolbar for editing; when false, opens add-person modal directly
  function selectTable(index, el){
    selectedIndex = index;
    if (!isAdmin()){
      // show read-only guest list for non-admins
      const key = 't'+(index+1);
      const arr = assignments[key] || [];
      const listStr = (arr||[]).map(it=> typeof it === 'string'? it : (it && it.name)).join('\n');
      alert('Przy ' + key + ' siedzą:\n\n' + (listStr || 'Pusty stolik'));
      return;
    }
    if (editMode){
      editTableModal(index, el);
    } else {
      addPersonToTable(index);
    }
    // highlight selected table visually
    try{ Array.from(document.querySelectorAll('.table')).forEach(t=>t.classList.remove('selected')); if (el && el.classList) el.classList.add('selected'); }catch(e){}
  }

  function showToolbarFor(el, index){
    removeToolbar();
    toolbar = document.createElement('div'); toolbar.id = 'tableToolbar';
    Object.assign(toolbar.style, { position:'absolute', zIndex:10000, background:'#fff', border:'1px solid #ddd', padding:'6px', borderRadius:'8px', display:'flex', gap:'6px' });
    // size controls (do not auto-close toolbar so user can see numbers)
    const inc = document.createElement('button'); inc.textContent = '+'; inc.title = 'Powiększ'; inc.className = 'btn-outline'; inc.addEventListener('click', (e)=>{ e.stopPropagation(); changeSize(index, 1.1); refreshToolbarReadout(); });
    const dec = document.createElement('button'); dec.textContent = '-'; dec.title = 'Zmniejsz'; dec.className = 'btn-outline'; dec.addEventListener('click', (e)=>{ e.stopPropagation(); changeSize(index, 0.9); refreshToolbarReadout(); });
    const sizeReadout = document.createElement('div'); sizeReadout.id = 'tableSizeReadout'; sizeReadout.style.display='flex'; sizeReadout.style.alignItems='center'; sizeReadout.style.padding='0 6px'; sizeReadout.style.fontSize='13px';
    const addP = createBtn('＋ Os.', 'Dodaj osobę', ()=> addPersonToTable(index));
    const rename = createBtn('✎N', 'Zmień nazwę stolika', ()=> renameTable(index));
    const shape = createBtn('🔄', 'Zmień kształt', ()=> toggleShape(index));
    const dup = createBtn('⧉', 'Powiel', ()=> duplicateTable(index));
    const edit = createBtn('✎', 'Edytuj osoby (lista)', ()=> editTable('t'+(index+1)));
    const del = createBtn('🗑', 'Usuń', ()=>{ if(confirm('Usunąć stolik?')){ deleteTable(index); } });
    const undoBtn = createBtn('↶', 'Cofnij', ()=>{ undo(); });
    const redoBtn = createBtn('↷', 'Ponów', ()=>{ redo(); });
    const snapBtn = createBtn('🔲', 'Snap: off', ()=>{ snapToGrid = !snapToGrid; snapBtn.textContent = snapToGrid? '🔲 On':'🔲 Off'; });
    toolbar.appendChild(undoBtn); toolbar.appendChild(redoBtn);
    toolbar.appendChild(inc); toolbar.appendChild(dec); toolbar.appendChild(sizeReadout); toolbar.appendChild(addP); toolbar.appendChild(rename);
    toolbar.appendChild(shape); toolbar.appendChild(dup); toolbar.appendChild(edit); toolbar.appendChild(del); toolbar.appendChild(snapBtn);
    document.body.appendChild(toolbar);
    // position near element
    const r = el.getBoundingClientRect(); toolbar.style.left = (r.right + 10) + 'px'; toolbar.style.top = (r.top) + 'px';
    // set initial readout
    refreshToolbarReadout();
  }

  function createBtn(text, title, onClick){ const b = document.createElement('button'); b.textContent = text; b.title = title; b.className='btn-outline'; b.addEventListener('click',(e)=>{ e.stopPropagation(); onClick(); removeToolbar(); }); return b; }
  function removeToolbar(){ if (toolbar && toolbar.parentNode) toolbar.parentNode.removeChild(toolbar); toolbar = null; selectedIndex = null; }
  document.addEventListener('click', ()=> removeToolbar());

  function getTableSizeText(idx){ const p = positions[idx] || {}; if (!p) return ''; if (p.shape === 'rect'){ return `W×H: ${p.w||28}% × ${p.h||16}%`; } else { return `Rozmiar: ${p.size||14}%`; } }
  function refreshToolbarReadout(){ try{ const el = document.getElementById('tableSizeReadout'); if (!el) return; const idx = selectedIndex !== null && selectedIndex !== undefined ? selectedIndex : null; if (idx === null) return; el.textContent = getTableSizeText(idx); }catch(e){} }

  function changeSize(index, factor){ const p = positions[index]; if (!p) return; if (p.shape==='rect'){ p.w = Math.max(6, Math.min(80, (p.w||28)*factor)); p.h = Math.max(6, Math.min(60, (p.h||16)*factor)); } else { p.size = Math.max(6, Math.min(50, (p.size||14)*factor)); } saveToServer(); renderAll(); setTimeout(()=> refreshToolbarReadout(),50); }
  function toggleShape(index){ const p = positions[index]; if (!p) return; p.shape = (p.shape==='rect')? 'circle':'rect'; // keep existing size fields
    pushHistory(); saveToServer(); renderAll(); }

  function duplicateTable(index){ const p = positions[index]; const clone = JSON.parse(JSON.stringify(p)); clone.x = Math.min(90, (p.x||50)+6); clone.y = Math.min(90, (p.y||50)+6); positions.push(clone);
    // copy assignments
    const oldKey = 't'+(index+1); const newKey = 't'+(positions.length);
    if (assignments[oldKey]) assignments[newKey] = assignments[oldKey].slice();
    pushHistory(); saveToServer(); renderAll(); }

  function addPersonToTable(index){
    const key = 't'+(index+1);
    if (!isAdmin()){ alert('Tylko admin może dodać osobę.'); return; }
    // create modal form for name + optional avatar
    const modal = document.createElement('div'); Object.assign(modal.style,{ position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:20000 });
    const box = document.createElement('div'); Object.assign(box.style,{ background:'#fff', padding:'14px', borderRadius:'10px', minWidth:'320px', boxShadow:'0 6px 30px rgba(0,0,0,0.2)' });
    const title = document.createElement('div'); title.textContent = 'Dodaj osobę'; title.style.fontWeight='700'; title.style.marginBottom='8px';
    const nameInput = document.createElement('input'); nameInput.placeholder='Imię i nazwisko'; Object.assign(nameInput.style,{ width:'100%', padding:'8px', marginBottom:'8px', boxSizing:'border-box' });
    const fileInput = document.createElement('input'); fileInput.type='file'; fileInput.accept='image/*'; fileInput.style.marginBottom='8px';
    const preview = document.createElement('div'); preview.style.marginBottom='8px';
    fileInput.addEventListener('change', ()=>{ const f = fileInput.files && fileInput.files[0]; if (!f){ preview.innerHTML=''; return; } const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.style.maxWidth='120px'; img.style.maxHeight='120px'; img.style.borderRadius='8px'; preview.innerHTML=''; preview.appendChild(img); });
    const btnRow = document.createElement('div'); btnRow.style.display='flex'; btnRow.style.gap='8px'; btnRow.style.justifyContent='flex-end';
    const cancel = document.createElement('button'); cancel.textContent='Anuluj'; cancel.className='btn-outline'; cancel.addEventListener('click', ()=> modal.remove());
    const save = document.createElement('button'); save.textContent='Zapisz'; save.className='btn-outline'; save.style.background='var(--green)'; save.style.color='#fff';
    save.addEventListener('click', async ()=>{
      const name = (nameInput.value||'').trim(); if (!name){ alert('Podaj imię'); return; }
      assignments[key] = assignments[key] || [];
      const f = fileInput.files && fileInput.files[0];
      if (f){
        const avatar = await uploadFile(f, 'avatars'); if (avatar) assignments[key].push({ name, avatar }); else assignments[key].push({ name });
      } else {
        assignments[key].push(name);
      }
      pushHistory(); saveToServer(); renderAll(); modal.remove();
    });
    btnRow.appendChild(cancel); btnRow.appendChild(save);
    box.appendChild(title); box.appendChild(nameInput); box.appendChild(fileInput); box.appendChild(preview); box.appendChild(btnRow); modal.appendChild(box); document.body.appendChild(modal);
  }

  function renameTable(index){
    if (!isAdmin()) { alert('Tylko admin może zmienić nazwę stolika.'); return; }
    const p = positions[index] || {};
    const label = prompt('Nowa nazwa stolika (etykieta):', p.label || ('Stolik ' + (index+1)));
    if (label === null) return;
    p.label = label.trim() || undefined;
    positions[index] = p;
    pushHistory(); saveToServer(); renderAll();
  }

  function deleteTable(index){ positions.splice(index,1);
    // shift assignments
    const newAssign = {};
    Object.keys(assignments).forEach(k=>{ const n = parseInt(k.replace('t',''),10); if (n <= index+1) newAssign[k] = assignments[k]; else newAssign['t'+(n-1)] = assignments[k]; });
    assignments = newAssign; pushHistory(); saveToServer(); renderAll(); }

  function editTable(tableId){ const arr = assignments[tableId] || []; if (!isAdmin()){ const listStr = (arr||[]).map(it=> typeof it === 'string'? it : (it && it.name)).join('\n'); alert('Przy ' + tableId + ' siedzą:\n' + (listStr||'Pusty stolik')); return; }
    const display = (arr||[]).map(it=> typeof it === 'string'? it : (it && it.name)).join(', ');
    const val = prompt('Wpisz imiona (oddziel przecinkami):', display); if (val === null) return; const newArr = val.split(',').map(s=>s.trim()).filter(Boolean); if (newArr.length) assignments[tableId] = newArr; else delete assignments[tableId]; saveToServer(); renderAll(); }

  // Modal to edit table properties: shape, size (circle) or w/h (rect), label, delete
  function editTableModal(index, el){
    if (!isAdmin()) return;
    const p = positions[index] || {};
    const modal = document.createElement('div'); Object.assign(modal.style,{ position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:20000 });
    const box = document.createElement('div'); Object.assign(box.style,{ background:'#fff', padding:'14px', borderRadius:'10px', minWidth:'320px', boxShadow:'0 6px 30px rgba(0,0,0,0.2)' });
    const title = document.createElement('div'); title.textContent = 'Edytuj stolik'; title.style.fontWeight='700'; title.style.marginBottom='8px';
    const labelInput = document.createElement('input'); labelInput.placeholder='Etykieta stolika'; labelInput.value = p.label || '';
    Object.assign(labelInput.style,{ width:'100%', padding:'8px', marginBottom:'8px', boxSizing:'border-box' });
    const shapeSel = document.createElement('select'); const optC = document.createElement('option'); optC.value='circle'; optC.textContent='Koło'; const optR = document.createElement('option'); optR.value='rect'; optR.textContent='Prostokąt'; shapeSel.appendChild(optC); shapeSel.appendChild(optR); shapeSel.value = p.shape || 'circle'; shapeSel.style.marginBottom='8px';
    const circleControls = document.createElement('div'); const sizeLabel = document.createElement('label'); sizeLabel.textContent='Rozmiar (%):'; const sizeInput = document.createElement('input'); sizeInput.type='range'; sizeInput.min=6; sizeInput.max=50; sizeInput.value = p.size || 14; sizeInput.style.width='100%'; circleControls.appendChild(sizeLabel); circleControls.appendChild(sizeInput);
    const rectControls = document.createElement('div'); rectControls.style.display='none'; const wLabel = document.createElement('label'); wLabel.textContent='Szerokość (%):'; const wInput = document.createElement('input'); wInput.type='number'; wInput.min=6; wInput.max=80; wInput.value = p.w || 28; wInput.style.width='100%'; const hLabel = document.createElement('label'); hLabel.textContent='Wysokość (%):'; const hInput = document.createElement('input'); hInput.type='number'; hInput.min=6; hInput.max=60; hInput.value = p.h || 16; hInput.style.width='100%'; rectControls.appendChild(wLabel); rectControls.appendChild(wInput); rectControls.appendChild(hLabel); rectControls.appendChild(hInput);
    function updateControls(){ if (shapeSel.value === 'circle'){ circleControls.style.display='block'; rectControls.style.display='none'; } else { circleControls.style.display='none'; rectControls.style.display='block'; } }
    shapeSel.addEventListener('change', updateControls); updateControls();
    const btnRow = document.createElement('div'); btnRow.style.display='flex'; btnRow.style.gap='8px'; btnRow.style.justifyContent='flex-end'; btnRow.style.marginTop='10px';
    const delBtn = document.createElement('button'); delBtn.textContent='Usuń stolik'; delBtn.className='btn-outline'; delBtn.style.background='#c0392b'; delBtn.style.color='#fff'; delBtn.addEventListener('click', ()=>{ if (confirm('Usunąć ten stolik?')){ modal.remove(); deleteTable(index); } });
    const cancel = document.createElement('button'); cancel.textContent='Anuluj'; cancel.className='btn-outline'; cancel.addEventListener('click', ()=> modal.remove());
    const save = document.createElement('button'); save.textContent='Zapisz'; save.className='btn-outline'; save.style.background='var(--green)'; save.style.color='#fff'; save.addEventListener('click', ()=>{
      p.label = (labelInput.value||'').trim() || undefined;
      p.shape = shapeSel.value;
      if (p.shape === 'circle'){ p.size = Number(sizeInput.value); } else { p.w = Number(wInput.value); p.h = Number(hInput.value); }
      positions[index] = p; pushHistory(); saveToServer(); renderAll(); modal.remove();
    });
    btnRow.appendChild(delBtn); btnRow.appendChild(cancel); btnRow.appendChild(save);
    box.appendChild(title); box.appendChild(labelInput); box.appendChild(shapeSel); box.appendChild(circleControls); box.appendChild(rectControls); box.appendChild(btnRow); modal.appendChild(box); document.body.appendChild(modal);
  }

  // helper: open file picker and upload avatar, returns { key, url } or null
  function pickAndUploadAvatar(){
    return new Promise((resolve)=>{
      const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.style.display='none'; document.body.appendChild(inp);
      inp.addEventListener('change', async ()=>{
        const f = inp.files && inp.files[0]; if (!f){ document.body.removeChild(inp); resolve(null); return; }
        try{
          const avatar = await uploadFile(f, 'avatars');
          document.body.removeChild(inp);
          resolve(avatar);
        }catch(e){ console.error('avatar upload failed', e); document.body.removeChild(inp); resolve(null); }
      });
      inp.click();
    });
  }

  // Resolve avatar object to an accessible URL. If avatar.url is already absolute, return it.
  // If only a storage key is present, request a signed URL from the server (/api/get-url).
  async function ensureAvatarUrl(avatar){
    try{
      if (!avatar) return null;
      if (avatar.url && String(avatar.url).startsWith('http')) return avatar.url;
      const key = avatar.key || avatar.url;
      if (!key) return null;
      const res = await fetch(API_BASE + '/api/get-url?key=' + encodeURIComponent(key));
      if (!res.ok) return null;
      const j = await res.json(); return j && j.url ? j.url : null;
    }catch(e){ console.error('ensureAvatarUrl failed', e); return null; }
  }

  // upload a File object to /api/upload and return { key, url } or null
  async function uploadFile(file, folder){
    try{
      const fd = new FormData(); fd.append('file', file, file.name);
      const url = API_BASE + '/api/upload' + (folder? '?folder=' + encodeURIComponent(folder) : '');
      const res = await fetch(url, { method:'POST', body: fd });
      if (!res.ok) throw new Error('upload failed');
      const j = await res.json(); const first = (j && j.files && j.files[0]) || j;
      return first && (first.url || first.key) ? { key: first.key, url: first.url || first.key } : null;
    }catch(e){ console.error('uploadFile failed', e); return null; }
  }

  // Dragging
  function makeDraggable(el, index){
    let moving = false; let start = null;
    el.addEventListener('pointerdown', (ev)=>{
      if (!isAdmin()) return; ev.preventDefault(); moving = true; start = { x: ev.clientX, y: ev.clientY }; document.body.style.userSelect='none';
      const onMove = (e)=>{ if (!moving) return; const rect = hall.getBoundingClientRect(); const dx = e.clientX - start.x; const dy = e.clientY - start.y; // compute new relative position using element center
        let centerX = ((e.clientX - rect.left) / rect.width) * 100; let centerY = ((e.clientY - rect.top) / rect.height) * 100;
        if (snapToGrid){ const grid = 2; centerX = Math.round(centerX / grid) * grid; centerY = Math.round(centerY / grid) * grid; }
        positions[index].x = Math.max(2, Math.min(98, centerX)); positions[index].y = Math.max(2, Math.min(98, centerY)); renderAll(); };
      const onUp = ()=>{ moving=false; document.body.style.userSelect='auto'; saveToServer(); document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); };
      document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
    });
  }

  // SEARCH / SUGGESTIONS
  function buildIndex(){
    const names = [];
    Object.keys(assignments).forEach(k=>{ (assignments[k]||[]).forEach(item=>{ const name = (typeof item === 'string')? item : (item && item.name); if (!name) return; names.push({ name, table:k }); }); });
    return names;
  }

  let debounceTimer = null;
  searchInput.addEventListener('input', (e)=>{
    const q = (searchInput.value||'').trim().toLowerCase(); if (!q){ searchSuggestions.style.display='none'; return; }
    clearTimeout(debounceTimer); debounceTimer = setTimeout(()=>{
      const idx = buildIndex(); const matches = idx.filter(i=> i.name.toLowerCase().includes(q)); renderSuggestions(matches.slice(0,30));
    }, 120);
  });

  function renderSuggestions(list){ searchSuggestions.innerHTML=''; if (!list.length){ searchSuggestions.style.display='none'; return; } list.forEach(item=>{
    const li = document.createElement('li'); li.style.padding='6px'; li.style.cursor='pointer'; li.textContent = item.name + ' — ' + item.table.replace('t',''); li.addEventListener('click', ()=>{ searchInput.value = item.name; searchSuggestions.style.display='none'; highlightPerson(item.name); }); searchSuggestions.appendChild(li);
  }); searchSuggestions.style.display='block'; }

  searchBtn.addEventListener('click', ()=>{ const q = (searchInput.value||'').trim(); if (!q) return; highlightPerson(q); });
  clearBtn.addEventListener('click', ()=>{ searchInput.value=''; searchSuggestions.style.display='none'; Array.from(document.querySelectorAll('.table')).forEach(t=>t.classList.remove('highlight')); document.getElementById('seatingInfo').textContent = 'Kliknij stolik, aby przypisać listę gości (oddziel przecinkami). Dane zapisywane lokalnie w przeglądarce.'; });

  function highlightPerson(name){ const all = buildIndex(); const found = all.find(i=> i.name.toLowerCase() === name.toLowerCase() || i.name.toLowerCase().includes(name.toLowerCase())); if (!found){ alert('Nie znaleziono osoby'); return; }
    // find table element
    const tname = found.table; const num = parseInt(tname.replace('t',''),10); const el = document.getElementById(tname) || document.getElementById('t'+num);
    if (el){ // highlight
      Array.from(document.querySelectorAll('.table')).forEach(t=>t.classList.remove('highlight'));
      el.classList.add('highlight'); try{ el.scrollIntoView({behavior:'smooth',block:'center',inline:'center'}); }catch(e){}
      document.getElementById('seatingInfo').textContent = `Znaleziono ${found.name} przy stoliku ${num}`;
    }
  }

  // DRAWINGS (simple persistence but optional)
  let canvas, ctx, drawing = null;
  function ensureCanvas(){ if (canvas) return;
    canvas = document.createElement('canvas'); canvas.id='seatingCanvas'; Object.assign(canvas.style,{ position:'absolute', left:0, top:0, width:'100%', height:'100%', zIndex:500, pointerEvents:'none' }); hall.appendChild(canvas); ctx = canvas.getContext('2d'); resizeCanvas(); window.addEventListener('resize', resizeCanvas);
  }
  function resizeCanvas(){ if (!canvas) return; const r = hall.getBoundingClientRect(); canvas.width = Math.round(r.width); canvas.height = Math.round(r.height); drawAllStrokes(); }
  function drawAllStrokes(){ if (!canvas) return; ctx.clearRect(0,0,canvas.width,canvas.height); for(const s of drawings){ ctx.strokeStyle = s.color||'#000'; ctx.lineWidth = s.width||3; ctx.beginPath(); for(let i=0;i<s.points.length;i++){ const [x,y] = s.points[i]; if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); } ctx.stroke(); } }

  // ADMIN: add table button
  function ensureAddButton(){ if (document.getElementById('addTableBtn')) return; const btn = document.createElement('button'); btn.id='addTableBtn'; btn.className='btn-outline'; btn.textContent='Dodaj stolik'; btn.addEventListener('click', ()=>{ if (!isAdmin()){ alert('Tylko admin może dodawać stoliki.'); return; } addTable(); }); controls.appendChild(btn); }
  function addTable(){ positions.push({ x:50, y:50, size:12, shape:'circle' }); saveToServer(); renderAll(); }

  // Avatar size control (global)
  function ensureAvatarSizeControl(){ if (document.getElementById('avatarSizeControl')) return; const wrap = document.createElement('div'); wrap.id='avatarSizeControl'; wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='8px'; wrap.style.marginLeft='6px'; const lbl = document.createElement('label'); lbl.textContent = 'Rozmiar awatarów:'; lbl.style.fontSize='13px'; const val = document.createElement('span'); val.id='avatarSizeValue'; val.textContent = avatarScale + '%'; const range = document.createElement('input'); range.type='range'; range.min='50'; range.max='200'; range.step='5'; range.value = String(avatarScale); range.style.marginLeft='6px'; range.addEventListener('input', ()=>{ avatarScale = Number(range.value); const v = document.getElementById('avatarSizeValue'); if (v) v.textContent = avatarScale + '%'; renderAll(); }); range.addEventListener('change', ()=>{ saveToServer(); pushHistory(); }); wrap.appendChild(lbl); wrap.appendChild(val); wrap.appendChild(range); // hide for non-admins
    wrap.style.display = isAdmin()? 'flex' : 'none';
    controls.appendChild(wrap);
  }



  // Edit mode toggle: when ON, clicking a table opens toolbar for editing; when OFF, clicking adds a person
  function ensureEditModeButton(){ if (document.getElementById('editModeBtn')) return; const b = document.createElement('button'); b.id='editModeBtn'; b.className='btn-outline'; b.style.marginLeft='6px'; function update(){ b.textContent = editMode? 'Tryb edycji: ON' : 'Tryb edycji: OFF'; b.title = editMode? 'Kliknij, aby przełączyć tryb (edytuj stolik)':'Kliknij, aby przełączyć tryb (dodawanie osoby)'; } b.addEventListener('click', ()=>{ editMode = !editMode; update(); }); controls.appendChild(b); update(); }

  // init
  (async function init(){ await loadFromServer(); renderAll(); ensureAddButton(); ensureAvatarSizeControl(); ensureCanvas(); })();
  // center hall in viewport on load
  try{ setTimeout(()=>{ const h = document.getElementById('hall'); if (h && h.scrollIntoView) h.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' }); }, 120); }catch(e){}
  // admin control (use regular login page link)
  // edit mode control
  ensureEditModeButton();
  // delete/shape quick buttons
  ensureDeleteAndShapeButtons();

<<<<<<< Updated upstream
=======
  // add helper buttons for delete/shape
  function ensureDeleteAndShapeButtons(){ if (document.getElementById('deleteTableBtn')) return; const del = document.createElement('button'); del.id='deleteTableBtn'; del.className='btn-outline'; del.style.marginLeft='6px'; del.textContent='Usuń stolik'; del.title='Usuń zaznaczony stolik'; del.addEventListener('click', ()=>{ if (!isAdmin()){ alert('Tylko admin może usuwać stoliki.'); return; } if (selectedIndex === null || selectedIndex === undefined){ alert('Najpierw kliknij stolik, aby go zaznaczyć.'); return; } if (confirm('Usunąć zaznaczony stolik?')){ deleteTable(selectedIndex); } }); const shap = document.createElement('button'); shap.id='toggleShapeSelected'; shap.className='btn-outline'; shap.style.marginLeft='6px'; shap.textContent='Zmień kształt'; shap.title='Zmień kształt zaznaczonego stolika'; shap.addEventListener('click', ()=>{ if (!isAdmin()){ alert('Tylko admin może zmieniać kształty.'); return; } if (selectedIndex === null || selectedIndex === undefined){ alert('Najpierw kliknij stolik, aby go zaznaczyć.'); return; } toggleShape(selectedIndex); }); controls.appendChild(del); controls.appendChild(shap); }

  // local quick-login button removed; use the main login page
  // refresh admin-only controls initial state
  if (typeof refreshAdminControls === 'function') refreshAdminControls();

  // Toggle admin-only controls visibility
  function refreshAdminControls(){ const show = isAdmin(); const ids = ['addTableBtn','editModeBtn','deleteTableBtn','toggleShapeSelected']; ids.forEach(id=>{ const el = document.getElementById(id); if (el) el.style.display = show? '' : 'none'; }); }
  // include avatar size control in admin visibility toggling
  (function(){ const orig = refreshAdminControls; refreshAdminControls = function(){ const show = isAdmin(); const ids = ['addTableBtn','editModeBtn','deleteTableBtn','toggleShapeSelected','avatarSizeControl']; ids.forEach(id=>{ const el = document.getElementById(id); if (el) el.style.display = show? '' : 'none'; }); }; })();

>>>>>>> Stashed changes
})();
