(function(){
  // Clean, self-contained seating UI
  const hall = document.getElementById('hall');
  const searchInput = document.getElementById('searchInput');
  const searchSuggestions = document.getElementById('searchSuggestions');
  const searchBtn = document.getElementById('searchBtn');
  const clearBtn = document.getElementById('clearBtn');
  function getControls(){ return document.querySelector('.seating-controls') || document.body; }

  const seatingKey = 'wesele_seating_v1';
  const API_BASE = window.API_URL || '';
  
  // Convenience restore: if the page is opened with ?restoreLocal=1
  // fetch server data and populate localStorage so users can recover
  // their seating data in browsers where localStorage is missing.
  try{
    if (location && location.search && location.search.indexOf('restoreLocal=1') >= 0){
      (async ()=>{
        try{
          const r = await fetch(API_BASE + '/api/seating');
          if (!r.ok) return;
          const j = await r.json();
          if (j && Array.isArray(j.positions) && j.positions.length){
            try{ localStorage.setItem(seatingKey, JSON.stringify({ positions: j.positions, assignments: j.assignments||{}, drawings: j.drawings||[] })); }catch(e){}
          }
        }catch(_){ }
      })();
    }
  }catch(_){ }

  let positions = [];
  let assignments = {};
  let drawings = [];
  // DEBUG: allow dragging for non-admins to help testing (set to false to require admin)
  let allowDragForGuests = true;
  let history = { past: [], future: [] };
  let snapToGrid = false;
  let editMode = 'tables'; // 'tables' or 'people'
  let hasUnsavedChanges = false;
  let saveButton = null;

  // default template (used if server has none)
  const defaultPositions = [
    { x:20,y:30,size:14,shape:'circle' },{ x:50,y:30,size:14,shape:'circle' },{ x:80,y:30,size:14,shape:'circle' },
    { x:20,y:55,size:14,shape:'circle' },{ x:50,y:55,size:14,shape:'circle' },{ x:80,y:55,size:14,shape:'circle' },
    { x:20,y:80,size:14,shape:'circle' },{ x:50,y:80,size:14,shape:'circle' },{ x:80,y:80,size:14,shape:'circle' },
  ];

  // UTIL
  function isAdmin(){ return !!localStorage.getItem('adminToken'); }
  function saveLocal(){ localStorage.setItem(seatingKey, JSON.stringify({ positions, assignments, drawings })); }
  function snapAvatarPosition(x, y){
    const grid = 10;
    return {
      x: Math.max(5, Math.min(95, Math.round(x / grid) * grid)),
      y: Math.max(5, Math.min(95, Math.round(y / grid) * grid))
    };
  }
  function updateSaveButton(){
    if (!saveButton) return;
    saveButton.disabled = !hasUnsavedChanges;
    saveButton.textContent = hasUnsavedChanges ? 'Zapisz zmiany' : 'Zapisano';
    saveButton.style.opacity = hasUnsavedChanges ? '1' : '0.65';
  }

  async function loadFromServer(){
    // Prefer local copy if it exists and has positions — this avoids accidental server wipes
    try{
      const localRaw = (()=>{ try{ return localStorage.getItem(seatingKey); }catch(e){ return null } })();
      if (localRaw){ try{ const j = JSON.parse(localRaw); if (j && Array.isArray(j.positions) && j.positions.length){ positions = j.positions; assignments = j.assignments || {}; drawings = j.drawings || []; return; } }catch(_){ /* ignore parse errors */ } }

      // otherwise try server
      const res = await fetch(API_BASE + '/api/seating');
      if (!res.ok) throw new Error('no-server');
      const json = await res.json();
      const serverPositions = (json.positions && Array.isArray(json.positions))? json.positions : [];
      positions = serverPositions && serverPositions.length ? serverPositions : defaultPositions.slice();
      assignments = json.assignments || {};
      drawings = json.drawings || [];
      return;
    }catch(e){
      // fallback to localStorage or defaults
      try{ const s = localStorage.getItem(seatingKey); if (s){ const j = JSON.parse(s); positions = j.positions || defaultPositions.slice(); assignments = j.assignments || {}; drawings = j.drawings || []; return; } }catch(_){ }
      positions = defaultPositions.slice(); assignments = {}; drawings = [];
    }
  }

  async function saveToServer(){
    const token = localStorage.getItem('adminToken');
    const body = { positions, assignments, drawings };
    if (!token){ saveLocal(); return; }
    // avoid accidentally overwriting server with empty seating (require explicit admin action)
    if (!positions || positions.length === 0){ console.warn('Not saving empty positions to server'); saveLocal(); return; }
    hasUnsavedChanges = true;
    saveLocal();
    updateSaveButton();
  }

  async function saveChanges(){
    if (!isAdmin() || !hasUnsavedChanges) return;
    const token = localStorage.getItem('adminToken');
    const body = { positions, assignments, drawings };
    try{
      saveButton.disabled = true;
      saveButton.textContent = 'Zapisywanie...';
      const response = await fetch(API_BASE + '/api/seating', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error('save_failed');
      hasUnsavedChanges = false;
      updateSaveButton();
    }catch(e){
      hasUnsavedChanges = true;
      updateSaveButton();
      alert('Nie udało się zapisać zmian. Spróbuj ponownie.');
    }
  }

  function pushHistory(){
    try{
      const snapshot = { positions: JSON.parse(JSON.stringify(positions)), assignments: JSON.parse(JSON.stringify(assignments)), drawings: JSON.parse(JSON.stringify(drawings)) };
      history.past.push(snapshot); if (history.past.length > 60) history.past.shift(); history.future = [];
    }catch(e){ console.warn('history push failed', e); }
  }

  function undo(){ if (!history.past.length) return; const cur = { positions: JSON.parse(JSON.stringify(positions)), assignments: JSON.parse(JSON.stringify(assignments)), drawings: JSON.parse(JSON.stringify(drawings)) }; history.future.push(cur); const prev = history.past.pop(); positions = prev.positions; assignments = prev.assignments; drawings = prev.drawings; saveToServer(); renderAll(); }

  function redo(){ if (!history.future.length) return; const cur = { positions: JSON.parse(JSON.stringify(positions)), assignments: JSON.parse(JSON.stringify(assignments)), drawings: JSON.parse(JSON.stringify(drawings)) }; history.past.push(cur); const nx = history.future.pop(); positions = nx.positions; assignments = nx.assignments; drawings = nx.drawings; saveToServer(); renderAll(); }

  // Rendering
  function clearHall(){ hall.innerHTML = '<div class="hall-label">Sala weselna</div>'; }

  function renderAll(){
    clearHall();
    positions.forEach((p, i) => renderTable(i, p));
    drawAllStrokes();
  }

  function renderTable(index, p){
    const id = 't' + (index+1);
    const el = document.createElement('div');
    el.className = 'table';
    el.dataset.index = index;
    el.id = id;
    // size: compute pixel sizes so circles remain perfect circles regardless of hall aspect ratio
    try{
      const hrect = hall.getBoundingClientRect();
      if (p.shape === 'rect'){
        el.classList.add('rect');
        const wpx = ((p.w||28)/100) * hrect.width;
        const hpx = ((p.h||16)/100) * hrect.height;
        el.style.width = Math.round(wpx) + 'px';
        el.style.height = Math.round(hpx) + 'px';
        el.style.borderRadius = p.radius ? '12px' : '12px';
      } else {
        // use min dimension to compute a square size for true circle
        const sizePct = (p.size||14)/100;
        const base = Math.min(hrect.width, hrect.height);
        const spx = Math.round(sizePct * base);
        el.style.width = spx + 'px'; el.style.height = spx + 'px';
        el.style.borderRadius = '50%';
      }
    }catch(e){
      // fallback to percentage if measuring fails
      if (p.shape === 'rect'){ el.classList.add('rect'); el.style.width = (p.w||28) + '%'; el.style.height = (p.h||16) + '%'; el.style.borderRadius = '12px'; }
      else { el.style.width = (p.size||14) + '%'; el.style.height = (p.size||14) + '%'; el.style.borderRadius = '50%'; }
    }
    el.style.left = p.x + '%'; el.style.top = p.y + '%';
    el.style.position = 'absolute';
    el.style.transform = 'translate(-50%,-50%)';
    el.style.display = 'flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center';
    el.style.boxSizing = 'border-box';
    el.style.border = '3px solid var(--green)';
    // center label (table name) displayed inside table
    const centerLabel = document.createElement('div'); centerLabel.className = 'table-center-label'; centerLabel.style.pointerEvents='none'; centerLabel.style.position='absolute'; centerLabel.style.left='50%'; centerLabel.style.top='50%'; centerLabel.style.transform='translate(-50%,-50%)'; centerLabel.style.textAlign='center'; centerLabel.style.fontWeight='700'; centerLabel.style.color='var(--panel-text)'; centerLabel.style.zIndex='5'; centerLabel.style.userSelect='none'; centerLabel.textContent = p.label || '';
    el.appendChild(centerLabel);

    // person icons
    renderPeople(el, 't'+(index+1));

    // events
    el.addEventListener('click', (e)=>{ if (e.defaultPrevented) return; if (editMode === 'tables') showTableEditModal(index); else addPersonToTable(index); });

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
      // default circular layout unless specific position provided on person
      let cx, cy;
      const item = arr[i] || '';
      const personPos = (item && item.pos) || null;
      if (personPos && typeof personPos.x === 'number' && typeof personPos.y === 'number'){
        cx = personPos.x; cy = personPos.y;
      } else {
        const angle = (i / count) * Math.PI * 2 - Math.PI/2;
        cx = 50 + Math.cos(angle) * distance;
        cy = 50 + Math.sin(angle) * distance;
      }
      const avatarSize = (item && typeof item === 'object' && Number(item.avatarSize)) ? Math.max(24, Math.min(72, Number(item.avatarSize))) : 36;
      const person = document.createElement('div'); person.className = 'person';
      Object.assign(person.style, { position:'absolute', left:cx+'%', top:cy+'%', transform:'translate(-50%,-50%)', width:avatarSize+'px', height:avatarSize+'px', borderRadius:'50%', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 2px rgba(0,0,0,0.12)', cursor:'grab', border:'1px solid rgba(0,0,0,0.06)', userSelect:'none'});
      const name = (typeof item === 'string')? item : (item && item.name) || '';
      const initials = (name.split(' ').map(s=>s[0]||'').slice(0,2).join('').toUpperCase()) || 'G';
      person.dataset.idx = i; person.dataset.table = tableId;
      person.title = name;
      // avatar image if present
      const avatarUrl = (item && item.avatar && (item.avatar.url || item.avatar.key)) || null;
      if (avatarUrl){
        const img = document.createElement('img'); img.src = avatarUrl; img.alt = name; img.draggable = false; img.style.webkitUserDrag='none'; img.style.userDrag='none'; Object.assign(img.style,{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }); person.appendChild(img);
      } else {
        person.textContent = initials;
      }
      const label = document.createElement('div'); label.className = 'person-label'; label.textContent = name; label.style.display='none';
      person.addEventListener('mouseenter', ()=> label.style.display = 'block');
      person.addEventListener('mouseleave', ()=> label.style.display = 'none');
      person.addEventListener('click', (ev)=>{ if (ev.currentTarget && ev.currentTarget._justTapped){ ev.currentTarget._justTapped = false; ev.stopPropagation(); return; } ev.stopPropagation(); if (isAdmin()) selectAvatar(person, tableId, i); else onPersonClick(tableId, i); });
      person.addEventListener('dblclick', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); if (isAdmin()) onPersonClick(tableId, i); });
      // make avatar draggable for admins (supports moving between tables and reposition inside same table)
      makePersonDraggable(person, tableId, i);
      tableEl.appendChild(person); tableEl.appendChild(label);
    }
  }

  function makePersonDraggable(el, tableId, idx){
    if (!el) return;
    el.style.touchAction = 'none';
    let dragging = false; let ghost = null; let startX=0,startY=0;
    function cleanup(){ if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost); ghost=null; dragging=false; }
    el.addEventListener('pointerdown', (ev)=>{
      if (!isAdmin() && !allowDragForGuests) return; el._usingPointer = true; startX = ev.clientX; startY = ev.clientY; el.setPointerCapture && el.setPointerCapture(ev.pointerId);
      let moved = false;
      const onMove = (e)=>{
        const dx = e.clientX - startX; const dy = e.clientY - startY;
        if (!dragging && Math.hypot(dx,dy) > 6){
          // start dragging
          dragging = true; moved = true;
          ghost = el.cloneNode(true); ghost.style.position='fixed'; ghost.style.left = (e.clientX - 18) + 'px'; ghost.style.top = (e.clientY - 18) + 'px'; ghost.style.pointerEvents='none'; ghost.style.opacity='0.9'; ghost.style.zIndex = 20000; document.body.appendChild(ghost);
          el.style.opacity = '0.4';
        }
        if (dragging && ghost){ ghost.style.left = (e.clientX - 18) + 'px'; ghost.style.top = (e.clientY - 18) + 'px'; }
      };
      const onUp = (e)=>{
        try{ el.releasePointerCapture && el.releasePointerCapture(ev.pointerId); }catch(_){ }
        document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp);
        if (!dragging){ // treat as click
          // prevent duplicate click handler firing (pointerup + click) by marking element
          try{ el._justTapped = true; setTimeout(()=>{ try{ el._justTapped = false; }catch(_){ } }, 300); }catch(_){ }
          try{ if (isAdmin()) selectAvatar(el, tableId, idx); else onPersonClick(tableId, idx); }catch(_){ }
          return;
        }
        // was dragging: handle drop
        el.style.opacity = '1';
        // determine target table by checking bounding rects (more robust than elementFromPoint)
        const allTables = Array.from(document.querySelectorAll('.table'));
        let targetTable = null;
        for (const t of allTables){ const r = t.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom){ targetTable = t; break; } }
        if (targetTable){ const toId = targetTable.id;
          const fromArr = assignments[tableId] || [];
          // attempt to get the item by index first
          let item = typeof fromArr[idx] !== 'undefined' ? fromArr[idx] : null;
          if (!item){ // fallback: try match by name (best-effort)
            const names = fromArr.map(it=> typeof it==='string'? it : (it && it.name));
            // try to match a name that equals the clicked element's title
            const title = el.title || null;
            if (title){ const fi = names.indexOf(title); if (fi >= 0) item = fromArr[fi]; }
            if (!item) item = fromArr[0] || null;
          }
          if (!item){ cleanup(); return; }

          if (toId && toId !== tableId){ // move to another table
            // remove by identity
            const remIndex = fromArr.indexOf(item);
            let removed = null;
            if (remIndex >= 0){ removed = fromArr.splice(remIndex,1)[0]; }
            if (fromArr.length) assignments[tableId] = fromArr; else delete assignments[tableId];
            assignments[toId] = assignments[toId] || [];
            if (removed && removed.pos) delete removed.pos;
            assignments[toId].push(removed);
            try{ window._lastDrop = { from: tableId, to: toId, moved: true, removedName: (removed && (removed.name||removed||'')).toString(), time: Date.now() }; }catch(_){ }
            pushHistory(); saveToServer(); renderAll();
          } else { // dropped inside same table: set pos in-place when possible
            const tRect = targetTable.getBoundingClientRect(); const relX = ((e.clientX - tRect.left) / tRect.width) * 100; const relY = ((e.clientY - tRect.top) / tRect.height) * 100;
            const snapped = snapAvatarPosition(relX, relY); const xPct = snapped.x; const yPct = snapped.y;
            if (typeof fromArr[idx] !== 'undefined'){
              const existing = fromArr[idx];
              if (typeof existing === 'string'){
                fromArr[idx] = { name: existing, pos: { x: xPct, y: yPct } };
              } else {
                existing.pos = { x: xPct, y: yPct };
              }
              assignments[tableId] = fromArr;
            } else {
              // fallback: attach pos to found item and push back
              const obj = (typeof item === 'string')? { name: item } : item;
              obj.pos = { x: xPct, y: yPct };
              assignments[tableId] = assignments[tableId] || [];
              assignments[tableId].push(obj);
            }
            try{ window._lastDrop = { from: tableId, to: tableId, moved: false, idx: idx, pos: { x: xPct, y: yPct }, time: Date.now() }; }catch(_){ }
            pushHistory(); saveToServer(); renderAll();
          }
        }
        cleanup();
      };
      document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp);
    });
    // Mouse fallback for desktops where pointer events may not behave as expected
    el.addEventListener('mousedown', (me)=>{
      if (el._usingPointer) return; // let pointer events handle it
      if (!isAdmin() && !allowDragForGuests) return; startX = me.clientX; startY = me.clientY;
      let moved = false;
      const onMouseMove = (e)=>{ const dx = e.clientX - startX; const dy = e.clientY - startY; if (!dragging && Math.hypot(dx,dy) > 6){ dragging = true; moved = true; ghost = el.cloneNode(true); ghost.style.position='fixed'; ghost.style.left = (e.clientX - 18) + 'px'; ghost.style.top = (e.clientY - 18) + 'px'; ghost.style.pointerEvents='none'; ghost.style.opacity='0.9'; ghost.style.zIndex = 20000; document.body.appendChild(ghost); el.style.opacity='0.4'; }
        if (dragging && ghost){ ghost.style.left = (e.clientX - 18) + 'px'; ghost.style.top = (e.clientY - 18) + 'px'; } };
      const onMouseUp = (e)=>{ document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); if (!dragging){ try{ if (isAdmin()) selectAvatar(el, tableId, idx); else onPersonClick(tableId, idx); }catch(_){ } return; } el.style.opacity='1'; const allTables = Array.from(document.querySelectorAll('.table')); let targetTable = null; for (const t of allTables){ const r = t.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom){ targetTable = t; break; } } if (targetTable){ const toId = targetTable.id; const fromArr = assignments[tableId] || []; let item = typeof fromArr[idx] !== 'undefined' ? fromArr[idx] : null; if (!item){ const title = el.title || null; if (title){ const names = fromArr.map(it=> typeof it==='string'? it : (it && it.name)); const fi = names.indexOf(title); if (fi >= 0) item = fromArr[fi]; } if (!item) item = fromArr[0] || null; } if (!item){ cleanup(); return; } if (toId && toId !== tableId){ const remIndex = fromArr.indexOf(item); let removed = null; if (remIndex >= 0){ removed = fromArr.splice(remIndex,1)[0]; } if (fromArr.length) assignments[tableId] = fromArr; else delete assignments[tableId]; assignments[toId] = assignments[toId] || []; if (removed && removed.pos) delete removed.pos; assignments[toId].push(removed); try{ window._lastDrop = { from: tableId, to: toId, moved: true, removedName: (removed && (removed.name||removed||'')).toString(), time: Date.now() }; }catch(_){ } pushHistory(); saveToServer(); renderAll(); } else { const tRect = targetTable.getBoundingClientRect(); const relX = ((e.clientX - tRect.left) / tRect.width) * 100; const relY = ((e.clientY - tRect.top) / tRect.height) * 100; const snapped = snapAvatarPosition(relX, relY); const xPct = snapped.x; const yPct = snapped.y; if (typeof fromArr[idx] !== 'undefined'){ const existing = fromArr[idx]; if (typeof existing === 'string'){ fromArr[idx] = { name: existing, pos: { x: xPct, y: yPct } }; } else { existing.pos = { x: xPct, y: yPct }; } assignments[tableId] = fromArr; } else { const obj = (typeof item === 'string')? { name: item } : item; obj.pos = { x: xPct, y: yPct }; assignments[tableId] = assignments[tableId] || []; assignments[tableId].push(obj); } try{ window._lastDrop = { from: tableId, to: tableId, moved: false, idx: idx, pos: { x: xPct, y: yPct }, time: Date.now() }; }catch(_){ } pushHistory(); saveToServer(); renderAll(); } } };
      document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);
    });
  }

  let avatarControls = null;
  function removeAvatarControls(){
    if (avatarControls && avatarControls.parentNode) avatarControls.parentNode.removeChild(avatarControls);
    avatarControls = null;
  }

  function selectAvatar(element, tableId, idx){
    if (!isAdmin()) return;
    removeAvatarControls();
    avatarControls = document.createElement('div');
    avatarControls.className = 'avatar-controls';
    Object.assign(avatarControls.style, { position:'fixed', zIndex:22000, display:'grid', gridTemplateColumns:'repeat(3,34px)', gridTemplateRows:'repeat(2,34px)', gap:'3px', padding:'4px', background:'#fff', border:'1px solid rgba(47,111,78,.25)', borderRadius:'10px', boxShadow:'0 5px 18px rgba(20,34,26,.18)' });
    const buttons = [
      ['↑', 0, -1, 1, 2], ['←', -1, 0, 2, 1], ['↓', 0, 1, 2, 2], ['→', 1, 0, 2, 3]
    ];
    buttons.forEach(([label, dx, dy, row, column])=>{
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label; button.title = 'Przesuń awatar';
      Object.assign(button.style, { gridRow:row, gridColumn:column, padding:'2px', minHeight:'30px', lineHeight:'1', fontSize:'18px' });
      button.addEventListener('click', (event)=>{ event.stopPropagation(); nudgeAvatar(element, tableId, idx, dx, dy); });
      avatarControls.appendChild(button);
    });
    document.body.appendChild(avatarControls);
    const rect = element.getBoundingClientRect();
    avatarControls.style.left = Math.max(6, Math.min(window.innerWidth - 116, rect.left + rect.width / 2 - 58)) + 'px';
    avatarControls.style.top = Math.max(6, rect.top - 78) + 'px';
  }

  function nudgeAvatar(element, tableId, idx, dx, dy){
    const list = assignments[tableId] || [];
    let item = list[idx];
    if (!item) return;
    if (typeof item === 'string'){ item = { name:item }; list[idx] = item; }
    const pos = item.pos || { x:50, y:50 };
    const next = snapAvatarPosition((Number(pos.x) || 50) + dx * 10, (Number(pos.y) || 50) + dy * 10);
    item.pos = next;
    assignments[tableId] = list;
    element.style.left = next.x + '%'; element.style.top = next.y + '%';
    saveToServer();
    const rect = element.getBoundingClientRect();
    if (avatarControls){ avatarControls.style.left = Math.max(6, Math.min(window.innerWidth - 116, rect.left + rect.width / 2 - 58)) + 'px'; avatarControls.style.top = Math.max(6, rect.top - 78) + 'px'; }
  }

  function onPersonClick(tableId, idx){
    removeAvatarControls();
    const list = assignments[tableId] || [];
    const item = list[idx]; if (!item) return;
    const person = (typeof item === 'string')? { name: item, info: '' } : JSON.parse(JSON.stringify(item || { name: '' }));
    if (!isAdmin()){
      // view-only modal for non-admins: show large avatar, name and info
      const viewModal = document.createElement('div'); Object.assign(viewModal.style,{ position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:22000 });
      const card = document.createElement('div'); Object.assign(card.style,{ background:'#fff', padding:'18px', borderRadius:'10px', minWidth:'320px', maxWidth:'560px', textAlign:'center' });
      const big = document.createElement('div'); Object.assign(big.style,{ width:'220px', height:'220px', margin:'0 auto 12px', borderRadius:'12px', overflow:'hidden', background:'#f3f3f3', display:'flex', alignItems:'center', justifyContent:'center' });
      if (person.avatar && (person.avatar.url||person.avatar.key)){
        const img2 = document.createElement('img'); img2.src = person.avatar.url || person.avatar.key; img2.alt = person.name; img2.draggable = false; img2.style.webkitUserDrag='none'; img2.style.userDrag='none'; Object.assign(img2.style,{ width:'100%', height:'100%', objectFit:'cover' }); big.appendChild(img2);
      } else {
        const initials = (person.name||'').split(' ').map(s=>s[0]||'').slice(0,2).join('').toUpperCase()||'G'; const sp2 = document.createElement('div'); sp2.textContent = initials; sp2.style.fontSize='72px'; sp2.style.fontWeight='700'; big.appendChild(sp2);
      }
      const h = document.createElement('div'); h.textContent = person.name || ''; h.style.fontSize='20px'; h.style.fontWeight='700'; h.style.marginBottom='6px';
      const infoDiv = document.createElement('div'); infoDiv.textContent = person.info || ''; infoDiv.style.whiteSpace='pre-wrap'; infoDiv.style.color='#444'; infoDiv.style.marginBottom='12px';
      const closeBtn = document.createElement('button'); closeBtn.textContent='Zamknij'; closeBtn.className='btn-outline'; closeBtn.addEventListener('click', ()=> viewModal.remove());
      card.appendChild(big); card.appendChild(h); card.appendChild(infoDiv); card.appendChild(closeBtn); viewModal.appendChild(card); document.body.appendChild(viewModal);
      return;
    }
    // build modal to edit name, info and avatar
    const modal = document.createElement('div'); Object.assign(modal.style,{ position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:21000 });
    const box = document.createElement('div'); Object.assign(box.style,{ background:'#fff', padding:'14px', borderRadius:'10px', minWidth:'320px', maxWidth:'520px' });
    const title = document.createElement('div'); title.textContent = 'Edycja osoby'; title.style.fontWeight='700'; title.style.marginBottom='8px';
    const nameInput = document.createElement('input'); nameInput.value = person.name || ''; Object.assign(nameInput.style,{ width:'100%', padding:'8px', marginBottom:'8px' });
    const infoInput = document.createElement('textarea'); infoInput.placeholder='Informacje o osobie (np. dieta, rola)'; infoInput.value = person.info || ''; Object.assign(infoInput.style,{ width:'100%', padding:'8px', minHeight:'80px', boxSizing:'border-box', marginBottom:'8px' });
    const imgWrap = document.createElement('div'); Object.assign(imgWrap.style,{ width:'120px', height:'120px', margin:'0 auto 8px', borderRadius:'8px', overflow:'hidden', background:'#f3f3f3', display:'flex',alignItems:'center',justifyContent:'center' });
    const img = document.createElement('img'); img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover'; if (person.avatar && (person.avatar.url||person.avatar.key)){ img.src = (person.avatar.url||person.avatar.key); img.draggable=false; img.style.webkitUserDrag='none'; img.style.userDrag='none'; }
    if (person.avatar) imgWrap.appendChild(img); else { const initials = (person.name||'').split(' ').map(s=>s[0]||'').slice(0,2).join('').toUpperCase()||'G'; const sp = document.createElement('div'); sp.textContent=initials; sp.style.fontSize='48px'; sp.style.fontWeight='700'; imgWrap.appendChild(sp); }
    const changeAvatarBtn = document.createElement('button'); changeAvatarBtn.textContent='Zmień awatar'; changeAvatarBtn.className='btn-outline'; changeAvatarBtn.style.display='block'; changeAvatarBtn.style.margin='8px auto'; changeAvatarBtn.addEventListener('click', async ()=>{ const f = await pickAndUploadAvatar(); if (f){ person.avatar = f; img.src = f.url || f.key || ''; if (!img.parentNode) imgWrap.appendChild(img); } });
    const avatarSizeLabel = document.createElement('label'); avatarSizeLabel.textContent='Rozmiar awatara: '; avatarSizeLabel.style.display='block'; avatarSizeLabel.style.margin='8px 0 4px';
    const avatarSizeValue = document.createElement('span'); avatarSizeValue.textContent = (person.avatarSize || 36) + ' px';
    const avatarSizeInput = document.createElement('input'); avatarSizeInput.type='range'; avatarSizeInput.min='24'; avatarSizeInput.max='72'; avatarSizeInput.step='4'; avatarSizeInput.value=person.avatarSize || 36; avatarSizeInput.style.width='100%'; avatarSizeInput.addEventListener('input', ()=>{ avatarSizeValue.textContent = avatarSizeInput.value + ' px'; });
    avatarSizeLabel.appendChild(avatarSizeValue);
    const btnRow = document.createElement('div'); Object.assign(btnRow.style,{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'8px' });
    const cancel = document.createElement('button'); cancel.textContent='Anuluj'; cancel.className='btn-outline'; cancel.addEventListener('click', ()=> modal.remove());
    const del = document.createElement('button'); del.textContent='Usuń'; del.className='btn-outline'; del.style.background='#c0392b'; del.style.color='#fff'; del.addEventListener('click', ()=>{ if (confirm('Usunąć osobę?')){ list.splice(idx,1); assignments[tableId] = list.length? list : undefined; pushHistory(); saveToServer(); renderAll(); modal.remove(); } });
    const save = document.createElement('button'); save.textContent='Zapisz'; save.className='btn-outline'; save.style.background='var(--green)'; save.style.color='#fff'; save.addEventListener('click', ()=>{ const nm = (nameInput.value||'').trim(); if (!nm){ alert('Podaj imię'); return; } const newObj = { name: nm, info: (infoInput.value||'').trim(), avatarSize: Number(avatarSizeInput.value) || 36 }; if (person.avatar) newObj.avatar = person.avatar; if (person.pos) newObj.pos = person.pos; list[idx] = newObj; assignments[tableId] = list.length? list : undefined; pushHistory(); saveToServer(); renderAll(); modal.remove(); });
    btnRow.appendChild(del); btnRow.appendChild(cancel); btnRow.appendChild(save);
    box.appendChild(title); box.appendChild(imgWrap); box.appendChild(changeAvatarBtn); box.appendChild(avatarSizeLabel); box.appendChild(avatarSizeInput); box.appendChild(nameInput); box.appendChild(infoInput); box.appendChild(btnRow); modal.appendChild(box); document.body.appendChild(modal);
  }

  // selection toolbar
  let selectedIndex = null;
  let toolbar = null;
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
    showToolbarFor(el, index);
  }

  function showToolbarFor(el, index){
    removeToolbar();
    toolbar = document.createElement('div'); toolbar.id = 'tableToolbar';
    Object.assign(toolbar.style, { position:'absolute', zIndex:10000, background:'#fff', border:'1px solid #ddd', padding:'6px', borderRadius:'8px', display:'flex', gap:'6px', alignItems:'center' });
    const inc = createBtn('+', 'Powiększ', ()=> changeSize(index, 1.1));
    const dec = createBtn('-', 'Zmniejsz', ()=> changeSize(index, 0.9));
    const undoBtn = createBtn('↶', 'Cofnij', ()=>{ undo(); });
    const redoBtn = createBtn('↷', 'Ponów', ()=>{ redo(); });
    const addP = createBtn('＋ Os.', 'Dodaj osobę', ()=> addPersonToTable(index));
    const arrangePeople = createBtn('◎ Sym.', 'Ustaw awatary symetrycznie', ()=> arrangePeopleSymmetrically(index));
    const rename = createBtn('✎N', 'Zmień nazwę stolika', ()=> renameTable(index));
    const shape = createBtn('🔄', 'Zmień kształt', ()=> { toggleShape(index); refreshToolbarSize(); });
    const setRect = createBtn('◻', 'Ustaw prostokąt', ()=>{ const p=positions[index]; if (!p) return; p.shape='rect'; p.w = p.w||28; p.h = p.h||16; pushHistory(); saveToServer(); renderAll(); });
    const setCircle = createBtn('◯', 'Ustaw kółko', ()=>{ const p=positions[index]; if (!p) return; p.shape='circle'; p.size = p.size||14; pushHistory(); saveToServer(); renderAll(); });
    const dup = createBtn('⧉', 'Powiel', ()=> duplicateTable(index));
    const edit = createBtn('✎', 'Edytuj osoby (lista)', ()=> editTable('t'+(index+1)));
    const del = createBtn('🗑', 'Usuń', ()=>{ if(confirm('Usunąć stolik?')){ deleteTable(index); } });
    const snapBtn = createBtn('🔲', 'Snap: off', ()=>{ snapToGrid = !snapToGrid; snapBtn.textContent = snapToGrid? '🔲 On':'🔲 Off'; });

    const sizeReadout = document.createElement('div'); sizeReadout.id = 'tableSizeReadout'; sizeReadout.style.display='flex'; sizeReadout.style.alignItems='center'; sizeReadout.style.padding='0 6px'; sizeReadout.style.fontSize='13px';

    if (isAdmin()){
      toolbar.appendChild(undoBtn); toolbar.appendChild(redoBtn);
      toolbar.appendChild(inc); toolbar.appendChild(dec); toolbar.appendChild(sizeReadout); toolbar.appendChild(addP); toolbar.appendChild(arrangePeople); toolbar.appendChild(rename);
      toolbar.appendChild(shape); toolbar.appendChild(setRect); toolbar.appendChild(setCircle); toolbar.appendChild(dup); toolbar.appendChild(edit); toolbar.appendChild(del); toolbar.appendChild(snapBtn);
    } else {
      // non-admins see only the size/readout
      toolbar.appendChild(sizeReadout);
    }
    document.body.appendChild(toolbar);
    // position near element
    const r = el.getBoundingClientRect(); toolbar.style.left = (r.right + 10) + 'px'; toolbar.style.top = (r.top) + 'px';

    function refreshToolbarSize(){ try{ const p = positions[index] || {}; if (p.shape === 'rect'){ sizeReadout.textContent = `W×H: ${p.w||28}% × ${p.h||16}%`; } else { sizeReadout.textContent = `Rozmiar: ${p.size||14}%`; } }catch(e){}
    }

    sizeReadout.addEventListener('click', (e)=>{
      e.stopPropagation(); const p = positions[index] || {}; const editor = document.createElement('div'); Object.assign(editor.style, { display:'flex', gap:'6px', alignItems:'center' });
      if (p.shape === 'rect'){
        const wIn = document.createElement('input'); wIn.type='number'; wIn.min=6; wIn.max=80; wIn.value = p.w||28; wIn.style.width='60px';
        const hIn = document.createElement('input'); hIn.type='number'; hIn.min=6; hIn.max=60; hIn.value = p.h||16; hIn.style.width='60px';
        const ok = document.createElement('button'); ok.textContent='OK'; ok.className='btn-outline'; ok.addEventListener('click', ()=>{ p.w = Number(wIn.value); p.h = Number(hIn.value); positions[index]=p; pushHistory(); saveToServer(); renderAll(); removeToolbar(); });
        editor.appendChild(wIn); editor.appendChild(hIn); editor.appendChild(ok);
      } else {
        const sIn = document.createElement('input'); sIn.type='range'; sIn.min=6; sIn.max=50; sIn.value = p.size||14; sIn.addEventListener('input', ()=>{ sizeReadout.textContent = `Rozmiar: ${sIn.value}%`; });
        const ok = document.createElement('button'); ok.textContent='OK'; ok.className='btn-outline'; ok.addEventListener('click', ()=>{ p.size = Number(sIn.value); positions[index]=p; pushHistory(); saveToServer(); renderAll(); removeToolbar(); });
        editor.appendChild(sIn); editor.appendChild(ok);
      }
      sizeReadout.textContent=''; sizeReadout.appendChild(editor);
    });

    refreshToolbarSize();
  }

  function arrangePeopleSymmetrically(index){
    if (!isAdmin()) return;
    const tableId = 't' + (index + 1);
    const list = assignments[tableId] || [];
    if (!list.length) return;
    pushHistory();
    const startAngle = 200;
    const endAngle = 340;
    const radius = 44;
    list.forEach((entry, personIndex)=>{
      const item = typeof entry === 'string' ? { name:entry } : entry;
      const angle = list.length === 1 ? 270 : startAngle + ((endAngle - startAngle) * personIndex / (list.length - 1));
      const radians = angle * Math.PI / 180;
      item.pos = snapAvatarPosition(50 + Math.cos(radians) * radius, 50 + Math.sin(radians) * radius);
      list[personIndex] = item;
    });
    assignments[tableId] = list;
    saveToServer();
    renderAll();
  }

  function createBtn(text, title, onClick){ const b = document.createElement('button'); b.textContent = text; b.title = title; b.className='btn-outline'; b.addEventListener('click',(e)=>{ e.stopPropagation(); onClick(); removeToolbar(); }); return b; }
  function removeToolbar(){ if (toolbar && toolbar.parentNode) toolbar.parentNode.removeChild(toolbar); toolbar = null; selectedIndex = null; }
  document.addEventListener('click', ()=>{ removeToolbar(); removeAvatarControls(); });

  function changeSize(index, factor){ const p = positions[index]; if (!p) return; if (p.shape==='rect'){ p.w = Math.max(6, Math.min(80, (p.w||28)*factor)); p.h = Math.max(6, Math.min(60, (p.h||16)*factor)); } else { p.size = Math.max(6, Math.min(50, (p.size||14)*factor)); } saveToServer(); renderAll(); }
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
    const infoInput = document.createElement('textarea'); infoInput.placeholder='Informacje o osobie (np. dieta, rola)'; Object.assign(infoInput.style,{ width:'100%', padding:'8px', minHeight:'80px', boxSizing:'border-box', marginBottom:'8px' });
    const fileInput = document.createElement('input'); fileInput.type='file'; fileInput.accept='image/*'; fileInput.style.marginBottom='8px';
    const preview = document.createElement('div'); preview.style.marginBottom='8px';
    fileInput.addEventListener('change', ()=>{ const f = fileInput.files && fileInput.files[0]; if (!f){ preview.innerHTML=''; return; } const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.draggable=false; img.style.webkitUserDrag='none'; img.style.userDrag='none'; img.style.maxWidth='120px'; img.style.maxHeight='120px'; img.style.borderRadius='8px'; preview.innerHTML=''; preview.appendChild(img); });
    const btnRow = document.createElement('div'); btnRow.style.display='flex'; btnRow.style.gap='8px'; btnRow.style.justifyContent='flex-end';
    const cancel = document.createElement('button'); cancel.textContent='Anuluj'; cancel.className='btn-outline'; cancel.addEventListener('click', ()=> modal.remove());
    const save = document.createElement('button'); save.textContent='Zapisz'; save.className='btn-outline'; save.style.background='var(--green)'; save.style.color='#fff';
    save.addEventListener('click', async ()=>{
      const name = (nameInput.value||'').trim(); if (!name){ alert('Podaj imię'); return; }
      const info = (infoInput.value||'').trim();
      assignments[key] = assignments[key] || [];
      const f = fileInput.files && fileInput.files[0];
      if (f){
        const avatar = await uploadFile(f); if (avatar) assignments[key].push({ name, info, avatar }); else assignments[key].push({ name, info });
      } else {
        assignments[key].push({ name, info });
      }
      pushHistory(); saveToServer(); renderAll(); modal.remove();
    });
    btnRow.appendChild(cancel); btnRow.appendChild(save);
    box.appendChild(title); box.appendChild(nameInput); box.appendChild(infoInput); box.appendChild(fileInput); box.appendChild(preview); box.appendChild(btnRow); modal.appendChild(box); document.body.appendChild(modal);
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

  // modal to edit table properties
  function showTableEditModal(index){
    if (!isAdmin()){ alert('Tylko admin może edytować stolik.'); return; }
    const p = positions[index] || {};
    const modal = document.createElement('div'); Object.assign(modal.style,{ position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:21000 });
    const box = document.createElement('div'); Object.assign(box.style,{ background:'#fff', padding:'14px', borderRadius:'10px', minWidth:'360px', maxWidth:'520px' });
    const title = document.createElement('div'); title.textContent = 'Edycja stolika'; title.style.fontWeight='700'; title.style.marginBottom='8px';
    const nameInput = document.createElement('input'); nameInput.placeholder='Nazwa stolika'; nameInput.value = p.label || ''; Object.assign(nameInput.style,{ width:'100%', padding:'8px', marginBottom:'8px', boxSizing:'border-box' });
    // shape selector
    const shapeRow = document.createElement('div'); shapeRow.style.display='flex'; shapeRow.style.gap='8px'; shapeRow.style.marginBottom='8px';
    const circBtn = document.createElement('button'); circBtn.textContent='Kółko'; circBtn.className='btn-outline'; circBtn.addEventListener('click', ()=>{ p.shape='circle'; refreshSizeControls(); previewShape(); });
    const rectBtn = document.createElement('button'); rectBtn.textContent='Prostokąt'; rectBtn.className='btn-outline'; rectBtn.addEventListener('click', ()=>{ p.shape='rect'; refreshSizeControls(); previewShape(); });
    shapeRow.appendChild(circBtn); shapeRow.appendChild(rectBtn);
    // size controls
    const sizeWrap = document.createElement('div'); sizeWrap.style.display='flex'; sizeWrap.style.gap='8px'; sizeWrap.style.alignItems='center'; sizeWrap.style.marginBottom='8px';
    const sizeLabel = document.createElement('div'); sizeLabel.textContent = 'Rozmiar:'; sizeLabel.style.minWidth='60px';
    const sizeInput = document.createElement('input'); sizeInput.type='number'; sizeInput.min=6; sizeInput.max=80; sizeInput.value = p.shape==='rect'? (p.w||28) : (p.size||14);
    const sizeInput2 = document.createElement('input'); sizeInput2.type='number'; sizeInput2.min=6; sizeInput2.max=60; sizeInput2.value = p.shape==='rect'? (p.h||16) : (p.size||14); sizeInput2.style.display = p.shape==='rect'? 'inline-block':'none';
    sizeInput.style.width='80px'; sizeInput2.style.width='80px';
    sizeWrap.appendChild(sizeLabel); sizeWrap.appendChild(sizeInput); sizeWrap.appendChild(sizeInput2);
    function refreshSizeControls(){ if (p.shape==='rect'){ sizeInput.value = p.w||28; sizeInput2.style.display='inline-block'; sizeInput2.value = p.h||16; } else { sizeInput.value = p.size||14; sizeInput2.style.display='none'; } }
    // preview box
    const preview = document.createElement('div'); Object.assign(preview.style,{ width:'160px', height:'120px', margin:'8px auto', display:'flex', alignItems:'center', justifyContent:'center', border:'1px dashed #ddd', borderRadius:'8px' });
    const previewInner = document.createElement('div'); previewInner.style.display='flex'; previewInner.style.alignItems='center'; previewInner.style.justifyContent='center'; previewInner.style.background='var(--panel)'; previewInner.style.color='var(--panel-text)'; previewInner.style.fontWeight='700'; previewInner.textContent = nameInput.value || '';
    preview.appendChild(previewInner);
    function previewShape(){ if (p.shape==='rect'){ previewInner.style.width = (Number(sizeInput.value)||28)+'%'; previewInner.style.height = (Number(sizeInput2.value)||16)+'%'; previewInner.style.borderRadius='12px'; } else { const s = Number(sizeInput.value)||14; previewInner.style.width = s+'%'; previewInner.style.height = s+'%'; previewInner.style.borderRadius='50%'; } }
    // delete button
    const btnRow = document.createElement('div'); Object.assign(btnRow.style,{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'8px' });
    const del = document.createElement('button'); del.textContent='Usuń stolik'; del.className='btn-outline'; del.style.background='#c0392b'; del.style.color='#fff'; del.addEventListener('click', ()=>{ if (confirm('Usunąć ten stolik?')){ deleteTable(index); modal.remove(); } });
    const arrangePeople = document.createElement('button'); arrangePeople.textContent='Ustaw awatary symetrycznie'; arrangePeople.className='btn-outline'; arrangePeople.addEventListener('click', ()=>{ arrangePeopleSymmetrically(index); modal.remove(); });
    const cancel = document.createElement('button'); cancel.textContent='Anuluj'; cancel.className='btn-outline'; cancel.addEventListener('click', ()=> modal.remove());
    const save = document.createElement('button'); save.textContent='Zapisz'; save.className='btn-outline'; save.style.background='var(--green)'; save.style.color='#fff'; save.addEventListener('click', ()=>{
      const name = (nameInput.value||'').trim(); if (name) p.label = name; else delete p.label;
      if (p.shape==='rect'){ p.w = Math.max(6, Math.min(80, Number(sizeInput.value)||28)); p.h = Math.max(6, Math.min(60, Number(sizeInput2.value)||16)); delete p.size; } else { p.size = Math.max(6, Math.min(50, Number(sizeInput.value)||14)); delete p.w; delete p.h; }
      positions[index] = p; pushHistory(); saveToServer(); renderAll(); modal.remove();
    });
    // live updates
    nameInput.addEventListener('input', ()=> previewInner.textContent = nameInput.value);
    sizeInput.addEventListener('input', previewShape); sizeInput2.addEventListener('input', previewShape);
    // assemble
    box.appendChild(title); box.appendChild(nameInput); box.appendChild(shapeRow); box.appendChild(sizeWrap); box.appendChild(preview); btnRow.appendChild(del); btnRow.appendChild(arrangePeople); btnRow.appendChild(cancel); btnRow.appendChild(save); box.appendChild(btnRow); modal.appendChild(box); document.body.appendChild(modal);
    // initialize
    refreshSizeControls(); previewShape();
  }

  function deleteTable(index){ positions.splice(index,1);
    // shift assignments
    const newAssign = {};
    Object.keys(assignments).forEach(k=>{ const n = parseInt(k.replace('t',''),10); if (n <= index+1) newAssign[k] = assignments[k]; else newAssign['t'+(n-1)] = assignments[k]; });
    assignments = newAssign; pushHistory(); saveToServer(); renderAll(); }

  function editTable(tableId){ const arr = assignments[tableId] || []; if (!isAdmin()){ const listStr = (arr||[]).map(it=> typeof it === 'string'? it : (it && it.name)).join('\n'); alert('Przy ' + tableId + ' siedzą:\n' + (listStr||'Pusty stolik')); return; }
    const display = (arr||[]).map(it=> typeof it === 'string'? it : (it && it.name)).join(', ');
    const val = prompt('Wpisz imiona (oddziel przecinkami):', display); if (val === null) return; const newArr = val.split(',').map(s=>s.trim()).filter(Boolean); if (newArr.length) assignments[tableId] = newArr; else delete assignments[tableId]; saveToServer(); renderAll(); }

  // helper: open file picker and upload avatar, returns { key, url } or null
  function pickAndUploadAvatar(){
    return new Promise((resolve)=>{
      const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.style.display='none'; document.body.appendChild(inp);
      inp.addEventListener('change', async ()=>{
        const f = inp.files && inp.files[0]; if (!f){ document.body.removeChild(inp); resolve(null); return; }
        try{
          const avatar = await uploadFile(f);
          document.body.removeChild(inp);
          resolve(avatar);
        }catch(e){ console.error('avatar upload failed', e); document.body.removeChild(inp); resolve(null); }
      });
      inp.click();
    });
  }

  // upload a File object to /api/upload and return { key, url } or null
  async function uploadFile(file){
    try{
      const fd = new FormData(); fd.append('file', file, file.name);
      fd.append('purpose', 'avatar');
      const res = await fetch(API_BASE + '/api/upload', { method:'POST', body: fd });
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
  function ensureAddButton(){ // create add button only for admins; login flow calls this after auth
    if (document.getElementById('addTableBtn')) return;
    if (!isAdmin()) return;
    const btn = document.createElement('button'); btn.id='addTableBtn'; btn.className='btn-outline'; btn.textContent='Dodaj stolik'; btn.addEventListener('click', ()=>{ if (!isAdmin()){ alert('Tylko admin może dodawać stoliki.'); return; } addTable(); });
    const target = getControls(); try{ target.appendChild(btn); }catch(e){ document.body.appendChild(btn); }
  }
  function addTable(){ positions.push({ x:50, y:50, size:12, shape:'circle' }); saveToServer(); renderAll(); }

  function ensureAdminControls(){
    const loginBtn = document.getElementById('adminLoginBtn');
    if (isAdmin()){
      if (loginBtn) loginBtn.remove();
      ensureAddButton();
      ensureEditModeButton();
      ensureGlobalAvatarSizeControl();
      ensureSaveButton();
      return;
    }
    if (document.getElementById('addTableBtn') || loginBtn) return;
    const btn = document.createElement('button');
    btn.id = 'adminLoginBtn';
    btn.className = 'btn-outline';
    btn.textContent = 'Zaloguj jako administrator';
    btn.addEventListener('click', async ()=>{
      const user = (prompt('Login administratora:') || '').trim();
      const pass = prompt('Hasło administratora:') || '';
      if (!user || !pass) return;
      try{
        const response = await fetch(API_BASE + '/api/login', {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ user, pass })
        });
        const result = await response.json();
        if (!response.ok || !result.success || !result.token){
          alert('Nieprawidłowy login lub hasło.');
          return;
        }
        localStorage.setItem('adminToken', result.token);
        localStorage.setItem('user', user);
        if (window.authUpdateNav) window.authUpdateNav();
        ensureAdminControls();
      }catch(e){
        alert('Nie można połączyć z serwerem.');
      }
    });
    getControls().appendChild(btn);
  }

  function ensureSaveButton(){
    if (saveButton || !isAdmin()) return;
    saveButton = document.createElement('button');
    saveButton.id = 'saveSeatingBtn';
    saveButton.className = 'btn-outline save-seating-btn';
    saveButton.addEventListener('click', saveChanges);
    getControls().appendChild(saveButton);
    updateSaveButton();
  }

  function ensureGlobalAvatarSizeControl(){
    if (!isAdmin() || document.getElementById('globalAvatarSizeControl')) return;
    const wrapper = document.createElement('label');
    wrapper.id = 'globalAvatarSizeControl';
    wrapper.className = 'global-avatar-size-control';
    wrapper.textContent = 'Awatary: ';
    const value = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range'; input.min = '24'; input.max = '72'; input.step = '4'; input.value = '36';
    input.title = 'Ustaw rozmiar wszystkich awatarów';
    const updateLabel = ()=>{ value.textContent = input.value + ' px'; };
    input.addEventListener('input', updateLabel);
    input.addEventListener('change', ()=>{
      const size = Number(input.value) || 36;
      pushHistory();
      Object.keys(assignments).forEach(key=>{
        assignments[key] = (assignments[key] || []).map(item=>{
          if (typeof item === 'string') return { name:item, avatarSize:size };
          return Object.assign({}, item, { avatarSize:size });
        });
      });
      saveToServer();
      renderAll();
    });
    wrapper.appendChild(value); wrapper.appendChild(input);
    getControls().appendChild(wrapper);
    updateLabel();
  }

  

  // Edit mode toggle (tables <-> people)
  function ensureEditModeButton(){ if (document.getElementById('editModeBtn')) return; const b = document.createElement('button'); b.id='editModeBtn'; b.className='btn-outline'; b.style.marginLeft='6px';
    // only create when admin
    if (!isAdmin()) return;
    function update(){ b.textContent = (editMode === 'tables')? 'Edytuj: Stoły' : 'Edytuj: Osoby'; }
    b.addEventListener('click', ()=>{ editMode = (editMode === 'tables')? 'people' : 'tables'; update(); renderAll(); });
    const target = getControls(); try{ target.appendChild(b); }catch(e){ document.body.appendChild(b); }
    update(); }

  // init
  (async function init(){ await loadFromServer(); renderAll(); ensureAdminControls(); ensureCanvas(); })();

  

})();
