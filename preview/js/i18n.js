export class I18n {
    constructor() {
        this.lang = localStorage.getItem('lang') || 'de';
        this.translations = {};
    }

    async init() {
        await this.loadTranslations(this.lang);
        this.updateDOM();
        this.updateActiveButton();
    }

    async loadTranslations(lang) {
        try {
            const response = await fetch(`../i18n/${lang}.json`);
            this.translations = await response.json();
            this.lang = lang;
            localStorage.setItem('lang', lang);
            document.documentElement.lang = lang;
        } catch (error) {
            console.error('Failed to load translations:', error);
        }
    }

    updateDOM() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const path = el.getAttribute('data-i18n');
            const translation = this.getValueByPath(this.translations, path);
            if (translation) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = translation;
                } else {
                    el.innerHTML = translation;
                }
            }
        });
    }

    getValueByPath(obj, path) {
        return path.split('.').reduce((prev, curr) => {
            return prev ? prev[curr] : null;
        }, obj);
    }

    async setLanguage(lang) {
        await this.loadTranslations(lang);
        this.updateDOM();
        this.updateActiveButton();
    }

    updateActiveButton() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            if (btn.getAttribute('data-lang') === this.lang) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}
