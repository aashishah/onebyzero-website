/* OneByZero – page effects (nav state, scroll reveal, card spotlight, form prefill).
   Independent of js/script.js, which keeps handling Swiper and the contact form. */
(() => {
    'use strict';

    const doc = document;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Nav: glass background after scrolling */
    const nav = doc.querySelector('.site-nav');
    const onScroll = () => {
        if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    /* Nav: close the mobile menu after choosing a link */
    const menu = doc.getElementById('navbarNav');
    doc.querySelectorAll('#navbarNav a').forEach((link) => {
        link.addEventListener('click', () => {
            if (menu && menu.classList.contains('show') && window.bootstrap) {
                window.bootstrap.Collapse.getOrCreateInstance(menu).hide();
            }
        });
    });

    /* Scroll reveal */
    const items = Array.from(doc.querySelectorAll('.reveal'));

    if (!('IntersectionObserver' in window) || reduceMotion) {
        items.forEach((el) => el.classList.remove('reveal'));
    } else {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    const el = entry.target;
                    observer.unobserve(el);
                    el.classList.add('is-visible');
                    // Hand the element back to its own hover transitions once the reveal is done
                    setTimeout(() => {
                        el.classList.remove('reveal', 'is-visible');
                        el.style.removeProperty('--d');
                    }, 1700);
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
        );

        items.forEach((el) => {
            const siblings = Array.from(el.parentElement.children).filter((c) => c.classList.contains('reveal'));
            el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 6) * 0.08}s`);
            observer.observe(el);
        });
    }

    /* Service cards: cursor spotlight */
    doc.querySelectorAll('.service-card').forEach((card) => {
        card.addEventListener('pointermove', (e) => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
            card.style.setProperty('--my', `${e.clientY - rect.top}px`);
        });
    });

    /* Buttons with data-service pre-select that service in the contact form */
    doc.querySelectorAll('[data-service]').forEach((el) => {
        el.addEventListener('click', () => {
            const select = doc.getElementById('service');
            if (select) select.value = el.dataset.service;
        });
    });
})();
