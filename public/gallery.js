(function(){
  const base = window.API_URL || '';

  // Cloudflare R2 Custom Domain - podgląd zdjęć i filmów
  const CDN_BASE = 'https://cdn.emilkaiadas.pl';

  // Cloudflare Worker - wymusza pobieranie pliku
  const DOWNLOAD_BASE = 'https://r2-download.adficu.workers.dev';

  const type = document.body.dataset.mediaType;
  const box = document.getElementById('mediaGrid');

  let items = [];
  let current = 0;

  // URL używany do wyświetlania zdjęć i filmów
  const urlFor = item =>
    item.key
      ? CDN_BASE + '/' + item.key.split('/').map(encodeURIComponent).join('/')
      : item.url;

  // URL używany wyłącznie do pobierania
  const downloadUrlFor = item =>
    item.key
      ? DOWNLOAD_BASE + '/' + item.key.split('/').map(encodeURIComponent).join('/')
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
   * Pobieranie odbywa się przez Cloudflare Worker.
   *
   * Worker pobiera plik bezpośrednio z R2
   * i zwraca go z nagłówkiem:
   *
   * Content-Disposition: attachment
   *
   * Dzięki temu przeglądarka pobiera plik,
   * zamiast otwierać go w nowej karcie.
   *
   * Vercel nie przesyła tutaj danych pliku.
   */
  function downloadFile(item){
    const url = downloadUrlFor(item);

    const link = document.createElement('a');

    link.href = url;
    link.download = item.name || 'plik';
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

    // Podgląd nadal bezpośrednio z Cloudflare CDN
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
   * API zwraca tylko informacje o plikach:
   * key, name, type itd.
   *
   * Same zdjęcia i filmy są ładowane bezpośrednio
   * z Cloudflare CDN.
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

        // Miniaturka bezpośrednio z Cloudflare CDN
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