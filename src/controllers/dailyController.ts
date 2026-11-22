// @ts-nocheck
export function mountDailyController() {
  if (typeof window === 'undefined') return;
  if ((window as any).__mountDailyController_loaded) return;
  (window as any).__mountDailyController_loaded = true;

// Daily Journal (دفتر اليومية المطور) - Logic & Calculations

// Day Names in Arabic
const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function formatLocalDate(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDayNameFromDateStr(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    // Use noon 12:00:00 to avoid any timezone/DST shift issues
    const dt = new Date(y, m, d, 12, 0, 0);
    return DAY_NAMES[dt.getDay()];
  }
  const dt = new Date(dateStr);
  return !isNaN(dt) ? DAY_NAMES[dt.getDay()] : '';
}

function formatDisplayDateTime(dtStr) {
  if (!dtStr) return '';
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr;
    return d.toLocaleString('ar-JO', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return dtStr;
  }
}

let state = {
  date: formatLocalDate(new Date()),
  dayName: '',
  isLocked: false,
  hasSavedData: false,
  updatedAt: null,
  kpiMode: 'daily', // 'daily' or 'cumulative'
  cum_stats: {
    cum_sales: 0,
    cum_items: 0,
    year_sales: 0,
    year_items: 0
  },
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
    owner_hand: 0,
    personal_date: '',
    business_date: '',
    owner_hand_date: ''
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

// Initialize on Load (supports both React useEffect mount and standard DOMContentLoaded)
function initDailyJournal() {
  if (!document.getElementById('sheetDateInput')) return;
  if (window.__dailyJournalMounted) return;
  window.__dailyJournalMounted = true;
  setupEventListeners();
  loadSheet(state.date);
}
window.initDailyJournal = initDailyJournal;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDailyJournal);
} else {
  initDailyJournal();
}

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
    state.date = formatLocalDate(new Date());
    if (dateInput) dateInput.value = state.date;
    loadSheet(state.date);
  });

  // Action Buttons
  document.getElementById('btnEditSheet')?.addEventListener('click', requestEditSheet);
  document.getElementById('btnSaveManual')?.addEventListener('click', () => saveSheet(true));
  document.getElementById('btnPrint')?.addEventListener('click', () => window.print());
  document.getElementById('btnHistory')?.addEventListener('click', openHistoryModal);
  document.getElementById('btnCloseHistory')?.addEventListener('click', closeHistoryModal);
  document.getElementById('btnClearSheetFields')?.addEventListener('click', clearCurrentSheetFields);

  // Bind Sales and Deposits Inputs
  const salesInputs = document.querySelectorAll('.sales-binding');
  salesInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      const field = e.target.dataset.field;
      if (field === 'sales_items_count') {
        const valStr = e.target.value.trim();
        if (valStr === '') {
          state.sales.items_count = '';
        } else {
          state.sales.items_count = parseInt(valStr, 10);
        }
        if (valStr !== '' && !isNaN(parseInt(valStr, 10)) && parseInt(valStr, 10) >= 0) {
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
      markUnsaved();
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
      } else if (field === 'deposit_owner_hand_date') {
        state.deposits.owner_hand_date = e.target.value;
      }
      markUnsaved();
    });
  });

  // Click on locked input field to prompt for edit (once per click)
  document.addEventListener('click', (e) => {
    if (!state.isLocked) return;
    const target = e.target as HTMLElement;
    if (!target) return;
    if (
      target.classList.contains('sales-binding') ||
      target.classList.contains('table-input') ||
      target.classList.contains('deposit-date-binding')
    ) {
      e.stopImmediatePropagation();
      requestEditSheet(target);
    }
  });

  // Notes
  const notesEl = document.getElementById('notesTextarea');
  if (notesEl) {
    notesEl.addEventListener('input', (e) => {
      state.notes = e.target.value;
      markUnsaved();
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
        markUnsaved();
      });
    }
  });
}

function changeDay(delta) {
  const parts = state.date.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const dt = new Date(y, m, d + delta, 12, 0, 0);
  state.date = formatLocalDate(dt);
  const dateInput = document.getElementById('sheetDateInput');
  if (dateInput) dateInput.value = state.date;
  loadSheet(state.date);
}

// قفل / فتح حقول الدفتر والتأكيد على التعديل
function setSheetLockedState(locked) {
  state.isLocked = locked;

  // الحقول التي يتم تفعيلها أو إيقافها
  const inputsToToggle = document.querySelectorAll(
    '.sales-binding, .table-input, #notesTextarea, .deposit-date-binding, #perfume_desc, #perfume_debit, #perfume_credit'
  );
  inputsToToggle.forEach(input => {
    if (locked) {
      input.setAttribute('readonly', 'readonly');
      input.removeAttribute('disabled');
      input.style.backgroundColor = '#f8fafc';
      input.style.cursor = 'pointer';
      input.title = 'الدفتر مقفل للحماية - انقر هنا أو على [✏️ تعديل الدفتر] لتعديل الأرقام';
    } else {
      input.removeAttribute('readonly');
      input.removeAttribute('disabled');
      input.style.backgroundColor = '';
      input.style.cursor = '';
      input.title = '';
    }
  });

  document.querySelectorAll('.btn-del-row').forEach(btn => {
    btn.disabled = locked;
    btn.style.opacity = locked ? '0.4' : '1';
    btn.style.cursor = locked ? 'not-allowed' : 'pointer';
  });

  // إيقاف نقرات إضافة السطور في الجداول إذا كان مقفولاً
  document.querySelectorAll('.empty-row-placeholder span, .card-body tfoot button').forEach(el => {
    if (locked) {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.4';
    } else {
      el.style.pointerEvents = '';
      el.style.opacity = '';
    }
  });

  const btnEditSheet = document.getElementById('btnEditSheet');
  const btnBannerEdit = document.getElementById('btnBannerEditSheet');
  const btnSaveManual = document.getElementById('btnSaveManual');
  const btnSaveManualText = document.getElementById('btnSaveManualText');
  const btnClear = document.getElementById('btnClearSheetFields');
  const banner = document.getElementById('sheetStatusBanner');
  const bannerText = document.getElementById('sheetBannerText');
  const bannerDate = document.getElementById('sheetBannerDate');

  if (btnClear) {
    btnClear.disabled = locked;
    btnClear.style.opacity = locked ? '0.5' : '1';
    btnClear.style.cursor = locked ? 'not-allowed' : 'pointer';
  }

  if (locked) {
    if (btnEditSheet) btnEditSheet.style.display = 'inline-flex';
    if (btnBannerEdit) btnBannerEdit.style.display = 'inline-flex';
    if (btnSaveManual) btnSaveManual.style.display = 'none';

    if (banner) {
      banner.style.display = 'flex';
      banner.style.background = '#fef3c7';
      banner.style.color = '#92400e';
      banner.style.border = '1px solid #fde68a';
      if (bannerText) {
        bannerText.innerHTML = '🔒 <b>الدفتر مقفل للعرض والحماية</b>. لتعديل أي أرقام انقر على الخانة أو زر <b>[✏️ تعديل الأرقام الآن]</b>:';
      }
      if (bannerDate) {
        const dtStr = state.updatedAt ? formatDisplayDateTime(state.updatedAt) : '';
        bannerDate.textContent = dtStr ? `آخر حفظ/تعديل: ${dtStr}` : '';
      }
    }
  } else {
    if (btnEditSheet) btnEditSheet.style.display = 'none';
    if (btnBannerEdit) btnBannerEdit.style.display = 'none';
    if (btnSaveManual) btnSaveManual.style.display = 'inline-flex';
    if (btnSaveManualText) {
      btnSaveManualText.textContent = state.hasSavedData ? 'حفظ التعديلات' : 'حفظ اليومية';
    }

    if (state.hasSavedData) {
      if (banner) {
        banner.style.display = 'flex';
        banner.style.background = '#eff6ff';
        banner.style.color = '#1e40af';
        banner.style.border = '1px solid #bfdbfe';
        if (bannerText) {
          bannerText.innerHTML = '✏️ <b>وضع التعديل مفعّل</b>: يمكنك الآن تعديل الأرقام، وبعد الانتهاء انقر على زر <b>[💾 حفظ التعديلات]</b> بالأعلى لحفظ التعديلات.';
        }
        if (bannerDate) bannerDate.textContent = '';
      }
    } else {
      if (banner) banner.style.display = 'none';
    }
  }
}

// المطالبة بتأكيد التعديل عبر نافذة منبثقة
let editPromptActive = false;
function requestEditSheet(clickedInput) {
  if (!state.isLocked || editPromptActive) return;
  editPromptActive = true;
  try {
    const confirmed = window.confirm(
      'هل أنت متأكد من تعديل الدفتر؟\n\n' +
      'عند النقر على "موافق" (OK)، سيتم فتح جميع الخانات لتعديل الأرقام وستتمكن من حفظ التعديلات الجديدة.'
    );
    if (!confirmed) {
      if (clickedInput && typeof clickedInput.blur === 'function') clickedInput.blur();
      if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === 'function') {
        (document.activeElement as HTMLElement).blur();
      }
      return;
    }
    setSheetLockedState(false);
    showToast('تم فتح الدفتر للتعديل');
    const targetToFocus = (clickedInput && typeof clickedInput.focus === 'function')
      ? clickedInput
      : document.getElementById('input_sales_cash');
    if (targetToFocus) targetToFocus.focus();
  } finally {
    setTimeout(() => { editPromptActive = false; }, 150);
  }
}
window.requestEditSheet = requestEditSheet;

// Fetch Sheet from Server
async function loadSheet(dateStr) {
  showToast('جاري تحميل اليومية...');
  try {
    const res = await fetch(`/api/daily-sheet?date=${dateStr}`);
    if (!res.ok) throw new Error('فشل جلب بيانات اليومية');
    const data = await res.json();

    // المطابقة الدقيقة لليوم والتاريخ دائماً
    state.dayName = getDayNameFromDateStr(dateStr);

    state.sales = {
      cash: data.sales_cash || 0,
      delivery: data.sales_delivery || 0,
      visa: data.sales_visa || 0,
      ittihad: data.sales_ittihad || 0,
      ittihad_qr: data.sales_ittihad_qr || 0,
      cliq: data.sales_cliq || 0,
      items_count: (data.sales_items_count !== undefined && data.sales_items_count !== null && data.sales_items_count !== '') ? data.sales_items_count : 0
    };

    state.deposits = {
      personal: data.deposit_personal || 0,
      business: data.deposit_business || 0,
      owner_hand: data.deposit_owner_hand || 0,
      personal_date: data.deposit_personal_date || state.sheet_date || '',
      business_date: data.deposit_business_date || state.sheet_date || '',
      owner_hand_date: data.deposit_owner_hand_date || state.sheet_date || ''
    };

    state.notes = data.notes || '';
    state.priorUndepositedCash = Number(data.prior_undeposited_cash || 0);
    state.priorPerfumeSales = Number(data.prior_perfume_sales || 0);
    state.cum_stats = data.cum_stats || { cum_sales: 0, cum_items: 0, year_sales: 0, year_items: 0 };
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
      daily_obligations: (data.items && data.items.daily_obligations) || [],
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

    // التحقق مما إذا كان الدفتر يحتوي على أرقام أو بيانات مسجلة فعلياً
    const hasExistingRecord = Boolean(
      (Number(data.sales_cash || 0) > 0) ||
      (Number(data.sales_delivery || 0) > 0) ||
      (Number(data.sales_visa || 0) > 0) ||
      (Number(data.sales_ittihad || 0) > 0) ||
      (Number(data.sales_ittihad_qr || 0) > 0) ||
      (Number(data.sales_cliq || 0) > 0) ||
      (Number(data.sales_items_count || 0) > 0) ||
      (Number(data.deposit_personal || 0) > 0) ||
      (Number(data.deposit_business || 0) > 0) ||
      (Number(data.deposit_owner_hand || 0) > 0) ||
      (data.notes && data.notes.trim() !== '') ||
      (data.items && Object.values(data.items).some(arr => Array.isArray(arr) && arr.length > 0))
    );

    state.hasSavedData = hasExistingRecord;
    state.updatedAt = data.updated_at || null;

    // تطبيق حالة القفل بناءً على وجود سجل سابق
    setSheetLockedState(state.hasSavedData);

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
    'employee_sales', 'extra_revenues', 'revenue_expenses', 'daily_obligations', 'daily_notes'
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
        input.value = (v !== '' && v !== null && v !== undefined && !isNaN(v) && Number(v) >= 0) ? v : '';
        input.style.borderColor = '';
        input.style.boxShadow = '';
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

  const depOwner = document.getElementById('input_deposit_owner_hand');
  if (depOwner) depOwner.value = state.deposits.owner_hand > 0 ? formatMoney(state.deposits.owner_hand) : '';
  const depOwnerDate = document.getElementById('input_deposit_owner_hand_date');
  if (depOwnerDate) depOwnerDate.value = state.deposits.owner_hand_date || state.sheet_date || '';

  // Notes
  const notesEl = document.getElementById('notesTextarea');
  if (notesEl) notesEl.value = state.notes;

  // Render Tables
  renderInternalExpensesTable();
  renderSimpleTable('employee_advances', 'employeeAdvancesBody', 'الرقم الوظيفي / اسم الموظف');
  renderSimpleTable('supplier_payments', 'supplierPaymentsBody', 'اسم المورد');
  renderSimpleTable('cash_purchases', 'cashPurchasesBody', 'بيان المشتريات');
  renderPerfumeSalesTable();
  renderExtraRevenuesTable();
  renderEmployeeSalesTable();
  renderMerchantDispatchesTable();
  renderDailyNotesTable();

  // الحفاظ على حالة القفل بعد إعادة بناء الجداول
  if (state.isLocked) {
    setSheetLockedState(true);
  }
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

// Render Internal Expenses Table (تصنيف المصروف، بيان المصروف من إعدادات المصاريف، القيمة)
function getConfiguredExpensesByType(typeLabel) {
  try {
    const raw = localStorage.getItem('erp_expense_settings_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      const list = typeLabel === 'المصاريف الثابتة' ? (parsed.fixed || []) : (parsed.operational || []);
      return list
        .map(item => (typeof item === 'object' && item !== null ? String(item.description || '').trim() : String(item || '').trim()))
        .filter(Boolean);
    }
  } catch (e) {}
  return [];
}

function onInternalExpenseCategoryChange(idx, newType) {
  if (!state.items.internal_expenses || !state.items.internal_expenses[idx]) return;
  state.items.internal_expenses[idx].col2 = newType;
  const validOptions = getConfiguredExpensesByType(newType);
  if (!validOptions.includes(state.items.internal_expenses[idx].col1)) {
    state.items.internal_expenses[idx].col1 = '';
  }
  markUnsaved();
  renderInternalExpensesTable();
}
window.onInternalExpenseCategoryChange = onInternalExpenseCategoryChange;

function renderInternalExpensesTable() {
  const tbody = document.getElementById('internalExpensesBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.items.internal_expenses || state.items.internal_expenses.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="4">لا توجد بيانات مسجلة (<span onclick="addRow('internal_expenses')">+ أضف سطر</span>)</td>
      </tr>
    `;
    return;
  }

  state.items.internal_expenses.forEach((row, idx) => {
    const selectedType = row.col2 || 'المصاريف التشغيلية';
    row.col2 = selectedType;
    const currentDesc = (row.col1 || '').trim();
    const configuredList = getConfiguredExpensesByType(selectedType);

    let optionsHtml = `<option value="">-- اختر بيان المصروف --</option>`;
    if (currentDesc && !configuredList.includes(currentDesc)) {
      optionsHtml += `<option value="${escapeHtml(currentDesc)}" selected>${escapeHtml(currentDesc)}</option>`;
    }
    configuredList.forEach(item => {
      const isSelected = currentDesc === item ? 'selected' : '';
      optionsHtml += `<option value="${escapeHtml(item)}" ${isSelected}>${escapeHtml(item)}</option>`;
    });

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="width: 170px;">
        <select class="table-input" style="font-weight: 600;"
                onchange="onInternalExpenseCategoryChange(${idx}, this.value)">
          <option value="المصاريف التشغيلية" ${selectedType === 'المصاريف التشغيلية' ? 'selected' : ''}>المصاريف التشغيلية</option>
          <option value="المصاريف الثابتة" ${selectedType === 'المصاريف الثابتة' ? 'selected' : ''}>المصاريف الثابتة</option>
        </select>
      </td>
      <td>
        <select class="table-input" style="font-weight: 600;"
                onchange="updateRowCol('internal_expenses', ${idx}, 'col1', this.value)">
          ${optionsHtml}
        </select>
      </td>
      <td style="width: 130px;">
        <input type="text" inputmode="decimal" class="table-input num" value="${row.amount1 > 0 ? formatMoney(row.amount1) : ''}" placeholder="0:00"
               oninput="updateRowAmount('internal_expenses', ${idx}, 'amount1', this.value)"
               onblur="this.value = parseMoney(this.value) > 0 ? formatMoney(parseMoney(this.value)) : ''">
      </td>
      <td style="width: 38px; text-align: center;">
        <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteRow('internal_expenses', ${idx})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (state.isLocked) {
    setSheetLockedState(true);
  }
}
window.renderInternalExpensesTable = renderInternalExpensesTable;

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
  markUnsaved();
};

window.deleteRow = function(categoryKey, idx) {
  state.items[categoryKey].splice(idx, 1);
  renderUI();
  recalculateAll();
  markUnsaved();
};

window.updateRowCol = function(categoryKey, idx, colKey, val) {
  if (state.items[categoryKey][idx]) {
    state.items[categoryKey][idx][colKey] = val;
    markUnsaved();
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
    markUnsaved();
  }
};

// KPI Mode Toggle (اليوم الحالي / تراكمي السنة)
function setKpiMode(mode) {
  state.kpiMode = mode;
  const btnDaily = document.getElementById('btnKpiDaily');
  const btnCum = document.getElementById('btnKpiCumulative');
  const hint = document.getElementById('kpiModeHint');

  if (mode === 'cumulative') {
    if (btnDaily) {
      btnDaily.style.background = 'transparent';
      btnDaily.style.color = '#475569';
    }
    if (btnCum) {
      btnCum.style.background = '#2563eb';
      btnCum.style.color = '#fff';
    }
    if (hint) hint.textContent = 'معروض حالياً: أرقام تراكمية للسنة (حتى تاريخ اليومية)';
  } else {
    if (btnDaily) {
      btnDaily.style.background = '#2563eb';
      btnDaily.style.color = '#fff';
    }
    if (btnCum) {
      btnCum.style.background = 'transparent';
      btnCum.style.color = '#475569';
    }
    if (hint) hint.textContent = 'معروض حالياً: أرقام اليوم المحدد';
  }
  recalculateAll();
}
window.setKpiMode = setKpiMode;

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

  // Cumulative vs Daily stats
  const isCumulative = state.kpiMode === 'cumulative';
  const cumSales = (state.cum_stats && state.cum_stats.cum_sales) || totalSales;
  const cumItems = (state.cum_stats && state.cum_stats.cum_items) || (state.sales.items_count || 0);
  const yearSales = (state.cum_stats && state.cum_stats.year_sales) || cumSales;
  const yearItems = (state.cum_stats && state.cum_stats.year_items) || cumItems;
  const dailyItems = state.sales.items_count || 0;

  // KPI 1: إجمالي المبيعات
  const salesTitleEl = document.querySelector('.kpi-card.sales .kpi-title');
  const salesSubEl = document.querySelector('.kpi-card.sales .kpi-subtitle');
  if (isCumulative) {
    if (salesTitleEl) salesTitleEl.textContent = 'إجمالي المبيعات (تراكمي)';
    setText('kpiTotalSales', formatMoney(cumSales));
    if (salesSubEl) salesSubEl.textContent = `مبيعات اليوم: ${formatMoney(totalSales)} | إجمالي السنة: ${formatMoney(yearSales)}`;
  } else {
    if (salesTitleEl) salesTitleEl.textContent = 'إجمالي المبيعات (اليومي)';
    setText('kpiTotalSales', formatMoney(totalSales));
    if (salesSubEl) salesSubEl.textContent = `تراكمي حتى اليوم: ${formatMoney(cumSales)} | إجمالي السنة: ${formatMoney(yearSales)}`;
  }

  // KPI 2: عدد القطع المباعة
  const itemsTitleEl = document.querySelector('#kpiItemsCard .kpi-title');
  const itemsCountEl = document.getElementById('kpiItemsCount');
  const itemsSubEl = document.getElementById('kpiItemsSub');
  if (isCumulative) {
    if (itemsTitleEl) itemsTitleEl.textContent = '📦 القطع المباعة (تراكمي)';
    if (itemsCountEl) itemsCountEl.textContent = Number(cumItems).toLocaleString();
    if (itemsSubEl) itemsSubEl.textContent = `مبيعات اليوم: ${dailyItems.toLocaleString()} قطعة | إجمالي السنة: ${yearItems.toLocaleString()} قطعة`;
  } else {
    if (itemsTitleEl) itemsTitleEl.textContent = '📦 القطع المباعة (اليومي)';
    if (itemsCountEl) itemsCountEl.textContent = Number(dailyItems).toLocaleString();
    if (itemsSubEl) itemsSubEl.textContent = `تراكمي حتى اليوم: ${cumItems.toLocaleString()} قطعة | إجمالي السنة: ${yearItems.toLocaleString()} قطعة`;
  }

  // 2. Deposits Total
  const totalDeposits = (state.deposits.personal || 0) + (state.deposits.business || 0) + (state.deposits.owner_hand || 0);
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

// Unsaved changes badge indicator (بدون أي حفظ تلقائي في الخلفية)
function markUnsaved() {
  const statusEl = document.getElementById('autoSaveBadge');
  if (statusEl) {
    statusEl.textContent = 'تعديلات غير محفوظة (اضغط حفظ اليومية)';
    statusEl.style.color = '#d97706';
  }
}

async function saveSheet(isManual = true) {
  // عدد القطع المباعة اختياري: إذا تُرك فارغاً يُحفظ كـ 0
  const itemsCountInput = document.getElementById('input_sales_items_count');
  const itemsCountVal = itemsCountInput ? itemsCountInput.value.trim() : '';
  let parsedCount = parseInt(itemsCountVal, 10);
  if (isNaN(parsedCount) || parsedCount < 0) parsedCount = 0;

  // إزالة أي تمييز خطأ قديم
  if (itemsCountInput) {
    itemsCountInput.style.borderColor = '';
    itemsCountInput.style.boxShadow = '';
    itemsCountInput.classList.remove('input-error');
  }

  state.sales.items_count = parsedCount;

  const statusEl = document.getElementById('autoSaveBadge');
  if (statusEl) {
    statusEl.textContent = 'جاري الحفظ...';
    statusEl.style.color = '#2563eb';
  }

  try {
    const allCategories = [
      'internal_expenses', 'employee_advances', 'supplier_payments',
      'cash_purchases', 'perfume_sales', 'merchant_dispatches',
      'employee_sales', 'extra_revenues', 'revenue_expenses', 'daily_obligations', 'daily_notes'
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
      sales_items_count: parsedCount,
      deposit_personal: state.deposits.personal,
      deposit_business: state.deposits.business,
      deposit_owner_hand: state.deposits.owner_hand || 0,
      deposit_personal_date: state.deposits.personal_date || '',
      deposit_business_date: state.deposits.business_date || '',
      deposit_owner_hand_date: state.deposits.owner_hand_date || '',
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
    if (savedData && savedData.cum_stats !== undefined) {
      state.cum_stats = savedData.cum_stats;
    }
    recalculateAll();

    state.hasSavedData = true;
    const now = new Date();
    const nowFormatted = now.toLocaleString('ar-JO', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    state.updatedAt = now.toISOString();

    // قفل الدفتر بعد الحفظ الناجح
    setSheetLockedState(true);

    // إظهار رسالة النجاح وتاريخ التعديل أعلى الدفتر
    const banner = document.getElementById('sheetStatusBanner');
    const bannerText = document.getElementById('sheetBannerText');
    const bannerDate = document.getElementById('sheetBannerDate');
    if (banner) {
      banner.style.display = 'flex';
      banner.style.background = '#ecfdf5';
      banner.style.color = '#065f46';
      banner.style.border = '1px solid #a7f3d0';
      if (bannerText) {
        bannerText.innerHTML = `✅ <b>تم تعديل الدفتر وحفظ التعديلات بنجاح</b>`;
      }
      if (bannerDate) {
        bannerDate.innerHTML = `<b>تاريخ ووقت التعديل:</b> ${nowFormatted}`;
      }
    }

    if (statusEl) {
      statusEl.textContent = 'تم حفظ اليومية بنجاح';
      statusEl.style.color = '#059669';
    }

    showToast('تم حفظ اليومية بنجاح!');
    return true;
  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.textContent = 'خطأ في الحفظ';
      statusEl.style.color = '#dc2626';
    }
    alert('حدث خطأ أثناء الحفظ في الخادم: ' + err.message);
    return false;
  }
}

// تفريغ خانات اليوم الحالي المعروض فقط (دون حذف أي سجلات تاريخية)
function clearCurrentSheetFields() {
  const confirmed = confirm(
    'هل أنت متأكد من تفريغ وتصفير خانات اليوم الحالي المعروض في الشاشة؟\n\n' +
    '📌 ملاحظة هامة: هذا التصفير للشاشة الحالية فقط ولا يحذف أي سجلات سابقة، ولن يُحفظ في الخادم إلا عند نقرك على "حفظ اليومية".'
  );
  if (!confirmed) return;

  state.sales = { cash: 0, delivery: 0, visa: 0, ittihad: 0, ittihad_qr: 0, cliq: 0, items_count: '' };
  state.deposits = { personal: 0, business: 0, owner_hand: 0, personal_date: '', business_date: '', owner_hand_date: '' };
  state.notes = '';
  state.perfume = { desc: '', debit: 0, credit: 0 };
  state.items = {
    internal_expenses: [],
    employee_advances: [],
    supplier_payments: [],
    cash_purchases: [],
    perfume_sales: [],
    merchant_dispatches: [],
    employee_sales: [],
    extra_revenues: [],
    revenue_expenses: [],
    daily_notes: []
  };

  state.hasSavedData = false;
  setSheetLockedState(false);
  renderUI();
  recalculateAll();

  // تفريغ المدخلات على الشاشة
  document.querySelectorAll('.sales-binding').forEach(inp => {
    inp.value = '';
    inp.style.borderColor = '';
    inp.style.boxShadow = '';
    inp.classList.remove('input-error');
  });

  const notesEl = document.getElementById('notesTextarea');
  if (notesEl) notesEl.value = '';

  const statusEl = document.getElementById('autoSaveBadge');
  if (statusEl) {
    statusEl.textContent = 'تم تفريغ خانات اليوم (غير محفوظ - اضغط حفظ اليومية إذا أردت تثبيت التصفير)';
    statusEl.style.color = '#64748b';
  }

  showToast('تم تفريغ خانات اليوم الحالي في الشاشة');
}
window.clearCurrentSheetFields = clearCurrentSheetFields;

// استرجاع وإعادة تحميل بيانات الإكسل (321 يوم)
async function reSeedHistoricalData() {
  const confirmed = confirm(
    'هل ترغب في استرجاع وإعادة تحميل كافة بيانات ملف الإكسل (321 يوماً مع عدد القطع المباعة) إلى قاعدة البيانات؟\n\n' +
    'سيتم تحديث كافة المبيعات والقنوات وعدد القطع بالكامل.'
  );
  if (!confirmed) return;

  showToast('جاري استرجاع بيانات الإكسل إلى قاعدة البيانات...');
  try {
    const res = await fetch('/api/seed-historical');
    const data = await res.json();
    if (data.success) {
      alert(`✅ تم استرجاع وتحميل بيانات الإكسل بنجاح!\nعدد السجلات: ${data.count || 321} يوماً\nتم تحديث المبيعات وعدد القطع المباعة.`);
      await loadSheet(state.date);
      await openHistoryModal();
    } else {
      alert('ملاحظة: ' + (data.message || data.error));
    }
  } catch (err) {
    console.error(err);
    alert('حدث خطأ أثناء الاتصال بالخادم: ' + err.message);
  }
}
window.reSeedHistoricalData = reSeedHistoricalData;

// History Modal
let allHistoryData = [];

async function openHistoryModal() {
  const modal = document.getElementById('historyModal');
  const tbody = document.getElementById('historyListBody');
  const summaryEl = document.getElementById('historySummaryText');
  if (!modal || !tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">جاري التحميل...</td></tr>';
  modal.classList.add('open');

  try {
    const res = await fetch('/api/daily-sheets-history?limit=500');
    allHistoryData = await res.json();

    if (!allHistoryData || allHistoryData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">لا توجد يوميات مسجلة سابقاً</td></tr>';
      if (summaryEl) summaryEl.textContent = 'إجمالي السجلات: 0 يوم';
      return;
    }

    let sumSales = 0;
    let sumItems = 0;
    allHistoryData.forEach(item => {
      sumSales += Number(item.total_sales || 0);
      sumItems += Number(item.sales_items_count || 0);
    });

    if (summaryEl) {
      summaryEl.innerHTML = `إجمالي السجلات: <b>${allHistoryData.length} يوم</b> | إجمالي المبيعات: <b>${formatMoney(sumSales)} د.أ</b> | إجمالي القطع: <b>${sumItems.toLocaleString()} قطعة</b>`;
    }

    renderHistoryRows(allHistoryData);
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#dc2626;">فشل تحميل السجل</td></tr>';
  }
}

function renderHistoryRows(list) {
  const tbody = document.getElementById('historyListBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 1.5rem; color:#64748b;">لا توجد نتائج مطابقة للبحث</td></tr>';
    return;
  }

  list.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:700;">${item.sheet_date} <span style="color:#64748b; font-weight:normal;">(${item.day_name || ''})</span></td>
      <td style="text-align:left; direction:ltr; font-weight:700; color:#1e3a8a;">${formatMoney(item.total_sales || 0)}</td>
      <td style="text-align:center; font-weight:700; color:#be185d;">${Number(item.sales_items_count || 0).toLocaleString()} قطعة</td>
      <td style="text-align:left; direction:ltr; color:#dc2626;">${formatMoney(item.total_expenses || 0)}</td>
      <td style="text-align:left; direction:ltr;">${formatMoney(item.total_deposits || 0)}</td>
      <td style="text-align:center;">
        <button class="btn btn-secondary btn-sm" onclick="selectHistoryDay('${item.sheet_date}')">فتح اليومية</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterHistoryList(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    renderHistoryRows(allHistoryData);
    return;
  }
  const filtered = allHistoryData.filter(item => {
    return (item.sheet_date && item.sheet_date.includes(q)) ||
           (item.day_name && item.day_name.toLowerCase().includes(q));
  });
  renderHistoryRows(filtered);
}
window.filterHistoryList = filterHistoryList;

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


  (window as any).formatLocalDate = formatLocalDate;
  (window as any).getDayNameFromDateStr = getDayNameFromDateStr;
  (window as any).formatDisplayDateTime = formatDisplayDateTime;
  (window as any).initDailyJournal = initDailyJournal;
  (window as any).setupEventListeners = setupEventListeners;
  (window as any).changeDay = changeDay;
  (window as any).setSheetLockedState = setSheetLockedState;
  (window as any).requestEditSheet = requestEditSheet;
  (window as any).loadSheet = loadSheet;
  (window as any).filterEmptyRows = filterEmptyRows;
  (window as any).renderUI = renderUI;
  (window as any).renderPerfumeSalesTable = renderPerfumeSalesTable;
  (window as any).renderSimpleTable = renderSimpleTable;
  (window as any).renderEmployeeSalesTable = renderEmployeeSalesTable;
  (window as any).renderMerchantDispatchesTable = renderMerchantDispatchesTable;
  (window as any).renderExtraRevenuesTable = renderExtraRevenuesTable;
  (window as any).renderRevenueExpensesTable = renderRevenueExpensesTable;
  (window as any).renderDailyNotesTable = renderDailyNotesTable;
  (window as any).setKpiMode = setKpiMode;
  (window as any).recalculateAll = recalculateAll;
  (window as any).parseMoney = parseMoney;
  (window as any).sumCategory = sumCategory;
  (window as any).formatMoney = formatMoney;
  (window as any).setText = setText;
  (window as any).escapeHtml = escapeHtml;
  (window as any).markUnsaved = markUnsaved;
  (window as any).saveSheet = saveSheet;
  (window as any).clearCurrentSheetFields = clearCurrentSheetFields;
  (window as any).reSeedHistoricalData = reSeedHistoricalData;
  (window as any).openHistoryModal = openHistoryModal;
  (window as any).renderHistoryRows = renderHistoryRows;
  (window as any).filterHistoryList = filterHistoryList;
  (window as any).closeHistoryModal = closeHistoryModal;
  (window as any).showToast = showToast;
}
