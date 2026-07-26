// 『デジタル臺用 データベース』のIDに差し替え
const SPREADSHEET_ID = '1iyBgs4Blf7gW1xIZfbxdWQJVg9OHVUU65IgJ7OjVf90';

let haikuDatabase = [];
let currentRoomHaikus = []; 
let currentIndex = 0;
let isRoomOpen = false;
let currentDisplayType = ''; 
let infoRevealed = false;

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

// スワイプ検知変数
let touchStartX = 0;
let touchStartY = 0;

window.onload = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    restoreCachedHaikuDatabase();

    // J〜L列（発行年・月・号数）まで取得するために range=A:L に拡張
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent('俳句集成')}&range=A:L&tqx=responseHandler:mainDataReceived`;
    document.body.appendChild(script);

    initSwipeEvents();
};

function restoreCachedHaikuDatabase() {
    try {
        const cachedData = localStorage.getItem('utena_haikuDatabase');
        if (cachedData) {
            haikuDatabase = JSON.parse(cachedData);
            if (haikuDatabase.length > 0) {
                hideLoadingOverlay();
                launchOmikuji();
                createHaijinList();
            }
        }
    } catch (e) {
        console.error('キャッシュ復元エラー:', e);
    }
}

function hideLoadingOverlay() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
}

function mainDataReceived(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        const rows = data.table.rows;
        let freshDatabase = [];

        for (let i = 0; i < rows.length; i++) {
            const c = rows[i].c;
            if (!c || !c[0] || !c[0].v) continue;
            
            let phraseStr = String(c[0].v).trim();
            if (phraseStr === '俳句' || phraseStr === '句' || phraseStr === '') continue;

            let cleanSeason = c[6] && c[6].v ? String(c[6].v).trim().toLowerCase() : '';
            if (cleanSeason === 'sinnen') cleanSeason = 'shinnen';
            if (cleanSeason === 'fuyu') cleanSeason = 'huyu';
            if (cleanSeason === 'season' || cleanSeason === '季節') continue;

            // I列に「手入力した季語」がある場合はそちらを優先、なければD列の「季語」を使用
            let customKigo = c[8] && c[8].v ? String(c[8].v).trim() : '';
            let rawKigo = c[3] && c[3].v ? String(c[3].v).trim() : '';
            let finalKigo = customKigo || rawKigo;

            freshDatabase.push({
                phrase: phraseStr,      
                author: c[1] && c[1].v ? String(c[1].v).trim() : '作者不詳',      
                authorKana: c[2] && c[2].v ? String(c[2].v).trim() : '',  
                kigo: finalKigo,        
                parentKigo: c[4] && c[4].v ? String(c[4].v).trim() : '',  
                kigoKana: c[5] && c[5].v ? String(c[5].v).trim() : '',    
                season: cleanSeason,                                      
                detailSeason: c[7] && c[7].v ? String(c[7].v).trim() : '',
                issueYear: c[9] && c[9].v ? String(c[9].v).trim() : '',  // J列: 発行年
                issueMonth: c[10] && c[10].v ? String(c[10].v).trim() : '', // K列: 発行月
                issueNumber: c[11] && c[11].v ? String(c[11].v).trim() : '' // L列: 号数
            });
        }

        if (freshDatabase.length > 0) {
            haikuDatabase = freshDatabase;
            localStorage.setItem('utena_haikuDatabase', JSON.stringify(haikuDatabase));

            hideLoadingOverlay();
            
            if (!isRoomOpen && navState.currentLayer === 'topPage' && currentRoomHaikus.length === 0) {
                launchOmikuji();
                createHaijinList();
            }
        } else if (haikuDatabase.length === 0) {
            const el = document.getElementById('loadingOverlay');
            if (el) el.innerText = 'データが空か、解析に失敗しました。';
        }
    } catch (error) {
        console.error(error);
        if (haikuDatabase.length === 0) {
            const el = document.getElementById('loadingOverlay');
            if (el) el.innerText = 'システムエラーが発生しました。';
        }
    }
}

// 🔤 ルビ（ふりがな）変換ヘルパー関数
function formatRubyText(text) {
    if (!text) return '';
    // 二重括弧《》 または 丸括弧（）を HTML の <ruby> タグに変換
    let formatted = text.replace(/([^《（(]+)[《（(]([^》）)]+)[》）)]/g, '<ruby>$1<rt>$2</rt></ruby>');
    return formatted;
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

function triggerInstantOmikuji() {
    launchOmikuji();
}

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
            if (navState.currentLayer === 'kigoListPage' || navState.currentLayer === 'roomPage') {
                html += ` <span class="separator">&lt;</span> <span class="link" onclick="showKigoList(getSeasonCode('${navState.seasonName}'), '${navState.seasonName}')">${navState.seasonName}</span>`;
            }
        }
        if (navState.currentLayer === 'roomPage') {
            const currentHaiku = currentRoomHaikus[currentIndex];
            let detailSuffix = (currentHaiku && currentHaiku.detailSeason) ? `（${currentHaiku.detailSeason}）` : '';
            html += ` <span class="separator">&lt;</span> <span class="current">${navState.kigoName}${detailSuffix}</span>`;
        }
    } else if (navState.category === 'utena_archive') {
        html += ` <span class="separator">&lt;</span> <span class="link" onclick="showIssueYearList()">デジタル臺誌</span>`;
        if (navState.issueYear) {
            if (navState.currentLayer === 'issueMonthPage' || navState.currentLayer === 'issueDetailPage' || navState.currentLayer === 'roomPage') {
                html += ` <span class="separator">&lt;</span> <span class="link" onclick="showIssueMonthList('${navState.issueYear}')">${navState.issueYear}年</span>`;
            }
        }
        if (navState.issueMonth) {
            let monthLabel = `${navState.issueMonth}月号`;
            if (navState.currentLayer === 'issueDetailPage' || navState.currentLayer === 'roomPage') {
                html += ` <span class="separator">&lt;</span> <span class="link" onclick="showIssueDetailPage('${navState.issueYear}', '${navState.issueMonth}')">${monthLabel}</span>`;
            }
        }
        if (navState.currentLayer === 'roomPage' && navState.authorName) {
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
        if (navState.category === 'saijiki' || navState.category === 'utena_archive') {
            catBtn.classList.remove('hidden');
        } else {
            catBtn.classList.add('hidden');
        }
    }

    updateBreadcrumb();
}

function navigateTo(pageId) { renderPage(pageId); }
function getSeasonNameJa(code) { const map = {'haru':'春', 'natsu':'夏', 'aki':'秋', 'huyu':'冬', 'shinnen':'新年', 'muki':'無季'}; return map[code] || code; }
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
    container.style.justifyContent = (uniqueAuthors.length > 5) ? 'flex-start' : 'center';
}

function jumpToAuthorRoom(author) {
    navState.authorName = author;
    openRoom('author', author, author);
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
        el.onclick = function() { navState.kigoName = kigo; openRoom('kigo', kigo, kigo); }; 
        container.appendChild(el);
    });
    container.style.justifyContent = (uniqueKigos.length > 8) ? 'flex-start' : 'center';
    renderPage('kigoListPage');
}

// 📚 デジタル臺誌：発行年選択画面
function showIssueYearList() {
    navState.category = 'utena_archive';
    navState.issueYear = '';
    navState.issueMonth = '';
    
    const container = document.getElementById('issueYearList');
    if (!container) return;
    container.innerHTML = '';

    let years = [...new Set(haikuDatabase.map(item => item.issueYear).filter(Boolean))];
    years.sort((a, b) => Number(b) - Number(a)); // 新しい年が先頭

    if (years.length === 0) {
        alert('デジタル臺誌のデータがまだ登録されていません。');
        return;
    }

    years.forEach(year => {
        const el = document.createElement('div');
        el.className = 'vertical-link';
        el.innerText = `${year}年`;
        el.onclick = function() { showIssueMonthList(year); };
        container.appendChild(el);
    });
    
    container.style.justifyContent = (years.length > 5) ? 'flex-start' : 'center';
    renderPage('issueYearPage');
}

// 📚 デジタル臺誌：発行月選択画面
function showIssueMonthList(year) {
    navState.category = 'utena_archive';
    navState.issueYear = year;
    navState.issueMonth = '';

    const container = document.getElementById('issueMonthList');
    if (!container) return;
    container.innerHTML = '';

    let issueHaikus = haikuDatabase.filter(item => item.issueYear === year);
    
    // 月ごとの号数を集計
    let monthMap = {};
    issueHaikus.forEach(item => {
        if (item.issueMonth && !monthMap[item.issueMonth]) {
            monthMap[item.issueMonth] = item.issueNumber || '';
        }
    });

    let months = Object.keys(monthMap).sort((a, b) => Number(b) - Number(a));

    months.forEach(month => {
        let issueNo = monthMap[month];
        let label = issueNo ? `${month}月号（第${issueNo}号）` : `${month}月号`;
        const el = document.createElement('div');
        el.className = 'vertical-link';
        el.innerText = label;
        el.onclick = function() { showIssueDetailPage(year, month); };
        container.appendChild(el);
    });

    container.style.justifyContent = (months.length > 5) ? 'flex-start' : 'center';
    renderPage('issueMonthPage');
}

// 📚 デジタル臺誌：号内選択画面（作品鑑賞 / 俳人一覧）
function showIssueDetailPage(year, month) {
    navState.category = 'utena_archive';
    navState.issueYear = year;
    navState.issueMonth = month;

    const container = document.getElementById('issueDetailContent');
    if (!container) return;
    container.innerHTML = '';

    let issueHaikus = haikuDatabase.filter(item => item.issueYear === year && item.issueMonth === month);

    // 1. 全作品シャッフル（おみ句じ風）鑑賞リンク
    const allBtn = document.createElement('div');
    allBtn.className = 'vertical-link';
    allBtn.style.fontWeight = 'bold';
    allBtn.innerText = '全作品おみ句じ';
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

    // 2. 俳人別選択リンク
    let authorMap = {};
    issueHaikus.forEach(item => {
        if (!authorMap[item.author]) authorMap[item.author] = item.authorKana || item.author;
    });
    let uniqueAuthors = Object.keys(authorMap);
    uniqueAuthors.sort((a, b) => authorMap[a].localeCompare(authorMap[b], 'ja'));

    uniqueAuthors.forEach(author => {
        const el = document.createElement('div');
        el.className = 'vertical-link';
        el.innerText = author;
        el.onclick = function() {
            navState.authorName = author;
            currentDisplayType = 'issue_author';
            currentRoomHaikus = issueHaikus.filter(item => item.author === author);
            currentIndex = 0;
            renderPage('roomPage');
            updateHaikuDisplay();
        };
        container.appendChild(el);
    });

    container.style.justifyContent = (uniqueAuthors.length > 5) ? 'flex-start' : 'center';
    renderPage('issueDetailPage');
}

function openRoom(type, targetValue, displayName) {
    currentDisplayType = type; 
    if (type === 'author') { navState.category = 'haijin'; navState.isDetarame = false; currentRoomHaikus = haikuDatabase.filter(item => item.author === targetValue); shuffleArray(currentRoomHaikus); }
    else if (type === 'haiku_season') { navState.category = 'haiku'; navState.seasonName = displayName; navState.isDetarame = false; currentRoomHaikus = haikuDatabase.filter(item => item.season === targetValue); shuffleArray(currentRoomHaikus); }
    else if (type === 'kigo') { navState.category = 'saijiki'; navState.isDetarame = false; currentRoomHaikus = haikuDatabase.filter(item => (item.parentKigo === targetValue || item.kigo === targetValue)); shuffleArray(currentRoomHaikus); }
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

    let kigoStr = '';
    if (currentHaiku.season === 'muki') {
        kigoStr = '無季';
    } else {
        let pKigo = currentHaiku.parentKigo || currentHaiku.kigo;
        let dSeason = currentHaiku.detailSeason ? `（${currentHaiku.detailSeason}）` : '';
        kigoStr = pKigo + dSeason;
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
    if (phraseEl) {
        // 自動ルビ変換を適用して HTML としてセット
        phraseEl.innerHTML = formatRubyText(currentHaiku.phrase);
    }

    let kigoString = '';
    if (currentHaiku.season === 'muki') {
        kigoString = '無季';
    } else {
        let pKigo = currentHaiku.parentKigo || currentHaiku.kigo;
        let dSeason = currentHaiku.detailSeason ? `（${currentHaiku.detailSeason}）` : '';
        kigoString = pKigo + dSeason;
    }

    const infoTrigger = document.getElementById('infoTrigger');
    const mainTag = document.getElementById('roomMainTag');

    if (navState.category === 'omikuji_all') {
        infoRevealed = false; 
        if (mainTag) mainTag.innerText = ''; 
        if (infoTrigger) infoTrigger.style.display = 'inline-block';
    } 
    else if (navState.category === 'haijin') {
        if (infoTrigger) infoTrigger.style.display = 'none'; 
        if (mainTag) {
            mainTag.className = 'info-upper-tag';
            mainTag.innerText = kigoString;
        }
    }
    else if (navState.category === 'utena_archive') {
        if (infoTrigger) infoTrigger.style.display = 'none'; 
        if (mainTag) {
            mainTag.className = 'info-upper-tag';
            if (currentDisplayType === 'issue_all') {
                mainTag.innerHTML = `<div class="info-kigo-sub">${kigoString}</div><div>${currentHaiku.author}</div>`;
            } else {
                mainTag.innerText = kigoString;
            }
        }
    }
    else {
        if (infoTrigger) infoTrigger.style.display = 'none'; 
        if (mainTag) {
            mainTag.className = 'info-upper-tag';
            mainTag.innerText = currentHaiku.author;
        }
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
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX > 0) {
                changeHaiku(1);
            } else {
                changeHaiku(-1);
            }
        }
    }, { passive: true });
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'o' || event.key === 'O') {
        triggerInstantOmikuji();
        return;
    }

    if (!isRoomOpen) return;
    if (event.key === 'ArrowLeft') changeHaiku(1); 
    if (event.key === 'ArrowRight') changeHaiku(-1); 
    if (event.key === 'i' || event.key === 'I') { if (navState.category === 'omikuji_all' && !infoRevealed) revealHiddenInfo(); }
});
