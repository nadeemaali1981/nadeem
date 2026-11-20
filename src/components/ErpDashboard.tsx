'use client';
// @ts-nocheck
import React, { useEffect } from 'react';
import HeaderSection from './HeaderSection';
import DailyJournalSection from './DailyJournalSection';
import SalesModuleSection from './SalesModuleSection';
import FinancialModulesSection from './FinancialModulesSection';
import SettingsSection from './SettingsSection';
import ModalsSection from './ModalsSection';
import { mountImageCompressor } from '@/lib/imageCompressor';
import { mountModulesController } from '@/controllers/modulesController';
import { mountDailyController } from '@/controllers/dailyController';

export default function ErpDashboard() {
  useEffect(() => {
    // 1. Mount TypeScript ERP Controllers & Smart WebP Image Compression Engine
    mountImageCompressor();
    mountModulesController();
    mountDailyController();

    // 2. Bind Navigation Tab Switching
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = (tab as HTMLElement).dataset.tab;
        if (typeof (window as any).switchTab === 'function') {
          (window as any).switchTab(target);
        }
      });
    });

    // 3. Bind Accounts Tab Loader
    (window as any).loadAccountsTab = async function () {
      const tbody = document.getElementById('accountsTableBody');
      if (!tbody) return;
      try {
        const res = await fetch('/api/accounts');
        const data = await res.json();
        tbody.innerHTML = '';
        const typeNames: Record<string, string> = {
          asset: 'أصول',
          liability: 'خصوم / التزامات',
          equity: 'حقوق ملكية',
          revenue: 'إيرادات',
          expense: 'مصروفات'
        };
        data.forEach((acc: any) => {
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

    document.getElementById('btnRefreshAccounts')?.addEventListener('click', (window as any).loadAccountsTab);

    if (typeof (window as any).applyCustomFieldNames === 'function') {
      (window as any).applyCustomFieldNames();
    }
    if (typeof (window as any).initDailyJournal === 'function') {
      (window as any).initDailyJournal();
    }
  }, []);

  return (
    <div className="erp-nextjs-root" style={{ display: 'contents' }}>
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
