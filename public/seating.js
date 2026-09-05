(() => {
  const hall = document.getElementById('hall');
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearBtn');
  const seatingKey = 'wesele_seating_v1';

  // Predefined positions for 10 round tables + 1 rectangular table for the couple
  const defaultPositions = [
    {x:20,y:30,size:14},{x:50,y:30,size:14},{x:80,y:30,size:14},
    {x:20,y:55,size:14},{x:50,y:55,size:14},{x:80,y:55,size:14},
    {x:20,y:80,size:14},{x:50,y:80,size:14},{x:80,y:80,size:14},{x:35,y:15,size:14},
    {x:50,y:12, rect:true, w:28, h:16}
  ];

  let positions = defaultPositions.slice();

  let assignments = {};
  let drawings = [];

  // Try load seating from server; fallback to localStorage
  const API_BASE = window.API_URL || '';
  async function loadFromServer(){
    try{
      const res = await fetch(API_BASE + '/api/seating');
      if (!res.ok) throw new Error('no-server');
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error('no-json');
      const data = await res.json();
      if (data.positions && data.positions.length) positions = data.positions;
      if (data.assignments) assignments = data.assignments;
      if (data.drawings) drawings = data.drawings;
    }catch(e){
      // fallback to localStorage if present
      try{const s = localStorage.getItem(seatingKey); if (s) assignments = JSON.parse(s);}catch(e){}
      try{const p = localStorage.getItem('wesele_positions_v1'); if (p) positions = JSON.parse(p);}catch(e){}
    }
  }

  async function saveToServer(){
    const token = localStorage.getItem('adminToken');
    const body = { positions, assignments, drawings };
    if (!token) { // fallback to localStorage
      localStorage.setItem(seatingKey, JSON.stringify(assignments));
      localStorage.setItem('wesele_positions_v1', JSON.stringify(positions));
      return;
    }
    try{
      const res = await fetch(API_BASE + '/api/seating', { method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('save-failed');
    }catch(e){
      // fallback to local
      localStorage.setItem(seatingKey, JSON.stringify(assignments));
      localStorage.setItem('wesele_positions_v1', JSON.stringify(positions));
    }
  }

  function createTables(){
    positions.forEach((p, i) => {
      const id = 't' + (i+1);
      const el = document.createElement('div');
      el.id = id;
      el.style.left = p.x + '%'; el.style.top = p.y + '%';
      // size
      if (p.rect){
        el.className = 'table rect';
        el.style.width = (p.w || 28) + '%'; el.style.height = (p.h || 16) + '%';
        const label = p.label || 'Para';
        el.innerHTML = `<div class="num">${label}</div><div class="names">Para Młoda</div>`;
      } else {
        el.className = 'table';
        const s = (p.size || 14);
        el.style.width = s + '%'; el.style.height = s + '%';
        const label = p.label || (i+1);
        el.innerHTML = `<div class="num">${label}</div><div class="names"></div>`;
      }
      if (p.color){ el.style.borderColor = p.color; const numNode = el.querySelector && el.querySelector('.num'); if (numNode) numNode.style.background = p.color; }
      // admin controls (resize / delete / edit appearance)
      const adminToken = localStorage.getItem('adminToken');
      if (adminToken){
        const ctrl = document.createElement('div'); ctrl.style.position='absolute'; ctrl.style.bottom='6px'; ctrl.style.right='6px';
        const plus = document.createElement('button'); plus.textContent='+'; plus.style.padding='4px'; plus.style.marginRight='4px';
        const minus = document.createElement('button'); minus.textContent='-'; minus.style.padding='4px';
        const del = document.createElement('button'); del.textContent='×'; del.style.padding='4px'; del.style.marginLeft='6px';
        const edit = document.createElement('button'); edit.textContent='✎'; edit.style.padding='4px'; edit.style.marginLeft='6px';
        plus.addEventListener('click', (e)=>{ e.stopPropagation(); resizeTable(id, 1.1); });
        minus.addEventListener('click', (e)=>{ e.stopPropagation(); resizeTable(id, 0.9); });
        del.addEventListener('click', (e)=>{ e.stopPropagation(); if (confirm('Usunąć stolik ' + id + '?')) deleteTable(id); });
        edit.addEventListener('click', (e)=>{ e.stopPropagation(); editAppearance(id); });
        ctrl.appendChild(plus); ctrl.appendChild(minus); ctrl.appendChild(edit); ctrl.appendChild(del); el.appendChild(ctrl);
      }
      el.addEventListener('click', (e) => { if (e.target && e.target.classList && e.target.classList.contains('person')) return; editTable(id); });
      hall.appendChild(el);
    });
    attachDragHandlers();
    renderAll();
  }

  // Add admin control button for adding a table
  (function addAdminControls(){
    const controls = document.querySelector('.seating-controls');
    if (!controls) return;
    if (document.getElementById('addTableBtn')) return; // already added
    const btn = document.createElement('button'); btn.id = 'addTableBtn'; btn.textContent = 'Dodaj stolik'; btn.className = 'btn-outline'; btn.style.marginLeft='6px';
    btn.addEventListener('click', ()=>{
      if (!localStorage.getItem('adminToken')){ alert('Tylko admin może dodawać stoliki.'); return; }
      addTable();
    });
    controls.appendChild(btn);
    // drawing controls (admin only)
    const drawBtn = document.createElement('button'); drawBtn.id='drawToggle'; drawBtn.textContent='Rysuj'; drawBtn.className='btn-outline'; drawBtn.style.marginLeft='6px';
    const colorIn = document.createElement('input'); colorIn.type='color'; colorIn.id='drawColor'; colorIn.value='#2f6f4e'; colorIn.style.marginLeft='6px';
    const clearBtnDraw = document.createElement('button'); clearBtnDraw.textContent='Wyczyść rysunek'; clearBtnDraw.className='btn-outline'; clearBtnDraw.style.marginLeft='6px';
    drawBtn.addEventListener('click', ()=>{
      if (!localStorage.getItem('adminToken')){ alert('Tylko admin może rysować.'); return; }
      toggleDrawMode();
    });
    clearBtnDraw.addEventListener('click', ()=>{ if (!localStorage.getItem('adminToken')){ alert('Tylko admin może czyścić.'); return; } if (confirm('Wyczyścić rysunki?')){ drawings = []; drawAllStrokes(); saveToServer(); } });
    controls.appendChild(drawBtn); controls.appendChild(colorIn); controls.appendChild(clearBtnDraw);
  })();

  function savePositions(newPositions){
    positions = newPositions;
    saveToServer();
  }

  function attachDragHandlers(){
    const isAdmin = !!localStorage.getItem('adminToken');
    document.querySelectorAll('.table').forEach(el => {
      el.onpointerdown = (ev) => {
        if (!localStorage.getItem('adminToken')) return; // only admin may drag
        ev.preventDefault();
        const rect = hall.getBoundingClientRect();
        const id = el.id;
        const onMove = (e) => {
          const clientX = e.clientX || (e.touches && e.touches[0].clientX);
          const clientY = e.clientY || (e.touches && e.touches[0].clientY);
          let nx = ((clientX - rect.left) / rect.width) * 100;
          let ny = ((clientY - rect.top) / rect.height) * 100;
          nx = Math.max(2, Math.min(98, nx)); ny = Math.max(2, Math.min(98, ny));
          el.style.left = nx + '%'; el.style.top = ny + '%';
          // update positions array
          const idx = parseInt(id.replace('t',''),10) - 1;
          positions[idx].x = nx; positions[idx].y = ny;
        };
        const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); savePositions(positions); };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      };
    });
  }

  function renderAll(){
    positions.forEach((_, i) => renderTable(i+1));
  }

  function renderTable(n){
    const el = document.getElementById('t'+n);
    const names = (assignments['t'+n] || []).slice(0,6);
    const namesDiv = el.querySelector('.names');
    namesDiv.textContent = names.join('\n') || 'Pusty stolik';
    el.classList.remove('highlight');
    renderPeopleForTable('t'+n);
  }

  function renderPeopleForTable(tableId){
    const el = document.getElementById(tableId);
    if (!el) return;
    // remove existing person nodes
    Array.from(el.querySelectorAll('.person')).forEach(p=>p.remove());
    const ppl = assignments[tableId] || [];
    const count = ppl.length;
    if (count === 0) return;
    // render people outside table edge (around rim)
    const angleStep = (Math.PI*2)/count;
    const distancePercent = 80; // percent from center (50% is center)
    for(let i=0;i<count;i++){
      const angle = (i * angleStep) - Math.PI/2; // start at top
      const cx = 50 + Math.cos(angle) * distancePercent;
      const cy = 50 + Math.sin(angle) * distancePercent;
      const person = document.createElement('div'); person.className = 'person';
      Object.assign(person.style, { position:'absolute', left:cx+'%', top:cy+'%', transform:'translate(-50%,-50%)', width:'26px', height:'26px', borderRadius:'50%', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 2px rgba(0,0,0,0.12)', cursor:'pointer', border:'1px solid rgba(0,0,0,0.06)'});
      // small icon (initials)
      const name = ppl[i] || '';
      const initials = name.split(' ').map(s=>s[0]||'').slice(0,2).join('').toUpperCase() || 'G';
      person.textContent = initials;
      person.title = name;
      // label
      const label = document.createElement('div'); label.className = 'person-label'; label.textContent = name; label.style.display = 'none';
      person.addEventListener('mouseenter', ()=> label.style.display = 'block');
      person.addEventListener('mouseleave', ()=> label.style.display = 'none');
      el.appendChild(person); el.appendChild(label);
      person.dataset.idx = i;
      person.addEventListener('click', (ev)=>{ ev.stopPropagation(); showPersonDetail(tableId, i); });
    }
  }

  // Drawing canvas overlay
  let drawMode = false;
  let canvas, ctx;
  function ensureCanvas(){
    if (canvas) return;
    canvas = document.createElement('canvas'); canvas.id='seatingCanvas';
    Object.assign(canvas.style, { position:'absolute', left:0, top:0, width:'100%', height:'100%', zIndex:998, pointerEvents:'none' });
    hall.appendChild(canvas);
    ctx = canvas.getContext('2d');
    function resize(){ const r = hall.getBoundingClientRect(); canvas.width = Math.round(r.width); canvas.height = Math.round(r.height); canvas.style.left = '0'; canvas.style.top = '0'; drawAllStrokes(); }
    window.addEventListener('resize', resize);
    resize();
  }

  function toggleDrawMode(){ ensureCanvas(); drawMode = !drawMode; const btn = document.getElementById('drawToggle'); if (drawMode){ btn.textContent='Zakończ rysowanie'; canvas.style.pointerEvents='auto'; enableDrawing(); } else { btn.textContent='Rysuj'; canvas.style.pointerEvents='none'; disableDrawing(); }
  }

  let drawingStroke = null;
  function enableDrawing(){
    if (!canvas) ensureCanvas();
    const colorInput = document.getElementById('drawColor');
    function onDown(e){ e.preventDefault(); const rect = canvas.getBoundingClientRect(); drawingStroke = { color: colorInput.value||'#000', width: 3, points: [] }; const x = (e.clientX - rect.left); const y = (e.clientY - rect.top); drawingStroke.points.push([x,y]); }
    function onMove(e){ if (!drawingStroke) return; const rect = canvas.getBoundingClientRect(); const x = (e.clientX - rect.left); const y = (e.clientY - rect.top); drawingStroke.points.push([x,y]); drawAllStrokes(true); }
    function onUp(e){ if (!drawingStroke) return; drawings.push(drawingStroke); drawingStroke = null; saveToServer(); }
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas._handlers = { onDown, onMove, onUp };
  }

  function disableDrawing(){ if (!canvas || !canvas._handlers) return; const h = canvas._handlers; canvas.removeEventListener('pointerdown', h.onDown); canvas.removeEventListener('pointermove', h.onMove); canvas.removeEventListener('pointerup', h.onUp); canvas._handlers = null; }

  function drawAllStrokes(temp){
    if (!canvas) return; ctx.clearRect(0,0,canvas.width,canvas.height);
    // draw saved strokes
    for(const s of drawings){ ctx.strokeStyle = s.color || '#000'; ctx.lineWidth = s.width||3; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.beginPath(); const pts = s.points || []; for(let i=0;i<pts.length;i++){ const [x,y] = pts[i]; if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); } ctx.stroke(); }
    // draw current
    if (temp && drawingStroke){ ctx.strokeStyle = drawingStroke.color||'#000'; ctx.lineWidth = drawingStroke.width||3; ctx.beginPath(); const pts = drawingStroke.points; for(let i=0;i<pts.length;i++){ const [x,y]=pts[i]; if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); } ctx.stroke(); }
  }

  function showPersonDetail(tableId, idx){
    const arr = assignments[tableId] || [];
    const name = arr[idx];
    if (!name) return;
    // non-admins see read-only info
    if (!localStorage.getItem('adminToken')){
      alert(name + '\n\nPrzy ' + tableId + ' siedzą:\n' + arr.join('\n'));
      return;
    }
    // admin may edit person
    const newName = prompt('Szczegóły osoby przy ' + tableId + '\nWpisz imię i nazwisko:', name);
    if (newName === null) return;
    if (newName.trim()) arr[idx] = newName.trim(); else arr.splice(idx,1);
    assignments[tableId] = arr.length? arr : undefined;
    renderTable(parseInt(tableId.replace('t',''),10));
    saveToServer();
  }

  function addTable(){
    // add at center with default size
    const p = { x:50, y:50, size:12 };
    positions.push(p);
    // ensure assignments array stays consistent
    // rebuild UI
    hall.innerHTML = '<div class="hall-label">Sala weselna</div>';
    createTables();
    saveToServer();
  }

  function editTable(id){
    const currentArr = assignments[id] || [];
    // If not admin, show a read-only list of assigned people
    if (!localStorage.getItem('adminToken')){
      const info = currentArr.length ? currentArr.join('\n') : 'Pusty stolik';
      alert('Przy ' + id + ' siedzą:\n\n' + info);
      return;
    }
    // admin may edit
    const current = currentArr.join(', ');
    const input = prompt('Wpisz imiona gości dla ' + id + ' (oddziel przecinkami):', current);
    if (input === null) return;
    const arr = input.split(',').map(s=>s.trim()).filter(Boolean);
    if (arr.length) assignments[id] = arr;
    else delete assignments[id];
    renderAll();
    saveToServer();
  }

  function findPerson(name){
    const key = name.trim().toLowerCase();
    if (!key) return null;
    for(const t in assignments){
      for(const person of assignments[t]){
        if (person && person.toLowerCase().includes(key)) return {table:t,names:assignments[t]};
      }
    }
    return null;
  }

  searchInput.addEventListener('input', ()=>{
    const q = searchInput.value.trim();
    // clear previous highlights
    document.querySelectorAll('.table').forEach(el=>el.classList.remove('highlight'));
    if (!q) return;
    const res = findPerson(q);
    if (res){
      const el = document.getElementById(res.table);
      if (el) {
        el.classList.add('highlight');
        // bring into view
        try{ el.scrollIntoView({behavior:'smooth', block:'center', inline:'center'}); }catch(e){}
      }
      document.getElementById('seatingInfo').textContent = `Znaleziono przy stoliku ${res.table.replace('t','')}: ${res.names.join(', ')}`;
    } else {
      document.getElementById('seatingInfo').textContent = 'Nie znaleziono gościa o takim imieniu.';
    }
  });

  clearBtn.addEventListener('click', ()=>{
    searchInput.value = ''; document.getElementById('seatingInfo').textContent = 'Kliknij stolik, aby przypisać listę gości (oddziel przecinkami). Dane zapisywane lokalnie w przeglądarce.';
    document.querySelectorAll('.table').forEach(el=>el.classList.remove('highlight'));
  });
  function resizeTable(id, factor){
    const idx = parseInt(id.replace('t',''),10) - 1;
    const p = positions[idx];
    if (!p) return;
    if (p.rect){ p.w = Math.max(6, Math.min(60, (p.w||28) * factor)); p.h = Math.max(6, Math.min(40, (p.h||16) * factor)); }
    else { p.size = Math.max(6, Math.min(40, (p.size||14) * factor)); }
    // apply style
    const el = document.getElementById(id);
    if (p.rect){ el.style.width = p.w + '%'; el.style.height = p.h + '%'; }
    else { el.style.width = p.size + '%'; el.style.height = p.size + '%'; }
    saveToServer();
  }

  function deleteTable(id){
    const idx = parseInt(id.replace('t',''),10) - 1;
    if (isNaN(idx)) return;
    // remove position and assignment
    positions.splice(idx,1);
    // rebuild assignments: shift any table > idx down by 1
    const newAssignments = {};
    Object.keys(assignments).forEach(k=>{
      const n = parseInt(k.replace('t',''),10);
      if (n <= idx+1) {
        // keep as-is if before removed
        if (assignments[k]) newAssignments[k] = assignments[k];
      } else {
        // shift down
        const newKey = 't' + (n-1);
        newAssignments[newKey] = assignments[k];
      }
    });
    assignments = newAssignments;
    // persist
    saveToServer();
    // rebuild UI
    hall.innerHTML = '<div class="hall-label">Sala weselna</div>';
    createTables();
  }

  function editAppearance(id){
    const idx = parseInt(id.replace('t',''),10) - 1;
    if (isNaN(idx)) return;
    const p = positions[idx] || {};
    const label = prompt('Etykieta stolika (np. Numer lub Para):', p.label || (p.rect? 'Para': 'Stolik ' + (idx+1)));
    const color = prompt('Kolor obramowania (np. #2f6f4e):', p.color || '');
    if (label === null && color === null) return;
    if (label !== null) p.label = label;
    if (color !== null) p.color = (color||'').trim() || undefined;
    positions[idx] = p;
    // apply immediately
    const el = document.getElementById(id);
    if (el){
      if (p.label){ const num = el.querySelector('.num'); if (num) num.textContent = p.label; }
      if (p.color){ el.style.borderColor = p.color; const num = el.querySelector('.num'); if (num) num.style.background = p.color; }
    }
    saveToServer();
  }

  // initialize (load server data first)
  (async ()=>{
    await loadFromServer();
    createTables();
  })();
})();
