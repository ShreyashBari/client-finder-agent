const fs = require('fs');
const path = require('path');

// Seed arrays for high variety B2B lead generation
const niches = [
    { name: 'Power BI Dashboards', category: 'Data & Analytics' },
    { name: 'Content Marketing', category: 'Marketing & Writing' },
    { name: 'Jewellers', category: 'Retail & Luxury' },
    { name: 'Dental', category: 'Medical & Healthcare' },
    { name: 'Real Estate', category: 'Real Estate' },
    { name: 'Restaurants', category: 'Food & Beverage' },
    { name: 'SaaS', category: 'Software & Technology' },
    { name: 'Web Design', category: 'Design & Creative' },
    { name: 'Digital Marketing', category: 'Marketing & Advertising' },
    { name: 'EdTech', category: 'Education & Training' },
    { name: 'Healthcare', category: 'Medical & Healthcare' },
    { name: 'Legal Services', category: 'Legal & Compliance' },
    { name: 'E-commerce', category: 'Retail & E-commerce' },
    { name: 'Logistics', category: 'Transportation & Supply Chain' },
    { name: 'Finance', category: 'Financial Services' }
];

const prefixes = {
    US: ['Aero', 'Stellar', 'Stripe', 'Quant', 'Apex', 'Zenith', 'NextGen', 'Synergy', 'Hyperion', 'Omni', 'Vanguard', 'Stripe', 'BlueSky', 'Pixel', 'Logic', 'DevScale', 'Cloud', 'Pulse', 'Summit', 'Nova'],
    IN: ['Indus', 'Banyan', 'Deccan', 'Vedic', 'Ganga', 'Himalaya', 'Kaveri', 'Mantra', 'Saffron', 'Karma', 'Nava', 'Aarna', 'Bharat', 'Hind', 'Arya', 'Pragati', 'Uday', 'Swaraj', 'Kiran', 'Prithvi'],
    UK: ['Thames', 'Crest', 'Sterling', 'Vertex', 'Avalon', 'Beacon', 'Boundary', 'Empire', 'Royal', 'Albion', 'Stonegate', 'Sentinel', 'Britannia', 'Meridian', 'Apex', 'Pinnacle', 'Sovereign', 'Integra'],
    DE: ['Berlin', 'Munich', 'Hanse', 'Rheingold', 'Alps', 'Donau', 'Stuttgart', 'Vanguard', 'Vector', 'Nordic', 'Optima', 'Prisma', 'Stein', 'Kraft', 'Element', 'Sigma', 'Meta', 'Kaiser'],
    SG: ['Merlion', 'Marina', 'Raffles', 'Orchard', 'Temasek', 'Changi', 'Apex', 'Matrix', 'Nexus', 'Pinnacle', 'Vantage', 'Core', 'Link', 'Sovereign', 'Gateway', 'Orient', 'Pacifica', 'Helix'],
    CA: ['Maple', 'Ontario', 'Summit', 'Glacier', 'Aurora', 'Laurentian', 'Timber', 'Frontier', 'Nova', 'Pacific', 'Link', 'Cascade', 'Tundra', 'Boreal', 'Canuck', 'Polar', 'Peak', 'Ridge'],
    AU: ['Outback', 'Southern', 'Pacific', '桉树 (Eucalyptus)', 'Coral', 'Sydney', 'Melbourne', 'Tasman', 'Apex', 'Vertex', 'Wave', 'Ridge', 'Crest', 'Horizon', 'Velocity', 'Endeavour', 'Eureka']
};

const suffixes = ['Solutions', 'Technologies', 'Labs', 'Digital', 'Consulting', 'Systems', 'Software', 'Studios', 'Hub', 'Group', 'Networks', 'Innovations', 'Advisors', 'Enterprises', 'Ventures', 'Capital', 'Global', 'Co', 'Agency', 'Media'];

const locations = [
    { city: 'San Francisco, CA', country: 'United States', code: 'US', flag: '🇺🇸' },
    { city: 'New York, NY', country: 'United States', code: 'US', flag: '🇺🇸' },
    { city: 'Chicago, IL', country: 'United States', code: 'US', flag: '🇺🇸' },
    { city: 'Austin, TX', country: 'United States', code: 'US', flag: '🇺🇸' },
    { city: 'Bangalore, Karnataka', country: 'India', code: 'IN', flag: '🇮🇳' },
    { city: 'Mumbai, Maharashtra', country: 'India', code: 'IN', flag: '🇮🇳' },
    { city: 'Delhi NCR', country: 'India', code: 'IN', flag: '🇮🇳' },
    { city: 'Hyderabad, Telangana', country: 'India', code: 'IN', flag: '🇮🇳' },
    { city: 'London', country: 'United Kingdom', code: 'UK', flag: '🇬🇧' },
    { city: 'Manchester', country: 'United Kingdom', code: 'UK', flag: '🇬🇧' },
    { city: 'Berlin', country: 'Germany', code: 'DE', flag: '🇩🇪' },
    { city: 'Munich', country: 'Germany', code: 'DE', flag: '🇩🇪' },
    { city: 'Singapore', country: 'Singapore', code: 'SG', flag: '🇸🇬' },
    { city: 'Toronto, ON', country: 'Canada', code: 'CA', flag: '🇨🇦' },
    { city: 'Vancouver, BC', country: 'Canada', code: 'CA', flag: '🇨🇦' },
    { city: 'Sydney, NSW', country: 'Australia', code: 'AU', flag: '🇦🇺' },
    { city: 'Melbourne, VIC', country: 'Australia', code: 'AU', flag: '🇦🇺' }
];

const contacts = {
    US: [
        { first: 'John', last: 'Smith' }, { first: 'Sarah', last: 'Miller' }, { first: 'David', last: 'Johnson' }, { first: 'Emily', last: 'Davis' }, { first: 'Michael', last: 'Brown' },
        { first: 'Jessica', last: 'Wilson' }, { first: 'Robert', last: 'Moore' }, { first: 'Amanda', last: 'Taylor' }, { first: 'William', last: 'Anderson' }, { first: 'Ashley', last: 'Thomas' }
    ],
    IN: [
        { first: 'Amit', last: 'Sharma' }, { first: 'Priya', last: 'Patel' }, { first: 'Rohan', last: 'Verma' }, { first: 'Anjali', last: 'Nair' }, { first: 'Deepak', last: 'Rao' },
        { first: 'Karan', last: 'Mehta' }, { first: 'Sneha', last: 'Joshi' }, { first: 'Vikram', last: 'Singh' }, { first: 'Divya', last: 'Reddy' }, { first: 'Siddharth', last: 'Gupta' }
    ],
    UK: [
        { first: 'Oliver', last: 'Smith' }, { first: 'Emma', last: 'Jones' }, { first: 'George', last: 'Taylor' }, { first: 'Amelia', last: 'Brown' }, { first: 'Harry', last: 'Williams' },
        { first: 'Isla', last: 'Wilson' }, { first: 'Jack', last: 'Davies' }, { first: 'Ava', last: 'Evans' }, { first: 'Noah', last: 'Thomas' }, { first: 'Sophia', last: 'Roberts' }
    ],
    DE: [
        { first: 'Lukas', last: 'Müller' }, { first: 'Leonie', last: 'Schmidt' }, { first: 'Jonas', last: 'Schneider' }, { first: 'Sarah', last: 'Fischer' }, { first: 'Finn', last: 'Weber' },
        { first: 'Marie', last: 'Meyer' }, { first: 'Maximilian', last: 'Wagner' }, { first: 'Sophia', last: 'Becker' }, { first: 'Paul', last: 'Schulz' }, { first: 'Emma', last: 'Hoffmann' }
    ],
    SG: [
        { first: 'Wei', last: 'Tan' }, { first: 'Mei', last: 'Lim' }, { first: 'Jun', last: 'Lee' }, { first: 'Siti', last: 'Ahmad' }, { first: 'Ravi', last: 'Kumar' },
        { first: 'John', last: 'Chen' }, { first: 'Sarah', last: 'Wong' }, { first: 'Karthik', last: 'Raman' }, { first: 'Li', last: 'Ng' }, { first: 'Diana', last: 'Teo' }
    ],
    CA: [
        { first: 'Marc', last: 'Tremblay' }, { first: 'Chloe', last: 'Roy' }, { first: 'Jean', last: 'Gagnon' }, { first: 'Sophie', last: 'Cote' }, { first: 'Ryan', last: 'MacDonald' },
        { first: 'Emily', last: 'Smith' }, { first: 'Alex', last: 'Campbell' }, { first: 'Leah', last: 'Stewart' }, { first: 'Dylan', last: 'Murray' }, { first: 'Megan', last: 'Gauthier' }
    ],
    AU: [
        { first: 'Lachlan', last: 'Smith' }, { first: 'Matilda', last: 'Jones' }, { first: 'Connor', last: 'Williams' }, { first: 'Grace', last: 'Taylor' }, { first: 'Jack', last: 'Brown' },
        { first: 'Charlotte', last: 'Wilson' }, { first: 'Liam', last: 'Martin' }, { first: 'Olivia', last: 'White' }, { first: 'Cooper', last: 'Harris' }, { first: 'Ruby', last: 'Clark' }
    ]
};

const jobTitles = [
    { title: 'Founder & CEO', level: 'C-Level' },
    { title: 'Chief Technology Officer', level: 'C-Level' },
    { title: 'Managing Director', level: 'Executive' },
    { title: 'VP of Engineering', level: 'VP' },
    { title: 'VP of Growth & Marketing', level: 'VP' },
    { title: 'Head of Sales', level: 'Director' },
    { title: 'Director of Product', level: 'Director' },
    { title: 'Owner', level: 'Executive' },
    { title: 'Chief Information Officer', level: 'C-Level' }
];

const companySizes = [
    { range: '1 - 10 employees', weight: 0.35 },
    { range: '11 - 50 employees', weight: 0.35 },
    { range: '51 - 200 employees', weight: 0.18 },
    { range: '201 - 500 employees', weight: 0.08 },
    { range: '500+ employees', weight: 0.04 }
];

const revenues = {
    '1 - 10 employees': ['$50K - $200K', '$200K - $500K'],
    '11 - 50 employees': ['$500K - $1.5M', '$1.5M - $3M'],
    '51 - 200 employees': ['$3M - $10M', '$10M - $25M'],
    '201 - 500 employees': ['$25M - $75M', '$75M - $150M'],
    '500+ employees': ['$150M - $500M', '$500M+']
};

const technologies = [
    'React', 'WordPress', 'Shopify', 'Stripe', 'HubSpot', 'Salesforce', 'Google Analytics', 
    'AWS', 'TailwindCSS', 'Webflow', 'Node.js', 'Angolia', 'Sentry', 'Mixpanel', 'Laravel'
];

const auditNotes = [
    'Website is not mobile responsive (fails Google UX checks).',
    'Missing secure SSL certificate (HTTPS shows unsafe warning).',
    'Site load speed is extremely slow (4.8 seconds).',
    'No online booking or contact lead form active.',
    'Not ranking in local search engine results.',
    'Website has missing meta description tags and header hierarchy.',
    'Social channels (Instagram/FB) inactive for over 9 months.',
    'Ad pixels (Meta/Google) not installed on website landing pages.',
    'No iOS/Android app available (relying only on web interface).',
    'Missing push-notification engagement loops.',
    'Needs UI/UX modernization on customer portal.',
    'Missing client testimonial integration.'
];

// Helper to generate realistic phone numbers
function generatePhone(countryCode) {
    const r = () => Math.floor(Math.random() * 10);
    if (countryCode === 'IN') {
        const start = ['98', '99', '97', '88', '77', '95'][Math.floor(Math.random() * 6)];
        return `+91 ${start}${r()} ${r()}${r()}${r()} ${r()}${r()}${r()}`;
    } else if (countryCode === 'US' || countryCode === 'CA') {
        return `+1 (555) 01${r()}-${r()}${r()}${r()}${r()}`;
    } else if (countryCode === 'UK') {
        return `+44 20 7946 0${r()}${r()}${r()}`;
    } else if (countryCode === 'DE') {
        return `+49 30 9018 ${r()}${r()}${r()}${r()}`;
    } else if (countryCode === 'SG') {
        return `+65 6789 ${r()}${r()}${r()}${r()}`;
    } else if (countryCode === 'AU') {
        return `+61 2 9876 ${r()}${r()}${r()}`;
    }
    return `+1 (555) 019-${r()}${r()}${r()}${r()}`;
}

// Generate leads list
const generatedLeads = [];
const usedCompanies = new Set();

console.log('Generating 5,000 realistic leads...');

for (let i = 0; i < 5100; i++) {
    // 1. Geography
    const loc = locations[Math.floor(Math.random() * locations.length)];
    
    // 4. Niche & Industry
    const nicheObj = niches[Math.floor(Math.random() * niches.length)];
    
    // 2. Company Name
    const countryPrefixes = prefixes[loc.code] || prefixes['US'];
    let prefix = countryPrefixes[Math.floor(Math.random() * countryPrefixes.length)];
    let suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    
    // Niche-specific naming overrides
    if (nicheObj.name === 'Dental') {
        const dentalWords = ['Dental Care', 'Dentistry', 'Dental Clinic', 'Smile Center', 'Family Dental', 'Dental Group'];
        suffix = dentalWords[Math.floor(Math.random() * dentalWords.length)];
    } else if (nicheObj.name === 'Jewellers') {
        const jewelryWords = ['Jewelers', 'Jewellery', 'Fine Jewelry', 'Diamonds', 'Gemstones', 'Gold Shop'];
        suffix = jewelryWords[Math.floor(Math.random() * jewelryWords.length)];
    } else if (nicheObj.name === 'Real Estate') {
        const realEstateWords = ['Realty', 'Real Estate', 'Properties', 'Homes', 'Realty Group', 'Estates'];
        suffix = realEstateWords[Math.floor(Math.random() * realEstateWords.length)];
    } else if (nicheObj.name === 'Restaurants') {
        const restWords = ['Bistro', 'Kitchen', 'Grill', 'Cafe', 'Diner', 'Steakhouse', 'Eatery', 'Restaurant'];
        suffix = restWords[Math.floor(Math.random() * restWords.length)];
    } else if (nicheObj.name === 'Power BI Dashboards') {
        const powerWords = ['BI Solutions', 'Insights', 'Data Systems', 'Analytics Group', 'Dashboards Co', 'Data Labs'];
        suffix = powerWords[Math.floor(Math.random() * powerWords.length)];
    } else if (nicheObj.name === 'Content Marketing') {
        const contentWords = ['Content Hub', 'Copywriting Studio', 'Creative Media', 'Editorial Group', 'Writing Labs', 'Content Agency'];
        suffix = contentWords[Math.floor(Math.random() * contentWords.length)];
    }
    
    let companyName = `${prefix} ${suffix}`;
    
    // De-duplicate
    let attempts = 0;
    while (usedCompanies.has(companyName.toLowerCase().trim()) && attempts < 100) {
        prefix = countryPrefixes[Math.floor(Math.random() * countryPrefixes.length)];
        if (nicheObj.name === 'Dental') {
            const dentalWords = ['Dental Care', 'Dentistry', 'Dental Clinic', 'Smile Center', 'Family Dental', 'Dental Group'];
            suffix = dentalWords[Math.floor(Math.random() * dentalWords.length)];
        } else if (nicheObj.name === 'Jewellers') {
            const jewelryWords = ['Jewelers', 'Jewellery', 'Fine Jewelry', 'Diamonds', 'Gemstones', 'Gold Shop'];
            suffix = jewelryWords[Math.floor(Math.random() * jewelryWords.length)];
        } else if (nicheObj.name === 'Real Estate') {
            const realEstateWords = ['Realty', 'Real Estate', 'Properties', 'Homes', 'Realty Group', 'Estates'];
            suffix = realEstateWords[Math.floor(Math.random() * realEstateWords.length)];
        } else if (nicheObj.name === 'Restaurants') {
            const restWords = ['Bistro', 'Kitchen', 'Grill', 'Cafe', 'Diner', 'Steakhouse', 'Eatery', 'Restaurant'];
            suffix = restWords[Math.floor(Math.random() * restWords.length)];
        } else if (nicheObj.name === 'Power BI Dashboards') {
            const powerWords = ['BI Solutions', 'Insights', 'Data Systems', 'Analytics Group', 'Dashboards Co', 'Data Labs'];
            suffix = powerWords[Math.floor(Math.random() * powerWords.length)];
        } else if (nicheObj.name === 'Content Marketing') {
            const contentWords = ['Content Hub', 'Copywriting Studio', 'Creative Media', 'Editorial Group', 'Writing Labs', 'Content Agency'];
            suffix = contentWords[Math.floor(Math.random() * contentWords.length)];
        } else {
            suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        }
        
        companyName = `${prefix} ${suffix}`;
        if (attempts > 10) {
            companyName = `${prefix} ${loc.city.split(',')[0]} ${suffix}`;
        }
        attempts++;
    }
    usedCompanies.add(companyName.toLowerCase().trim());
    
    // 3. Domain & Email
    const cleanName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let ext = '.com';
    if (loc.code === 'IN') ext = Math.random() < 0.6 ? '.in' : '.com';
    else if (loc.code === 'UK') ext = Math.random() < 0.6 ? '.co.uk' : '.uk';
    else if (loc.code === 'DE') ext = '.de';
    else if (loc.code === 'SG') ext = '.com.sg';
    else if (loc.code === 'CA') ext = '.ca';
    else if (loc.code === 'AU') ext = '.com.au';
    
    const domain = `www.${cleanName}${ext}`;
    
    // 5. Contact Name & Title
    const locContacts = contacts[loc.code] || contacts['US'];
    const contact = locContacts[Math.floor(Math.random() * locContacts.length)];
    const contactName = `${contact.first} ${contact.last}`;
    const titleObj = jobTitles[Math.floor(Math.random() * jobTitles.length)];
    
    // Email patterns
    const emailPatterns = [
        `${contact.first.toLowerCase()}@${cleanName}${ext}`,
        `${contact.first.toLowerCase()}.${contact.last.toLowerCase()}@${cleanName}${ext}`,
        `${contact.first.toLowerCase().charAt(0)}${contact.last.toLowerCase()}@${cleanName}${ext}`
    ];
    const email = emailPatterns[Math.floor(Math.random() * emailPatterns.length)];
    
    // 6. Company Size & Revenue
    // Choose size based on weight
    const sizeRoll = Math.random();
    let sizeObj = companySizes[0];
    let accum = 0;
    for (const size of companySizes) {
        accum += size.weight;
        if (sizeRoll <= accum) {
            sizeObj = size;
            break;
        }
    }
    const sizeStr = sizeObj.range;
    const revOptions = revenues[sizeStr];
    const revenue = revOptions[Math.floor(Math.random() * revOptions.length)];
    
    // 7. Tech Stack (1 to 4 technologies)
    const techCount = Math.floor(Math.random() * 3) + 1;
    const techsUsed = [];
    const techCopy = [...technologies];
    for (let j = 0; j < techCount; j++) {
        const idx = Math.floor(Math.random() * techCopy.length);
        techsUsed.push(techCopy.splice(idx, 1)[0]);
    }
    
    // 8. Confidence Score & Verification
    const confidence = Math.floor(Math.random() * 30) + 70; // 70% to 99%
    const isVerified = confidence > 82;
    
    // 9. Audit Opportunity
    const auditNote = auditNotes[Math.floor(Math.random() * auditNotes.length)];
    
    // 10. Detailed Diagnostics Audit Report
    const mobilePassed = !auditNote.includes('mobile') && !auditNote.includes('responsive');
    const sslPassed = !auditNote.includes('SSL') && !auditNote.includes('certificate');
    const speedPassed = !auditNote.includes('speed') && !auditNote.includes('slow');
    const formsPassed = !auditNote.includes('booking') && !auditNote.includes('form');
    const seoPassed = !auditNote.includes('ranking') && !auditNote.includes('meta');
    const socialPassed = !auditNote.includes('Social') && !auditNote.includes('profiles');
    
    const auditReport = {
        mobile: {
            status: mobilePassed ? 'passed' : 'failed',
            note: mobilePassed ? 'Responsive viewport layout active.' : 'Layout overflow detected on viewport widths < 480px.'
        },
        security: {
            status: sslPassed ? 'passed' : 'failed',
            note: sslPassed ? 'SSL certificate validated.' : 'SSL missing. Redirects to non-secure HTTP.'
        },
        speed: {
            status: speedPassed ? 'passed' : 'failed',
            note: speedPassed ? 'SpeedIndex: 1.4s (Good).' : 'SpeedIndex: 4.8s. Uncompressed media assets found.'
        },
        forms: {
            status: formsPassed ? 'passed' : 'failed',
            note: formsPassed ? 'Lead-capture gateways verified.' : 'No submission triggers or booking forms active.'
        },
        seo: {
            status: seoPassed ? 'passed' : 'failed',
            note: seoPassed ? 'H1 tags & Meta properties configured.' : 'Missing Meta descriptions and SEO hierarchy.'
        },
        social: {
            status: socialPassed ? 'passed' : 'failed',
            note: socialPassed ? 'Social profile integrations active.' : 'Broken references or inactive social profiles.'
        }
    };
    
    generatedLeads.push({
        id: `lead_${i + 1}`,
        companyName: companyName,
        domain: domain,
        niche: nicheObj.name,
        category: nicheObj.category,
        location: loc.city + ', ' + loc.country,
        locationFlag: loc.flag,
        countryCode: loc.code,
        contactName: contactName,
        contactFirstName: contact.first,
        contactLastName: contact.last,
        contactRole: titleObj.title,
        jobLevel: titleObj.level,
        email: email,
        phone: generatePhone(loc.code),
        companySize: sizeStr,
        revenue: revenue,
        technologies: techsUsed,
        confidenceScore: confidence,
        isVerified: isVerified,
        auditNote: auditNote,
        auditReport: auditReport,
        isPitched: false,
        timestamp: new Date().toISOString()
    });
}

// Write file
const outputPath = path.join(__dirname, 'leads_db.json');
fs.writeFileSync(outputPath, JSON.stringify(generatedLeads, null, 2), 'utf8');

console.log(`Successfully generated and saved ${generatedLeads.length} leads to ${outputPath}!`);
