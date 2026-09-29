/**
 * BOULD Hero — Title-First Load Choreography (FLIP)
 *
 * 1. H1 renders centered in viewport immediately (CSS, no JS needed) — this is LCP
 * 2. After DOM ready, FLIP animates content from center to final left-aligned position
 * 3. After FLIP completes, canvas cross-fades in behind text
 * 4. Mobile: no FLIP (already stacked), canvas reveals after short delay
 * 5. Reduced motion: everything instant
 */
(function () {
  var content = document.querySelector('.bould-hero__content');
  var canvas  = document.querySelector('.bould-hero__canvas');
  var hero    = document.querySelector('.bould-hero');

  if (!content || !hero) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = window.innerWidth < 768; // must match bould-scene.js

  // Start canvas hidden (will cross-fade in after choreography)
  if (canvas && !reducedMotion) {
    canvas.classList.add('is-hidden');
  }

  if (reducedMotion) {
    // Instant final state — CSS handles via media query
    content.classList.add('is-final');
    revealCanvas();
    return;
  }

  if (isMobile) {
    // Mobile: no FLIP, just reveal canvas after a short delay
    content.classList.add('is-final');
    setTimeout(revealCanvas, 400);
    return;
  }

  // ── FLIP Animation ──
  // FIRST: Record the centered position
  var firstRect = content.getBoundingClientRect();

  // Apply final state class (switches to left-aligned layout)
  content.classList.add('is-final');

  // LAST: Record the final position
  var lastRect = content.getBoundingClientRect();

  // INVERT: Calculate the delta
  var dx = firstRect.left - lastRect.left;
  var dy = firstRect.top - lastRect.top;

  // Apply the inversion transform so it visually stays in the centered position
  content.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
  content.style.transition = 'none';

  // Force reflow
  content.offsetHeight; // eslint-disable-line no-unused-expressions

  // PLAY: Animate to the final position
  content.style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
  content.style.transform = 'translate(0, 0)';

  content.addEventListener('transitionend', function onEnd(e) {
    if (e.propertyName !== 'transform') return;
    content.removeEventListener('transitionend', onEnd);
    content.style.transition = '';
    content.style.transform = '';

    // After FLIP completes, cross-fade canvas in
    revealCanvas();
  });

  // Safety fallback: if transitionend never fires (e.g. zero delta)
  setTimeout(function () {
    if (canvas && canvas.classList.contains('is-hidden')) {
      revealCanvas();
    }
  }, 1200);

  function revealCanvas() {
    if (revealCanvas.done) return;
    revealCanvas.done = true;

    if (canvas) canvas.classList.remove('is-hidden');

    /* Hand off to the Three.js scene.
       This script runs before bould-scene.js has executed, so window.__bouldScene
       is normally still undefined here — the latch below is what the scene reads
       when it boots. The event covers the reverse order, and the direct call is a
       third path for when the scene is already live (e.g. a re-run). */
    window.__bouldHeroRevealed = true;
    document.dispatchEvent(new CustomEvent('bould:hero-revealed'));

    if (window.__bouldScene && typeof window.__bouldScene.reveal === 'function') {
      window.__bouldScene.reveal();
    }
  }
})();
