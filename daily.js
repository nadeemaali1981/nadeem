// Daily Journal (دفتر اليومية المطور) - Logic & Calculations

let state = {
  date: new Date().toISOString().split('T')[0],
  dayName: '',
  sales: {
    cash: 0,
    delivery: 0,
    visa: 0,
    ittihad: 0,
    ittihad_qr: 0,
    cliq: 0,
    items_count: 0
  },
  deposits: {
    personal: 0,
    business: 0,
    personal_date: '',
    business_date: ''
  },
  perfume: {
    desc: '',
    debit: 0,
    credit: 0
  },
  notes: '',
  priorUndepositedCash: 0,
  priorPerfumeSales: 0,
  items: {
    internal_expenses: [],
    employee_advances: [],
    supplier_payments: [],
    cash_purchases: [],
    perfume_sales: [],
    daily_obligations: [],
    merchant_dispatches: [],
    employee_sales: [],
    extra_revenues: [],
    revenue_expenses: [],
    daily_notes: []
  }
};

let autoSaveTimer = null;

// Day Names in Arabic
const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadSheet(state.date);
});

function setupEventListeners() {
  const dateInput = document.getElementById('sheetDateInput');
  if (dateInput) {
    dateInput.value = state.date;
    dateInput.addEventListener('change', (e) => {
      state.date = e.target.value;
      loadSheet(state.date);
    });
  }

  // Prev / Next day buttons
  document.getElementById('btnPrevDay')?.addEventListener('click', () => changeDay(-1));
  document.getElementById('btnNextDay')?.addEventListener('click', () => changeDay(1));
  document.getElementById('btnToday')?.addEventListener('click', () => {
    state.date = new Date().toISOString().split('T')[0];
    if (dateInput) dateInput.value = state.date;
    loadSheet(state.date);
  });

  // Action Buttons
  document.getElementById('btnSaveManual')?.addEventListener('click', () => saveSheet(true));
  document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
  document.getElementById('btnHistory')?.addEventListener('click', openHistoryModal);
  document.getElementById('btnCloseHistory')?.addEventListener('click', closeHistoryModal);
  document.getElementById('btnClearAllDailySheets')?.addEventListener('click', handleClearAllDailySheets);

  // Bind Sales and Deposits Inputs
  const salesInputs = document.querySelectorAll('.sales-binding');
  salesInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      const field = e.target.dataset.field;
      if (field === 'sales_items_count') {
        const val = parseInt(e.target.value, 10) || 0;
        state.sales.items_count = val;
        if (val > 0) {
          e.target.style.borderColor = '';
          e.target.style.boxShadow = '';
          e.target.classList.remove('input-error');
        }
      } else {
        const numVal = parseMoney(e.target.value);
        if (field.startsWith('deposit_')) {
          const sub = field.replace('deposit_', '');
          state.deposits[sub] = numVal;
        } else {
          state.sales[field] = numVal;
        }
      }
      recalculateAll();
      triggerAutoSave();
    });

    input.addEventListener('blur', (e) => {
      const field = e.target.dataset.field;
      if (field !== 'sales_items_count') {
        const n = parseMoney(e.target.value);
        e.target.value = n > 0 ? formatMoney(n) : '';
      }
    });
  });

  // Bind Deposit Date Inputs
  document.querySelectorAll('.deposit-date-binding').forEach(input => {
    input.addEventListener('change', (e) => {
      const field = e.target.dataset.field;
      if (field === 'deposit_personal_date') {
        state.deposits.personal_date = e.target.value;
      } else if (field === 'deposit_business_date') {
        state.deposits.business_date = e.target.value;
      }
      triggerAutoSave();
    });
  });

  // Notes
  const notesEl = document.getElementById('notesTextarea');
  if (notesEl) {
    notesEl.addEventListener('input', (e) => {
      state.notes = e.target.value;
      triggerAutoSave();
    });
  }

  // Perfumes Inputs
  ['perfume_desc', 'perfume_debit', 'perfume_credit'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', (e) => {
        if (id === 'perfume_desc') state.perfume.desc = e.target.value;
        if (id === 'perfume_debit') state.perfume.debit = parseMoney(e.target.value);
        if (id === 'perfume_credit') state.perfume.credit = parseMoney(e.target.value);
        recalculateAll();
        triggerAutoSave();
      });
    }
  });
}

function changeDay(delta) {
  const d = new Date(state.date + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  state.date = d.toISOString().split('T')[0];
  const dateInput = document.getElementById('sheetDateInput');
  if (dateInput) dateInput.value = state.date;
  loadSheet(state.date);
}

// Fetch Sheet from Server
async function loadSheet(dateStr) {
  showToast('جاري تحميل اليومية...');
  try {
    const res = await fetch(`/api/daily-sheet?date=${dateStr}`);
    if (!res.ok) throw new Error('فشل جلب بيانات اليومية');
    const data = await res.json();

    // Map server data to state
    const dObj = new Date(dateStr + 'T00:00:00');
    state.dayName = data.day_name || (!isNaN(dObj) ? DAY_NAMES[dObj.getDay()] : '');

    state.sales = {
      cash: data.sales_cash || 0,
      delivery: data.sales_delivery || 0,
      visa: data.sales_visa || 0,
      ittihad: data.sales_ittihad || 0,
      ittihad_qr: data.sales_ittihad_qr || 0,
      cliq: data.sales_cliq || 0,
      items_count: data.sales_items_count || 0
    };

    state.deposits = {
      personal: data.deposit_personal || 0,
      business: data.deposit_business || 0,
      personal_date: data.deposit_personal_date || state.sheet_date || '',
      business_date: data.deposit_business_date || state.sheet_date || ''
    };

    state.notes = data.notes || '';
    state.priorUndepositedCash = Number(data.prior_undeposited_cash || 0);
    state.priorPerfumeSales = Number(data.prior_perfume_sales || 0);
    state.perfume = {
      desc: data.perfume_desc || '',
      debit: data.perfume_debit || 0,
      credit: data.perfume_credit || 0
    };

    state.items = {
      internal_expenses: (data.items && data.items.internal_expenses) || [],
      employee_advances: (data.items && data.items.employee_advances) || [],
      supplier_payments: (data.items && data.items.supplier_payments) || [],
      cash_purchases: (data.items && data.items.cash_purchases) || [],
      perfume_sales: (data.items && data.items.perfume_sales) || [],
      merchant_dispatches: (data.items && data.items.merchant_dispatches) || [],
      employee_sales: (data.items && data.items.employee_sales) || [],
      extra_revenues: (data.items && data.items.extra_revenues) || [],
      revenue_expenses: (data.items && data.items.revenue_expenses) || [],
      daily_notes: (data.items && data.items.daily_notes) || []
    };

    // If daily_notes is empty but notes exists from legacy sheet
    if ((!state.items.daily_notes || state.items.daily_notes.length === 0) && data.notes && data.notes.trim()) {
      const lines = data.notes.split('\n').map(l => l.trim()).filter(Boolean);
      state.items.daily_notes = lines.map(line => {
        const cleaned = line.replace(/^#\d+[:\- ]\s*/, '');
        return { col1: cleaned, amount1: 0, amount2: 0 };
      });
    }

    // If perfume_sales is empty but perfume data exists from legacy fields
    if (state.items.perfume_sales.length === 0 && (state.perfume.desc || state.perfume.debit || state.perfume.credit)) {
      state.items.perfume_sales.push({
        col1: state.perfume.desc || '',
        amount1: state.perfume.debit || 0,
        amount2: state.perfume.credit || 0
      });
    }

    // Filter out any blank rows without data
    filterEmptyRows();

    renderUI();
    recalculateAll();
    showToast('تم تحميل اليومية بنجاح');
  } catch (err) {
    console.error(err);
    showToast('حدث خطأ أثناء تحميل اليومية');
  }
}

// Clean up all empty rows across all dynamic tables
function filterEmptyRows() {
  const allCategories = [
    'internal_expenses', 'employee_advances', 'supplier_payments',
    'cash_purchases', 'perfume_sales', 'merchant_dispatches',
    'employee_sales', 'extra_revenues', 'revenue_expenses', 'daily_notes'
  ];

  for (const cat of allCategories) {
    if (state.items[cat]) {
      state.items[cat] = state.items[cat].filter(r =>
        (r.col1 && String(r.col1).trim() !== '') ||
        (r.col2 && String(r.col2).trim() !== '') ||
        (r.col3 && String(r.col3).trim() !== '') ||
        (r.col4 && String(r.col4).trim() !== '') ||
        (r.col5 && String(r.col5).trim() !== '') ||
        (parseFloat(r.amount1) > 0) ||
        (parseFloat(r.amount2) > 0)
      );
    }
  }
}

// Render DOM from State
function renderUI() {
  // Update Header Date & Day
  const dayBadge = document.getElementById('dayNameBadge');
  if (dayBadge) dayBadge.textContent = state.dayName || 'اليوم';

  const printDateBadge = document.getElementById('printDateText');
  if (printDateBadge) printDateBadge.textContent = `${state.dayName} - ${state.date}`;

  // Populate Sales Inputs
  for (const [k, v] of Object.entries(state.sales)) {
    const input = document.getElementById(`input_sales_${k}`);
    if (input) {
      if (k === 'items_count') {
        input.value = v > 0 ? v : '';
        if (v > 0) {
          input.style.borderColor = '';
          input.style.boxShadow = '';
        }
      } else {
        input.value = v > 0 ? formatMoney(v) : '';
      }
    }
  }

  // Populate Deposits
  const depPersonal = document.getElementById('input_deposit_personal');
  if (depPersonal) depPersonal.value = state.deposits.personal > 0 ? formatMoney(state.deposits.personal) : '';
  const depPersonalDate = document.getElementById('input_deposit_personal_date');
  if (depPersonalDate) depPersonalDate.value = state.deposits.personal_date || state.sheet_date || '';

  const depBiz = document.getElementById('input_deposit_business');
  if (depBiz) depBiz.value = state.deposits.business > 0 ? formatMoney(state.deposits.business) : '';
  const depBizDate = document.getElementById('input_deposit_business_date');
  if (depBizDate) depBizDate.value = state.deposits.business_date || state.sheet_date || '';

  // Notes
  const notesEl = document.getElementById('notesTextarea');
  if (notesEl) notesEl.value = state.notes;

  // Render Tables
  renderSimpleTable('internal_expenses', 'internalExpensesBody', 'بيان المصروف');
  renderSimpleTable('employee_advances', 'employeeAdvancesBody', 'الرقم الوظيفي / اسم الموظف');
  renderSimpleTable('supplier_payments', 'supplierPaymentsBody', 'اسم المورد');
  renderSimpleTable('cash_purchases', 'cashPurchasesBody', 'بيان المشتريات');
  renderPerfumeSalesTable();
  renderExtraRevenuesTable();
  renderEmployeeSalesTable();
  renderMerchantDispatchesTable();
  renderDailyNotesTable();
}

// Render Perfume Sales Table (البيان، دائن، مدين)
function renderPerfumeSalesTable() {
  const tbody = document.getElementById('perfumeSalesBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.items.perfume_sales || state.items.perfume_sales.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="4">لا توجد بيانات مسجلة (<span onclick="addRow('perfume_sales')">+ أضف سطر</span>)</td>
      </tr>
    `;
    return;
  }

  state.items.perfume_sales.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col1 || '')}" placeholder="البيان"
               oninput="updateRowCol('perfume_sales', ${idx}, 'col1', this.value)">
      </td>
      <td style="width: 75px;">
        <input type="text" inputmode="decimal" class="table-input num" value="${row.amount2 > 0 ? formatMoney(row.amount2) : ''}" placeholder="0:00"
               oninput="updateRowAmount('perfume_sales', ${idx}, 'amount2', this.value)"
               onblur="this.value = parseMoney(this.value) > 0 ? formatMoney(parseMoney(this.value)) : ''">
      </td>
      <td style="width: 75px;">
        <input type="text" inputmode="decimal" class="table-input num" value="${row.amount1 > 0 ? formatMoney(row.amount1) : ''}" placeholder="0:00"
               oninput="updateRowAmount('perfume_sales', ${idx}, 'amount1', this.value)"
               onblur="this.value = parseMoney(this.value) > 0 ? formatMoney(parseMoney(this.value)) : ''">
      </td>
      <td style="width: 38px; text-align: center;">
        <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteRow('perfume_sales', ${idx})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Standard 2-Column Table (Description & Amount)
function renderSimpleTable(categoryKey, tbodyId, placeholder) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.items[categoryKey] || state.items[categoryKey].length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="3">لا توجد بيانات مسجلة (<span onclick="addRow('${categoryKey}')">+ أضف سطر</span>)</td>
      </tr>
    `;
    return;
  }

  state.items[categoryKey].forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col1 || '')}" placeholder="${placeholder}"
               oninput="updateRowCol('${categoryKey}', ${idx}, 'col1', this.value)">
      </td>
      <td style="width: 130px;">
        <input type="text" inputmode="decimal" class="table-input num" value="${row.amount1 > 0 ? formatMoney(row.amount1) : ''}" placeholder="0:00"
               oninput="updateRowAmount('${categoryKey}', ${idx}, 'amount1', this.value)"
               onblur="this.value = parseMoney(this.value) > 0 ? formatMoney(parseMoney(this.value)) : ''">
      </td>
      <td style="width: 38px; text-align: center;">
        <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteRow('${categoryKey}', ${idx})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Employee Sales Table (المبيعات اليومية للموظف)
function renderEmployeeSalesTable() {
  const tbody = document.getElementById('employeeSalesBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.items.employee_sales || state.items.employee_sales.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="4" style="padding: 1.25rem;">لا توجد مبيعات موظفين مسجلة اليوم (<span onclick="addRow('employee_sales')">+ إضافة موظف</span>)</td>
      </tr>
    `;
    return;
  }

  state.items.employee_sales.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col1 || '')}" placeholder="اسم الموظف"
               oninput="updateRowCol('employee_sales', ${idx}, 'col1', this.value)">
      </td>
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col2 || '')}" placeholder="الرقم الوظيفي"
               oninput="updateRowCol('employee_sales', ${idx}, 'col2', this.value)">
      </td>
      <td>
        <input type="text" inputmode="decimal" class="table-input num" value="${row.amount1 > 0 ? formatMoney(row.amount1) : ''}" placeholder="0:00"
               oninput="updateRowAmount('employee_sales', ${idx}, 'amount1', this.value)"
               onblur="this.value = parseMoney(this.value) > 0 ? formatMoney(parseMoney(this.value)) : ''">
      </td>
      <td style="width: 38px; text-align: center;">
        <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteRow('employee_sales', ${idx})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Merchant Dispatches (سند اخراج بضاعة/فروع)
function renderMerchantDispatchesTable() {
  const tbody = document.getElementById('merchantDispatchesBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.items.merchant_dispatches || state.items.merchant_dispatches.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="8" style="padding: 1.25rem;">لا توجد بضاعة مخرجة أو محولة اليوم (<span onclick="addRow('merchant_dispatches')">+ إضافة صنف / سطر</span>)</td>
      </tr>
    `;
    return;
  }

  state.items.merchant_dispatches.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const total = (parseFloat(row.amount1) || 0) * (parseFloat(row.amount2) || 0);

    tr.innerHTML = `
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col1 || '')}" placeholder="رقم الموديل"
               oninput="updateRowCol('merchant_dispatches', ${idx}, 'col1', this.value)">
      </td>
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col2 || '')}" placeholder="الصنف"
               oninput="updateRowCol('merchant_dispatches', ${idx}, 'col2', this.value)">
      </td>
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col3 || '')}" placeholder="الماركة"
               oninput="updateRowCol('merchant_dispatches', ${idx}, 'col3', this.value)">
      </td>
      <td>
        <input type="number" step="any" class="table-input num" value="${row.amount1 > 0 ? row.amount1 : ''}" placeholder="الكمية"
               oninput="updateRowAmount('merchant_dispatches', ${idx}, 'amount1', this.value)">
      </td>
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col4 || '')}" placeholder="التاجر / الفرع / العميل"
               oninput="updateRowCol('merchant_dispatches', ${idx}, 'col4', this.value)">
      </td>
      <td>
        <input type="text" inputmode="decimal" class="table-input num" value="${row.amount2 > 0 ? formatMoney(row.amount2) : ''}" placeholder="0:00"
               oninput="updateRowAmount('merchant_dispatches', ${idx}, 'amount2', this.value)"
               onblur="this.value = parseMoney(this.value) > 0 ? formatMoney(parseMoney(this.value)) : ''">
      </td>
      <td style="font-weight: 700; text-align: center; direction: ltr;">
        ${formatMoney(total)}
      </td>
      <td style="width: 38px; text-align: center;">
        <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteRow('merchant_dispatches', ${idx})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Extra Revenues Table
function renderExtraRevenuesTable() {
  const tbody = document.getElementById('extraRevenuesBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.items.extra_revenues || state.items.extra_revenues.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="3">لا توجد إيرادات إضافية (<span onclick="addRow('extra_revenues')">+ أضف سطر</span>)</td>
      </tr>
    `;
    return;
  }

  state.items.extra_revenues.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col1 || '')}" placeholder="نوع الإيراد (مثلاً: فرق توصيل)"
               oninput="updateRowCol('extra_revenues', ${idx}, 'col1', this.value)">
      </td>
      <td style="width: 130px;">
        <input type="text" inputmode="decimal" class="table-input num" value="${row.amount1 > 0 ? formatMoney(row.amount1) : ''}" placeholder="0:00"
               oninput="updateRowAmount('extra_revenues', ${idx}, 'amount1', this.value)"
               onblur="this.value = parseMoney(this.value) > 0 ? formatMoney(parseMoney(this.value)) : ''">
      </td>
      <td style="width: 38px; text-align: center;">
        <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteRow('extra_revenues', ${idx})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Revenue Expenses Table
function renderRevenueExpensesTable() {
  const tbody = document.getElementById('revenueExpensesBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.items.revenue_expenses || state.items.revenue_expenses.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="3">لا توجد مصروفات إيرادات (<span onclick="addRow('revenue_expenses')">+ أضف سطر</span>)</td>
      </tr>
    `;
    return;
  }

  state.items.revenue_expenses.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col1 || '')}" placeholder="بيان مصروف الإيرادات"
               oninput="updateRowCol('revenue_expenses', ${idx}, 'col1', this.value)">
      </td>
      <td style="width: 130px;">
        <input type="text" inputmode="decimal" class="table-input num" value="${row.amount1 > 0 ? formatMoney(row.amount1) : ''}" placeholder="0:00"
               oninput="updateRowAmount('revenue_expenses', ${idx}, 'amount1', this.value)"
               onblur="this.value = parseMoney(this.value) > 0 ? formatMoney(parseMoney(this.value)) : ''">
      </td>
      <td style="width: 38px; text-align: center;">
        <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteRow('revenue_expenses', ${idx})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Daily Notes Table (الملاحظات اليومية المرقمة تسلسلياً)
function renderDailyNotesTable() {
  const tbody = document.getElementById('dailyNotesBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.items.daily_notes || state.items.daily_notes.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="3" style="padding: 1.1rem; text-align: center; color: #854d0e;">
          لا توجد ملاحظات مسجلة اليوم (<span onclick="addRow('daily_notes')" style="color: #b45309; cursor: pointer; text-decoration: underline; font-weight: 700;">+ أضف ملاحظة</span>)
        </td>
      </tr>
    `;
    return;
  }

  state.items.daily_notes.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="width: 75px; text-align: center; font-weight: 800; color: #854d0e; background: #fefce8; font-size: 0.85rem;">
        #${idx + 1}
      </td>
      <td>
        <input type="text" class="table-input" value="${escapeHtml(row.col1 || '')}" placeholder="اكتب نص الملاحظة هنا..."
               oninput="updateRowCol('daily_notes', ${idx}, 'col1', this.value)">
      </td>
      <td style="width: 45px; text-align: center;">
        <button type="button" class="btn-del-row" title="حذف الملاحظة" onclick="deleteRow('daily_notes', ${idx})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Helper: Add / Delete Rows
window.addRow = function(categoryKey) {
  if (!state.items[categoryKey]) state.items[categoryKey] = [];
  state.items[categoryKey].push({ col1: '', col2: '', col3: '', col4: '', col5: '', amount1: 0, amount2: 0 });
  renderUI();
  recalculateAll();
  triggerAutoSave();
};

window.deleteRow = function(categoryKey, idx) {
  state.items[categoryKey].splice(idx, 1);
  renderUI();
  recalculateAll();
  triggerAutoSave();
};

window.updateRowCol = function(categoryKey, idx, colKey, val) {
  if (state.items[categoryKey][idx]) {
    state.items[categoryKey][idx][colKey] = val;
    triggerAutoSave();
  }
};

window.updateRowAmount = function(categoryKey, idx, amountKey, val) {
  if (state.items[categoryKey] && state.items[categoryKey][idx]) {
    state.items[categoryKey][idx][amountKey] = parseMoney(val);
    recalculateAll();
    // If merchant dispatches, update the total cell directly without stealing input focus
    if (categoryKey === 'merchant_dispatches') {
      const tbody = document.getElementById('merchantDispatchesBody');
      if (tbody && tbody.children[idx]) {
        const totalCell = tbody.children[idx].children[6];
        if (totalCell) {
          const tot = (parseFloat(state.items[categoryKey][idx].amount1) || 0) * (parseFloat(state.items[categoryKey][idx].amount2) || 0);
          totalCell.textContent = formatMoney(tot);
        }
      }
    }
    triggerAutoSave();
  }
};

// Calculate all Totals and KPIs
function recalculateAll() {
  // 1. Sales Total
  const totalSales = (state.sales.cash || 0) +
                     (state.sales.delivery || 0) +
                     (state.sales.visa || 0) +
                     (state.sales.ittihad || 0) +
                     (state.sales.ittihad_qr || 0) +
                     (state.sales.cliq || 0);

  setText('totalSalesVal', formatMoney(totalSales));
  setText('kpiTotalSales', formatMoney(totalSales));

  // 2. Deposits Total
  const totalDeposits = (state.deposits.personal || 0) + (state.deposits.business || 0);
  setText('totalDepositsVal', formatMoney(totalDeposits));
  setText('kpiTotalDeposits', formatMoney(totalDeposits));

  // Remaining after deposits
  const remainingSales = totalSales - totalDeposits;
  setText('remainingVal', formatMoney(remainingSales));

  // 3. Category Sums
  const sumInternalExpenses = sumCategory('internal_expenses', 'amount1');
  const sumEmployeeAdvances = sumCategory('employee_advances', 'amount1');
  const sumSupplierPayments = sumCategory('supplier_payments', 'amount1');
  const sumCashPurchases = sumCategory('cash_purchases', 'amount1');
  const sumExtraRevenues = sumCategory('extra_revenues', 'amount1');
  const sumRevenueExpenses = sumCategory('revenue_expenses', 'amount1');

  // Merchant dispatches total
  let sumDispatchesTotal = 0;
  state.items.merchant_dispatches.forEach(r => {
    sumDispatchesTotal += (parseFloat(r.amount1) || 0) * (parseFloat(r.amount2) || 0);
  });

  // Perfume Sales
  let sumPerfumeDebit = sumCategory('perfume_sales', 'amount1');
  let sumPerfumeCredit = sumCategory('perfume_sales', 'amount2');
  if ((!state.items.perfume_sales || state.items.perfume_sales.length === 0) && (state.perfume.debit || state.perfume.credit)) {
    sumPerfumeDebit = state.perfume.debit || 0;
    sumPerfumeCredit = state.perfume.credit || 0;
  }

  // Footers
  setText('sumInternalExpenses', formatMoney(sumInternalExpenses));
  setText('sumEmployeeAdvances', formatMoney(sumEmployeeAdvances));
  setText('sumSupplierPayments', formatMoney(sumSupplierPayments));
  setText('sumCashPurchases', formatMoney(sumCashPurchases));
  setText('sumPerfumeDebit', formatMoney(sumPerfumeDebit));
  setText('sumPerfumeCredit', formatMoney(sumPerfumeCredit));
  setText('sumExtraRevenues', formatMoney(sumExtraRevenues));
  setText('sumRevenueExpenses', formatMoney(sumRevenueExpenses));
  setText('sumMerchantDispatches', formatMoney(sumDispatchesTotal));
  const sumEmployeeSales = sumCategory('employee_sales', 'amount1');
  setText('sumEmployeeSales', formatMoney(sumEmployeeSales));

  // KPIs
  const totalExpenses = sumInternalExpenses;
  setText('kpiExpenses', formatMoney(totalExpenses));
  setText('kpiCashPurchases', formatMoney(sumCashPurchases));

  setText('kpiEmployeeAdvances', formatMoney(sumEmployeeAdvances));
  setText('kpiSupplierPayments', formatMoney(sumSupplierPayments));

  // Perfume Sales KPI (اليوم الحالي) - لا تتأثر بالمدين وتعرض مبيعات العطور (دائن) فقط
  setText('kpiPerfumeSales', formatMoney(sumPerfumeCredit));
  setText('kpiPerfumeSub', `دائن: ${formatMoney(sumPerfumeCredit)} | مدين: ${formatMoney(sumPerfumeDebit)}`);

  // إجمالي العطور KPI (تراكمي لجميع دفاتر اليومية) - أي قيمة مدين تخصم من إجمالي العطور
  const totalPerfumes = (state.priorPerfumeSales || 0) + (sumPerfumeCredit - sumPerfumeDebit);
  setText('kpiTotalPerfumeSales', formatMoney(totalPerfumes));

  // 1. معادلة الصندوق الحالي لليوم:
  // (مجموع المبيعات النقدية + مبيعات التوصيل + إيرادات أخرى) - (مجموع المصاريف + مسحوبات الموظفين + دفعات الموردين + المشتريات النقدية + دائن مبيعات العطور)
  const salesCash = state.sales.cash || 0;
  const salesDelivery = state.sales.delivery || 0;
  const netCashRemaining = (salesCash + salesDelivery + sumExtraRevenues) - (sumInternalExpenses + sumEmployeeAdvances + sumSupplierPayments + sumCashPurchases + sumPerfumeCredit);

  setText('kpiNetCash', formatMoney(netCashRemaining));
  const kpiNetCard = document.getElementById('kpiNetCashCard');
  if (kpiNetCard) {
    if (netCashRemaining >= 0) {
      kpiNetCard.style.borderRightColor = '#10b981';
    } else {
      kpiNetCard.style.borderRightColor = '#ef4444';
    }
  }

  // 2. إجمالي الصندوق (التراكمي لجميع الأيام غير المودعة):
  // جمع جميع قيم الصندوق الحالي التي لم يتم إيداعها (المتبقي من الأيام السابقة + حركة الصندوق لليوم - إيداعات اليوم)
  const totalCashInSafe = (state.priorUndepositedCash || 0) + (netCashRemaining - totalDeposits);
  setText('kpiTotalCashInSafe', formatMoney(totalCashInSafe));
  const kpiTotalSafeCard = document.getElementById('kpiTotalSafeCard');
  if (kpiTotalSafeCard) {
    if (totalCashInSafe >= 0) {
      kpiTotalSafeCard.style.borderRightColor = '#059669';
    } else {
      kpiTotalSafeCard.style.borderRightColor = '#ef4444';
    }
  }
}

function parseMoney(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val).trim();
  const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  for (let i = 0; i < 10; i++) {
    str = str.split(arabicDigits[i]).join(String(i));
  }
  const persianDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
  for (let i = 0; i < 10; i++) {
    str = str.split(persianDigits[i]).join(String(i));
  }
  str = str.replace(/,/g, '').replace(/،/g, '').replace(':', '.').trim();
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function sumCategory(cat, key) {
  let s = 0;
  if (state.items[cat]) {
    for (const item of state.items[cat]) {
      s += parseMoney(item[key]);
    }
  }
  return s;
}

function formatMoney(num) {
  const n = parseFloat(num) || 0;
  const parts = (Math.round(n * 100) / 100).toFixed(2).split('.');
  const integerPart = Math.abs(Number(parts[0])).toLocaleString('en-US');
  const sign = n < 0 ? '-' : '';
  return sign + integerPart + ':' + parts[1];
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Auto Save with Debounce
function triggerAutoSave() {
  clearTimeout(autoSaveTimer);
  const statusEl = document.getElementById('autoSaveBadge');
  if (statusEl) {
    statusEl.textContent = 'جاري الحفظ...';
    statusEl.style.color = '#d97706';
  }

  autoSaveTimer = setTimeout(() => {
    saveSheet(false);
  }, 1200);
}

async function saveSheet(isManual = false) {
  // 1. التحقق الإجباري من إدخال عدد القطع المباعة
  const itemsCountInput = document.getElementById('input_sales_items_count');
  const itemsCountVal = itemsCountInput ? itemsCountInput.value.trim() : '';
  const parsedCount = parseInt(itemsCountVal, 10);

  if (!itemsCountVal || isNaN(parsedCount) || parsedCount <= 0) {
    if (itemsCountInput) {
      itemsCountInput.focus();
      itemsCountInput.style.borderColor = '#dc2626';
      itemsCountInput.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.25)';
      itemsCountInput.classList.add('input-error');
    }
    const statusEl = document.getElementById('autoSaveBadge');
    if (statusEl) {
      statusEl.textContent = 'لم يتم الحفظ: يجب كتابة عدد القطع المباعة!';
      statusEl.style.color = '#dc2626';
    }
    showToast('⚠️ يرجى كتابة عدد القطع المباعة (حقل إجباري لإتمام الحفظ)');
    if (isManual) {
      alert('⚠️ تنبيه: خانة عدد القطع المباعة إجبارية! يرجى كتابة عدد القطع المباعة أولاً ليتم حفظ اليومية.');
    }
    return false;
  }

  try {
    const allCategories = [
      'internal_expenses', 'employee_advances', 'supplier_payments',
      'cash_purchases', 'perfume_sales', 'merchant_dispatches',
      'employee_sales', 'extra_revenues', 'daily_notes'
    ];
    const cleanedItems = {};
    for (const cat of allCategories) {
      cleanedItems[cat] = (state.items[cat] || []).filter(r =>
        (r.col1 && String(r.col1).trim() !== '') ||
        (r.col2 && String(r.col2).trim() !== '') ||
        (r.col3 && String(r.col3).trim() !== '') ||
        (r.col4 && String(r.col4).trim() !== '') ||
        (r.col5 && String(r.col5).trim() !== '') ||
        (parseFloat(r.amount1) > 0) ||
        (parseFloat(r.amount2) > 0)
      );
    }

    const notesSummary = (cleanedItems.daily_notes || [])
      .map((r, i) => `#${i + 1}: ${r.col1 || ''}`)
      .filter(Boolean)
      .join('\n');

    const payload = {
      sheet_date: state.date,
      day_name: state.dayName,
      sales_cash: state.sales.cash,
      sales_delivery: state.sales.delivery,
      sales_visa: state.sales.visa,
      sales_ittihad: state.sales.ittihad,
      sales_ittihad_qr: state.sales.ittihad_qr,
      sales_cliq: state.sales.cliq,
      sales_items_count: state.sales.items_count,
      deposit_personal: state.deposits.personal,
      deposit_business: state.deposits.business,
      deposit_personal_date: state.deposits.personal_date || '',
      deposit_business_date: state.deposits.business_date || '',
      notes: notesSummary || state.notes || '',
      perfume_desc: state.perfume.desc,
      perfume_debit: state.perfume.debit,
      perfume_credit: state.perfume.credit,
      items: cleanedItems
    };

    const res = await fetch('/api/daily-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('فشل حفظ البيانات في الخادم');
    const savedData = await res.json();
    if (savedData && savedData.prior_undeposited_cash !== undefined) {
      state.priorUndepositedCash = Number(savedData.prior_undeposited_cash || 0);
    }
    if (savedData && savedData.prior_perfume_sales !== undefined) {
      state.priorPerfumeSales = Number(savedData.prior_perfume_sales || 0);
    }
    recalculateAll();

    const statusEl = document.getElementById('autoSaveBadge');
    if (statusEl) {
      statusEl.textContent = 'تم الحفظ تلقائياً';
      statusEl.style.color = '#059669';
    }

    if (isManual) {
      showToast('تم حفظ اليومية بنجاح!');
    }
  } catch (err) {
    console.error(err);
    const statusEl = document.getElementById('autoSaveBadge');
    if (statusEl) {
      statusEl.textContent = 'خطأ في الحفظ';
      statusEl.style.color = '#dc2626';
    }
    if (isManual) showToast('حدث خطأ أثناء الحفظ');
  }
}

// History Modal
async function openHistoryModal() {
  const modal = document.getElementById('historyModal');
  const tbody = document.getElementById('historyListBody');
  if (!modal || !tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">جاري التحميل...</td></tr>';
  modal.classList.add('open');

  try {
    const res = await fetch('/api/daily-sheets-history');
    const list = await res.json();

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem;">لا توجد يوميات مسجلة سابقاً</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    list.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700;">${item.sheet_date} (${item.day_name || ''})</td>
        <td style="text-align:left; direction:ltr; font-weight:700; color:#1e3a8a;">${formatMoney(item.total_sales || 0)}</td>
        <td style="text-align:left; direction:ltr; color:#dc2626;">${formatMoney(item.total_expenses || 0)}</td>
        <td style="text-align:left; direction:ltr;">${formatMoney(item.total_deposits || 0)}</td>
        <td style="text-align:center;">
          <button class="btn btn-secondary btn-sm" onclick="selectHistoryDay('${item.sheet_date}')">فتح اليومية</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#dc2626;">فشل تحميل السجل</td></tr>';
  }
}

function closeHistoryModal() {
  const modal = document.getElementById('historyModal');
  if (modal) modal.classList.remove('open');
}

window.selectHistoryDay = function(dateStr) {
  state.date = dateStr;
  const dateInput = document.getElementById('sheetDateInput');
  if (dateInput) dateInput.value = state.date;
  closeHistoryModal();
  loadSheet(state.date);
};

// Clear all daily sheets across all days (تفريغ حقول دفتر اليومية لجميع الأيام)
async function handleClearAllDailySheets() {
  const confirmed = confirm(
    'هل أنت متأكد من تفريغ حقول دفتر اليومية ومسح جميع الأرقام من جميع الأيام؟\n\n' +
    '⚠️ تنبيه: سيتم مسح كافة الأرقام والبيانات المسجلة في دفاتر اليومية لجميع الأيام وتصفير الصندوق بالكامل، ولا يمكن التراجع عن هذه الخطوة.'
  );
  if (!confirmed) return;

  showToast('جاري تفريغ الحقول لجميع الأيام...');
  try {
    const res = await fetch('/api/daily-sheets/clear-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('فشل تفريغ الحقول في السيرفر');

    showToast('تم تفريغ جميع حقول دفاتر اليومية بنجاح!');

    // Reload currently active sheet (will load fully blank/zeroed)
    await loadSheet(state.date);
  } catch (err) {
    console.error(err);
    alert('حدث خطأ أثناء تفريغ الحقول: ' + err.message);
  }
}

// Toast notification
function showToast(msg) {
  let toast = document.getElementById('statusToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'statusToast';
    toast.className = 'status-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
