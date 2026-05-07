import { I18n } from './i18n.js';

class App {
    constructor() {
        this.i18n = new I18n();
        this.components = [
            { id: 'nav-placeholder',      file: 'components/nav.html' },
            { id: 'hero-placeholder',     file: 'components/hero.html' },
            { id: 'about-placeholder',    file: 'components/about.html' },
            { id: 'club-placeholder',     file: 'components/club.html' },
            { id: 'menu-placeholder',     file: 'components/menu.html' },
            { id: 'location-placeholder', file: 'components/location.html' },
            { id: 'footer-placeholder',   file: 'components/footer.html' }
        ];
    }

    async init() {
        // Apply saved theme before render to avoid flash
        this.applyTheme(localStorage.getItem('theme-preview') || 'dark');

        await Promise.all(this.components.map(c => this.loadComponent(c.id, c.file)));

        await this.i18n.init();
        this.setupAnimations();
        this.setupEventListeners();
        this.setupMothersDayPromo();
    }

    async loadComponent(id, file) {
        const target = document.getElementById(id);
        if (!target) return;
        try {
            const response = await fetch(file);
            const html = await response.text();
            target.outerHTML = html;
        } catch (error) {
            console.error(`Failed to load component ${file}:`, error);
        }
    }

    setupAnimations() {
        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('in');
                    obs.unobserve(e.target);
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    }

    setupEventListeners() {
        // Mobile burger menu
        document.addEventListener('click', (e) => {
            const burger = e.target.closest('#nav-burger');
            const nav = document.getElementById('main-nav');
            if (!nav) return;
            if (burger) {
                const isOpen = nav.classList.toggle('open');
                burger.setAttribute('aria-expanded', String(isOpen));
                return;
            }
            if (nav.classList.contains('open')) {
                if (e.target.closest('.nav-links a') || e.target.closest('.nav-cta') || !e.target.closest('nav')) {
                    nav.classList.remove('open');
                    const b = document.getElementById('nav-burger');
                    if (b) b.setAttribute('aria-expanded', 'false');
                }
            }
        });

        // Dark/Light theme toggle
        document.addEventListener('click', (e) => {
            if (e.target.closest('#theme-toggle')) {
                const current = document.documentElement.getAttribute('data-theme') || 'dark';
                const next = current === 'dark' ? 'light' : 'dark';
                this.applyTheme(next);
                localStorage.setItem('theme-preview', next);
            }
        });

        // Language switching
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('lang-btn')) {
                const lang = e.target.getAttribute('data-lang');
                this.i18n.setLanguage(lang);
            }
        });

        // Lightbox (for any future image menu cards)
        const lb = document.getElementById('lightbox');
        if (lb) {
            const lbImg = lb.querySelector('img');
            document.addEventListener('click', (e) => {
                const mc = e.target.closest('.mc');
                if (mc) {
                    const img = mc.querySelector('img');
                    if (img && lbImg) {
                        lbImg.src = img.src;
                        lb.classList.add('active');
                    }
                }
            });
            lb.addEventListener('click', () => lb.classList.remove('active'));
        }

        // Map lazy-load
        document.addEventListener('click', (e) => {
            const container = e.target.closest('#map-container');
            if (container && !container.querySelector('iframe')) {
                const template = container.querySelector('#map-template');
                if (template) {
                    const content = template.content.cloneNode(true);
                    container.innerHTML = '';
                    container.appendChild(content);
                }
            }
        });
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        // Update icon visibility after DOM is ready
        requestAnimationFrame(() => {
            const moon = document.getElementById('icon-moon');
            const sun  = document.getElementById('icon-sun');
            if (moon) moon.style.display = theme === 'dark'  ? 'block' : 'none';
            if (sun)  sun.style.display  = theme === 'light' ? 'block' : 'none';
        });
    }

    setupMothersDayPromo() {
        const modal = document.getElementById('mothersday-modal');
        const link  = document.getElementById('mothersday-pdf-link');
        if (!modal || !link) return;

        const promoKey = 'mothersDayPromoDismissed2026';
        const pdfPath  = '../assets/mothers day speisekarte pdf.pdf';
        const promoEnd = new Date('2026-05-10T23:59:59+02:00');

        link.href = encodeURI(pdfPath);

        const isExpired   = Date.now() > promoEnd.getTime();
        const isDismissed = localStorage.getItem(promoKey) === '1';

        if (isExpired || isDismissed) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            return;
        }

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');

        modal.addEventListener('click', (e) => {
            if (!e.target.closest('[data-md-close="true"]')) return;
            localStorage.setItem(promoKey, '1');
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        });
    }
}

const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
