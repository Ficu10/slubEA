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
  function saveLocal(){ localStorage.setItem(seatingKey, JSON.stringify({ positions, assignments, drawings })); }

  async function loadFromServer(){
    try{
      const res = await fetch(API_BASE + '/api/seating');
      if (!res.ok) throw new Error('no-server');
      const json = await res.json();
      positions = json.positions && json.positions.length ? json.positions : defaultPositions.slice();
      assignments = json.assignments || {};
      drawings = json.drawings || [];
      return;
    }catch(e){
      // fallback to localStorage
      try{ const s = localStorage.getItem(seatingKey); if (s){ const j = JSON.parse(s); positions = j.positions || defaultPositions.slice(); assignments = j.assignments || {}; drawings = j.drawings || []; return; } }catch(_){}
      positions = defaultPositions.slice(); assignments = {}; drawings = [];
    }
  }

  async function saveToServer(){
    const token = localStorage.getItem('adminToken');
    const body = { positions, assignments, drawings };
    if (!token){ saveLocal(); return; }
    try{
      await fetch(API_BASE + '/api/seating', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token }, body: JSON.stringify(body) });
    }catch(e){ saveLocal(); }
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
    // size: use percentage width/height for responsiveness
    if (p.shape === 'rect'){
      el.classList.add('rect');
      el.style.width = (p.w||28) + '%';
      el.style.height = (p.h||16) + '%';
      el.style.borderRadius = p.radius?'12px':'12px';
    } else {
      el.style.width = (p.size||14) + '%';
      el.style.height = (p.size||14) + '%';
      el.style.borderRadius = '50%';
    }
    el.style.left = p.x + '%'; el.style.top = p.y + '%';
    el.style.position = 'absolute';
    el.style.transform = 'translate(-50%,-50%)';
    el.style.display = 'flex'; el.style.alignItems = 'center'; el.style.justifyContent = 'center';
    el.style.boxSizing = 'border-box';
    el.style.border = '3px solid var(--green)';
    // label
    const lbl = document.createElement('div'); lbl.className = 'num'; lbl.style.pointerEvents='none'; lbl.textContent = p.label || (index+1);
    const namesDiv = document.createElement('div'); namesDiv.className = 'names'; namesDiv.style.pointerEvents='none';
    const names = (assignments['t'+(index+1)] || []).slice(0,6);
    namesDiv.textContent = names.join('\n') || 'Pusty stolik';
    el.appendChild(lbl); el.appendChild(namesDiv);

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
      const cx = 50 + Math.cos(angle) * distance;
      const cy = 50 + Math.sin(angle) * distance;
      const person = document.createElement('div'); person.className = 'person';
      Object.assign(person.style, { position:'absolute', left:cx+'%', top:cy+'%', transform:'translate(-50%,-50%)', width:'26px', height:'26px', borderRadius:'50%', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 2px rgba(0,0,0,0.12)', cursor:'pointer', border:'1px solid rgba(0,0,0,0.06)'});
      const name = arr[i] || '';
      const initials = name.split(' ').map(s=>s[0]||'').slice(0,2).join('').toUpperCase() || 'G';
      person.textContent = initials; person.title = name; person.dataset.idx = i; person.dataset.table = tableId;
      const label = document.createElement('div'); label.className = 'person-label'; label.textContent = name; label.style.display='none';
      person.addEventListener('mouseenter', ()=> label.style.display = 'block');
      person.addEventListener('mouseleave', ()=> label.style.display = 'none');
      person.addEventListener('click', (ev)=>{ ev.stopPropagation(); onPersonClick(tableId, i); });
      tableEl.appendChild(person); tableEl.appendChild(label);
    }
  }

  function onPersonClick(tableId, idx){
    const list = assignments[tableId] || [];
    const name = list[idx]; if (!name) return;
    if (!isAdmin()){ alert(name + '\n\nPrzy ' + tableId + ' siedzą:\n' + (list.join('\n')||'Pusty stolik')); return; }
    const newName = prompt('Edycja osoby', name); if (newName === null) return; if (newName.trim()) list[idx] = newName.trim(); else list.splice(idx,1); assignments[tableId] = list.length? list : undefined; saveToServer(); renderAll();
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
      alert('Przy ' + key + ' siedzą:\n\n' + (arr.join('\n') || 'Pusty stolik'));
      return;
    }
    showToolbarFor(el, index);
  }

  function showToolbarFor(el, index){
    removeToolbar();
    toolbar = document.createElement('div'); toolbar.id = 'tableToolbar';
    Object.assign(toolbar.style, { position:'absolute', zIndex:10000, background:'#fff', border:'1px solid #ddd', padding:'6px', borderRadius:'8px', display:'flex', gap:'6px' });
    const inc = createBtn('+', 'Powieksz', ()=> changeSize(index, 1.1));
    const dec = createBtn('-', 'Zmniejsz', ()=> changeSize(index, 0.9));
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
    toolbar.appendChild(inc); toolbar.appendChild(dec); toolbar.appendChild(addP); toolbar.appendChild(rename);
    toolbar.appendChild(shape); toolbar.appendChild(dup); toolbar.appendChild(edit); toolbar.appendChild(del); toolbar.appendChild(snapBtn);
    document.body.appendChild(toolbar);
    // position near element
    const r = el.getBoundingClientRect(); toolbar.style.left = (r.right + 10) + 'px'; toolbar.style.top = (r.top) + 'px';
  }

  function createBtn(text, title, onClick){ const b = document.createElement('button'); b.textContent = text; b.title = title; b.className='btn-outline'; b.addEventListener('click',(e)=>{ e.stopPropagation(); onClick(); removeToolbar(); }); return b; }
  function removeToolbar(){ if (toolbar && toolbar.parentNode) toolbar.parentNode.removeChild(toolbar); toolbar = null; selectedIndex = null; }
  document.addEventListener('click', ()=> removeToolbar());

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
    const name = prompt('Wpisz imię i nazwisko nowej osoby:');
    if (!name) return;
    assignments[key] = assignments[key] || [];
    assignments[key].push(name.trim());
    pushHistory(); saveToServer(); renderAll();
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

  function editTable(tableId){ const arr = assignments[tableId] || []; if (!isAdmin()){ alert('Przy ' + tableId + ' siedzą:\n' + (arr.join('\n')||'Pusty stolik')); return; }
    const val = prompt('Wpisz imiona (oddziel przecinkami):', arr.join(', ')); if (val === null) return; const newArr = val.split(',').map(s=>s.trim()).filter(Boolean); if (newArr.length) assignments[tableId] = newArr; else delete assignments[tableId]; saveToServer(); renderAll(); }

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
    Object.keys(assignments).forEach(k=>{ (assignments[k]||[]).forEach(name=>{ if (!name) return; names.push({ name, table:k }); }); });
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

  // Admin quick-login control (for convenience)
  function ensureAdminControl(){ if (document.getElementById('adminToggle')) return; const a = document.createElement('button'); a.id='adminToggle'; a.className='btn-outline'; a.style.marginLeft='6px';
    function update(){ if (isAdmin()){ a.textContent = 'Wyloguj admin'; a.title='Wyloguj'; } else { a.textContent = 'Zaloguj admin'; a.title='Zaloguj jako admin (emilka)'; } }
    a.addEventListener('click', ()=>{
      if (isAdmin()){ localStorage.removeItem('adminToken'); update(); renderAll(); return; }
      const user = prompt('Login:', 'emilka'); if (user === null) return; const pass = prompt('Hasło:', 'adas'); if (pass === null) return;
      if (user === 'emilka' && pass === 'adas'){ localStorage.setItem('adminToken', 'local-test-token'); update(); ensureAddButton(); alert('Zalogowano jako admin'); } else { alert('Nieprawidłowe dane'); }
    });
    controls.appendChild(a); update();
  }

  // init
  (async function init(){ await loadFromServer(); renderAll(); ensureAddButton(); ensureCanvas(); })();
  // admin control
  (function initAdmin(){ ensureAdminControl(); })();

})();
