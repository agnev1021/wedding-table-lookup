let guests = [];
let guestsById = new Map();
let guestsByPairId = new Map();

let els = null;

function resolveEls(root) {
    const q = (selector) => root.querySelector(selector);
    return {
        input: q('#wedding-lookup-input') || q('#guest-search'),
        searchBtn: q('#wedding-lookup-btn') || q('#search-btn'),
        resultsSection: q('#wedding-lookup-results-section') || q('#results-section'),
        searchResults: q('#wedding-lookup-results') || q('#search-results'),
        tableSection: q('#wedding-lookup-table-section') || q('#table-section'),
        tableCard: q('#wedding-lookup-card') || q('#table-card'),
        root,
    };
}

function getConfigFromDom(resolvedEls) {
    const rootEl = resolvedEls.root instanceof Element ? resolvedEls.root : null;
    const wrapper = rootEl?.closest?.('.wedding-lookup') || rootEl?.querySelector?.('.wedding-lookup') || document.querySelector('.wedding-lookup');
    const csvUrl = wrapper?.getAttribute?.('data-guests-csv-url') || '';
    const csvVersion = wrapper?.getAttribute?.('data-guests-csv-version') || '';

    return {
        csvUrl,
        csvVersion,
    };
}

function formatLibraryDate(date) {
    const month = date.toLocaleString(undefined, { month: 'short' }).toUpperCase();
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear());
    return `${month} ${day} ${year}`;
}

function getTableColorClass(tableValue) {
    const n = Number.parseInt(String(tableValue), 10);
    const idx = Number.isFinite(n)
        ? (((n - 1) % 3) + 3) % 3
        : normalizeText(tableValue).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 3;

    if (idx === 0) return 'table-color-green';
    if (idx === 1) return 'table-color-magenta';
    return 'table-color-coral';
}

function normalizeText(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                const next = text[i + 1];
                if (next === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            continue;
        }

        if (ch === ',') {
            row.push(field);
            field = '';
            continue;
        }

        if (ch === '\n') {
            row.push(field);
            field = '';
            const isEmptyRow = row.every((c) => String(c ?? '').trim() === '');
            if (!isEmptyRow) rows.push(row);
            row = [];
            continue;
        }

        if (ch === '\r') {
            continue;
        }

        field += ch;
    }

    row.push(field);
    const isEmptyRow = row.every((c) => String(c ?? '').trim() === '');
    if (!isEmptyRow) rows.push(row);

    return rows;
}

function showStatusMessage(message) {
    els.resultsSection.classList.remove('hidden');
    els.tableSection.classList.add('hidden');
    els.searchResults.innerHTML = `<p class="no-results">${escapeHtml(message)}</p>`;
}

function hideResultsAndCard() {
    els.resultsSection.classList.add('hidden');
    els.tableSection.classList.add('hidden');
    els.searchResults.innerHTML = '';
    els.tableCard.innerHTML = '';
}

function renderMatches(matches, query) {
    els.resultsSection.classList.remove('hidden');
    els.tableSection.classList.add('hidden');

    if (matches.length === 0) {
        els.searchResults.innerHTML = `<p class="no-results">No matches found for “${escapeHtml(query)}”. Try your first or last name.</p>`;
        return;
    }

    if (matches.length === 1) {
        renderGuestTableCard(matches[0]);
        els.resultsSection.classList.add('hidden');
        return;
    }

    const listItems = matches
        .map((g) => {
            const label = escapeHtml(g.displayName);
            return `<li class="guest-item" role="button" tabindex="0" data-guest-id="${escapeHtml(g.id)}">${label}</li>`;
        })
        .join('');

    els.searchResults.innerHTML = `
        <div>
            <p><strong>Multiple matches found.</strong> Please select your name:</p>
            <ul class="guest-list">${listItems}</ul>
        </div>
    `;

    const items = els.searchResults.querySelectorAll('[data-guest-id]');
    items.forEach((item) => {
        const activate = () => {
            const id = item.getAttribute('data-guest-id');
            const guest = guestsById.get(id);
            if (!guest) return;
            renderGuestTableCard(guest);
            els.resultsSection.classList.add('hidden');
        };

        item.addEventListener('click', activate);
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activate();
            }
        });
    });
}

function renderGuestTableCard(guest) {
    els.tableSection.classList.remove('hidden');
    const tableColorClass = getTableColorClass(guest.table);

    let pairedGuestHtml = '';
    if (guest.pairId) {
        const pairedGuests = guestsByPairId.get(guest.pairId) || [];
        const otherGuest = pairedGuests.find(g => g.id !== guest.id);
        
        if (otherGuest) {
            pairedGuestHtml = `
                <div class="paired-guest-suggestion">
                    <p class="suggestion-label">Looking for someone else?</p>
                    <button class="paired-guest-button" data-guest-id="${escapeHtml(otherGuest.id)}">
                        ${escapeHtml(otherGuest.displayName)}
                    </button>
                </div>
            `;
        }
    }

    els.tableCard.innerHTML = `
        <div class="checkout-meta">
            <div class="meta-row"><span class="meta-label">BORROWER:</span> <span class="meta-value">${escapeHtml(guest.firstName)} ${escapeHtml(guest.lastName)}</span></div>
            <div class="meta-row"><span class="meta-label">TITLE:</span> <span class="meta-value">Table Assignment</span></div>
        </div>
        <div class="big-table-number ${escapeHtml(tableColorClass)}" aria-label="Table number">${escapeHtml(guest.table)}</div>
        ${pairedGuestHtml}
    `;

    if (guest.pairId) {
        const pairedButton = els.tableCard.querySelector('[data-guest-id]');
        if (pairedButton) {
            pairedButton.addEventListener('click', () => {
                const id = pairedButton.getAttribute('data-guest-id');
                const pairedGuest = guestsById.get(id);
                if (pairedGuest) {
                    renderGuestTableCard(pairedGuest);
                }
            });
        }
    }
}

function findMatches(query) {
    const q = normalizeText(query);
    if (!q) return [];

    return guests
        .filter((g) => {
            const fullName = `${g.firstNorm} ${g.lastNorm}`;
            return g.firstNorm.includes(q) || g.lastNorm.includes(q) || fullName.includes(q);
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function doSearch() {
    const query = els.input.value;
    if (!normalizeText(query)) {
        showStatusMessage('Please enter your first or last name.');
        return;
    }

    if (guests.length === 0) {
        showStatusMessage('Guest list is still loading. Please try again in a moment.');
        return;
    }

    const matches = findMatches(query);
    renderMatches(matches, query);
}

async function loadGuestCsv(config) {
    try {
        const domCfg = getConfigFromDom(els);
        const csvUrl =
            config?.csvUrl ||
            window.WEDDING_GUESTS_CSV_URL ||
            domCfg.csvUrl ||
            'guests.csv';

        const csvVersion =
            config?.csvVersion ||
            window.WEDDING_GUESTS_CSV_VERSION ||
            domCfg.csvVersion ||
            '';

        const url = new URL(csvUrl, window.location.href);
        if (csvVersion) url.searchParams.set('v', String(csvVersion));

        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load guests.csv (${res.status})`);
        const text = await res.text();
        const rows = parseCsv(text);

        if (rows.length < 2) {
            showStatusMessage('Guest list is empty or missing headers.');
            return;
        }

        const headers = rows[0].map((h) => normalizeText(h));

        const idx = {
            first: headers.indexOf('first_name'),
            last: headers.indexOf('last_name'),
            table: headers.indexOf('table'),
            display: headers.indexOf('display_name'),
            id: headers.indexOf('id'),
            pairId: headers.indexOf('pair_id'),
        };

        const required = [idx.first, idx.last, idx.table];
        if (required.some((i) => i === -1)) {
            showStatusMessage('guests.csv must include headers: first_name, last_name, table');
            return;
        }

        const loaded = [];
        const byId = new Map();
        const byPairId = new Map();

        for (let r = 1; r < rows.length; r++) {
            const row = rows[r];
            const firstName = String(row[idx.first] ?? '').trim();
            const lastName = String(row[idx.last] ?? '').trim();
            const table = String(row[idx.table] ?? '').trim();

            if (!firstName || !lastName || !table) continue;

            const displayNameRaw = idx.display !== -1 ? String(row[idx.display] ?? '').trim() : '';
            const displayName = displayNameRaw || `${firstName} ${lastName}`;

            const providedId = idx.id !== -1 ? String(row[idx.id] ?? '').trim() : '';
            const id = providedId || `${normalizeText(firstName)}-${normalizeText(lastName)}-${r}`;

            const pairId = idx.pairId !== -1 ? String(row[idx.pairId] ?? '').trim() : '';

            const guest = {
                id,
                firstName,
                lastName,
                table,
                displayName,
                firstNorm: normalizeText(firstName),
                lastNorm: normalizeText(lastName),
                pairId,
            };

            loaded.push(guest);
            byId.set(id, guest);

            if (pairId) {
                if (!byPairId.has(pairId)) {
                    byPairId.set(pairId, []);
                }
                byPairId.get(pairId).push(guest);
            }
        }

        guests = loaded;
        guestsById = byId;
        guestsByPairId = byPairId;

        if (guests.length === 0) {
            showStatusMessage('Guest list loaded, but no valid rows were found.');
        }
    } catch (e) {
        showStatusMessage('Could not load the guest list. If you opened this as a local file, try running a local web server.');
    }
}

function initWeddingTableLookup(options = {}) {
    const root = options.root instanceof Element ? options.root : document;
    const resolved = resolveEls(root);
    if (!resolved.input || !resolved.searchBtn || !resolved.resultsSection || !resolved.searchResults || !resolved.tableSection || !resolved.tableCard) {
        return false;
    }

    if (resolved.searchBtn.dataset.weddingLookupInitialized === '1') {
        return true;
    }
    resolved.searchBtn.dataset.weddingLookupInitialized = '1';

    els = resolved;
    guests = [];
    guestsById = new Map();
    guestsByPairId = new Map();

    els.searchBtn.addEventListener('click', doSearch);
    els.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });
    els.input.addEventListener('input', () => {
        hideResultsAndCard();
    });

    loadGuestCsv({
        csvUrl: options.csvUrl,
        csvVersion: options.csvVersion,
    });

    return true;
}

window.initWeddingTableLookup = initWeddingTableLookup;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initWeddingTableLookup();
    });
} else {
    initWeddingTableLookup();
}
