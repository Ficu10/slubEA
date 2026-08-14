// auth.js — handle showing login/logout in top-nav and logout action
(function(){
  function updateNav(){
    const token = localStorage.getItem('adminToken');
    document.querySelectorAll('.top-nav').forEach(nav => {
      // remove any existing logout
      const existingLogout = nav.querySelector('.logout-btn');
      if (existingLogout) existingLogout.remove();
      const loginLink = nav.querySelector('a[href="/login.html"]');
      if (token){
        if (loginLink) loginLink.style.display = 'none';
        const out = document.createElement('button'); out.textContent = 'Wyloguj'; out.className = 'btn-outline logout-btn';
        out.addEventListener('click', ()=>{ localStorage.removeItem('adminToken'); location.reload(); });
        nav.appendChild(out);
      } else {
        if (loginLink) loginLink.style.display = '';
      }
    });
  }
  // run on load
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateNav);
  else updateNav();
  // expose for manual call
  window.authUpdateNav = updateNav;
})();
