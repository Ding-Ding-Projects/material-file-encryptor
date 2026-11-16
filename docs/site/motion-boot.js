/* Runs before first paint so the saved motion setting applies without a flash. It is a classic script with no imports.
   Content is never hidden here: script only opts the page into motion when the visitor allows it. */
(function () {
 try {
  var root = document.documentElement, saved = null;
  try { saved = JSON.parse(localStorage.getItem('mfe.site.motion.v1') || 'null'); } catch (error) { saved = null; }
  var mode = saved && (saved.mode === 'reduced' || saved.mode === 'off') ? saved.mode : 'full';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.dataset.motionMode = mode;
  if (mode !== 'full' && !root.dataset.motion) { root.dataset.motion = 'reduced'; root.dataset.motionBy = 'site'; }
  if (mode === 'full' && !reduce && 'IntersectionObserver' in window) root.classList.add('motion-on', 'js-reveal');
  else if (mode === 'full' && !reduce) root.classList.add('motion-on');
  var vars = saved && saved.vars;
  if (vars && typeof vars === 'object') for (var key in vars) if (/^--m-[a-z-]+$/.test(key) && /^[-a-z0-9.(),% ]+$/.test(String(vars[key]))) root.style.setProperty(key, String(vars[key]));
  var sound = null;
  try { sound = JSON.parse(localStorage.getItem('mfe.site.reading.v1') || 'null'); } catch (error) { sound = null; }
  if (sound && sound.width === 'wide') root.dataset.readingWidth = 'wide';
 } catch (error) { /* Storage can be unavailable; the page then uses its defaults. */ }
})();
