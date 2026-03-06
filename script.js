// ============================================
// Sri Lanka ET Italy - Interactive Functionality
// ============================================

// ============================================
// Translations (English and German only)
// ============================================
const translations = {
    de: {
        meta: {
            title: "Sri Lanka ET Italy - Fusion redefined. Wolfegg's finest.",
            description: "Sri Lanka ET Italy - High-end Fusion Restaurant im Schützenverein Wolfegg. The Silk Road & The Marble Way."
        },
        nav: {
            home: "Home",
            menu: "Menü",
            location: "Standort",
            contact: "Kontakt"
        },
        hero: {
            badge: "Im Schützenverein Wolfegg",
            title1: "Fusion redefined.",
            title2: "Wolfegg's finest.",
            subtitle: "The Silk Road & The Marble Way",
            cta1: "Menü entdecken",
            cta2: "Uns besuchen",
            hours: "Geöffnet von 11:00 bis 21:00 Uhr",
            scroll: "Scrollen"
        },
        menu: {
            title: "Unsere Speisekarte",
            subtitle: "Eine kulinarische Reise zwischen Sri Lanka und Italien",
            burgers: {
                title: "Burger & Snacks",
                description: "Saftige Burger mit frischen Zutaten"
            },
            hotdogs: {
                title: "Hot Dogs & Wiener",
                description: "Knusprige Hot Dogs und klassische Wiener"
            },
            drinks: {
                title: "Getränkekarte",
                description: "Biere, Cocktails und Erfrischungen",
                beer: "Bier",
                cocktails: "Cocktails & Longdrinks",
                shots: "Shots",
                nonAlcoholic: "Alkoholfreie Getränke"
            },
            items: {
                cheeseburger: "Cheeseburger",
                pommesFrites: "Pommes Frites",
                chickenNuggets: "Chicken Nuggets mit Pommes",
                chickenburger: "Chickenburger",
                doubleCheeseburger: "Double Cheeseburger",
                veggiBurger: "Vegetarischer Burger",
                hotdog: "Hot Dog",
                hotdogPommes: "Hot Dog mit Pommes",
                wiener: "2 Wiener mit Brot",
                haerleGold: "Härle Gold vom Fass 0,3l",
                haerlePils: "Härle Pils (Flasche) 0,3l",
                hefeweizen: "Hefeweizen vom Fass 0,5l",
                hugoSpritz: "Hugo Spritz",
                specialCocktail: "Special Hurricane Cocktail",
                aperolSpritz: "Aperol Spritz",
                lillet: "Lillet",
                mojito: "Mojito",
                whiskeySour: "Whiskey Sour",
                whiskeyCola: "Whiskey Cola",
                jaegermeister: "Jägermeister Shot",
                jaegerBomb: "Jäger Bomb",
                softDrinks: "Cola / Fanta / Sprite 0,3l",
                mineralWasser: "Mineralwasser 0,3l",
                apfelSchorle: "Apfelsaftschorle 0,3l",
                tee: "Tee"
            },
            note: "Alle Preise verstehen sich in Euro. Weitere Informationen finden Sie auf unseren Menükarten vor Ort."
        },
        location: {
            title: "Besuchen Sie uns",
            subtitle: "Im Herzen von Wolfegg",
            hours: {
                title: "Öffnungszeiten",
                status: "Jetzt geöffnet",
                info: "Täglich von 11:00 bis 21:00 Uhr<br>Warme Küche bis 21:00 Uhr"
            },
            address: {
                title: "Adresse"
            },
            contact: {
                title: "Kontakt"
            }
        },
        footer: {
            tagline: "The Silk Road & The Marble Way",
            hours: {
                title: "Öffnungszeiten",
                info: "Täglich von 11:00 bis 21:00 Uhr<br>Warme Küche bis 21:00 Uhr"
            },
            contact: {
                title: "Kontakt"
            },
            legal: {
                title: "Rechtliches",
                impressum: "Impressum",
                datenschutz: "Datenschutzerklärung"
            },
            rights: "Alle Rechte vorbehalten."
        }
    },
    en: {
        meta: {
            title: "Sri Lanka ET Italy - Fusion redefined. Wolfegg's finest.",
            description: "Sri Lanka ET Italy - High-end Fusion Restaurant at Schützenverein Wolfegg. The Silk Road & The Marble Way."
        },
        nav: {
            home: "Home",
            menu: "Menu",
            location: "Location",
            contact: "Contact"
        },
        hero: {
            badge: "At Schützenverein Wolfegg",
            title1: "Fusion redefined.",
            title2: "Wolfegg's finest.",
            subtitle: "The Silk Road & The Marble Way",
            cta1: "Discover Menu",
            cta2: "Visit Us",
            hours: "Open from 11:00 AM to 9:00 PM",
            scroll: "Scroll"
        },
        menu: {
            title: "Our Menu",
            subtitle: "A culinary journey between Sri Lanka and Italy",
            burgers: {
                title: "Burgers & Snacks",
                description: "Juicy burgers with fresh ingredients"
            },
            hotdogs: {
                title: "Hot Dogs & Wieners",
                description: "Crispy hot dogs and classic wieners"
            },
            drinks: {
                title: "Drinks Menu",
                description: "Beers, cocktails and refreshments",
                beer: "Beer",
                cocktails: "Cocktails & Longdrinks",
                shots: "Shots",
                nonAlcoholic: "Non-Alcoholic Drinks"
            },
            items: {
                cheeseburger: "Cheeseburger",
                pommesFrites: "French Fries",
                chickenNuggets: "Chicken Nuggets with Fries",
                chickenburger: "Chicken Burger",
                doubleCheeseburger: "Double Cheeseburger",
                veggiBurger: "Vegetarian Burger",
                hotdog: "Hot Dog",
                hotdogPommes: "Hot Dog with Fries",
                wiener: "2 Wieners with Bread",
                haerleGold: "Härle Gold Draft 0.3l",
                haerlePils: "Härle Pils (Bottle) 0.3l",
                hefeweizen: "Hefeweizen Draft 0.5l",
                hugoSpritz: "Hugo Spritz",
                specialCocktail: "Special Hurricane Cocktail",
                aperolSpritz: "Aperol Spritz",
                lillet: "Lillet",
                mojito: "Mojito",
                whiskeySour: "Whiskey Sour",
                whiskeyCola: "Whiskey Cola",
                jaegermeister: "Jägermeister Shot",
                jaegerBomb: "Jäger Bomb",
                softDrinks: "Cola / Fanta / Sprite 0.3l",
                mineralWasser: "Mineral Water 0.3l",
                apfelSchorle: "Apple Spritzer 0.3l",
                tee: "Tea"
            },
            note: "All prices are in Euro. More information can be found on our menus on-site."
        },
        location: {
            title: "Visit Us",
            subtitle: "In the Heart of Wolfegg",
            hours: {
                title: "Opening Hours",
                status: "Now open",
                info: "Daily from 11:00 AM to 9:00 PM<br>Hot food until 9:00 PM"
            },
            address: {
                title: "Address"
            },
            contact: {
                title: "Contact"
            }
        },
        footer: {
            tagline: "The Silk Road & The Marble Way",
            hours: {
                title: "Opening Hours",
                info: "Daily from 11:00 AM to 9:00 PM<br>Hot food until 9:00 PM"
            },
            contact: {
                title: "Contact"
            },
            legal: {
                title: "Legal",
                impressum: "Imprint",
                datenschutz: "Privacy Policy"
            },
            rights: "All rights reserved."
        }
    }
};

// ============================================
// Language Management
// ============================================
let currentLanguage = localStorage.getItem('language') || 'de';

function setLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;
    
    // Update active button
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.lang === lang) {
            btn.classList.add('active');
        }
    });
    
    // Update all translatable elements
    updateTranslations();
}

function updateTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    
    elements.forEach(element => {
        const key = element.dataset.i18n;
        const translation = getNestedTranslation(translations[currentLanguage], key);
        
        if (translation) {
            // Handle HTML content (for line breaks, etc.)
            if (key.includes('.info') && translation.includes('<br>')) {
                element.innerHTML = translation;
            } else {
                element.textContent = translation;
            }
        }
    });
    
    // Update meta tags
    updateMetaTags();
}

function getNestedTranslation(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

function updateMetaTags() {
    const titleMeta = document.querySelector('title');
    const descriptionMeta = document.querySelector('meta[name="description"]');
    
    if (titleMeta) {
        titleMeta.textContent = translations[currentLanguage].meta.title;
    }
    
    if (descriptionMeta) {
        descriptionMeta.setAttribute('content', translations[currentLanguage].meta.description);
    }
}

// ============================================
// Navigation
// ============================================
function initNavigation() {
    const navbar = document.querySelector('.navbar');
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    // Scroll effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
    
    // Mobile menu toggle
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            mobileToggle.classList.toggle('active');
        });
    }
    
    // Close mobile menu when clicking a link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            if (mobileToggle) {
                mobileToggle.classList.remove('active');
            }
        });
    });
    
    // Language switcher
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setLanguage(btn.dataset.lang);
        });
    });
}

// ============================================
// Smooth Scrolling
// ============================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            
            if (target) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = target.offsetTop - navHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ============================================
// Scroll Animations
// ============================================
function initScrollAnimations() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);
    
    // Observe all fade-in elements
    document.querySelectorAll('.fade-in').forEach(el => {
        observer.observe(el);
    });
    
    // Add fade-in class to menu cards and info blocks
    document.querySelectorAll('.menu-card, .info-block').forEach(el => {
        el.classList.add('fade-in');
        observer.observe(el);
    });
}

// ============================================
// Parallax Effect for Hero
// ============================================
function initParallax() {
    const heroImage = document.querySelector('.hero-image');
    const scrollIndicator = document.querySelector('.scroll-indicator');
    
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        
        if (heroImage) {
            heroImage.style.transform = `translateY(${scrolled * 0.5}px)`;
        }
        
        // Hide scroll indicator after scrolling
        if (scrollIndicator) {
            if (scrolled > 100) {
                scrollIndicator.style.opacity = '0';
                scrollIndicator.style.visibility = 'hidden';
            } else {
                scrollIndicator.style.opacity = '1';
                scrollIndicator.style.visibility = 'visible';
            }
        }
    });
}

// ============================================
// Update Current Year in Footer
// ============================================
function updateCurrentYear() {
    const yearElement = document.getElementById('current-year');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
}

// ============================================
// Initialize Everything
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Set initial language
    setLanguage(currentLanguage);
    
    // Initialize features
    initNavigation();
    initSmoothScroll();
    initScrollAnimations();
    initParallax();
    updateCurrentYear();
    
    // Add smooth transitions to page load
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    }, 100);
});

// ============================================
// Handle page visibility changes
// ============================================
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Refresh animations when page becomes visible
        initScrollAnimations();
    }
});
