/**
 * BOULD Scroll Animations — GSAP + ScrollTrigger
 * Loaded after GSAP CDN script.
 */
(function () {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  /* ── Cursor ── */
  const dot  = document.querySelector('.bould-cursor__dot');
  const ring = document.querySelector('.bould-cursor__ring');

  if (dot && ring) {
    let mouseX = 0, mouseY = 0;
    let ringX  = 0, ringY  = 0;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      gsap.set(dot, { x: mouseX, y: mouseY });
    });

    gsap.ticker.add(() => {
      ringX += (mouseX - ringX) * 0.12;
      ringY += (mouseY - ringY) * 0.12;
      gsap.set(ring, { x: ringX, y: ringY });
    });

    document.querySelectorAll('a, button, .bould-service-item, .bould-work-card').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        document.querySelector('.bould-cursor')?.classList.add('bould-cursor--hover');
      });
      el.addEventListener('mouseleave', () => {
        document.querySelector('.bould-cursor')?.classList.remove('bould-cursor--hover');
      });
    });
  }

  /* ── Hero entrance ── */
  const heroTl = gsap.timeline({ delay: 0.3 });

  heroTl
    .to('.bould-hero__eyebrow', {
      opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
    })
    .to('.bould-hero__headline .line-inner', {
      y: 0, duration: 1, ease: 'power4.out', stagger: 0.12,
    }, '-=0.4')
    .to('.bould-hero__body', {
      opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
    }, '-=0.5')
    .to('.bould-hero__actions', {
      opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
    }, '-=0.5')
    .to('.bould-hero__scroll', {
      opacity: 1, duration: 0.6, ease: 'power2.out',
    }, '-=0.3')
    .to('.bould-hero__stats', {
      opacity: 1, y: 0, duration: 0.8, ease: 'power3.out',
    }, '-=0.6');

  /* ── Generic scroll reveals ── */
  gsap.utils.toArray('.bould-reveal').forEach((el) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 85%',
        once: true,
      },
    });
  });

  gsap.utils.toArray('.bould-reveal-left').forEach((el) => {
    gsap.to(el, {
      opacity: 1, x: 0, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  gsap.utils.toArray('.bould-reveal-right').forEach((el) => {
    gsap.to(el, {
      opacity: 1, x: 0, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });

  gsap.utils.toArray('.bould-reveal-scale').forEach((el) => {
    gsap.to(el, {
      opacity: 1, scale: 1, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });

  /* Line-by-line reveals */
  gsap.utils.toArray('.bould-line-reveal-inner').forEach((el, i) => {
    const parent = el.closest('.bould-line-reveal') || el.parentElement;
    gsap.to(el, {
      y: 0, duration: 1, ease: 'power4.out',
      scrollTrigger: { trigger: parent, start: 'top 88%', once: true },
      delay: i * 0.08,
    });
  });

  /* Staggered children */
  document.querySelectorAll('[data-bould-stagger]').forEach((parent) => {
    const children = parent.children;
    gsap.to(children, {
      opacity: 1, y: 0,
      duration: 0.7, ease: 'power3.out',
      stagger: 0.1,
      scrollTrigger: { trigger: parent, start: 'top 85%', once: true },
    });
  });

  /* ── Stats counting animation ── */
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals) : 0;

    const obj = { val: 0 };

    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(obj, {
          val: target,
          duration: 2,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = prefix + obj.val.toFixed(decimals) + suffix;
          },
          onComplete: () => {
            el.textContent = prefix + target.toFixed(decimals) + suffix;
          },
        });
      },
    });
  });

  /* ── Work cards stagger ── */
  gsap.utils.toArray('.bould-work-card').forEach((card, i) => {
    gsap.fromTo(card,
      { opacity: 0, y: 60, scale: 0.95 },
      {
        opacity: 1, y: 0, scale: 1,
        duration: 0.8, ease: 'power3.out',
        delay: (i % 3) * 0.12,
        scrollTrigger: { trigger: card, start: 'top 90%', once: true },
      }
    );
  });

  /* ── Services list reveal ── */
  gsap.utils.toArray('.bould-service-item').forEach((item, i) => {
    gsap.fromTo(item,
      { opacity: 0, x: -30 },
      {
        opacity: 1, x: 0,
        duration: 0.7, ease: 'power3.out',
        delay: i * 0.07,
        scrollTrigger: { trigger: '.bould-services__list', start: 'top 85%', once: true },
      }
    );
  });

  /* ── Tech pills stagger ── */
  gsap.utils.toArray('.bould-tech-pill').forEach((pill, i) => {
    gsap.fromTo(pill,
      { opacity: 0, y: 20 },
      {
        opacity: 1, y: 0,
        duration: 0.5, ease: 'power3.out',
        delay: i * 0.06,
        scrollTrigger: { trigger: '.bould-capabilities__tech', start: 'top 85%', once: true },
      }
    );
  });

  /* ── CTA title split animation ── */
  const ctaTitle = document.querySelector('.bould-cta__title');
  if (ctaTitle) {
    const spans = ctaTitle.querySelectorAll('span');
    gsap.fromTo(spans,
      { y: '100%', opacity: 0 },
      {
        y: '0%', opacity: 1,
        duration: 1, ease: 'power4.out',
        stagger: 0.15,
        scrollTrigger: { trigger: ctaTitle, start: 'top 80%', once: true },
      }
    );
  }

  /* ── Stats headline ── */
  const statsHeadline = document.querySelector('.bould-stats__headline');
  if (statsHeadline) {
    gsap.fromTo(statsHeadline,
      { opacity: 0, y: 30 },
      {
        opacity: 1, y: 0, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: statsHeadline, start: 'top 85%', once: true },
      }
    );
  }

  /* ── Sticky header: add .scrolled when page scrolls past ~60px ── */
  const headerWrapper = document.querySelector('.header-wrapper');
  if (headerWrapper) {
    const onScroll = () => {
      headerWrapper.classList.toggle('scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // apply on load in case page is already scrolled
  }

})();
