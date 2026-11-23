const fs = require('fs');
const path = require('path');

// 1. SettingsSection.tsx
let settings = fs.readFileSync('src/components/SettingsSection.tsx', 'utf8');

// Remove p1: <!-- الجدول الثالث: قنوات الدفع (جهات الدفع) --> card
settings = settings.replace(
  /\n\s*<!-- الجدول الثالث: قنوات الدفع \(جهات الدفع\) -->[\s\S]*?<tbody id="settingsPaymentChannelsBody"><\/tbody>\s*<\/table>\s*<\/div>\s*<\/div>/,
  ''
);

// Remove p2: <!-- جدول قنوات الدفع --> card
settings = settings.replace(
  /\n\s*<!-- جدول قنوات الدفع -->[\s\S]*?<tbody id="settingsGeneralPaymentChannelsBody"><\/tbody>\s*<\/table>\s*<\/div>\s*<\/div>/,
  ''
);

fs.writeFileSync('src/components/SettingsSection.tsx', settings, 'utf8');
console.log('Updated SettingsSection.tsx');

// 2. FinancialModulesSection.tsx
let fin = fs.readFileSync('src/components/FinancialModulesSection.tsx', 'utf8');

// Remove expFilterPaymentChannel filter
fin = fin.replace(
  /\n\s*<!-- جهة الدفع -->\s*<div class="filter-item">\s*<label[^>]*>جهة الدفع:<\/label>\s*<select id="expFilterPaymentChannel"[\s\S]*?<\/select>\s*<\/div>/,
  ''
);

// Remove <th>جهة الدفع</th> from operational expenses & fixed expenses
fin = fin.replace(
  /<th style="width: 130px; text-align: center;">جهة الدفع<\/th>\n/g,
  ''
);

// Remove suppFilterPaymentChannel filter
fin = fin.replace(
  /\n\s*<!-- جهة الدفع -->\s*<div class="filter-item">\s*<label[^>]*>جهة الدفع:<\/label>\s*<select id="suppFilterPaymentChannel"[\s\S]*?<\/select>\s*<\/div>/,
  ''
);

// Remove <th>جهة الدفع</th> from suppliers
fin = fin.replace(
  /<th style="width: 160px; text-align: center;">جهة الدفع<\/th>\n/g,
  ''
);

fs.writeFileSync('src/components/FinancialModulesSection.tsx', fin, 'utf8');
console.log('Updated FinancialModulesSection.tsx');

// 3. modulesController.ts
let mod = fs.readFileSync('src/controllers/modulesController.ts', 'utf8');

// In populateExpenseFilterDropdowns: remove paySelect
mod = mod.replace(
  /const paySelect = document\.getElementById\('expFilterPaymentChannel'\)[\s\S]*?if \(paySelect\) \{[\s\S]*?paySelect\.innerHTML = payHtml;\s*\}/,
  ''
);

// In applyExpensesFilters: remove payChannel
mod = mod.replace(
  /\s*const payChannel = \(document\.getElementById\('expFilterPaymentChannel'\) as HTMLSelectElement\)\?\.value \|\| 'all';/,
  ''
);
mod = mod.replace(
  /\|\| payChannel !== 'all' /,
  ''
);
mod = mod.replace(
  /\s*if \(payChannel !== 'all'\) \{\s*const ch = String\(it\.payment_channel \|\| ''\)\.trim\(\);\s*if \(ch !== payChannel\) return false;\s*\}/,
  ''
);

// In renderExpenseSection: colspan 8 -> 7, remove payChannelVal td
mod = mod.replace(
  /<td colspan="8"/g,
  '<td colspan="7"'
);
mod = mod.replace(
  /\s*<td style="text-align:center; font-weight:600;">\$\{payChannelVal\}<\/td>/g,
  ''
);

// In resetExpensesFilters: remove payEl
mod = mod.replace(
  /\s*const payEl = document\.getElementById\('expFilterPaymentChannel'\) as HTMLSelectElement \| null;/,
  ''
);
mod = mod.replace(
  /\s*if \(payEl\) payEl\.value = 'all';/,
  ''
);

// In populateSuppliersFilterDropdowns: remove channelSelect
mod = mod.replace(
  /\s*const channelSelect = document\.getElementById\('suppFilterPaymentChannel'\) as HTMLSelectElement;[\s\S]*?if \(channelSelect\) \{[\s\S]*?channelSelect\.innerHTML = html;\s*\}/,
  ''
);

// In resetSuppliersFilters: remove channelSelect
mod = mod.replace(
  /\s*const channelSelect = document\.getElementById\('suppFilterPaymentChannel'\) as HTMLSelectElement;/,
  ''
);
mod = mod.replace(
  /\s*if \(channelSelect\) channelSelect\.value = 'all';/,
  ''
);

// In applySuppliersFilters: remove channelVal
mod = mod.replace(
  /\s*const channelVal = \(document\.getElementById\('suppFilterPaymentChannel'\) as HTMLSelectElement\)\?\.value \|\| 'all';/,
  ''
);
mod = mod.replace(
  /\s*\/\/ Payment channel\s*if \(channelVal !== 'all'\) \{\s*if \(String\(s\.payment_channel \|\| ''\)\.trim\(\) !== channelVal\) return false;\s*\}/,
  ''
);

// In renderSuppliersFilteredView: colspan 6 -> 5, remove channelDisplay td
mod = mod.replace(
  /<td colspan="6" style="text-align:center; padding:2rem; color:#64748b; font-weight:700;">لا توجد سجلات موردين/,
  '<td colspan="5" style="text-align:center; padding:2rem; color:#64748b; font-weight:700;">لا توجد سجلات موردين'
);
mod = mod.replace(
  /\s*<td style="text-align:center;">\$\{channelDisplay\}<\/td>/,
  ''
);

// In renderExpenseSettingsTables: remove renderPaymentChannels calls
mod = mod.replace(
  /\s*renderPaymentChannels\('settingsPaymentChannelsBody'\);/,
  ''
);
mod = mod.replace(
  /\s*renderPaymentChannels\('settingsGeneralPaymentChannelsBody'\);/,
  ''
);

fs.writeFileSync('src/controllers/modulesController.ts', mod, 'utf8');
console.log('Updated modulesController.ts');

// 4. dailyController.ts
let daily = fs.readFileSync('src/controllers/dailyController.ts', 'utf8');

// In handleRowAmountInput: remove payment channel check that wiped value
daily = daily.replace(
  /function handleRowAmountInput\(categoryKey: string, idx: number, amountKey: string, inputEl: HTMLInputElement\) \{[\s\S]*?\(window as any\)\.updateRowAmount\(categoryKey, idx, amountKey, inputEl\.value\);\s*\}/,
  `function handleRowAmountInput(categoryKey: string, idx: number, amountKey: string, inputEl: HTMLInputElement) {
  (window as any).updateRowAmount(categoryKey, idx, amountKey, inputEl.value);
}`
);

// In sumCashInternalExpenses: default to drawer/cash
daily = daily.replace(
  /const paySource = String\(r\.col4 \|\| ''\)\.trim\(\);\s*if \(\(paySource\.includes\('صندوق'\) \|\| paySource\.includes\('نقدا'\) \|\| paySource\.includes\('نقد'\)\)\) \{/,
  `const paySource = String(r.col4 || '').trim();
    if (!paySource || paySource.includes('صندوق') || paySource.includes('نقدا') || paySource.includes('نقد')) {`
);

fs.writeFileSync('src/controllers/dailyController.ts', daily, 'utf8');
console.log('Updated dailyController.ts');
