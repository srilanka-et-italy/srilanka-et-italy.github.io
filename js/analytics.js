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
    try {
        return localStorage.getItem('cookie_consent') === 'accepted';
    } catch {
        return false;
    }
}

export function trackPageview(page) {
    if (!hasConsent()) return;
    sendEvent({ type: 'pageview', page });
}

export function trackClick(label) {
    if (!hasConsent()) return;
    sendEvent({ type: 'click', page: window.location.pathname, label });
}

function setConsent(value) {
    try {
        localStorage.setItem('cookie_consent', value);
    } catch { /* storage may be blocked (private mode, in-app browsers, etc.) */ }
}

export function initConsentBanner() {
    const banner = document.getElementById('cookie-consent-banner');
    if (!banner) return;

    let stored;
    try {
        stored = localStorage.getItem('cookie_consent');
    } catch { stored = null; }

    if (stored) {
        banner.hidden = true;
        return;
    }

    banner.hidden = false;

    document.addEventListener('click', (e) => {
        if (e.target.closest('.consent-accept-btn')) {
            banner.hidden = true;
            setConsent('accepted');
            trackPageview(window.location.pathname);
        } else if (e.target.closest('.consent-decline-btn')) {
            banner.hidden = true;
            setConsent('declined');
        }
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
