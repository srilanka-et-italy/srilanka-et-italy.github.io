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
}

const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
