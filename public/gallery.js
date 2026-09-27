(function(){
  const base = window.API_URL || '';
  const CDN_BASE = 'https://cdn.emilkaiadas.pl';
  const type = document.body.dataset.mediaType;
  const box = document.getElementById('mediaGrid');

  let items = [];
  let current = 0;

  const urlFor = item =>
    item.key
      ? CDN_BASE + '/' + item.key.split('/').map(encodeURIComponent).join('/')
      : item.url;

  function closePreview(){
    const modal = document.getElementById('mediaPreview');

    if (modal) {
      modal.remove();
    }

    document.removeEventListener('keydown', onKey);
  }

  function onKey(event){
    if (event.key === 'ArrowLeft') {
      showPreview((current - 1 + items.length) % items.length);
    }

    if (event.key === 'ArrowRight') {
      showPreview((current + 1) % items.length);
    }

    if (event.key === 'Escape') {
      closePreview();
    }
  }

  /*
   * Pobieranie odbywa się bezpośrednio z Cloudflare CDN.
   *
   * NIE używamy tutaj:
   *   fetch()
   *   response.blob()
   *   URL.createObjectURL()
   *
   * Dzięki temu plik nie jest przesyłany przez Vercel.
   */
  function downloadFile(item){
    const url = urlFor(item);

    const link = document.createElement('a');

    link.href = url;
    link.download = item.name || 'plik';

    // Dodatkowa informacja dla przeglądarki.
    link.rel = 'noopener';

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function showPreview(index){
    current = index;

    let modal = document.getElementById('mediaPreview');

    if (!modal){
      modal = document.createElement('div');
      modal.id = 'mediaPreview';
      modal.className = 'media-preview';

      document.body.appendChild(modal);
    }

    modal.hidden = false;
    modal.innerHTML = '';

    const item = items[current];

    const close = document.createElement('button');
    close.className = 'media-close';
    close.textContent = '×';
    close.title = 'Zamknij';
    close.type = 'button';
    close.onclick = closePreview;

    const previous = document.createElement('button');
    previous.className = 'media-nav media-prev';
    previous.textContent = '‹';
    previous.title = 'Poprzedni';
    previous.type = 'button';

    previous.onclick = () =>
      showPreview((current - 1 + items.length) % items.length);

    const next = document.createElement('button');
    next.className = 'media-nav media-next';
    next.textContent = '›';
    next.title = 'Następny';
    next.type = 'button';

    next.onclick = () =>
      showPreview((current + 1) % items.length);

    const download = document.createElement('button');
    download.className = 'media-download';
    download.textContent = '⇩';
    download.title = 'Pobierz';
    download.type = 'button';

    download.onclick = event => {
      event.preventDefault();
      event.stopPropagation();

      downloadFile(item);
    };

    const content =
      item.type === 'video'
        ? document.createElement('video')
        : document.createElement('img');

    content.src = urlFor(item);
    content.alt = item.name || '';
    content.className = 'media-content';

    if (item.type === 'video'){
      content.controls = true;
      content.autoplay = true;
      content.playsInline = true;
    }

    modal.append(
      close,
      previous,
      next,
      download,
      content
    );

    modal.onclick = event => {
      if (event.target === modal) {
        closePreview();
      }
    };

    document.addEventListener('keydown', onKey);
  }

  /*
   * Lista plików nadal jest pobierana z API.
   *
   * To API zwraca tylko informacje o plikach
   * (np. key, name, type).
   *
   * Same zdjęcia i filmy są następnie ładowane
   * bezpośrednio z Cloudflare CDN.
   */
  (async function(){
    try {
      const response = await fetch(base + '/api/files');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      items = (await response.json())
        .filter(item => item.type === type);

      box.innerHTML = '';

      if (!items.length){
        box.innerHTML =
          '<p>Brak przesłanych ' +
          (type === 'image' ? 'zdjęć.' : 'filmów.') +
          '</p>';

        return;
      }

      items.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'card media-thumb';

        const thumb =
          item.type === 'video'
            ? document.createElement('video')
            : document.createElement('img');

        thumb.src = urlFor(item);
        thumb.alt = item.name || '';

        if (item.type === 'video'){
          thumb.muted = true;
          thumb.preload = 'metadata';
          thumb.playsInline = true;
        }

        card.appendChild(thumb);

        card.onclick = () => showPreview(index);

        box.appendChild(card);
      });

    } catch(error){
      console.error('Błąd pobierania listy plików:', error);

      box.textContent = 'Nie udało się pobrać plików.';
    }
  })();

})();

