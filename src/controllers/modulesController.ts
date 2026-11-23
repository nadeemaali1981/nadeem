// @ts-nocheck
export function mountModulesController() {
  if (typeof window === 'undefined') return;
  if ((window as any).__mountModulesController_loaded) return;
  (window as any).__mountModulesController_loaded = true;

// modules.js - Logic for ERP modules: Sales, Expenses, Suppliers, Employees, Checks, Partners, Investments, Imports, Receivables, Profit & Loss

// Global state for modules
const modulesState = {
  activeTab: 'daily'
};

// Cache for Sales Data
let salesDataCache = [];

function formatCurrency(val) {
  const num = parseFloat(val) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 1. Sales Module (جدول وفلاتر وتحليلات المبيعات)
async function loadSalesTab() {
  const tbody = document.getElementById('salesHistoryBody');
  if (tbody && salesDataCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:#64748b;">جاري تحميل سجل المبيعات...</td></tr>';
  }
  try {
    const res = await fetch('/api/modules/sales-summary');
    const data = await res.json();
    salesDataCache = Array.isArray(data.history) ? data.history : [];
    window.applyCustomFieldNames();
    applySalesFilters();
  } catch (err) {
    console.error('Error loading sales:', err);
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:#dc2626;">تعذر تحميل بيانات المبيعات. يرجى المحاولة مجدداً.</td></tr>';
    }
  }
}

// فلترة بيانات المبيعات وتحديث الجدول والـ KPIs
window.applySalesFilters = function() {
  if (!salesDataCache) return;

  const fromDate = document.getElementById('salesFilterFrom')?.value || '';
  const toDate = document.getElementById('salesFilterTo')?.value || '';
  const dayFilter = document.getElementById('salesFilterDay')?.value || 'all';
  const channelFilter = document.getElementById('salesFilterChannel')?.value || 'all';
  const notesQuery = (document.getElementById('salesFilterNotes')?.value || '').trim().toLowerCase();

  const filtered = salesDataCache.filter(r => {
    const rDate = r.sheet_date || '';
    if (fromDate && rDate < fromDate) return false;
    if (toDate && rDate > toDate) return false;

    if (dayFilter !== 'all') {
      const rowDay = (r.day_name || '').trim();
      if (rowDay !== dayFilter) return false;
    }

    if (notesQuery) {
      const noteText = ((r.notes || '') + ' ' + (r.day_name || '') + ' ' + (r.sheet_date || '')).toLowerCase();
      if (!noteText.includes(notesQuery)) return false;
    }

    if (channelFilter !== 'all') {
      const fieldMap = {
        cash: 'sales_cash',
        delivery: 'sales_delivery',
        visa: 'sales_visa',
        ittihad: 'sales_ittihad',
        ittihad_qr: 'sales_ittihad_qr',
        cliq: 'sales_cliq'
      };
      const field = fieldMap[channelFilter];
      if (field && !(parseFloat(r[field]) > 0)) return false;
    }

    return true;
  });

  // حساب المجاميع
  let sumCash = 0;
  let sumDelivery = 0;
  let sumVisa = 0;
  let sumIttihad = 0;
  let sumIttihadQr = 0;
  let sumCliq = 0;
  let sumGrandTotal = 0;
  let sumItemsCount = 0;
  let salesDaysCount = 0;

  // ترتيب التواريخ من الأقدم إلى الأحدث (من بداية السنة أو أقدم يومية إلى أحدثها)
  filtered.sort((a, b) => (a.sheet_date || '').localeCompare(b.sheet_date || ''));

  filtered.forEach(r => {
    const cCash = parseFloat(r.sales_cash) || 0;
    const cDelivery = parseFloat(r.sales_delivery) || 0;
    const cVisa = parseFloat(r.sales_visa) || 0;
    const cIttihad = parseFloat(r.sales_ittihad) || 0;
    const cIttihadQr = parseFloat(r.sales_ittihad_qr) || 0;
    const cCliq = parseFloat(r.sales_cliq) || 0;
    const cItems = parseInt(r.sales_items_count, 10) || 0;
    const cTotal = parseFloat(r.day_total) || (cCash + cDelivery + cVisa + cIttihad + cIttihadQr + cCliq);

    sumCash += cCash;
    sumDelivery += cDelivery;
    sumVisa += cVisa;
    sumIttihad += cIttihad;
    sumIttihadQr += cIttihadQr;
    sumCliq += cCliq;
    sumItemsCount += cItems;
    sumGrandTotal += cTotal;

    // احتساب أيام البيع (التي فيها مبيعات أكبر من 0)
    if (cTotal > 0) {
      salesDaysCount++;
    }
  });

  // حساب متوسط البيع اليومي = إجمالي المبيعات ÷ عدد أيام البيع
  const avgDailySales = salesDaysCount > 0 ? sumGrandTotal / salesDaysCount : 0;

  // تحديث كروت الـ KPI بناءً على الفلتر
  const setKpi = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setKpi('salesKpiGrandTotal', formatCurrency(sumGrandTotal));
  setKpi('salesKpiItemsCount', sumItemsCount.toLocaleString());
  setKpi('salesKpiAverage', formatCurrency(avgDailySales));
  setKpi('salesKpiDaysCount', salesDaysCount);
  setKpi('salesKpiCash', formatCurrency(sumCash));
  setKpi('salesKpiDelivery', formatCurrency(sumDelivery));
  setKpi('salesKpiVisa', formatCurrency(sumVisa));
  setKpi('salesKpiIttihad', formatCurrency(sumIttihad));
  setKpi('salesKpiIttihadQr', formatCurrency(sumIttihadQr));
  setKpi('salesKpiCliq', formatCurrency(sumCliq));

  // رسم جدول المبيعات مطابق تماماً لترتيب الأعمدة في الصورة:
  // اليوم | التاريخ | صندوق | توصيل | فيزا / NETWORK | فيزا / الاتحاد | الاتحاد / QR | كليك | الإجمالي | عدد القطع | ملاحظات
  const tbody = document.getElementById('salesHistoryBody');
  const tfoot = document.getElementById('salesHistoryFoot');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 2rem; color: #64748b;">
          لا توجد سجلات مبيعات تطابق الفلاتر المحددة
        </td>
      </tr>
    `;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  let rowsHtml = '';
  filtered.forEach(r => {
    const cCash = parseFloat(r.sales_cash) || 0;
    const cDelivery = parseFloat(r.sales_delivery) || 0;
    const cVisa = parseFloat(r.sales_visa) || 0;
    const cIttihad = parseFloat(r.sales_ittihad) || 0;
    const cIttihadQr = parseFloat(r.sales_ittihad_qr) || 0;
    const cCliq = parseFloat(r.sales_cliq) || 0;
    const cItems = parseInt(r.sales_items_count, 10) || 0;
    const cTotal = parseFloat(r.day_total) || (cCash + cDelivery + cVisa + cIttihad + cIttihadQr + cCliq);

    rowsHtml += `
      <tr>
        <td style="font-weight: 700; color: #1e293b;">${r.day_name || '-'}</td>
        <td style="white-space: nowrap;">
          <a href="javascript:void(0)" onclick="selectHistoryDay('${r.sheet_date}'); switchTab('daily');" style="color: #2563eb; text-decoration: none; font-weight: 700;" title="فتح دفتر اليومية لهذا اليوم">
            ${r.sheet_date}
          </a>
        </td>
        <td style="text-align: center; ${cCash > 0 ? 'font-weight:600;' : 'color:#94a3b8;'}">${formatCurrency(cCash)}</td>
        <td style="text-align: center; ${cDelivery > 0 ? 'font-weight:600;' : 'color:#94a3b8;'}">${formatCurrency(cDelivery)}</td>
        <td style="text-align: center; ${cVisa > 0 ? 'font-weight:600;' : 'color:#94a3b8;'}">${formatCurrency(cVisa)}</td>
        <td style="text-align: center; ${cIttihad > 0 ? 'font-weight:600;' : 'color:#94a3b8;'}">${formatCurrency(cIttihad)}</td>
        <td style="text-align: center; ${cIttihadQr > 0 ? 'font-weight:600;' : 'color:#94a3b8;'}">${formatCurrency(cIttihadQr)}</td>
        <td style="text-align: center; ${cCliq > 0 ? 'font-weight:600;' : 'color:#94a3b8;'}">${formatCurrency(cCliq)}</td>
        <td style="text-align: center; font-weight: 800; color: #1e40af; background: #f0f7ff;">${formatCurrency(cTotal)}</td>
        <td style="text-align: center; font-weight: 700; color: #be185d; background: #fdf2f8;">${cItems.toLocaleString()}</td>
        <td style="text-align: center; font-size: 0.8rem; color: #475569; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.notes || ''}">
          ${r.notes || '-'}
        </td>
      </tr>
    `;
  });

  // إضافة سطور فارغة بتصميم جدول الإكسل إذا كان عدد السجلات قليلاً لمطابقة شكل الصورة المرفقة
  const minRows = 10;
  if (filtered.length < minRows) {
    for (let i = filtered.length; i < minRows; i++) {
      rowsHtml += `
        <tr class="empty-sheet-row">
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      `;
    }
  }

  tbody.innerHTML = rowsHtml;

  // سطر الإجمالي بالأسفل
  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="2" style="font-weight: 800; text-align: center; background: #cbd5e1; color: #0f172a;">
          الإجمالي (${filtered.length} يوم)
        </td>
        <td style="text-align: center; font-weight: 800;">${formatCurrency(sumCash)}</td>
        <td style="text-align: center; font-weight: 800;">${formatCurrency(sumDelivery)}</td>
        <td style="text-align: center; font-weight: 800;">${formatCurrency(sumVisa)}</td>
        <td style="text-align: center; font-weight: 800;">${formatCurrency(sumIttihad)}</td>
        <td style="text-align: center; font-weight: 800;">${formatCurrency(sumIttihadQr)}</td>
        <td style="text-align: center; font-weight: 800;">${formatCurrency(sumCliq)}</td>
        <td style="text-align: center; font-weight: 800; color: #1e40af; background: #e0f2fe; font-size: 0.95rem;">
          ${formatCurrency(sumGrandTotal)}
        </td>
        <td style="text-align: center; font-weight: 800; color: #be185d; background: #fce7f3; font-size: 0.95rem;">
          ${sumItemsCount.toLocaleString()}
        </td>
        <td style="background: #cbd5e1;"></td>
      </tr>
    `;
  }
};

// أزرار التاريخ السريعة
window.setSalesDateQuick = function(type) {
  const fromEl = document.getElementById('salesFilterFrom');
  const toEl = document.getElementById('salesFilterTo');
  if (!fromEl || !toEl) return;

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const formatD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (type === 'today') {
    const todayStr = formatD(now);
    fromEl.value = todayStr;
    toEl.value = todayStr;
  } else if (type === 'week') {
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 6);
    fromEl.value = formatD(weekAgo);
    toEl.value = formatD(now);
  } else if (type === 'month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    fromEl.value = formatD(firstDay);
    toEl.value = formatD(lastDay);
  } else if (type === 'all') {
    fromEl.value = '';
    toEl.value = '';
  }
  applySalesFilters();
};

// إعادة ضبط جميع الفلاتر
window.resetSalesFilters = function() {
  const fromEl = document.getElementById('salesFilterFrom');
  const toEl = document.getElementById('salesFilterTo');
  const dayEl = document.getElementById('salesFilterDay');
  const channelEl = document.getElementById('salesFilterChannel');
  const notesEl = document.getElementById('salesFilterNotes');

  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  if (dayEl) dayEl.value = 'all';
  if (channelEl) channelEl.value = 'all';
  if (notesEl) notesEl.value = '';

  applySalesFilters();
};

// 2. Expenses Module (سجل المصاريف: ترحيل تلقائي من دفتر اليومية لجدولي مصاريف داخلية وسحوبات موظفين فقط)
let expensesDataCache: any[] = [];

function escapeHtml(str: any) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadExpensesTab() {
  try {
    const res = await fetch('/api/modules/expenses-summary');
    const data = await res.json();

    let allItems: any[] = Array.isArray(data.items) ? [...data.items] : [];

    // دمج أي مصاريف مدخلة حالياً في دفتر اليومية (جدول مصاريف داخلية + جدول سحوبات موظفين) لم تُحفظ بعد
    if (typeof (window as any).getDailyJournalLiveExpenses === 'function') {
      const live = (window as any).getDailyJournalLiveExpenses();
      if (live && live.sheet_date && Array.isArray(live.items)) {
        // استبدال سجلات اليوم المفتوح حالياً بالنسخة الحية من شاشة دفتر اليومية
        allItems = allItems.filter((it: any) => it.sheet_date !== live.sheet_date);
        allItems = [...live.items, ...allItems];
      }
    }

    // ترتيب بحسب التاريخ من الأقدم إلى الأحدث (الأقدم بالأعلى والأحدث بالأسفل) ثم ترتيب جداول دفتر اليومية (1- مصاريف داخلية ثم 2- سحوبات موظفين)
    allItems.sort((a: any, b: any) => {
      const dCmp = String(a.sheet_date || '').localeCompare(String(b.sheet_date || ''));
      if (dCmp !== 0) return dCmp;
      const aOrder = (a.category === 'employee_advance' || a.category === 'employee_advances' || a.source_table === 'سحوبات موظفين') ? 2 : 1;
      const bOrder = (b.category === 'employee_advance' || b.category === 'employee_advances' || b.source_table === 'سحوبات موظفين') ? 2 : 1;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    expensesDataCache = allItems;
    populateExpenseFilterDropdowns(allItems);
    applyExpensesFilters();
  } catch (err) {
    console.error('Error loading expenses:', err);
  }
}

// تعبئة القوائم المنسدلة للفلاتر بناءً على البيانات المتوفرة
function populateExpenseFilterDropdowns(items: any[]) {
  const catSelect = document.getElementById('expFilterCategory') as HTMLSelectElement | null;
  const paySelect = document.getElementById('expFilterPaymentChannel') as HTMLSelectElement | null;

  if (catSelect) {
    const currentCat = catSelect.value || 'all';
    const categories = new Set<string>();
    items.forEach(it => {
      const mainCat = String(it.main_category || '').trim();
      const subCat = String(it.sub_category || '').trim();
      if (mainCat && mainCat !== '-' && mainCat !== 'المصاريف التشغيلية' && mainCat !== 'المصاريف الثابتة') {
        categories.add(mainCat);
      }
      if (subCat && subCat !== '-') {
        categories.add(subCat);
      }
    });

    let catHtml = '<option value="all">كل التصنيفات</option>';
    Array.from(categories).sort().forEach(cat => {
      const isSel = cat === currentCat ? 'selected' : '';
      catHtml += `<option value="${escapeHtml(cat)}" ${isSel}>${escapeHtml(cat)}</option>`;
    });
    catSelect.innerHTML = catHtml;
  }

  if (paySelect) {
    const currentPay = paySelect.value || 'all';
    const channels = new Set<string>();
    items.forEach(it => {
      const ch = String(it.payment_channel || '').trim();
      if (ch && ch !== '-') channels.add(ch);
    });

    let payHtml = '<option value="all">كل جهات الدفع</option>';
    Array.from(channels).sort().forEach(ch => {
      const isSel = ch === currentPay ? 'selected' : '';
      payHtml += `<option value="${escapeHtml(ch)}" ${isSel}>${escapeHtml(ch)}</option>`;
    });
    paySelect.innerHTML = payHtml;
  }
}

// تطبيق فلاتر المصاريف وتحديث الجداول والـ KPIs
function applyExpensesFilters() {
  if (!expensesDataCache) return;

  const fromDate = (document.getElementById('expFilterFrom') as HTMLInputElement)?.value || '';
  const toDate = (document.getElementById('expFilterTo') as HTMLInputElement)?.value || '';
  const expType = (document.getElementById('expFilterType') as HTMLSelectElement)?.value || 'all';
  const source = (document.getElementById('expFilterSource') as HTMLSelectElement)?.value || 'all';
  const catFilter = (document.getElementById('expFilterCategory') as HTMLSelectElement)?.value || 'all';
  const payChannel = (document.getElementById('expFilterPaymentChannel') as HTMLSelectElement)?.value || 'all';
  const searchQuery = ((document.getElementById('expFilterSearch') as HTMLInputElement)?.value || '').trim().toLowerCase();

  const isAnyFilterActive = !!(fromDate || toDate || expType !== 'all' || source !== 'all' || catFilter !== 'all' || payChannel !== 'all' || searchQuery);

  const filtered = expensesDataCache.filter(it => {
    const rDate = String(it.sheet_date || '').trim();
    if (fromDate && rDate < fromDate) return false;
    if (toDate && rDate > toDate) return false;

    const isEmp = it.category === 'employee_advance' || it.category === 'employee_advances' || it.source_table === 'سحوبات موظفين';
    const isFixed = it.expense_type === 'fixed' || it.category === 'fixed_expense' || it.category === 'fixed_expenses' || it.main_category === 'المصاريف الثابتة';

    if (expType === 'operational' && isFixed) return false;
    if (expType === 'fixed' && !isFixed) return false;

    if (source === 'internal' && isEmp) return false;
    if (source === 'advances' && !isEmp) return false;

    if (catFilter !== 'all') {
      const mainCat = String(it.main_category || '').trim();
      const subCat = String(it.sub_category || '').trim();
      if (mainCat !== catFilter && subCat !== catFilter) return false;
    }

    if (payChannel !== 'all') {
      const ch = String(it.payment_channel || '').trim();
      if (ch !== payChannel) return false;
    }

    if (searchQuery) {
      const fullText = [
        it.description || '',
        it.main_category || '',
        it.sub_category || '',
        it.payment_channel || '',
        it.sheet_date || '',
        it.day_name || '',
        it.source_table || ''
      ].join(' ').toLowerCase();
      if (!fullText.includes(searchQuery)) return false;
    }

    return true;
  });

  const opItems: any[] = [];
  const fixItems: any[] = [];
  let opTotal = 0;
  let fixTotal = 0;

  filtered.forEach((it: any) => {
    const amt = Number(it.amount || 0);
    if (!(amt > 0)) return;
    const isFixed = it.expense_type === 'fixed' || it.category === 'fixed_expense' || it.category === 'fixed_expenses' || it.main_category === 'المصاريف الثابتة';
    if (isFixed) {
      fixTotal += amt;
      fixItems.push(it);
    } else {
      opTotal += amt;
      opItems.push(it);
    }
  });

  const grandTotal = opTotal + fixTotal;

  const setElText = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setElText('expKpiGrandTotal', formatCurrency(grandTotal));
  setElText('expKpiInternal', formatCurrency(opTotal));
  setElText('expKpiFixed', formatCurrency(fixTotal));
  setElText('expKpiCount', String(filtered.length));
  setElText('expOpSubTotal', formatCurrency(opTotal));
  setElText('expFixedSubTotal', formatCurrency(fixTotal));

  // إخفاء أو إظهار البطاقات بحسب فلتر نوع المصروف
  const opCard = document.getElementById('cardExpensesOperational');
  const fixCard = document.getElementById('cardExpensesFixed');
  if (opCard) opCard.style.display = expType === 'fixed' ? 'none' : '';
  if (fixCard) fixCard.style.display = expType === 'operational' ? 'none' : '';

  const renderExpenseSection = (tbodyId: string, list: any[], emptyMsg: string) => {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:1.5rem; color:#64748b;">${emptyMsg}</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map((it: any) => {
      const isEmp = it.category === 'employee_advance' || it.category === 'employee_advances' || it.source_table === 'سحوبات موظفين';
      const sourceBadge = isEmp
        ? `<span style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:6px; font-size:0.76rem; font-weight:700;">سحوبات موظفين</span>`
        : `<span style="background:#fee2e2; color:#b91c1c; padding:2px 8px; border-radius:6px; font-size:0.76rem; font-weight:700;">مصاريف داخلية</span>`;
      const mainCat = it.main_category || (it.expense_type === 'fixed' ? 'المصاريف الثابتة' : 'المصاريف التشغيلية');
      const subCat = it.sub_category || '-';
      const payChannelVal = it.payment_channel || '-';
      const desc = it.description || '-';
      const delBtn = it.id
        ? `<button type="button" class="btn btn-danger btn-sm" style="padding:2px 7px; font-size:0.74rem;" onclick="deleteExpenseItem(${it.id})" title="حذف المصروف">✕</button>`
        : '';
      return `
        <tr>
          <td style="font-weight:600; white-space:nowrap; text-align:center;">${it.sheet_date} <span style="color:#64748b; font-size:0.78rem;">(${it.day_name || ''})</span></td>
          <td style="text-align:center; white-space:nowrap;">${sourceBadge}</td>
          <td style="text-align:center; font-weight:600;">${mainCat}</td>
          <td style="text-align:center; font-weight:600;">${subCat}</td>
          <td style="text-align:center; font-weight:600;">${payChannelVal}</td>
          <td style="text-align:center; font-weight:700;">${desc}</td>
          <td style="text-align:center; font-weight:800; color:#b91c1c;">${formatCurrency(it.amount)}</td>
          <td style="text-align:center; white-space:nowrap;">
            <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 7px; font-size:0.74rem;" onclick="selectHistoryDay('${it.sheet_date}'); switchTab('daily');" title="فتح دفتر اليومية">اليومية</button>
            ${delBtn}
          </td>
        </tr>
      `;
    }).join('');
  };

  const opEmptyMsg = isAnyFilterActive ? 'لا توجد مصاريف تشغيلية مطابقة للفلتر المحدد' : 'لا توجد مصاريف تشغيلية مرحلة من دفتر اليومية';
  const fixEmptyMsg = isAnyFilterActive ? 'لا توجد مصاريف ثابتة مطابقة للفلتر المحدد' : 'لا توجد مصاريف ثابتة مرحلة من دفتر اليومية';

  renderExpenseSection('expensesOperationalBody', opItems, opEmptyMsg);
  renderExpenseSection('expensesFixedBody', fixItems, fixEmptyMsg);
}

// أزرار الفلترة السريعة للتواريخ
function setExpensesDateQuick(type: string) {
  const fromEl = document.getElementById('expFilterFrom') as HTMLInputElement | null;
  const toEl = document.getElementById('expFilterTo') as HTMLInputElement | null;
  if (!fromEl || !toEl) return;

  const now = new Date();
  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  if (type === 'today') {
    fromEl.value = format(now);
    toEl.value = format(now);
  } else if (type === 'week') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 6 ? 0 : -1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(diff);
    fromEl.value = format(startOfWeek);
    toEl.value = format(new Date());
  } else if (type === 'month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    fromEl.value = format(firstDay);
    toEl.value = format(lastDay);
  } else if (type === 'all') {
    fromEl.value = '';
    toEl.value = '';
  }

  applyExpensesFilters();
}

// إعادة ضبط جميع الفلاتر
function resetExpensesFilters() {
  const fromEl = document.getElementById('expFilterFrom') as HTMLInputElement | null;
  const toEl = document.getElementById('expFilterTo') as HTMLInputElement | null;
  const typeEl = document.getElementById('expFilterType') as HTMLSelectElement | null;
  const srcEl = document.getElementById('expFilterSource') as HTMLSelectElement | null;
  const catEl = document.getElementById('expFilterCategory') as HTMLSelectElement | null;
  const payEl = document.getElementById('expFilterPaymentChannel') as HTMLSelectElement | null;
  const searchEl = document.getElementById('expFilterSearch') as HTMLInputElement | null;

  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  if (typeEl) typeEl.value = 'all';
  if (srcEl) srcEl.value = 'all';
  if (catEl) catEl.value = 'all';
  if (payEl) payEl.value = 'all';
  if (searchEl) searchEl.value = '';

  applyExpensesFilters();
}

(window as any).applyExpensesFilters = applyExpensesFilters;
(window as any).setExpensesDateQuick = setExpensesDateQuick;
(window as any).resetExpensesFilters = resetExpensesFilters;


window.submitQuickExpense = async function(e: Event) {
  e.preventDefault();
  const expense_type = (document.getElementById('quickExpType') as HTMLSelectElement)?.value || 'operational';
  const sheet_date = (document.getElementById('quickExpDate') as HTMLInputElement)?.value || new Date().toISOString().split('T')[0];
  const descEl = document.getElementById('quickExpDesc') as HTMLInputElement;
  const amtEl = document.getElementById('quickExpAmount') as HTMLInputElement;
  const description = (descEl?.value || '').trim();
  const amount = parseFloat(amtEl?.value || '0');

  if (!description || !(amount > 0)) {
    alert('يرجى إدخال بيان المصروف والقيمة بشكل صحيح');
    return;
  }

  try {
    const res = await fetch('/api/modules/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expense_type, sheet_date, description, amount })
    });
    if (!res.ok) throw new Error('فشل حفظ المصروف');
    if (descEl) descEl.value = '';
    if (amtEl) amtEl.value = '';
    await loadExpensesTab();
  } catch (err: any) {
    alert(err.message || 'حدث خطأ أثناء إضافة المصروف');
  }
};

window.deleteExpenseItem = async function(id: number) {
  if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;
  try {
    await fetch(`/api/modules/expenses/${id}`, { method: 'DELETE' });
    await loadExpensesTab();
  } catch (err) {
    console.error(err);
  }
};

// 3. Suppliers Module
let rawSuppliersData: any[] = [];
let suppliersFilterPeriod: string = 'all';

async function loadSuppliersTab() {
  try {
    const res = await fetch('/api/modules/suppliers');
    const suppliers = await res.json();
    rawSuppliersData = Array.isArray(suppliers) ? suppliers : [];

    syncSuppliersPageToDailyDropdown(rawSuppliersData);
    populateSuppliersFilterDropdowns(rawSuppliersData);
    renderSuppliersNavTabs(rawSuppliersData);
    applySuppliersFilters();
  } catch (err) {
    console.error('Error loading suppliers:', err);
  }
}

function populateSuppliersFilterDropdowns(list: any[]) {
  const suppSelect = document.getElementById('suppFilterSupplier') as HTMLSelectElement;
  const channelSelect = document.getElementById('suppFilterPaymentChannel') as HTMLSelectElement;

  if (suppSelect) {
    const currentVal = suppSelect.value || 'all';
    const names = Array.from(new Set(list.map((s: any) => String(s?.name || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar'));
    let html = '<option value="all">كل الموردين والشركات</option>';
    names.forEach(name => {
      const selected = name === currentVal ? 'selected' : '';
      html += `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)}</option>`;
    });
    suppSelect.innerHTML = html;
  }

  if (channelSelect) {
    const currentVal = channelSelect.value || 'all';
    const channels = Array.from(new Set(list.map((s: any) => String(s?.payment_channel || '').trim()).filter(c => c && c !== '-'))).sort((a, b) => a.localeCompare(b, 'ar'));
    let html = '<option value="all">كل جهات الدفع</option>';
    channels.forEach(ch => {
      const selected = ch === currentVal ? 'selected' : '';
      html += `<option value="${escapeHtml(ch)}" ${selected}>${escapeHtml(ch)}</option>`;
    });
    channelSelect.innerHTML = html;
  }
}

function setSuppliersQuickDate(period: string, btnEl?: HTMLElement) {
  suppliersFilterPeriod = period;
  if (btnEl) {
    document.querySelectorAll('.btn-quick-date[data-suppperiod]').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }

  const fromInput = document.getElementById('suppFilterFrom') as HTMLInputElement;
  const toInput = document.getElementById('suppFilterTo') as HTMLInputElement;
  if (!fromInput || !toInput) return;

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (period === 'all') {
    fromInput.value = '';
    toInput.value = '';
  } else if (period === 'this_month') {
    fromInput.value = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    toInput.value = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else if (period === 'last_month') {
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    fromInput.value = `${prevY}-${String(prevM + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(prevY, prevM + 1, 0).getDate();
    toInput.value = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else if (period === 'last_30') {
    const past = new Date();
    past.setDate(past.getDate() - 30);
    fromInput.value = formatLocalDate(past);
    toInput.value = formatLocalDate(now);
  } else if (period === 'this_year') {
    fromInput.value = `${y}-01-01`;
    toInput.value = `${y}-12-31`;
  }

  applySuppliersFilters();
}
(window as any).setSuppliersQuickDate = setSuppliersQuickDate;

function resetSuppliersFilters() {
  suppliersFilterPeriod = 'all';
  const fromInput = document.getElementById('suppFilterFrom') as HTMLInputElement;
  const toInput = document.getElementById('suppFilterTo') as HTMLInputElement;
  const suppSelect = document.getElementById('suppFilterSupplier') as HTMLSelectElement;
  const channelSelect = document.getElementById('suppFilterPaymentChannel') as HTMLSelectElement;
  const searchInput = document.getElementById('suppFilterSearch') as HTMLInputElement;

  if (fromInput) fromInput.value = '';
  if (toInput) toInput.value = '';
  if (suppSelect) suppSelect.value = 'all';
  if (channelSelect) channelSelect.value = 'all';
  if (searchInput) searchInput.value = '';

  document.querySelectorAll('.btn-quick-date[data-suppperiod]').forEach(b => {
    if (b.getAttribute('data-suppperiod') === 'all') b.classList.add('active');
    else b.classList.remove('active');
  });

  applySuppliersFilters();
}
(window as any).resetSuppliersFilters = resetSuppliersFilters;

function applySuppliersFilters() {
  const fromVal = (document.getElementById('suppFilterFrom') as HTMLInputElement)?.value || '';
  const toVal = (document.getElementById('suppFilterTo') as HTMLInputElement)?.value || '';
  const suppVal = (document.getElementById('suppFilterSupplier') as HTMLSelectElement)?.value || 'all';
  const channelVal = (document.getElementById('suppFilterPaymentChannel') as HTMLSelectElement)?.value || 'all';
  const searchVal = ((document.getElementById('suppFilterSearch') as HTMLInputElement)?.value || '').trim().toLowerCase();

  const filtered = rawSuppliersData.filter(s => {
    // Search query
    if (searchVal) {
      const name = String(s.name || '').toLowerCase();
      if (!name.includes(searchVal)) return false;
    }

    // Supplier dropdown
    if (suppVal !== 'all') {
      if (String(s.name || '').trim() !== suppVal) return false;
    }

    // Payment channel
    if (channelVal !== 'all') {
      if (String(s.payment_channel || '').trim() !== channelVal) return false;
    }

    // Date range
    const payDate = s.payment_date && s.payment_date !== '-' ? s.payment_date : '';
    if (fromVal && payDate && payDate < fromVal) return false;
    if (toVal && payDate && payDate > toVal) return false;

    return true;
  });

  renderSuppliersFilteredView(filtered);
}
(window as any).applySuppliersFilters = applySuppliersFilters;

window.updateSupplierOpeningBalance = async function(id, val) {
  if (!id) return;
  const num = parseFloat(val) || 0;
  try {
    const res = await fetch(`/api/modules/suppliers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_balance: num })
    });
    if (res.ok) {
      showToast('تم حفظ الرصيد المدور للمورد بنجاح');
      loadSuppliersTab();
    } else {
      alert('فشل حفظ الرصيد المدور');
    }
  } catch (e) {
    console.error('Error updating supplier opening balance:', e);
  }
};

function renderSuppliersFilteredView(filtered: any[]) {
  const uniqueSuppliers = new Set(filtered.map((s: any) => String(s.name || '').trim()).filter(Boolean));
  let totalPaid = 0;
  let paymentsCount = 0;
  const seenSuppliersForOpening = new Set();
  let totalOpening = 0;

  filtered.forEach(s => {
    const paid = Number(s.total_paid || 0);
    totalPaid += paid;
    if (paid > 0 || (s.payment_date && s.payment_date !== '-')) {
      paymentsCount++;
    }
    const suppName = String(s.name || '').trim();
    if (suppName && !seenSuppliersForOpening.has(suppName)) {
      seenSuppliersForOpening.add(suppName);
      totalOpening += Number(s.opening_balance || 0);
    }
  });

  const kpiTotalEl = document.getElementById('suppKpiTotal');
  const kpiOpeningEl = document.getElementById('suppKpiTotalOpening');
  const kpiCountEl = document.getElementById('suppKpiCount');
  const kpiPaidEl = document.getElementById('suppKpiTotalPaid');

  if (kpiTotalEl) kpiTotalEl.textContent = String(uniqueSuppliers.size);
  if (kpiOpeningEl) kpiOpeningEl.textContent = formatCurrency(totalOpening);
  if (kpiCountEl) kpiCountEl.textContent = String(paymentsCount);
  if (kpiPaidEl) kpiPaidEl.textContent = formatCurrency(totalPaid);

  const tbody = document.getElementById('suppliersTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#64748b; font-weight:700;">لا توجد سجلات موردين مطابقة للفلاتر الحالية. (<span style="color:#2563eb; cursor:pointer;" onclick="resetSuppliersFilters()">إلغاء الفلاتر</span>)</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach(s => {
    const tr = document.createElement('tr');
    const deleteId = s.payment_id || s.id;
    const dateDisplay = s.payment_date && s.payment_date !== '-'
      ? `${s.payment_date}${s.day_name ? ` <span style="color:#64748b; font-size:0.78rem;">(${s.day_name})</span>` : ''}`
      : '<span style="color:#94a3b8;">-</span>';
    const channelDisplay = s.payment_channel && s.payment_channel !== '-'
      ? `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">${s.payment_channel}</span>`
      : '<span style="color:#94a3b8;">-</span>';

    const openingInputHtml = s.id ? `
      <input type="number" step="any" class="table-input" style="width: 120px; text-align: center; font-weight: 800; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 3px 6px;"
             value="${s.opening_balance || 0}"
             placeholder="0.00"
             title="انقر لتعديل الرصيد المدور من سنوات سابقة"
             onchange="updateSupplierOpeningBalance(${s.id}, this.value)" />
    ` : `
      <span style="font-weight:700; color:#b45309;">${formatCurrency(s.opening_balance || 0)}</span>
    `;

    tr.innerHTML = `
      <td style="text-align:center; font-weight:800; color:#1e293b; font-size:0.92rem;">${s.name}</td>
      <td style="text-align:center;">${openingInputHtml}</td>
      <td style="text-align:center; font-weight:600; white-space:nowrap;">${dateDisplay}</td>
      <td style="text-align:center;">${channelDisplay}</td>
      <td style="text-align:center; font-weight:800; color:#2563eb; font-size:0.95rem;">${formatCurrency(s.total_paid)}</td>
      <td style="text-align:center;">
        <button class="btn-del-row" title="حذف" onclick="deleteModuleItem('/api/modules/suppliers/${deleteId}', loadSuppliersTab)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function syncSuppliersPageToDailyDropdown(suppliersList: any[]) {
  try {
    const names = Array.from(
      new Set(
        (Array.isArray(suppliersList) ? suppliersList : [])
          .map((s: any) => String(s?.name || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ar'));
    (window as any).erpSuppliersPageNames = names;
    localStorage.setItem('erp_suppliers_page_names_v1', JSON.stringify(names));
    if (typeof (window as any).renderSupplierPaymentsTable === 'function') {
      (window as any).renderSupplierPaymentsTable();
    }
  } catch (e) {
    console.error('Failed to sync suppliers to daily dropdown:', e);
  }
}
(window as any).syncSuppliersPageToDailyDropdown = syncSuppliersPageToDailyDropdown;

// جلب أسماء الموردين من صفحة الموردون عند بدء التشغيل لربطها بدفتر اليومية وترحيل أي موردين قدامى
fetch('/api/modules/suppliers')
  .then(res => res.json())
  .then(async (sups) => {
    if (Array.isArray(sups)) {
      syncSuppliersPageToDailyDropdown(sups);

      try {
        const rawLegacy = localStorage.getItem('erp_expense_settings_v1');
        if (rawLegacy) {
          const parsed = JSON.parse(rawLegacy);
          if (Array.isArray(parsed?.suppliers) && parsed.suppliers.length > 0) {
            const currentNames = new Set(sups.map((s: any) => String(s?.name || '').trim()));
            let newlyAdded = false;
            for (const leg of parsed.suppliers) {
              const name = String(leg || '').trim();
              if (name && !currentNames.has(name)) {
                currentNames.add(name);
                try {
                  await fetch('/api/modules/suppliers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                  });
                  newlyAdded = true;
                } catch (e) {}
              }
            }
            if (newlyAdded && typeof loadSuppliersTab === 'function') {
              loadSuppliersTab();
            }
          }
        }
      } catch (e) {}
    }
  })
  .catch(() => {});


// =========================================================================
// تفاصيل كشف حساب المورد التفصيلي (Supplier Statement & Invoices)
// =========================================================================
let activeSupplierStatementId: any = null;
let activeSupplierStatementName: string = '';

function renderSuppliersNavTabs(suppliers: any[]) {
  const tabsContainer = document.getElementById('suppliersNavTabs');
  const countEl = document.getElementById('suppliersNavCount');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';

  const list = Array.isArray(suppliers) ? suppliers : [];
  if (countEl) countEl.textContent = `(${list.length} مورد مسجل)`;

  if (list.length === 0) {
    tabsContainer.innerHTML = '<span style="font-size:0.8rem; color:#94a3b8;">لا يوجد موردون مضافون حالياً.</span>';
    return;
  }

  // إضافة زر "جميع الموردين"
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'btn btn-secondary btn-sm';
  allBtn.style.cssText = 'padding: 5px 12px; font-size: 0.82rem; font-weight: 700; border-radius: 6px; background: #f8fafc; border: 1px solid #cbd5e1; color: #334155;';
  allBtn.innerHTML = '📋 جدول جميع الموردين';
  allBtn.onclick = () => showSuppliersOverview();
  tabsContainer.appendChild(allBtn);

  list.forEach(s => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm';
    const isCurrent = activeSupplierStatementName === s.name;
    btn.style.cssText = isCurrent
      ? 'padding: 5px 12px; font-size: 0.82rem; font-weight: 800; border-radius: 6px; background: #2563eb; color: #fff; border: 1px solid #1d4ed8; box-shadow: 0 1px 3px rgba(37,99,235,0.25);'
      : 'padding: 5px 12px; font-size: 0.82rem; font-weight: 700; border-radius: 6px; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; transition: all 0.15s;';
    btn.innerHTML = `🚚 ${escapeHtml(s.name)}`;
    btn.onclick = () => openSupplierStatementPage(s.id, s.name);
    tabsContainer.appendChild(btn);
  });
}
(window as any).renderSuppliersNavTabs = renderSuppliersNavTabs;

function showSuppliersOverview() {
  activeSupplierStatementId = null;
  activeSupplierStatementName = '';
  const overviewEl = document.getElementById('suppliersOverviewView');
  const detailEl = document.getElementById('supplierDetailView');
  if (overviewEl) overviewEl.style.display = 'block';
  if (detailEl) detailEl.style.display = 'none';

  if (Array.isArray(rawSuppliersData)) {
    renderSuppliersNavTabs(rawSuppliersData);
  }
}
(window as any).showSuppliersOverview = showSuppliersOverview;

async function openSupplierStatementPage(supplierId: any, supplierName: string) {
  activeSupplierStatementId = supplierId;
  activeSupplierStatementName = supplierName;

  const overviewEl = document.getElementById('suppliersOverviewView');
  const detailEl = document.getElementById('supplierDetailView');
  if (overviewEl) overviewEl.style.display = 'none';
  if (detailEl) detailEl.style.display = 'block';

  const titleEl = document.getElementById('suppDetailTitle');
  if (titleEl) titleEl.textContent = supplierName;

  if (Array.isArray(rawSuppliersData)) {
    renderSuppliersNavTabs(rawSuppliersData);
  }

  await loadSupplierStatement(supplierId, supplierName);
}
(window as any).openSupplierStatementPage = openSupplierStatementPage;

async function loadSupplierStatement(supplierId: any, supplierName: string) {
  const tbody = document.getElementById('suppDetailTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:#64748b;">جاري تحميل كشف الحساب والحركات...</td></tr>';

  try {
    const res = await fetch(`/api/modules/suppliers/${supplierId || 0}/statement?name=${encodeURIComponent(supplierName)}`);
    const data = await res.json();

    if (!data || !data.statement) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:#dc2626;">تعذر جلب بيانات كشف الحساب</td></tr>';
      return;
    }

    const { kpis, transactions } = data.statement;

    // تحديث كروت الـ KPI
    const openingEl = document.getElementById('suppDetailKpiOpening');
    const invEl = document.getElementById('suppDetailKpiInvoices');
    const invCountEl = document.getElementById('suppDetailKpiInvoiceCount');
    const discEl = document.getElementById('suppDetailKpiDiscounts');
    const retEl = document.getElementById('suppDetailKpiReturns');
    const paidEl = document.getElementById('suppDetailKpiPaid');
    const balEl = document.getElementById('suppDetailKpiBalance');
    const rowsCountEl = document.getElementById('suppDetailRowsCount');

    if (openingEl) openingEl.textContent = formatCurrency(kpis.opening_balance || 0);
    if (invEl) invEl.textContent = formatCurrency(kpis.total_invoices || 0);
    if (invCountEl) invCountEl.textContent = `${kpis.invoice_count || 0} فواتير مسجلة`;
    if (discEl) discEl.textContent = formatCurrency(kpis.total_discounts || 0);
    if (retEl) retEl.textContent = formatCurrency(kpis.total_returns || 0);
    if (paidEl) paidEl.textContent = formatCurrency(kpis.total_paid || 0);
    if (balEl) {
      const net = kpis.net_balance || 0;
      balEl.textContent = formatCurrency(net);
      balEl.style.color = net > 0 ? '#b91c1c' : (net < 0 ? '#059669' : '#475569');
    }
    if (rowsCountEl) rowsCountEl.textContent = `${(transactions || []).length} حركة مسجلة`;

    tbody.innerHTML = '';
    if (!transactions || transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:1.5rem; color:#94a3b8;">لا توجد أي حركات أو فواتير مسجلة لهذا المورد حتى الآن.</td></tr>';
      return;
    }

    transactions.forEach((tx: any) => {
      const tr = document.createElement('tr');
      if (tx.type === 'opening') {
        tr.style.background = '#fefce8';
      }

      const openingDisplay = tx.opening_balance > 0
        ? `<span style="font-weight:800; color:#b45309;">${formatCurrency(tx.opening_balance)}</span>`
        : '<span style="color:#94a3b8;">-</span>';

      const invoiceDisplay = tx.invoice_amount > 0
        ? `<span style="font-weight:800; color:#1d4ed8;">${formatCurrency(tx.invoice_amount)}</span>`
        : '<span style="color:#94a3b8;">-</span>';

      const invNumDisplay = tx.invoice_number && tx.invoice_number !== '-'
        ? `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:700;">${escapeHtml(tx.invoice_number)}</span>`
        : '<span style="color:#94a3b8;">-</span>';

      const discountDisplay = tx.discount_amount > 0
        ? `<span style="font-weight:800; color:#059669;">${formatCurrency(tx.discount_amount)}</span>`
        : '<span style="color:#94a3b8;">-</span>';

      const returnDisplay = tx.return_amount > 0
        ? `<span style="font-weight:800; color:#dc2626;">${formatCurrency(tx.return_amount)}</span>`
        : '<span style="color:#94a3b8;">-</span>';

      const paidDisplay = tx.paid_amount > 0
        ? `<span style="font-weight:800; color:#0891b2;">${formatCurrency(tx.paid_amount)}</span>`
        : '<span style="color:#94a3b8;">-</span>';

      const actionHtml = tx.can_delete
        ? `<button class="btn-del-row" title="حذف الفاتورة" onclick="deleteModuleItem('/api/modules/suppliers/invoices/${tx.id}', () => reloadCurrentSupplierStatement())">
             <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
           </button>`
        : '';

      tr.innerHTML = `
        <td style="text-align:center; font-weight:600; white-space:nowrap;">${tx.date}</td>
        <td style="text-align:center;">${openingDisplay}</td>
        <td style="text-align:center;">${invoiceDisplay}</td>
        <td style="text-align:center;">${invNumDisplay}</td>
        <td style="text-align:center;">${discountDisplay}</td>
        <td style="text-align:center;">${returnDisplay}</td>
        <td style="text-align:center;">${paidDisplay}</td>
        <td style="text-align:right; font-weight:600; color:#334155;">${escapeHtml(tx.notes || '-')}</td>
        <td style="text-align:center; font-weight:900; color:#1e293b; direction:ltr;">${formatCurrency(tx.running_balance)}</td>
        <td style="text-align:center;">${actionHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading supplier statement:', err);
  }
}
(window as any).loadSupplierStatement = loadSupplierStatement;

function reloadCurrentSupplierStatement() {
  if (activeSupplierStatementId && activeSupplierStatementName) {
    loadSupplierStatement(activeSupplierStatementId, activeSupplierStatementName);
    loadSuppliersTab();
  }
}
(window as any).reloadCurrentSupplierStatement = reloadCurrentSupplierStatement;

function openModalAddSupplierInvoice() {
  const form = document.getElementById('formAddSupplierInvoice') as HTMLFormElement;
  if (form) form.reset();

  const idInput = document.getElementById('suppInvFormSupplierId') as HTMLInputElement;
  const nameInput = document.getElementById('suppInvFormSupplierName') as HTMLInputElement;
  const dateInput = document.getElementById('suppInvDate') as HTMLInputElement;
  const titleEl = document.getElementById('modalAddSupplierInvoiceTitle');

  if (idInput) idInput.value = String(activeSupplierStatementId || '');
  if (nameInput) nameInput.value = activeSupplierStatementName || '';
  if (dateInput) dateInput.value = formatLocalDate(new Date());
  if (titleEl) titleEl.textContent = `+ إضافة فاتورة / حركة للمورد (${activeSupplierStatementName})`;

  openModal('modalAddSupplierInvoice');
}
(window as any).openModalAddSupplierInvoice = openModalAddSupplierInvoice;

(window as any).submitAddSupplierInvoice = async function(e: any) {
  e.preventDefault();
  const form = document.getElementById('formAddSupplierInvoice') as HTMLFormElement;
  if (!form) return;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  try {
    const res = await fetch('/api/modules/suppliers/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      closeModal('modalAddSupplierInvoice');
      showToast('تمت إضافة فاتورة / حركة المورد بنجاح');
      reloadCurrentSupplierStatement();
    } else {
      alert('حدث خطأ أثناء حفظ الفاتورة');
    }
  } catch (err) {
    console.error('Error saving supplier invoice:', err);
    alert('حدث خطأ أثناء حفظ الفاتورة');
  }
};

// 4. Employees Module
let currentEmployeesList: any[] = [];
let editingEmployeeId: number | null = null;

function syncEmployeesPageToDailyDropdown(employeesList: any[]) {
  try {
    const sorted = (Array.isArray(employeesList) ? [...employeesList] : []).sort((a, b) => {
      const aId = String(a?.employee_id || '').trim();
      const bId = String(b?.employee_id || '').trim();
      if (!aId && !bId) return 0;
      if (!aId) return 1;
      if (!bId) return -1;
      return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: 'base' });
    });
    const records = sorted
      .map(e => ({
        name: String(e?.name || '').trim(),
        employee_id: String(e?.employee_id || '').trim()
      }))
      .filter(r => r.name || r.employee_id);
    const names = records.map(r => r.name).filter(Boolean);
    (window as any).erpEmployeesPageNames = names;
    (window as any).erpEmployeesPageRecords = records;
    localStorage.setItem('erp_employees_page_names_v1', JSON.stringify(names));
    localStorage.setItem('erp_employees_page_records_v1', JSON.stringify(records));
    if (typeof (window as any).renderEmployeeAdvancesTable === 'function') {
      (window as any).renderEmployeeAdvancesTable();
    }
    if (typeof (window as any).renderEmployeeSalesTable === 'function') {
      (window as any).renderEmployeeSalesTable();
    }
  } catch (e) {}
}
(window as any).syncEmployeesPageToDailyDropdown = syncEmployeesPageToDailyDropdown;

// جلب أسماء الموظفين من صفحة الموظفون عند بدء التشغيل لربطها بدفتر اليومية
fetch('/api/modules/employees')
  .then(r => r.ok ? r.json() : null)
  .then(emps => {
    if (Array.isArray(emps)) {
      syncEmployeesPageToDailyDropdown(emps);
    }
  })
  .catch(() => {});

async function loadEmployeesTab() {
  try {
    const res = await fetch('/api/modules/employees');
    const rawEmployees = await res.json();
    const employees = (Array.isArray(rawEmployees) ? [...rawEmployees] : []).sort((a, b) => {
      const aId = String(a?.employee_id || '').trim();
      const bId = String(b?.employee_id || '').trim();
      if (!aId && !bId) return 0;
      if (!aId) return 1;
      if (!bId) return -1;
      return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: 'base' });
    });
    currentEmployeesList = employees;
    syncEmployeesPageToDailyDropdown(employees);

    document.getElementById('empKpiTotal').textContent = String(employees.length);
    let sumSales = 0;
    let sumAdvances = 0;
    employees.forEach(e => {
      sumSales += (e.total_sales || 0);
      sumAdvances += (e.total_advances || 0);
    });
    document.getElementById('empKpiTotalSales').textContent = formatCurrency(sumSales);
    document.getElementById('empKpiTotalAdvances').textContent = formatCurrency(sumAdvances);

    const tbody = document.getElementById('employeesTableBody');
    if (!tbody) return;
    if (employees.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem;">لا يوجد موظفون مسجلون. انقر فوق (+ إضافة موظف جديد)</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    employees.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align:center; font-weight:700; color:#0f766e;">${e.employee_id || '-'}</td>
        <td style="text-align:center; font-weight:700;">${e.name}</td>
        <td style="text-align:center;">${e.phone || '-'}</td>
        <td style="text-align:center; font-weight:600;">${formatCurrency(e.salary)}</td>
        <td style="text-align:center; font-weight:700; color:#059669;">${formatCurrency(e.total_sales)}</td>
        <td style="text-align:center; font-weight:700; color:#dc2626;">${formatCurrency(e.total_advances)}</td>
        <td style="text-align:center; white-space:nowrap;">
          <div style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">
            <button type="button" class="btn-del-row" style="color:#0284c7;" title="تعديل بيانات الموظف" onclick="openEditEmployeeModal(${e.id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button type="button" class="btn-del-row" title="حذف الموظف" onclick="deleteModuleItem('/api/modules/employees/${e.id}', loadEmployeesTab)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading employees:', err);
  }
}

window.openEditEmployeeModal = function(empId: number) {
  const emp = currentEmployeesList.find(item => Number(item.id) === Number(empId));
  if (!emp) return;
  editingEmployeeId = Number(emp.id);

  const modal = document.getElementById('modalAddEmployee');
  const form = document.getElementById('formAddEmployee') as HTMLFormElement;
  if (!modal || !form) return;

  const titleEl = modal.querySelector('.modal-header h3');
  if (titleEl) titleEl.textContent = '✏️ تعديل بيانات الموظف';

  const empIdInput = form.querySelector('[name="employee_id"]') as HTMLInputElement;
  const nameInput = form.querySelector('[name="name"]') as HTMLInputElement;
  const phoneInput = form.querySelector('[name="phone"]') as HTMLInputElement;
  const salaryInput = form.querySelector('[name="salary"]') as HTMLInputElement;
  const hireDateInput = form.querySelector('[name="hire_date"]') as HTMLInputElement;

  if (empIdInput) empIdInput.value = emp.employee_id || '';
  if (nameInput) nameInput.value = emp.name || '';
  if (phoneInput) phoneInput.value = emp.phone || '';
  if (salaryInput) salaryInput.value = emp.salary !== undefined && emp.salary !== null ? String(emp.salary) : '';
  if (hireDateInput) hireDateInput.value = emp.hire_date || '';

  modal.classList.add('open');
  setTimeout(() => {
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  }, 40);
};

// 5. Receivables & Payables (الذمم)
async function loadReceivablesTab() {
  try {
    const res = await fetch('/api/modules/receivables');
    const data = await res.json();

    document.getElementById('recKpiTotalReceivable').textContent = formatCurrency(data.total_receivable);
    document.getElementById('recKpiTotalPayable').textContent = formatCurrency(data.total_payable);
    document.getElementById('recKpiNet').textContent = formatCurrency(data.net_receivable);

    const custBody = document.getElementById('receivablesCustomersBody');
    if (custBody) {
      if (data.customers.length === 0) {
        custBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem;">لا توجد ذمم مدينة مسجلة</td></tr>';
      } else {
        custBody.innerHTML = '';
        data.customers.forEach(c => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight:700;">${c.name}</td>
            <td>${c.phone || '-'}</td>
            <td>${c.tax_number || '-'}</td>
            <td style="text-align:center; font-weight:700; color:#059669;">${formatCurrency(c.balance)}</td>
          `;
          custBody.appendChild(tr);
        });
      }
    }

    const suppBody = document.getElementById('receivablesSuppliersBody');
    if (suppBody) {
      if (data.suppliers.length === 0) {
        suppBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem;">لا توجد ذمم دائنة مسجلة</td></tr>';
      } else {
        suppBody.innerHTML = '';
        data.suppliers.forEach(s => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight:700;">${s.name}</td>
            <td>${s.phone || '-'}</td>
            <td>${s.tax_number || '-'}</td>
            <td style="text-align:center; font-weight:700; color:#dc2626;">${formatCurrency(s.balance)}</td>
          `;
          suppBody.appendChild(tr);
        });
      }
    }
  } catch (err) {
    console.error('Error loading receivables:', err);
  }
}

// 6. Checks Module (الشيكات)
async function loadChecksTab() {
  try {
    const res = await fetch('/api/modules/checks');
    const checks = await res.json();

    let incTotal = 0;
    let outTotal = 0;
    let pendingTotal = 0;
    let collectedTotal = 0;

    checks.forEach(c => {
      const amt = Number(c.amount) || 0;
      if (c.type === 'incoming') incTotal += amt;
      if (c.type === 'outgoing') outTotal += amt;
      if (c.status === 'pending') pendingTotal += amt;
      if (c.status === 'collected') collectedTotal += amt;
    });

    document.getElementById('chkKpiIncoming').textContent = formatCurrency(incTotal);
    document.getElementById('chkKpiOutgoing').textContent = formatCurrency(outTotal);
    document.getElementById('chkKpiPending').textContent = formatCurrency(pendingTotal);
    document.getElementById('chkKpiCollected').textContent = formatCurrency(collectedTotal);

    const tbody = document.getElementById('checksTableBody');
    if (!tbody) return;
    if (checks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.5rem;">لا توجد شيكات مسجلة. انقر فوق (+ إضافة شيك جديد)</td></tr>';
      return;
    }

    const statusBadges = {
      pending: '<span class="badge-status badge-pending">تحت التحصيل</span>',
      collected: '<span class="badge-status badge-collected">تم التحصيل</span>',
      bounced: '<span class="badge-status badge-bounced">مرتجع</span>',
      cancelled: '<span class="badge-status badge-bounced">ملغى</span>'
    };

    tbody.innerHTML = '';
    checks.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:#1e40af;">${c.check_number}</td>
        <td><span class="badge-status ${c.type === 'incoming' ? 'badge-completed' : 'badge-customs'}">${c.type === 'incoming' ? 'وارد (قبض)' : 'صادر (صرف)'}</span></td>
        <td style="font-weight:600;">${c.party_name}</td>
        <td>${c.bank_name || '-'}</td>
        <td style="text-align:center;">${c.due_date}</td>
        <td style="text-align:center; font-weight:700;">${formatCurrency(c.amount)}</td>
        <td style="text-align:center;">
          <select class="form-input" style="height:26px; padding:0 4px; font-size:0.75rem;" onchange="updateCheckStatus(${c.id}, this.value)">
            <option value="pending" ${c.status === 'pending' ? 'selected' : ''}>تحت التحصيل</option>
            <option value="collected" ${c.status === 'collected' ? 'selected' : ''}>تم التحصيل</option>
            <option value="bounced" ${c.status === 'bounced' ? 'selected' : ''}>مرتجع</option>
            <option value="cancelled" ${c.status === 'cancelled' ? 'selected' : ''}>ملغى</option>
          </select>
        </td>
        <td style="text-align:center;">
          <button class="btn-del-row" title="حذف الشيك" onclick="deleteModuleItem('/api/modules/checks/${c.id}', loadChecksTab)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading checks:', err);
  }
}

async function updateCheckStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/modules/checks/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      showToast('تم تحديث حالة الشيك بنجاح');
      loadChecksTab();
    }
  } catch (err) {
    console.error(err);
  }
}

// 7. Partners Module (الشركاء)
async function loadPartnersTab() {
  try {
    const res = await fetch('/api/modules/partners');
    const partners = await res.json();

    let totalCap = 0;
    let totalDraw = 0;
    partners.forEach(p => {
      totalCap += Number(p.capital || 0);
      totalDraw += Number(p.drawings || 0);
    });

    document.getElementById('partKpiTotalCapital').textContent = formatCurrency(totalCap);
    document.getElementById('partKpiTotalDrawings').textContent = formatCurrency(totalDraw);
    document.getElementById('partKpiNetEquity').textContent = formatCurrency(totalCap - totalDraw);

    const tbody = document.getElementById('partnersTableBody');
    if (!tbody) return;
    if (partners.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem;">لا يوجد شركاء مسجلون. انقر فوق (+ إضافة شريك جديد)</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    partners.forEach(p => {
      const net = (p.capital || 0) - (p.drawings || 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:#1e293b;">${p.name}</td>
        <td style="text-align:center; font-weight:700;">${p.share_percentage}%</td>
        <td style="text-align:center; font-weight:700; color:#1e40af;">${formatCurrency(p.capital)}</td>
        <td style="text-align:center; color:#dc2626;">${formatCurrency(p.drawings)}</td>
        <td style="text-align:center; font-weight:700; color:#059669;">${formatCurrency(net)}</td>
        <td>${p.phone || '-'}</td>
        <td style="text-align:center;">
          <button class="btn-del-row" title="حذف الشريك" onclick="deleteModuleItem('/api/modules/partners/${p.id}', loadPartnersTab)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading partners:', err);
  }
}

// 8. Investments Module (الاستثمار)
async function loadInvestmentsTab() {
  try {
    const res = await fetch('/api/modules/investments');
    const investments = await res.json();

    let totalInit = 0;
    let totalCur = 0;
    let totalRet = 0;
    investments.forEach(i => {
      totalInit += Number(i.initial_amount || 0);
      totalCur += Number(i.current_value || 0);
      totalRet += Number(i.returns || 0);
    });

    document.getElementById('invKpiInitial').textContent = formatCurrency(totalInit);
    document.getElementById('invKpiCurrent').textContent = formatCurrency(totalCur);
    document.getElementById('invKpiReturns').textContent = formatCurrency(totalRet);

    const tbody = document.getElementById('investmentsTableBody');
    if (!tbody) return;
    if (investments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.5rem;">لا توجد استثمارات مسجلة. انقر فوق (+ إضافة استثمار جديد)</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    investments.forEach(i => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:#0f766e;">${i.title}</td>
        <td><span class="badge-status badge-in_transit">${i.category || 'تطوير أعمال'}</span></td>
        <td style="text-align:center;">${i.start_date}</td>
        <td style="text-align:center; font-weight:700;">${formatCurrency(i.initial_amount)}</td>
        <td style="text-align:center; font-weight:700; color:#1e40af;">${formatCurrency(i.current_value)}</td>
        <td style="text-align:center; font-weight:700; color:#059669;">${formatCurrency(i.returns)}</td>
        <td style="text-align:center;"><span class="badge-status badge-active">${i.status === 'active' ? 'نشط' : i.status}</span></td>
        <td style="text-align:center;">
          <button class="btn-del-row" title="حذف الاستثمار" onclick="deleteModuleItem('/api/modules/investments/${i.id}', loadInvestmentsTab)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading investments:', err);
  }
}

// 9. Imports Module (ادارة الواردات - تحليل المبيعات والربح ورأس المال والالتزامات والاستثمارات)
let importsSalesCache: any[] = [];

async function loadImportsTab() {
  const tbody = document.getElementById('importsSalesBreakdownBody');
  if (tbody && importsSalesCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:#64748b;">جاري تحميل بيانات المبيعات من دفتر اليومية...</td></tr>';
  }
  try {
    const res = await fetch('/api/modules/sales-summary');
    const data = await res.json();
    importsSalesCache = Array.isArray(data.history) ? data.history : [];
    applyImportsFilters();
  } catch (err) {
    console.error('Error loading imports breakdown:', err);
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:#dc2626;">تعذر تحميل البيانات من دفتر اليومية.</td></tr>';
    }
  }
}
window.loadImportsTab = loadImportsTab;

function applyImportsFilters() {
  const fromDate = (document.getElementById('importsFilterFrom') as HTMLInputElement)?.value || '';
  const toDate = (document.getElementById('importsFilterTo') as HTMLInputElement)?.value || '';

  let list = importsSalesCache.filter(r => {
    const total = parseFloat(r.day_total) || 0;
    if (total <= 0) return false;
    const rDate = r.sheet_date || '';
    if (fromDate && rDate < fromDate) return false;
    if (toDate && rDate > toDate) return false;
    return true;
  });

  // ترتيب التواريخ من الأقدم إلى الأحدث
  list.sort((a, b) => (a.sheet_date || '').localeCompare(b.sheet_date || ''));

  let sumSales = 0;
  let sumProfit = 0;
  let sumCapital = 0;
  let sumLiabilities = 0;
  let sumInvestments = 0;

  const tbody = document.getElementById('importsSalesBreakdownBody');
  const tfoot = document.getElementById('importsSalesBreakdownFoot');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:#64748b; font-weight:600;">لا توجد مبيعات مسجلة في دفتر اليومية تطابق الفترة المحددة</td></tr>';
    if (tfoot) tfoot.innerHTML = '';
    updateImportsKpis(0, 0, 0, 0, 0, 0);
    return;
  }

  tbody.innerHTML = '';
  list.forEach(r => {
    const total = Math.round(Number(r.day_total || 0) * 100) / 100;
    const profit = Math.round(total * 0.40 * 100) / 100;
    const capital = Math.round((total - profit) * 100) / 100;
    const liabilities = Math.round(profit * 0.75 * 100) / 100;
    const investments = Math.round(profit * 0.25 * 100) / 100;

    sumSales += total;
    sumProfit += profit;
    sumCapital += capital;
    sumLiabilities += liabilities;
    sumInvestments += investments;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 9px 12px; text-align: center; font-weight: 700; border-left: 1px solid #e2e8f0;">${r.day_name || '-'}</td>
      <td style="padding: 9px 12px; text-align: center; font-weight: 600; color: #475569; border-left: 1px solid #e2e8f0;">${r.sheet_date || '-'}</td>
      <td style="padding: 9px 12px; text-align: center; font-weight: 700; color: #1e3a8a; border-left: 1px solid #e2e8f0;">${formatCurrency(total)}</td>
      <td style="padding: 9px 12px; text-align: center; font-weight: 700; color: #059669; border-left: 1px solid #e2e8f0;">${formatCurrency(profit)}</td>
      <td style="padding: 9px 12px; text-align: center; font-weight: 700; color: #2563eb; border-left: 1px solid #e2e8f0;">${formatCurrency(capital)}</td>
      <td style="padding: 9px 12px; text-align: center; font-weight: 700; color: #d97706; border-left: 1px solid #e2e8f0;">${formatCurrency(liabilities)}</td>
      <td style="padding: 9px 12px; text-align: center; font-weight: 700; color: #9333ea;">${formatCurrency(investments)}</td>
    `;
    tbody.appendChild(tr);
  });

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td style="padding: 10px 14px; text-align: center; font-weight: 900; border-left: 1px solid #cbd5e1;">المجموع الكلي</td>
        <td style="padding: 10px 14px; text-align: center; font-weight: 900; border-left: 1px solid #cbd5e1; color: #475569;">${list.length} يوم</td>
        <td style="padding: 10px 14px; text-align: center; font-weight: 900; border-left: 1px solid #cbd5e1; color: #1e3a8a;">${formatCurrency(sumSales)}</td>
        <td style="padding: 10px 14px; text-align: center; font-weight: 900; border-left: 1px solid #cbd5e1; color: #059669;">${formatCurrency(sumProfit)}</td>
        <td style="padding: 10px 14px; text-align: center; font-weight: 900; border-left: 1px solid #cbd5e1; color: #2563eb;">${formatCurrency(sumCapital)}</td>
        <td style="padding: 10px 14px; text-align: center; font-weight: 900; border-left: 1px solid #cbd5e1; color: #d97706;">${formatCurrency(sumLiabilities)}</td>
        <td style="padding: 10px 14px; text-align: center; font-weight: 900; color: #9333ea;">${formatCurrency(sumInvestments)}</td>
      </tr>
    `;
  }

  updateImportsKpis(list.length, sumSales, sumProfit, sumCapital, sumLiabilities, sumInvestments);
}
window.applyImportsFilters = applyImportsFilters;

function updateImportsKpis(days: number, sales: number, profit: number, capital: number, liabilities: number, investments: number) {
  const setEl = (id: string, val: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setEl('impKpiSalesDays', String(days));
  setEl('impKpiTotalSales', formatCurrency(sales));
  setEl('impKpiTotalProfit', formatCurrency(profit));
  setEl('impKpiTotalCapital', formatCurrency(capital));
  setEl('impKpiTotalLiabilities', formatCurrency(liabilities));
  setEl('impKpiTotalInvestments', formatCurrency(investments));
}

// 10. Profit & Loss Statement (الارباح و الخسائر)
async function loadProfitLossTab() {
  try {
    const res = await fetch('/api/modules/profit-loss');
    const pl = await res.json();

    document.getElementById('plKpiRevenues').textContent = formatCurrency(pl.total_revenues);
    document.getElementById('plKpiCostOfGoods').textContent = formatCurrency(pl.cost_of_goods);
    document.getElementById('plKpiGrossProfit').textContent = formatCurrency(pl.gross_profit);
    document.getElementById('plKpiExpenses').textContent = formatCurrency(pl.operating_expenses);

    const netEl = document.getElementById('plKpiNetProfit');
    netEl.textContent = formatCurrency(pl.net_profit);
    netEl.style.color = pl.net_profit >= 0 ? '#059669' : '#dc2626';

    const marginEl = document.getElementById('plMarginVal');
    if (marginEl) {
      marginEl.textContent = `${pl.net_profit_margin || 0}%`;
    }

    // Populate detailed breakdown rows
    document.getElementById('plValSalesChannels').textContent = formatCurrency(pl.breakdown.sales_channels);
    document.getElementById('plValPerfumes').textContent = formatCurrency(pl.breakdown.perfumes);
    document.getElementById('plValExtraRev').textContent = formatCurrency(pl.breakdown.extra_revenues);
    document.getElementById('plValTotalRev').textContent = formatCurrency(pl.total_revenues);

    document.getElementById('plValPurchases').textContent = formatCurrency(pl.cost_of_goods);
    document.getElementById('plValGross').textContent = formatCurrency(pl.gross_profit);

    document.getElementById('plValInternalExp').textContent = formatCurrency(pl.breakdown.internal_expenses);
    document.getElementById('plValEmployeeExp').textContent = formatCurrency(pl.breakdown.employee_expenses);
    document.getElementById('plValOtherExp').textContent = formatCurrency(pl.breakdown.other_expenses);
    document.getElementById('plValTotalExp').textContent = formatCurrency(pl.operating_expenses);

    const netFinal = document.getElementById('plValNetFinal');
    netFinal.textContent = formatCurrency(pl.net_profit);
    netFinal.style.color = pl.net_profit >= 0 ? '#059669' : '#dc2626';
  } catch (err) {
    console.error('Error loading profit & loss:', err);
  }
}

// Master Tab Switcher
window.switchTab = function(targetTab) {
  modulesState.activeTab = targetTab;

  // Update tabs highlight
  document.querySelectorAll('.nav-tab').forEach(t => {
    if (t.dataset.tab === targetTab) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  // Views mapping
  const allViews = [
    'tabDailyView', 'tabSalesView', 'tabExpensesView', 'tabSuppliersView',
    'tabEmployeesView', 'tabReceivablesView', 'tabChecksView', 'tabPartnersView',
    'tabInvestmentsView', 'tabImportsView', 'tabProfitLossView', 'tabAccountsView',
    'tabSettingsView'
  ];

  const viewIdMap = {
    daily: 'tabDailyView',
    sales: 'tabSalesView',
    expenses: 'tabExpensesView',
    suppliers: 'tabSuppliersView',
    employees: 'tabEmployeesView',
    receivables: 'tabReceivablesView',
    checks: 'tabChecksView',
    partners: 'tabPartnersView',
    investments: 'tabInvestmentsView',
    imports: 'tabImportsView',
    'profit-loss': 'tabProfitLossView',
    accounts: 'tabAccountsView',
    settings: 'tabSettingsView'
  };

  const targetViewId = viewIdMap[targetTab] || 'tabDailyView';

  allViews.forEach(vId => {
    const el = document.getElementById(vId);
    if (el) el.style.display = (vId === targetViewId) ? 'block' : 'none';
  });

  // Call loader
  if (targetTab === 'sales') loadSalesTab();
  if (targetTab === 'expenses') loadExpensesTab();
  if (targetTab === 'suppliers') loadSuppliersTab();
  if (targetTab === 'employees') loadEmployeesTab();
  if (targetTab === 'receivables') loadReceivablesTab();
  if (targetTab === 'checks') loadChecksTab();
  if (targetTab === 'partners') loadPartnersTab();
  if (targetTab === 'investments') loadInvestmentsTab();
  if (targetTab === 'imports') loadImportsTab();
  if (targetTab === 'profit-loss') loadProfitLossTab();
  if (targetTab === 'accounts' && typeof window.loadAccountsTab === 'function') window.loadAccountsTab();
  if (targetTab === 'settings' && typeof window.loadSettingsTab === 'function') window.loadSettingsTab();
};

// 12. Settings Module (الإعدادات)
const DEFAULT_SALES_FIELD_NAMES = {
  sales_cash: { name: 'صندوق', icon: '💵' },
  sales_delivery: { name: 'توصيل', icon: '🛵' },
  sales_visa: { name: 'فيزا / NETWORK', icon: '💳' },
  sales_ittihad: { name: 'فيزا / الاتحاد', icon: '🏦' },
  sales_ittihad_qr: { name: 'الاتحاد / QR', icon: '📱' },
  sales_cliq: { name: 'كليك', icon: '⚡' },
  sales_items_count: { name: 'عدد القطع المباعة', icon: '📦' }
};

window.getCustomSalesFieldNames = function() {
  try {
    const raw = localStorage.getItem('custom_sales_field_names');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading custom field names:', e);
  }
  return {};
};

window.getSalesFieldName = function(key) {
  const custom = window.getCustomSalesFieldNames();
  if (custom && custom[key] && custom[key].trim()) {
    return custom[key].trim();
  }
  return DEFAULT_SALES_FIELD_NAMES[key] ? DEFAULT_SALES_FIELD_NAMES[key].name : key;
};

window.showSettingsSection = function(secId, btnEl) {
  // Update buttons
  document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  // Update panels
  document.querySelectorAll('.settings-sec-panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(secId);
  if (target) {
    target.classList.add('active');
  }
  if (secId === 'sec_expenses' && typeof window.renderExpenseSettingsTables === 'function') {
    window.renderExpenseSettingsTables();
  }
};

window.updateFieldNamePreview = function(key) {
  const inp = document.getElementById(`custName_${key}`);
  const prev = document.getElementById(`prev_${key}`);
  if (inp && prev) {
    const val = inp.value.trim();
    prev.textContent = val || (DEFAULT_SALES_FIELD_NAMES[key] ? DEFAULT_SALES_FIELD_NAMES[key].name : '');
  }
};

window.populateSettingsFieldInputs = function() {
  const custom = window.getCustomSalesFieldNames();
  Object.keys(DEFAULT_SALES_FIELD_NAMES).forEach(key => {
    const inp = document.getElementById(`custName_${key}`);
    const prev = document.getElementById(`prev_${key}`);
    const currentCustom = (custom && custom[key]) ? custom[key] : '';
    const defaultName = DEFAULT_SALES_FIELD_NAMES[key].name;
    if (inp) inp.value = currentCustom;
    if (prev) prev.textContent = currentCustom || defaultName;
  });
};

window.saveSalesFieldNames = function() {
  const custom = {};
  Object.keys(DEFAULT_SALES_FIELD_NAMES).forEach(key => {
    const inp = document.getElementById(`custName_${key}`);
    if (inp && inp.value.trim()) {
      custom[key] = inp.value.trim();
    }
  });
  localStorage.setItem('custom_sales_field_names', JSON.stringify(custom));
  window.applyCustomFieldNames();
  if (typeof showToast === 'function') {
    showToast('تم حفظ وتطبيق أسماء الخانات الجديدة بنجاح!');
  }
};

window.resetSalesFieldNames = function() {
  if (!confirm('هل أنت متأكد من رغبتك في استعادة الأسماء الافتراضية الأصلية لكافة خانات المبيعات؟')) return;
  localStorage.removeItem('custom_sales_field_names');
  window.populateSettingsFieldInputs();
  window.applyCustomFieldNames();
  if (typeof showToast === 'function') {
    showToast('تمت استعادة الأسماء الافتراضية بنجاح.');
  }
};

window.applyCustomFieldNames = function() {
  const custom = window.getCustomSalesFieldNames();

  const cashName = custom.sales_cash || 'صندوق';
  const deliveryName = custom.sales_delivery || 'توصيل';
  const visaName = custom.sales_visa || 'فيزا / NETWORK';
  const ittihadName = custom.sales_ittihad || 'فيزا / الاتحاد';
  const ittihadQrName = custom.sales_ittihad_qr || 'الاتحاد / QR';
  const cliqName = custom.sales_cliq || 'كليك';
  const itemsCountName = custom.sales_items_count || 'عدد القطع المباعة';

  // 1. Daily Journal labels
  const lblCash = document.getElementById('label_sales_cash');
  if (lblCash) lblCash.textContent = `💵 ${cashName}`;
  const lblDel = document.getElementById('label_sales_delivery');
  if (lblDel) lblDel.textContent = `🛵 ${deliveryName}`;
  const lblVisa = document.getElementById('label_sales_visa');
  if (lblVisa) lblVisa.textContent = `💳 ${visaName}`;
  const lblItt = document.getElementById('label_sales_ittihad');
  if (lblItt) lblItt.textContent = `🏦 ${ittihadName}`;
  const lblIttQr = document.getElementById('label_sales_ittihad_qr');
  if (lblIttQr) lblIttQr.textContent = `📱 ${ittihadQrName}`;
  const lblCliq = document.getElementById('label_sales_cliq');
  if (lblCliq) lblCliq.textContent = `⚡ ${cliqName}`;
  const lblItems = document.getElementById('label_sales_items_count');
  if (lblItems) {
    lblItems.innerHTML = `📦 ${itemsCountName}`;
  }

  // 2. Sales table headers
  const thCash = document.getElementById('th_sales_cash');
  if (thCash) thCash.textContent = cashName;
  const thDel = document.getElementById('th_sales_delivery');
  if (thDel) thDel.textContent = deliveryName;
  const thVisa = document.getElementById('th_sales_visa');
  if (thVisa) thVisa.textContent = visaName;
  const thItt = document.getElementById('th_sales_ittihad');
  if (thItt) thItt.textContent = ittihadName;
  const thIttQr = document.getElementById('th_sales_ittihad_qr');
  if (thIttQr) thIttQr.textContent = ittihadQrName;
  const thCliq = document.getElementById('th_sales_cliq');
  if (thCliq) thCliq.textContent = cliqName;

  // 3. Sales filters dropdown
  const optCash = document.getElementById('opt_sales_cash');
  if (optCash) optCash.textContent = cashName;
  const optDel = document.getElementById('opt_sales_delivery');
  if (optDel) optDel.textContent = deliveryName;
  const optVisa = document.getElementById('opt_sales_visa');
  if (optVisa) optVisa.textContent = visaName;
  const optItt = document.getElementById('opt_sales_ittihad');
  if (optItt) optItt.textContent = ittihadName;
  const optIttQr = document.getElementById('opt_sales_ittihad_qr');
  if (optIttQr) optIttQr.textContent = ittihadQrName;
  const optCliq = document.getElementById('opt_sales_cliq');
  if (optCliq) optCliq.textContent = cliqName;

  // 4. Sales KPI cards titles
  const kpiCash = document.getElementById('kpiTitleCash');
  if (kpiCash) kpiCash.textContent = cashName;
  const kpiDel = document.getElementById('kpiTitleDelivery');
  if (kpiDel) kpiDel.textContent = deliveryName;
  const kpiVisa = document.getElementById('kpiTitleVisa');
  if (kpiVisa) kpiVisa.textContent = visaName;
  const kpiItt = document.getElementById('kpiTitleIttihad');
  if (kpiItt) kpiItt.textContent = ittihadName;
  const kpiIttQr = document.getElementById('kpiTitleIttihadQr');
  if (kpiIttQr) kpiIttQr.textContent = ittihadQrName;
  const kpiCliq = document.getElementById('kpiTitleCliq');
  if (kpiCliq) kpiCliq.textContent = cliqName;
};

window.loadSettingsTab = function() {
  const compName = document.getElementById('settingCompanyName');
  if (compName && !compName.value) compName.value = 'نديم للحسابات';
  window.populateSettingsFieldInputs();
  window.applyCustomFieldNames();
  if (typeof window.renderExpenseSettingsTables === 'function') {
    window.renderExpenseSettingsTables();
  }
};

// ============================================================================
// Expense Settings Tables (2. إعدادات المصاريف: المصاريف التشغيلية & المصاريف الثابتة بدون القيمة)
// ============================================================================
function sortExpenseRowsArabic(arr) {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const aCat = String(typeof a === 'object' && a !== null ? (a.mainCategory || '') : (a || '')).trim();
    const bCat = String(typeof b === 'object' && b !== null ? (b.mainCategory || '') : (b || '')).trim();
    if (!aCat && !bCat) return 0;
    if (!aCat) return 1;
    if (!bCat) return -1;
    return aCat.localeCompare(bCat, 'ar');
  });
}

function sortPaymentChannelsArabic(arr) {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const aVal = String(a || '').trim();
    const bVal = String(b || '').trim();
    if (!aVal && !bVal) return 0;
    if (!aVal) return 1;
    if (!bVal) return -1;
    return aVal.localeCompare(bVal, 'ar');
  });
}

function normalizeExpenseRows(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return [{ mainCategory: '' }];
  }
  const seen = new Set();
  const result = [];

  arr.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      const mainCat = String(item.mainCategory || '').trim();
      if (mainCat) {
        if (!seen.has(mainCat)) {
          seen.add(mainCat);
          result.push({ mainCategory: mainCat });
        }
      } else if (!item.description && (!Array.isArray(item.descriptions) || !item.descriptions.some(Boolean))) {
        result.push({ mainCategory: '' });
      }
    } else {
      const strVal = String(item || '').trim();
      if (strVal && !seen.has(strVal)) {
        seen.add(strVal);
        result.push({ mainCategory: strVal });
      } else if (!strVal) {
        result.push({ mainCategory: '' });
      }
    }
  });

  if (result.length === 0) {
    return [{ mainCategory: '' }];
  }
  return sortExpenseRowsArabic(result);
}

function hasNonEmptyExpenseRow(arr) {
  if (!Array.isArray(arr)) return false;
  return arr.some(item => {
    if (typeof item === 'object' && item !== null) {
      return Boolean(String(item.mainCategory || '').trim());
    }
    return Boolean(String(item || '').trim());
  });
}

function normalizePaymentChannels(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return ['نقدا', 'صندوق'];
  }
  const set = new Set(arr.map(item => String(item || '').trim()).filter(Boolean));
  set.add('نقدا');
  set.add('صندوق');
  return sortPaymentChannelsArabic(Array.from(set));
}

function sortEmployeesSettingsArabic(arr) {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const aName = String(a?.name || '').trim();
    const bName = String(b?.name || '').trim();
    const aEmpty = !aName && !String(a?.employeeId || '').trim() && !String(a?.basicSalary || '').trim();
    const bEmpty = !bName && !String(b?.employeeId || '').trim() && !String(b?.basicSalary || '').trim();
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return aName.localeCompare(bName, 'ar');
  });
}

function normalizeEmployeesSettingsRows(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return [{ name: '', employeeId: '', basicSalary: '' }];
  }
  const mapped = arr.map(item => ({
    name: String(item?.name || ''),
    employeeId: String(item?.employeeId || ''),
    basicSalary: String(item?.basicSalary || '')
  }));
  return sortEmployeesSettingsArabic(mapped);
}

function hasNonEmptyEmployeeSettingRow(arr) {
  if (!Array.isArray(arr)) return false;
  return arr.some(item =>
    Boolean(String(item?.name || '').trim() || String(item?.employeeId || '').trim() || String(item?.basicSalary || '').trim())
  );
}

function normalizeSuppliersSettingsRows(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return [''];
  }
  return sortPaymentChannelsArabic(arr.map(item => String(item || '')));
}

function getExpenseSettingsData() {
  try {
    const raw = localStorage.getItem('erp_expense_settings_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        operational: normalizeExpenseRows(parsed.operational),
        fixed: normalizeExpenseRows(parsed.fixed),
        paymentChannels: normalizePaymentChannels(parsed.paymentChannels),
        employees: normalizeEmployeesSettingsRows(parsed.employees),
        suppliers: normalizeSuppliersSettingsRows(parsed.suppliers)
      };
    }
  } catch (e) {}
  return {
    operational: [{ mainCategory: '' }],
    fixed: [{ mainCategory: '' }],
    paymentChannels: ['نقدا', 'صندوق'],
    employees: [{ name: '', employeeId: '', basicSalary: '' }],
    suppliers: ['']
  };
}

function saveExpenseSettingsData(data) {
  try {
    localStorage.setItem('erp_expense_settings_v1', JSON.stringify(data));
    if (typeof (window as any).renderInternalExpensesTable === 'function') {
      (window as any).renderInternalExpensesTable();
    }
    if (typeof (window as any).renderEmployeeAdvancesTable === 'function') {
      (window as any).renderEmployeeAdvancesTable();
    }
    if (typeof (window as any).renderSupplierPaymentsTable === 'function') {
      (window as any).renderSupplierPaymentsTable();
    }
    fetch('/api/settings/expense-definitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(() => {});
  } catch (e) {}
}

let expenseSettingsState = getExpenseSettingsData();

// Sync from cloud database on load
fetch('/api/settings/expense-definitions')
  .then(r => r.ok ? r.json() : null)
  .then(cloudData => {
    if (cloudData && (Array.isArray(cloudData.operational) || Array.isArray(cloudData.fixed) || Array.isArray(cloudData.paymentChannels) || Array.isArray(cloudData.employees) || Array.isArray(cloudData.suppliers))) {
      const hasOps = hasNonEmptyExpenseRow(cloudData.operational);
      const hasFix = hasNonEmptyExpenseRow(cloudData.fixed);
      const hasChannels = Array.isArray(cloudData.paymentChannels) && cloudData.paymentChannels.some(c => String(c || '').trim());
      const hasEmps = hasNonEmptyEmployeeSettingRow(cloudData.employees);
      const hasSupps = Array.isArray(cloudData.suppliers) && cloudData.suppliers.some(s => String(s || '').trim());
      if (hasOps || hasFix || hasChannels || hasEmps || hasSupps) {
        expenseSettingsState = {
          operational: hasOps ? normalizeExpenseRows(cloudData.operational) : expenseSettingsState.operational,
          fixed: hasFix ? normalizeExpenseRows(cloudData.fixed) : expenseSettingsState.fixed,
          paymentChannels: hasChannels ? normalizePaymentChannels(cloudData.paymentChannels) : expenseSettingsState.paymentChannels,
          employees: hasEmps ? normalizeEmployeesSettingsRows(cloudData.employees) : expenseSettingsState.employees,
          suppliers: hasSupps ? normalizeSuppliersSettingsRows(cloudData.suppliers) : expenseSettingsState.suppliers
        };
        localStorage.setItem('erp_expense_settings_v1', JSON.stringify(expenseSettingsState));
        if (typeof window.renderExpenseSettingsTables === 'function') window.renderExpenseSettingsTables();
        if (typeof (window as any).renderInternalExpensesTable === 'function') (window as any).renderInternalExpensesTable();
        if (typeof (window as any).renderEmployeeAdvancesTable === 'function') (window as any).renderEmployeeAdvancesTable();
        if (typeof (window as any).renderSupplierPaymentsTable === 'function') (window as any).renderSupplierPaymentsTable();
      } else {
        const localHasOps = hasNonEmptyExpenseRow(expenseSettingsState.operational);
        const localHasFix = hasNonEmptyExpenseRow(expenseSettingsState.fixed);
        const localHasChannels = Array.isArray(expenseSettingsState.paymentChannels) && expenseSettingsState.paymentChannels.some(c => String(c || '').trim());
        const localHasEmps = hasNonEmptyEmployeeSettingRow(expenseSettingsState.employees);
        const localHasSupps = Array.isArray(expenseSettingsState.suppliers) && expenseSettingsState.suppliers.some(s => String(s || '').trim());
        if (localHasOps || localHasFix || localHasChannels || localHasEmps || localHasSupps) {
          fetch('/api/settings/expense-definitions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseSettingsState)
          }).catch(() => {});
        }
      }
    }
  })
  .catch(() => {});

window.renderExpenseSettingsTables = function() {
  const renderSection = (type, tbodyId) => {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = expenseSettingsState[type] || [];
    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr class="empty-row-placeholder">
          <td colspan="2">لا توجد بيانات مسجلة (<span onclick="addExpenseSettingRow('${type}')">+ أضف سطر</span>)</td>
        </tr>
      `;
      return;
    }
    tbody.innerHTML = rows.map((rowObj, idx) => {
      const item = typeof rowObj === 'object' && rowObj !== null
        ? rowObj
        : { mainCategory: String(rowObj || '') };
      const safeMainCat = String(item.mainCategory || '').replace(/"/g, '&quot;');
      return `
        <tr>
          <td>
            <input type="text" class="table-input" style="text-align: center; font-weight: 700;" value="${safeMainCat}" placeholder="التصنيف الرئيسي"
                   oninput="updateExpenseSettingRow('${type}', ${idx}, 'mainCategory', this.value)"
                   onblur="onExpenseSettingInputBlur()">
          </td>
          <td style="width: 38px; text-align: center;">
            <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteExpenseSettingRow('${type}', ${idx})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  };

  const renderPaymentChannels = (tbodyId) => {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = expenseSettingsState.paymentChannels || [];
    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr class="empty-row-placeholder">
          <td colspan="2">لا توجد قنوات دفع مسجلة (<span onclick="addExpenseSettingRow('paymentChannels')">+ أضف قناة دفع</span>)</td>
        </tr>
      `;
      return;
    }
    tbody.innerHTML = rows.map((val, idx) => {
      const safeVal = String(val || '').replace(/"/g, '&quot;');
      return `
        <tr>
          <td>
            <input type="text" class="table-input" style="text-align: center;" value="${safeVal}" placeholder="قناة الدفع (مثلاً: صندوق، بنك، كليك...)"
                   oninput="updateExpenseSettingRow('paymentChannels', ${idx}, this.value)"
                   onblur="onExpenseSettingInputBlur()">
          </td>
          <td style="width: 38px; text-align: center;">
            <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteExpenseSettingRow('paymentChannels', ${idx})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  };

  const renderEmployeesSettings = () => {
    const tbody = document.getElementById('settingsEmployeesBody');
    if (!tbody) return;
    const rows = expenseSettingsState.employees || [];
    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr class="empty-row-placeholder">
          <td colspan="4">لا توجد بيانات موظفين مسجلة (<span onclick="addEmployeeSettingRow()">+ أضف سطر</span>)</td>
        </tr>
      `;
      return;
    }
    tbody.innerHTML = rows.map((emp, idx) => {
      const safeName = String(emp?.name || '').replace(/"/g, '&quot;');
      const safeId = String(emp?.employeeId || '').replace(/"/g, '&quot;');
      const safeSalary = String(emp?.basicSalary || '').replace(/"/g, '&quot;');
      return `
        <tr>
          <td>
            <input type="text" class="table-input" style="text-align: center; font-weight: 700;" value="${safeName}" placeholder="اسم الموظف"
                   oninput="updateEmployeeSettingRow(${idx}, 'name', this.value)"
                   onblur="onExpenseSettingInputBlur()">
          </td>
          <td style="width: 240px;">
            <input type="text" class="table-input" style="text-align: center; font-weight: 600;" value="${safeId}" placeholder="الرقم الوظيفي"
                   oninput="updateEmployeeSettingRow(${idx}, 'employeeId', this.value)"
                   onblur="onExpenseSettingInputBlur()">
          </td>
          <td style="width: 220px;">
            <input type="text" inputmode="decimal" class="table-input num" style="text-align: center; font-weight: 700;" value="${safeSalary}" placeholder="الراتب الأساسي"
                   oninput="updateEmployeeSettingRow(${idx}, 'basicSalary', this.value)"
                   onblur="onExpenseSettingInputBlur()">
          </td>
          <td style="width: 38px; text-align: center;">
            <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteEmployeeSettingRow(${idx})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  };

  const renderSuppliersSettings = (tbodyId) => {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = expenseSettingsState.suppliers || [];
    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr class="empty-row-placeholder">
          <td colspan="2">لا توجد بيانات موردين مسجلة (<span onclick="addExpenseSettingRow('suppliers')">+ أضف سطر</span>)</td>
        </tr>
      `;
      return;
    }
    tbody.innerHTML = rows.map((val, idx) => {
      const safeVal = String(val || '').replace(/"/g, '&quot;');
      return `
        <tr>
          <td>
            <input type="text" class="table-input" style="text-align: center; font-weight: 700;" value="${safeVal}" placeholder="اسم المورد"
                   oninput="updateExpenseSettingRow('suppliers', ${idx}, this.value)"
                   onblur="onExpenseSettingInputBlur()">
          </td>
          <td style="width: 38px; text-align: center;">
            <button type="button" class="btn-del-row" title="حذف السطر" onclick="deleteExpenseSettingRow('suppliers', ${idx})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  };

  renderSection('operational', 'settingsOperationalExpensesBody');
  renderSection('fixed', 'settingsFixedExpensesBody');
  renderPaymentChannels('settingsPaymentChannelsBody');
  renderPaymentChannels('settingsGeneralPaymentChannelsBody');
  renderEmployeesSettings();
  renderSuppliersSettings('settingsSuppliersBody');
};

window.onExpenseSettingInputBlur = function() {
  setTimeout(() => {
    const active = document.activeElement;
    if (active && active.tagName === 'INPUT' && active.closest('#settingsOperationalExpensesBody, #settingsFixedExpensesBody, #settingsPaymentChannelsBody, #settingsGeneralPaymentChannelsBody, #settingsEmployeesBody, #settingsSuppliersBody')) {
      return;
    }
    expenseSettingsState.operational = sortExpenseRowsArabic(expenseSettingsState.operational);
    expenseSettingsState.fixed = sortExpenseRowsArabic(expenseSettingsState.fixed);
    expenseSettingsState.paymentChannels = sortPaymentChannelsArabic(expenseSettingsState.paymentChannels);
    expenseSettingsState.employees = sortEmployeesSettingsArabic(expenseSettingsState.employees);
    expenseSettingsState.suppliers = sortPaymentChannelsArabic(expenseSettingsState.suppliers);
    saveExpenseSettingsData(expenseSettingsState);
    window.renderExpenseSettingsTables();
  }, 120);
};

window.addEmployeeSettingRow = function() {
  if (!Array.isArray(expenseSettingsState.employees)) expenseSettingsState.employees = [];
  expenseSettingsState.employees.push({ name: '', employeeId: '', basicSalary: '' });
  saveExpenseSettingsData(expenseSettingsState);
  window.renderExpenseSettingsTables();
};

window.updateEmployeeSettingRow = function(idx, field, val) {
  if (!Array.isArray(expenseSettingsState.employees) || !expenseSettingsState.employees[idx]) return;
  expenseSettingsState.employees[idx][field] = val;
  saveExpenseSettingsData(expenseSettingsState);
};

window.deleteEmployeeSettingRow = function(idx) {
  if (!Array.isArray(expenseSettingsState.employees)) return;
  expenseSettingsState.employees.splice(idx, 1);
  saveExpenseSettingsData(expenseSettingsState);
  window.renderExpenseSettingsTables();
};

window.addExpenseSettingRow = function(type) {
  if (!expenseSettingsState[type]) expenseSettingsState[type] = [];
  if (type === 'paymentChannels' || type === 'suppliers') {
    expenseSettingsState[type].push('');
  } else {
    expenseSettingsState[type].push({ mainCategory: '', descriptions: [''], description: '' });
  }
  saveExpenseSettingsData(expenseSettingsState);
  window.renderExpenseSettingsTables();
};

window.addExpenseStatementOnRow = function(type, idx) {
  if (!expenseSettingsState[type] || !expenseSettingsState[type][idx]) return;
  const current = expenseSettingsState[type][idx];
  const obj = typeof current === 'object' && current !== null
    ? current
    : { mainCategory: '', descriptions: [String(current || '')] };
  if (!Array.isArray(obj.descriptions) || obj.descriptions.length === 0) {
    obj.descriptions = [String(obj.description || '')];
  }
  obj.descriptions.push('');
  const newDescIdx = obj.descriptions.length - 1;
  expenseSettingsState[type][idx] = obj;
  saveExpenseSettingsData(expenseSettingsState);
  window.renderExpenseSettingsTables();
  setTimeout(() => {
    const input = document.getElementById(`expDescInput_${type}_${idx}_${newDescIdx}`) as HTMLInputElement;
    if (input) input.focus();
  }, 30);
};

window.updateExpenseStatementInRow = function(type, idx, descIdx, val) {
  if (!expenseSettingsState[type] || !expenseSettingsState[type][idx]) return;
  const current = expenseSettingsState[type][idx];
  const obj = typeof current === 'object' && current !== null
    ? current
    : { mainCategory: '', descriptions: [String(current || '')] };
  if (!Array.isArray(obj.descriptions)) {
    obj.descriptions = [String(obj.description || '')];
  }
  obj.descriptions[descIdx] = val;
  obj.description = obj.descriptions[0] || '';
  expenseSettingsState[type][idx] = obj;
  saveExpenseSettingsData(expenseSettingsState);
};

window.deleteExpenseStatementFromRow = function(type, idx, descIdx) {
  if (!expenseSettingsState[type] || !expenseSettingsState[type][idx]) return;
  const current = expenseSettingsState[type][idx];
  if (typeof current === 'object' && current !== null && Array.isArray(current.descriptions)) {
    current.descriptions.splice(descIdx, 1);
    if (current.descriptions.length === 0) {
      current.descriptions = [''];
    }
    current.description = current.descriptions[0] || '';
    saveExpenseSettingsData(expenseSettingsState);
    window.renderExpenseSettingsTables();
  }
};

window.updateExpenseSettingRow = function(type, idx, fieldOrVal, maybeVal) {
  if (!expenseSettingsState[type]) return;
  if (type === 'paymentChannels' || type === 'suppliers') {
    expenseSettingsState[type][idx] = String(fieldOrVal || '');
    saveExpenseSettingsData(expenseSettingsState);
    return;
  }
  const current = expenseSettingsState[type][idx];
  const obj = typeof current === 'object' && current !== null
    ? current
    : { mainCategory: '', descriptions: [String(current || '')], description: String(current || '') };
  if (!Array.isArray(obj.descriptions)) {
    obj.descriptions = [String(obj.description || '')];
  }
  if (maybeVal !== undefined) {
    obj[fieldOrVal] = maybeVal;
    if (fieldOrVal === 'description') {
      obj.descriptions[0] = maybeVal;
    }
  } else {
    obj.description = fieldOrVal;
    obj.descriptions[0] = fieldOrVal;
  }
  expenseSettingsState[type][idx] = obj;
  saveExpenseSettingsData(expenseSettingsState);
};

window.deleteExpenseSettingRow = function(type, idx) {
  if (!expenseSettingsState[type]) return;
  expenseSettingsState[type].splice(idx, 1);
  saveExpenseSettingsData(expenseSettingsState);
  window.renderExpenseSettingsTables();
};

setTimeout(() => {
  if (typeof window.renderExpenseSettingsTables === 'function') {
    window.renderExpenseSettingsTables();
  }
}, 50);

window.clearAllDailySheetsConfirm = function() {
  if (typeof window.clearCurrentSheetFields === 'function') {
    window.clearCurrentSheetFields();
  }
};

// Generic delete helper
window.deleteModuleItem = async function(url, reloadFn) {
  if (!confirm('هل أنت متأكد من رغبتك في حذف هذا السجل؟')) return;
  try {
    const res = await fetch(url, { method: 'DELETE' });
    if (res.ok) {
      showToast('تم الحذف بنجاح');
      if (typeof reloadFn === 'function') reloadFn();
    } else {
      showToast('تعذر الحذف');
    }
  } catch (err) {
    console.error(err);
  }
};

// Modal Open / Close
window.openModal = function(modalId) {
  if (modalId === 'modalAddEmployee') {
    editingEmployeeId = null;
    const form = document.getElementById('formAddEmployee') as HTMLFormElement;
    if (form) form.reset();
    const modal = document.getElementById('modalAddEmployee');
    const titleEl = modal?.querySelector('.modal-header h3');
    if (titleEl) titleEl.textContent = '+ إضافة موظف جديد';
  }
  const m = document.getElementById(modalId);
  if (m) m.classList.add('open');
};

window.closeModal = function(modalId) {
  if (modalId === 'modalAddEmployee') {
    editingEmployeeId = null;
  }
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('open');
};

// Form Handlers
async function submitForm(url, formId, modalId, reloadFn) {
  const form = document.getElementById(formId);
  if (!form) return;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      form.reset();
      closeModal(modalId);
      showToast('تمت الإضافة بنجاح!');
      if (typeof reloadFn === 'function') reloadFn();
    } else {
      const err = await res.json();
      alert('خطأ: ' + (err.error || 'تعذر الحفظ'));
    }
  } catch (e) {
    console.error(e);
    alert('حدث خطأ أثناء الحفظ');
  }
}

window.submitAddSupplier = function(e) {
  e.preventDefault();
  submitForm('/api/modules/suppliers', 'formAddSupplier', 'modalAddSupplier', loadSuppliersTab);
};

window.submitAddEmployee = async function(e) {
  e.preventDefault();
  if (editingEmployeeId !== null) {
    const form = document.getElementById('formAddEmployee') as HTMLFormElement;
    if (!form) return;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const oldEmp = currentEmployeesList.find(item => Number(item.id) === Number(editingEmployeeId));
    try {
      const res = await fetch(`/api/modules/employees/${editingEmployeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        if (oldEmp && Array.isArray(expenseSettingsState.employees)) {
          expenseSettingsState.employees.forEach(row => {
            if (String(row.name || '').trim() === String(oldEmp.name || '').trim()) {
              row.name = String(data.name || row.name);
              if (data.employee_id) row.employeeId = String(data.employee_id);
              if (data.salary !== undefined && data.salary !== '') row.basicSalary = String(data.salary);
            }
          });
          saveExpenseSettingsData(expenseSettingsState);
          if (typeof window.renderExpenseSettingsTables === 'function') window.renderExpenseSettingsTables();
        }
        editingEmployeeId = null;
        form.reset();
        closeModal('modalAddEmployee');
        showToast('تم تعديل بيانات الموظف بنجاح!');
        await loadEmployeesTab();
      } else {
        const err = await res.json();
        alert('خطأ: ' + (err.error || 'تعذر حفظ التعديلات'));
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ التعديلات');
    }
    return;
  }
  submitForm('/api/modules/employees', 'formAddEmployee', 'modalAddEmployee', loadEmployeesTab);
};

window.submitAddCheck = function(e) {
  e.preventDefault();
  submitForm('/api/modules/checks', 'formAddCheck', 'modalAddCheck', loadChecksTab);
};

window.submitAddPartner = function(e) {
  e.preventDefault();
  submitForm('/api/modules/partners', 'formAddPartner', 'modalAddPartner', loadPartnersTab);
};

window.submitAddInvestment = function(e) {
  e.preventDefault();
  submitForm('/api/modules/investments', 'formAddInvestment', 'modalAddInvestment', loadInvestmentsTab);
};

window.submitAddImport = function(e) {
  e.preventDefault();
  submitForm('/api/modules/imports', 'formAddImport', 'modalAddImport', loadImportsTab);
};

// Initial startup: apply custom field names if set
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.applyCustomFieldNames === 'function') window.applyCustomFieldNames();
  });
} else {
  if (typeof window.applyCustomFieldNames === 'function') window.applyCustomFieldNames();
}


  (window as any).formatCurrency = formatCurrency;
  (window as any).loadSalesTab = loadSalesTab;
  (window as any).loadExpensesTab = loadExpensesTab;
  (window as any).loadSuppliersTab = loadSuppliersTab;
  (window as any).loadEmployeesTab = loadEmployeesTab;
  (window as any).loadReceivablesTab = loadReceivablesTab;
  (window as any).loadChecksTab = loadChecksTab;
  (window as any).updateCheckStatus = updateCheckStatus;
  (window as any).loadPartnersTab = loadPartnersTab;
  (window as any).loadInvestmentsTab = loadInvestmentsTab;
  (window as any).loadImportsTab = loadImportsTab;
  (window as any).applyImportsFilters = applyImportsFilters;
  (window as any).loadProfitLossTab = loadProfitLossTab;
  (window as any).submitForm = submitForm;
}
