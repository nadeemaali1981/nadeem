const fs = require('fs');

// 1. SettingsSection.tsx
let settings = fs.readFileSync('src/components/SettingsSection.tsx', 'utf8');

const s1Start = settings.indexOf('<!-- الجدول الثالث: قنوات الدفع (جهات الدفع) -->');
if (s1Start !== -1) {
  const cardStart = settings.lastIndexOf('<div class=\\"card\\">', s1Start);
  // Find matching closing of the card
  const s1End = settings.indexOf('<tbody id=\\"settingsPaymentChannelsBody\\"></tbody>\\n                </table>\\n              </div>\\n            </div>', s1Start);
  if (s1End !== -1) {
    const fullEnd = s1End + '<tbody id=\\"settingsPaymentChannelsBody\\"></tbody>\\n                </table>\\n              </div>\\n            </div>'.length;
    // We also want to include the comment before the card
    const commentStart = settings.lastIndexOf('\\n\\n            <!-- الجدول الثالث:', s1Start);
    settings = settings.substring(0, commentStart) + settings.substring(fullEnd);
    console.log('Successfully removed settingsPaymentChannelsBody card');
  }
}

const s2Start = settings.indexOf('<!-- جدول قنوات الدفع -->');
if (s2Start !== -1) {
  const s2End = settings.indexOf('<tbody id=\\"settingsGeneralPaymentChannelsBody\\"></tbody>\\n                </table>\\n              </div>\\n            </div>', s2Start);
  if (s2End !== -1) {
    const fullEnd = s2End + '<tbody id=\\"settingsGeneralPaymentChannelsBody\\"></tbody>\\n                </table>\\n              </div>\\n            </div>'.length;
    const commentStart = settings.lastIndexOf('\\n\\n            <!-- جدول قنوات الدفع -->', s2Start);
    settings = settings.substring(0, commentStart) + settings.substring(fullEnd);
    console.log('Successfully removed settingsGeneralPaymentChannelsBody card');
  }
}

fs.writeFileSync('src/components/SettingsSection.tsx', settings, 'utf8');

// 2. FinancialModulesSection.tsx
let fin = fs.readFileSync('src/components/FinancialModulesSection.tsx', 'utf8');

// Remove expFilterPaymentChannel
const expPayFilterStart = fin.indexOf('<!-- جهة الدفع -->\\n          <div class=\\"filter-item\\">\\n            <label style=\\"font-weight: 700; font-size: 0.8rem; color: #475569;\\">جهة الدفع:</label>\\n            <select id=\\"expFilterPaymentChannel\\"');
if (expPayFilterStart !== -1) {
  const commentStart = fin.lastIndexOf('\\n\\n          <!-- جهة الدفع -->', expPayFilterStart);
  const filterEnd = fin.indexOf('</select>\\n          </div>', expPayFilterStart) + '</select>\\n          </div>'.length;
  fin = fin.substring(0, commentStart) + fin.substring(filterEnd);
  console.log('Successfully removed expFilterPaymentChannel filter');
}

// Remove <th>جهة الدفع</th> from expenses tables (130px)
const expTh = '<th style=\\"width: 130px; text-align: center;\\">جهة الدفع</th>\\n                  ';
while (fin.includes(expTh)) {
  fin = fin.replace(expTh, '');
  console.log('Removed an expense <th>جهة الدفع</th>');
}

// Remove suppFilterPaymentChannel
const suppPayFilterStart = fin.indexOf('<!-- جهة الدفع -->\\n          <div class=\\"filter-item\\">\\n            <label style=\\"font-weight: 700; font-size: 0.8rem; color: #475569;\\">جهة الدفع:</label>\\n            <select id=\\"suppFilterPaymentChannel\\"');
if (suppPayFilterStart !== -1) {
  const commentStart = fin.lastIndexOf('\\n\\n          <!-- جهة الدفع -->', suppPayFilterStart);
  const filterEnd = fin.indexOf('</select>\\n          </div>', suppPayFilterStart) + '</select>\\n          </div>'.length;
  fin = fin.substring(0, commentStart) + fin.substring(filterEnd);
  console.log('Successfully removed suppFilterPaymentChannel filter');
}

// Remove <th>جهة الدفع</th> from suppliers table (160px)
const suppTh = '<th style=\\"width: 160px; text-align: center;\\">جهة الدفع</th>\\n                ';
if (fin.includes(suppTh)) {
  fin = fin.replace(suppTh, '');
  console.log('Removed supplier <th>جهة الدفع</th>');
}

fs.writeFileSync('src/components/FinancialModulesSection.tsx', fin, 'utf8');

// 3. modulesController.ts
let mod = fs.readFileSync('src/controllers/modulesController.ts', 'utf8');

// Remove paySelect in populateExpenseFilterDropdowns
const paySelectBlock = `  const paySelect = document.getElementById('expFilterPaymentChannel') as HTMLSelectElement | null;`;
if (mod.includes(paySelectBlock)) {
  const start = mod.indexOf(paySelectBlock);
  const end = mod.indexOf(`paySelect.innerHTML = payHtml;\n  }`, start) + `paySelect.innerHTML = payHtml;\n  }`.length;
  mod = mod.substring(0, start) + mod.substring(end);
  console.log('Removed paySelect dropdown population in modulesController.ts');
}

// Remove payChannel in applyExpensesFilters
mod = mod.replace(
  `  const payChannel = (document.getElementById('expFilterPaymentChannel') as HTMLSelectElement)?.value || 'all';\n`,
  ''
);
mod = mod.replace(
  ` || payChannel !== 'all'`,
  ''
);
const payChannelFilterBlock = `    if (payChannel !== 'all') {
      const ch = String(it.payment_channel || '').trim();
      if (ch !== payChannel) return false;
    }\n\n`;
if (mod.includes(payChannelFilterBlock)) {
  mod = mod.replace(payChannelFilterBlock, '');
  console.log('Removed payChannel check from applyExpensesFilters');
}

// In renderExpenseSection: remove payChannelVal td and update empty row colspan 8 -> 7
mod = mod.replace(
  `<td colspan="8" style="text-align:center; padding:1.5rem; color:#64748b;">\${emptyMsg}</td>`,
  `<td colspan="7" style="text-align:center; padding:1.5rem; color:#64748b;">\${emptyMsg}</td>`
);
mod = mod.replace(
  `          <td style="text-align:center; font-weight:600;">\${payChannelVal}</td>\n`,
  ''
);

// In resetExpensesFilters: remove payEl
mod = mod.replace(
  `  const payEl = document.getElementById('expFilterPaymentChannel') as HTMLSelectElement | null;\n`,
  ''
);
mod = mod.replace(
  `  if (payEl) payEl.value = 'all';\n`,
  ''
);

// In populateSuppliersFilterDropdowns: remove channelSelect
const channelSelectBlock = `  const channelSelect = document.getElementById('suppFilterPaymentChannel') as HTMLSelectElement;\n`;
if (mod.includes(channelSelectBlock)) {
  const start = mod.indexOf(channelSelectBlock);
  const end = mod.indexOf(`channelSelect.innerHTML = html;\n  }`, start) + `channelSelect.innerHTML = html;\n  }`.length;
  mod = mod.substring(0, start) + mod.substring(end);
  console.log('Removed channelSelect dropdown population in modulesController.ts');
}

// In resetSuppliersFilters: remove channelSelect
mod = mod.replace(
  `  const channelSelect = document.getElementById('suppFilterPaymentChannel') as HTMLSelectElement;\n`,
  ''
);
mod = mod.replace(
  `  if (channelSelect) channelSelect.value = 'all';\n`,
  ''
);

// In applySuppliersFilters: remove channelVal
mod = mod.replace(
  `  const channelVal = (document.getElementById('suppFilterPaymentChannel') as HTMLSelectElement)?.value || 'all';\n`,
  ''
);
const suppChannelFilterBlock = `    // Payment channel
    if (channelVal !== 'all') {
      if (String(s.payment_channel || '').trim() !== channelVal) return false;
    }\n\n`;
if (mod.includes(suppChannelFilterBlock)) {
  mod = mod.replace(suppChannelFilterBlock, '');
  console.log('Removed channelVal check from applySuppliersFilters');
}

// In renderSuppliersFilteredView: empty row colspan 6 -> 5, remove channelDisplay td
mod = mod.replace(
  `<tr><td colspan="6" style="text-align:center; padding:2rem; color:#64748b; font-weight:700;">لا توجد سجلات موردين`,
  `<tr><td colspan="5" style="text-align:center; padding:2rem; color:#64748b; font-weight:700;">لا توجد سجلات موردين`
);
mod = mod.replace(
  `      <td style="text-align:center;">\${channelDisplay}</td>\n`,
  ''
);

// In renderExpenseSettingsTables: remove renderPaymentChannels calls
mod = mod.replace(
  `  renderPaymentChannels('settingsPaymentChannelsBody');\n`,
  ''
);
mod = mod.replace(
  `  renderPaymentChannels('settingsGeneralPaymentChannelsBody');\n`,
  ''
);

fs.writeFileSync('src/controllers/modulesController.ts', mod, 'utf8');

// 4. dailyController.ts
let daily = fs.readFileSync('src/controllers/dailyController.ts', 'utf8');

// In handleRowAmountInput: remove payment channel check that wiped value
const handleRowAmountSearch = `function handleRowAmountInput(categoryKey: string, idx: number, amountKey: string, inputEl: HTMLInputElement) {
  if (['internal_expenses', 'employee_advances', 'supplier_payments', 'cash_purchases'].includes(categoryKey)) {
    const row = state.items[categoryKey] && state.items[categoryKey][idx];
    const paymentChannel = row ? String(row.col4 || '').trim() : '';
    if (!paymentChannel) {
      inputEl.value = '';
      checkPaymentChannelBeforeAmount(categoryKey, idx, inputEl);
      return;
    }
  }
  (window as any).updateRowAmount(categoryKey, idx, amountKey, inputEl.value);
}`;

const handleRowAmountReplacement = `function handleRowAmountInput(categoryKey: string, idx: number, amountKey: string, inputEl: HTMLInputElement) {
  (window as any).updateRowAmount(categoryKey, idx, amountKey, inputEl.value);
}`;

if (daily.includes(handleRowAmountSearch)) {
  daily = daily.replace(handleRowAmountSearch, handleRowAmountReplacement);
  console.log('Updated handleRowAmountInput to allow direct typing without paymentChannel restriction');
} else {
  console.log('handleRowAmountSearch not found directly, checking CRLF');
  const normalizedDaily = daily.replace(/\r\n/g, '\n');
  if (normalizedDaily.includes(handleRowAmountSearch)) {
    daily = normalizedDaily.replace(handleRowAmountSearch, handleRowAmountReplacement);
    console.log('Updated handleRowAmountInput after normalizing CRLF');
  }
}

// In sumCashInternalExpenses: default to drawer/cash
daily = daily.replace(
  `const paySource = String(r.col4 || '').trim();\n    if ((paySource.includes('صندوق') || paySource.includes('نقدا') || paySource.includes('نقد'))) {`,
  `const paySource = String(r.col4 || '').trim();\n    if (!paySource || paySource.includes('صندوق') || paySource.includes('نقدا') || paySource.includes('نقد')) {`
);

fs.writeFileSync('src/controllers/dailyController.ts', daily, 'utf8');
console.log('Patch complete!');
