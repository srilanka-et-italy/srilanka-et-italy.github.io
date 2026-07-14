const ENDPOINT = '/track-event';

function sendEvent(payload) {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
        try {
            navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
            return;
        } catch { /* fall through to fetch */ }
    }
    fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true
    }).catch(() => { /* tracking failures are non-fatal and invisible to the user */ });
}

export function hasConsent() {
    return localStorage.getItem('cookie_consent') === 'accepted';
}

export function trackPageview(page) {
    if (!hasConsent()) return;
    sendEvent({ type: 'pageview', page });
}

export function trackClick(label) {
    if (!hasConsent()) return;
    sendEvent({ type: 'click', page: window.location.pathname, label });
}

export function initConsentBanner() {
    const banner = document.getElementById('cookie-consent-banner');
    if (!banner) return;

    if (localStorage.getItem('cookie_consent')) {
        banner.hidden = true;
        return;
    }

    banner.hidden = false;

    banner.querySelector('.consent-accept-btn').addEventListener('click', () => {
        localStorage.setItem('cookie_consent', 'accepted');
        banner.hidden = true;
        trackPageview(window.location.pathname);
    });

    banner.querySelector('.consent-decline-btn').addEventListener('click', () => {
        localStorage.setItem('cookie_consent', 'declined');
        banner.hidden = true;
    });
}

export function setupClickTracking() {
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-track]');
        if (!el) return;
        let label = el.getAttribute('data-track');
        if (label === 'lang_switch') {
            const lang = el.getAttribute('data-lang');
            if (lang) label = `lang_switch_${lang}`;
        }
        trackClick(label);
    });
}
