// Supabase 클라이언트 설정
const SUPABASE_URL = 'https://lmlpbjosdygnpqcnrwuj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtbHBiam9zZHlnbnBxY25yd3VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI5MDA2NjgsImV4cCI6MjA2ODQ3NjY2OH0.Jt1Al2Sl44fSlRMAsvRw5cBuKfXcMzeYyzE774stBuQ';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM 요소 ---
const contentArea = document.getElementById('content-area');
const navButtons = document.querySelectorAll('nav button');
const logoutButton = document.getElementById('logout-button');
const userEmailDisplay = document.getElementById('current-user-email');
const batchSummaryModal = document.getElementById('batch-summary-modal');


// --- 상태 관리 변수 ---
let currentChannelId = localStorage.getItem('adminSelectedChannelId') || null;
let currentFilters = { product_code: '', barcode: '', product_name: '' };
let currentSort = { column: 'id', direction: 'desc' };
let currentPickingStatusData = [];
let currentBatchDetailsData = [];
let currentProductMasterData = [];


// --- 초기화 및 권한 확인 ---
(async () => {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error || !session || (session.user.email !== 'eowert72@gmail.com' && (!session.user.user_metadata || !session.user.user_metadata.is_admin))) {
        await supabaseClient.auth.signOut();
        alert('로그인이 필요하거나 관리자 권한이 없습니다.');
        window.location.href = 'login.html';
        return;
    }
    
    userEmailDisplay.textContent = session.user.email;
    
    const superAdminOnlyButtons = ['nav-users']; 
    superAdminOnlyButtons.forEach(id => {
        const button = document.getElementById(id);
        if (button && session.user.email !== 'eowert72@gmail.com') {
            button.style.display = 'none';
        }
    });

    await setupChannelSwitcher();
    
    document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active'));
    
    const initialActiveButton = document.getElementById('nav-picking-status');
    if(initialActiveButton) initialActiveButton.classList.add('active');
    
    showPickingStatus();
})();


// --- 네비게이션 및 채널 선택기 ---
async function setupChannelSwitcher() {
    const nav = document.querySelector('nav');
    if (document.getElementById('channel-switcher-container')) return;

    const { data: channels, error } = await supabaseClient.from('channels').select('*').order('name');
    if (error) { console.error('채널 목록 로딩 실패', error); return; }

    const storedChannelId = localStorage.getItem('adminSelectedChannelId');
    const isValidStoredId = channels.some(c => c.id == storedChannelId);

    if (isValidStoredId) {
        currentChannelId = storedChannelId;
    } else if (channels.length > 0) {
        currentChannelId = channels[0].id;
        localStorage.setItem('adminSelectedChannelId', currentChannelId);
    } else {
        currentChannelId = null;
        localStorage.removeItem('adminSelectedChannelId');
    }

    const switcherHTML = `<div id="channel-switcher-container"><label for="channel-switcher" style="color: white; font-weight: 500; margin-right: 8px;">채널:</label><select id="channel-switcher" style="padding: 5px; border-radius: 4px;">${channels.map(c => `<option value="${c.id}" ${c.id == currentChannelId ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>`;
    nav.insertAdjacentHTML('afterbegin', switcherHTML);

    document.getElementById('channel-switcher').addEventListener('change', e => {
        currentChannelId = e.target.value;
        localStorage.setItem('adminSelectedChannelId', currentChannelId);
        const activeNav = document.querySelector('nav button.active');
        if (activeNav) { activeNav.click(); } else { showPickingStatus(); }
    });
}

navButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        navButtons.forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        
        switch (e.target.id) {
            case 'nav-picking-status': showPickingStatus(); break;
            case 'nav-batch-management': showBatchManagement(); break;
            case 'nav-products': showProductMaster(); break;
            case 'nav-users': showUserManagement(); break;
            case 'nav-channels': showChannelManagement(); break;
        }
    });
});


// --- 이벤트 리스너 통합 ---
contentArea.addEventListener('click', function(e) {
    const target = e.target.closest('button');
    if (!target) return;

    if (target.id === 'refresh-picking-status-btn') showPickingStatus();
    if (target.id === 'refresh-batch-details-btn') loadBatchDetails();
    if (target.id === 'refresh-product-master-btn') renderProductTable();
    if (target.id === 'refresh-channels-btn') showChannelManagement();
    if (target.id === 'refresh-users-btn') showUserManagement();

    if (target.id === 'download-picking-status-btn') {
        if (!currentPickingStatusData || currentPickingStatusData.length === 0) {
            alert('다운로드할 데이터가 없습니다.'); return;
        }
        const dataToExport = currentPickingStatusData.map(order => ({
            '출고지시번호': order.order_number,
            '출고지 주소': order.destination_address,
            '수취인': order.recipient,
            '지시수량': order.total_expected_quantity,
            '완료수량': order.total_picked_quantity,
            '상태': order.status
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '출고현황');
        XLSX.writeFile(workbook, `출고현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    if (target.id === 'download-batch-details-btn') {
        if (!currentBatchDetailsData || currentBatchDetailsData.length === 0) {
            alert('다운로드할 데이터가 없습니다.'); return;
        }
        const dataToExport = currentBatchDetailsData.map(item => ({
            '출고일': item.date,
            '수취인': item.recipient,
            '출고지 주소': item.destination_address,
            '출고지시번호': item.order_number,
            '상품명': item.product_name,
            '상품코드(바코드)': item.barcode,
            '지시수량': item.expected_quantity,
            '완료수량': item.picked_quantity
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '출고상세');
        XLSX.writeFile(workbook, `출고상세_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    if (target.id === 'download-product-master-btn') {
        if (!currentProductMasterData || currentProductMasterData.length === 0) {
            alert('다운로드할 데이터가 없습니다.'); return;
        }
        const dataToExport = currentProductMasterData.map(p => ({
            '상품코드': p.product_code,
            '바코드': p.barcode,
            '상품명': p.product_name
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '상품마스터');
        XLSX.writeFile(workbook, `상품마스터_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    if (target.id === 'show-batch-summary-btn') {
        const date = contentArea.querySelector('#work-date-picker').value;
        if (!date) {
            alert('먼저 예정일을 선택해주세요.');
            return;
        }
        showBatchSummaryModal(date);
    }
    if (target.id === 'query-batch-btn') loadBatchDetails();
    if (target.id === 'new-batch-btn') handleCreateNewBatch();
    if (target.classList.contains('upload-standard-btn')) handleStandardOrderUpload(target);
    if (target.classList.contains('upload-corn-btn')) handleCornOrderUpload(target);
    if (target.classList.contains('delete-batch-btn')) handleDeleteBatch(target.dataset.id);
    if (target.classList.contains('download-standard-template')) handleStandardTemplateDownload();
    if (target.id === 'add-channel-btn') handleAddChannel();
    if (target.classList.contains('delete-channel-btn')) handleDeleteChannel(target.dataset.id);
    if (target.classList.contains('search-button')) {
        currentFilters.product_code = contentArea.querySelector('#filter-prod-code').value.trim();
        currentFilters.barcode = contentArea.querySelector('#filter-prod-barcode').value.trim();
        currentFilters.product_name = contentArea.querySelector('#filter-prod-name').value.trim();
        renderProductTable();
    }
    if (target.classList.contains('reset-button')) {
        currentFilters = { product_code: '', barcode: '', product_name: '' };
        contentArea.querySelectorAll('.filter-input').forEach(input => input.value = '');
        renderProductTable();
    }
    if (target.classList.contains('sortable')) {
        const column = target.dataset.column;
        if (currentSort.column === column) { currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc'; }
        else { currentSort.column = column; currentSort.direction = 'asc'; }
        renderProductTable();
    }
    if (target.classList.contains('download-template')) handleProductTemplateDownload();
    if (target.classList.contains('upload-data')) handleProductUpload();
    if (target.id === 'upload-corn-button') handleCornUpload();
    if (target.classList.contains('delete-selected')) handleDeleteSelectedProducts();
    if (target.classList.contains('approve-user-button')) handleApproveUser(e);
});

contentArea.addEventListener('change', function(e) {
    if (e.target.classList.contains('select-all-checkbox')) {
        contentArea.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = e.target.checked);
    }
});


if (batchSummaryModal) {
    batchSummaryModal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close-btn')) {
            batchSummaryModal.style.display = 'none';
        }
        const selectedRow = e.target.closest('tr');
        if (selectedRow && selectedRow.dataset.batchNumber) {
            const batchNumber = selectedRow.dataset.batchNumber;
            contentArea.querySelector('#batch-number-input').value = batchNumber;
            batchSummaryModal.style.display = 'none';
            loadBatchDetails();
        }
    });
}


async function showBatchSummaryModal(date) {
    batchSummaryModal.style.display = 'flex';
    const tbody = batchSummaryModal.querySelector('#batch-summary-table tbody');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">현황을 불러오는 중...</td></tr>`;

    try {
        const { data, error } = await supabaseClient.rpc('get_batch_summary_by_date', {
            p_channel_id: currentChannelId,
            p_batch_date: date
        });

        if (error) throw error;

        if (data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">해당 날짜에 출고 차수가 없습니다.</td></tr>`;
            return;
        }

        let tableHtml = '';
        data.forEach(batch => {
            const progress = (batch.order_count > 0) ? (batch.completed_count / batch.order_count * 100) : 0;

            let progressHtml;
            if (progress > 0) {
                progressHtml = `
                    <div class="progress-cell">
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: ${progress.toFixed(2)}%;"></div>
                        </div>
                        <span class="progress-text">${progress.toFixed(1)}%</span>
                    </div>
                `;
            } else {
                progressHtml = `<span class="progress-text">0.0%</span>`;
            }

            tableHtml += `
                <tr data-batch-number="${batch.batch_number}">
                    <td style="text-align: center; font-weight: 700;">${batch.batch_number}차</td>
                    <td style="text-align: center;">${batch.status || '대기'}</td>
                    <td style="text-align: center;">${batch.order_count}</td>
                    <td style="text-align: center;">${batch.completed_count}</td>
                    <td>${progressHtml}</td>
                </tr>
            `;
        });
        tbody.innerHTML = tableHtml;

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red; padding: 2rem;">오류: ${err.message}</td></tr>`;
    }
}


async function showChannelManagement() {
    contentArea.innerHTML = `
        <div class="content-section">
            <div class="page-header">
                <h2>채널 관리</h2>
                <div class="actions-group">
                    <button id="refresh-channels-btn" class="btn-secondary">새로고침</button>
                </div>
            </div>
            <div class="card">
                <div class="card-header">새 채널 추가</div>
                <div class="card-body">
                    <input type="text" id="new-channel-name" placeholder="새 채널 이름">
                    <button id="add-channel-btn" class="btn-primary">추가</button>
                </div>
            </div>
            <div class="card">
                <div class="card-header">채널 목록</div>
                <ul id="channel-list" class="management-list"></ul>
            </div>
        </div>`;

    const newChannelInput = contentArea.querySelector('#new-channel-name');
    newChannelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleAddChannel();
        }
    });

    await loadChannelsForManagement();
}

async function loadChannelsForManagement() {
    const list = contentArea.querySelector('#channel-list');
    list.innerHTML = `<li>불러오는 중...</li>`;
    const { data, error } = await supabaseClient.from('channels').select('*').order('name');
    if (error) { list.innerHTML = `<li>오류: ${error.message}</li>`; return; }
    if (data.length === 0) { list.innerHTML = `<li>생성된 채널이 없습니다.</li>`; return; }
    list.innerHTML = data.map(c => `<li class="management-list-item"><span>${c.name}</span><button class="btn-danger delete-channel-btn" data-id="${c.id}">삭제</button></li>`).join('');
}

async function handleAddChannel() {
    const nameInput = contentArea.querySelector('#new-channel-name');
    const name = nameInput.value.trim();
    if (!name) { alert('채널 이름을 입력하세요.'); return; }
    const { error } = await supabaseClient.from('channels').insert({ name });
    if (error) { alert('채널 추가 실패: ' + error.message); }
    else { alert('채널이 추가되었습니다. 페이지를 새로고침합니다.'); location.reload(); }
}

async function handleDeleteChannel(channelId) {
    if (confirm('이 채널을 삭제하면 관련된 모든 상품, 출고 데이터가 삭제됩니다. 계속하시겠습니까?')) {
        const { error } = await supabaseClient.from('channels').delete().eq('id', channelId);
        if (error) {
            alert('채널 삭제 실패: ' + error.message);
        } else {
            if (localStorage.getItem('adminSelectedChannelId') === channelId) {
                localStorage.removeItem('adminSelectedChannelId');
            }
            alert('채널이 삭제되었습니다. 페이지를 새로고침합니다.');
            location.reload();
        }
    }
}

// =================================================================
// 출고 차수 관리 (틀 고정 및 디자인 개선)
// =================================================================
async function showBatchManagement() {
    contentArea.innerHTML = `
        <div class="content-section">
            <div class="sticky-controls">
                <div class="page-header">
                    <h2>출고 업로드 및 확인</h2>
                     <div class="actions-group">
                        <button id="refresh-batch-details-btn" class="btn-secondary">새로고침</button>
                        <button id="download-batch-details-btn" class="btn-primary">엑셀 다운로드</button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body">
                        <label>예정일:</label>
                        <input type="date" id="work-date-picker" value="${new Date().toISOString().split('T')[0]}">
                        <label style="margin-left: 20px;">업로드차수:</label>
                        <input type="number" id="batch-number-input" placeholder="차수" min="1" style="width: 80px;">
                        <button id="show-batch-summary-btn" class="lookup-btn" title="차수 현황 보기">
                            <i class="material-icons">search</i>
                        </button>
                        <button id="query-batch-btn" class="btn-primary" style="margin-left: 5px;">조회</button>
                        <button id="new-batch-btn" class="btn-secondary">신규</button>
                    </div>
                </div>
                <div id="batch-summary-section"></div>
                <div id="batch-upload-section"></div>
            </div>
            <div id="batch-details-section" class="table-wrapper">
            </div>
        </div>`;

    const batchInput = contentArea.querySelector('#batch-number-input');
    batchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            loadBatchDetails();
        }
    });
}

async function loadBatchDetails() {
    const batchInput = contentArea.querySelector('#batch-number-input');
    const date = contentArea.querySelector('#work-date-picker').value;
    const batchNumber = batchInput.value;
    const uploadSection = contentArea.querySelector('#batch-upload-section');
    const summarySection = contentArea.querySelector('#batch-summary-section');
    const detailsSection = contentArea.querySelector('#batch-details-section');

    if (!date || !batchNumber) {
        detailsSection.innerHTML = `<p style="text-align:center; padding:2rem;">날짜와 차수를 모두 입력하고 조회하세요.</p>`;
        uploadSection.innerHTML = '';
        summarySection.innerHTML = '';
        return;
    }

    detailsSection.innerHTML = `<p style="text-align:center; padding:2rem;">불러오는 중...</p>`;
    summarySection.innerHTML = '';
    currentBatchDetailsData = [];

    const { data: batchData } = await supabaseClient.from('picking_batches').select('id, status').eq('channel_id', currentChannelId).eq('batch_date', date).eq('batch_number', batchNumber).single();

    const batchId = batchData ? batchData.id : null;
    const batchStatus = batchData ? batchData.status : '신규';

    uploadSection.innerHTML = `
        <div class="control-grid">
            <div class="card">
                <div class="card-header"><strong>${batchNumber}차수</strong> - 표준 양식</div>
                <div class="card-body">
                    <button class="download-standard-template btn-secondary">양식 다운로드</button>
                    <input type="file" class="standard-excel-input" accept=".xlsx, .xls" style="flex-grow:1;">
                    <button class="upload-standard-btn btn-primary" data-date="${date}" data-batch="${batchNumber}">업로드</button>
                </div>
            </div>
            <div class="card">
                <div class="card-header"><strong>${batchNumber}차수</strong> - CORN 양식</div>
                <div class="card-body">
                    <input type="file" class="corn-excel-input" accept=".xlsx, .xls" style="flex-grow:1;">
                    <button class="upload-corn-btn btn-primary" data-date="${date}" data-batch="${batchNumber}">업로드</button>
                </div>
            </div>
        </div>`;

    if (batchData) {
        try {
            const { data: ordersWithItems, error: ordersError } = await supabaseClient
                .from('picking_orders')
                .select(`order_number, recipient, destination_address, picking_items (product_name, barcode, expected_quantity, picked_quantity)`)
                .eq('batch_id', batchId)
                .order('order_number', { ascending: true });

            if (ordersError) throw ordersError;

            const allItems = [];
            let totalQuantity = 0, totalPicked = 0, orderCount = 0;

            if (ordersWithItems && ordersWithItems.length > 0) {
                orderCount = ordersWithItems.length;
                ordersWithItems.forEach(order => {
                    if (order.picking_items && order.picking_items.length > 0) {
                        order.picking_items.forEach(item => {
                            const pickedQty = item.picked_quantity || 0;
                            allItems.push({ ...item, date: date, order_number: order.order_number, recipient: order.recipient, destination_address: order.destination_address, picked_quantity: pickedQty });
                            totalQuantity += item.expected_quantity;
                            totalPicked += pickedQty;
                        });
                    }
                });
            }

            currentBatchDetailsData = allItems;

            const summaryHTML = `
                <div class="card" style="margin-top: 1.5rem;">
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>${batchNumber}차수 현황 (상태: ${batchStatus}) | 총 주문 <strong>${orderCount}</strong>건, 총 지시 <strong>${totalQuantity}</strong>개, 총 완료 <strong>${totalPicked}</strong>개</span>
                        ${batchId ? `<button class="delete-batch-btn btn-icon-danger" data-id="${batchId}" title="이 차수를 삭제합니다"><i class="material-icons">delete_outline</i></button>` : ''}
                    </div>
                </div>`;
            summarySection.innerHTML = summaryHTML;

            let tableHTML;
            if (allItems.length > 0) {
                 tableHTML = `
                    <table>
                        <thead>
                            <tr><th>출고일</th><th>수취인</th><th>출고지 주소</th><th>출고지시번호</th><th>상품명</th><th>상품코드 (바코드)</th><th>지시수량</th><th>완료수량</th></tr>
                        </thead>
                        <tbody>
                            ${allItems.map(item => `
                                <tr class="${item.picked_quantity >= item.expected_quantity ? 'completed-row' : ''}">
                                    <td>${item.date}</td>
                                    <td>${item.recipient || ''}</td>
                                    <td>${item.destination_address || ''}</td>
                                    <td>${item.order_number}</td>
                                    <td>${item.product_name || '이름 없음'}</td>
                                    <td>${item.barcode}</td>
                                    <td>${item.expected_quantity}</td>
                                    <td>${item.picked_quantity}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>`;
            } else {
                 tableHTML = `<div class="card-body"><p style="text-align:center;">업로드된 주문 상세 내역이 없습니다.</p></div>`;
            }
            detailsSection.innerHTML = tableHTML;

        } catch (error) {
            detailsSection.innerHTML = `<div class="card-body"><p style="color:red;">데이터를 불러오는 중 오류가 발생했습니다: ${error.message}</p></div>`;
            summarySection.innerHTML = '';
        }
    } else {
        detailsSection.innerHTML = `<div class="card-body"><p style="text-align:center;">데이터가 없습니다. 엑셀 파일을 업로드하세요.</p></div>`;
        summarySection.innerHTML = '';
    }
}


async function handleCreateNewBatch() {
    const batchInput = contentArea.querySelector('#batch-number-input');
    const date = contentArea.querySelector('#work-date-picker').value;
    if (!date) { alert('날짜를 먼저 선택하세요.'); return; }
    const { data } = await supabaseClient.from('picking_batches').select('batch_number').eq('channel_id', currentChannelId).eq('batch_date', date);
    const maxBatchNum = data && data.length > 0 ? Math.max(...data.map(b => b.batch_number)) : 0;
    const newBatchNumber = maxBatchNum + 1;
    batchInput.value = newBatchNumber;
    alert(`신규 ${newBatchNumber}차수가 설정되었습니다.`);
    loadBatchDetails();
}

async function handleStandardTemplateDownload() {
    const headers = ["order_number", "recipient", "destination_address", "barcode", "product_name", "expected_quantity"];
    const worksheet = XLSX.utils.json_to_sheet([], { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    XLSX.writeFile(workbook, "standard_order_template.xlsx");
}

async function handleStandardOrderUpload(target) {
    const fileInput = contentArea.querySelector('.standard-excel-input');
    const file = fileInput.files[0];
    if (!file) { return alert("표준 양식 엑셀 파일을 선택하세요."); }
    const { date, batch } = target.dataset;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            let { data: batchData, error: selectError } = await supabaseClient
                .from('picking_batches').select('id').eq('channel_id', currentChannelId).eq('batch_date', date).eq('batch_number', batch).single();
            if (selectError && selectError.code !== 'PGRST116') throw selectError;
            if (!batchData) {
                const { data: newBatchData, error: insertError } = await supabaseClient
                    .from('picking_batches').insert({ channel_id: currentChannelId, batch_date: date, batch_number: batch, status: '대기' }).select('id').single();
                if (insertError) throw insertError;
                batchData = newBatchData;
            }

            const excelData = new Uint8Array(event.target.result);
            const workbook = XLSX.read(excelData, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (jsonData.length === 0) throw new Error('엑셀 파일에 데이터가 없습니다.');

            const orders = {};
            jsonData.forEach(row => {
                if (!row.order_number) return;
                const orderKey = row.order_number.toString();
                if (!orders[orderKey]) {
                    orders[orderKey] = { recipient: row.recipient || '', address: row.destination_address, items: [], total_expected: 0 };
                }
                const quantity = Number(row.expected_quantity) || 0;
                orders[orderKey].items.push({ barcode: row.barcode.toString(), product_name: row.product_name, expected_quantity: quantity });
                orders[orderKey].total_expected += quantity;
            });

            await supabaseClient.from('picking_orders').delete().eq('batch_id', batchData.id);
            for (const orderKey in orders) {
                const orderData = orders[orderKey];
                const { data: insertedOrder, error: orderError } = await supabaseClient.from('picking_orders').insert({
                    batch_id: batchData.id, order_number: orderKey, recipient: orderData.recipient,
                    destination_address: orderData.address, total_expected_quantity: orderData.total_expected
                }).select().single();
                if (orderError) throw orderError;
                const itemsToInsert = orderData.items.map(item => ({ ...item, order_id: insertedOrder.id }));
                await supabaseClient.from('picking_items').insert(itemsToInsert);
            }
            alert(`표준 양식 업로드 성공!`);
            loadBatchDetails();
        } catch (error) { alert('업로드 실패: ' + error.message); }
    };
    reader.readAsArrayBuffer(file);
}

async function handleCornOrderUpload(target) {
    const fileInput = contentArea.querySelector('.corn-excel-input');
    const file = fileInput.files[0];
    if (!file) { return alert("CORN 양식 엑셀 파일을 선택하세요."); }
    const { date, batch } = target.dataset;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const { data: products } = await supabaseClient.from('products').select('product_code, barcode, product_name').eq('channel_id', currentChannelId);
            if (!products || products.length === 0) throw new Error('상품 마스터에 데이터가 없습니다.');
            const productMap = new Map(products.map(p => [p.product_code, p]));

            let { data: batchData, error: selectError } = await supabaseClient
                .from('picking_batches').select('id').eq('channel_id', currentChannelId).eq('batch_date', date).eq('batch_number', batch).single();
            if (selectError && selectError.code !== 'PGRST116') throw selectError;
            if (!batchData) {
                const { data: newBatchData, error: insertError } = await supabaseClient
                    .from('picking_batches').insert({ channel_id: currentChannelId, batch_date: date, batch_number: batch, status: '대기' }).select('id').single();
                if (insertError) throw insertError;
                batchData = newBatchData;
            }

            const excelData = new Uint8Array(event.target.result);
            const workbook = XLSX.read(excelData, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
            const dataRows = rows.slice(1);
            if (dataRows.length === 0) throw new Error('엑셀 파일에 데이터가 없습니다.');

            const orders = {};
            let notFoundCodes = new Set();
            dataRows.forEach(row => {
                const orderKey = row[1];
                if (!orderKey) return;

                const productCode = row[28];
                const productInfo = productMap.get(productCode);
                if (!productInfo) {
                    notFoundCodes.add(productCode);
                    return;
                }

                if (!orders[orderKey]) {
                    orders[orderKey] = {
                        recipient: row[17] || '',
                        address: row[21] || '',
                        items: [],
                        total_expected: 0
                    };
                }

                const quantity = Number(row[34]) || 0;
                const barcode = productInfo.barcode;

                const existingItem = orders[orderKey].items.find(item => item.barcode === barcode);

                if (existingItem) {
                    existingItem.expected_quantity += quantity;
                } else {
                    orders[orderKey].items.push({
                        barcode: barcode,
                        product_name: productInfo.product_name,
                        expected_quantity: quantity
                    });
                }
                orders[orderKey].total_expected += quantity;
            });

            await supabaseClient.from('picking_orders').delete().eq('batch_id', batchData.id);
            for (const orderKey in orders) {
                const orderData = orders[orderKey];
                const { data: insertedOrder, error: orderError } = await supabaseClient.from('picking_orders').insert({
                    batch_id: batchData.id, order_number: orderKey, recipient: orderData.recipient,
                    destination_address: orderData.address, total_expected_quantity: orderData.total_expected
                }).select().single();
                if(orderError) throw orderError;
                const itemsToInsert = orderData.items.map(item => ({ ...item, order_id: insertedOrder.id }));
                await supabaseClient.from('picking_items').insert(itemsToInsert);
            }
            let successMessage = `CORN 양식 업로드 성공!`;
            if (notFoundCodes.size > 0) { successMessage += `\n\n주의: 누락된 상품코드: ${Array.from(notFoundCodes).join(', ')}`; }
            alert(successMessage);
            loadBatchDetails();
        } catch (error) { alert('업로드 실패: ' + error.message); }
    };
    reader.readAsArrayBuffer(file);
}

async function handleDeleteBatch(batchId) {
    if (!batchId || !confirm('이 차수의 모든 출고 데이터가 삭제됩니다. 계속하시겠습니까?')) return;
    const { error } = await supabaseClient.from('picking_batches').delete().eq('id', batchId);
    if (error) { alert('삭제 실패: ' + error.message); }
    else {
        alert('삭제되었습니다.');
        contentArea.querySelector('#batch-details-section').innerHTML = '';
        contentArea.querySelector('#batch-upload-section').innerHTML = '';
        contentArea.querySelector('#batch-summary-section').innerHTML = '';
    }
}

// =================================================================
// 출고 현황 (조회 전용)
// =================================================================
async function showPickingStatus() {
    contentArea.innerHTML = `
        <div class="content-section">
            <div class="sticky-controls">
                <div class="page-header">
                    <h2>출고 현황 조회</h2>
                    <div class="actions-group">
                        <button id="refresh-picking-status-btn" class="btn-secondary">새로고침</button>
                        <button id="download-picking-status-btn" class="btn-primary">엑셀 다운로드</button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body">
                        <label>날짜 선택:</label>
                        <input type="date" id="status-date-picker" value="${new Date().toISOString().split('T')[0]}">
                        <label>차수 선택:</label>
                        <select id="status-batch-selector"><option>날짜를 먼저 선택하세요</option></select>
                    </div>
                </div>
            </div>
            <div class="card" style="flex-grow: 1; display: flex; flex-direction: column;">
                <div class="card-header">출고 진행 현황</div>
                <div class="table-wrapper" style="flex-grow: 1;">
                    <table id="picking-status-table">
                        <thead>
                            <tr>
                                <th>출고지시번호</th>
                                <th>출고지 주소</th>
                                <th>수취인</th>
                                <th>지시수량</th>
                                <th>완료수량</th>
                                <th>상태</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        </div>`;
    const datePicker = contentArea.querySelector('#status-date-picker');
    const batchSelector = contentArea.querySelector('#status-batch-selector');
    await populateStatusBatchSelector(datePicker.value);
    datePicker.addEventListener('change', e => populateStatusBatchSelector(e.target.value));
    batchSelector.addEventListener('change', e => loadPickingOrdersForStatus(e.target.value));
}

async function populateStatusBatchSelector(date) {
    const selector = contentArea.querySelector('#status-batch-selector');
    const tbody = contentArea.querySelector('#picking-status-table tbody');
    selector.innerHTML = `<option>불러오는 중...</option>`;
    if (tbody) tbody.innerHTML = '';
    currentPickingStatusData = [];
    const { data, error } = await supabaseClient.from('picking_batches').select('id, batch_number').eq('batch_date', date).eq('channel_id', currentChannelId).order('batch_number');
    if (error || data.length === 0) {
        selector.innerHTML = `<option>해당 날짜에 차수 없음</option>`;
        if(tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">표시할 데이터가 없습니다.</td></tr>`;
        return;
    }
    selector.innerHTML = `<option value="">-- 차수 선택 --</option>` + data.map(b => `<option value="${b.id}">${b.batch_number}차수</option>`).join('');
}

async function loadPickingOrdersForStatus(batchId) {
    const tbody = contentArea.querySelector('#picking-status-table tbody');
    if (!tbody) return;
    if (!batchId) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">차수를 선택하세요.</td></tr>`; currentPickingStatusData = []; return; }
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">불러오는 중...</td></tr>`;
    const { data, error } = await supabaseClient.from('picking_orders').select(`*`).eq('batch_id', batchId).order('id');

    currentPickingStatusData = data || [];

    if (error || data.length === 0) { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">데이터가 없습니다.</td></tr>`; return; }
    tbody.innerHTML = data.map(order =>
        `<tr>
            <td>${order.order_number}</td>
            <td>${order.destination_address || ''}</td>
            <td>${order.recipient || ''}</td>
            <td>${order.total_expected_quantity}</td>
            <td>${order.total_picked_quantity}</td>
            <td>${order.status}</td>
        </tr>`
    ).join('');
}

// =================================================================
// 상품 마스터 관리
// =================================================================
async function showProductMaster() {
    contentArea.innerHTML = `
    <div id="products-section" class="content-section active">
        <div class="sticky-controls">
            <div class="page-header">
                <h2>상품 마스터 관리</h2>
                <div class="actions-group">
                    <button id="refresh-product-master-btn" class="btn-secondary">새로고침</button>
                    <button id="download-product-master-btn" class="btn-primary">엑셀 다운로드</button>
                </div>
            </div>
            <div class="control-grid">
                <div class="card">
                    <div class="card-header">필터 및 검색</div>
                    <div class="card-body">
                        <input type="text" id="filter-prod-code" class="filter-input" placeholder="상품코드 검색..." value="${currentFilters.product_code || ''}">
                        <input type="text" id="filter-prod-barcode" class="filter-input" placeholder="바코드 검색..." value="${currentFilters.barcode || ''}">
                        <input type="text" id="filter-prod-name" class="filter-input" placeholder="상품명 검색..." value="${currentFilters.product_name || ''}">
                        <button class="search-button btn-primary">검색</button>
                        <button class="reset-button btn-secondary">초기화</button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">데이터 관리 (표준 양식)</div>
                    <div class="card-body">
                        <button class="download-template btn-secondary">양식 다운로드</button>
                        <input type="file" id="upload-file" class="upload-file" accept=".xlsx, .xls">
                        <button class="upload-data btn-primary">업로드 추가</button>
                        <button class="delete-selected btn-danger">선택 삭제</button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">CORN 양식 업로드 (추가/수정)</div>
                    <div class="card-body">
                        <input type="file" id="upload-corn-file" class="upload-file" accept=".xlsx, .xls">
                        <button id="upload-corn-button" class="btn-primary">업로드 실행</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="table-wrapper" style="flex-grow: 1;">
            <div class="table-container"></div>
        </div>
    </div>`;

    const searchButton = contentArea.querySelector('.search-button');
    contentArea.querySelectorAll('.filter-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                searchButton.click();
            }
        });
    });

    await renderProductTable();
}

async function renderProductTable() {
    const tableContainer = contentArea.querySelector('.table-container');
    if (!tableContainer) return;
    tableContainer.innerHTML = '불러오는 중...';
    let query = supabaseClient.from('products').select('*').eq('channel_id', currentChannelId);
    if (currentFilters.product_code) query = query.ilike('product_code', `%${currentFilters.product_code}%`);
    if (currentFilters.barcode) query = query.ilike('barcode', `%${currentFilters.barcode}%`);
    if (currentFilters.product_name) query = query.ilike('product_name', `%${currentFilters.product_name}%`);
    if (currentSort.column) { query = query.order(currentSort.column, { ascending: currentSort.direction === 'asc' }); }
    const { data, error } = await fetchAllWithPagination(query);

    currentProductMasterData = data || [];

    if (error) { tableContainer.innerHTML = `<p>데이터 로딩 오류: ${error.message}</p>`; return; }
    if (data.length === 0) {
        tableContainer.innerHTML = `<p style="text-align:center; padding: 2rem;">표시할 데이터가 없습니다.</p>`;
    } else {
        let tableHTML = `<table><thead><tr><th><input type="checkbox" class="select-all-checkbox"></th><th>No.</th><th class="sortable" data-column="product_code">상품코드</th><th class="sortable" data-column="barcode">바코드</th><th class="sortable" data-column="product_name">상품명</th></tr></thead><tbody>`;
        data.forEach((p, index) => { tableHTML += `<tr><td><input type="checkbox" class="row-checkbox" data-id="${p.id}"></td><td>${index + 1}</td><td>${p.product_code || ''}</td><td>${p.barcode}</td><td>${p.product_name}</td></tr>`; });
        tableHTML += '</tbody></table>';
        tableContainer.innerHTML = tableHTML;
    }
    updateSortIndicator();
}

function updateSortIndicator() {
    const section = contentArea.querySelector('#products-section');
    if (!section) return;
    section.querySelectorAll('.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.column === currentSort.column) {
            th.classList.add(currentSort.direction);
        }
    });
}

async function handleCornUpload() {
    const fileInput = contentArea.querySelector('#upload-corn-file');
    if (!fileInput.files[0]) { return alert('CORN 양식 엑셀 파일을 선택하세요.'); }
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const dataRows = rows.slice(2);
            if (dataRows.length === 0) throw new Error('엑셀 파일에 데이터가 없습니다 (제목 행 제외).');
            const productsToUpsert = dataRows.map(row => ({
                product_code: row[2],
                product_name: row[3],
                barcode: row[10],
                channel_id: currentChannelId
            })).filter(p => p.barcode && p.product_name);
            if (productsToUpsert.length === 0) { throw new Error('업로드할 유효한 상품 데이터가 없습니다. C, D, K 열에 데이터가 있는지 확인하세요.'); }
            const { error } = await supabaseClient.from('products').upsert(productsToUpsert, { onConflict: 'barcode, channel_id' });
            if (error) throw error;
            alert(`총 ${productsToUpsert.length}개의 상품을 성공적으로 추가/수정했습니다.`);
            renderProductTable();
        } catch (error) {
            alert('CORN 양식 업로드 실패: ' + error.message);
        } finally {
            fileInput.value = '';
        }
    };
    reader.readAsArrayBuffer(fileInput.files[0]);
}

async function handleProductUpload() {
    const fileInput = contentArea.querySelector('#upload-file');
    if (!fileInput.files[0]) { return alert('업로드할 엑셀 파일을 선택하세요.'); }
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (jsonData.length === 0) { throw new Error('엑셀 파일에 데이터가 없습니다.'); }
            const dataWithChannel = jsonData.map(item => ({...item, channel_id: currentChannelId }));
            const { error } = await supabaseClient.from('products').upsert(dataWithChannel, { onConflict: 'barcode, channel_id' });
            if (error) throw error;
            alert('상품 마스터 업로드(추가/수정) 성공!');
            renderProductTable();
        } catch (error) { alert('업로드 실패: ' + error.message); } finally { fileInput.value = ''; }
    };
    reader.readAsArrayBuffer(fileInput.files[0]);
}

function handleProductTemplateDownload() {
    const headers = ["product_code", "barcode", "product_name"];
    const worksheet = XLSX.utils.json_to_sheet([], { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
    XLSX.writeFile(workbook, "products_template.xlsx");
}

async function handleDeleteSelectedProducts() {
    const checkedBoxes = contentArea.querySelectorAll('.row-checkbox:checked');
    if (checkedBoxes.length === 0) { return alert('삭제할 항목을 선택하세요.'); }
    if (confirm(`선택된 ${checkedBoxes.length}개의 상품을 삭제하시겠습니까?`)) {
        const idsToDelete = Array.from(checkedBoxes).map(cb => cb.dataset.id);
        const { error } = await supabaseClient.from('products').delete().in('id', idsToDelete);
        if (error) { alert('삭제 실패: ' + error.message); } else { alert('선택한 상품을 삭제했습니다.'); renderProductTable(); }
    }
}

async function fetchAllWithPagination(query, pageSize = 1000) {
    let allData = [];
    let page = 0;
    while (true) {
        const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) return { data: null, error };
        if (data.length > 0) allData = allData.concat(data);
        if (data.length < pageSize) break;
        page++;
    }
    return { data: allData, error: null };
}

async function showUserManagement() {
    contentArea.innerHTML = `
        <div class="content-section">
            <div class="page-header">
                <h2>사용자 관리</h2>
                <div class="actions-group">
                    <button id="refresh-users-btn" class="btn-secondary">새로고침</button>
                </div>
            </div>
            <div class="card">
                <div class="card-header">사용자 목록</div>
                <ul id="user-list" class="management-list"></ul>
            </div>
        </div>`;
    await loadUsers();
}

async function loadUsers() {
    const list = contentArea.querySelector('#user-list');
    list.innerHTML = `<li>불러오는 중...</li>`;
    const { data, error } = await supabaseClient.rpc('list_all_users');
    if (error) { list.innerHTML = `<li>사용자 목록 로딩 오류: ${error.message}</li>`; return; }
    if (!data || data.length === 0) { list.innerHTML = `<li>가입한 사용자가 없습니다.</li>`; return; }

    list.innerHTML = data.map(user => {
        const isAdmin = user.user_metadata && user.user_metadata.is_admin === true;
        const isSuperAdmin = user.email === 'eowert72@gmail.com';
        
        const isApproved = isAdmin || isSuperAdmin;

        const statusClass = isApproved ? 'status-approved' : 'status-pending';
        const statusText = isApproved ? '승인 완료' : '승인 대기';
        
        let actionButton = '';
        if (!isAdmin && !isSuperAdmin) {
            actionButton = `<button class="btn-approve approve-user-button" data-id="${user.id}">승인</button>`;
        }

        return `<li class="management-list-item">
                    <span>${user.email}</span>
                    <div>
                        <span class="user-status ${statusClass}">${statusText}</span>
                        ${actionButton}
                    </div>
                </li>`;
    }).join('');
}


async function handleApproveUser(e) {
    const userId = e.target.dataset.id;
    if (confirm('이 사용자를 승인하고 관리자 권한을 부여하시겠습니까?')) {
        const { data, error } = await supabaseClient.rpc('approve_and_grant_admin', {
            user_id_to_approve: userId
        });

        if (error) {
            alert('승인 실패: ' + error.message);
        } else {
            alert(data || '사용자가 승인되었습니다.');
            showUserManagement();
        }
    }
}

logoutButton.addEventListener('click', async () => {
    if (confirm('로그아웃하시겠습니까?')) {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    }
});