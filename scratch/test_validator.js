const {
    jaroWinklerDistance,
    detectDuplicates,
    verifyEmail,
    verifyWebsite,
    verifyPhone,
    verifyAddress,
    runValidationPipeline
} = require('../api/validator');

async function runTests() {
    console.log('=== STARTING VALIDATION ENGINE TESTS ===\n');

    // Test 1: Fuzzy Similarity Matches
    console.log('Test 1: Jaro-Winkler Fuzzy Matching');
    const sim1 = jaroWinklerDistance('ABC Industries', 'ABC Industry Pvt Ltd');
    const sim2 = jaroWinklerDistance('Google Inc', 'Pizza Hut');
    console.log(`- "ABC Industries" vs "ABC Industry Pvt Ltd" Similarity: ${Math.round(sim1 * 100)}% (Expected: > 80%)`);
    console.log(`- "Google Inc" vs "Pizza Hut" Similarity: ${Math.round(sim2 * 100)}% (Expected: < 50%)`);
    if (sim1 > 0.8 && sim2 < 0.5) {
        console.log('✓ Test 1 Passed\n');
    } else {
        throw new Error('Test 1 Failed');
    }

    // Test 2: Email Verification
    console.log('Test 2: Email Syntax & Domain Checking');
    const emailOk = await verifyEmail('contact@google.com');
    const emailBad = await verifyEmail('not-an-email');
    const emailDisp = await verifyEmail('fakeuser@mailinator.com');
    console.log(`- contact@google.com: Valid? ${emailOk.valid}, Score: ${emailOk.score}%`);
    console.log(`- not-an-email: Valid? ${emailBad.valid}, Score: ${emailBad.score}%`);
    console.log(`- fakeuser@mailinator.com (Disposable): Valid? ${emailDisp.valid}, Score: ${emailDisp.score}%`);
    if (emailOk.valid && !emailBad.valid && !emailDisp.valid) {
        console.log('✓ Test 2 Passed\n');
    } else {
        throw new Error('Test 2 Failed');
    }

    // Test 3: Website Reachability Checker
    console.log('Test 3: Website Syntax & Reachability Checking');
    const webOk = await verifyWebsite('https://www.google.com');
    const webBad = await verifyWebsite('not-a-valid-domain-format');
    console.log(`- https://www.google.com: Valid? ${webOk.valid}, Score: ${webOk.score}%`);
    console.log(`- not-a-valid-domain: Valid? ${webBad.valid}, Score: ${webBad.score}%`);
    if (webOk.valid && !webBad.valid) {
        console.log('✓ Test 3 Passed\n');
    } else {
        throw new Error('Test 3 Failed');
    }

    // Test 4: Phone Verification Checks
    console.log('Test 4: Phone Country Prefix and Length Checks');
    const phoneOk = verifyPhone('+919876543210');
    const phoneFake = verifyPhone('555-0199');
    const phoneShort = verifyPhone('1234');
    console.log(`- +919876543210: Valid? ${phoneOk.valid}, Score: ${phoneOk.score}%`);
    console.log(`- 555-0199 (Placeholder): Valid? ${phoneFake.valid}, Score: ${phoneFake.score}%`);
    console.log(`- 1234 (Too short): Valid? ${phoneShort.valid}, Score: ${phoneShort.score}%`);
    if (phoneOk.valid && !phoneFake.valid && !phoneShort.valid) {
        console.log('✓ Test 4 Passed\n');
    } else {
        throw new Error('Test 4 Failed');
    }

    // Test 5: Full Pipeline Integration Execution
    console.log('Test 5: Validation Pipeline Heuristics');
    const mockExisting = [
        { id: '1', companyName: 'Delta Systems', city: 'Surat', phone: '+919999999999', email: 'test@delta.com' }
    ];
    
    // Good Lead
    const goodLead = {
        companyName: 'Gamma Corp',
        niche: 'Web Development',
        email: 'hello@github.com',
        phone: '+14155552671',
        website: 'https://github.com',
        address: '123 Tech Way',
        city: 'San Francisco',
        state: 'CA',
        country: 'United States'
    };
    
    // Duplicate Lead
    const dupLead = {
        companyName: 'Delta Systems Pvt Ltd',
        niche: 'Consulting',
        email: 'hello@delta.com',
        phone: '+919999999999',
        website: 'https://delta.com',
        address: 'Katargam',
        city: 'Surat',
        state: 'Gujarat',
        country: 'India'
    };
    
    const resGood = await runValidationPipeline(goodLead, mockExisting);
    const resDup = await runValidationPipeline(dupLead, mockExisting);
    
    console.log(`- Good Lead Status: ${resGood.status}, Score: ${resGood.confidenceScore}%`);
    console.log(`- Duplicate Lead Status: ${resDup.status}, Score: ${resDup.confidenceScore}%, Warnings:`, resDup.warnings);
    
    if (resGood.status === 'Verified' && resDup.status === 'Needs Review') {
        console.log('✓ Test 5 Passed\n');
    } else {
        throw new Error('Test 5 Failed');
    }

    console.log('=== ALL TESTS COMPLETED SUCCESSFULLY ===');
}

runTests().catch(err => {
    console.error('Test Suite Failed:', err.message);
    process.exit(1);
});
