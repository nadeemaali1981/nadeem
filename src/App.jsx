import React, { useEffect } from 'react';
import HeaderSection from './components/HeaderSection.jsx';
import DailyJournalSection from './components/DailyJournalSection.jsx';
import SalesModuleSection from './components/SalesModuleSection.jsx';
import FinancialModulesSection from './components/FinancialModulesSection.jsx';
import SettingsSection from './components/SettingsSection.jsx';
import ModalsSection from './components/ModalsSection.jsx';

export default function App() {
  useEffect(() => {
    // 1. Bind Navigation Tab Switching
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (typeof window.switchTab === 'function') {
          window.switchTab(target);
        }
      });
    });

    // 2. Bind Accounts Loader
    window.loadAccountsTab = async function () {
      const tbody = document.getElementById('accountsTableBody');
      if (!tbody) return;
      try {
        const res = await fetch('/api/accounts');
        const data = await res.json();
        tbody.innerHTML = '';
        const typeNames = {
          asset: 'أصول',
          liability: 'خصوم / التزامات',
          equity: 'حقوق ملكية',
          revenue: 'إيرادات',
          expense: 'مصروفات'
        };
        data.forEach(acc => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight:700;">${acc.code}</td>
            <td style="font-weight:600;">${acc.name}</td>
            <td>${typeNames[acc.type] || acc.type}</td>
            <td><span class="badge">${acc.nature === 'debit' ? 'مدين' : 'دائن'}</span></td>
            <td style="text-align:left; direction:ltr;">${(acc.total_debit || 0).toFixed(2)}</td>
            <td style="text-align:left; direction:ltr;">${(acc.total_credit || 0).toFixed(2)}</td>
            <td style="text-align:left; direction:ltr; font-weight:700; color:#1e3a8a;">${(acc.current_balance || 0).toFixed(2)}</td>
          `;
          tbody.appendChild(tr);
        });
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" style="color:red; text-align:center;">خطأ في تحميل الحسابات</td></tr>';
      }
    };

    document.getElementById('btnRefreshAccounts')?.addEventListener('click', window.loadAccountsTab);

    // 3. Initialize Custom Field Names & Daily Journal Engine
    if (typeof window.applyCustomFieldNames === 'function') {
      window.applyCustomFieldNames();
    }
    if (typeof window.initDailyJournal === 'function') {
      window.initDailyJournal();
    }
  }, []);

  return (
    <div className="erp-react-root" style={{ display: 'contents' }}>
      <HeaderSection />
      <main className="main-content">
        <DailyJournalSection />
        <SalesModuleSection />
        <FinancialModulesSection />
        <SettingsSection />
      </main>
      <ModalsSection />
    </div>
  );
}
