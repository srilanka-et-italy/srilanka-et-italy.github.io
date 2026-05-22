import { I18n } from './i18n.js';
import { db, remoteConfig } from './firebase-config.js';
import {
  collection, query, where, orderBy, getDocs, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  fetchAndActivate, getValue
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-remote-config.js';

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
        this._carouselTimer = null;
    }

    async init() {
        await Promise.all(this.components.map(c => this.loadComponent(c.id, c.file)));
        await this.i18n.init();
        this.setupAnimations();
        this.setupEventListeners();
        await this.setupSeasonalCarousel();
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
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('lang-btn')) {
                const lang = e.target.getAttribute('data-lang');
                this.i18n.setLanguage(lang);
            }
        });

        const lb = document.getElementById('lightbox');
        if (lb) {
            const lbImg = lb.querySelector('img');
            document.addEventListener('click', (e) => {
                const mc = e.target.closest('.mc');
                if (mc) {
                    const img = mc.querySelector('img');
                    if (img) { lbImg.src = img.src; lb.classList.add('active'); }
                }
            });
            lb.addEventListener('click', () => lb.classList.remove('active'));
        }

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

    // ── Seasonal PDF Carousel ─────────────────────────────────────────────────

    async setupSeasonalCarousel() {
        // Remote Config — kill-switch + params
        let pdfEnabled = true;
        let intervalMs = 8000;
        let maxPdfs    = 5;
        let fallbackMode = 'image';

        try {
            await fetchAndActivate(remoteConfig);
            pdfEnabled   = getValue(remoteConfig, 'feature_pdf_enabled').asBoolean();
            intervalMs   = getValue(remoteConfig, 'carousel_interval_ms').asNumber() || 8000;
            maxPdfs      = getValue(remoteConfig, 'max_pdfs_in_carousel').asNumber() || 5;
            fallbackMode = getValue(remoteConfig, 'hero_fallback_mode').asString() || 'image';
        } catch { /* Remote Config fetch failure is non-fatal */ }

        const carousel = document.getElementById('hero-carousel');
        if (!carousel) return;

        if (!pdfEnabled) {
            this.showCarouselFallback(carousel, fallbackMode);
            return;
        }

        const pdfs = await this.loadSeasonalPDFs(maxPdfs);

        if (pdfs.length === 0) {
            this.showCarouselFallback(carousel, fallbackMode);
            return;
        }

        this.renderCarousel(carousel, pdfs, intervalMs);
    }

    async loadSeasonalPDFs(maxPdfs) {
        try {
            const now = Timestamp.now();
            const q = query(
                collection(db, 'seasonal_pdfs'),
                where('endDate', '>=', now),
                where('status', '==', 'active'),
                orderBy('endDate'),
                orderBy('order')
            );
            const snap = await getDocs(q);
            return snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(pdf => pdf.startDate && pdf.startDate.toMillis() <= now.toMillis())
                .slice(0, maxPdfs);
        } catch (err) {
            console.warn('Could not load seasonal PDFs:', err);
            return [];
        }
    }

    renderCarousel(container, pdfs, intervalMs) {
        container.innerHTML = '';

        const slides = pdfs.map((pdf, i) => {
            const slide = document.createElement('div');
            slide.className = 'carousel-slide' + (i === 0 ? ' active' : '');
            slide.dataset.index = i;
            slide.innerHTML = `
                <div class="pdf-skeleton">
                    <div class="pdf-progress-bar"><div class="pdf-progress-fill"></div></div>
                    <span data-i18n="hero.pdf_loading">Angebot wird geladen…</span>
                </div>
                <canvas class="pdf-canvas"></canvas>`;
            container.appendChild(slide);
            return slide;
        });

        if (pdfs.length > 1) {
            const dots = document.createElement('div');
            dots.className = 'carousel-dots';
            pdfs.forEach((_, i) => {
                const dot = document.createElement('button');
                dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
                dot.setAttribute('aria-label', `Slide ${i + 1}`);
                dot.addEventListener('click', () => this.goToSlide(slides, dots.querySelectorAll('.carousel-dot'), i));
                dots.appendChild(dot);
            });
            container.appendChild(dots);
        }

        // Apply i18n to newly injected elements
        this.i18n.applyTranslations();

        // Render first slide, prefetch second
        this.renderSlide(pdfs[0], slides[0]);
        if (pdfs.length > 1) {
            this.renderSlide(pdfs[1], slides[1]);

            this._carouselTimer = setInterval(() => {
                const active = container.querySelector('.carousel-slide.active');
                const currentIdx = parseInt(active?.dataset.index || '0');
                const nextIdx = (currentIdx + 1) % pdfs.length;
                const dotEls = container.querySelectorAll('.carousel-dot');
                this.goToSlide(slides, dotEls, nextIdx);
                // Prefetch slide after next
                const prefetchIdx = (nextIdx + 1) % pdfs.length;
                if (prefetchIdx !== currentIdx) {
                    this.renderSlide(pdfs[prefetchIdx], slides[prefetchIdx]);
                }
            }, intervalMs);
        }
    }

    goToSlide(slides, dots, idx) {
        slides.forEach((s, i) => s.classList.toggle('active', i === idx));
        dots.forEach((d, i) => d.classList.toggle('active', i === idx));
    }

    renderSlide(pdf, slide) {
        const ct = pdf.contentType || '';
        const isImage = ct.startsWith('image/') || /\.(png|jpe?g)$/i.test(pdf.fileName || '');
        if (isImage) {
            this.renderImageSlide(pdf.pdfUrl, slide);
        } else {
            this.renderPDFSlide(pdf.pdfUrl, slide.querySelector('canvas'));
        }
    }

    renderImageSlide(url, slide) {
        const canvas = slide.querySelector('canvas');
        if (!canvas || canvas.dataset.rendered === '1') return;
        canvas.dataset.rendered = '1';
        const container = canvas.parentElement;
        container.classList.add('pdf-loading');
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:inherit;display:block;';
        img.onload  = () => { canvas.replaceWith(img); container.classList.remove('pdf-loading'); };
        img.onerror = () => { container.classList.remove('pdf-loading'); container.classList.add('pdf-error'); };
    }

    async renderPDFSlide(url, canvas) {
        if (!canvas || canvas.dataset.rendered === '1') return;
        if (typeof pdfjsLib === 'undefined') return;

        const container = canvas.parentElement;
        container.classList.add('pdf-loading');
        const bar = container.querySelector('.pdf-progress-fill');

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        try {
            const loadingTask = pdfjsLib.getDocument({
                url,
                onProgress: ({ loaded, total }) => {
                    if (total && bar) bar.style.width = Math.round(loaded / total * 100) + '%';
                }
            });
            const pdf      = await loadingTask.promise;
            const page     = await pdf.getPage(1);
            const scale    = (container.clientWidth || 480) / page.getViewport({ scale: 1 }).width;
            const viewport = page.getViewport({ scale });
            canvas.width   = viewport.width;
            canvas.height  = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            canvas.dataset.rendered = '1';
            container.classList.remove('pdf-loading');
        } catch (e) {
            console.warn('PDF render failed:', e);
            container.classList.remove('pdf-loading');
            container.classList.add('pdf-error');
        }
    }

    showCarouselFallback(container, mode) {
        if (mode === 'hidden') {
            container.style.display = 'none';
        } else {
            // Show static front image as fallback
            container.innerHTML = '<img src="assets/front.png" alt="Restaurant Sri Lanka ET Italy" class="hero-fallback-img" loading="eager">';
        }
    }
}

const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
