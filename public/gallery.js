(function(){
  const base = window.API_URL || '';
  const type = document.body.dataset.mediaType;
  const box = document.getElementById('mediaGrid');
  let items = [];
  let current = 0;
  const urlFor = item => item.key ? base + '/api/zdjecia?key=' + encodeURIComponent(item.key) : item.url;

  function closePreview(){
    const modal = document.getElementById('mediaPreview');
    if (modal) modal.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(event){
    if (event.key === 'ArrowLeft') showPreview((current - 1 + items.length) % items.length);
    if (event.key === 'ArrowRight') showPreview((current + 1) % items.length);
    if (event.key === 'Escape') closePreview();
  }
  function showPreview(index){
    current = index;
    let modal = document.getElementById('mediaPreview');
    if (!modal){ modal = document.createElement('div'); modal.id = 'mediaPreview'; modal.className = 'media-preview'; document.body.appendChild(modal); }
    modal.hidden = false; modal.innerHTML = '';
    const item = items[current];
    const close = document.createElement('button'); close.className='media-close'; close.textContent='×'; close.title='Zamknij'; close.onclick=closePreview;
    const previous = document.createElement('button'); previous.className='media-nav media-prev'; previous.textContent='‹'; previous.title='Poprzedni'; previous.onclick=()=>showPreview((current-1+items.length)%items.length);
    const next = document.createElement('button'); next.className='media-nav media-next'; next.textContent='›'; next.title='Następny'; next.onclick=()=>showPreview((current+1)%items.length);
    const download = document.createElement('a'); download.className='media-download'; download.textContent='⇩'; download.title='Pobierz'; download.setAttribute('download', item.name || 'plik'); download.href=urlFor(item);
    const content = item.type === 'video' ? document.createElement('video') : document.createElement('img');
    content.src=urlFor(item); content.alt=item.name || ''; content.className='media-content'; if(item.type==='video'){content.controls=true;content.autoplay=true;}
    modal.append(close, previous, next, download, content); modal.onclick=e=>{if(e.target===modal)closePreview();}; document.addEventListener('keydown',onKey);
  }
  (async function(){
    try{
      const response=await fetch(base+'/api/files');
      items=(await response.json()).filter(item=>item.type===type);
      box.innerHTML='';
      if(!items.length){box.innerHTML='<p>Brak przesłanych '+(type==='image'?'zdjęć.':'filmów.')+'</p>';return;}
      items.forEach((item,index)=>{const card=document.createElement('div');card.className='card media-thumb';const thumb=item.type==='video'?document.createElement('video'):document.createElement('img');thumb.src=urlFor(item);thumb.alt=item.name||'';if(item.type==='video'){thumb.muted=true;thumb.preload='metadata';}card.appendChild(thumb);card.onclick=()=>showPreview(index);box.appendChild(card);});
    }catch(_){box.textContent='Nie udało się pobrać plików.';}
  })();
})();
