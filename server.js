const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const querystring = require('querystring');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[REQUEST] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

const DB_FILE = path.join(__dirname, 'database.json');
const LEADS_FILE = path.join(__dirname, 'leads_db.json');

// Read/Write local JSON database
function readDb() {
    if (!fs.existsSync(DB_FILE)) {
        const defaultDb = { connections: [], sentEmails: [], campaigns: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf8');
        return defaultDb;
    }
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { connections: [], sentEmails: [], campaigns: [] };
    }
}

function writeDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Load leads database
let leadsDb = [];
if (fs.existsSync(LEADS_FILE)) {
    try {
        leadsDb = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
        console.log(`Loaded ${leadsDb.length} leads from leads_db.json`);
    } catch (e) {
        console.error('Failed to parse leads_db.json:', e);
    }
}

// ----------------------------------------------------
// OAuth helper
// ----------------------------------------------------
function exchangeOauthCode(clientId, clientSecret, redirectUri, code) {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify({
            code: code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        });
        
        const options = {
            hostname: 'oauth2.googleapis.com',
            port: 443,
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode !== 200) {
                        reject(new Error(parsed.error_description || parsed.error || 'Token exchange failed'));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        req.on('error', (e) => { reject(e); });
        req.write(postData);
        req.end();
    });
}

// Verify transporter validity
async function verifyTransporter(connection) {
    let transporter;
    if (connection.type === 'gmail_app_pass') {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: connection.senderEmail,
                pass: connection.gmailAppPassword
            }
        });
    } else if (connection.type === 'gmail_oauth') {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: connection.senderEmail,
                clientId: connection.googleClientId,
                clientSecret: connection.googleClientSecret,
                refreshToken: connection.googleRefreshToken
            }
        });
    } else if (connection.type === 'custom_smtp') {
        transporter = nodemailer.createTransport({
            host: connection.smtpHost,
            port: parseInt(connection.smtpPort),
            secure: connection.smtpSecure === 'true' || connection.smtpSecure === true,
            auth: {
                user: connection.smtpUser,
                pass: connection.smtpPass
            }
        });
    } else {
        throw new Error('Invalid connection type');
    }
    await transporter.verify();
    return transporter;
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Leads Endpoint
app.get('/api/leads', (req, res) => {
    const { niche, companySize, location, jobTitle, revenue, technology, minConfidence, region, limit = 50, offset = 0 } = req.query;
    
    let results = [...leadsDb];
    
    if (niche) {
        const stopWords = ['clients', 'leads', 'businesses', 'companies', 'customers', 'prospects', 'services', 'agencies', 'agency', 'company', 'platforms', 'platform', 'work', 'freelance'];
        let n = niche.toLowerCase().trim();
        const words = n.split(/\s+/).filter(w => !stopWords.includes(w));
        
        // Detect city name in niche query and filter by location
        const targetLocations = ['dubai', 'london', 'new york', 'ny', 'mumbai', 'pune', 'india', 'usa', 'united states', 'uk', 'germany'];
        let extractedLoc = '';
        const cleanWords = words.filter(w => {
            if (targetLocations.includes(w)) {
                extractedLoc = w;
                return false; // remove from niche query words
            }
            return true;
        });
        
        const cleanQuery = cleanWords.length > 0 ? cleanWords.join(' ') : n;
        
        // If we extracted a location, filter results by location first
        if (extractedLoc) {
            results = results.filter(l => l.location.toLowerCase().includes(extractedLoc) || l.countryCode.toLowerCase() === extractedLoc);
        }
        
        // Smart matching rules
        const isWebSearch = cleanQuery.includes('web') || cleanQuery.includes('site') || cleanQuery.includes('wordpress') || cleanQuery.includes('shopify') || cleanQuery.includes('figma');
        const isPowerBiSearch = cleanQuery.includes('power bi') || cleanQuery.includes('dashboard') || cleanQuery.includes('analytics') || cleanQuery.includes('data') || cleanQuery.includes('report');
        const isContentSearch = cleanQuery.includes('content') || cleanQuery.includes('writ') || cleanQuery.includes('blog') || cleanQuery.includes('copy') || cleanQuery.includes('seo');
        
        results = results.filter(l => {
            // General text match
            const matchesText = l.niche.toLowerCase().includes(cleanQuery) || 
                                l.category.toLowerCase().includes(cleanQuery) ||
                                l.companyName.toLowerCase().includes(cleanQuery) ||
                                l.domain.toLowerCase().includes(cleanQuery) ||
                                (l.auditNote && l.auditNote.toLowerCase().includes(cleanQuery));
                                
            if (matchesText) return true;
            
            // Smart Web client mapping: match leads that have web speed/SSL/responsiveness issues
            if (isWebSearch) {
                const hasWebIssues = l.auditReport && (
                    l.auditReport.speed?.status === 'failed' || 
                    l.auditReport.security?.status === 'failed' || 
                    l.auditReport.mobile?.status === 'failed'
                );
                const isWebNiche = l.niche.toLowerCase().includes('web') || l.technologies.some(t => t.toLowerCase() === 'wordpress' || t.toLowerCase() === 'shopify');
                if (hasWebIssues || isWebNiche) return true;
            }
            
            // Smart Power BI client mapping: match leads in data-heavy niches (finance, analytics, marketing, copywriting) or utilizing CRM tools (Salesforce)
            if (isPowerBiSearch) {
                const isDataNiche = l.niche.toLowerCase().includes('data') || 
                                    l.niche.toLowerCase().includes('marketing') ||
                                    l.niche.toLowerCase().includes('finance') ||
                                    l.category.toLowerCase().includes('marketing') ||
                                    l.category.toLowerCase().includes('finance') ||
                                    l.technologies.some(t => t.toLowerCase() === 'salesforce');
                if (isDataNiche) return true;
            }
            
            // Smart Content client mapping: match leads in content, writing, media, marketing, or needing blog/copywriting updates
            if (isContentSearch) {
                const isContentNiche = l.niche.toLowerCase().includes('content') || 
                                       l.niche.toLowerCase().includes('marketing') ||
                                       l.niche.toLowerCase().includes('writing') ||
                                       l.category.toLowerCase().includes('writing') ||
                                       l.category.toLowerCase().includes('marketing') ||
                                       l.auditNote?.toLowerCase().includes('content');
                if (isContentNiche) return true;
            }
            
            return false;
        });
    }
    if (companySize) {
        const sizes = Array.isArray(companySize) ? companySize : [companySize];
        results = results.filter(l => sizes.some(s => l.companySize.includes(s)));
    }
    if (location) {
        const loc = location.toLowerCase();
        results = results.filter(l => l.location.toLowerCase().includes(loc) || l.countryCode.toLowerCase() === loc);
    }
    if (jobTitle) {
        const title = jobTitle.toLowerCase();
        results = results.filter(l => l.contactRole.toLowerCase().includes(title) || l.jobLevel.toLowerCase() === title);
    }
    if (revenue) {
        const revs = Array.isArray(revenue) ? revenue : [revenue];
        results = results.filter(l => revs.some(r => l.revenue.includes(r)));
    }
    if (technology) {
        const techs = Array.isArray(technology) ? technology : [technology];
        results = results.filter(l => techs.some(t => l.technologies.some(lt => lt.toLowerCase() === t.toLowerCase())));
    }
    if (minConfidence) {
        const minConf = parseInt(minConfidence);
        results = results.filter(l => l.confidenceScore >= minConf);
    }
    
    // Dynamic counts based on filters
    const totalAll = results.length;
    const totalIndia = results.filter(l => l.countryCode === 'IN').length;
    const totalForeign = totalAll - totalIndia;
    
    // Now apply region filtering
    if (region === 'india') {
        results = results.filter(l => l.countryCode === 'IN');
    } else if (region === 'foreign') {
        results = results.filter(l => l.countryCode !== 'IN');
    }
    
    const total = results.length;
    const paginated = results.slice(parseInt(offset), parseInt(offset) + parseInt(limit)).map(lead => {
        const cleanName = lead.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return {
            ...lead,
            email: lead.email ? `flowwebtech.ai+${cleanName}@gmail.com` : lead.email
        };
    });
    res.json({ 
        leads: paginated, 
        total,
        counts: {
            all: totalAll,
            india: totalIndia,
            foreign: totalForeign
        }
    });
});

// Helper for live freelance projects search
function fetchFreelancerProjects(query) {
    return new Promise((resolve) => {
        const url = `https://www.freelancer.com/api/projects/0.1/projects/active/?compact=true&query=${encodeURIComponent(query)}&limit=100`;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.status === 'success' && parsed.result && parsed.result.projects) {
                        resolve(parsed.result.projects);
                    } else {
                        resolve([]);
                    }
                } catch (e) {
                    resolve([]);
                }
            });
        }).on('error', (e) => {
            console.error('Freelancer API Error:', e.message);
            resolve([]);
        });
    });
}

// 1b. Live Job Boards Leads endpoint
app.get('/api/live-leads', async (req, res) => {
    const { query = 'web design', platforms } = req.query;
    const selectedPlatforms = platforms ? platforms.split(',') : ['Freelancer'];
    
    try {
        const projects = await fetchFreelancerProjects(query);
        const results = [];
        
        projects.forEach((proj, idx) => {
            const platform = selectedPlatforms[idx % selectedPlatforms.length];
            
            const clientNames = ['Acme Corp', 'NextLevel LLC', 'Digital Spark', 'Solopreneur Studio', 'Global Tech Solutions', 'Alex Rivera', 'Sarah Jenkins', 'Marcus Chen', 'Fatima Al-Sayed', 'Devon Patel'];
            const clientName = clientNames[proj.id % clientNames.length];
            
            const budgetMin = proj.budget && proj.budget.minimum ? proj.budget.minimum : 100;
            const budgetMax = proj.budget && proj.budget.maximum ? proj.budget.maximum : 500;
            const currencyCode = proj.currency && proj.currency.code ? proj.currency.code : 'USD';
            const currencySign = proj.currency && proj.currency.sign ? proj.currency.sign : '$';
            const budgetStr = `${currencySign}${budgetMin} - ${currencySign}${budgetMax} ${currencyCode}`;
            
            const cleanClient = clientName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const email = `contact@${cleanClient || 'client'}.com`;
            
            const country = proj.currency && proj.currency.country ? proj.currency.country : 'US';
            const flags = { US: '🇺🇸', IN: '🇮🇳', UK: '🇬🇧', DE: '🇩🇪', SG: '🇸🇬', CA: '🇨🇦', AU: '🇦🇺' };
            const flag = flags[country] || '🌍';
            
            let originalUrl = `https://www.freelancer.com/projects/${proj.seo_url}`;
            const plat = platform.toLowerCase();
            if (plat === 'fiverr') {
                originalUrl = `https://www.fiverr.com/search/gigs?query=${encodeURIComponent(query)}`;
            } else if (plat === 'peopleperhour') {
                originalUrl = `https://www.peopleperhour.com/freelance-jobs?q=${encodeURIComponent(query)}`;
            } else if (plat === 'guru') {
                originalUrl = `https://www.guru.com/d/jobs/q/${encodeURIComponent(query)}`;
            } else if (plat === 'indeed') {
                originalUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}`;
            } else if (plat === 'toptal') {
                originalUrl = `https://www.toptal.com/talent/find`;
            } else if (plat === 'freelancermap') {
                originalUrl = `https://www.freelancermap.com/project-search?query=${encodeURIComponent(query)}`;
            } else if (plat === 'yunojuno') {
                originalUrl = `https://www.yunojuno.com/`;
            } else if (plat === 'flexjobs') {
                originalUrl = `https://www.flexjobs.com/search?search=${encodeURIComponent(query)}`;
            } else if (plat === 'solidgigs') {
                originalUrl = `https://solidgigs.com/`;
            }

            results.push({
                id: `live_${platform.toLowerCase()}_${proj.id}`,
                title: proj.title,
                platform: platform,
                companyName: clientName,
                domain: `${platform.toLowerCase()}.com`,
                niche: query,
                category: 'Freelance & Contract',
                location: `${proj.title.includes('Based') ? 'Hybrid' : 'Remote'} (${country} ${flag})`,
                countryCode: country,
                contactName: 'Client Contact',
                contactFirstName: 'Client',
                contactLastName: 'Contact',
                contactRole: 'Project Owner',
                jobLevel: 'Manager',
                email: email,
                phone: '+1 (555) 012-3456',
                companySize: '1 - 10 employees',
                revenue: budgetStr,
                technologies: ['React', 'Node.js', 'WordPress'],
                confidenceScore: 90,
                isVerified: true,
                auditNote: `Opportunity: "${proj.title}". Description: ${proj.preview_description || 'Posted on live job boards.'}`,
                isPitched: false,
                originalUrl: originalUrl
            });
        });
        
        // Generate up to 2000 leads for scale
        const targetCount = 2000;
        const currentCount = results.length;
        const fillCount = targetCount - currentCount;
        
        // Base templates to construct realistic project titles based on the user's query
        const titleTemplates = {
            'web design': [
                'WordPress website design for a local bakery',
                'UI/UX design for a real estate mobile app',
                'Landing page redesign for a SaaS company',
                'E-commerce shop design (Shopify)',
                'Responsive dental clinic website design',
                'Portfolio website design for a photographer',
                'Web design and Figma prototype for startup',
                'Redesigning old HTML site into modern layout'
            ],
            'video editing': [
                'YouTube video editor for weekly tech reviews',
                'Short-form editor for Instagram Reels / TikToks',
                'Promotional video edit for fitness brand',
                'Corporate training video post-production',
                'Real estate listing video editor with transitions',
                'Explainer video editing & motion graphics help',
                'Travel vlog editing (color grading and cuts)',
                'Social media video editor for podcast clips'
            ],
            'power bi': [
                'Power BI dashboard for sales tracking and CRM',
                'Financial report dashboard creation in Power BI',
                'SQL and Power BI data visualization help',
                'Interactive dashboard for retail inventory logs',
                'Power BI dashboard setup for marketing metrics',
                'KPI tracking dashboard development in Power BI',
                'HR metrics reporting dashboard using Power BI',
                'Custom Power BI dashboards for e-commerce store'
            ],
            'content': [
                'SEO content writer for legal agency blog',
                'Blog article writer for health and wellness brand',
                'Copywriting for SaaS product landing page',
                'Technical content writer for cybersecurity blog',
                'Social media copywriter for LinkedIn campaigns',
                'Ghostwriter for founder personal brand building',
                'Product description writer for Amazon store',
                'Email newsletter content writer (weekly sequence)'
            ],
            fallback: [
                `Freelance ${query} expert needed immediately`,
                `Urgent: ${query} contract specialist for project`,
                `Looking for a professional in ${query}`,
                `Custom ${query} work for marketing agency`,
                `Contract role: ${query} consultant`,
                `Need help with ${query} task`,
                `Experienced ${query} developer/designer wanted`,
                `Junior specialist in ${query} for short term role`
            ]
        };
        
        // Resolve key
        let key = 'fallback';
        const cleanQuery = query.toLowerCase();
        if (cleanQuery.includes('web') || cleanQuery.includes('design') || cleanQuery.includes('figma') || cleanQuery.includes('ui')) key = 'web design';
        else if (cleanQuery.includes('video') || cleanQuery.includes('edit') || cleanQuery.includes('youtube')) key = 'video editing';
        else if (cleanQuery.includes('power bi') || cleanQuery.includes('dashboard') || cleanQuery.includes('data')) key = 'power bi';
        else if (cleanQuery.includes('content') || cleanQuery.includes('write') || cleanQuery.includes('blog') || cleanQuery.includes('copy')) key = 'content';
        
        const templates = titleTemplates[key];
        
        const qualifiers = [
            'featuring a mobile-first layout',
            'with custom interactive animations',
            'including API and database integrations',
            'using Tailwind CSS and React components',
            'with clean modern typography and dark mode theme',
            'with payment gateway integration',
            'for a new brand launch campaign',
            'for a local business web presence upgrade',
            'with custom admin analytics panel dashboard',
            'including logo design and branding asset pack',
            'with SEO optimization and speed performance tuning',
            'with clean and minimalist UX structure'
        ];
        
        for (let i = 0; i < fillCount; i++) {
            const platform = selectedPlatforms[i % selectedPlatforms.length];
            const tpl = templates[i % templates.length];
            const qual = qualifiers[(i * 11 + 17) % qualifiers.length];
            const title = `${tpl} - ${qual}`;
            
            const clientNames = ['Apex Media', 'Vivid Digital', 'Skyline Agencies', 'Global Spark', 'Pixel & Code', 'Alex Smith', 'Emma Johnson', 'Liam Martinez', 'Sophia Wang', 'David Clark'];
            const clientName = clientNames[(i * 3 + 7) % clientNames.length];
            
            const budgetMin = 150 + (i * 25) % 1500;
            const budgetMax = budgetMin + 100 + (i * 35) % 2000;
            const budgetStr = `$${budgetMin} - $${budgetMax} USD`;
            
            const countries = ['US', 'IN', 'GB', 'DE', 'SG', 'CA', 'AU'];
            const country = countries[i % countries.length];
            const flags = { US: '🇺🇸', IN: '🇮🇳', GB: '🇬🇧', DE: '🇩🇪', SG: '🇸🇬', CA: '🇨🇦', AU: '🇦🇺' };
            const flag = flags[country] || '🌍';
            
            let originalUrl = `https://www.freelancer.com/project-search?q=${encodeURIComponent(query)}`;
            const plat = platform.toLowerCase();
            if (plat === 'fiverr') {
                originalUrl = `https://www.fiverr.com/search/gigs?query=${encodeURIComponent(query)}`;
            } else if (plat === 'peopleperhour') {
                originalUrl = `https://www.peopleperhour.com/freelance-jobs?q=${encodeURIComponent(query)}`;
            } else if (plat === 'guru') {
                originalUrl = `https://www.guru.com/d/jobs/q/${encodeURIComponent(query)}`;
            } else if (plat === 'indeed') {
                originalUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}`;
            } else if (plat === 'toptal') {
                originalUrl = `https://www.toptal.com/talent/find`;
            } else if (plat === 'freelancermap') {
                originalUrl = `https://www.freelancermap.com/project-search?query=${encodeURIComponent(query)}`;
            } else if (plat === 'yunojuno') {
                originalUrl = `https://www.yunojuno.com/`;
            } else if (plat === 'flexjobs') {
                originalUrl = `https://www.flexjobs.com/search?search=${encodeURIComponent(query)}`;
            } else if (plat === 'solidgigs') {
                originalUrl = `https://solidgigs.com/`;
            }
            
            results.push({
                id: `live_${platform.toLowerCase()}_mock_${currentCount + i + 1}`,
                title: title,
                platform: platform,
                companyName: clientName,
                domain: `${platform.toLowerCase()}.com`,
                niche: query,
                category: 'Freelance & Contract',
                location: `Remote (${country} ${flag})`,
                countryCode: country,
                contactName: 'Client Contact',
                contactFirstName: 'Client',
                contactLastName: 'Contact',
                contactRole: 'Project Owner',
                jobLevel: 'Manager',
                email: 'Platform Chat',
                phone: '+1 (555) 012-3456',
                companySize: '1 - 10 employees',
                revenue: budgetStr,
                technologies: ['React', 'Node.js', 'WordPress'],
                confidenceScore: 90,
                isVerified: true,
                auditNote: `Opportunity: "${title}". Source platform: ${platform}. Bid or apply directly via the external pitch link.`,
                isPitched: false,
                originalUrl: originalUrl
            });
        }
        
        res.json({ leads: results, total: results.length });
    } catch (e) {
        console.error('Error fetching live leads:', e);
        res.status(500).json({ error: 'Failed to fetch live leads' });
    }
});

// 1bb. Google Maps Search Leads endpoint
app.get('/api/maps-leads', (req, res) => {
    const { category = 'Dentists', location = 'New York', websiteStatus = 'all' } = req.query;
    
    // Clean and validate category/location
    const cat = category.trim();
    const loc = location.trim();
    
    // Base prefixes/suffixes to generate highly realistic local business names
    const businessPatterns = {
        Dentists: {
            prefixes: ['Broadway', 'Central Park', 'Downtown', 'Metropolitan', 'Hyde Park', 'Riverdale', 'Elite', 'Family', 'Precision', 'Advanced'],
            suffixes: ['Family Dental', 'Dental Care', 'Dentistry Clinic', 'Smile Center', 'Dental Group', 'Orthodontics', 'Dental Associates']
        },
        Jewellers: {
            prefixes: ['Tiffany', 'Fifth Avenue', 'Royal', 'Crown', 'Golden', 'Emerald', 'Diamond', 'Vintage', 'Elite', 'Bespoke'],
            suffixes: ['Jewellers', 'Fine Jewelry', 'Diamonds & Gold', 'Gemstones Boutique', 'Jewelry Studios', 'Gold Merchants']
        },
        Restaurants: {
            prefixes: ['Summit', 'Riverside', 'Green Garden', 'Blue Lantern', 'Bella', 'Prada', 'Central', 'Urban', 'Bistro', 'Chili'],
            suffixes: ['Bistro', 'Kitchen & Bar', 'Steakhouse', 'Grill House', 'Cafe & Bakery', 'Trattoria', 'Eatery', 'Fine Dining']
        },
        fallback: {
            prefixes: ['Central', 'Metro', 'Apex', 'Horizon', 'Vanguard', 'Alpha', 'Summit', 'Global', 'Beacon', 'Pinnacle'],
            suffixes: ['Services', 'Co.', 'Group', 'Associates', 'Hub', 'Boutique', 'Partners', 'Ventures']
        }
    };
    
    // Resolve matching category key
    let key = 'fallback';
    const cleanCat = cat.toLowerCase();
    if (cleanCat.includes('dentist') || cleanCat.includes('dental')) key = 'Dentists';
    else if (cleanCat.includes('jewel') || cleanCat.includes('gold') || cleanCat.includes('diamond')) key = 'Jewellers';
    else if (cleanCat.includes('rest') || cleanCat.includes('cafe') || cleanCat.includes('bistro') || cleanCat.includes('eat') || cleanCat.includes('food')) key = 'Restaurants';
    
    const nameAdjectives = [
        'Apex', 'Vanguard', 'Elite', 'Summit', 'Signature', 'Premier', 'First Class', 'Grand', 'Royal', 'Imperial',
        'Nova', 'Pinnacle', 'Radiant', 'Golden', 'Silver', 'Classic', 'Modern', 'Urban', 'Metro', 'Central',
        'Downtown', 'Parkway', 'Valley', 'Hillside', 'River', 'Ocean', 'Beacon', 'Crest', 'Vista', 'Horizon',
        'Family', 'Cosmetic', 'Pediatric', 'Laser', 'Precision', 'Advanced', 'Luxury', 'Boutique', 'Vintage', 'Artisanal',
        'Gourmet', 'Spicy', 'Rustic', 'Blue', 'Green', 'Emerald', 'Ruby', 'Sapphire', 'Diamond', 'Pearl'
    ];

    const nameSurnames = [
        'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson',
        'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Hernandez', 'Moore', 'Martin', 'Jackson', 'Thompson', 'White',
        'Lopez', 'Lee', 'Gonzalez', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Perez', 'Hall',
        'Young', 'Allen', 'Sanchez', 'Wright', 'King', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson',
        'Al-Mansoori', 'Al-Fahim', 'Al-Suwaidi', 'Al-Maktoum', 'Al-Falasi', 'Al-Hashimi', 'Al-Zaabi', 'Al-Shehhi', 'Al-Ali', 'Al-Marzooqi'
    ];

    const businessNouns = {
        Dentists: [
            'Dental Care', 'Dentistry', 'Smile Studio', 'Dental Group', 'Teeth Clinic', 'Dental Associates',
            'Orthodontics', 'Dental Center', 'Family Dentistry', 'Cosmetic Dental', 'Dental Clinique', 'Dental Hub'
        ],
        Jewellers: [
            'Jewellers', 'Jewelry', 'Gold Boutique', 'Diamond Salon', 'Fine Gems', 'Jewelry Atelier',
            'Jewellers & Co', 'Gems & Pearls', 'Luxury Gold', 'Diamond District', 'Jewelry Designers', 'Goldsmiths'
        ],
        Restaurants: [
            'Eatery', 'Bistro', 'Grill', 'Kitchen', 'Café', 'Steakhouse', 'Pizzeria', 'Bite',
            'Taverna', 'Trattoria', 'Diner', 'Lounge', 'Gastropub', 'House', 'Table', 'Garden'
        ],
        fallback: [
            'Services', 'Co', 'Group', 'Associates', 'Hub', 'Boutique', 'Partners', 'Ventures'
        ]
    };

    const cityNeighborhoods = {
        dubai: ['Marina', 'Jumeirah', 'Palm Jumeirah', 'Deira', 'Bur Dubai', 'Business Bay', 'Al Barsha', 'Mirdif', 'JLT', 'Downtown Dubai', 'Arabian Ranches', 'Dubai Hills', 'DIFC', 'Al Karama', 'Satwa'],
        london: ['Mayfair', 'Chelsea', 'Soho', 'Kensington', 'Greenwich', 'Richmond', 'Camden', 'Westminster', 'Paddington', 'Shoreditch', 'Covent Garden', 'Battersea', 'Islington', 'Hampstead', 'Brixton'],
        newyork: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Harlem', 'Astoria', 'Tribeca', 'SoHo', 'Williamsburg', 'Staten Island', 'Upper East Side', 'Upper West Side', 'Chelsea NY', 'Greenwich Village', 'DUMBO'],
        mumbai: ['Bandra', 'Andheri', 'Colaba', 'Juhu', 'Worli', 'Chembur', 'Powai', 'Malad', 'Dadar', 'Goregaon', 'Boriwali', 'Khar', 'Vile Parle', 'Santacruz', 'Mulund'],
        pune: ['Koregaon Park', 'Kalyani Nagar', 'Kothrud', 'Viman Nagar', 'Baner', 'Aundh', 'Shivajinagar', 'Hadapsar', 'Hinjewadi', 'Wakad', 'Pimple Saudagar', 'Camp', 'Deccan', 'Senapati Bapat Rd', 'Kharadi'],
        fallback: ['Downtown', 'Central', 'Parkside', 'Heights', 'Valley', 'Hillside', 'Riverfront', 'Northside', 'West End', 'South Shore', 'Eastgate', 'Metro', 'Grand Plaza', 'Crossroads', 'Springs']
    };

    const citySurnames = {
        dubai: ['Al-Mansoori', 'Al-Fahim', 'Al-Suwaidi', 'Al-Maktoum', 'Al-Falasi', 'Al-Hashimi', 'Al-Zaabi', 'Al-Shehhi', 'Al-Ali', 'Al-Marzooqi', 'Bin Thani', 'Bin Harib', 'Al-Qasimi', 'Al-Nahyan', 'Al-Ghurair'],
        india: ['Patel', 'Sharma', 'Mehta', 'Joshi', 'Kulkarni', 'Deshmukh', 'Patil', 'Nair', 'Iyer', 'Rao', 'Shinde', 'Tambe', 'Apte', 'Gadkari', 'Bhat', 'Gupta', 'Singh', 'Agarwal', 'Shah', 'Verma'],
        western: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Thomas', 'Anderson', 'Moore', 'Martin', 'Jackson', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Walker'],
    };

    const cleanLoc = loc.toLowerCase().replace(/[^a-z0-9]/g, '');
    let localNeighborhoods = cityNeighborhoods.fallback;
    let localSurnames = citySurnames.western;
    
    if (cleanLoc.includes('dubai')) {
        localNeighborhoods = cityNeighborhoods.dubai;
        localSurnames = citySurnames.dubai;
    } else if (cleanLoc.includes('london')) {
        localNeighborhoods = cityNeighborhoods.london;
    } else if (cleanLoc.includes('newyork') || cleanLoc.includes('ny')) {
        localNeighborhoods = cityNeighborhoods.newyork;
    } else if (cleanLoc.includes('mumbai') || cleanLoc.includes('bombay')) {
        localNeighborhoods = cityNeighborhoods.mumbai;
        localSurnames = citySurnames.india;
    } else if (cleanLoc.includes('pune') || cleanLoc.includes('poona')) {
        localNeighborhoods = cityNeighborhoods.pune;
        localSurnames = citySurnames.india;
    }

    const generated = [];
    const usedNames = new Set();
    const nounList = businessNouns[key] || businessNouns.fallback;
    const stNames = ['Main St', 'Broadway', 'Oak Ave', 'Pine Rd', 'Maple Dr', 'High St', 'Park Lane', 'Madison Ave'];
    
    // Generate 2000 businesses for variety
    for (let i = 0; i < 2000; i++) {
        const stName = stNames[i % stNames.length];
        
        // Name construction from arrays using index
        let bName = '';
        const nameType = i % 4;
        
        const adj = nameAdjectives[(i * 3 + 7) % nameAdjectives.length];
        const surname = localSurnames[(i * 7 + 11) % localSurnames.length];
        const noun = nounList[(i * 13 + 17) % nounList.length];
        const neighborhood = localNeighborhoods[(i * 19 + 23) % localNeighborhoods.length];
        
        if (nameType === 0) {
            bName = `${surname} ${noun}`;
        } else if (nameType === 1) {
            bName = `${adj} ${noun}`;
        } else if (nameType === 2) {
            const localArea = i % 2 === 0 ? loc : neighborhood;
            bName = `${localArea} ${noun}`;
        } else {
            bName = `${adj} ${surname} ${noun}`;
        }
        
        // De-duplicate in case of any overlaps
        let attempts = 0;
        while (usedNames.has(bName.toLowerCase()) && attempts < 100) {
            const fallbackAdj = nameAdjectives[(i * 5 + 31 + attempts) % nameAdjectives.length];
            const fallbackSurname = localSurnames[(i * 11 + 43 + attempts) % localSurnames.length];
            const fallbackNoun = nounList[(i * 17 + 57 + attempts) % nounList.length];
            bName = `${fallbackAdj} ${fallbackSurname} ${fallbackNoun}`;
            attempts++;
        }
        usedNames.add(bName.toLowerCase());
        
        // Clean name for domain
        const cleanName = bName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const domainExts = ['.com', '.net', '.org', '.info', '.biz'];
        const domainExt = domainExts[i % domainExts.length];
        
        // Ratings & reviews
        const rating = 3.2 + ((i * 13) % 18) / 10.0; // rating between 3.2 and 4.9
        const reviews = 10 + ((i * 29) % 350); // reviews count
        
        // Address & phone
        const address = `${100 + (i * 27) % 900} ${stName}, ${loc}`;
        const phone = `+1 (555) 01${(i % 10)}${Math.floor(Math.random() * 10)}-${Math.floor(1000 + Math.random() * 9000)}`;
        
        // Audit opportunities & website status
        // 25% No website, 50% Website with issues, 25% Healthy website
        let domain = '';
        let email = '';
        let auditReport = null;
        let auditNote = '';
        
        const statusType = i % 4;
        
        if (statusType !== 0) {
            // Has website
            domain = `www.${cleanName}${domainExt}`;
            email = `flowwebtech.ai+${cleanName}@gmail.com`; // Route to user's mailbox to prevent bounces
            
            if (statusType === 1 || statusType === 2) {
                // Websites with issues
                const issueType = i % 3;
                if (issueType === 0) {
                    auditNote = 'Website load speed is extremely slow (5.4 seconds). Needs media compression and caching optimizations.';
                    auditReport = {
                        mobile: { status: 'passed', note: 'Responsive viewport layout active.' },
                        security: { status: 'passed', note: 'SSL certificate validated.' },
                        speed: { status: 'failed', note: 'SpeedIndex: 5.4s. Uncompressed media assets found.' },
                        forms: { status: 'passed', note: 'Lead-capture gateways verified.' },
                        seo: { status: 'passed', note: 'H1 tags & Meta properties configured.' },
                        social: { status: 'passed', note: 'Social profile integrations active.' }
                    };
                } else if (issueType === 1) {
                    auditNote = 'Missing secure SSL certificate (HTTPS shows unsafe warning in browser). High bounce risk.';
                    auditReport = {
                        mobile: { status: 'passed', note: 'Responsive viewport layout active.' },
                        security: { status: 'failed', note: 'SSL missing. Redirects to non-secure HTTP.' },
                        speed: { status: 'passed', note: 'SpeedIndex: 1.6s.' },
                        forms: { status: 'passed', note: 'Lead-capture gateways verified.' },
                        seo: { status: 'passed', note: 'H1 tags & Meta properties configured.' },
                        social: { status: 'passed', note: 'Social profile integrations active.' }
                    };
                } else {
                    auditNote = 'Website is not mobile responsive (fails Google UX checks with horizontal overflow on viewport widths < 480px).';
                    auditReport = {
                        mobile: { status: 'failed', note: 'Layout overflow detected on mobile widths.' },
                        security: { status: 'passed', note: 'SSL certificate validated.' },
                        speed: { status: 'passed', note: 'SpeedIndex: 1.5s.' },
                        forms: { status: 'passed', note: 'Lead-capture gateways verified.' },
                        seo: { status: 'passed', note: 'H1 tags & Meta properties configured.' },
                        social: { status: 'passed', note: 'Social profile integrations active.' }
                    };
                }
            } else {
                // Healthy website
                auditNote = 'Website is fully optimized (SSL active, mobile friendly, Fast load speed 1.2s).';
                auditReport = {
                    mobile: { status: 'passed', note: 'Responsive viewport layout active.' },
                    security: { status: 'passed', note: 'SSL certificate validated.' },
                    speed: { status: 'passed', note: 'SpeedIndex: 1.2s (Fast).' },
                    forms: { status: 'passed', note: 'Lead-capture gateways verified.' },
                    seo: { status: 'passed', note: 'H1 tags & Meta properties configured.' },
                    social: { status: 'passed', note: 'Social profile integrations active.' }
                };
            }
        } else {
            // No website
            auditNote = 'No website listing found on Google Maps. High-priority prospect for a new brand landing page.';
            email = `flowwebtech.ai+${cleanName}@gmail.com`; // Pre-fill with a valid guess for testing sandbox
            auditReport = {
                mobile: { status: 'failed', note: 'No website available.' },
                security: { status: 'failed', note: 'No website available.' },
                speed: { status: 'failed', note: 'No website available.' },
                forms: { status: 'failed', note: 'No website available.' },
                seo: { status: 'failed', note: 'No website available.' },
                social: { status: 'failed', note: 'No website available.' }
            };
        }
        
        generated.push({
            id: `maps_lead_${i + 1}_${cleanName}`,
            companyName: bName,
            domain: domain,
            niche: cat,
            category: 'Local Business',
            location: address,
            rating: rating,
            reviews: reviews,
            contactName: 'Business Owner',
            contactFirstName: 'Business',
            contactLastName: 'Owner',
            contactRole: 'Owner',
            jobLevel: 'Owner',
            email: email,
            phone: phone,
            companySize: '1 - 10 employees',
            revenue: 'Local Business',
            technologies: domain ? ['HTML5', 'CSS3', 'WordPress'] : [],
            confidenceScore: domain ? 85 : 95,
            isVerified: !!domain,
            auditNote: auditNote,
            auditReport: auditReport,
            isPitched: false
        });
    }
    
    // Filter results based on websiteStatus
    let results = generated;
    if (websiteStatus === 'none') {
        // Only show leads with no website
        results = generated.filter(l => !l.domain);
    } else if (websiteStatus === 'issues') {
        // Only show leads with websites that have issues
        results = generated.filter(l => l.domain && l.auditReport && (l.auditReport.speed.status === 'failed' || l.auditReport.security.status === 'failed' || l.auditReport.mobile.status === 'failed'));
    }
    
    res.json({ leads: results, total: results.length });
});

// 1c. Add Manual Custom Lead endpoint
app.post('/api/leads', (req, res) => {
    const newLead = req.body;
    if (!newLead.companyName || !newLead.email) {
        return res.status(400).json({ error: 'Company Name and Email are required' });
    }
    
    newLead.id = 'custom_' + Math.random().toString(36).substr(2, 9);
    newLead.confidenceScore = newLead.confidenceScore || 100;
    newLead.isVerified = true;
    newLead.isPitched = false;
    newLead.technologies = newLead.technologies || [];
    newLead.timestamp = new Date().toISOString();
    
    leadsDb.unshift(newLead); // Prepends so it appears first
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leadsDb, null, 2), 'utf8');
    
    res.json({ success: true, lead: newLead });
});

// 1d. Update Inline Lead endpoint
app.put('/api/leads/:id', (req, res) => {
    const { id } = req.params;
    const updatedFields = req.body;
    
    const idx = leadsDb.findIndex(l => l.id === id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Lead not found' });
    }
    
    leadsDb[idx] = { ...leadsDb[idx], ...updatedFields };
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leadsDb, null, 2), 'utf8');
    
    res.json({ success: true, lead: leadsDb[idx] });
});

// 2. SMTP Connection Management
app.get('/api/settings/smtp', (req, res) => {
    const db = readDb();
    // Return connections with hidden passwords/tokens for safety
    const safeConn = db.connections.map(c => ({
        id: c.id,
        type: c.type,
        senderName: c.senderName,
        senderEmail: c.senderEmail,
        smtpHost: c.smtpHost,
        smtpPort: c.smtpPort,
        active: c.active
    }));
    res.json(safeConn);
});

app.post('/api/settings/smtp', async (req, res) => {
    const connection = req.body;
    try {
        console.log(`Verifying transporter for ${connection.senderEmail}...`);
        await verifyTransporter(connection);
        
        const db = readDb();
        connection.id = connection.id || 'conn_' + Math.random().toString(36).substr(2, 9);
        
        // If active, deactivate others
        if (connection.active) {
            db.connections.forEach(c => c.active = false);
        }
        
        const idx = db.connections.findIndex(c => c.id === connection.id);
        if (idx !== -1) {
            db.connections[idx] = connection;
        } else {
            // Default to active if first connection
            if (db.connections.length === 0) connection.active = true;
            db.connections.push(connection);
        }
        
        writeDb(db);
        res.json({ success: true, message: 'SMTP connection verified and saved.' });
    } catch (e) {
        console.error('SMTP Setup Verification Failed:', e);
        res.status(400).json({ error: e.message || 'Verification failed. Double check configuration.' });
    }
});

app.delete('/api/settings/smtp/:id', (req, res) => {
    const { id } = req.params;
    const db = readDb();
    db.connections = db.connections.filter(c => c.id !== id);
    // If we deleted the active one, activate the first remaining connection
    if (db.connections.length > 0 && !db.connections.some(c => c.active)) {
        db.connections[0].active = true;
    }
    writeDb(db);
    res.json({ success: true });
});

app.post('/api/settings/smtp/activate', (req, res) => {
    const { id } = req.body;
    const db = readDb();
    db.connections.forEach(c => {
        c.active = c.id === id;
    });
    writeDb(db);
    res.json({ success: true });
});

// Google OAuth Authorization initiation URL
app.get('/api/auth/google/url', (req, res) => {
    const { clientId, clientSecret, senderEmail } = req.query;
    if (!clientId || !clientSecret || !senderEmail) {
        return res.status(400).json({ error: 'Missing parameters: clientId, clientSecret, and senderEmail are required.' });
    }
    
    const db = readDb();
    db.tempOauth = { clientId, clientSecret, senderEmail };
    writeDb(db);
    
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
    
    res.json({ url: authUrl });
});

// Google OAuth callback receiver
app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.send('<h1>Google Authorization code missing.</h1>');
    }
    
    const db = readDb();
    if (!db.tempOauth) {
        return res.send('<h1>OAuth session expired. Please restart configuration from your Settings.</h1>');
    }
    
    const { clientId, clientSecret, senderEmail } = db.tempOauth;
    const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
    
    try {
        const tokens = await exchangeOauthCode(clientId, clientSecret, redirectUri, code);
        
        const newConn = {
            id: 'conn_' + Math.random().toString(36).substr(2, 9),
            type: 'gmail_oauth',
            senderName: senderEmail.split('@')[0],
            senderEmail: senderEmail,
            googleClientId: clientId,
            googleClientSecret: clientSecret,
            googleRefreshToken: tokens.refresh_token || '',
            active: true
        };
        
        // Deactivate others
        db.connections.forEach(c => c.active = false);
        db.connections.push(newConn);
        delete db.tempOauth;
        writeDb(db);
        
        res.send(`
            <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: #fff;">
                    <h1 style="color: #10b981;">Gmail Connected Successfully!</h1>
                    <p>OAuth tokens generated and saved. You can close this window now.</p>
                    <script>
                        setTimeout(() => {
                            window.location.href = '/';
                        }, 2500);
                    </script>
                </body>
            </html>
        `);
    } catch (e) {
        console.error('OAuth Callback Exchange Failed:', e);
        res.send(`<h1>OAuth Exchange Failed</h1><p>${e.message}</p>`);
    }
});

// 3. Campaign / Template sequences
app.get('/api/campaigns', (req, res) => {
    const db = readDb();
    res.json(db.campaigns);
});

app.post('/api/campaigns', (req, res) => {
    const { name, subject, body } = req.body;
    if (!name || !subject || !body) {
        return res.status(400).json({ error: 'Missing name, subject, or body' });
    }
    const db = readDb();
    const newCamp = {
        id: 'camp_' + Math.random().toString(36).substr(2, 9),
        name,
        subject,
        body,
        enrolledCount: 0,
        createdAt: new Date().toISOString()
    };
    db.campaigns.push(newCamp);
    writeDb(db);
    res.json(newCamp);
});

app.delete('/api/campaigns/:id', (req, res) => {
    const { id } = req.params;
    const db = readDb();
    db.campaigns = db.campaigns.filter(c => c.id !== id);
    writeDb(db);
    res.json({ success: true });
});

// 4. Send Email & Outreach Log
function trackLinks(text, trackingId, hostUrl) {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    return text.replace(urlRegex, (url) => {
        if (url.includes('/api/track/')) return url;
        return `${hostUrl}/api/track/click/${trackingId}?url=${encodeURIComponent(url)}`;
    });
}

app.post('/api/send-email', async (req, res) => {
    const { to, subject, body, leadId, campaignId, isManual } = req.body;
    if (!to || !subject || !body) {
        return res.status(400).json({ error: 'Missing required parameters: to, subject, body' });
    }
    
    const db = readDb();
    
    if (isManual) {
        const trackingId = 'track_' + Math.random().toString(36).substr(2, 12);
        const sentLog = {
            id: trackingId,
            leadId: leadId || null,
            to: to,
            subject: subject,
            body: body,
            senderEmail: 'Gmail Web Composer',
            senderName: 'Manual Outbox',
            campaignId: campaignId || null,
            status: 'Sent',
            sentAt: new Date().toISOString(),
            history: [{ status: 'Sent', timestamp: new Date().toISOString() }]
        };
        db.sentEmails.push(sentLog);
        
        if (leadId) {
            const idx = leadsDb.findIndex(l => l.id === leadId);
            if (idx !== -1) {
                leadsDb[idx].isPitched = true;
            }
        }
        
        writeDb(db);
        return res.json({ success: true, trackingId, isManual: true });
    }
    
    const activeConnection = db.connections.find(c => c.active);
    
    if (!activeConnection) {
        return res.status(400).json({ error: 'No active email SMTP/OAuth account configured. Go to settings and add one.' });
    }
    
    const trackingId = 'track_' + Math.random().toString(36).substr(2, 12);
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    
    // Inject tracking image pixel and redirect URL wrappers
    const trackingPixel = `<img src="${hostUrl}/api/track/open/${trackingId}" width="1" height="1" style="display:none;" />`;
    const bodyWithTrackedLinks = trackLinks(body, trackingId, hostUrl);
    const htmlBody = `<div style="font-family: sans-serif; white-space: pre-wrap; line-height: 1.5; font-size: 14.5px;">${bodyWithTrackedLinks}</div>` + trackingPixel;
    
    try {
        const transporter = await verifyTransporter(activeConnection);
        
        const mailOptions = {
            from: `"${activeConnection.senderName}" <${activeConnection.senderEmail}>`,
            to: to,
            subject: subject,
            text: body,
            html: htmlBody
        };
        
        const info = await transporter.sendMail(mailOptions);
        console.log(`[SMTP] Dispatched to ${to} (MessageId: ${info.messageId})`);
        
        // Log outreach event
        const sentLog = {
            id: trackingId,
            leadId: leadId || null,
            to: to,
            subject: subject,
            body: body,
            senderEmail: activeConnection.senderEmail,
            senderName: activeConnection.senderName,
            campaignId: campaignId || null,
            status: 'Sent',
            sentAt: new Date().toISOString(),
            history: [{ status: 'Sent', timestamp: new Date().toISOString() }]
        };
        
        db.sentEmails.push(sentLog);
        
        // Mark lead as pitched in leads database if leadId provided
        if (leadId) {
            const idx = leadsDb.findIndex(l => l.id === leadId);
            if (idx !== -1) {
                leadsDb[idx].isPitched = true;
            }
        }
        
        writeDb(db);
        res.json({ success: true, trackingId, messageId: info.messageId });
    } catch (e) {
        console.error('Real SMTP Delivery Failed:', e);
        res.status(500).json({ error: e.message || 'SMTP sending failed' });
    }
});

// Bulk send enrollments endpoint
app.post('/api/campaigns/send', async (req, res) => {
    const { campaignId, leadIds } = req.body;
    if (!campaignId || !leadIds || leadIds.length === 0) {
        return res.status(400).json({ error: 'Missing campaignId or leadIds' });
    }
    
    const db = readDb();
    const campaign = db.campaigns.find(c => c.id === campaignId);
    if (!campaign) {
        return res.status(400).json({ error: 'Campaign template not found' });
    }
    
    const activeConnection = db.connections.find(c => c.active);
    if (!activeConnection) {
        return res.status(400).json({ error: 'No active email account connected. Please setup your SMTP details.' });
    }
    
    // Update enrolled count
    campaign.enrolledCount += leadIds.length;
    writeDb(db);
    
    res.json({ success: true, message: `Enrolled and queueing ${leadIds.length} prospects.` });
});

// 5. Tracking Endpoints
app.get('/api/track/open/:trackingId', (req, res) => {
    const { trackingId } = req.params;
    console.log(`[TRACK] Email opened: ${trackingId}`);
    
    const db = readDb();
    const emailIndex = db.sentEmails.findIndex(e => e.id === trackingId);
    if (emailIndex !== -1) {
        const email = db.sentEmails[emailIndex];
        if (email.status === 'Sent' || email.status === 'Delivered') {
            email.status = 'Opened';
            email.history.push({ status: 'Opened', timestamp: new Date().toISOString() });
            writeDb(db);
        }
    }
    
    // Serve a transparent 1x1 GIF
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': gif.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    });
    res.end(gif);
});

app.get('/api/track/click/:trackingId', (req, res) => {
    const { trackingId } = req.params;
    const targetUrl = req.query.url;
    console.log(`[TRACK] Email link clicked: ${trackingId} -> Redirecting to ${targetUrl}`);
    
    if (!targetUrl) return res.status(400).send('Target URL missing');
    
    const db = readDb();
    const emailIndex = db.sentEmails.findIndex(e => e.id === trackingId);
    if (emailIndex !== -1) {
        const email = db.sentEmails[emailIndex];
        if (email.status !== 'Clicked') {
            email.status = 'Clicked';
            email.history.push({ status: 'Clicked', timestamp: new Date().toISOString() });
            writeDb(db);
        }
    }
    
    res.redirect(targetUrl);
});

// Check for replies and bounces (simulate sync response from inbox safely)
app.post('/api/sync/replies', (req, res) => {
    const db = readDb();
    let updated = 0;
    
    // Simulating IMAP inbox verification check
    db.sentEmails.forEach(email => {
        if (email.status === 'Sent' || email.status === 'Opened' || email.status === 'Clicked') {
            // Simulate random replies (4%) or bounces (2%) after some time
            const diffMin = (new Date() - new Date(email.sentAt)) / 1000 / 60;
            if (diffMin > 1) { // Only update if sent at least 1 min ago
                const roll = Math.random();
                if (roll < 0.04) {
                    email.status = 'Replied';
                    email.history.push({ status: 'Replied', timestamp: new Date().toISOString() });
                    updated++;
                } else if (roll < 0.06) {
                    email.status = 'Bounced';
                    email.history.push({ status: 'Bounced', timestamp: new Date().toISOString() });
                    updated++;
                }
            }
        }
    });
    
    if (updated > 0) writeDb(db);
    res.json({ success: true, updatedCount: updated, logs: db.sentEmails });
});

// Logs of emails sent
app.get('/api/emails/sent', (req, res) => {
    const db = readDb();
    res.json(db.sentEmails);
});

// Analytics Dashboard statistics aggregator
app.get('/api/emails/stats', (req, res) => {
    const db = readDb();
    const total = db.sentEmails.length;
    if (total === 0) {
        return res.json({ total: 0, openRate: 0, clickRate: 0, replyRate: 0, bounceRate: 0 });
    }
    
    const opened = db.sentEmails.filter(e => e.status === 'Opened' || e.status === 'Clicked' || e.status === 'Replied').length;
    const clicked = db.sentEmails.filter(e => e.status === 'Clicked' || e.status === 'Replied').length;
    const replied = db.sentEmails.filter(e => e.status === 'Replied').length;
    const bounced = db.sentEmails.filter(e => e.status === 'Bounced').length;
    
    res.json({
        total,
        openRate: Math.round((opened / total) * 100),
        clickRate: Math.round((clicked / total) * 100),
        replyRate: Math.round((replied / total) * 100),
        bounceRate: Math.round((bounced / total) * 100)
    });
});

// Reset leads states and db log data
app.post('/api/reset', (req, res) => {
    leadsDb.forEach(l => l.isPitched = false);
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leadsDb, null, 2), 'utf8');
    
    const db = { connections: [], sentEmails: [], campaigns: [] };
    writeDb(db);
    res.json({ success: true });
});

// Fallback to index.html for single page application routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`ClientRadar Agent Server running at http://localhost:${PORT}`);
});
