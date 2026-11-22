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

// 2. Expenses Module (سجل المصاريف: 1- المصاريف التشغيلية | 2- المصاريف الثابتة)
async function loadExpensesTab() {
  try {
    const dateEl = document.getElementById('quickExpDate') as HTMLInputElement;
    if (dateEl && !dateEl.value) {
      dateEl.value = new Date().toISOString().split('T')[0];
    }

    const res = await fetch('/api/modules/expenses-summary');
    const data = await res.json();

    const opTotal = Number(data?.totals?.operational_expenses ?? data?.categories?.operational_expenses ?? 0);
    const fixTotal = Number(data?.totals?.fixed_expenses ?? data?.categories?.fixed_expenses ?? 0);
    const grandTotal = Number(data?.totals?.grand_total ?? data?.grand_total ?? (opTotal + fixTotal));

    const setElText = (id: string, val: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setElText('expKpiGrandTotal', formatCurrency(grandTotal));
    setElText('expKpiInternal', formatCurrency(opTotal));
    setElText('expKpiFixed', formatCurrency(fixTotal));
    setElText('expOpSubTotal', formatCurrency(opTotal));
    setElText('expFixedSubTotal', formatCurrency(fixTotal));

    const opItems = Array.isArray(data.operational_items)
      ? data.operational_items
      : (data.items || []).filter((i: any) => i.category !== 'fixed_expense' && i.category !== 'fixed_expenses');
    const fixItems = Array.isArray(data.fixed_items)
      ? data.fixed_items
      : (data.items || []).filter((i: any) => i.category === 'fixed_expense' || i.category === 'fixed_expenses');

    const renderExpenseSection = (tbodyId: string, list: any[], emptyMsg: string) => {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1.5rem; color:#64748b;">${emptyMsg}</td></tr>`;
        return;
      }
      tbody.innerHTML = list.map((it: any) => `
        <tr>
          <td style="font-weight:600; white-space:nowrap;">${it.sheet_date} <span style="color:#64748b; font-size:0.78rem;">(${it.day_name || ''})</span></td>
          <td style="font-weight:600;">${it.description || '-'}</td>
          <td style="text-align:center; font-weight:700; color:#b91c1c;">${formatCurrency(it.amount)}</td>
          <td style="text-align:center; white-space:nowrap;">
            <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 7px; font-size:0.74rem;" onclick="selectHistoryDay('${it.sheet_date}'); switchTab('daily');" title="فتح دفتر اليومية">اليومية</button>
            <button type="button" class="btn btn-danger btn-sm" style="padding:2px 7px; font-size:0.74rem;" onclick="deleteExpenseItem(${it.id})" title="حذف المصروف">✕</button>
          </td>
        </tr>
      `).join('');
    };

    renderExpenseSection('expensesOperationalBody', opItems, 'لا توجد مصاريف تشغيلية مسجلة');
    renderExpenseSection('expensesFixedBody', fixItems, 'لا توجد مصاريف ثابتة مسجلة');
  } catch (err) {
    console.error('Error loading expenses:', err);
  }
}

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
async function loadSuppliersTab() {
  try {
    const res = await fetch('/api/modules/suppliers');
    const suppliers = await res.json();

    document.getElementById('suppKpiTotal').textContent = suppliers.length;
    let totalPaid = 0;
    suppliers.forEach(s => totalPaid += (s.total_paid || 0));
    document.getElementById('suppKpiTotalPaid').textContent = formatCurrency(totalPaid);

    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;
    if (suppliers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:1.5rem;">لا يوجد موردون مسجلون. انقر فوق (+ إضافة مورد جديد)</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    suppliers.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:#1e293b;">${s.name}</td>
        <td>${s.phone || '-'}</td>
        <td>${s.tax_number || '-'}</td>
        <td>${s.address || '-'}</td>
        <td style="text-align:center; font-weight:700; color:#2563eb;">${formatCurrency(s.total_paid)}</td>
        <td style="text-align:center;">
          <button class="btn-del-row" title="حذف المورد" onclick="deleteModuleItem('/api/modules/suppliers/${s.id}', loadSuppliersTab)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading suppliers:', err);
  }
}

// 4. Employees Module
async function loadEmployeesTab() {
  try {
    const res = await fetch('/api/modules/employees');
    const employees = await res.json();

    document.getElementById('empKpiTotal').textContent = employees.length;
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
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1.5rem;">لا يوجد موظفون مسجلون. انقر فوق (+ إضافة موظف جديد)</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    employees.forEach(e => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:#0f766e;">${e.employee_id}</td>
        <td style="font-weight:700;">${e.name}</td>
        <td>${e.job_title || 'موظف مبيعات'}</td>
        <td>${e.phone || '-'}</td>
        <td style="text-align:center;">${formatCurrency(e.salary)}</td>
        <td style="text-align:center; font-weight:700; color:#059669;">${formatCurrency(e.total_sales)}</td>
        <td style="text-align:center; color:#dc2626;">${formatCurrency(e.total_advances)}</td>
        <td style="text-align:center;">
          <button class="btn-del-row" title="حذف الموظف" onclick="deleteModuleItem('/api/modules/employees/${e.id}', loadEmployeesTab)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading employees:', err);
  }
}

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

// 9. Imports Module (ادارة الواردات)
async function loadImportsTab() {
  try {
    const res = await fetch('/api/modules/imports');
    const imports = await res.json();

    let totalGoods = 0;
    let totalCustoms = 0;
    let totalAll = 0;

    imports.forEach(m => {
      totalGoods += Number(m.goods_cost || 0);
      totalCustoms += Number(m.shipping_customs_cost || 0);
      totalAll += Number(m.total_cost || 0);
    });

    document.getElementById('impKpiTotalShipments').textContent = imports.length;
    document.getElementById('impKpiGoodsCost').textContent = formatCurrency(totalGoods);
    document.getElementById('impKpiCustomsCost').textContent = formatCurrency(totalCustoms);
    document.getElementById('impKpiGrandTotal').textContent = formatCurrency(totalAll);

    const tbody = document.getElementById('importsTableBody');
    if (!tbody) return;
    if (imports.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:1.5rem;">لا توجد شحنات واردة مسجلة. انقر فوق (+ إضافة شحنة جديدة)</td></tr>';
      return;
    }

    const statusMap = {
      in_transit: '<span class="badge-status badge-in_transit">في الشحن</span>',
      customs: '<span class="badge-status badge-customs">تخليص جمركي</span>',
      received: '<span class="badge-status badge-completed">تم الاستلام والمستودع</span>',
      completed: '<span class="badge-status badge-active">مكتملة</span>'
    };

    tbody.innerHTML = '';
    imports.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:700; color:#1e40af;">${m.shipment_number}</td>
        <td style="font-weight:600;">${m.supplier_name}</td>
        <td>${m.item_description || '-'}</td>
        <td style="text-align:center;">${m.quantity || 1}</td>
        <td style="text-align:center;">${formatCurrency(m.goods_cost)}</td>
        <td style="text-align:center;">${formatCurrency(m.shipping_customs_cost)}</td>
        <td style="text-align:center; font-weight:700; color:#047857;">${formatCurrency(m.total_cost)}</td>
        <td style="text-align:center;">${statusMap[m.status] || m.status}</td>
        <td style="text-align:center;">
          <button class="btn-del-row" title="حذف الشحنة" onclick="deleteModuleItem('/api/modules/imports/${m.id}', loadImportsTab)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading imports:', err);
  }
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

    document.getElementById('plMarginVal').textContent = `${pl.profit_margin}%`;

    // Populate detailed breakdown rows
    document.getElementById('plValSalesChannels').textContent = formatCurrency(pl.breakdown.sales_channels);
    document.getElementById('plValPerfumes').textContent = formatCurrency(pl.breakdown.perfumes);
    document.getElementById('plValExtraRev').textContent = formatCurrency(pl.breakdown.extra_revenues);
    document.getElementById('plValTotalRev').textContent = formatCurrency(pl.total_revenues);

    document.getElementById('plValPurchases').textContent = formatCurrency(pl.breakdown.cash_purchases);
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
function getExpenseSettingsData() {
  try {
    const raw = localStorage.getItem('erp_expense_settings_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        operational: Array.isArray(parsed.operational) && parsed.operational.length > 0 ? parsed.operational : [''],
        fixed: Array.isArray(parsed.fixed) && parsed.fixed.length > 0 ? parsed.fixed : ['']
      };
    }
  } catch (e) {}
  return { operational: [''], fixed: [''] };
}

function saveExpenseSettingsData(data) {
  try {
    localStorage.setItem('erp_expense_settings_v1', JSON.stringify(data));
    if (typeof (window as any).renderInternalExpensesTable === 'function') {
      (window as any).renderInternalExpensesTable();
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
    if (cloudData && (Array.isArray(cloudData.operational) || Array.isArray(cloudData.fixed))) {
      const hasOps = Array.isArray(cloudData.operational) && cloudData.operational.some(Boolean);
      const hasFix = Array.isArray(cloudData.fixed) && cloudData.fixed.some(Boolean);
      if (hasOps || hasFix) {
        expenseSettingsState = {
          operational: hasOps ? cloudData.operational : expenseSettingsState.operational,
          fixed: hasFix ? cloudData.fixed : expenseSettingsState.fixed
        };
        localStorage.setItem('erp_expense_settings_v1', JSON.stringify(expenseSettingsState));
        if (typeof window.renderExpenseSettingsTables === 'function') window.renderExpenseSettingsTables();
        if (typeof (window as any).renderInternalExpensesTable === 'function') (window as any).renderInternalExpensesTable();
      } else {
        const localHasOps = Array.isArray(expenseSettingsState.operational) && expenseSettingsState.operational.some(Boolean);
        const localHasFix = Array.isArray(expenseSettingsState.fixed) && expenseSettingsState.fixed.some(Boolean);
        if (localHasOps || localHasFix) {
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
    tbody.innerHTML = rows.map((val, idx) => {
      const safeVal = String(val || '').replace(/"/g, '&quot;');
      return `
        <tr>
          <td>
            <input type="text" class="table-input" value="${safeVal}" placeholder="بيان المصروف"
                   oninput="updateExpenseSettingRow('${type}', ${idx}, this.value)">
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

  renderSection('operational', 'settingsOperationalExpensesBody');
  renderSection('fixed', 'settingsFixedExpensesBody');
};

window.addExpenseSettingRow = function(type) {
  if (!expenseSettingsState[type]) expenseSettingsState[type] = [];
  expenseSettingsState[type].push('');
  saveExpenseSettingsData(expenseSettingsState);
  window.renderExpenseSettingsTables();
};

window.updateExpenseSettingRow = function(type, idx, val) {
  if (!expenseSettingsState[type]) return;
  expenseSettingsState[type][idx] = val;
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
  const m = document.getElementById(modalId);
  if (m) m.classList.add('open');
};

window.closeModal = function(modalId) {
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

window.submitAddEmployee = function(e) {
  e.preventDefault();
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
  (window as any).loadProfitLossTab = loadProfitLossTab;
  (window as any).submitForm = submitForm;
}
