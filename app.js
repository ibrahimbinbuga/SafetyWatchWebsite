/* SafetyWatch AI — interactions
   - Reveal on scroll (IntersectionObserver)
   - Count-up for stat numbers
   - Smooth nav scroll on anchor click (handled by CSS)
*/

(function () {
  'use strict';

  // ── Reveal on scroll ──────────────────────────────────────────
  const revealEls = document.querySelectorAll('.reveal-up, .reveal-left, .reveal-scale');
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  revealEls.forEach((el) => revealObs.observe(el));

  // ── Count-up for stat numbers ─────────────────────────────────
  // Element opts in via data-count="<target>" and optional data-decimals.
  // Original text content is used as the display template ($N is replaced with the animated number).
  function formatNum(value, decimals) {
    if (decimals > 0) return value.toFixed(decimals);
    return Math.round(value).toLocaleString('tr-TR');
  }

  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const duration = 1400;
    const start = performance.now();

    // Stash the original "template" (the text the author wrote, e.g. "99.2%")
    // We'll just animate the number portion and keep any suffix unit in a <span class="unit"> outside.
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const value = target * eased;
      el.firstChild.nodeValue = formatNum(value, decimals);
      if (t < 1) requestAnimationFrame(frame);
      else el.firstChild.nodeValue = formatNum(target, decimals);
    }
    requestAnimationFrame(frame);
  }

  const countEls = document.querySelectorAll('[data-count]');
  const countObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        animateCount(e.target);
        countObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.4 });

  countEls.forEach((el) => {
    // Initialize display to 0 (preserve any sibling unit span)
    el.firstChild.nodeValue = '0';
    countObs.observe(el);
  });

  // ── Nav: hide on scroll down, show on scroll up ──────────────
  let lastY = window.scrollY;
  const nav = document.querySelector('nav.topnav');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > 80 && y > lastY) {
      nav.style.transform = 'translateY(-100%)';
    } else {
      nav.style.transform = 'translateY(0)';
    }
    nav.style.transition = 'transform 0.3s var(--ease-smooth)';
    lastY = y;
  }, { passive: true });
})();
