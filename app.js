const SPREADSHEET_ID = '1iyBgs4Blf7gW1xIZfbxdWQJVg9OHVUU65IgJ7OjVf90';

let haikuDatabase = [];
let saijikiDict = {}; 
let currentRoomHaikus = []; 
let currentIndex = 0;
let isRoomOpen = false;
let currentDisplayType = ''; 
let infoRevealed = false;
let currentTargetKigo = '';

let navState = { 
    currentLayer: 'topPage', 
    category: '', 
    seasonName: '', 
    kigoName: '', 
    authorName: '', 
    issueYear: '', 
    issueMonth: '', 
    issueNumber: '',
    isDetarame: false 
};

let touchStartX = 0;
let touchStartY = 0;

window.onload = function() {
    const scriptHaiku = document.createElement('script');
    scriptHaiku.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent('俳句集成')}&range=A:L&tqx=responseHandler:mainDataReceived`;
    document.body.appendChild(scriptHaiku);

    const scriptSaijiki = document.createElement('script');
    scriptSaijiki.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent('歳時記データベース')}&range=A:H&tqx=responseHandler:saijikiDataReceived`;
    document.body.appendChild(scriptSaijiki);

    initSwipeEvents();
};

function mainDataReceived(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        const rows = data.table.rows;
        let freshDatabase = [];

        for (let i = 0; i < rows.length; i++) {
            const c = rows[i].c;
            if (!c || !c[0]) continue;
            
            let rawVal = (c[0].v !== undefined && c[0].v !== null) ? c[0].v : c[0].f;
            if (!rawVal) continue;
            
            let phraseStr = String(rawVal).trim();
            if (phraseStr === '俳句' || phraseStr === '句' || phraseStr === '') continue;

            let cleanSeason = c[6] && (c[6].v || c[6].f) ? String(c[6].v || c[6].f).trim().toLowerCase() : '';
            if (cleanSeason === 'sinnen') cleanSeason = 'shinnen';
            if (cleanSeason === 'fuyu') cleanSeason = 'huyu';
            if (cleanSeason === 'season' || cleanSeason === '季節') continue;

            let customKigo = c[8] && (c[8].v || c[8].f) ? String(c[8].v || c[8].f).trim() : '';
            let rawKigo = c[3] && (c[3].v || c[3].f) ? String(c[3].v || c[3].f).trim() : '';
            let finalKigo = customKigo || rawKigo;

            freshDatabase.push({
                phrase: phraseStr,      
                author: c[1] && (c[1].v || c[1].f) ? String(c[1].v || c[1].f).trim() : '作者不詳',      
                authorKana: c[2] && (c[2].v || c[2].f) ? String(c[2].v || c[2].f).trim() : '',  
                kigo: finalKigo,        
                parentKigo: c[4] && (c[4].v || c[4].f) ? String(c[4].v || c[4].f).trim() : '',  
                kigoKana: c[5] && (c[5].v || c[5].f) ? String(c[5].v || c[5].f).trim() : '',    
                season: cleanSeason,                                      
                detailSeason: c[7] && (c[7].v || c[7].f) ? String(c[7].v || c[7].f).trim() : '',
                issueYear: c[9] && (c[9].v || c[9].f) ? String(c[9].v || c[9].f).trim() : '',  
                issueMonth: c[10] && (c[10].v || c[10].f) ? String(c[10].v || c[10].f).trim() : '', 
                issueNumber: c[11] && (c[11].v || c[11].f) ? String(c[11].v || c[11].f).trim() : '' 
            });
        }

        if (freshDatabase.length > 0) {
            haikuDatabase = freshDatabase;
            hideLoadingOverlay();
            if (!isRoomOpen && navState.currentLayer === 'topPage' && currentRoomHaikus.length === 0) {
                launchOmikuji();
                createHaijinList();
            }
        }
    } catch (error) {
        console.error('データ解析エラー:', error);
    }
}

// 🌸 歳時記データ受信処理（G列＝子季語、H列＝解説を直接ピンポイント取得）
function saijikiDataReceived(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        const rows = data.table.rows;
        let dict = {};

        for (let i = 0; i < rows.length; i++) {
            const rowCells = rows[i].c;
            if (!rowCells) continue;

            // C列（3列目・インデックス2）：親季語
            let parentVal = rowCells[2] ? (rowCells[2].v !== undefined ? rowCells[2].v : rowCells[2].f) : null;
            if (parentVal === null || parentVal === undefined) continue;

            let parentKigo = String(parentVal).replace(/[\s\u3000]+/g, '').trim();
            if (parentKigo === '親季語' || parentKigo === '') continue;

            // D列（4列目・インデックス3）：かな
            let kigoKana = rowCells[3] && (rowCells[3].v || rowCells[3].f) ? String(rowCells[3].v || rowCells[3].f).trim() : '';
            
            // G列（7列目・インデックス6）：子季語
            let childKigos = rowCells[6] && (rowCells[6].v || rowCells[6].f) ? String(rowCells[6].v || rowCells[6].f).trim() : '';
            
            // H列（8列目・インデックス7）：解説文（文字数自動判定ではなく厳密に指定）
            let desc = rowCells[7] && (rowCells[7].v || rowCells[7].f) ? String(rowCells[7].v || rowCells[7].f).trim() : '';

            if (!dict[parentKigo]) {
                dict[parentKigo] = { parentKigo, kigoKana, childKigos, desc };
            } else {
                if (kigoKana && !dict[parentKigo].kigoKana) dict[parentKigo].kigoKana = kigoKana;
                if (childKigos && !dict[parentKigo].childKigos) dict[parentKigo].childKigos = childKigos;
                if (desc && !dict[parentKigo].desc) dict[parentKigo].desc = desc;
            }
        }

        saijikiDict = dict;
    } catch (e) {
        console.error('歳時記マスター解析エラー:', e);
    }
}

function hideLoadingOverlay() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
}

function toJapaneseEra(yearNum) {
    let y = Number(yearNum);
    if (y === 2026) return '令和八年';
    if (y === 2025) return '令和七年';
    if (y === 2024) return '令和六年';
    return `${y}年`;
}

function toKanjiMonth(monthNum) {
    const map = {'1':'一', '2':'二', '3':'三', '4':'四', '5':'五', '6':'六', '7':'七', '8':'八', '9':'九', '10':'十', '11':'十一', '12':'十二'};
    let m = String(monthNum).trim();
    return map[m] ? `${map[m]}月` : `${m}月`;
}

// 🌸 ルビ変換処理
function formatRubyText(text) {
    if (!text) return '';
    let str = String(text);

    // 全角「｜」を半角「|」に統一
    str = str.replace(/｜/g, '|');

    // STEP 1: 「|」指定を最優先処理
    str = str.replace(/\|([^《（(]+)[《（(]([^》）)]+)[》）)]/g, function(match, targetText, rubyText) {
        return '<span class="ruby-block"><ruby>' + targetText + '<rt>' + rubyText + '</rt></ruby></span>';
    });

    // STEP 2: 自動判定処理
    str = str.replace(/([\u4E00-\u9FFF\u3005]+)[《（(]([^》）)]+)[》）)]/g, function(match, targetText, rubyText) {
        return '<span class="ruby-block"><ruby>' + targetText + '<rt>' + rubyText + '</rt></ruby></span>';
    });

    return str;
}

function launchOmikuji() {
    currentDisplayType = 'detarame';
    navState.category = 'omikuji_all';
    navState.isDetarame = true;
    currentRoomHaikus = [...haikuDatabase]; 
    shuffleArray(currentRoomHaikus);
    currentIndex = 0; 
    renderPage('roomPage'); 
    updateHaikuDisplay();
}

function triggerInstantOmikuji() { launchOmikuji(); }

function updateBreadcrumb() {
    const container = document.getElementById('globalBreadcrumb');
    if (!container) return;

    if (navState.currentLayer === 'topPage') {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    let html = `<span class="link" onclick="renderPage('topPage')">home</span>`;
    
    if (navState.category === 'omikuji_all') {
        html += ` <span class="separator">&lt;</span> <span class="current">おみ句じ</span>`;
    } else if (navState.category === 'haijin') {
        html += ` <span class="separator">&lt;</span> <span class="link" onclick="renderPage('haijinPage')">おみ句じ（俳人）</span>`;
        if (navState.currentLayer === 'roomPage') html += ` <span class="separator">&lt;</span> <span class="current">${navState.authorName}</span>`;
    } else if (navState.category === 'haiku') {
        html += ` <span class="separator">&lt;</span> <span class="link" onclick="renderPage('haikuPage')">おみ句じ（季節）</span>`;
        if (navState.currentLayer === 'roomPage') html += ` <span class="separator">&lt;</span> <span class="current">${navState.seasonName}</span>`;
    } else if (navState.category === 'saijiki') {
        html += ` <span class="separator">&lt;</span> <span class="link" onclick="renderPage('saijikiPage')">季寄せ</span>`;
        if (currentDisplayType !== 'kigo_muki') {
            if (navState.currentLayer === 'kigoListPage' || navState.currentLayer === 'saijikiListRoomPage') {
                html += ` <span class="separator">&lt;</span> <span class="link" onclick="showKigoList(getSeasonCode('${navState.seasonName}'), '${navState.seasonName}')">${navState.seasonName}</span>`;
            }
        }
        if (navState.currentLayer === 'saijikiListRoomPage') {
            html += ` <span class="separator">&lt;</span> <span class="current">${navState.kigoName}</span>`;
        }
    } else if (navState.category === 'utena_archive') {
        html += ` <span class="separator">&lt;</span> <span class="link" onclick="showIssueYearList()">臺俳句</span>`;
        if (navState.issueYear) {
            if (navState.currentLayer === 'issueMonthPage' || navState.currentLayer === 'issueDetailPage' || navState.currentLayer === 'utenaAuthorListPage' || navState.currentLayer === 'roomPage' || navState.currentLayer === 'saijikiListRoomPage') {
                html += ` <span class="separator">&lt;</span> <span class="link" onclick="showIssueMonthList('${navState.issueYear}')">${toJapaneseEra(navState.issueYear)}</span>`;
            }
        }
        if (navState.issueMonth) {
            let monthLabel = `${toKanjiMonth(navState.issueMonth)}`;
            if (navState.currentLayer === 'issueDetailPage') {
                html += ` <span class="separator">&lt;</span> <span class="current">${monthLabel}</span>`;
            } else if (navState.currentLayer === 'utenaAuthorListPage' || navState.currentLayer === 'roomPage' || navState.currentLayer === 'saijikiListRoomPage') {
                html += ` <span class="separator">&lt;</span> <span class="link" onclick="showIssueDetailPage('${navState.issueYear}', '${navState.issueMonth}')">${monthLabel}</span>`;
            }
        }
        if (navState.currentLayer === 'utenaAuthorListPage') {
            html += ` <span class="separator">&lt;</span> <span class="current">俳人別</span>`;
        }
        if (navState.currentLayer === 'roomPage' && currentDisplayType === 'issue_all') {
            html += ` <span class="separator">&lt;</span> <span class="current">全句</span>`;
        }
        if (navState.currentLayer === 'saijikiListRoomPage' && navState.authorName) {
            html += ` <span class="separator">&lt;</span> <span class="link" onclick="showUtenaAuthorListPage()">俳人別</span>`;
            html += ` <span class="separator">&lt;</span> <span class="current">${navState.authorName}</span>`;
        }
    }
    container.innerHTML = html;
}

function renderPage(pageId) {
    document.querySelectorAll('.layer-page').forEach(page => page.style.display = 'none');
    const target = document.getElementById(pageId);
    if(target) target.style.display = 'flex';
    
    if (pageId !== 'roomPage') {
        const infoTrigger = document.getElementById('infoTrigger');
        const mainTag = document.getElementById('roomMainTag');
        if (infoTrigger) infoTrigger.style.display = 'none';
        if (mainTag) mainTag.innerText = '';
    }
    
    navState.currentLayer = pageId;
    if (pageId === 'topPage') { navState.category = ''; navState.isDetarame = false; }
    else if (pageId === 'haijinPage') navState.category = 'haijin';
    else if (pageId === 'haikuPage') navState.category = 'haiku';
    else if (pageId === 'saijikiPage') navState.category = 'saijiki';
    
    isRoomOpen = (pageId === 'roomPage');

    const catBtn = document.getElementById('fixedCatBtn');
    if (catBtn) {
        if (navState.category === 'saijiki' || (navState.category === 'utena_archive' && !isRoomOpen)) {
            catBtn.classList.remove('hidden');
        } else {
            catBtn.classList.add('hidden');
        }
    }

    updateBreadcrumb();
}

function navigateTo(pageId) { renderPage(pageId); }
function getSeasonCode(name) { const map = {'春':'haru', '夏':'natsu', '秋':'aki', '冬':'huyu', '新年':'shinnen', '無季':'muki'}; return map[name] || ''; }

function createHaijinList() {
    const container = document.getElementById('haijinList'); 
    if (!container) return;
    container.innerHTML = '';

    let authorMap = {};
    haikuDatabase.forEach(item => { if (!authorMap[item.author]) authorMap[item.author] = item.authorKana || item.author; });
    let uniqueAuthors = Object.keys(authorMap);
    uniqueAuthors.sort((a, b) => authorMap[a].localeCompare(authorMap[b], 'ja'));
    uniqueAuthors.forEach(author => {
        const el = document.createElement('div'); el.className = 'vertical-link'; el.innerText = author; 
        el.onclick = function() { jumpToAuthorRoom(author); };
        container.appendChild(el);
    });
    container.style.justifyContent = 'center';
}

function jumpToAuthorRoom(author) {
    navState.authorName = author;
    openRoom('author', author, author);
}

function handleKigoSearch() {
    const input = document.getElementById('kigoSearchInput');
    const resultsContainer = document.getElementById('searchResults');
    if (!input || !resultsContainer) return;

    const query = input.value.trim().toLowerCase();
    if (query === '') {
        resultsContainer.classList.add('hidden');
        resultsContainer.innerHTML = '';
        return;
    }

    let matches = [];
    Object.keys(saijikiDict).forEach(pKigo => {
        let item = saijikiDict[pKigo];
        let matchParent = pKigo.toLowerCase().includes(query);
        let matchChild = item.childKigos.toLowerCase().includes(query);
        let matchKana = item.kigoKana.toLowerCase().includes(query);

        if (matchParent || matchChild || matchKana) {
            matches.push(item);
        }
    });

    if (matches.length === 0) {
        resultsContainer.innerHTML = '<div class="search-item-none">該当する季語が見つかりません</div>';
    } else {
        resultsContainer.innerHTML = '';
        matches.forEach(m => {
            const el = document.createElement('div');
            el.className = 'search-result-item';
            el.innerHTML = `<span class="search-parent">${m.parentKigo}</span> <span class="search-child">${m.childKigos}</span>`;
            el.onclick = function() {
                resultsContainer.classList.add('hidden');
                input.value = '';
                navState.kigoName = m.parentKigo;
                openSaijikiKigoWithCard(m.parentKigo);
            };
            resultsContainer.appendChild(el);
        });
    }
    resultsContainer.classList.remove('hidden');
}

function showKigoList(seasonCode, seasonName) {
    navState.seasonName = seasonName; navState.category = 'saijiki';
    const container = document.getElementById('kigoList'); 
    if (!container) return;
    container.innerHTML = '';
    
    let kigoMap = {};
    haikuDatabase.forEach(item => { 
        if (item.season === seasonCode) { 
            let targetKigo = item.parentKigo || item.kigo;
            if (targetKigo && !kigoMap[targetKigo]) {
                kigoMap[targetKigo] = item.kigoKana || targetKigo; 
            }
        } 
    });
    
    let uniqueKigos = Object.keys(kigoMap);
    if (uniqueKigos.length === 0) { alert('まだこの季節の季語が登録されていません。'); return; }
    uniqueKigos.sort((a, b) => kigoMap[a].localeCompare(kigoMap[b], 'ja'));
    uniqueKigos.forEach(kigo => {
        const el = document.createElement('div'); el.className = 'vertical-link'; el.innerText = kigo;
        el.onclick = function() { navState.kigoName = kigo; openSaijikiKigoWithCard(kigo); }; 
        container.appendChild(el);
    });
    container.style.justifyContent = 'center';
    renderPage('kigoListPage');
}

function openSaijikiKigoWithCard(kigoName) {
    currentTargetKigo = kigoName;
    
    let cleanKey = String(kigoName).replace(/[\s\u3000]+/g, '').trim();
    let saijikiInfo = saijikiDict[cleanKey] || saijikiDict[kigoName];

    const parentEl = document.getElementById('cardParentKigo');
    const childEl = document.getElementById('cardChildKigo');
    const descEl = document.getElementById('cardDesc');

    if (!saijikiInfo) {
        if (parentEl) parentEl.innerText = kigoName;
        if (childEl) childEl.innerText = '';
        if (descEl) descEl.innerText = '解説データ準備中';
    } else {
        if (parentEl) {
            if (saijikiInfo.kigoKana) {
                parentEl.innerHTML = `<ruby>${saijikiInfo.parentKigo}<rt>${saijikiInfo.kigoKana}</rt></ruby>`;
            } else {
                parentEl.innerText = saijikiInfo.parentKigo;
            }
        }
        if (childEl) childEl.innerText = saijikiInfo.childKigos ? `子季語：${saijikiInfo.childKigos}` : '';
        if (descEl) descEl.innerText = saijikiInfo.desc ? saijikiInfo.desc : '解説データ準備中';
    }

    const overlay = document.getElementById('kigoCardOverlay');
    if (overlay) overlay.classList.remove('hidden');
}

function closeKigoCard() {
    const overlay = document.getElementById('kigoCardOverlay');
    if (overlay) overlay.classList.add('hidden');

    let matchingHaikus = haikuDatabase.filter(item => (item.parentKigo === currentTargetKigo || item.kigo === currentTargetKigo));
    const container = document.getElementById('saijikiHaikuList');
    if (!container) return;
    container.innerHTML = '';

    if (matchingHaikus.length === 0) {
        alert('この季語の作品はまだ登録されていません。');
        return;
    }

    matchingHaikus.forEach(item => {
        const card = document.createElement('div');
        card.className = 'saijiki-haiku-card';
        card.innerHTML = `
            <div class="saijiki-phrase">${formatRubyText(item.phrase)}</div>
            <div class="saijiki-author">${item.author}</div>
        `;
        container.appendChild(card);
    });

    renderPage('saijikiListRoomPage');
}

function showIssueYearList() {
    navState.category = 'utena_archive';
    navState.issueYear = ''; navState.issueMonth = '';
    
    const container = document.getElementById('issueYearList');
    if (!container) return;
    container.innerHTML = '';

    let years = [...new Set(haikuDatabase.map(item => item.issueYear).filter(Boolean))];
    years.sort((a, b) => Number(b) - Number(a));

    if (years.length === 0) {
        alert('臺俳句のデータがまだ登録されていません。');
        return;
    }

    years.forEach(year => {
        const el = document.createElement('div');
        el.className = 'vertical-link';
        el.innerText = toJapaneseEra(year);
        el.onclick = function() { showIssueMonthList(year); };
        container.appendChild(el);
    });
    
    container.style.justifyContent = 'center';
    renderPage('issueYearPage');
}

function showIssueMonthList(year) {
    navState.category = 'utena_archive';
    navState.issueYear = year; navState.issueMonth = '';

    const container = document.getElementById('issueMonthList');
    if (!container) return;
    container.innerHTML = '';

    let issueHaikus = haikuDatabase.filter(item => item.issueYear === year);
    let monthMap = {};
    issueHaikus.forEach(item => {
        if (item.issueMonth && !monthMap[item.issueMonth]) {
            monthMap[item.issueMonth] = item.issueNumber || '';
        }
    });

    let months = Object.keys(monthMap).sort((a, b) => Number(b) - Number(a));

    months.forEach(month => {
        let issueNo = monthMap[month];
        let kanjiMonth = toKanjiMonth(month);
        let label = issueNo ? `${kanjiMonth}（第${issueNo}号）` : `${kanjiMonth}`;
        const el = document.getElementById('div');
        el.className = 'vertical-link';
        el.innerText = label;
        el.onclick = function() { showIssueDetailPage(year, month); };
        container.appendChild(el);
    });

    container.style.justifyContent = 'center';
    renderPage('issueMonthPage');
}

function showIssueDetailPage(year, month) {
    navState.category = 'utena_archive';
    navState.issueYear = year; navState.issueMonth = month;

    const container = document.getElementById('issueDetailContent');
    if (!container) return;
    container.innerHTML = '';

    let issueHaikus = haikuDatabase.filter(item => item.issueYear === year && item.issueMonth === month);

    const allBtn = document.createElement('div');
    allBtn.className = 'vertical-link utena-mode-btn';
    allBtn.innerText = 'おみ句じ（全句）';
    allBtn.onclick = function() {
        navState.authorName = '';
        currentDisplayType = 'issue_all';
        currentRoomHaikus = [...issueHaikus];
        shuffleArray(currentRoomHaikus);
        currentIndex = 0;
        renderPage('roomPage');
        updateHaikuDisplay();
    };
    container.appendChild(allBtn);

    const haijinBtn = document.createElement('div');
    haijinBtn.className = 'vertical-link utena-mode-btn';
    haijinBtn.innerText = '俳人別';
    haijinBtn.onclick = function() {
        showUtenaAuthorListPage();
    };
    container.appendChild(haijinBtn);

    container.style.justifyContent = 'center';
    renderPage('issueDetailPage');
}

function showUtenaAuthorListPage() {
    const container = document.getElementById('utenaAuthorList');
    if (!container) return;
    container.innerHTML = '';

    let issueHaikus = haikuDatabase.filter(item => item.issueYear === navState.issueYear && item.issueMonth === navState.issueMonth);

    let orderedAuthors = [];
    issueHaikus.forEach(item => {
        if (item.author && !orderedAuthors.includes(item.author)) {
            orderedAuthors.push(item.author);
        }
    });

    orderedAuthors.forEach(author => {
        const el = document.createElement('div');
        el.className = 'vertical-link';
        el.innerText = author;
        el.onclick = function() {
            showUtenaAuthorWorks(author);
        };
        container.appendChild(el);
    });

    container.style.justifyContent = 'center';
    renderPage('utenaAuthorListPage');
}

function showUtenaAuthorWorks(author) {
    navState.authorName = author;
    let issueHaikus = haikuDatabase.filter(item => item.issueYear === navState.issueYear && item.issueMonth === navState.issueMonth && item.author === author);

    const container = document.getElementById('saijikiHaikuList');
    if (!container) return;
    container.innerHTML = '';

    if (issueHaikus.length === 0) {
        alert('作品が見つかりませんでした。');
        return;
    }

    issueHaikus.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'saijiki-haiku-card utena-work-card';
        card.innerHTML = `
            <div class="saijiki-phrase utena-phrase">${formatRubyText(item.phrase)}</div>
        `;
        container.appendChild(card);
    });

    container.style.justifyContent = 'center';
    container.scrollLeft = 0;

    renderPage('saijikiListRoomPage');
}

function openRoom(type, targetValue, displayName) {
    currentDisplayType = type; 
    if (type === 'author') { navState.category = 'haijin'; navState.isDetarame = false; currentRoomHaikus = haikuDatabase.filter(item => item.author === targetValue); shuffleArray(currentRoomHaikus); }
    else if (type === 'haiku_season') { navState.category = 'haiku'; navState.seasonName = displayName; navState.isDetarame = false; currentRoomHaikus = haikuDatabase.filter(item => item.season === targetValue); shuffleArray(currentRoomHaikus); }
    else if (type === 'detarame') { navState.category = 'omikuji_all'; navState.isDetarame = true; currentRoomHaikus = [...haikuDatabase]; shuffleArray(currentRoomHaikus); }
    else if (type === 'kigo_muki') { navState.category = 'saijiki'; navState.seasonName = '無季'; navState.kigoName = '無季'; navState.isDetarame = false; currentRoomHaikus = haikuDatabase.filter(item => item.season === 'muki'); shuffleArray(currentRoomHaikus); }
    
    if (currentRoomHaikus.length === 0) { alert('まだ条件に合う俳句が登録されていません。'); return; }
    currentIndex = 0; renderPage('roomPage'); updateHaikuDisplay();
}

function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }
function changeHaiku(direction) { if (currentIndex + direction >= 0 && currentIndex + direction < currentRoomHaikus.length) { currentIndex += direction; updateHaikuDisplay(); } }

function revealHiddenInfo() {
    infoRevealed = true; 
    const infoTrigger = document.getElementById('infoTrigger');
    if (infoTrigger) infoTrigger.style.display = 'none';
    
    const currentHaiku = currentRoomHaikus[currentIndex];
    if (!currentHaiku) return;

    let kigoStr = (currentHaiku.season === 'muki') ? '無季' : (currentHaiku.parentKigo || currentHaiku.kigo);
    if (currentHaiku.detailSeason) {
        kigoStr = `${kigoStr}（${currentHaiku.detailSeason}）`;
    }

    const mainTag = document.getElementById('roomMainTag');
    if (mainTag) {
        mainTag.className = 'info-upper-tag';
        mainTag.innerHTML = `<div class="info-kigo-sub">${kigoStr}</div><div><a href="javascript:void(0);" onclick="jumpToAuthorRoom('${currentHaiku.author}')">${currentHaiku.author}</a></div>`;
    }
    updateBreadcrumb();
}

function updateHaikuDisplay() {
    const currentHaiku = currentRoomHaikus[currentIndex];
    if (!currentHaiku) return;

    const phraseEl = document.getElementById('haikuPhrase');
    if (phraseEl) phraseEl.innerHTML = formatRubyText(currentHaiku.phrase);

    let kigoString = (currentHaiku.season === 'muki') ? '無季' : (currentHaiku.parentKigo || currentHaiku.kigo);
    if (currentHaiku.detailSeason) {
        kigoString = `${kigoString}（${currentHaiku.detailSeason}）`;
    }

    const infoTrigger = document.getElementById('infoTrigger');
    const mainTag = document.getElementById('roomMainTag');

    if (navState.category === 'omikuji_all' || (navState.category === 'utena_archive' && currentDisplayType === 'issue_all')) {
        infoRevealed = false; 
        if (mainTag) mainTag.innerText = ''; 
        if (infoTrigger) infoTrigger.style.display = 'inline-block';
    } 
    else if (navState.category === 'haijin') {
        if (infoTrigger) infoTrigger.style.display = 'none'; 
        if (mainTag) { mainTag.className = 'info-upper-tag'; mainTag.innerText = kigoString; }
    }
    else if (navState.category === 'utena_archive') {
        if (infoTrigger) infoTrigger.style.display = 'none'; 
        if (mainTag) { mainTag.className = 'info-upper-tag'; mainTag.innerText = kigoString; }
    }
    else {
        if (infoTrigger) infoTrigger.style.display = 'none'; 
        if (mainTag) { mainTag.className = 'info-upper-tag'; mainTag.innerText = currentHaiku.author; }
    }

    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (prevBtn) { if (currentIndex === 0) prevBtn.classList.add('disabled'); else prevBtn.classList.remove('disabled'); }
    if (nextBtn) { if (currentIndex === currentRoomHaikus.length - 1) nextBtn.classList.add('disabled'); else nextBtn.classList.remove('disabled'); }
    
    updateBreadcrumb();
}

function initSwipeEvents() {
    const room = document.getElementById('roomPage');
    if (!room) return;

    room.addEventListener('touchstart', function(e) {
        if (!isRoomOpen) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    room.addEventListener('touchend', function(e) {
        if (!isRoomOpen) return;
        const diffX = e.changedTouches[0].clientX - touchStartX;
        const diffY = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX > 0) changeHaiku(1);
            else changeHaiku(-1);
        }
    }, { passive: true });
}

document.addEventListener('keydown', function(event) {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT') {
        return;
    }

    if (event.key === 'o' || event.key === 'O') { triggerInstantOmikuji(); return; }
    if (!isRoomOpen) return;
    if (event.key === 'ArrowLeft') changeHaiku(1); 
    if (event.key === 'ArrowRight') changeHaiku(-1); 
    if (event.key === 'i' || event.key === 'I') {
        if ((navState.category === 'omikuji_all' || (navState.category === 'utena_archive' && currentDisplayType === 'issue_all')) && !infoRevealed) {
            revealHiddenInfo();
        }
    }
});
