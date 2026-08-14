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

  // Try load seating from server; fallback to localStorage
  async function loadFromServer(){
    try{
      const res = await fetch('/api/seating');
      if (!res.ok) throw new Error('no-server');
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error('no-json');
      const data = await res.json();
      if (data.positions && data.positions.length) positions = data.positions;
      if (data.assignments) assignments = data.assignments;
    }catch(e){
      // fallback to localStorage if present
      try{const s = localStorage.getItem(seatingKey); if (s) assignments = JSON.parse(s);}catch(e){}
      try{const p = localStorage.getItem('wesele_positions_v1'); if (p) positions = JSON.parse(p);}catch(e){}
    }
  }

  async function saveToServer(){
    const token = localStorage.getItem('adminToken');
    const body = { positions, assignments };
    if (!token) { // fallback to localStorage
      localStorage.setItem(seatingKey, JSON.stringify(assignments));
      localStorage.setItem('wesele_positions_v1', JSON.stringify(positions));
      return;
    }
    try{
      const res = await fetch('/api/seating', { method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token }, body: JSON.stringify(body) });
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
        el.innerHTML = `<div class="num">Para</div><div class="names">Para Młoda</div>`;
      } else {
        el.className = 'table';
        const s = (p.size || 14);
        el.style.width = s + '%'; el.style.height = s + '%';
        el.innerHTML = `<div class="num">${i+1}</div><div class="names"></div>`;
      }
      // admin controls (resize)
      const adminToken = localStorage.getItem('adminToken');
      if (adminToken){
        const ctrl = document.createElement('div'); ctrl.style.position='absolute'; ctrl.style.bottom='6px'; ctrl.style.right='6px';
        const plus = document.createElement('button'); plus.textContent='+'; plus.style.padding='4px'; plus.style.marginRight='4px';
        const minus = document.createElement('button'); minus.textContent='-'; minus.style.padding='4px';
        plus.addEventListener('click', (e)=>{ e.stopPropagation(); resizeTable(id, 1.1); });
        minus.addEventListener('click', (e)=>{ e.stopPropagation(); resizeTable(id, 0.9); });
        ctrl.appendChild(plus); ctrl.appendChild(minus); el.appendChild(ctrl);
      }
      el.addEventListener('click', () => editTable(id));
      hall.appendChild(el);
    });
    attachDragHandlers();
    renderAll();
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
  }

  function editTable(id){
    // only admin may edit guest lists
    if (!localStorage.getItem('adminToken')){ alert('Tylko zalogowany admin może przypisywać gości.'); return; }
    const current = (assignments[id] || []).join(', ');
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
      if (el) el.classList.add('highlight');
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

  // initialize (load server data first)
  (async ()=>{
    await loadFromServer();
    createTables();
  })();
})();
