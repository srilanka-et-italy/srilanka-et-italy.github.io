// ============================================
// Sri Lanka ET Italy - Interactive Functionality
// ============================================

// ============================================
// Translations
// ============================================
const translations = {
    de: {
        hero: {
            title: "Fusion redefined. Wolfegg's finest.",
            subtitle: "The Silk Road & The Marble Way",
            cta1: "Menü entdecken",
            cta2: "Tisch reservieren"
        },
        menu: {
            title: "The Menu",
            subtitle: "Eine kulinarische Reise zwischen zwei Welten",
            tabs: {
                burgers: "Burger & Snacks",
                hotdogs: "Hot Dogs",
                drinks: "Getränke"
            },
            items: {
                cheeseburger: {
                    name: "Cheeseburger",
                    description: "Saftiges Beef-Patty mit geschmolzenem Käse"
                },
                cheeseburger_pommes: {
                    name: "Cheeseburger mit Pommes",
                    description: "Unser Cheeseburger mit knusprigen Pommes Frites"
                },
                chickenburger: {
                    name: "Chickenburger",
                    description: "Knuspriges Hähnchenfilet mit frischem Salat"
                },
                chicken_nuggets: {
                    name: "Chicken Nuggets mit Pommes",
                    description: "Goldbraune Chicken Nuggets mit Pommes"
                },
                double_cheeseburger: {
                    name: "Double Cheeseburger",
                    description: "Doppeltes Beef-Patty mit extra Käse"
                },
                veggie_burger: {
                    name: "Vegetarischer Burger",
                    description: "Vegetarisches Patty mit frischem Gemüse"
                },
                pommes: {
                    name: "Pommes Frites",
                    description: "Knusprige goldgelbe Pommes"
                },
                hotdog: {
                    name: "Hot Dog",
                    description: "Klassischer Hot Dog mit Senf und Ketchup"
                },
                hotdog_pommes: {
                    name: "Hot Dog mit Pommes",
                    description: "Hot Dog serviert mit knusprigen Pommes"
                },
                wiener: {
                    name: "2 Wiener mit Brot",
                    description: "Zwei Wiener Würstchen mit frischem Brot"
                }
            },
            drinks: {
                beer: "Bier",
                cocktails: "Cocktails & Longdrinks",
                shots: "Shots",
                non_alcoholic: "Alkoholfreie Getränke"
            }
        },
        location: {
            title: "The Location",
            status: "Jetzt geöffnet bis 21:00 Uhr",
            hours: {
                title: "Öffnungszeiten",
                info: "Geöffnet bis 21:00 Uhr<br>Warme Küche bis 21:00 Uhr"
            }
        },
        footer: {
            contact: {
                title: "Kontakt"
            },
            hours: {
                title: "Öffnungszeiten",
                info: "Geöffnet bis 21:00 Uhr<br>Warme Küche bis 21:00 Uhr"
            },
            legal: {
                title: "Rechtliches",
                impressum: "Impressum",
                datenschutz: "Datenschutz"
            },
            rights: "Alle Rechte vorbehalten."
        },
        impressum: {
            title: "Impressum",
            operator: "Angaben gemäß § 5 TMG",
            contact: "Kontakt",
            responsible: "Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV"
        },
        datenschutz: {
            title: "Datenschutzerklärung",
            general: {
                title: "1. Allgemeine Hinweise",
                content: "Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können."
            },
            collection: {
                title: "2. Datenerfassung auf dieser Website",
                content: "Diese Website verwendet SSL-Verschlüsselung aus Sicherheitsgründen und zum Schutz der Übertragung vertraulicher Inhalte. Wir verwenden nur technisch notwendige Cookies."
            },
            cookies: {
                title: "3. Cookies",
                content: "Diese Website verwendet ausschließlich technisch notwendige Cookies, die für den Betrieb der Website erforderlich sind. Diese Cookies speichern keine personenbezogenen Daten und werden automatisch gelöscht, wenn Sie Ihren Browser schließen."
            },
            rights: {
                title: "4. Ihre Rechte",
                content: "Sie haben jederzeit das Recht auf unentgeltliche Auskunft über Ihre gespeicherten personenbezogenen Daten, deren Herkunft und Empfänger und den Zweck der Datenverarbeitung sowie ein Recht auf Berichtigung oder Löschung dieser Daten."
            }
        }
    },
    en: {
        hero: {
            title: "Fusion redefined. Wolfegg's finest.",
            subtitle: "The Silk Road & The Marble Way",
            cta1: "Discover Menu",
            cta2: "Reserve Table"
        },
        menu: {
            title: "The Menu",
            subtitle: "A culinary journey between two worlds",
            tabs: {
                burgers: "Burgers & Snacks",
                hotdogs: "Hot Dogs",
                drinks: "Drinks"
            },
            items: {
                cheeseburger: {
                    name: "Cheeseburger",
                    description: "Juicy beef patty with melted cheese"
                },
                cheeseburger_pommes: {
                    name: "Cheeseburger with Fries",
                    description: "Our cheeseburger with crispy french fries"
                },
                chickenburger: {
                    name: "Chicken Burger",
                    description: "Crispy chicken fillet with fresh lettuce"
                },
                chicken_nuggets: {
                    name: "Chicken Nuggets with Fries",
                    description: "Golden brown chicken nuggets with fries"
                },
                double_cheeseburger: {
                    name: "Double Cheeseburger",
                    description: "Double beef patty with extra cheese"
                },
                veggie_burger: {
                    name: "Vegetarian Burger",
                    description: "Vegetarian patty with fresh vegetables"
                },
                pommes: {
                    name: "French Fries",
                    description: "Crispy golden fries"
                },
                hotdog: {
                    name: "Hot Dog",
                    description: "Classic hot dog with mustard and ketchup"
                },
                hotdog_pommes: {
                    name: "Hot Dog with Fries",
                    description: "Hot dog served with crispy fries"
                },
                wiener: {
                    name: "2 Wieners with Bread",
                    description: "Two Vienna sausages with fresh bread"
                }
            },
            drinks: {
                beer: "Beer",
                cocktails: "Cocktails & Longdrinks",
                shots: "Shots",
                non_alcoholic: "Non-Alcoholic Drinks"
            }
        },
        location: {
            title: "The Location",
            status: "Now open until 9:00 PM",
            hours: {
                title: "Opening Hours",
                info: "Open until 9:00 PM<br>Hot food until 9:00 PM"
            }
        },
        footer: {
            contact: {
                title: "Contact"
            },
            hours: {
                title: "Opening Hours",
                info: "Open until 9:00 PM<br>Hot food until 9:00 PM"
            },
            legal: {
                title: "Legal",
                impressum: "Imprint",
                datenschutz: "Privacy"
            },
            rights: "All rights reserved."
        },
        impressum: {
            title: "Imprint",
            operator: "Information according to § 5 TMG",
            contact: "Contact",
            responsible: "Responsible for content according to § 55 Abs. 2 RStV"
        },
        datenschutz: {
            title: "Privacy Policy",
            general: {
                title: "1. General Information",
                content: "The following information provides a simple overview of what happens to your personal data when you visit this website. Personal data is any data that can be used to personally identify you."
            },
            collection: {
                title: "2. Data Collection on this Website",
                content: "This website uses SSL encryption for security reasons and to protect the transmission of confidential content. We only use technically necessary cookies."
            },
            cookies: {
                title: "3. Cookies",
                content: "This website uses only technically necessary cookies that are required for the operation of the website. These cookies do not store any personal data and are automatically deleted when you close your browser."
            },
            rights: {
                title: "4. Your Rights",
                content: "You have the right at any time to receive free information about your stored personal data, its origin and recipients, and the purpose of data processing, as well as the right to correct or delete this data."
            }
        }
    },
    it: {
        hero: {
            title: "Fusion ridefinita. Il meglio di Wolfegg.",
            subtitle: "La Via della Seta & La Via del Marmo",
            cta1: "Scopri il Menu",
            cta2: "Prenota un Tavolo"
        },
        menu: {
            title: "Il Menu",
            subtitle: "Un viaggio culinario tra due mondi",
            tabs: {
                burgers: "Burger & Snack",
                hotdogs: "Hot Dog",
                drinks: "Bevande"
            },
            items: {
                cheeseburger: {
                    name: "Cheeseburger",
                    description: "Succosa polpetta di manzo con formaggio fuso"
                },
                cheeseburger_pommes: {
                    name: "Cheeseburger con Patatine",
                    description: "Il nostro cheeseburger con patatine croccanti"
                },
                chickenburger: {
                    name: "Chicken Burger",
                    description: "Filetto di pollo croccante con lattuga fresca"
                },
                chicken_nuggets: {
                    name: "Nuggets di Pollo con Patatine",
                    description: "Nuggets di pollo dorati con patatine"
                },
                double_cheeseburger: {
                    name: "Double Cheeseburger",
                    description: "Doppia polpetta di manzo con formaggio extra"
                },
                veggie_burger: {
                    name: "Burger Vegetariano",
                    description: "Polpetta vegetariana con verdure fresche"
                },
                pommes: {
                    name: "Patatine Fritte",
                    description: "Patatine dorate e croccanti"
                },
                hotdog: {
                    name: "Hot Dog",
                    description: "Hot dog classico con senape e ketchup"
                },
                hotdog_pommes: {
                    name: "Hot Dog con Patatine",
                    description: "Hot dog servito con patatine croccanti"
                },
                wiener: {
                    name: "2 Wurstel con Pane",
                    description: "Due wurstel viennesi con pane fresco"
                }
            },
            drinks: {
                beer: "Birra",
                cocktails: "Cocktail & Longdrink",
                shots: "Shot",
                non_alcoholic: "Bevande Analcoliche"
            }
        },
        location: {
            title: "La Location",
            status: "Aperto ora fino alle 21:00",
            hours: {
                title: "Orari di Apertura",
                info: "Aperto fino alle 21:00<br>Cucina calda fino alle 21:00"
            }
        },
        footer: {
            contact: {
                title: "Contatto"
            },
            hours: {
                title: "Orari di Apertura",
                info: "Aperto fino alle 21:00<br>Cucina calda fino alle 21:00"
            },
            legal: {
                title: "Informazioni Legali",
                impressum: "Colophon",
                datenschutz: "Privacy"
            },
            rights: "Tutti i diritti riservati."
        },
        impressum: {
            title: "Colophon",
            operator: "Informazioni secondo § 5 TMG",
            contact: "Contatto",
            responsible: "Responsabile per i contenuti secondo § 55 Abs. 2 RStV"
        },
        datenschutz: {
            title: "Informativa sulla Privacy",
            general: {
                title: "1. Informazioni Generali",
                content: "Le seguenti informazioni forniscono una panoramica semplice di ciò che accade ai tuoi dati personali quando visiti questo sito web. I dati personali sono tutti i dati che possono essere utilizzati per identificarti personalmente."
            },
            collection: {
                title: "2. Raccolta Dati su questo Sito",
                content: "Questo sito web utilizza la crittografia SSL per motivi di sicurezza e per proteggere la trasmissione di contenuti riservati. Utilizziamo solo cookie tecnicamente necessari."
            },
            cookies: {
                title: "3. Cookie",
                content: "Questo sito web utilizza solo cookie tecnicamente necessari che sono richiesti per il funzionamento del sito. Questi cookie non memorizzano dati personali e vengono automaticamente eliminati quando chiudi il browser."
            },
            rights: {
                title: "4. I Tuoi Diritti",
                content: "Hai il diritto in qualsiasi momento di ricevere informazioni gratuite sui tuoi dati personali memorizzati, la loro origine e i destinatari, e lo scopo del trattamento dei dati, nonché il diritto di correggere o cancellare questi dati."
            }
        }
    },
    sin: {
        hero: {
            title: "නැවත අර්ථ දක්වා ඇති විලයනය. Wolfegg හි හොඳම.",
            subtitle: "The Silk Road & The Marble Way",
            cta1: "මෙනුව සොයා බලන්න",
            cta2: "මේසයක් වෙන්කර ගන්න"
        },
        menu: {
            title: "මෙනුව",
            subtitle: "ලෝක දෙකක් අතර ආහාරමය ගමනක්",
            tabs: {
                burgers: "බර්ගර් සහ සුලු කෑම",
                hotdogs: "හොට් ඩෝග්",
                drinks: "බීම වර්ග"
            },
            items: {
                cheeseburger: {
                    name: "චීස්බර්ගර්",
                    description: "දිය වූ චීස් සමඟ ඉස් මස් පැටි"
                },
                cheeseburger_pommes: {
                    name: "අර්තාපල් සමඟ චීස්බර්ගර්",
                    description: "හැපි අර්තාපල් සමඟ අපගේ චීස්බර්ගර්"
                },
                chickenburger: {
                    name: "චිකන් බර්ගර්",
                    description: "නැවුම් සලාද සමඟ හැපි කුකුළු මස්"
                },
                chicken_nuggets: {
                    name: "අර්තාපල් සමඟ චිකන් නගට්ස්",
                    description: "රන්වන් දුඹුරු චිකන් නගට්ස් සහ අර්තාපල්"
                },
                double_cheeseburger: {
                    name: "ඩබල් චීස්බර්ගර්",
                    description: "අතිරේක චීස් සමඟ ද්විත්ව මස් පැටි"
                },
                veggie_burger: {
                    name: "නිර්මාංශ බර්ගර්",
                    description: "නැවුම් එළවළු සමඟ නිර්මාංශ පැටි"
                },
                pommes: {
                    name: "ප්‍රංශ අර්තාපල්",
                    description: "හැපි රන්වන් අර්තාපල්"
                },
                hotdog: {
                    name: "හොට් ඩෝග්",
                    description: "අබ සහ කෙචප් සමඟ සම්භාව්‍ය හොට් ඩෝග්"
                },
                hotdog_pommes: {
                    name: "අර්තාපල් සමඟ හොට් ඩෝග්",
                    description: "හැපි අර්තාපල් සමඟ හොට් ඩෝග්"
                },
                wiener: {
                    name: "පාන් සමඟ විනර් 2ක්",
                    description: "නැවුම් පාන් සමඟ වියානා සොසේජස් දෙකක්"
                }
            },
            drinks: {
                beer: "බියර්",
                cocktails: "කොක්ටේල් සහ ලෝන්ඩ්‍රින්ක්ස්",
                shots: "ෂොට්ස්",
                non_alcoholic: "මධ්‍යසාර රහිත බීම"
            }
        },
        location: {
            title: "ස්ථානය",
            status: "දැන් රාත්‍රී 9:00 දක්වා විවෘතයි",
            hours: {
                title: "විවෘත වේලාවන්",
                info: "රාත්‍රී 9:00 දක්වා විවෘතයි<br>උණුසුම් ආහාර රාත්‍රී 9:00 දක්වා"
            }
        },
        footer: {
            contact: {
                title: "සම්බන්ධ කරගන්න"
            },
            hours: {
                title: "විවෘත වේලාවන්",
                info: "රාත්‍රී 9:00 දක්වා විවෘතයි<br>උණුසුම් ආහාර රාත්‍රී 9:00 දක්වා"
            },
            legal: {
                title: "නීතිමය",
                impressum: "මුද්‍රණය",
                datenschutz: "රහස්‍යතාව"
            },
            rights: "සියලුම හිමිකම් ඇවිරිණි."
        },
        impressum: {
            title: "මුද්‍රණය",
            operator: "§ 5 TMG අනුව තොරතුරු",
            contact: "සම්බන්ධ කරගන්න",
            responsible: "§ 55 Abs. 2 RStV අනුව අන්තර්ගතය සඳහා වගකිව යුත්තේ"
        },
        datenschutz: {
            title: "රහස්‍යතා ප්‍රතිපත්තිය",
            general: {
                title: "1. සාමාන්‍ය තොරතුරු",
                content: "ඔබ මෙම වෙබ් අඩවිය පිවිසෙන විට ඔබේ පුද්ගලික දත්ත වලට කුමක් සිදුවේද යන්න පිළිබඳ සරල විස්තරයක් පහත තොරතුරු සපයයි. පුද්ගලික දත්ත යනු ඔබව පුද්ගලිකව හඳුනාගැනීමට භාවිතා කළ හැකි ඕනෑම දත්ත වේ."
            },
            collection: {
                title: "2. මෙම වෙබ් අඩවියේ දත්ත එකතු කිරීම",
                content: "මෙම වෙබ් අඩවිය ආරක්ෂක හේතූන් සහ රහසිගත අන්තර්ගතයේ සම්ප්‍රේෂණය ආරක්ෂා කිරීම සඳහා SSL සංකේතනය භාවිතා කරයි. අපි තාක්ෂණිකව අවශ්‍ය කුකීස් පමණක් භාවිතා කරමු."
            },
            cookies: {
                title: "3. කුකීස්",
                content: "මෙම වෙබ් අඩවිය වෙබ් අඩවියේ ක්‍රියාකාරිත්වය සඳහා අවශ්‍ය තාක්ෂණික කුකීස් පමණක් භාවිතා කරයි. මෙම කුකීස් කිසිදු පුද්ගලික දත්ත ගබඩා නොකරන අතර ඔබ බ්‍රව්සරය වසන විට ස්වයංක්‍රීයව මකා දමයි."
            },
            rights: {
                title: "4. ඔබගේ අයිතිවාසිකම්",
                content: "ඔබගේ ගබඩා කර ඇති පුද්ගලික දත්ත, ඒවායේ මූලාරම්භය සහ ලබන්නන්, සහ දත්ත සැකසීමේ අරමුණ පිළිබඳව ඕනෑම වේලාවක නොමිලේ තොරතුරු ලබා ගැනීමට, මෙන්ම මෙම දත්ත නිවැරදි කිරීමට හෝ මකා දැමීමට ඔබට අයිතිවාසිකම ඇත."
            }
        }
    }
};

// ============================================
// Global Variables
// ============================================
let currentLanguage = 'de';

// ============================================
// Language Switcher
// ============================================
function initLanguageSwitcher() {
    const langButtons = document.querySelectorAll('.lang-btn');
    
    langButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.dataset.lang;
            switchLanguage(lang);
            
            // Update active state
            langButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function switchLanguage(lang) {
    currentLanguage = lang;
    const elements = document.querySelectorAll('[data-i18n]');
    
    elements.forEach(element => {
        const key = element.dataset.i18n;
        const keys = key.split('.');
        let translation = translations[lang];
        
        // Navigate through nested keys
        for (const k of keys) {
            translation = translation?.[k];
        }
        
        if (translation) {
            // Check if it contains HTML (for line breaks)
            if (translation.includes('<br>')) {
                element.innerHTML = translation;
            } else {
                element.textContent = translation;
            }
        }
    });
    
    // Store language preference
    localStorage.setItem('preferredLanguage', lang);
}

// ============================================
// Menu Tabs & Category Switching
// ============================================
function initMenuTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const menuCategories = document.querySelectorAll('.menu-category');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.dataset.category;
            
            // Update active tab
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Show selected category
            menuCategories.forEach(cat => {
                if (cat.dataset.category === category) {
                    cat.classList.add('active');
                    // Trigger reveal animation for newly shown items
                    setTimeout(() => {
                        const items = cat.querySelectorAll('.reveal-up');
                        items.forEach((item, index) => {
                            setTimeout(() => {
                                item.classList.add('revealed');
                            }, index * 50);
                        });
                    }, 100);
                } else {
                    cat.classList.remove('active');
                }
            });
        });
    });
}

// ============================================
// Modal Functionality
// ============================================
function initModals() {
    // Impressum Modal
    const impressumLink = document.getElementById('impressumLink');
    const impressumModal = document.getElementById('impressumModal');
    
    // Datenschutz Modal
    const datenschutzLink = document.getElementById('datenschutzLink');
    const datenschutzModal = document.getElementById('datenschutzModal');
    
    // Item Detail Modal
    const itemModal = document.getElementById('itemModal');
    
    // Close buttons
    const closeButtons = document.querySelectorAll('.modal-close');
    
    // Open impressum
    impressumLink?.addEventListener('click', (e) => {
        e.preventDefault();
        impressumModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    // Open datenschutz
    datenschutzLink?.addEventListener('click', (e) => {
        e.preventDefault();
        datenschutzModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    // Close modals
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.classList.remove('active');
            });
            document.body.style.overflow = '';
        });
    });
    
    // Close on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    });
    
    // Menu item click
    const menuItems = document.querySelectorAll('.bento-item');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const itemId = item.dataset.item;
            showItemDetail(itemId);
        });
    });
}

function showItemDetail(itemId) {
    const modal = document.getElementById('itemModal');
    const nameElement = document.getElementById('itemDetailName');
    const priceElement = document.getElementById('itemDetailPrice');
    const descElement = document.getElementById('itemDetailDescription');
    
    // Get item data
    const item = document.querySelector(`[data-item="${itemId}"]`);
    if (!item) return;
    
    const name = item.querySelector('.item-name').textContent;
    const price = item.querySelector('.item-price').textContent;
    
    // Get translated description
    const itemKey = itemId.replace('-', '_');
    const description = translations[currentLanguage]?.menu?.items?.[itemKey]?.description || '';
    
    nameElement.textContent = name;
    priceElement.textContent = price;
    descElement.textContent = description;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// ============================================
// Accordion Functionality
// ============================================
function initAccordion() {
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    
    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const accordionItem = header.parentElement;
            const isActive = accordionItem.classList.contains('active');
            
            // Close all accordion items
            document.querySelectorAll('.accordion-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Open clicked item if it wasn't active
            if (!isActive) {
                accordionItem.classList.add('active');
            }
        });
    });
}

// ============================================
// Scroll Reveal Animations
// ============================================
function initScrollReveal() {
    const revealElements = document.querySelectorAll('.reveal-up');
    
    const revealOnScroll = () => {
        revealElements.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;
            const windowHeight = window.innerHeight;
            
            if (elementTop < windowHeight * 0.85) {
                element.classList.add('revealed');
            }
        });
    };
    
    // Initial check
    revealOnScroll();
    
    // Add scroll listener with throttling
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                revealOnScroll();
                ticking = false;
            });
            ticking = true;
        }
    });
}

// ============================================
// Smooth Scroll
// ============================================
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// ============================================
// Parallax Effect
// ============================================
function initParallax() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const parallaxSpeed = 0.5;
        
        if (scrolled < window.innerHeight) {
            hero.style.transform = `translateY(${scrolled * parallaxSpeed}px)`;
        }
    });
}

// ============================================
// Initialize All Functions
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Load saved language preference
    const savedLanguage = localStorage.getItem('preferredLanguage') || 'de';
    
    // Initialize all components
    initLanguageSwitcher();
    initMenuTabs();
    initModals();
    initAccordion();
    initScrollReveal();
    initSmoothScroll();
    initParallax();
    
    // Set initial language
    const langBtn = document.querySelector(`[data-lang="${savedLanguage}"]`);
    if (langBtn) {
        langBtn.click();
    }
    
    // Show first category items with animation
    setTimeout(() => {
        const firstCategory = document.querySelector('.menu-category.active');
        if (firstCategory) {
            const items = firstCategory.querySelectorAll('.reveal-up');
            items.forEach((item, index) => {
                setTimeout(() => {
                    item.classList.add('revealed');
                }, index * 50);
            });
        }
    }, 500);
});

// ============================================
// Keyboard Navigation
// ============================================
document.addEventListener('keydown', (e) => {
    // Close modal on ESC
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }
});

// ============================================
// Performance Optimization
// ============================================
// Lazy load images when they become visible
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            }
        });
    });
    
    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}
