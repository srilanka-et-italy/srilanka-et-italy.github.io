import { I18n } from './i18n.js';

class App {
    constructor() {
        this.i18n = new I18n();
        this.components = [
            { id: 'nav-placeholder', file: 'components/nav.html' },
            { id: 'hero-placeholder', file: 'components/hero.html' },
            { id: 'about-placeholder', file: 'components/about.html' },
            { id: 'club-placeholder', file: 'components/club.html' },
            { id: 'menu-placeholder', file: 'components/menu.html' },
            { id: 'location-placeholder', file: 'components/location.html' },
            { id: 'footer-placeholder', file: 'components/footer.html' }
        ];
    }

    async init() {
        // Load all components
        await Promise.all(this.components.map(c => this.loadComponent(c.id, c.file)));

        // Initialize i18n
        await this.i18n.init();

        // Setup Reveal Animations
        this.setupAnimations();

        // Setup Event Listeners
        this.setupEventListeners();

        // TODO(AI-AGENT, after 2026-05-10): Remove setupMothersDayPromo() call and the entire
        // setupMothersDayPromo() method below. Also remove #mothersday-modal from index.html,
        // #hero-seasonal-card from components/hero.html, and delete
        // assets/"mothers day speisekarte pdf.pdf". Remove hero.mday_* keys from all i18n/*.json.
        // Remove .hero-seasonal, .hero-seasonal-inner, .hero-seasonal-* CSS from main.css.
        // Show seasonal PDF promo until Mother's Day ends
        this.setupMothersDayPromo();
        this.renderMothersDay();
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
        // Language switching
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('lang-btn')) {
                const lang = e.target.getAttribute('data-lang');
                this.i18n.setLanguage(lang);
            }
        });

        // Lightbox Logic for Menu Cards
        const lb = document.getElementById('lightbox');
        const lbImg = lb.querySelector('img');

        document.addEventListener('click', (e) => {
            const mc = e.target.closest('.mc');
            if (mc) {
                const img = mc.querySelector('img');
                if (img) {
                    lbImg.src = img.src;
                    lb.classList.add('active');
                }
            }
        });

        // Close Lightbox on click (background or button)
        lb.addEventListener('click', () => {
            lb.classList.remove('active');
        });

        // Map Loading Logic (Facade)
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

    async renderMothersDay() {
        const canvas = document.getElementById('mday-pdf-canvas');
        if (!canvas || typeof pdfjsLib === 'undefined') return;

        const promoEnd = new Date('2026-05-10T23:59:59+02:00');
        if (Date.now() > promoEnd.getTime()) return;

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        try {
            const pdf  = await pdfjsLib.getDocument('assets/mothers%20day%20speisekarte%20pdf.pdf').promise;
            const page = await pdf.getPage(1);
            const containerWidth = canvas.parentElement.clientWidth || 480;
            const baseViewport   = page.getViewport({ scale: 1 });
            const scale          = containerWidth / baseViewport.width;
            const viewport       = page.getViewport({ scale });

            canvas.width  = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        } catch (e) {
            console.warn('PDF preview failed:', e);
        }
    }

    setupMothersDayPromo() {
        const modal = document.getElementById('mothersday-modal');
        const link = document.getElementById('mothersday-pdf-link');
        const heroCard = document.getElementById('hero-seasonal-card');

        const promoEnd = new Date('2026-05-10T23:59:59+02:00');
        const isExpired = Date.now() > promoEnd.getTime();

        // Hide hero seasonal card after deadline
        if (heroCard) {
            if (isExpired) {
                heroCard.style.display = 'none';
            }
        }

        if (!modal || !link) return;

        const promoKey = 'mothersDayPromoDismissed2026';
        const pdfPath = 'assets/mothers day speisekarte pdf.pdf';

        link.href = encodeURI(pdfPath);

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
