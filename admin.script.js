// Supabase 클라이언트 설정
const SUPABASE_URL = 'https://qjftovamkqhxaenueood.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZnRvdmFta3FoeGFlbnVlb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMzQxMTgsImV4cCI6MjA2NzYxMDExOH0.qpMLaPEkMEmXeRg7193JqjFyUdntIxq3Q3kARUqGS18';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM 요소
const contentArea = document.getElementById('content-area');
const navButtons = document.querySelectorAll('nav button');

// 현재 정렬 및 필터 상태를 저장하는 변수
let currentSort = {};
let currentFilters = {};


// --- 1. 실사 현황 관리 기능 ---
async function showInventoryStatus() {
    contentArea.innerHTML = `
        <div id="inventory-section" class="content-section active">
            <h2>실사 현황</h2>
            <div class="controls">
                <input type="text" id="filter-location" placeholder="로케이션 검색..." value="${currentFilters.location_code || ''}">
                <input type="text" id="filter-barcode" placeholder="바코드 검색..." value="${currentFilters.barcode || ''}">
                <button class="search-button">검색</button>
                <button class="reset-button">초기화</button>
            </div>
            <div class="controls">
                <button class="download-excel">엑셀 다운로드</button>
                <button class="delete-selected" style="background-color: #dc3545;">선택 삭제</button>
            </div>
            <div id="admin-progress-container" class="controls"></div>
            <div class="table-container">불러오는 중...</div>
        </div>
    `;

    const tableContainer = contentArea.querySelector('.table-container');
    
    let query = supabaseClient
        .from('inventory_scans')
        .select(`id, created_at, location_code, barcode, quantity, expected_quantity, products(product_name)`);

    if (currentFilters.location_code) {
        query = query.ilike('location_code', `%${currentFilters.location_code}%`);
    }
    if (currentFilters.barcode) {
        query = query.ilike('barcode', `%${currentFilters.barcode}%`);
    }

    query = query.order(currentSort.column, { 
        ascending: currentSort.direction === 'asc',
        foreignTable: currentSort.column.startsWith('products.') ? 'products' : undefined
    });

    const { data, error } = await query;

    if (error) {
        tableContainer.innerHTML = '데이터를 불러오는 데 실패했습니다: ' + error.message;
        return;
    }

    const progressContainer = contentArea.querySelector('#admin-progress-container');
    const totals = data.reduce((acc, item) => {
        acc.expected += item.expected_quantity || 0;
        acc.actual += item.quantity || 0;
        return acc;
    }, { expected: 0, actual: 0 });

    const progress = totals.expected > 0 ? (totals.actual / totals.expected) * 100 : 0;

    progressContainer.innerHTML = `
        <span><b>총 전산수량:</b> ${totals.expected}</span>
        <span><b>총 실사수량:</b> ${totals.actual}</span>
        <span><b>진척도:</b> ${progress.toFixed(2)}%</span>
    `;

    let tableHTML = `<table><thead><tr>
        <th><input type="checkbox" class="select-all-checkbox"></th>
        <th class="sortable" data-column="location_code">로케이션</th>
        <th class="sortable" data-column="barcode">바코드</th>
        <th class="sortable" data-column="products.product_name">상품명</th>
        <th class="sortable" data-column="expected_quantity">전산수량</th>
        <th class="sortable" data-column="quantity">실사수량</th>
        <th>차이</th>
        <th class="sortable" data-column="created_at">마지막 스캔</th>
    </tr></thead><tbody>`;
    data.forEach(item => {
        const expected = item.expected_quantity || 0;
        const actual = item.quantity || 0;
        const diff = actual - expected;
        tableHTML += `
            <tr>
                <td><input type="checkbox" class="row-checkbox" data-id="${item.id}"></td>
                <td>${item.location_code}</td><td>${item.barcode}</td>
                <td>${item.products ? item.products.product_name : 'N/A'}</td>
                <td>${expected}</td><td>${actual}</td><td>${diff}</td>
                <td>${new Date(item.created_at).toLocaleString()}</td>
            </tr>`;
    });
    tableHTML += '</tbody></table>';
    tableContainer.innerHTML = tableHTML;
    updateSortIndicator();
}


// --- 2. 상품 마스터 관리 기능 ---
async function showProductMaster() {
    contentArea.innerHTML = `
        <div id="products-section" class="content-section active">
            <h2>상품 마스터 관리</h2>
            <div class="controls">
                <input type="text" id="filter-prod-barcode" placeholder="바코드 검색..." value="${currentFilters.barcode || ''}">
                <input type="text" id="filter-prod-name" placeholder="상품명 검색..." value="${currentFilters.product_name || ''}">
                <button class="search-button">검색</button>
                <button class="reset-button">초기화</button>
            </div>
            <div class="controls">
                <button class="download-template">양식 다운로드</button>
                <button class="download-excel">엑셀 다운로드</button>
                <input type="file" class="upload-file" accept=".xlsx, .xls">
                <button class="upload-data">업로드 실행</button>
                <button class="delete-selected" style="background-color: #dc3545;">선택 삭제</button>
            </div>
            <div class="table-container">불러오는 중...</div>
        </div>
    `;

    const tableContainer = contentArea.querySelector('.table-container');
    
    let query = supabaseClient.from('products').select('*');

    if (currentFilters.barcode) {
        query = query.ilike('barcode', `%${currentFilters.barcode}%`);
    }
    if (currentFilters.product_name) {
        query = query.ilike('product_name', `%${currentFilters.product_name}%`);
    }

    query = query.order(currentSort.column, { ascending: currentSort.direction === 'asc' });
    
    const { data, error } = await query;

    if (error) { tableContainer.innerHTML = '데이터를 불러오는 데 실패했습니다.'; return; }
    
    let tableHTML = `<table><thead><tr>
        <th><input type="checkbox" class="select-all-checkbox"></th>
        <th class="sortable" data-column="barcode">바코드</th>
        <th class="sortable" data-column="product_name">상품명</th>
    </tr></thead><tbody>`;
    data.forEach(p => {
        tableHTML += `<tr>
            <td><input type="checkbox" class="row-checkbox" data-id="${p.barcode}"></td>
            <td>${p.barcode}</td><td>${p.product_name}</td>
        </tr>`;
    });
    tableHTML += '</tbody></table>';
    tableContainer.innerHTML = tableHTML;
    updateSortIndicator();
}


// --- 3. 로케이션 마스터 관리 기능 ---
async function showLocationMaster() {
    contentArea.innerHTML = `
        <div id="locations-section" class="content-section active">
            <h2>로케이션 마스터 관리</h2>
            <div class="controls">
                 <input type="text" id="filter-loc-code" placeholder="로케이션 검색..." value="${currentFilters.location_code || ''}">
                 <button class="search-button">검색</button>
                 <button class="reset-button">초기화</button>
            </div>
            <div class="controls">
                <button class="download-template">양식 다운로드</button>
                <button class="download-excel">엑셀 다운로드</button>
                <input type="file" class="upload-file" accept=".xlsx, .xls">
                <button class="upload-data">업로드 실행</button>
                <button class="delete-selected" style="background-color: #dc3545;">선택 삭제</button>
            </div>
            <div class="table-container">불러오는 중...</div>
        </div>
    `;
    
    const tableContainer = contentArea.querySelector('.table-container');

    let query = supabaseClient.from('locations').select('*');

    if (currentFilters.location_code) {
        query = query.ilike('location_code', `%${currentFilters.location_code}%`);
    }

    query = query.order(currentSort.column, { ascending: currentSort.direction === 'asc' });
    
    const { data, error } = await query;

    if (error) { tableContainer.innerHTML = '데이터를 불러오는 데 실패했습니다.'; return; }

    let tableHTML = `<table><thead><tr>
        <th><input type="checkbox" class="select-all-checkbox"></th>
        <th class="sortable" data-column="location_code">로케이션 코드</th>
    </tr></thead><tbody>`;
    data.forEach(loc => {
        tableHTML += `<tr>
            <td><input type="checkbox" class="row-checkbox" data-id="${loc.location_code}"></td>
            <td>${loc.location_code}</td>
        </tr>`;
    });
    tableHTML += '</tbody></table>';
    tableContainer.innerHTML = tableHTML;
    updateSortIndicator();
}


// --- 공통 함수들 ---
function updateSortIndicator() {
    const allHeaders = contentArea.querySelectorAll('th.sortable');
    allHeaders.forEach(th => {
        const columnName = th.dataset.column;
        th.innerHTML = th.innerHTML.replace(/ [▲▼]/, '');
        if (columnName === currentSort.column && currentSort.direction) {
            th.innerHTML += currentSort.direction === 'asc' ? ' ▲' : ' ▼';
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
    if (!file) {
        alert('업로드할 파일을 선택하세요.');
        return;
    }
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            if(jsonData.length === 0){
                alert('엑셀 파일에 데이터가 없습니다.');
                return;
            }
            const { error } = await supabaseClient.from(tableName).upsert(jsonData, { onConflict: onConflictColumn });
            if (error) { throw error; }
            alert('업로드 성공!');
            const activeNav = document.querySelector('nav button.active');
            if (activeNav) activeNav.click();
        } catch (error) {
            alert('업로드 실패: ' + error.message);
            console.error(error);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function deleteSelected(tableName, primaryKeyColumn) {
    const checkedBoxes = contentArea.querySelectorAll('.row-checkbox:checked');
    if (checkedBoxes.length === 0) {
        alert('삭제할 항목을 선택하세요.');
        return;
    }
    const idsToDelete = Array.from(checkedBoxes).map(box => box.dataset.id);
    if (confirm(`${idsToDelete.length}개의 항목을 정말로 삭제하시겠습니까?`)) {
        const { error } = await supabaseClient.from(tableName).delete().in(primaryKeyColumn, idsToDelete);
        if (error) {
            alert('삭제 실패: ' + error.message);
        } else {
            alert('선택한 항목이 삭제되었습니다.');
            const activeNav = document.querySelector('nav button.active');
            if (activeNav) activeNav.click();
        }
    }
}


// --- 네비게이션 및 이벤트 위임 ---
function handleNavClick(event) {
    navButtons.forEach(btn => btn.classList.remove('active'));
    const clickedButton = event.target;
    clickedButton.classList.add('active');
    const navId = clickedButton.id;
    
    currentFilters = {};
    if (navId === 'nav-inventory') {
        currentSort = { column: 'created_at', direction: 'desc', defaultColumn: 'created_at', defaultDirection: 'desc' };
        showInventoryStatus();
    } else if (navId === 'nav-products') {
        currentSort = { column: 'barcode', direction: 'asc', defaultColumn: 'barcode', defaultDirection: 'asc' };
        showProductMaster();
    } else if (navId === 'nav-locations') {
        currentSort = { column: 'location_code', direction: 'asc', defaultColumn: 'location_code', defaultDirection: 'asc' };
        showLocationMaster();
    }
}

contentArea.addEventListener('click', async function(event) {
    const target = event.target;
    const section = target.closest('.content-section');
    if (!section) return;

    if (target.classList.contains('sortable')) {
        const newSortColumn = target.dataset.column;
        if (currentSort.column === newSortColumn) {
            if (currentSort.direction === 'asc') {
                currentSort.direction = 'desc';
            } else {
                currentSort.column = currentSort.defaultColumn;
                currentSort.direction = currentSort.defaultDirection;
            }
        } else {
            currentSort.column = newSortColumn;
            currentSort.direction = 'asc';
        }
        const sectionId = section.id;
        if (sectionId === 'inventory-section') showInventoryStatus();
        else if (sectionId === 'products-section') showProductMaster();
        else if (sectionId === 'locations-section') showLocationMaster();
        return;
    }
    
    const sectionId = section.id;
    let tableName, primaryKey, fileName;

    if (sectionId === 'products-section') {
        tableName = 'products'; primaryKey = 'barcode'; fileName = 'products';
    } else if (sectionId === 'locations-section') {
        tableName = 'locations'; primaryKey = 'location_code'; fileName = 'locations';
    }

    if (target.classList.contains('delete-selected')) {
        const tableMap = { 'inventory-section': 'inventory_scans', 'products-section': 'products', 'locations-section': 'locations' };
        const pkMap = { 'inventory-section': 'id', 'products-section': 'barcode', 'locations-section': 'location_code' };
        deleteSelected(tableMap[sectionId], pkMap[sectionId]);
    } 
    else if (target.classList.contains('download-template')) {
        if (sectionId === 'products-section') {
            downloadTemplateExcel(['barcode', 'product_name'], 'products_template.xlsx');
        } else if (sectionId === 'locations-section') {
            downloadTemplateExcel(['location_code'], 'locations_template.xlsx');
        }
    }
    else if (target.classList.contains('upload-data')) {
        const fileInput = section.querySelector('.upload-file');
        uploadData(tableName, primaryKey, fileInput.files[0]);
    }
    else if (target.classList.contains('download-excel')) {
        const tableToDownload = sectionId === 'inventory-section' ? 'inventory_scans' : tableName;
        if (tableToDownload === 'inventory_scans') {
             const { data: inventoryData, error } = await supabaseClient.from('inventory_scans').select(`*, products(product_name)`);
             if (error) { alert('데이터 다운로드 실패: ' + error.message); return; }
             const flattenedData = inventoryData.map(item => ({
                '로케이션': item.location_code, '바코드': item.barcode, '상품명': item.products ? item.products.product_name : 'N/A',
                '전산수량': item.expected_quantity || 0, '실사수량': item.quantity || 0, '차이': (item.quantity || 0) - (item.expected_quantity || 0),
                '마지막 스캔': new Date(item.created_at).toLocaleString()
            }));
            downloadExcel(flattenedData, 'inventory_status.xlsx');
        } else {
            const { data, error } = await supabaseClient.from(tableToDownload).select('*');
            if (error) { alert('데이터 다운로드 실패: ' + error.message); return; }
            downloadExcel(data, `${fileName}_master.xlsx`);
        }
    }
    else if (target.classList.contains('search-button')) {
        if (sectionId === 'inventory-section') {
            currentFilters.location_code = document.getElementById('filter-location').value.trim();
            currentFilters.barcode = document.getElementById('filter-barcode').value.trim();
            showInventoryStatus();
        } else if (sectionId === 'products-section') {
            currentFilters.barcode = document.getElementById('filter-prod-barcode').value.trim();
            currentFilters.product_name = document.getElementById('filter-prod-name').value.trim();
            showProductMaster();
        } else if (sectionId === 'locations-section') {
            currentFilters.location_code = document.getElementById('filter-loc-code').value.trim();
            showLocationMaster();
        }
    }
    else if (target.classList.contains('reset-button')) {
        currentFilters = {};
        const activeNav = document.querySelector('nav button.active');
        if (activeNav) activeNav.click();
    }
});

contentArea.addEventListener('change', function(event) {
    if (event.target.classList.contains('select-all-checkbox')) {
        const isChecked = event.target.checked;
        const allRowCheckboxes = event.target.closest('table').querySelectorAll('.row-checkbox');
        allRowCheckboxes.forEach(box => box.checked = isChecked);
    }
});

navButtons.forEach(button => button.addEventListener('click', handleNavClick));