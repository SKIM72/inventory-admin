// Supabase 클라이언트 설정
const { createClient } = supabase;
const supabaseClient = createClient('https://qjftovamkqhxaenueood.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZnRvdmFta3FoeGFlbnVlb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMzQxMTgsImV4cCI6MjA2NzYxMDExOH0.qpMLaPEkMEmXeRg7193JqjFyUdntIxq3Q3kARUqGS18');

// 로그인 및 관리자 권한 확인
(async () => {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session || session.user.user_metadata.is_approved !== true) {
        await supabaseClient.auth.signOut();
        alert('로그인이 필요하거나, 승인되지 않은 계정입니다.');
        window.location.href = 'login.html';
        return;
    }
    const user = session.user;
    const userEmailDisplay = document.getElementById('current-user-email');
    if (userEmailDisplay) { userEmailDisplay.textContent = user.email; }
    const userManagementNav = document.getElementById('nav-users');
    if (user.email !== 'eowert72@gmail.com') {
        if(userManagementNav) userManagementNav.style.display = 'none';
    }
    
    await populateChannelSwitcher();
    showHomepage();
})();


const contentArea = document.getElementById('content-area');
const navButtons = document.querySelectorAll('nav button');
const channelSwitcher = document.getElementById('channel-switcher');
const logoutButton = document.getElementById('logout-button');

let currentSort = {};
let currentFilters = {};
let currentChannelId = localStorage.getItem('selectedAdminChannelId');


async function showHomepage() {
    navButtons.forEach(btn => btn.classList.remove('active'));

    if (channelSwitcher.options.length === 0) {
        contentArea.innerHTML = `
            <div id="home-section" class="content-section active">
                <div class="card">
                    <div class="card-body" style="text-align: center; padding: 3rem; font-size: 1.1rem; line-height: 1.8;">
                        <p>생성되어 있는 채널이 없습니다.</p>
                        <p>상단 메뉴의 <strong>[채널 관리]</strong> 탭을 클릭하여 채널을 추가해 주세요.</p>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    const selectedChannelName = channelSwitcher.options[channelSwitcher.selectedIndex]?.text || '선택된 채널';

    contentArea.innerHTML = `
        <div id="home-section">
            <h2>'${selectedChannelName}' 채널 실사 요약</h2>
            <div id="global-summary-container" class="card" style="padding: 2rem; font-size: 1.2rem; display: flex; justify-content: space-around;">
                <p>요약 정보를 불러오는 중...</p>
            </div>
            <div class="card" style="margin-top: 1.5rem; padding: 1.5rem; height: 40vh;">
                <canvas id="inventory-summary-chart"></canvas>
            </div>
        </div>
    `;
    const summaryContainer = document.getElementById('global-summary-container');

    const query = supabaseClient
        .from('inventory_scans')
        .select('expected_quantity, quantity')
        .eq('channel_id', currentChannelId)
        .is('deleted_at', null);
        
    const { data, error } = await fetchAllWithPagination(query);

    if (error) {
        summaryContainer.innerHTML = `<p style="color:red;">현황 데이터를 불러오는 데 실패했습니다: ${error.message}</p>`;
        return;
    }

    const totals = data.reduce((acc, item) => {
        acc.expected += item.expected_quantity || 0;
        acc.actual += item.quantity || 0;
        return acc;
    }, { expected: 0, actual: 0 });

    const progress = totals.expected > 0 ? (totals.actual / totals.expected) * 100 : 0;

    summaryContainer.innerHTML = `
        <span><strong>총 전산수량:</strong> ${totals.expected.toLocaleString()}</span>
        <span><strong>총 실사수량:</strong> ${totals.actual.toLocaleString()}</span>
        <span><strong>진척도:</strong> ${progress.toFixed(2)}%</span>
    `;

    // --- 차트 생성 로직 ---
    const remaining = totals.expected - totals.actual;
    const chartCanvas = document.getElementById('inventory-summary-chart');

    const existingChart = Chart.getChart(chartCanvas);
    if (existingChart) {
        existingChart.destroy();
    }

    new Chart(chartCanvas, {
        type: 'doughnut',
        data: {
            labels: ['실사 완료 수량', '미실사 수량'],
            datasets: [{
                label: '수량',
                data: [totals.actual, remaining > 0 ? remaining : 0],
                backgroundColor: [
                    '#007bff',
                    '#e9ecef'
                ],
                borderColor: [
                    '#007bff',
                    '#e9ecef'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                title: {
                    display: true,
                    text: '실사 진행 현황',
                    font: {
                        size: 16
                    }
                }
            },
            cutout: '60%'
        }
    });
}

async function updateGlobalProgress() {
    const progressContainer = document.querySelector('#admin-progress-container');
    if (!progressContainer) return;

    const query = supabaseClient
        .from('inventory_scans')
        .select('expected_quantity, quantity')
        .eq('channel_id', currentChannelId)
        .is('deleted_at', null);

    const { data, error } = await fetchAllWithPagination(query);
    
    if (error) {
        console.error('진행도 데이터를 불러오는 데 실패했습니다:', error);
        return;
    }

    const totals = data.reduce((acc, item) => {
        acc.expected += item.expected_quantity || 0;
        acc.actual += item.quantity || 0;
        return acc;
    }, { expected: 0, actual: 0 });
    
    progressContainer.innerHTML = data.length > 0
        ? `<b>총 전산수량:</b> ${totals.expected.toLocaleString()} | <b>총 실사수량:</b> ${totals.actual.toLocaleString()} | <b>진척도:</b> ${totals.expected > 0 ? (totals.actual / totals.expected * 100).toFixed(2) : 0}%`
        : '';
}


async function fetchAllWithPagination(queryBuilder) {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await queryBuilder.range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) { console.error("데이터 조회 중 오류 발생:", error); return { data: allData, error }; }
        if (data && data.length > 0) allData = allData.concat(data);
        if (!data || data.length < pageSize) break;
        page++;
    }
    return { data: allData, error: null };
}

function refreshCurrentView() {
    const activeNav = document.querySelector('nav button.active');
    if (!activeNav) {
        showHomepage();
        return;
    }
    switch (activeNav.id) {
        case 'nav-inventory': showInventoryStatus(); break;
        case 'nav-products': showProductMaster(); break;
        case 'nav-locations': showLocationMaster(); break;
        case 'nav-channels': showChannelMaster(); break;
        case 'nav-users': showUserManagement(); break;
    }
}

async function populateChannelSwitcher() {
    const { data, error } = await supabaseClient.from('channels').select('*').order('id');
    if (error) {
        alert('채널 목록을 불러오는 데 실패했습니다.');
        return;
    }

    channelSwitcher.innerHTML = '';
    data.forEach(channel => {
        const option = document.createElement('option');
        option.value = channel.id;
        option.textContent = channel.name;
        channelSwitcher.appendChild(option);
    });

    if (currentChannelId && data.some(c => c.id == currentChannelId)) {
        channelSwitcher.value = currentChannelId;
    } else if (data.length > 0) {
        currentChannelId = data[0].id;
        localStorage.setItem('selectedAdminChannelId', currentChannelId);
        channelSwitcher.value = currentChannelId;
    }
}


async function showInventoryStatus() {
    contentArea.innerHTML = `
    <div id="inventory-section" class="content-section active">
        <div class="sticky-controls">
            <div class="page-header">
                <h2>실사 현황</h2>
                <div class="actions-group">
                    <button class="refresh-view-button btn-secondary">새로고침</button>
                    <button class="download-excel btn-primary">엑셀 다운로드</button>
                </div>
            </div>
            <div class="control-grid">
                <div class="card">
                    <div class="card-header">필터 및 검색</div>
                    <div class="card-body">
                        <input type="text" id="filter-location" class="filter-input" placeholder="로케이션 검색..." value="${currentFilters.location_code || ''}">
                        <input type="text" id="filter-barcode" class="filter-input" placeholder="바코드/상품코드 검색..." value="${currentFilters.barcode || ''}">
                        <button class="search-button btn-primary">검색</button>
                        <button class="reset-button btn-secondary">초기화</button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">데이터 관리</div>
                    <div class="card-body">
                        <button class="delete-selected btn-danger">선택 삭제</button>
                    </div>
                </div>
                 <div class="card danger-zone">
                    <div class="card-header">⚠️ 전체 초기화 (주의)</div>
                    <div class="card-body" style="flex-direction: column; align-items: stretch;">
                        <div>
                            <strong>표준 양식</strong>
                            <div style="display: flex; gap: 0.75rem; align-items: center; margin-top: 0.5rem;">
                               <button id="reset-template-download" class="btn-secondary">양식 다운로드</button>
                               <input type="file" id="reset-upload-file" accept=".xlsx, .xls" style="flex-grow: 1;">
                               <button id="reset-upload-button" class="btn-danger">초기화 및 업로드</button>
                            </div>
                        </div>
                        <hr style="width: 100%; margin: 1rem 0; border-top: 1px solid var(--border-color); border-bottom: 0;">
                        <div>
                            <strong>CORN 양식</strong>
                            <div style="display: flex; gap: 0.75rem; align-items: center; margin-top: 0.5rem;" title="CORN 재고 > 재고 조회 > 재고 현황 로케이션/상품별/LOT별 메뉴에서 엑셀다운">
                                <input type="file" id="corn-reset-upload-file" accept=".xlsx, .xls" style="flex-grow: 1;">
                                <button id="corn-reset-upload-button" class="btn-danger">CORN 양식으로 초기화</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="admin-progress-container" style="padding-top: 1rem;"></div>
        </div>
        <div class="table-wrapper"><div class="table-container">불러오는 중...</div></div>
    </div>`;

    const tableContainer = contentArea.querySelector('.table-container');
    let query = supabaseClient.from('inventory_scans').select(`id, created_at, location_code, barcode, quantity, expected_quantity, products(product_code, product_name)`).eq('channel_id', currentChannelId).is('deleted_at', null);
    if (currentFilters.location_code) query = query.ilike('location_code', `%${currentFilters.location_code}%`);
    if (currentFilters.barcode) query.or(`barcode.ilike.%${currentFilters.barcode}%,products.product_code.ilike.%${currentFilters.barcode}%`, { foreignTable: 'products' });
    
    // '차이' 열로 정렬하는 경우 DB 정렬을 건너뜁니다.
    if (currentSort.column && currentSort.column !== 'difference') {
        const sortColumn = currentSort.column.includes('.') ? currentSort.column.split('.')[1] : currentSort.column;
        const foreignTable = currentSort.column.includes('.') ? currentSort.column.split('.')[0] : undefined;
        query = query.order(sortColumn, { ascending: currentSort.direction === 'asc', foreignTable: foreignTable });
    }
    
    const { data, error } = await fetchAllWithPagination(query);
    if (error) { tableContainer.innerHTML = `<p class="no-data-message">데이터를 불러오는 데 실패했습니다: ${error.message}</p>`; return; }
    
    // '차이' 열로 정렬하는 경우 클라이언트 측에서 정렬을 수행합니다.
    if (currentSort.column === 'difference') {
        data.sort((a, b) => {
            const diffA = (a.quantity || 0) - (a.expected_quantity || 0);
            const diffB = (b.quantity || 0) - (b.expected_quantity || 0);
            return currentSort.direction === 'asc' ? diffA - diffB : diffB - diffA;
        });
    }
    
    updateGlobalProgress();

    if (data.length === 0) {
        tableContainer.innerHTML = `<p class="no-data-message">표시할 데이터가 없습니다.</p>`;
    } else {
        let tableHTML = `<table><thead><tr><th><input type="checkbox" class="select-all-checkbox"></th><th>No.</th><th class="sortable" data-column="location_code">로케이션</th><th class="sortable" data-column="products.product_code">상품코드</th><th class="sortable" data-column="barcode">바코드</th><th class="sortable" data-column="products.product_name">상품명</th><th class="sortable" data-column="expected_quantity">전산수량</th><th class="sortable" data-column="quantity">실사수량</th><th class="sortable" data-column="difference">차이</th><th class="sortable" data-column="created_at">마지막 스캔</th></tr></thead><tbody>`;
        data.forEach((item, index) => {
            const expected = item.expected_quantity || 0, actual = item.quantity || 0, diff = actual - expected;
            tableHTML += `<tr>
                <td><input type="checkbox" class="row-checkbox" data-id="${item.id}"></td>
                <td>${index + 1}</td>
                <td>${item.location_code}</td>
                <td>${item.products ? item.products.product_code : 'N/A'}</td>
                <td>${item.barcode}</td>
                <td>${item.products ? item.products.product_name : 'N/A'}</td>
                <td>${expected}</td>
                <td class="editable-quantity" data-scan-id="${item.id}">${actual}</td>
                <td>${diff}</td>
                <td class="scan-time">${new Date(item.created_at).toLocaleString()}</td>
            </tr>`;
        });
        tableHTML += '</tbody></table>';
        tableContainer.innerHTML = tableHTML;
    }
    updateSortIndicator();
}

async function showProductMaster() {
    contentArea.innerHTML = `<div id="products-section" class="content-section active"><div class="sticky-controls"><div class="page-header"><h2>상품 마스터 관리</h2><div class="actions-group"><button class="refresh-view-button btn-secondary">새로고침</button><button class="download-excel btn-primary">엑셀 다운로드</button></div></div><div class="control-grid">
    <div class="card"><div class="card-header">필터 및 검색</div><div class="card-body"><input type="text" id="filter-prod-code" class="filter-input" placeholder="상품코드 검색..." value="${currentFilters.product_code || ''}"><input type="text" id="filter-prod-barcode" class="filter-input" placeholder="바코드 검색..." value="${currentFilters.barcode || ''}"><input type="text" id="filter-prod-name" class="filter-input" placeholder="상품명 검색..." value="${currentFilters.product_name || ''}"><button class="search-button btn-primary">검색</button><button class="reset-button btn-secondary">초기화</button></div></div>
    <div class="card"><div class="card-header">데이터 관리 (표준 양식)</div><div class="card-body"><button class="download-template btn-secondary">양식 다운로드</button><input type="file" id="upload-file" class="upload-file" accept=".xlsx, .xls"><button class="upload-data btn-primary">업로드 실행</button><button class="delete-selected btn-danger">선택 삭제</button></div></div>
    <div class="card"><div class="card-header">CORN 양식 업로드</div><div class="card-body" title="CORN [기준정보 > 상품관리 > 상품정보조회] 에서 엑셀다운"><input type="file" id="upload-corn-file" class="upload-file" accept=".xlsx, .xls"><button id="upload-corn-button" class="btn-primary">업로드 실행</button></div></div>
    </div><div id="admin-progress-container"></div></div><div class="table-wrapper"><div class="table-container">불러오는 중...</div></div></div>`;
    
    const tableContainer = contentArea.querySelector('.table-container');
    let query = supabaseClient.from('products').select('*').eq('channel_id', currentChannelId);
    if (currentFilters.product_code) query = query.ilike('product_code', `%${currentFilters.product_code}%`);
    if (currentFilters.barcode) query = query.ilike('barcode', `%${currentFilters.barcode}%`);
    if (currentFilters.product_name) query = query.ilike('product_name', `%${currentFilters.product_name}%`);
    if (currentSort.column) {
        query = query.order(currentSort.column, { ascending: currentSort.direction === 'asc' });
    }
    
    const { data, error } = await fetchAllWithPagination(query);
    if (error) { tableContainer.innerHTML = `<p class="no-data-message">데이터를 불러오는 데 실패했습니다.</p>`; return; }
    
    if (data.length === 0) {
        tableContainer.innerHTML = `<p class="no-data-message">표시할 데이터가 없습니다.</p>`;
    } else {
        let tableHTML = `<table><thead><tr><th><input type="checkbox" class="select-all-checkbox"></th><th>No.</th><th class="sortable" data-column="product_code">상품코드</th><th class="sortable" data-column="barcode">바코드</th><th class="sortable" data-column="product_name">상품명</th></tr></thead><tbody>`;
        data.forEach((p, index) => {
            tableHTML += `<tr><td><input type="checkbox" class="row-checkbox" data-id="${p.barcode}"></td><td>${index + 1}</td><td>${p.product_code || ''}</td><td>${p.barcode}</td><td>${p.product_name}</td></tr>`;
        });
        tableHTML += '</tbody></table>';
        tableContainer.innerHTML = tableHTML;
    }
    updateSortIndicator();
}

async function showLocationMaster() {
    contentArea.innerHTML = `<div id="locations-section" class="content-section active"><div class="sticky-controls"><div class="page-header"><h2>로케이션 마스터 관리</h2><div class="actions-group"><button class="refresh-view-button btn-secondary">새로고침</button><button class="download-excel btn-primary">엑셀 다운로드</button></div></div><div class="control-grid">
    <div class="card"><div class="card-header">필터 및 검색</div><div class="card-body"><input type="text" id="filter-loc-code" class="filter-input" placeholder="로케이션 코드 검색..." value="${currentFilters.location_code || ''}"><button class="search-button btn-primary">검색</button><button class="reset-button btn-secondary">초기화</button></div></div>
    <div class="card"><div class="card-header">데이터 관리 (표준 양식)</div><div class="card-body"><button class="download-template btn-secondary">양식 다운로드</button><input type="file" id="upload-file" class="upload-file" accept=".xlsx, .xls"><button class="upload-data btn-primary">업로드 실행</button><button class="delete-selected btn-danger">선택 삭제</button></div></div>
    <div class="card"><div class="card-header">CORN 양식 업로드</div><div class="card-body" title="CORN [기준정보 > 물류센터관리 > 로케이션 관리 > 복수] 에서 엑셀다운"><input type="file" id="upload-corn-locations-file" class="upload-file" accept=".xlsx, .xls"><button id="upload-corn-locations-button" class="btn-primary">업로드 실행</button></div></div>
    </div><div id="admin-progress-container"></div></div><div class="table-wrapper"><div class="table-container">불러오는 중...</div></div></div>`;
    
    const tableContainer = contentArea.querySelector('.table-container');
    let query = supabaseClient.from('locations').select('*').eq('channel_id', currentChannelId);
    if (currentFilters.location_code) query = query.ilike('location_code', `%${currentFilters.location_code}%`);
    if (currentSort.column) {
        query = query.order(currentSort.column, { ascending: currentSort.direction === 'asc' });
    }
    
    const { data, error } = await fetchAllWithPagination(query);
    if (error) { tableContainer.innerHTML = `<p class="no-data-message">데이터를 불러오는 데 실패했습니다.</p>`; return; }

    if (data.length === 0) {
        tableContainer.innerHTML = `<p class="no-data-message">표시할 데이터가 없습니다.</p>`;
    } else {
        let tableHTML = `<table><thead><tr><th><input type="checkbox" class="select-all-checkbox"></th><th>No.</th><th class="sortable" data-column="location_code">로케이션 코드</th></tr></thead><tbody>`;
        data.forEach((loc, index) => {
            tableHTML += `<tr><td><input type="checkbox" class="row-checkbox" data-id="${loc.location_code}"></td><td>${index + 1}</td><td>${loc.location_code}</td></tr>`;
        });
        tableHTML += '</tbody></table>';
        tableContainer.innerHTML = tableHTML;
    }
    updateSortIndicator();
}

async function showChannelMaster() {
    contentArea.innerHTML = `
        <div id="channels-section" class="content-section active">
            <div class="page-header">
                <h2>채널 관리</h2>
                <div class="actions-group">
                    <button class="refresh-view-button btn-secondary">새로고침</button>
                </div>
            </div>
            <div class="channel-management-grid">
                <div class="card">
                    <div class="card-header">새 채널 추가</div>
                    <div class="card-body">
                        <input type="text" id="new-channel-name" placeholder="새 채널 이름 입력..." style="flex-grow: 1;">
                        <button id="add-channel-button" class="btn-primary">추가</button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">채널 목록</div>
                    <div id="channel-list-container" class="card-body" style="flex-direction: column; align-items: stretch; padding: 0;">
                        <p style="padding: 1.25rem;">불러오는 중...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const listContainer = document.getElementById('channel-list-container');
    const { data, error } = await supabaseClient.from('channels').select('*').order('id');
    
    if (error) { listContainer.innerHTML = `<p style="padding: 1.25rem;">채널 목록을 불러오는 데 실패했습니다.</p>`; return; }
    if (data.length === 0) { listContainer.innerHTML = `<p style="padding: 1.25rem;">생성된 채널이 없습니다.</p>`; return; }

    let listHTML = '<ul class="channel-list">';
    data.forEach(channel => {
        listHTML += `<li class="channel-list-item"><span class="channel-name">${channel.name} (ID: ${channel.id})</span><button class="delete-channel-button btn-danger" data-id="${channel.id}" data-name="${channel.name}">삭제</button></li>`;
    });
    listHTML += '</ul>';
    listContainer.innerHTML = listHTML;
}

async function showUserManagement() {
    contentArea.innerHTML = `
        <div id="users-section" class="content-section active">
            <div class="page-header">
                <h2>사용자 관리</h2>
                <div class="actions-group">
                    <button class="refresh-view-button btn-secondary">새로고침</button>
                </div>
            </div>
            <div class="card">
                <div class="card-header">사용자 목록</div>
                <div id="user-list-container" class="card-body" style="flex-direction: column; align-items: stretch; padding: 0;">
                    <p style="padding: 1.25rem;">사용자 목록을 불러오는 중...</p>
                </div>
            </div>
        </div>
    `;

    const listContainer = document.getElementById('user-list-container');
    const { data, error } = await supabaseClient.rpc('list_all_users');

    if (error) {
        listContainer.innerHTML = `<p style="padding: 1.25rem;">사용자 목록을 불러오는 데 실패했습니다.</p>`;
        return;
    }
    if (data.length === 0) {
        listContainer.innerHTML = `<p style="padding: 1.25rem;">가입한 사용자가 없습니다.</p>`;
        return;
    }

    let listHTML = '<ul class="user-list">';
    data.forEach(user => {
        const statusClass = user.is_approved ? 'status-approved' : 'status-pending';
        const statusText = user.is_approved ? '승인 완료' : '승인 대기';
        
        let actionButton = '';
        if (!user.is_approved) {
            actionButton = `<button class="approve-user-button btn-primary" data-id="${user.id}" data-email="${user.email}">승인</button>`;
        }

        listHTML += `<li class="user-list-item"><span class="user-info">${user.email}</span><div><span class="user-status ${statusClass}">${statusText}</span>${actionButton}</div></li>`;
    });
    listHTML += '</ul>';
    listContainer.innerHTML = listHTML;
}

function updateSortIndicator() {
    contentArea.querySelectorAll('th.sortable').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (icon) icon.remove();
        
        if (th.dataset.column === currentSort.column) {
            if (!currentSort.isDefault) {
                const iconSpan = document.createElement('span');
                iconSpan.className = 'sort-icon';
                iconSpan.textContent = currentSort.direction === 'asc' ? ' ▲' : ' ▼';
                th.appendChild(iconSpan);
            }
        }
    });
}

function downloadExcel(data, filename) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, filename);
}

function downloadTemplateExcel(headers, filename) {
    const worksheet = XLSX.utils.json_to_sheet([], { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, filename);
}

async function uploadData(tableName, onConflictColumn, file) {
    if (!file) { alert('업로드할 파일을 선택하세요.'); return; }
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            if(jsonData.length === 0){ alert('엑셀 파일에 데이터가 없습니다.'); return; }
            
            const dataToUpsert = jsonData.map(row => ({ ...row, channel_id: currentChannelId }));
            
            const { error } = await supabaseClient.from(tableName).upsert(dataToUpsert, { onConflict: onConflictColumn });
            if (error) { throw error; }
            alert('업로드 성공!');
            refreshCurrentView();
        } catch (error) {
            alert('업로드 실패: ' + error.message);
            console.error(error);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function uploadCornData(file) {
    if (!file) { alert('업로드할 파일을 선택하세요.'); return; }
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (rows.length < 3) {
                alert('업로드할 데이터가 없습니다.');
                return;
            }
            const dataRows = rows.slice(2);

            const formattedData = dataRows.map(row => {
                const product_code = row[2] ? String(row[2]).trim() : null;
                const product_name = row[3] ? String(row[3]).trim() : null;
                const barcode = row[10] ? String(row[10]).trim() : null;

                if (!product_name || (!product_code && !barcode)) {
                    return null;
                }

                return {
                    product_code: product_code || barcode,
                    barcode: barcode || product_code,
                    product_name: product_name,
                    channel_id: currentChannelId
                };
            }).filter(item => item !== null);

            if (formattedData.length === 0) {
                alert('추출할 유효한 데이터가 없습니다. C, D, K열을 확인해주세요.');
                return;
            }

            const { error } = await supabaseClient.from('products').upsert(formattedData, { onConflict: 'barcode, channel_id' });

            if (error) { throw error; }

            alert(`총 ${formattedData.length}개의 상품을 성공적으로 업로드했습니다.`);
            refreshCurrentView();

        } catch (error) {
            alert('CORN 양식 업로드 실패: ' + error.message);
            console.error(error);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function uploadCornLocations(file) {
    if (!file) { alert('업로드할 파일을 선택하세요.'); return; }
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (rows.length < 2) {
                alert('업로드할 데이터가 없습니다.');
                return;
            }
            const dataRows = rows.slice(1);

            const locationCodes = dataRows.map(row => (row[2] ? String(row[2]).trim() : null)).filter(code => code);

            if (locationCodes.length === 0) {
                alert('추출할 유효한 로케이션 데이터가 없습니다. C열을 확인해주세요.');
                return;
            }
            
            const uniqueLocationCodesInFile = [...new Set(locationCodes)];

            const formattedData = uniqueLocationCodesInFile.map(code => ({
                location_code: code,
                channel_id: currentChannelId
            }));

            const { error } = await supabaseClient
                .from('locations')
                .upsert(formattedData, { onConflict: 'location_code, channel_id' });

            if (error) { throw error; }

            alert(`총 ${formattedData.length}개의 로케이션을 성공적으로 처리했습니다.`);
            refreshCurrentView();

        } catch (error) {
            alert('CORN 로케이션 양식 업로드 실패: ' + error.message);
            console.error(error);
        }
    };
    reader.readAsArrayBuffer(file);
}


async function handleResetAndUpload(file) {
    if (!file) { alert('업로드할 파일을 선택하세요.'); return; }
    if (!confirm(`현재 채널 [${channelSwitcher.options[channelSwitcher.selectedIndex].text}]의 모든 실사 현황 데이터를 영구적으로 삭제합니다. 계속하시겠습니까?`)) return;
    if (!confirm("정말로 모든 데이터를 삭제하고 새로 업로드하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;

    try {
        const { error: deleteError } = await supabaseClient
            .from('inventory_scans')
            .update({ deleted_at: new Date().toISOString() })
            .eq('channel_id', currentChannelId)
            .is('deleted_at', null);
            
        if (deleteError) throw new Error('데이터 삭제 중 오류 발생: ' + deleteError.message);
        
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                if(jsonData.length === 0){ alert('엑셀 파일에 데이터가 없습니다.'); return; }
                
                const dataToInsert = jsonData.map(row => ({
                    location_code: row.location_code,
                    barcode: row.barcode,
                    expected_quantity: row.expected_quantity,
                    quantity: 0,
                    channel_id: currentChannelId
                }));
                const { error: insertError } = await supabaseClient.from('inventory_scans').insert(dataToInsert);
                if (insertError) throw insertError;
                alert('전체 초기화 및 업로드 성공!');
                refreshCurrentView();
            } catch (uploadError) {
                alert('새 데이터 업로드 실패: ' + uploadError.message);
                console.error(uploadError);
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (error) {
        alert('작업 실패: ' + error.message);
        console.error(error);
    }
}

async function handleCornResetAndUpload(file) {
    if (!file) {
        alert('업로드할 CORN 양식 파일을 선택하세요.');
        return;
    }
    if (!confirm(`[CORN 양식] 현재 채널 [${channelSwitcher.options[channelSwitcher.selectedIndex].text}]의 모든 실사 현황 데이터를 영구적으로 삭제하고 CORN 양식으로 새로 업로드합니다. 계속하시겠습니까?`)) {
        return;
    }
    if (!confirm("이 작업은 되돌릴 수 없습니다. 정말로 진행하시겠습니까?")) {
        return;
    }

    try {
        const { error: deleteError } = await supabaseClient
            .from('inventory_scans')
            .update({ deleted_at: new Date().toISOString() })
            .eq('channel_id', currentChannelId)
            .is('deleted_at', null);

        if (deleteError) {
            throw new Error('기존 데이터 삭제 중 오류 발생: ' + deleteError.message);
        }

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (rows.length < 2) {
                     alert('업로드할 데이터가 없습니다. (제목 행 제외)');
                     return;
                }

                const dataRows = rows.slice(1);
                
                // 데이터를 집계하기 위한 객체
                const aggregatedData = {};

                dataRows.forEach(row => {
                    // '합계' 행이거나 유효하지 않은 행은 건너뜁니다.
                    if (!row || (row[2] && String(row[2]).includes('합계'))) {
                        return;
                    }
                    
                    const location = row[3] ? String(row[3]).trim() : null; // D열: 로케이션
                    const barcode = row[5] ? String(row[5]).trim() : null;  // F열: 바코드
                    const quantity = row[8]; // I열: 현재고

                    // 필수 데이터가 없는 경우 건너뜁니다.
                    if (!location || !barcode) {
                        return;
                    }
                    
                    // 고유 키 생성 (로케이션 + 바코드)
                    const key = `${location}___${barcode}`;
                    const currentQuantity = Number(quantity) || 0;

                    if (aggregatedData[key]) {
                        // 이미 키가 존재하면 수량을 더합니다.
                        aggregatedData[key].expected_quantity += currentQuantity;
                    } else {
                        // 키가 없으면 새로 추가합니다.
                        aggregatedData[key] = {
                            location_code: location,
                            barcode: barcode,
                            expected_quantity: currentQuantity,
                            quantity: 0,
                            channel_id: currentChannelId
                        };
                    }
                });
                
                // 집계된 객체를 배열로 변환합니다.
                const dataToInsert = Object.values(aggregatedData);


                if (dataToInsert.length === 0) {
                    alert("업로드할 유효한 데이터가 없습니다. 엑셀 파일의 D, F, I열 데이터와 '합계' 행을 확인해주세요.");
                    return;
                }

                const { error: insertError } = await supabaseClient.from('inventory_scans').insert(dataToInsert);
                if (insertError) {
                    throw insertError;
                }
                
                alert(`CORN 양식을 통해 총 ${dataToInsert.length}개의 데이터를 성공적으로 초기화 및 업로드했습니다!`);
                refreshCurrentView();

            } catch (uploadError) {
                alert('새 데이터 업로드 실패: ' + uploadError.message);
                console.error(uploadError);
            }
        };
        reader.readAsArrayBuffer(file);
    } catch (error) {
        alert('작업 실패: ' + error.message);
        console.error(error);
    }
}


async function deleteSelected(tableName, primaryKeyColumn) {
    const checkedBoxes = contentArea.querySelectorAll('.row-checkbox:checked');
    if (checkedBoxes.length === 0) {
        alert('삭제할 항목을 선택하세요.');
        return;
    }

    const idsToDelete = Array.from(checkedBoxes)
        .map(box => box.dataset.id)
        .filter(id => id); 

    if (idsToDelete.length === 0) {
        alert('선택한 항목 중에 유효한 ID가 없습니다.');
        return;
    }

    if (confirm(`${idsToDelete.length}개의 항목을 정말로 삭제하시겠습니까?`)) {
        try {
            const chunkSize = 500;
            for (let i = 0; i < idsToDelete.length; i += chunkSize) {
                const chunk = idsToDelete.slice(i, i + chunkSize);

                let query;
                if (tableName === 'inventory_scans') {
                    query = supabaseClient
                        .from(tableName)
                        .update({ deleted_at: new Date().toISOString() });
                } else {
                    query = supabaseClient.from(tableName).delete();
                }

                if (tableName === 'locations' || tableName === 'products') {
                    query = query.eq('channel_id', currentChannelId);
                }

                const { error } = await query.in(primaryKeyColumn, chunk);

                if (error) {
                    throw error;
                }
            }

            alert('선택한 항목이 삭제되었습니다.');
            refreshCurrentView();

        } catch (error) {
            alert('삭제 실패: ' + error.message);
            console.error(error);
        }
    }
}

function handleNavClick(event) {
    navButtons.forEach(btn => btn.classList.remove('active'));
    const clickedButton = event.target;
    clickedButton.classList.add('active');
    const navId = clickedButton.id;
    
    contentArea.innerHTML = `<h2>${clickedButton.textContent} 화면을 불러오는 중...</h2>`;
    currentFilters = {};
    if (navId === 'nav-inventory') {
        currentSort = { column: 'created_at', direction: 'desc', defaultColumn: 'created_at', defaultDirection: 'desc', isDefault: true };
        showInventoryStatus();
    } else if (navId === 'nav-products') {
        currentSort = { column: 'barcode', direction: 'asc', defaultColumn: 'barcode', defaultDirection: 'asc', isDefault: true };
        showProductMaster();
    } else if (navId === 'nav-locations') {
        currentSort = { column: 'location_code', direction: 'asc', defaultColumn: 'location_code', defaultDirection: 'asc', isDefault: true };
        showLocationMaster();
    } else if (navId === 'nav-channels') {
        showChannelMaster();
    } else if (navId === 'nav-users') {
        showUserManagement();
    }
}

contentArea.addEventListener('click', async function(event) {
    const target = event.target;
    const section = target.closest('.content-section');
    if (!section) return;

    if (target.classList.contains('refresh-view-button')) {
        refreshCurrentView();
        return;
    }

    if (target.classList.contains('sortable')) {
        const newSortColumn = target.dataset.column;
        if (currentSort.column === newSortColumn && !currentSort.isDefault) {
            if (currentSort.direction === 'desc') {
                currentSort.direction = 'asc';
                currentSort.isDefault = false;
            } else {
                currentSort.column = currentSort.defaultColumn;
                currentSort.direction = currentSort.defaultDirection;
                currentSort.isDefault = true;
            }
        } else {
            currentSort.column = newSortColumn;
            currentSort.direction = 'desc';
            currentSort.isDefault = false;
        }
        refreshCurrentView();
        return;
    }
    
    const sectionId = section.id;
    let tableName, primaryKey, fileName;

    if (sectionId === 'products-section') {
        tableName = 'products';
        primaryKey = 'barcode';
        fileName = 'products';
    } else if (sectionId === 'locations-section') {
        tableName = 'locations'; 
        primaryKey = 'location_code';
        fileName = 'locations';
    }
    
    if (target.classList.contains('search-button')) {
        currentFilters = {};
        if (sectionId === 'inventory-section') {
            currentFilters.location_code = document.getElementById('filter-location').value.trim();
            currentFilters.barcode = document.getElementById('filter-barcode').value.trim();
        } else if (sectionId === 'products-section') {
            currentFilters.product_code = document.getElementById('filter-prod-code').value.trim();
            currentFilters.barcode = document.getElementById('filter-prod-barcode').value.trim();
            currentFilters.product_name = document.getElementById('filter-prod-name').value.trim();
        } else if (sectionId === 'locations-section') {
            currentFilters.location_code = document.getElementById('filter-loc-code').value.trim();
        }
        refreshCurrentView();
    }
    else if (target.classList.contains('reset-button')) {
        currentFilters = {};
        refreshCurrentView();
    }
    else if (target.id === 'add-channel-button') {
        const input = document.getElementById('new-channel-name');
        const newName = input.value.trim();
        if (!newName) { alert('채널 이름을 입력하세요.'); return; }
        const { error } = await supabaseClient.from('channels').insert({ name: newName });
        if (error) {
            alert('채널 추가 실패: ' + error.message);
        } else {
            alert(`'${newName}' 채널이 추가되었습니다.`);
            await populateChannelSwitcher();
            showChannelMaster();
        }
    }
    else if (target.classList.contains('delete-channel-button')) {
        const channelId = target.dataset.id;
        const channelName = target.dataset.name;
        if (confirm(`'${channelName}' 채널을 정말로 삭제하시겠습니까?\n\n⚠️ 경고: 이 채널에 속한 모든 로케이션, 상품, 재고실사 데이터가 함께 삭제됩니다.`)) {
            const { error } = await supabaseClient.from('channels').delete().eq('id', channelId);
            if (error) {
                alert('채널 삭제 실패: ' + error.message);
            } else {
                alert(`'${channelName}' 채널이 삭제되었습니다.`);
                if (currentChannelId === channelId) {
                    localStorage.removeItem('selectedAdminChannelId');
                    currentChannelId = null;
                }
                await populateChannelSwitcher();
                showChannelMaster();
            }
        }
    }
    else if (target.classList.contains('approve-user-button')) {
        const userId = target.dataset.id;
        const userEmail = target.dataset.email;
        if (confirm(`'${userEmail}' 사용자를 승인하시겠습니까?`)) {
            const { error } = await supabaseClient.rpc('approve_user', { user_id_to_approve: userId });
            if (error) {
                alert('사용자 승인 실패: ' + error.message);
            } else {
                alert(`'${userEmail}' 사용자가 승인되었습니다.`);
                showUserManagement();
            }
        }
    }
    else if (target.id === 'reset-template-download') {
        downloadTemplateExcel(['location_code', 'barcode', 'expected_quantity'], 'inventory_reset_template.xlsx');
    }
    else if (target.id === 'reset-upload-button') {
        const fileInput = document.getElementById('reset-upload-file');
        handleResetAndUpload(fileInput.files[0]);
    }
    else if (target.id === 'corn-reset-upload-button') {
        const fileInput = document.getElementById('corn-reset-upload-file');
        handleCornResetAndUpload(fileInput.files[0]);
    }
    else if (target.id === 'upload-corn-button') {
        const fileInput = document.getElementById('upload-corn-file');
        uploadCornData(fileInput.files[0]);
    }
    else if (target.id === 'upload-corn-locations-button') {
        const fileInput = document.getElementById('upload-corn-locations-file');
        uploadCornLocations(fileInput.files[0]);
    }
    else if (target.classList.contains('delete-selected')) {
        const tableMap = { 'inventory-section': 'inventory_scans', 'products-section': 'products', 'locations-section': 'locations' };
        const pkMap = { 'inventory-section': 'id', 'products-section': 'barcode', 'locations-section': 'location_code' };
        deleteSelected(tableMap[sectionId], pkMap[sectionId]);
    } 
    else if (target.classList.contains('download-template')) {
        if (sectionId === 'products-section') downloadTemplateExcel(['product_code', 'barcode', 'product_name'], 'products_template.xlsx');
        else if (sectionId === 'locations-section') downloadTemplateExcel(['location_code'], 'locations_template.xlsx');
    }
    else if (target.classList.contains('upload-data')) {
        const fileInput = section.querySelector('.upload-file');
        let onConflictKey = '';
        if (sectionId === 'products-section') {
            onConflictKey = ['barcode', 'channel_id'];
        } else if (sectionId === 'locations-section') {
            onConflictKey = ['location_code', 'channel_id'];
        }
        uploadData(tableName, onConflictKey, fileInput.files[0]);
    }
    else if (target.classList.contains('download-excel')) {
        alert('전체 데이터를 다운로드합니다. 데이터 양에 따라 시간이 걸릴 수 있습니다.');
        const tableToDownload = sectionId === 'inventory-section' ? 'inventory_scans' : tableName;
        
        if (tableToDownload === 'inventory_scans') {
             const query = supabaseClient.from('inventory_scans').select(`*, products(product_code, product_name)`).eq('channel_id', currentChannelId).is('deleted_at', null);
             const { data: inventoryData, error } = await fetchAllWithPagination(query);
             if (error) { alert('데이터 다운로드 실패: ' + error.message); return; }
             const flattenedData = inventoryData.map((item, index) => ({
                'No.': index + 1,
                '로케이션': item.location_code,
                '상품코드': item.products ? item.products.product_code : 'N/A',
                '바코드': item.barcode,
                '상품명': item.products ? item.products.product_name : 'N/A',
                '전산수량': item.expected_quantity || 0,
                '실사수량': item.quantity || 0,
                '차이': (item.quantity || 0) - (item.expected_quantity || 0),
                '마지막 스캔': new Date(item.created_at).toLocaleString()
            }));
            downloadExcel(flattenedData, 'inventory_status.xlsx');
        } else {
            const query = supabaseClient.from(tableToDownload).select('*').eq('channel_id', currentChannelId);
            const { data, error } = await fetchAllWithPagination(query);
            if (error) { alert('데이터 다운로드 실패: ' + error.message); return; }
            const numberedData = data.map((item, index) => ({'No.': index + 1, ...item}));
            downloadExcel(numberedData, `${fileName}_master.xlsx`);
        }
    }
});

contentArea.addEventListener('dblclick', function(e) {
    const cell = e.target;
    if (!cell.classList.contains('editable-quantity') || cell.querySelector('input')) {
        return;
    }

    const scanId = cell.dataset.scanId;
    const originalValue = cell.textContent.trim();
    
    cell.innerHTML = `<input type="number" class="quantity-edit-input" value="${originalValue}" style="width: 80px; text-align: right;">`;
    
    const input = cell.querySelector('input');
    input.focus();
    input.select();

    const handleSave = async () => {
        const newValue = input.value.trim();

        if (newValue === originalValue) {
            cell.textContent = originalValue;
            return;
        }

        if (newValue === '' || isNaN(newValue) || Number(newValue) < 0) {
            alert('유효한 숫자를 입력하세요.');
            cell.textContent = originalValue;
            return;
        }

        try {
            const { error } = await supabaseClient
                .from('inventory_scans')
                .update({ 
                    quantity: Number(newValue),
                    created_at: new Date().toISOString()
                })
                .eq('id', scanId);
            
            if (error) throw error;

            cell.textContent = newValue;
            const row = cell.closest('tr');
            if (row) {
                row.querySelector('.scan-time').textContent = new Date().toLocaleString();
                const expectedQty = parseInt(row.cells[6].textContent, 10);
                const diffCell = row.cells[8];
                diffCell.textContent = Number(newValue) - expectedQty;
            }
            
            alert('수량이 성공적으로 수정되었습니다.');
            updateGlobalProgress();

        } catch (error) {
            alert('수량 업데이트 실패: ' + error.message);
            cell.textContent = originalValue;
        }
    };

    input.addEventListener('blur', handleSave, { once: true });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            input.removeEventListener('blur', handleSave);
            cell.textContent = originalValue;
        }
    });
});


contentArea.addEventListener('change', function(event) {
    if (event.target.classList.contains('select-all-checkbox')) {
        const isChecked = event.target.checked;
        const allRowCheckboxes = event.target.closest('table').querySelectorAll('.row-checkbox');
        allRowCheckboxes.forEach(box => box.checked = isChecked);
    }
});

contentArea.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    if (e.target.classList.contains('filter-input')) {
        e.preventDefault();
        e.target.closest('.card-body').querySelector('.search-button').click();
    } else if (e.target.id === 'new-channel-name') {
        e.preventDefault();
        document.getElementById('add-channel-button').click();
    }
});

document.getElementById('home-button').addEventListener('click', showHomepage);

channelSwitcher.addEventListener('change', () => {
    currentChannelId = channelSwitcher.value;
    localStorage.setItem('selectedAdminChannelId', currentChannelId);
    
    const activeNav = document.querySelector('nav button.active');
    if (activeNav) {
        refreshCurrentView();
    } else {
        showHomepage();
    }
});

logoutButton.addEventListener('click', async () => {
    if (confirm('로그아웃하시겠습니까?')) {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            alert('로그아웃 실패: ' + error.message);
        } else {
            localStorage.removeItem('selectedAdminChannelId');
            window.location.href = 'login.html';
        }
    }
});

navButtons.forEach(button => button.addEventListener('click', handleNavClick));