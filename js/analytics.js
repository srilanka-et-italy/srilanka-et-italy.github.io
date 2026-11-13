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

function getStoredConsent() {
    try {
        return localStorage.getItem('cookie_consent');
    } catch {
        return null;
    }
}

// Elements marked with data-consent-state="accepted|declined|none" are shown
// only while that state is current (used on the privacy page).
function renderConsentState() {
    const stored = getStoredConsent();
    const state = stored === 'accepted' || stored === 'declined' ? stored : 'none';
    document.querySelectorAll('[data-consent-state]').forEach(el => {
        el.hidden = el.getAttribute('data-consent-state') !== state;
    });
}

let consentHandlersBound = false;

// Shows the banner on first visit and wires up every consent control on the
// page: the banner buttons, the "statistics settings" link in the footer
// (.consent-settings-btn) and the controls on the privacy page. Consent can
// be given or withdrawn at any time with the same effort.
export function initConsentBanner() {
    const banner = document.getElementById('cookie-consent-banner');
    if (banner) banner.hidden = Boolean(getStoredConsent());
    renderConsentState();

    if (consentHandlersBound) return;
    consentHandlersBound = true;

    document.addEventListener('click', (e) => {
        const currentBanner = document.getElementById('cookie-consent-banner');
        if (e.target.closest('.consent-accept-btn')) {
            if (currentBanner) currentBanner.hidden = true;
            const wasAccepted = hasConsent();
            setConsent('accepted');
            renderConsentState();
            if (!wasAccepted) trackPageview(window.location.pathname);
        } else if (e.target.closest('.consent-decline-btn')) {
            if (currentBanner) currentBanner.hidden = true;
            setConsent('declined');
            renderConsentState();
        } else if (e.target.closest('.consent-settings-btn')) {
            e.preventDefault();
            if (currentBanner) {
                currentBanner.hidden = false;
                const focusTarget = currentBanner.querySelector(hasConsent() ? '.consent-decline-btn' : '.consent-accept-btn');
                if (focusTarget) focusTarget.focus();
            } else {
                window.location.href = 'datenschutz.html#statistik';
            }
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
