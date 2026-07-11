// ClientRadar AI - Lead Discovery & Outreach Orchestrator Logic

// Global Application State
let state = {
    currentView: 'leads', // 'leads', 'campaigns', 'emails', 'analytics', 'settings'
    leads: [],
    totalLeads: 0,
    selectedLeadIds: new Set(),
    currentPage: 1,
    pageSize: 15,
    campaigns: [],
    connections: [],
    activeConnection: null,
    emails: [],
    stats: { total: 0, openRate: 0, clickRate: 0, replyRate: 0, bounceRate: 0 },
    mapsLeads: [],
    
    // Active filters
    filters: {
        niche: '',
        location: 'all',
        companySize: [],
        jobTitle: '',
        technologies: [],
        minConfidence: 0,
        region: 'all' // 'all', 'india', 'foreign'
    },
    
    mapsFilters: {
        category: '',
        location: '',
        websiteStatus: 'all'
    },
    liveCurrentPage: 1,
    livePageSize: 10,
    mapsCurrentPage: 1,
    mapsPageSize: 10
};

// ----------------------------------------------------
// Life-cycle initializations
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialise Lucide icons
    safeCreateIcons();
    
    // 2. Load settings and data from Server
    syncDataFromServer().then(() => {
        // Run initial live freelance search
        performLiveSearch();
    });
    
    // 3. Bind Event Listeners
    setupEventListeners();
    
    // 4. Start IMAP reply-check polling (every 60 seconds)
    setInterval(pollRepliesSync, 60000);
});

// Helper for Lucide icons rendering safely
function safeCreateIcons() {
    if (typeof lucide !== 'undefined' && lucide && typeof lucide.createIcons === 'function') {
        try {
            lucide.createIcons();
        } catch (e) {
            console.error('Error creating icons:', e);
        }
    }
}

// ----------------------------------------------------
// Server Synchronization API Calls
// ----------------------------------------------------
async function syncDataFromServer() {
    try {
        // Fetch SMTP Connections
        const smtpRes = await fetch('/api/settings/smtp');
        if (smtpRes.ok) {
            state.connections = await smtpRes.json();
            state.activeConnection = state.connections.find(c => c.active) || null;
            updateConnectionBanner();
            renderMailboxes();
        }
        
        // Fetch Campaigns
        const campRes = await fetch('/api/campaigns');
        if (campRes.ok) {
            state.campaigns = await campRes.json();
            renderCampaigns();
            updateCampaignSelects();
        }
        
        // Fetch Emails Logs
        const emailRes = await fetch('/api/emails/sent');
        if (emailRes.ok) {
            state.emails = await emailRes.json();
            renderSentEmails();
            updateEmailsBadge();
        }
        
        // Fetch Analytics Stats
        const statsRes = await fetch('/api/emails/stats');
        if (statsRes.ok) {
            state.stats = await statsRes.json();
            renderAnalytics();
        }
    } catch (e) {
        console.error('Failed to sync server state:', e);
        showToast('Error syncing with server database.', 'error');
    }
}

// Fetch filtered leads from server
async function fetchLeads() {
    // Show table loader
    renderLeadsTableSkeleton();
    
    // Construct query parameters
    const params = new URLSearchParams();
    if (state.filters.niche) params.append('niche', state.filters.niche);
    if (state.filters.location && state.filters.location !== 'all') params.append('location', state.filters.location);
    if (state.filters.jobTitle) params.append('jobTitle', state.filters.jobTitle);
    if (state.filters.minConfidence) params.append('minConfidence', state.filters.minConfidence);
    if (state.filters.region) params.append('region', state.filters.region);
    
    // Multi-select arrays
    state.filters.companySize.forEach(s => params.append('companySize', s));
    state.filters.technologies.forEach(t => params.append('technology', t));
    
    // Pagination parameters
    const offset = (state.currentPage - 1) * state.pageSize;
    params.append('limit', state.pageSize);
    params.append('offset', offset);
    
    try {
        const res = await fetch(`/api/leads?${params.toString()}`);
        if (res.ok) {
            const data = await res.json();
            state.leads = data.leads;
            state.totalLeads = data.total;
            
            // Update country tab badges
            if (data.counts) {
                const badgeAll = document.getElementById('badge-all-count');
                const badgeIndia = document.getElementById('badge-india-count');
                const badgeForeign = document.getElementById('badge-foreign-count');
                if (badgeAll) badgeAll.textContent = data.counts.all.toLocaleString();
                if (badgeIndia) badgeIndia.textContent = data.counts.india.toLocaleString();
                if (badgeForeign) badgeForeign.textContent = data.counts.foreign.toLocaleString();
            }
            
            renderLeadsTable();
        } else {
            showToast('Failed to load leads from database.', 'error');
        }
    } catch (e) {
        console.error('Fetch leads failed:', e);
        showToast('Server search failed.', 'error');
    }
}

// Poll for email replies/bounces periodically
async function pollRepliesSync() {
    try {
        const res = await fetch('/api/sync/replies', { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            if (data.updatedCount > 0) {
                console.log(`[SYNC] Updated ${data.updatedCount} email responses.`);
                state.emails = data.logs;
                renderSentEmails();
                // Refresh analytics stats
                const statsRes = await fetch('/api/emails/stats');
                if (statsRes.ok) {
                    state.stats = await statsRes.json();
                    renderAnalytics();
                }
                showToast(`Synced ${data.updatedCount} new email responses!`);
            }
        }
    } catch (e) {
        console.error('Replies check sync failed:', e);
    }
}

// ----------------------------------------------------
// UI Renderers
// ----------------------------------------------------

// Render Banner Status on bottom left
function updateConnectionBanner() {
    const banner = document.getElementById('active-connection-banner');
    if (!banner) return;
    
    if (state.activeConnection) {
        banner.className = 'sidebar-connection-status connected';
        banner.querySelector('.status-text').textContent = `Connected: ${state.activeConnection.senderEmail}`;
    } else {
        banner.className = 'sidebar-connection-status';
        banner.querySelector('.status-text').textContent = 'No Sender Active';
    }
}

// Render Leads Table row items
function renderLeadsTable() {
    const tbody = document.getElementById('leads-table-tbody');
    const selectAllCheck = document.getElementById('leads-select-all');
    if (!tbody) return;
    
    // Reset check state
    if (selectAllCheck) selectAllCheck.checked = false;
    
    if (state.leads.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-state">
                <td colspan="8">
                    <div class="empty-message">
                        <i data-lucide="alert-circle"></i>
                        <h3>No prospects match your criteria</h3>
                        <p>Try clearing some search filters or enter a broader niche search.</p>
                    </div>
                </td>
            </tr>
        `;
        safeCreateIcons();
        updatePaginationFooter(0);
        return;
    }
    
    tbody.innerHTML = '';
    state.leads.forEach(lead => {
        const tr = document.createElement('tr');
        
        // Check if selected
        const isChecked = state.selectedLeadIds.has(lead.id) ? 'checked' : '';
        
        // Tech pills
        const techList = lead.technologies.slice(0, 3).map(t => `<span class="tech-pill">${t}</span>`).join(' ');
        
        // Confidence bar class
        const barClass = lead.confidenceScore < 83 ? 'warning' : '';
        
        // Geotag flag
        const geoTag = `${lead.locationFlag || '📍'} ${lead.location}`;
        
        // Pitch action button
        const pitchBtn = lead.isPitched ? 
            `<button class="btn btn-secondary btn-sm lead-pitch-btn" data-id="${lead.id}" style="color: var(--success); border-color: var(--success); background: rgba(16, 185, 129, 0.02);">
                <i data-lucide="check-circle" style="color: var(--success); width: 14px; height: 14px;"></i>
                <span>Pitched</span>
            </button>` :
            `<button class="btn btn-primary btn-sm lead-pitch-btn" data-id="${lead.id}">
                <i data-lucide="sparkles" style="width: 14px; height: 14px;"></i>
                <span>Pitch</span>
            </button>`;

        tr.innerHTML = `
            <td class="checkbox-col">
                <input type="checkbox" class="lead-row-select" data-id="${lead.id}" ${isChecked}>
            </td>
            <td data-label="Prospect">
                <span class="prospect-name">${lead.contactName}</span>
                <span class="prospect-sub">${lead.contactRole}</span>
            </td>
            <td data-label="Niche">
                <span class="tag ${lead.countryCode === 'IN' ? 'emerald' : 'indigo'}">${lead.niche}</span>
            </td>
            <td data-label="Company">
                <span class="prospect-name">${lead.companyName}</span>
                <span class="prospect-sub">${geoTag}</span>
            </td>
            <td class="email-cell" data-label="Contact">
                <div style="font-weight: 500; margin-bottom: 2px;">${lead.email}</div>
                <div style="font-size: 11.5px; color: var(--color-text-dim); font-family: var(--font-mono);">${lead.phone}</div>
            </td>
            <td data-label="Tech Tools">
                <div class="tech-pills">${techList}</div>
            </td>
            <td data-label="Confidence">
                <div style="font-weight: 600; font-family: var(--font-mono); font-size: 12px; display: flex; align-items: center; justify-content: space-between; width: 70px;">
                    <span>${lead.confidenceScore}%</span>
                    ${lead.isVerified ? 
                        `<i data-lucide="check-check" style="width: 12px; height: 12px; color: var(--success);"></i>` :
                        `<i data-lucide="alert-circle" style="width: 12px; height: 12px; color: var(--warning);"></i>`
                    }
                </div>
                <div class="confidence-bar-container">
                    <div class="confidence-bar ${barClass}" style="width: ${lead.confidenceScore}%;"></div>
                </div>
            </td>
            <td class="action-col">
                ${pitchBtn}
            </td>
        `;
        
        // Single row click listeners to view details (excluding clicking the check or button)
        tr.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && !e.target.closest('button')) {
                openLeadDetailsModal(lead);
            }
        });
        
        tbody.appendChild(tr);
    });
    
    // Bind click listener specifically to pitch buttons
    document.querySelectorAll('.lead-pitch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('button').dataset.id;
            const lead = state.leads.find(l => l.id === id);
            if (lead) openLeadDetailsModal(lead);
        });
    });
    
    // Bind checkboxes listeners
    document.querySelectorAll('.lead-row-select').forEach(check => {
        check.addEventListener('change', (e) => {
            const id = e.target.dataset.id;
            if (e.target.checked) {
                state.selectedLeadIds.add(id);
            } else {
                state.selectedLeadIds.delete(id);
            }
            updateCheckedCount();
        });
    });
    
    safeCreateIcons();
    updatePaginationFooter(state.totalLeads);
}

// Update Selected lead indicators and action buttons state
function updateCheckedCount() {
    const count = state.selectedLeadIds.size;
    const countEl = document.getElementById('selected-leads-count');
    const bulkEnrollBtn = document.getElementById('bulk-enroll-btn');
    const oneClickBtn = document.getElementById('one-click-bulk-pitch-btn');
    
    if (countEl) countEl.textContent = `${count} selected`;
    
    if (bulkEnrollBtn) {
        bulkEnrollBtn.disabled = count === 0;
        bulkEnrollBtn.innerHTML = `<i data-lucide="plus-circle"></i> <span>Add to Campaign (${count})</span>`;
    }
    if (oneClickBtn) {
        oneClickBtn.disabled = count === 0;
        oneClickBtn.innerHTML = `<i data-lucide="zap"></i> <span>One-Click Pitch (${count})</span>`;
    }
    safeCreateIcons();
}

// Update Search Pagination details
function updatePaginationFooter(total) {
    const pageInfo = document.getElementById('leads-page-info');
    const prevBtn = document.getElementById('leads-prev-btn');
    const nextBtn = document.getElementById('leads-next-btn');
    if (!pageInfo) return;
    
    const start = total === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
    const end = Math.min(state.currentPage * state.pageSize, total);
    
    pageInfo.textContent = `Showing ${start} - ${end} of ${total} prospects`;
    
    if (prevBtn) prevBtn.disabled = state.currentPage === 1;
    if (nextBtn) nextBtn.disabled = state.currentPage * state.pageSize >= total;
}

// Render Campaigns list items
function renderCampaigns() {
    const container = document.getElementById('campaigns-list-container');
    if (!container) return;
    
    if (state.campaigns.length === 0) {
        container.innerHTML = `
            <div class="empty-message small">
                <i data-lucide="info"></i>
                <p>No active campaigns created yet. Click "Create Campaign" above to draft a new sequence.</p>
            </div>
        `;
        safeCreateIcons();
        return;
    }
    
    container.innerHTML = '';
    state.campaigns.forEach(camp => {
        const item = document.createElement('div');
        item.className = 'campaign-item';
        item.innerHTML = `
            <div class="campaign-item-info">
                <h4>${camp.name}</h4>
                <p>Subject: "${camp.subject}" | Enrolled: <strong>${camp.enrolledCount} prospects</strong></p>
            </div>
            <div class="campaign-item-actions">
                <button class="btn btn-secondary btn-sm camp-edit-btn" data-id="${camp.id}"><i data-lucide="edit-2"></i></button>
                <button class="btn btn-outline btn-sm camp-delete-btn" data-id="${camp.id}" style="border-color: var(--error); color: var(--error);"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        
        item.querySelector('.camp-delete-btn').addEventListener('click', () => deleteCampaign(camp.id));
        item.querySelector('.camp-edit-btn').addEventListener('click', () => {
            document.getElementById('campaign-name').value = camp.name;
            document.getElementById('campaign-subject').value = camp.subject;
            document.getElementById('campaign-body').value = camp.body;
            document.getElementById('campaign-editor-title').textContent = 'Edit Campaign Sequence';
            document.getElementById('campaign-editor-panel').style.display = 'flex';
        });
        
        container.appendChild(item);
    });
    
    safeCreateIcons();
}

// Populate dropdown selection inside enroll modal
function updateCampaignSelects() {
    const select = document.getElementById('enroll-campaign-select');
    if (!select) return;
    
    select.innerHTML = state.campaigns.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (state.campaigns.length === 0) {
        select.innerHTML = '<option value="">(No campaigns configured)</option>';
    }
}

// Render Settings mailboxes list
function renderMailboxes() {
    const list = document.getElementById('mailboxes-list');
    if (!list) return;
    
    if (state.connections.length === 0) {
        list.innerHTML = `
            <div class="empty-state small">
                <i data-lucide="link-2-off"></i>
                <h3>No Senders Connected</h3>
                <p>You must connect at least one active sender identity to begin dispatching real B2B campaigns.</p>
            </div>
        `;
        safeCreateIcons();
        return;
    }
    
    list.innerHTML = '';
    state.connections.forEach(conn => {
        const item = document.createElement('div');
        item.className = conn.active ? 'mailbox-item active' : 'mailbox-item';
        
        let subText = 'Custom SMTP';
        if (conn.type === 'gmail_app_pass') subText = 'Gmail SMTP (App Password)';
        else if (conn.type === 'gmail_oauth') subText = 'Gmail SMTP (OAuth 2.0)';
        
        const isChecked = conn.active ? 'checked' : '';
        
        item.innerHTML = `
            <div class="mailbox-meta">
                <h4>${conn.senderName}</h4>
                <p>
                    <span>${conn.senderEmail}</span>
                    <span class="connection-type-badge">${subText}</span>
                </p>
            </div>
            <div class="mailbox-actions">
                <label class="switch">
                    <input type="checkbox" class="toggle-mailbox-status" data-id="${conn.id}" ${isChecked}>
                    <span class="slider"></span>
                </label>
                <button class="btn btn-outline btn-sm delete-mailbox-btn" data-id="${conn.id}" style="border-color: var(--error); color: var(--error); padding: 4px 8px;">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        `;
        
        // Delete connection click
        item.querySelector('.delete-mailbox-btn').addEventListener('click', () => deleteMailbox(conn.id));
        
        // Activate connection check
        item.querySelector('.toggle-mailbox-status').addEventListener('change', (e) => {
            if (e.target.checked) {
                activateMailbox(conn.id);
            } else {
                // Prevent turning off the only connection
                e.target.checked = true;
            }
        });
        
        list.appendChild(item);
    });
    
    safeCreateIcons();
}

// Render Sent Emails Log
function renderSentEmails(filterStatus = 'all') {
    const tbody = document.getElementById('sent-emails-tbody');
    if (!tbody) return;
    
    const filtered = state.emails.filter(e => filterStatus === 'all' || e.status === filterStatus);
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-state">
                <td colspan="7">
                    <div class="empty-message">
                        <i data-lucide="mail"></i>
                        <h3>No Matching Emails Found</h3>
                        <p>No emails correspond to your current selection status.</p>
                    </div>
                </td>
            </tr>
        `;
        safeCreateIcons();
        return;
    }
    
    tbody.innerHTML = '';
    // Display in reverse chronological order
    const sorted = [...filtered].sort((a,b) => new Date(b.sentAt) - new Date(a.sentAt));
    
    sorted.forEach(email => {
        const tr = document.createElement('tr');
        
        // Format date
        const date = new Date(email.sentAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        
        // Find campaign name if any
        const campaign = state.campaigns.find(c => c.id === email.campaignId);
        const campaignName = campaign ? campaign.name : '<span style="color:var(--color-text-dim);">Direct Pitch</span>';
        
        const statusClass = email.status.toLowerCase();
        
        tr.innerHTML = `
            <td style="font-family: var(--font-mono); font-size:12px; color: var(--color-text-dim);">${date}</td>
            <td><strong>${email.to}</strong></td>
            <td>${email.subject}</td>
            <td style="color: var(--color-text-muted); font-size:12.5px;">${email.senderEmail}</td>
            <td>${campaignName}</td>
            <td>
                <span class="status-pill ${statusClass}">
                    <span class="status-dot"></span>
                    <span>${email.status}</span>
                </span>
            </td>
            <td class="action-col">
                <button class="btn btn-secondary btn-sm view-history-btn" data-id="${email.id}" style="padding: 4px 8px;">
                    <i data-lucide="history" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        `;
        
        tr.querySelector('.view-history-btn').addEventListener('click', () => openHistoryModal(email));
        
        tbody.appendChild(tr);
    });
    
    safeCreateIcons();
}

// Update Badge count on sidebar
function updateEmailsBadge() {
    const badge = document.getElementById('sent-badge');
    if (badge) badge.textContent = state.emails.length;
}

// Render Analytics Viewfunnel progress bars
function renderAnalytics() {
    document.getElementById('analytics-total').textContent = state.stats.total;
    document.getElementById('analytics-open-rate').textContent = `${state.stats.openRate}%`;
    document.getElementById('analytics-click-rate').textContent = `${state.stats.clickRate}%`;
    document.getElementById('analytics-reply-rate').textContent = `${state.stats.replyRate}%`;
    document.getElementById('analytics-bounce-rate').textContent = `${state.stats.bounceRate}%`;
    
    // Funnel stats calculations
    const total = state.stats.total;
    
    // Calculate widths (Funnel decreases downwards)
    const openedWidth = total > 0 ? state.stats.openRate : 0;
    const clickedWidth = total > 0 ? state.stats.clickRate : 0;
    const repliedWidth = total > 0 ? state.stats.replyRate : 0;
    
    // Sent val
    document.getElementById('funnel-sent-val').textContent = total;
    
    // Opened
    const openedVal = Math.round(total * (state.stats.openRate / 100));
    document.getElementById('funnel-opened-val').textContent = openedVal;
    document.getElementById('funnel-opened-bar').style.width = `${openedWidth}%`;
    document.getElementById('funnel-opened-bar').querySelector('.funnel-label').textContent = `Opened (${state.stats.openRate}%)`;
    
    // Clicked
    const clickedVal = Math.round(total * (state.stats.clickRate / 100));
    document.getElementById('funnel-clicked-val').textContent = clickedVal;
    document.getElementById('funnel-clicked-bar').style.width = `${clickedWidth}%`;
    document.getElementById('funnel-clicked-bar').querySelector('.funnel-label').textContent = `Clicked (${state.stats.clickRate}%)`;
    
    // Replied
    const repliedVal = Math.round(total * (state.stats.replyRate / 100));
    document.getElementById('funnel-replied-val').textContent = repliedVal;
    document.getElementById('funnel-replied-bar').style.width = `${repliedWidth}%`;
    document.getElementById('funnel-replied-bar').querySelector('.funnel-label').textContent = `Replied (${state.stats.replyRate}%)`;
}

// ----------------------------------------------------
// Modals Functions
// ----------------------------------------------------

// Lead details and pitch modal composer
function openLeadDetailsModal(lead) {
    state.selectedLead = lead;
    
    // Initials
    const initials = lead.companyName.split(' ').map(n => n.charAt(0)).join('').substring(0, 2).toUpperCase();
    document.getElementById('modal-company-logo').textContent = initials;
    document.getElementById('modal-company-name').textContent = lead.companyName;
    document.getElementById('modal-company-niche').textContent = `${lead.niche}`;
    document.getElementById('modal-company-location').textContent = `${lead.location} ${lead.locationFlag || ''}`;
    
    document.getElementById('modal-full-address').textContent = lead.address || lead.location || 'N/A';
    document.getElementById('modal-city-state-zip').textContent = lead.city && lead.state && lead.pinCode ? `${lead.city}, ${lead.state} ${lead.pinCode}` : (lead.city || 'N/A');
    document.getElementById('modal-country').textContent = lead.country || 'N/A';
    
    const mapsLink = document.getElementById('modal-maps-link');
    if (mapsLink) {
        if (lead.googleMapsUrl) {
            mapsLink.href = lead.googleMapsUrl;
            mapsLink.style.display = 'inline-flex';
        } else {
            mapsLink.style.display = 'none';
        }
    }
    
    const web = document.getElementById('modal-website');
    web.textContent = lead.domain || 'None';
    web.href = lead.domain ? (lead.domain.startsWith('http') ? lead.domain : `https://${lead.domain}`) : '#';
    
    document.getElementById('modal-size-rev').textContent = `${lead.companySize} | ${lead.revenue}`;
    
    // Technologies pills
    const techStack = document.getElementById('modal-tech-stack');
    techStack.innerHTML = lead.technologies.map(t => `<span class="tech-pill">${t}</span>`).join('');
    
    document.getElementById('modal-contact-details').textContent = `${lead.contactName} - ${lead.contactRole}`;
    document.getElementById('modal-email').textContent = lead.email;
    document.getElementById('modal-phone').textContent = lead.phone;
    
    // Opportunity Audit details
    document.getElementById('modal-audit-note').textContent = lead.auditNote;
    
    const badge = document.getElementById('modal-verification-status');
    if (badge) {
        if (lead.isVerified) {
            badge.className = 'badge-verified';
            badge.innerHTML = `<i data-lucide="check-check" style="width: 12px; height: 12px;"></i> <span>SMTP Verified</span>`;
        } else {
            badge.className = 'badge-unverified';
            badge.innerHTML = `<i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> <span>Catch-all</span>`;
        }
    }
    
    // Generate email
    document.getElementById('modal-tone-select').value = 'casual';
    generateColdEmailDraft(lead, 'casual');
    
    // Connect Send button label based on connection status
    const sendBtn = document.getElementById('modal-send-btn');
    if (sendBtn) {
        if (state.activeConnection) {
            sendBtn.innerHTML = `<i data-lucide="send"></i> <span>Send Pitch (${state.activeConnection.senderName})</span>`;
            sendBtn.classList.remove('btn-secondary');
            sendBtn.classList.add('btn-primary');
        } else {
            sendBtn.innerHTML = `<i data-lucide="mail"></i> <span>Open in Gmail (Composer)</span>`;
            sendBtn.classList.remove('btn-primary');
            sendBtn.classList.add('btn-secondary');
        }
    }
    
    // Reset view-edit modes to view mode
    const viewMode = document.getElementById('email-view-mode');
    const editMode = document.getElementById('email-edit-mode');
    if (viewMode) viewMode.style.display = 'flex';
    if (editMode) editMode.style.display = 'none';
    
    // Bind Edit trigger
    const editTrigger = document.getElementById('modal-email-edit-trigger');
    if (editTrigger) {
        const newTrigger = editTrigger.cloneNode(true);
        editTrigger.parentNode.replaceChild(newTrigger, editTrigger);
        newTrigger.addEventListener('click', () => {
            if (viewMode) viewMode.style.display = 'none';
            if (editMode) {
                editMode.style.display = 'flex';
                document.getElementById('modal-email-input').value = lead.email;
            }
        });
    }
    
    // Bind Cancel trigger
    const editCancel = document.getElementById('modal-email-cancel-btn');
    if (editCancel) {
        const newCancel = editCancel.cloneNode(true);
        editCancel.parentNode.replaceChild(newCancel, editCancel);
        newCancel.addEventListener('click', () => {
            if (viewMode) viewMode.style.display = 'flex';
            if (editMode) editMode.style.display = 'none';
        });
    }
    
    // Bind Save trigger
    const editSave = document.getElementById('modal-email-save-btn');
    if (editSave) {
        const newSave = editSave.cloneNode(true);
        editSave.parentNode.replaceChild(newSave, editSave);
        newSave.addEventListener('click', async () => {
            const newEmail = document.getElementById('modal-email-input').value.trim();
            if (!newEmail) {
                showToast('Email address cannot be empty.', 'error');
                return;
            }
            lead.email = newEmail;
            document.getElementById('modal-email').textContent = newEmail;
            const currentTone = document.getElementById('modal-tone-select').value;
            generateColdEmailDraft(lead, currentTone);
            
            if (viewMode) viewMode.style.display = 'flex';
            if (editMode) editMode.style.display = 'none';
            showToast('Email updated successfully.');
            
            if (!lead.id.startsWith('live_')) {
                try {
                    await fetch(`/api/leads/${lead.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: newEmail })
                    });
                } catch (e) {
                    console.error('Failed to save email edit to server:', e);
                }
            }
        });
    }

    document.getElementById('lead-details-modal').classList.add('active');
    safeCreateIcons();
}

// Generate email body draft dynamically
function generateColdEmailDraft(lead, tone) {
    const contactName = lead.contactFirstName;
    const company = lead.companyName;
    const niche = lead.niche.toLowerCase();
    const sender = state.activeConnection ? state.activeConnection.senderName : 'Flowebtech';
    const audit = lead.auditNote.toLowerCase();
    
    let subject = '';
    let body = '';
    
    if (tone === 'casual') {
        subject = `A quick suggestion for ${company}'s site`;
        body = `Hey ${contactName},\n\nI was browsing ${company} today and noticed a bottleneck: ${audit}\n\nWe specialize in fixing these performance and UX issues for businesses in the ${niche} sector. We recently helped a similar company resolve this and boost client conversion rates by 35%.\n\nAre you open to a quick 10-minute chat this Saturday or Sunday to see if we can optimize this for you?\n\nBest regards,\n${sender}`;
    } else if (tone === 'formal') {
        subject = `Operational Audit: Addressing optimization opportunities at ${company}`;
        body = `Dear Mr./Ms. ${lead.contactLastName},\n\nI hope this message finds you well.\n\nI am writing to you because of your role as ${lead.contactRole} at ${company}. Our consulting team recently completed a digital audit of your assets, identifying a significant opportunity:\n\n--> ${lead.auditNote}\n\nAddressing this bottleneck directly impacts client retention and brand authority. Our team specializes in solving this exact class of technological optimization issues.\n\nWould you be open to scheduling a brief introductory call to discuss how our services could align with your strategic targets for the current quarter?\n\nSincerely,\n\n${sender}`;
    } else { // value-driven
        subject = `Fixing the 20% conversion leak on ${company}'s website`;
        body = `Hi ${contactName},\n\nMost businesses in the ${niche} space face a common digital bottleneck: ${audit}\n\nThis issue typically causes businesses to lose up to 20% of their mobile traffic due to bounce rates and UX friction.\n\nWe recently implemented a custom optimization project that resolved this, resulting in:\n- 35% improvement in page load speeds\n- 40% increases in mobile contact form submissions\n- Faster client booking rates\n\nI have prepared a quick, 2-page brief detailing our fix and how it applies to ${company}. May I send it over for you to look at?\n\nBest,\n${sender}`;
    }
    
    document.getElementById('modal-email-subject').value = subject;
    document.getElementById('modal-email-body').value = body;
}

// Open tracking history modal
function openHistoryModal(email) {
    const container = document.getElementById('history-timeline');
    if (!container) return;
    
    container.innerHTML = '';
    email.history.forEach((step, idx) => {
        const date = new Date(step.timestamp).toLocaleString();
        const item = document.createElement('div');
        item.className = idx === email.history.length - 1 ? 'timeline-item active' : 'timeline-item';
        
        let desc = 'Outbound email sent from ClientRadar platform.';
        if (step.status === 'Opened') desc = 'Recipient opened the email (pixel tracking fired).';
        else if (step.status === 'Clicked') desc = 'Recipient clicked a link inside the email (redirection logged).';
        else if (step.status === 'Replied') desc = 'Received reply response inside sender inbox.';
        else if (step.status === 'Bounced') desc = 'Delivery failed. Received bounce notification from server.';
        
        item.innerHTML = `
            <h5>${step.status}</h5>
            <span style="display:block; font-size:11.5px; color: var(--color-text-muted);">${desc}</span>
            <span>${date}</span>
        `;
        container.appendChild(item);
    });
    
    document.getElementById('history-modal').classList.add('active');
}

// ----------------------------------------------------
// UI Logic Actions
// ----------------------------------------------------

// Connect SMTP App Password
async function addAppPassConnection() {
    const senderName = document.getElementById('gmail-ap-sender-name').value.trim();
    const senderEmail = document.getElementById('gmail-ap-email').value.trim();
    const appPassword = document.getElementById('gmail-ap-password').value.trim();
    
    if (!senderName || !senderEmail || !appPassword) {
        showToast('Please fill out all App Password fields.', 'error');
        return;
    }
    
    const btn = document.getElementById('save-gmail-ap-btn');
    btn.disabled = true;
    btn.textContent = 'Verifying Connection...';
    
    try {
        const res = await fetch('/api/settings/smtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'gmail_app_pass',
                senderName,
                senderEmail,
                gmailAppPassword: appPassword,
                active: true
            })
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast('Gmail App Password connected successfully!');
            document.getElementById('gmail-ap-password').value = '';
            syncDataFromServer();
        } else {
            showToast(data.error || 'Verification failed.', 'error');
        }
    } catch (e) {
        showToast('Network error verifying connection.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Verify & Connect';
    }
}

// Connect Custom SMTP Connection
async function addCustomSmtpConnection() {
    const senderName = document.getElementById('smtp-sender-name').value.trim();
    const senderEmail = document.getElementById('smtp-email').value.trim();
    const host = document.getElementById('smtp-host').value.trim();
    const port = document.getElementById('smtp-port').value.trim();
    const secure = document.getElementById('smtp-secure').value;
    const user = document.getElementById('smtp-user').value.trim();
    const pass = document.getElementById('smtp-pass').value.trim();
    
    if (!senderName || !senderEmail || !host || !port || !user || !pass) {
        showToast('Please fill out all SMTP fields.', 'error');
        return;
    }
    
    const btn = document.getElementById('save-smtp-btn');
    btn.disabled = true;
    btn.textContent = 'Verifying Connection...';
    
    try {
        const res = await fetch('/api/settings/smtp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'custom_smtp',
                senderName,
                senderEmail,
                smtpHost: host,
                smtpPort: port,
                smtpSecure: secure === 'true',
                smtpUser: user,
                smtpPass: pass,
                active: true
            })
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast('SMTP Mailbox connected successfully!');
            document.getElementById('smtp-pass').value = '';
            syncDataFromServer();
        } else {
            showToast(data.error || 'SMTP Verification failed.', 'error');
        }
    } catch (e) {
        showToast('Network error verifying connection.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Verify & Connect';
    }
}

// Gmail OAuth callback flow exchange triggers
async function connectGmailOauth() {
    const clientId = document.getElementById('gmail-oa-client-id').value.trim();
    const clientSecret = document.getElementById('gmail-oa-client-secret').value.trim();
    const email = document.getElementById('gmail-oa-email').value.trim();
    
    if (!clientId || !clientSecret || !email) {
        showToast('Please configure OAuth Client ID and secrets.', 'error');
        return;
    }
    
    const btn = document.getElementById('save-gmail-oa-btn');
    btn.disabled = true;
    btn.textContent = 'Connecting Google Auth...';
    
    try {
        const params = new URLSearchParams({ clientId, clientSecret, senderEmail: email });
        const res = await fetch(`/api/auth/google/url?${params.toString()}`);
        if (res.ok) {
            const data = await res.json();
            // Open consent screen
            window.open(data.url, '_self');
        } else {
            showToast('Failed to fetch OAuth redirect URL.', 'error');
        }
    } catch (e) {
        showToast('Error configuring Google OAuth.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Connect via Google Consent';
    }
}

// Delete connection Mailbox
async function deleteMailbox(id) {
    if (!confirm('Are you sure you want to disconnect this sender mailbox?')) return;
    try {
        const res = await fetch(`/api/settings/smtp/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Mailbox disconnected.');
            syncDataFromServer();
        } else {
            showToast('Failed to disconnect mailbox.', 'error');
        }
    } catch (e) {
        showToast('Server connection error.', 'error');
    }
}

// Activate Connection Mailbox
async function activateMailbox(id) {
    try {
        const res = await fetch('/api/settings/smtp/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        if (res.ok) {
            showToast('Transporter activated.');
            syncDataFromServer();
        } else {
            showToast('Failed to activate transporter.', 'error');
        }
    } catch (e) {
        showToast('Server connection error.', 'error');
    }
}

// Save Template sequence Campaign
async function saveCampaign() {
    const name = document.getElementById('campaign-name').value.trim();
    const subject = document.getElementById('campaign-subject').value.trim();
    const body = document.getElementById('campaign-body').value.trim();
    
    if (!name || !subject || !body) {
        showToast('Please complete campaign fields.', 'error');
        return;
    }
    
    try {
        const res = await fetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, subject, body })
        });
        if (res.ok) {
            showToast('Campaign sequence saved!');
            document.getElementById('campaign-name').value = '';
            document.getElementById('campaign-subject').value = '';
            document.getElementById('campaign-body').value = '';
            document.getElementById('campaign-editor-panel').style.display = 'none';
            syncDataFromServer();
        } else {
            showToast('Failed to save campaign template.', 'error');
        }
    } catch (e) {
        showToast('Server connection error.', 'error');
    }
}

// Delete campaign
async function deleteCampaign(id) {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    try {
        const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Campaign deleted.');
            syncDataFromServer();
        } else {
            showToast('Failed to delete campaign.', 'error');
        }
    } catch (e) {
        showToast('Server connection error.', 'error');
    }
}

// Send single Pitch direct from Modal
async function sendSinglePitch() {
    if (!state.selectedLead) return;
    
    const to = state.selectedLead.email;
    const subject = document.getElementById('modal-email-subject').value.trim();
    const body = document.getElementById('modal-email-body').value.trim();
    const leadId = state.selectedLead.id;
    
    const sendBtn = document.getElementById('modal-send-btn');
    sendBtn.disabled = true;
    
    if (!state.activeConnection) {
        // Mobile platform check
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
        
        if (isMobile) {
            // Replace newlines with \r\n for universal mailto compatibility
            const formattedBody = body.replace(/\r?\n/g, '\r\n');
            const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(formattedBody)}`;
            
            window.location.href = mailtoUrl;
            showToast(`Opening mobile email client for ${to}...`);
            document.getElementById('lead-details-modal').classList.remove('active');
            
            // Log manual outreach in background
            try {
                await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to, subject, body, leadId, isManual: true })
                });
                await syncDataFromServer();
                await fetchLeads();
            } catch (e) {
                console.error('Failed to log manual outreach on mobile:', e);
            }
            sendBtn.disabled = false;
            return;
        }

        sendBtn.innerHTML = `<i data-lucide="loader" class="status-dot pulsing"></i> <span>Preparing Composer...</span>`;
        safeCreateIcons();
        
        try {
            const res = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to, subject, body, leadId, isManual: true })
            });
            
            if (res.ok) {
                let targetGmailUser = 'flowwebtech.ai@gmail.com';
                if (state.connections && state.connections.length > 0) {
                    const gConn = state.connections.find(c => c.senderEmail && c.senderEmail.includes('@gmail.com'));
                    if (gConn) targetGmailUser = gConn.senderEmail;
                    else if (state.connections[0].senderEmail) targetGmailUser = state.connections[0].senderEmail;
                }
                
                const gmailComposeUrl = `https://mail.google.com/mail/u/${encodeURIComponent(targetGmailUser)}/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                const gmailUrl = `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(targetGmailUser)}&continue=${encodeURIComponent(gmailComposeUrl)}`;
                window.open(gmailUrl, '_blank');
                
                showToast(`Opened Gmail Composer for ${to}!`);
                document.getElementById('lead-details-modal').classList.remove('active');
                
                await syncDataFromServer();
                await fetchLeads();
            } else {
                const data = await res.json();
                showToast(data.error || 'Failed to log manual pitch.', 'error');
            }
        } catch (e) {
            showToast('Network error logging manual pitch.', 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<i data-lucide="mail"></i> <span>Open in Gmail (Composer)</span>`;
            safeCreateIcons();
        }
        return;
    }
    
    sendBtn.innerHTML = `<i data-lucide="loader" class="status-dot pulsing"></i> <span>Sending Pitch...</span>`;
    safeCreateIcons();
    
    try {
        const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject, body, leadId })
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast(`Pitch sent successfully to ${to}!`);
            document.getElementById('lead-details-modal').classList.remove('active');
            syncDataFromServer();
            fetchLeads(); // refresh pitched check state
        } else {
            showToast(data.error || 'Outreach send failed.', 'error');
        }
    } catch (e) {
        showToast('Network error sending email.', 'error');
    } finally {
        sendBtn.disabled = false;
        if (state.activeConnection) {
            sendBtn.innerHTML = `<i data-lucide="send"></i> <span>Send Pitch (${state.activeConnection.senderName})</span>`;
        } else {
            sendBtn.innerHTML = `<i data-lucide="mail"></i> <span>Open in Gmail (Composer)</span>`;
        }
        safeCreateIcons();
    }
}

// Enroll Selected leads into Campaign sequence
async function enrollSelectedInCampaign() {
    const campaignId = document.getElementById('enroll-campaign-select').value;
    if (!campaignId) {
        showToast('Please select a campaign sequence.', 'error');
        return;
    }
    
    const leadIds = Array.from(state.selectedLeadIds);
    const confirmBtn = document.getElementById('enroll-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Enrolling...';
    
    try {
        const res = await fetch('/api/campaigns/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId, leadIds })
        });
        
        const data = await res.json();
        if (res.ok) {
            // Trigger actual sending pipeline sequentially
            triggerSequenceSending(campaignId, leadIds);
            document.getElementById('enroll-modal').classList.remove('active');
            state.selectedLeadIds.clear();
            updateCheckedCount();
        } else {
            showToast(data.error || 'Failed to enroll prospects.', 'error');
        }
    } catch (e) {
        showToast('Server connection error.', 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Enroll & Start Sequence';
    }
}

// Loop sequence sender with delay to prevent SMTP block
async function triggerSequenceSending(campaignId, leadIds) {
    const campaign = state.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    
    showToast(`Sequence queue active. Sending ${leadIds.length} campaign emails...`);
    
    for (let i = 0; i < leadIds.length; i++) {
        // Query details of this lead
        const lead = state.leads.find(l => l.id === leadIds[i]);
        if (!lead) continue;
        
        // Skip unverified if we want to protect sender reputation
        if (!lead.isVerified) {
            console.log(`[Campaign] Skipped unverified lead: ${lead.email}`);
            continue;
        }
        
        // Parse email subject and template body
        const subject = parseTemplateVariables(campaign.subject, lead);
        const body = parseTemplateVariables(campaign.body, lead);
        
        try {
            await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: lead.email,
                    subject,
                    body,
                    leadId: lead.id,
                    campaignId: campaign.id
                })
            });
        } catch (e) {
            console.error('Failed to dispatch campaign email:', e);
        }
        
        // Delay 1 second between bulk emails to ensure threading integrity
        await new Promise(r => setTimeout(r, 1000));
    }
    
    showToast(`Outreach campaign complete. Sent logs updated.`);
    syncDataFromServer();
    fetchLeads();
}

// Template Variable Parser
function parseTemplateVariables(text, lead) {
    const sender = state.activeConnection ? state.activeConnection.senderName : 'Flowebtech';
    return text
        .replace(/{{contactFirstName}}/g, lead.contactFirstName)
        .replace(/{{contactLastName}}/g, lead.contactLastName)
        .replace(/{{companyName}}/g, lead.companyName)
        .replace(/{{auditNote}}/g, lead.auditNote)
        .replace(/{{senderName}}/g, sender);
}

// Reset data helper
async function resetDatabase() {
    if (!confirm('Are you sure you want to clear all sent email logs, campaign templates, and restore lead states?')) return;
    
    try {
        const res = await fetch('/api/reset', { method: 'POST' });
        if (res.ok) {
            showToast('Platform reset successful!');
            state.selectedLeadIds.clear();
            updateCheckedCount();
            syncDataFromServer();
            fetchLeads();
        }
    } catch (e) {
        showToast('Failed to reset database.', 'error');
    }
}

// Export leads table selection to CSV
function exportLeadsToCSV() {
    if (state.leads.length === 0) {
        showToast('No leads to export.', 'error');
        return;
    }
    
    let csv = 'Name,Title,Company,Niche,Email,Phone,Location,Technologies,Confidence Score,Verified\n';
    
    const exportList = state.selectedLeadIds.size > 0 ?
        state.leads.filter(l => state.selectedLeadIds.has(l.id)) :
        state.leads;
        
    exportList.forEach(l => {
        const clean = (val) => `"${val.replace(/"/g, '""')}"`;
        const row = [
            clean(l.contactName),
            clean(l.contactRole),
            clean(l.companyName),
            clean(l.niche),
            clean(l.email),
            clean(l.phone),
            clean(l.location),
            clean(l.technologies.join(', ')),
            l.confidenceScore,
            l.isVerified ? 'Yes' : 'No'
        ];
        csv += row.join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clientradar_leads_${new Date().toISOString().slice(0,10)}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${exportList.length} leads to CSV.`);
}

// ----------------------------------------------------
// UI Navigation / Listeners Setup
// ----------------------------------------------------
function setupEventListeners() {
    // Mobile Drawer Navigation Toggles
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebar = document.querySelector('.app-sidebar');
    
    if (mobileMenuToggle && sidebarOverlay && sidebar) {
        mobileMenuToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
        });
        
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }

    // 1. Tab switches
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.nav-item');
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            item.classList.add('active');
            
            const view = item.dataset.view;
            state.currentView = view;
            
            document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(`view-${view}`).classList.add('active');
            
            // Auto close mobile drawer on view change
            if (sidebar && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
                if (sidebarOverlay) sidebarOverlay.classList.remove('active');
            }
            
            // Refresh logs/states when switching
            syncDataFromServer();
        });
    });

    // 1b. Country tabs switches
    document.querySelectorAll('.country-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            document.querySelectorAll('.country-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            state.filters.region = btn.dataset.region;
            state.currentPage = 1; // reset page to 1
            fetchLeads();
        });
    });

    // 2. Lead Search Filter sidebar triggers
    const searchBtn = document.getElementById('search-leads-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            // Compile filters
            state.filters.niche = document.getElementById('filter-niche').value.trim();
            state.filters.location = document.getElementById('filter-location').value;
            state.filters.jobTitle = document.getElementById('filter-title').value.trim();
            state.filters.minConfidence = parseInt(document.getElementById('filter-confidence').value);
            
            // Company Size checkboxes
            state.filters.companySize = [];
            document.querySelectorAll('input[name="company-size"]:checked').forEach(c => {
                state.filters.companySize.push(c.value);
            });
            
            // Tech stack checkboxes
            state.filters.technologies = [];
            document.querySelectorAll('input[name="tech"]:checked').forEach(t => {
                state.filters.technologies.push(t.value);
            });
            
            state.currentPage = 1; // reset page
            fetchLeads();
        });
    }

    // Clear filters button
    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            document.getElementById('filter-niche').value = '';
            document.getElementById('filter-location').value = 'all';
            document.getElementById('filter-title').value = '';
            document.getElementById('filter-confidence').value = '0';
            document.querySelectorAll('input[name="company-size"]:checked').forEach(c => c.checked = false);
            document.querySelectorAll('input[name="tech"]:checked').forEach(t => t.checked = false);
            
            // Reset country tabs active states
            document.querySelectorAll('.country-tab').forEach(b => b.classList.remove('active'));
            const tabAll = document.querySelector('.country-tab[data-region="all"]');
            if (tabAll) tabAll.classList.add('active');
            
            state.filters = { niche: '', location: 'all', companySize: [], jobTitle: '', technologies: [], minConfidence: 0, region: 'all' };
            state.currentPage = 1;
            fetchLeads();
        });
    }

    // Checkbox select all
    const selectAllCheck = document.getElementById('leads-select-all');
    if (selectAllCheck) {
        selectAllCheck.addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('.lead-row-select').forEach(c => {
                c.checked = checked;
                const id = c.dataset.id;
                if (checked) {
                    state.selectedLeadIds.add(id);
                } else {
                    state.selectedLeadIds.delete(id);
                }
            });
            updateCheckedCount();
        });
    }

    // Pagination Click Listeners
    const prevBtn = document.getElementById('leads-prev-btn');
    const nextBtn = document.getElementById('leads-next-btn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                fetchLeads();
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (state.currentPage * state.pageSize < state.totalLeads) {
                state.currentPage++;
                fetchLeads();
            }
        });
    }

    // CSV export
    const exportBtn = document.getElementById('leads-export-csv');
    if (exportBtn) exportBtn.addEventListener('click', exportLeadsToCSV);

    // Reset Platform button
    const resetBtn = document.getElementById('reset-database-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetDatabase);

    // 3. Campaigns template composer actions
    const newCampBtn = document.getElementById('new-campaign-btn');
    if (newCampBtn) {
        newCampBtn.addEventListener('click', () => {
            document.getElementById('campaign-name').value = '';
            document.getElementById('campaign-subject').value = '';
            document.getElementById('campaign-body').value = '';
            document.getElementById('campaign-editor-title').textContent = 'Create Campaign Sequence';
            document.getElementById('campaign-editor-panel').style.display = 'flex';
        });
    }

    const campForm = document.getElementById('campaign-form');
    if (campForm) {
        campForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveCampaign();
        });
    }

    // Insert variable button actions
    document.querySelectorAll('.var-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const variable = e.target.dataset.var;
            const textarea = document.getElementById('campaign-body');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            
            textarea.value = text.substring(0, start) + variable + text.substring(end);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + variable.length;
        });
    });

    // 4. Activity Log status filter
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderSentEmails(e.target.dataset.status);
        });
    });

    const syncRepliesBtn = document.getElementById('sync-replies-btn');
    if (syncRepliesBtn) {
        syncRepliesBtn.addEventListener('click', () => {
            syncRepliesBtn.disabled = true;
            syncRepliesBtn.querySelector('span').textContent = 'Syncing...';
            pollRepliesSync().finally(() => {
                syncRepliesBtn.disabled = false;
                syncRepliesBtn.querySelector('span').textContent = 'Check for Replies';
            });
        });
    }

    // 5. Settings forms and tabs handlers
    document.querySelectorAll('.form-tab-btn').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.form-tab-btn').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            
            const activeTab = e.target.dataset.tab;
            document.querySelectorAll('.settings-form').forEach(f => f.classList.remove('active'));
            document.getElementById(`form-${activeTab}`).classList.add('active');
        });
    });

    // Save Gmail App Pass connection
    const gmailApForm = document.getElementById('form-gmail-app-pass');
    if (gmailApForm) {
        gmailApForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addAppPassConnection();
        });
    }

    // Save Custom SMTP connection
    const customSmtpForm = document.getElementById('form-custom-smtp');
    if (customSmtpForm) {
        customSmtpForm.addEventListener('submit', (e) => {
            e.preventDefault();
            addCustomSmtpConnection();
        });
    }

    // Save Gmail OAuth connection
    const gmailOaForm = document.getElementById('form-gmail-oauth');
    if (gmailOaForm) {
        gmailOaForm.addEventListener('submit', (e) => {
            e.preventDefault();
            connectGmailOauth();
        });
    }

    // Help link instructions modal trigger
    const helpLink = document.getElementById('setup-help-link');
    if (helpLink) {
        helpLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('instructions-modal').classList.add('active');
        });
    }
    
    // Close instructions modal
    const closeInstructionsBtn = document.getElementById('instructions-close-btn');
    if (closeInstructionsBtn) {
        closeInstructionsBtn.addEventListener('click', () => {
            document.getElementById('instructions-modal').classList.remove('active');
        });
    }

    // 6. Modals action buttons triggers
    // Close details
    const closeDetailsBtn = document.getElementById('modal-details-close-btn');
    if (closeDetailsBtn) {
        closeDetailsBtn.addEventListener('click', () => {
            document.getElementById('lead-details-modal').classList.remove('active');
        });
    }

    // Tone select trigger inside modal
    const modalToneSelect = document.getElementById('modal-tone-select');
    if (modalToneSelect) {
        modalToneSelect.addEventListener('change', (e) => {
            if (state.selectedLead) {
                generateColdEmailDraft(state.selectedLead, e.target.value);
            }
        });
    }

    // Copy to clipboard
    const modalCopyBtn = document.getElementById('modal-copy-btn');
    if (modalCopyBtn) {
        modalCopyBtn.addEventListener('click', () => {
            const body = document.getElementById('modal-email-body').value;
            navigator.clipboard.writeText(body)
                .then(() => showToast('Cold email copied to clipboard!'))
                .catch(() => showToast('Failed to copy pitch.'));
        });
    }

    // Send single pitch
    const modalSendBtn = document.getElementById('modal-send-btn');
    if (modalSendBtn) {
        modalSendBtn.addEventListener('click', sendSinglePitch);
    }

    // Enroll triggers
    const bulkEnrollBtn = document.getElementById('bulk-enroll-btn');
    if (bulkEnrollBtn) {
        bulkEnrollBtn.addEventListener('click', () => {
            const count = state.selectedLeadIds.size;
            document.getElementById('enroll-modal-desc').textContent = `Enroll ${count} selected prospects into an automated campaign sequence.`;
            updateCampaignSelects();
            document.getElementById('enroll-modal').classList.add('active');
        });
    }

    const enrollCloseBtn = document.getElementById('enroll-close-btn');
    if (enrollCloseBtn) {
        enrollCloseBtn.addEventListener('click', () => {
            document.getElementById('enroll-modal').classList.remove('active');
        });
    }
    const enrollCancelBtn = document.getElementById('enroll-cancel-btn');
    if (enrollCancelBtn) {
        enrollCancelBtn.addEventListener('click', () => {
            document.getElementById('enroll-modal').classList.remove('active');
        });
    }
    const enrollConfirmBtn = document.getElementById('enroll-confirm-btn');
    if (enrollConfirmBtn) {
        enrollConfirmBtn.addEventListener('click', enrollSelectedInCampaign);
    }

    // History Modal close
    const historyCloseBtn = document.getElementById('history-close-btn');
    if (historyCloseBtn) {
        historyCloseBtn.addEventListener('click', () => {
            document.getElementById('history-modal').classList.remove('active');
        });
    }

    // One-Click Bulk Pitch trigger
    const oneClickBtn = document.getElementById('one-click-bulk-pitch-btn');
    if (oneClickBtn) {
        oneClickBtn.addEventListener('click', async () => {
            if (state.campaigns.length === 0) {
                showToast('Please create at least one Campaign Sequence first!', 'error');
                return;
            }
            if (!state.activeConnection) {
                showToast('Please connect and activate an outbound mailbox first!', 'error');
                return;
            }
            
            // Enroll in first available campaign
            const defaultCamp = state.campaigns[0];
            const leadIds = Array.from(state.selectedLeadIds);
            
            if (confirm(`One-Click Pitch will enroll ${leadIds.length} prospects in the campaign "${defaultCamp.name}" and send real personalized emails using active mailbox ${state.activeConnection.senderEmail}. Proceed?`)) {
                // Enroll
                try {
                    await fetch('/api/campaigns/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ campaignId: defaultCamp.id, leadIds })
                    });
                    
                    state.selectedLeadIds.clear();
                    updateCheckedCount();
                    triggerSequenceSending(defaultCamp.id, leadIds);
                } catch (e) {
                    showToast('Connection error.', 'error');
                }
            }
        });
    }

    // Close Modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // 15. Search Mode switches (B2B Directory vs Live Search vs Google Maps Search)
    const modeDirectoryBtn = document.getElementById('mode-directory-btn');
    const modeLiveBtn = document.getElementById('mode-live-btn');
    const modeMapsBtn = document.getElementById('mode-maps-btn');
    const directorySearchGrid = document.getElementById('directory-search-grid');
    const liveSearchGrid = document.getElementById('live-search-grid');
    const mapsSearchGrid = document.getElementById('maps-search-grid');
    
    if (modeDirectoryBtn && modeLiveBtn && modeMapsBtn) {
        modeDirectoryBtn.addEventListener('click', () => {
            modeDirectoryBtn.classList.add('active');
            modeLiveBtn.classList.remove('active');
            modeMapsBtn.classList.remove('active');
            if (directorySearchGrid) directorySearchGrid.style.display = 'grid';
            if (liveSearchGrid) liveSearchGrid.style.display = 'none';
            if (mapsSearchGrid) mapsSearchGrid.style.display = 'none';
        });
        
        modeLiveBtn.addEventListener('click', () => {
            modeLiveBtn.classList.add('active');
            modeDirectoryBtn.classList.remove('active');
            modeMapsBtn.classList.remove('active');
            if (directorySearchGrid) directorySearchGrid.style.display = 'none';
            if (liveSearchGrid) liveSearchGrid.style.display = 'grid';
            if (mapsSearchGrid) mapsSearchGrid.style.display = 'none';
            
            const liveTbody = document.getElementById('live-leads-tbody');
            if (liveTbody && liveTbody.querySelector('.empty-state')) {
                performLiveSearch();
            }
        });
        
        modeMapsBtn.addEventListener('click', () => {
            modeMapsBtn.classList.add('active');
            modeDirectoryBtn.classList.remove('active');
            modeLiveBtn.classList.remove('active');
            if (directorySearchGrid) directorySearchGrid.style.display = 'none';
            if (liveSearchGrid) liveSearchGrid.style.display = 'none';
            if (mapsSearchGrid) mapsSearchGrid.style.display = 'grid';
            
            const mapsTbody = document.getElementById('maps-leads-tbody');
            if (mapsTbody && mapsTbody.querySelector('.empty-state')) {
                performMapsSearch();
            }
        });
    }

    // 16. Live Search triggers
    const searchLiveBtn = document.getElementById('search-live-btn');
    if (searchLiveBtn) {
        searchLiveBtn.addEventListener('click', performLiveSearch);
    }
    const clearLivePlatformsBtn = document.getElementById('clear-live-platforms-btn');
    if (clearLivePlatformsBtn) {
        clearLivePlatformsBtn.addEventListener('click', () => {
            document.querySelectorAll('input[name="live-platform"]').forEach(c => c.checked = false);
        });
    }

    // 16b. Maps Search triggers
    const searchMapsBtn = document.getElementById('search-maps-btn');
    if (searchMapsBtn) {
        searchMapsBtn.addEventListener('click', performMapsSearch);
    }
    
    const clearMapsFiltersBtn = document.getElementById('clear-maps-filters-btn');
    if (clearMapsFiltersBtn) {
        clearMapsFiltersBtn.addEventListener('click', () => {
            document.getElementById('filter-maps-category').value = '';
            document.getElementById('filter-maps-location').value = '';
            document.getElementById('filter-maps-webstatus').value = 'all';
            state.mapsFilters = { category: '', location: '', websiteStatus: 'all' };
            
            const mapsTbody = document.getElementById('maps-leads-tbody');
            if (mapsTbody) {
                mapsTbody.innerHTML = `
                    <tr class="empty-state">
                        <td colspan="7">
                            <div class="empty-message" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px;">
                                <i data-lucide="map-pin" style="width: 40px; height: 40px; color: var(--color-text-muted); margin-bottom: 12px;"></i>
                                <h3>No Local Businesses Searched</h3>
                                <p style="color: var(--color-text-muted); font-size: 13px;">Enter a category and city on the left, then click "Search Google Maps" to fetch prospective clients.</p>
                            </div>
                        </td>
                    </tr>
                `;
                safeCreateIcons();
            }
            if (document.getElementById('maps-leads-count')) {
                document.getElementById('maps-leads-count').textContent = '0 local businesses found';
            }
        });
    }

    // 17. Add Custom Lead Modal triggers
    const addLeadTriggerBtn = document.getElementById('add-lead-trigger-btn');
    if (addLeadTriggerBtn) {
        addLeadTriggerBtn.addEventListener('click', () => {
            document.getElementById('add-lead-modal').classList.add('active');
        });
    }
    const addLeadCloseBtn = document.getElementById('add-lead-close-btn');
    if (addLeadCloseBtn) {
        addLeadCloseBtn.addEventListener('click', () => {
            document.getElementById('add-lead-modal').classList.remove('active');
        });
    }
    const addLeadCancelBtn = document.getElementById('add-lead-cancel-btn');
    if (addLeadCancelBtn) {
        addLeadCancelBtn.addEventListener('click', () => {
            document.getElementById('add-lead-modal').classList.remove('active');
        });
    }
    
    // Add Lead Form submit handler
    const addLeadForm = document.getElementById('add-lead-form');
    if (addLeadForm) {
        addLeadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const companyName = document.getElementById('add-lead-company').value.trim();
            const domain = document.getElementById('add-lead-domain').value.trim();
            const contactName = document.getElementById('add-lead-contact').value.trim();
            const email = document.getElementById('add-lead-email').value.trim();
            const contactRole = document.getElementById('add-lead-role').value.trim();
            const niche = document.getElementById('add-lead-niche').value.trim();
            const location = document.getElementById('add-lead-location').value.trim();
            const countryCode = document.getElementById('add-lead-countrycode').value.trim().toUpperCase();
            const auditNote = document.getElementById('add-lead-audit').value.trim();
            
            const payload = {
                companyName,
                domain,
                contactName,
                contactFirstName: contactName.split(' ')[0],
                contactLastName: contactName.split(' ').slice(1).join(' ') || '',
                email,
                contactRole,
                jobLevel: contactRole.includes('Founder') || contactRole.includes('CEO') ? 'C-Level' : 'Manager',
                niche,
                category: niche + ' Services',
                location,
                countryCode,
                auditNote: auditNote || 'Fulfills customized B2B lead specifications.',
                companySize: '11 - 50 employees',
                revenue: '$200K - $500K',
                technologies: ['React', 'WordPress'],
                isVerified: true
            };
            
            try {
                const res = await fetch('/api/leads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (res.ok) {
                    showToast('Prospect added successfully!');
                    document.getElementById('add-lead-modal').classList.remove('active');
                    addLeadForm.reset();
                    fetchLeads(); // Reload leads database
                } else {
                    const err = await res.json();
                    showToast(err.error || 'Failed to save prospect.', 'error');
                }
            } catch (err) {
                showToast('Network error saving prospect.', 'error');
            }
        });
    }
}

// ----------------------------------------------------
// UI Notification Alerts
// ----------------------------------------------------
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const text = document.getElementById('toast-text');
    const icon = toast.querySelector('.toast-icon');
    
    if (!toast || !text) return;
    text.textContent = message;
    
    if (type === 'success') {
        toast.style.borderLeftColor = 'var(--success)';
        if (icon) {
            icon.style.color = 'var(--success)';
            icon.setAttribute('data-lucide', 'check-circle');
        }
    } else {
        toast.style.borderLeftColor = 'var(--error)';
        if (icon) {
            icon.style.color = 'var(--error)';
            icon.setAttribute('data-lucide', 'alert-circle');
        }
    }
    
    safeCreateIcons();
    toast.classList.add('active');
    
    setTimeout(() => {
        toast.classList.remove('active');
    }, 4000);
}

// ----------------------------------------------------
// Live Freelance Job Boards Search Logic
// ----------------------------------------------------
async function performLiveSearch() {
    state.liveCurrentPage = 1;
    const liveTbody = document.getElementById('live-leads-tbody');
    if (!liveTbody) return;
    
    renderLiveLeadsTableSkeleton();
    
    const keyword = document.getElementById('live-search-keyword').value.trim() || 'web design';
    const platforms = [];
    document.querySelectorAll('input[name="live-platform"]:checked').forEach(c => {
        platforms.push(c.value);
    });
    
    const platformQuery = platforms.length > 0 ? platforms.join(',') : 'Freelancer';
    
    try {
        const res = await fetch(`/api/live-leads?query=${encodeURIComponent(keyword)}&platforms=${encodeURIComponent(platformQuery)}`);
        if (res.ok) {
            const data = await res.json();
            state.liveLeads = data.leads;
            renderLiveLeadsTable();
        } else {
            showToast('Failed to search live job boards.', 'error');
        }
    } catch (e) {
        console.error('Live search error:', e);
        showToast('Network error during live search.', 'error');
    }
}

function renderLiveLeadsTable() {
    const tbody = document.getElementById('live-leads-tbody');
    const countText = document.getElementById('live-leads-count');
    const pageInfo = document.getElementById('live-page-info');
    const prevBtn = document.getElementById('live-prev-btn');
    const nextBtn = document.getElementById('live-next-btn');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const leads = state.liveLeads || [];
    
    // Update pagination variables
    const total = leads.length;
    const start = total === 0 ? 0 : (state.liveCurrentPage - 1) * state.livePageSize + 1;
    const end = Math.min(state.liveCurrentPage * state.livePageSize, total);
    
    if (pageInfo) pageInfo.textContent = `Showing ${start}-${end} of ${total} projects`;
    if (prevBtn) prevBtn.disabled = state.liveCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = state.liveCurrentPage * state.livePageSize >= total;
    
    if (countText) countText.textContent = `${total} active projects found`;
    
    if (leads.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-state">
                <td colspan="7">
                    <div class="empty-message" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px;">
                        <i data-lucide="briefcase" style="width: 40px; height: 40px; color: var(--color-text-muted); margin-bottom: 12px;"></i>
                        <h3>No Active Projects Found</h3>
                        <p style="color: var(--color-text-muted); font-size: 13px;">Try modifying your search keywords or checking more job boards.</p>
                    </div>
                </td>
            </tr>
        `;
        safeCreateIcons();
        return;
    }
    
    // Slice only current page
    const pageLeads = leads.slice((state.liveCurrentPage - 1) * state.livePageSize, state.liveCurrentPage * state.livePageSize);
    
    pageLeads.forEach(lead => {
        const tr = document.createElement('tr');
        tr.className = 'lead-row';
        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--color-text); padding: 12px;" data-label="Opportunity">
                <div style="font-size: 14px; margin-bottom: 4px;">${lead.title}</div>
                <div style="font-size: 11.5px; font-weight: normal; color: var(--color-text-muted); max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${lead.auditNote}
                </div>
            </td>
            <td style="padding: 12px;" data-label="Platform">
                <span class="badge-tag" style="background-color: rgba(99, 102, 241, 0.1); color: var(--primary); border: 1px solid rgba(99, 102, 241, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${lead.platform}</span>
            </td>
            <td style="padding: 12px; font-size: 13px;" data-label="Client">${lead.companyName}</td>
            <td style="padding: 12px; font-size: 13px;" data-label="Location">${lead.location}</td>
            <td style="font-weight: 500; color: #10b981; padding: 12px; font-size: 13px;" data-label="Budget">${lead.revenue}</td>
            <td style="padding: 12px; font-size: 12.5px; color: var(--color-text-muted);" data-label="Channel">
                <span style="display: inline-flex; align-items: center; gap: 4px;">
                    <i data-lucide="message-square" style="width: 12px; height: 12px;"></i> Platform Chat
                </span>
            </td>
            <td class="action-col" style="padding: 12px;">
                <a href="${lead.originalUrl}" target="_blank" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; text-decoration: none;">
                    <i data-lucide="external-link" style="width: 12px; height: 12px;"></i> Pitch Client
                </a>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    safeCreateIcons();
}

async function performMapsSearch() {
    state.mapsCurrentPage = 1;
    const mapsTbody = document.getElementById('maps-leads-tbody');
    if (!mapsTbody) return;
    
    renderMapsLeadsTableSkeleton();
    
    const category = document.getElementById('filter-maps-category').value.trim() || 'Dentists';
    const location = document.getElementById('filter-maps-location').value.trim() || 'New York';
    const webStatus = document.getElementById('filter-maps-webstatus').value;
    
    state.mapsFilters = { category, location, websiteStatus: webStatus };
    
    try {
        const params = new URLSearchParams();
        params.append('category', category);
        params.append('location', location);
        params.append('websiteStatus', webStatus);
        
        const res = await fetch(`/api/maps-leads?${params.toString()}`);
        if (res.ok) {
            const data = await res.json();
            state.mapsLeads = data.leads;
            renderMapsLeadsTable();
        } else {
            showToast('Failed to query local businesses from Google Maps.', 'error');
        }
    } catch (e) {
        console.error('Maps search error:', e);
        showToast('Network error during Google Maps search.', 'error');
    }
}

function renderMapsLeadsTable() {
    const tbody = document.getElementById('maps-leads-tbody');
    const countText = document.getElementById('maps-leads-count');
    const pageInfo = document.getElementById('maps-page-info');
    const prevBtn = document.getElementById('maps-prev-btn');
    const nextBtn = document.getElementById('maps-next-btn');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const leads = state.mapsLeads || [];
    
    // Update pagination variables
    const total = leads.length;
    const start = total === 0 ? 0 : (state.mapsCurrentPage - 1) * state.mapsPageSize + 1;
    const end = Math.min(state.mapsCurrentPage * state.mapsPageSize, total);
    
    if (pageInfo) pageInfo.textContent = `Showing ${start}-${end} of ${total} local businesses`;
    if (prevBtn) prevBtn.disabled = state.mapsCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = state.mapsCurrentPage * state.mapsPageSize >= total;
    
    if (countText) countText.textContent = `${total} local businesses found`;
    
    if (leads.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-state">
                <td colspan="7">
                    <div class="empty-message" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px;">
                        <i data-lucide="map-pin" style="width: 40px; height: 40px; color: var(--color-text-muted); margin-bottom: 12px;"></i>
                        <h3>No Local Businesses Found</h3>
                        <p style="color: var(--color-text-muted); font-size: 13px;">Try search terms like 'Dentist' or 'Jewelry' in a major city.</p>
                    </div>
                </td>
            </tr>
        `;
        safeCreateIcons();
        return;
    }
    
    // Slice only current page
    const pageLeads = leads.slice((state.mapsCurrentPage - 1) * state.mapsPageSize, state.mapsCurrentPage * state.mapsPageSize);
    
    pageLeads.forEach(lead => {
        const tr = document.createElement('tr');
        tr.className = 'lead-row';
        
        // Rating stars & reviews count
        const rating = parseFloat(lead.rating || 0);
        const reviews = parseInt(lead.reviews || 0);
        const ratingHtml = `
            <div style="display: flex; align-items: center; gap: 4px; font-size: 13px;">
                <span style="font-weight: 600; color: var(--color-text);">${rating.toFixed(1)}</span>
                <span style="color: #fbbf24; display: flex; align-items: center;"><i data-lucide="star" style="width: 12px; height: 12px; fill: #fbbf24;"></i></span>
                <span style="color: var(--color-text-muted); font-size: 11.5px;">(${reviews})</span>
            </div>
        `;
        
        // Website Status Badge & Link
        let webUrlHtml = `<span style="color: var(--color-text-muted); font-size: 12.5px;">None</span>`;
        let webStatusHtml = `<span class="badge-tag" style="background-color: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 11px;">⚠️ No Website</span>`;
        
        if (lead.domain) {
            webUrlHtml = `<a href="http://${lead.domain}" target="_blank" style="color: var(--primary); text-decoration: none; font-size: 13px; font-weight: 500;">${lead.domain}</a>`;
            if (lead.auditReport && (lead.auditReport.speed.status === 'failed' || lead.auditReport.security.status === 'failed' || lead.auditReport.mobile.status === 'failed')) {
                webStatusHtml = `<span class="badge-tag" style="background-color: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 11px;">⚠️ Needs Optimization</span>`;
            } else {
                webStatusHtml = `<span class="badge-tag" style="background-color: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 11px;">✓ Optimized</span>`;
            }
        }
        
        tr.innerHTML = `
            <td style="font-weight: 600; color: var(--color-text); padding: 12px;" data-label="Business Name">
                <div style="font-size: 14px; margin-bottom: 4px;">${lead.companyName}</div>
                <div style="font-size: 11.5px; font-weight: normal; color: var(--color-text-muted);">${lead.niche}</div>
            </td>
            <td style="padding: 12px;" data-label="Rating">${ratingHtml}</td>
            <td style="padding: 12px; font-size: 13px;" data-label="Location">${lead.location}</td>
            <td style="padding: 12px;" data-label="Website">${webUrlHtml}</td>
            <td style="padding: 12px;" data-label="Audit Status">${webStatusHtml}</td>
            <td style="font-family: monospace; font-size: 12.5px; color: var(--color-text-muted); padding: 12px;" data-label="Email">${lead.email || '<span style="font-style:italic;">No Email Listed</span>'}</td>
            <td class="action-col" style="padding: 12px;">
                <button class="btn btn-primary btn-sm maps-lead-pitch-btn" data-id="${lead.id}" style="display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px;">
                    <i data-lucide="mail" style="width: 12px; height: 12px;"></i> Pitch
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    safeCreateIcons();
    
    // Bind click listener specifically to maps pitch buttons
    document.querySelectorAll('.maps-lead-pitch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            const lead = state.mapsLeads.find(l => l.id === id);
            if (lead) {
                if (!lead.email || lead.email.includes('No Email')) {
                    const cleanName = lead.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    lead.email = `flowwebtech.ai+${cleanName}@gmail.com`;
                }
                openLeadDetailsModal(lead);
            }
        });
    });
}

// Bind Live Search and Maps Search pagination click listeners
const livePrevBtn = document.getElementById('live-prev-btn');
const liveNextBtn = document.getElementById('live-next-btn');
const mapsPrevBtn = document.getElementById('maps-prev-btn');
const mapsNextBtn = document.getElementById('maps-next-btn');

if (livePrevBtn) {
    livePrevBtn.addEventListener('click', () => {
        if (state.liveCurrentPage > 1) {
            state.liveCurrentPage--;
            renderLiveLeadsTable();
        }
    });
}
if (liveNextBtn) {
    liveNextBtn.addEventListener('click', () => {
        if (state.liveCurrentPage * state.livePageSize < state.liveLeads.length) {
            state.liveCurrentPage++;
            renderLiveLeadsTable();
        }
    });
}
if (mapsPrevBtn) {
    mapsPrevBtn.addEventListener('click', () => {
        if (state.mapsCurrentPage > 1) {
            state.mapsCurrentPage--;
            renderMapsLeadsTable();
        }
    });
}
if (mapsNextBtn) {
    mapsNextBtn.addEventListener('click', () => {
        if (state.mapsCurrentPage * state.mapsPageSize < state.mapsLeads.length) {
            state.mapsCurrentPage++;
            renderMapsLeadsTable();
        }
    });
}

// ----------------------------------------------------
// Shimmer Skeleton Loader Renders
// ----------------------------------------------------
function renderLeadsTableSkeleton() {
    const tbody = document.getElementById('leads-table-tbody');
    if (!tbody) return;
    tbody.innerHTML = Array(5).fill(0).map(() => `
        <tr class="skeleton-row">
            <td class="checkbox-col"><div class="skeleton-bar" style="width:16px;height:16px;border-radius:3px;"></div></td>
            <td data-label="Prospect">
                <div class="skeleton-bar" style="width:120px;height:14px;margin-bottom:6px;border-radius:3px;"></div>
                <div class="skeleton-bar" style="width:80px;height:10px;border-radius:3px;"></div>
            </td>
            <td data-label="Niche"><div class="skeleton-bar" style="width:70px;height:18px;border-radius:4px;"></div></td>
            <td data-label="Company">
                <div class="skeleton-bar" style="width:140px;height:14px;margin-bottom:6px;border-radius:3px;"></div>
                <div class="skeleton-bar" style="width:90px;height:10px;border-radius:3px;"></div>
            </td>
            <td class="email-cell" data-label="Contact">
                <div class="skeleton-bar" style="width:160px;height:14px;margin-bottom:6px;border-radius:3px;"></div>
                <div class="skeleton-bar" style="width:100px;height:10px;border-radius:3px;"></div>
            </td>
            <td data-label="Tech Tools">
                <div style="display:flex;gap:4px;">
                    <div class="skeleton-bar" style="width:50px;height:16px;border-radius:4px;"></div>
                    <div class="skeleton-bar" style="width:60px;height:16px;border-radius:4px;"></div>
                </div>
            </td>
            <td data-label="Confidence" class="score-col">
                <div class="skeleton-bar" style="width:40px;height:14px;margin-bottom:4px;border-radius:3px;"></div>
                <div class="skeleton-bar" style="width:70px;height:6px;border-radius:3px;"></div>
            </td>
            <td class="action-col"><div class="skeleton-bar" style="width:65px;height:28px;border-radius:6px;"></div></td>
        </tr>
    `).join('');
}

function renderMapsLeadsTableSkeleton() {
    const tbody = document.getElementById('maps-leads-tbody');
    if (!tbody) return;
    tbody.innerHTML = Array(5).fill(0).map(() => `
        <tr class="skeleton-row">
            <td data-label="Business Name">
                <div class="skeleton-bar" style="width:150px;height:14px;margin-bottom:6px;border-radius:3px;"></div>
                <div class="skeleton-bar" style="width:90px;height:10px;border-radius:3px;"></div>
            </td>
            <td data-label="Rating"><div class="skeleton-bar" style="width:80px;height:14px;border-radius:3px;"></div></td>
            <td data-label="Location"><div class="skeleton-bar" style="width:140px;height:14px;border-radius:3px;"></div></td>
            <td data-label="Website"><div class="skeleton-bar" style="width:110px;height:14px;border-radius:3px;"></div></td>
            <td data-label="Audit Status"><div class="skeleton-bar" style="width:90px;height:20px;border-radius:4px;"></div></td>
            <td data-label="Email"><div class="skeleton-bar" style="width:160px;height:14px;border-radius:3px;"></div></td>
            <td class="action-col"><div class="skeleton-bar" style="width:65px;height:28px;border-radius:6px;"></div></td>
        </tr>
    `).join('');
}

function renderLiveLeadsTableSkeleton() {
    const tbody = document.getElementById('live-leads-tbody');
    if (!tbody) return;
    tbody.innerHTML = Array(5).fill(0).map(() => `
        <tr class="skeleton-row">
            <td data-label="Opportunity">
                <div class="skeleton-bar" style="width:200px;height:14px;margin-bottom:6px;border-radius:3px;"></div>
                <div class="skeleton-bar" style="width:120px;height:10px;border-radius:3px;"></div>
            </td>
            <td data-label="Platform"><div class="skeleton-bar" style="width:70px;height:20px;border-radius:4px;"></div></td>
            <td data-label="Client"><div class="skeleton-bar" style="width:100px;height:14px;border-radius:3px;"></div></td>
            <td data-label="Location"><div class="skeleton-bar" style="width:120px;height:14px;border-radius:3px;"></div></td>
            <td data-label="Budget"><div class="skeleton-bar" style="width:90px;height:14px;border-radius:3px;"></div></td>
            <td data-label="Channel"><div class="skeleton-bar" style="width:90px;height:14px;border-radius:3px;"></div></td>
            <td class="action-col"><div class="skeleton-bar" style="width:80px;height:28px;border-radius:6px;"></div></td>
        </tr>
    `).join('');
}
