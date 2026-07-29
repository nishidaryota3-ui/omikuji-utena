// ① 「うてな」自身のスプレッドシートID（1枚目「俳句集成」・鑑賞用）
const SPREADSHEET_ID = '1iyBgs4Blf7gW1xIZfbxdWQJVg9OHVUU65IgJ7OjVf90';

// ② 共通の「歳時記データベース」専用スプレッドシートID（独立マスターを参照）
const SAIJIKI_SPREADSHEET_ID = '1EOmZn53hFA8GpVdcn--aU-lj9uHjGQpnSZ1o9jbnsYs';

let haikuDatabase = [];    // 俳句集成データ
let saijikiDatabase = [];  // 歳時記データベース（解説・子季語含む）
let currentRoomHaikus = [];
let currentHaikuIndex = 0;
let currentSeasonCode = '';
let currentParentKigo = '';

window.onload = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // 最初はトップページを表示
    navigateTo('topPage');

    // キャッシュから先行復元
    restoreCachedMasterData();

    // データの並行取得
    fetchHaikuMasterData();
    fetchSaijikiMasterData();
};

function restoreCachedMasterData() {
    try {
        const cachedHaiku = localStorage.getItem('utena_haiku_db');
        const cachedSaijiki = localStorage.getItem('utena_saijiki_db_view');

        if (cachedHaiku) haikuDatabase = JSON.parse(cachedHaiku);
        if (cachedSaijiki) saijikiDatabase = JSON.parse(cachedSaijiki);

        if (haikuDatabase.length > 0) {
            hideLoading();
            renderHaijinList();
        }
    } catch (e) {
        console.error('キャッシュ復元エラー', e);
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

/* 1枚目「俳句集成」から作品データを取得 */
function fetchHaikuMasterData() {
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent('俳句集成')}&tqx=responseHandler:haikuDataReceived`;
    document.body.appendChild(script);
}

window.haikuDataReceived = function(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        const rows = data.table.rows;
        let list = [];

        for (let i = 1; i < rows.length; i++) {
            const c = rows[i].c;
            if (!c) continue;

            const getVal = (idx) => (c[idx] && c[idx].v !== null) ? String(c[idx].v).trim() : '';

            const phrase = getVal(0);
            if (!phrase) continue;

            list.push({
                phrase: phrase,
                author: getVal(1),
                authorKana: getVal(2),
                kigo: getVal(3),
                parentKigo: getVal(4),
                parentKana: getVal(5),
                season: parseSeasonCode(getVal(6)),
                detailSeason: getVal(7),
                issueYear: getVal(8),
                issueMonth: getVal(9),
                issueDetail: getVal(10)
            });
        }

        haikuDatabase = list;
        localStorage.setItem('utena_haiku_db', JSON.stringify(haikuDatabase));
        hideLoading();
        renderHaijinList();
    } catch (e) {
        console.error('俳句マスター解析エラー', e);
    }
};

/* 🌐 独立した「歳時記データベース」から季語・解説データを取得 */
function fetchSaijikiMasterData() {
    const sheetName = encodeURIComponent('歳時記データベース');
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SAIJIKI_SPREADSHEET_ID}/gviz/tq?sheet=${sheetName}&range=A:F&tqx=responseHandler:saijikiDataReceived`;
    document.body.appendChild(script);
}

window.saijikiDataReceived = function(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        const rows = data.table.rows;
        let map = {};

        for (let i = 0; i < rows.length; i++) {
            const c = rows[i].c;
            if (!c) continue;

            const getVal = (idx) => (c[idx] && c[idx].v !== null) ? String(c[idx].v).trim() : '';

            const season = parseSeasonCode(getVal(0));
            const detailSeason = getVal(1);
            const parentKigo = getVal(2);
            const parentKana = getVal(3);
            const childKigo = getVal(4);
            const desc = getVal(5); // F列: 解説データ

            if (!parentKigo || parentKigo === '親季語') continue;

            if (!map[parentKigo]) {
                map[parentKigo] = {
                    parentKigo: parentKigo,
                    parentKana: parentKana,
                    season: season,
                    detailSeason: detailSeason,
                    desc: desc || '',
                    children: []
                };
            }

            if (desc && !map[parentKigo].desc) {
                map[parentKigo].desc = desc;
            }

            if (childKigo && childKigo !== '子季語' && childKigo !== parentKigo) {
                if (!map[parentKigo].children.includes(childKigo)) {
                    map[parentKigo].children.push(childKigo);
                }
            }
        }

        saijikiDatabase = Object.values(map);
        localStorage.setItem('utena_saijiki_db_view', JSON.stringify(saijikiDatabase));
    } catch (e) {
        console.error('歳時記マスター解析エラー', e);
    }
};

function parseSeasonCode(str) {
    if (!str) return 'haru';
    const s = str.toLowerCase().trim();
    if (s.includes('haru') || s === '春') return 'haru';
    if (s.includes('natsu') || s === '夏') return 'natsu';
    if (s.includes('aki') || s === '秋') return 'aki';
    if (s.includes('fuyu') || s.includes('huyu') || s === '冬') return 'huyu';
    if (s.includes('shinnen') || s.includes('sinnen') || s === '新年') return 'shinnen';
    if (s.includes('muki') || s === '無季') return 'muki';
    return 'haru';
}

function getSeasonNameJa(code) {
    const map = {'haru':'春', 'natsu':'夏', 'aki':'秋', 'huyu':'冬', 'shinnen':'新年', 'muki':'無季'};
    return map[code] || code;
}

/* 🧭 画面切り替え（デザインを保護する究極版） */
function navigateTo(pageId) {
    // 1. まず全ページを「表示しない」状態にする（インラインで none を指定）
    document.querySelectorAll('.layer-page').forEach(el => {
        el.style.display = 'none';
    });

    // 2. 開きたい対象ページだけ「表示しない」を解除し、元のCSS（flex等）を活かして表示する
    const target = document.getElementById(pageId);
    if (target) {
        target.style.display = ''; 
    }

    // 3. ヘッダーパンくず更新
    if (pageId === 'topPage') {
        updateHeader('', '');
    } else if (pageId === 'haijinPage') {
        updateHeader('おみ句じ < 俳人', '');
    } else if (pageId === 'haikuPage') {
        updateHeader('おみ句じ < 季節', '');
    } else if (pageId === 'saijikiPage') {
        updateHeader('季寄せ', '');
    }

    // 4. 猫ボタンの表示制御
    const catBtn = document.getElementById('fixedCatBtn');
    if (catBtn) {
        if (pageId === 'topPage') {
            catBtn.classList.remove('hidden');
        } else {
            catBtn.classList.add('hidden');
        }
    }
}

/* 👤 俳人一覧レンダリング */
function renderHaijinList() {
    const container = document.getElementById('haijinList');
    if (!container) return;

    let authorMap = {};
    haikuDatabase.forEach(h => {
        if (h.author && h.author !== '作者不詳') {
            if (!authorMap[h.author]) authorMap[h.author] = h.authorKana || h.author;
        }
    });

    let authors = Object.keys(authorMap).map(name => ({ name: name, kana: authorMap[name] }));
    authors.sort((a, b) => a.kana.localeCompare(b.kana, 'ja'));

    container.innerHTML = '';
    authors.forEach(item => {
        const div = document.createElement('div');
        div.className = 'vertical-link';
        div.innerText = item.name;
        div.onclick = () => openRoom('author', item.name, item.name);
        container.appendChild(div);
    });
}

/* 🌸 季寄せ：季節ごとの親季語一覧を表示 */
function showKigoList(seasonCode, seasonName) {
    currentSeasonCode = seasonCode;
    const container = document.getElementById('kigoList');
    if (!container) return;

    const existParentKigoSet = new Set(
        haikuDatabase
            .filter(h => h.season === seasonCode && h.parentKigo)
            .map(h => h.parentKigo)
    );

    let parentKigos = Array.from(existParentKigoSet);
    parentKigos.sort((a, b) => a.localeCompare(b, 'ja'));

    container.innerHTML = '';
    if (parentKigos.length === 0) {
        container.innerHTML = '<div class="vertical-link" style="cursor:default;">作品データなし</div>';
    } else {
        parentKigos.forEach(pk => {
            const item = document.createElement('div');
            item.className = 'vertical-link';
            item.innerText = pk;
            item.onclick = () => openSaijikiListRoom(pk);
            container.appendChild(item);
        });
    }

    updateHeader(`季寄せ < ${seasonName}`, '');
    navigateTo('kigoListPage');
}

/* 📜 季寄せ作品一覧画面（横スクロール鑑賞） */
function openSaijikiListRoom(parentKigo) {
    currentParentKigo = parentKigo;
    const container = document.getElementById('saijikiHaikuList');
    if (!container) return;

    const matchedHaikus = haikuDatabase.filter(h => h.parentKigo === parentKigo);

    container.innerHTML = '';

    const cardEl = createKigoCardElement(parentKigo);
    container.appendChild(cardEl);

    matchedHaikus.forEach(h => {
        const card = document.createElement('div');
        card.className = 'haiku-card-item';
        card.innerHTML = `
            <div class="phrase">${h.phrase}</div>
            <div class="author">${h.author || ''}</div>
        `;
        container.appendChild(card);
    });

    const seasonJa = getSeasonNameJa(currentSeasonCode);
    updateHeader(`季寄せ < ${seasonJa} < ${parentKigo}`, `${matchedHaikus.length}句`);
    navigateTo('saijikiListRoomPage');
}

/* 季語カードエレメント生成 */
function createKigoCardElement(parentKigo) {
    const wrapper = document.createElement('div');
    wrapper.className = 'kigo-card-item';

    const info = saijikiDatabase.find(s => s.parentKigo === parentKigo);

    const pkText = parentKigo;
    const childrenText = (info && info.children && info.children.length > 0) 
        ? info.children.join('・') 
        : '';
    const descText = (info && info.desc) ? info.desc : '解説データ準備中';

    wrapper.innerHTML = `
        <div class="card-column parent-kigo-col">${pkText}</div>
        <div class="card-column child-kigo-col">${childrenText}</div>
        <div class="card-column desc-kigo-col">${descText}</div>
    `;

    wrapper.onclick = () => openKigoCardModal(parentKigo);
    return wrapper;
}

/* 🔍 季語検索ハンドラー */
function handleKigoSearch() {
    const input = document.getElementById('kigoSearchInput').value.trim();
    const resultsEl = document.getElementById('searchResults');
    if (!resultsEl) return;

    if (!input) {
        resultsEl.innerHTML = '';
        resultsEl.classList.add('hidden');
        return;
    }

    let hits = saijikiDatabase.filter(s => 
        s.parentKigo.includes(input) || 
        (s.children && s.children.some(c => c.includes(input)))
    );

    if (hits.length === 0) {
        resultsEl.innerHTML = '<div class="search-item">該当する季語がありません</div>';
    } else {
        resultsEl.innerHTML = '';
        hits.slice(0, 10).forEach(hit => {
            const item = document.createElement('div');
            item.className = 'search-item';
            item.innerText = `${hit.parentKigo}（${getSeasonNameJa(hit.season)}）`;
            item.onclick = () => {
                resultsEl.classList.add('hidden');
                document.getElementById('kigoSearchInput').value = '';
                currentSeasonCode = hit.season;
                openSaijikiListRoom(hit.parentKigo);
            };
            resultsEl.appendChild(item);
        });
    }
    resultsEl.classList.remove('hidden');
}

/* ポップアップ表示 */
function openKigoCardModal(parentKigo) {
    const info = saijikiDatabase.find(s => s.parentKigo === parentKigo);
    const overlay = document.getElementById('kigoCardOverlay');
    if (!overlay) return;

    document.getElementById('cardParentKigo').innerText = parentKigo;
    document.getElementById('cardChildKigo').innerText = (info && info.children) ? info.children.join('・') : '';
    document.getElementById('cardDesc').innerText = (info && info.desc) ? info.desc : '解説データ準備中';

    overlay.classList.remove('hidden');
}

function closeKigoCard() {
    const overlay = document.getElementById('kigoCardOverlay');
    if (overlay) overlay.classList.add('hidden');
}

/* 📰 うてな俳句（発行年・月一覧） */
function showIssueYearList() {
    const container = document.getElementById('issueYearList');
    if (!container) return;

    let yearsSet = new Set(haikuDatabase.map(h => h.issueYear).filter(Boolean));
    let years = Array.from(yearsSet).sort();

    container.innerHTML = '';
    if (years.length === 0) {
        container.innerHTML = '<div class="vertical-link" style="cursor:default;">データなし</div>';
    } else {
        years.forEach(y => {
            const div = document.createElement('div');
            div.className = 'vertical-link';
            div.innerText = `${y}年`;
            div.onclick = () => showIssueMonthList(y);
            container.appendChild(div);
        });
    }

    updateHeader('うてな俳句 < 年選択', '');
    navigateTo('issueYearPage');
}

function showIssueMonthList(year) {
    const container = document.getElementById('issueMonthList');
    if (!container) return;

    let monthsSet = new Set(
        haikuDatabase
            .filter(h => h.issueYear === year)
            .map(h => h.issueMonth)
            .filter(Boolean)
    );
    let months = Array.from(monthsSet).sort((a, b) => parseInt(a) - parseInt(b));

    container.innerHTML = '';
    months.forEach(m => {
        const div = document.createElement('div');
        div.className = 'vertical-link';
        div.innerText = `${m}月号`;
        div.onclick = () => openRoom('issue', `${year}_${m}`, `${year}年${m}月号`);
        container.appendChild(div);
    });

    updateHeader(`うてな俳句 < ${year}年`, '');
    navigateTo('issueMonthPage');
}

/* 🎲 おみ句じ・部屋移動（一画面鑑賞） */
function openRoom(type, filterVal, titleText) {
    if (type === 'detarame') {
        currentRoomHaikus = [...haikuDatabase];
    } else if (type === 'haiku_season') {
        currentRoomHaikus = haikuDatabase.filter(h => h.season === filterVal);
    } else if (type === 'kigo_muki') {
        currentRoomHaikus = haikuDatabase.filter(h => h.season === 'muki');
    } else if (type === 'author') {
        currentRoomHaikus = haikuDatabase.filter(h => h.author === filterVal);
    } else if (type === 'issue') {
        const [y, m] = filterVal.split('_');
        currentRoomHaikus = haikuDatabase.filter(h => h.issueYear === y && h.issueMonth === m);
    }

    if (currentRoomHaikus.length === 0) {
        alert('該当する俳句がありません。');
        return;
    }

    if (type === 'detarame' || type === 'haiku_season') {
        currentRoomHaikus.sort(() => Math.random() - 0.5);
    }
    
    currentHaikuIndex = 0;

    displayCurrentHaiku();
    updateHeader(`うてな俳句 < ${titleText}`, `${currentRoomHaikus.length}句`);
    navigateTo('roomPage');
}

function displayCurrentHaiku() {
    if (currentRoomHaikus.length === 0) return;
    const item = currentRoomHaikus[currentHaikuIndex];
    document.getElementById('haikuPhrase').innerText = item.phrase;
    document.getElementById('roomMainTag').innerText = item.author || '';
}

function changeHaiku(dir) {
    currentHaikuIndex += dir;
    if (currentHaikuIndex < 0) currentHaikuIndex = currentRoomHaikus.length - 1;
    if (currentHaikuIndex >= currentRoomHaikus.length) currentHaikuIndex = 0;
    displayCurrentHaiku();
}

function triggerInstantOmikuji() {
    openRoom('detarame', 'all', 'いっしょくた');
}

function updateHeader(breadcrumbText, rightTagText) {
    const bc = document.getElementById('globalBreadcrumb');
    if (bc) {
        bc.innerText = breadcrumbText;
        bc.style.display = breadcrumbText ? 'block' : 'none';
    }
    const tag = document.getElementById('roomMainTag');
    if (tag) tag.innerText = rightTagText;
}

function revealHiddenInfo() {
    alert('うてな俳句会 データベース連携版');
}
