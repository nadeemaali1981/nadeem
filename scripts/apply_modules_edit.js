const fs = require('fs');

let s = fs.readFileSync('src/controllers/modulesController.ts', 'utf8');
const originalLength = s.length;

// 1. populateExpenseFilterDropdowns
s = s.replace(/const paySelect = document\.getElementById\('expFilterPaymentChannel'\) as HTMLSelectElement \| null;\r?\n/, '');
s = s.replace(/\r?\n  if \(paySelect\) \{[\s\S]*?paySelect\.innerHTML = payHtml;\r?\n  \}/, '');

// 2. applyExpensesFilters
s = s.replace(/  const payChannel = \(document\.getElementById\('expFilterPaymentChannel'\) as HTMLSelectElement\)\?\.value \|\| 'all';\r?\n/, '');
s = s.replace(/ \|\| payChannel !== 'all'/, '');
s = s.replace(/    if \(payChannel !== 'all'\) \{\r?\n      const ch = String\(it\.payment_channel \|\| ''\)\.trim\(\);\r?\n      if \(ch !== payChannel\) return false;\r?\n    \}\r?\n\r?\n/, '');

// 3. renderExpenseSection
s = s.replace(/<td colspan="8" style="text-align:center; padding:1\.5rem; color:#64748b;">\$\{emptyMsg\}<\/td>/, '<td colspan="7" style="text-align:center; padding:1.5rem; color:#64748b;">${emptyMsg}</td>');
s = s.replace(/          <td style="text-align:center; font-weight:600;">\$\{payChannelVal\}<\/td>\r?\n/, '');
s = s.replace(/const payChannelVal = it\.payment_channel \|\| '-';\r?\n/, '');

// 4. resetExpensesFilters
s = s.replace(/  const payEl = document\.getElementById\('expFilterPaymentChannel'\) as HTMLSelectElement \| null;\r?\n/, '');
s = s.replace(/  if \(payEl\) payEl\.value = 'all';\r?\n/, '');

// 5. populateSuppliersFilterDropdowns
s = s.replace(/  const channelSelect = document\.getElementById\('suppFilterPaymentChannel'\) as HTMLSelectElement;\r?\n/, '');
s = s.replace(/\r?\n  if \(channelSelect\) \{[\s\S]*?channelSelect\.innerHTML = html;\r?\n  \}/, '');

// 6. resetSuppliersFilters
s = s.replace(/  const channelSelect = document\.getElementById\('suppFilterPaymentChannel'\) as HTMLSelectElement;\r?\n/, '');
s = s.replace(/  if \(channelSelect\) channelSelect\.value = 'all';\r?\n/, '');

// 7. applySuppliersFilters
s = s.replace(/  const channelVal = \(document\.getElementById\('suppFilterPaymentChannel'\) as HTMLSelectElement\)\?\.value \|\| 'all';\r?\n/, '');
s = s.replace(/    \/\/ Payment channel\r?\n    if \(channelVal !== 'all'\) \{\r?\n      if \(String\(s\.payment_channel \|\| ''\)\.trim\(\) !== channelVal\) return false;\r?\n    \}\r?\n\r?\n/, '');

// 8. renderSuppliersFilteredView
s = s.replace(/<tr><td colspan="6" style="text-align:center; padding:2rem; color:#64748b; font-weight:700;">لا توجد سجلات موردين/, '<tr><td colspan="5" style="text-align:center; padding:2rem; color:#64748b; font-weight:700;">لا توجد سجلات موردين');
s = s.replace(/      <td style="text-align:center;">\$\{channelDisplay\}<\/td>\r?\n/, '');
s = s.replace(/const channelDisplay = s\.payment_channel && s\.payment_channel !== '-'[\s\S]*?: '<span style="color:#94a3b8;">-<\/span>';\r?\n/, '');

// 9. renderExpenseSettingsTables
s = s.replace(/  renderPaymentChannels\('settingsPaymentChannelsBody'\);\r?\n/, '');
s = s.replace(/  renderPaymentChannels\('settingsGeneralPaymentChannelsBody'\);\r?\n/, '');

fs.writeFileSync('src/controllers/modulesController.ts', s, 'utf8');
console.log('Original length:', originalLength, 'New length:', s.length, 'Delta:', s.length - originalLength);
