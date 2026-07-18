async function runSimulation() {
    console.log('=== REVIEW QUEUE INTEGRATION SIMULATION ===\n');

    // 1. Submit a suspicious lead (unreachable website, disposable email, dummy phone)
    const suspiciousLead = {
        companyName: 'Suspicious Tech Labs',
        niche: 'Web Design',
        email: 'attacker@yopmail.com', // Disposable email domain
        phone: '123-456', // Too short/invalid phone
        website: 'http://non-existent-domain-xyz.com', // Unreachable
        address: 'Dummy St',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India'
    };

    console.log('Step 1: POSTing suspicious lead to /api/leads...');
    const postRes = await fetch('http://localhost:3000/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(suspiciousLead)
    });

    if (!postRes.ok) {
        throw new Error(`POST /api/leads failed: ${postRes.status} ${await postRes.text()}`);
    }

    const postData = await postRes.json();
    console.log(`- Response Status: ${postData.status}`);
    console.log(`- Target Queue Route Message: "${postData.message}"`);
    console.log(`- Assigned Confidence Score: ${postData.lead.confidenceScore}%`);

    if (postData.status !== 'Needs Review') {
        throw new Error(`Expected status to be "Needs Review" but got "${postData.status}"`);
    }
    console.log('✓ Step 1 Successful (Intercepted by Validation Heuristics!)\n');

    // 2. Fetch Review Queue
    console.log('Step 2: GETting review queue from /api/leads/review...');
    const queueRes = await fetch('http://localhost:3000/api/leads/review');
    if (!queueRes.ok) {
        throw new Error(`GET /api/leads/review failed: ${queueRes.status}`);
    }

    const queue = await queueRes.json();
    console.log(`- Items in Review Queue: ${queue.length}`);
    const found = queue.find(l => l.companyName === 'Suspicious Tech Labs');
    if (!found) {
        throw new Error('Suspicious Tech Labs not found in review queue.');
    }
    console.log(`- Found lead inside review queue with warnings:`, found.warnings);
    console.log('✓ Step 2 Successful (Item present in Queue!)\n');

    // 3. Approve lead from Review Queue
    console.log(`Step 3: Approving lead id "${found.id}" via /api/leads/review/:id/approve...`);
    const approveRes = await fetch(`http://localhost:3000/api/leads/review/${found.id}/approve`, {
        method: 'POST'
    });

    if (!approveRes.ok) {
        throw new Error(`Approve request failed: ${approveRes.status}`);
    }

    const approveData = await approveRes.json();
    console.log(`- Approved Lead Status: ${approveData.lead.status}`);
    console.log(`- Approved Lead Confidence Score: ${approveData.lead.confidenceScore}%`);

    // Verify queue is empty
    const queueCheckRes = await fetch('http://localhost:3000/api/leads/review');
    const queueCheck = await queueCheckRes.json();
    console.log(`- Items in Review Queue after approval: ${queueCheck.length}`);
    
    if (queueCheck.length === 0) {
        console.log('✓ Step 3 Successful (Moved to active pool!)\n');
    } else {
        throw new Error('Review queue still contains approved item.');
    }

    console.log('=== SIMULATION COMPLETED SUCCESSFULLY ===');
}

runSimulation().catch(e => {
    console.error('Simulation Failed:', e.message);
    process.exit(1);
});
