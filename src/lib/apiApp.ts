// @ts-nocheck
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import db from './db';

export const app = new Hono();

app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));

app.onError((err, c) => {
  console.error('[Next.js Hono ERP API Error]:', err);
  return c.json({ error: err.message || 'حدث خطأ في الخادم' }, 500);
});

// 0. Daily Journal (دفتر اليومية المطور)
app.get('/api/daily-sheet', async (c) => {
  const dateStr = c.req.query('date') || new Date().toISOString().split('T')[0];
  return c.json(await db.getDailySheet(dateStr));
});

app.post('/api/daily-sheet', async (c) => {
  const body = await c.req.json();
  return c.json(await db.saveDailySheet(body));
});

app.get('/api/daily-sheets-history', async (c) => {
  const limit = parseInt(c.req.query('limit') || '30', 10);
  return c.json(await db.getDailySheetsHistory(limit));
});

app.post('/api/daily-sheets/clear-all', async (c) => {
  const body = await c.req.json();
  if (body.confirm !== 'CONFIRM_DELETE_ALL') {
    return c.json({ success: false, error: 'يتطلب تأكيد أمني لحذف كافة السجلات' }, 400);
  }
  return c.json(await db.clearAllDailySheets());
});

app.all('/api/seed-historical', async (c) => {
  if (typeof db.seedHistoricalSales === 'function') {
    return c.json(await db.seedHistoricalSales(true));
  }
  return c.json({ success: true, message: 'البيانات محملة' });
});

app.get('/api/backup', async (c) => {
  const [sales, expenses, suppliers, employees, checks, partners, investments, imports, accounts] = await Promise.all([
    db.getSalesSummary(),
    db.getExpensesSummary(),
    db.getSuppliersList(),
    db.getEmployeesList(),
    db.getChecksList(),
    db.getPartnersList(),
    db.getInvestmentsList(),
    db.getImportsList(),
    db.getAccounts()
  ]);
  const payload = JSON.stringify({
    exported_at: new Date().toISOString(),
    system: 'Nadeem Clothes Store ERP (Next.js + Supabase PostgreSQL)',
    sales, expenses, suppliers, employees, checks, partners, investments, imports, accounts
  }, null, 2);

  const fileName = `nadeem-erp-backup-${new Date().toISOString().split('T')[0]}.json`;
  return new Response(payload, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`
    }
  });
});

// 1. Compressed Media Assets Engine (WebP Lossless/Near-Lossless)
app.get('/api/media/stats', async (c) => c.json(await db.getMediaStorageStats()));
app.get('/api/media', async (c) => {
  const entity_type = c.req.query('entity_type') || '';
  const entity_id = c.req.query('entity_id') || '';
  const limit = parseInt(c.req.query('limit') || '100', 10);
  return c.json(await db.getMediaAssetsList({ entity_type, entity_id, limit }));
});
app.post('/api/media', async (c) => c.json(await db.saveMediaAsset(await c.req.json()), 201));
app.get('/api/media/:id/raw', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const asset = await db.getMediaAssetById(id);
  if (!asset || !asset.image_data) return c.json({ error: 'الصورة غير موجودة' }, 404);
  const match = asset.image_data.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return c.json({ error: 'بيانات الصورة غير صالحة' }, 400);
  const binary = Buffer.from(match[2], 'base64');
  return new Response(binary, {
    status: 200,
    headers: {
      'Content-Type': match[1],
      'Content-Length': String(binary.length),
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
});
app.get('/api/media/:id', async (c) => {
  const asset = await db.getMediaAssetById(parseInt(c.req.param('id'), 10));
  if (!asset) return c.json({ error: 'الصورة غير موجودة' }, 404);
  return c.json(asset);
});
app.delete('/api/media/:id', async (c) => c.json(await db.deleteMediaAsset(parseInt(c.req.param('id'), 10))));

// 2. ERP Operational Modules
app.get('/api/modules/sales-summary', async (c) => c.json(await db.getSalesSummary()));
app.get('/api/modules/expenses-summary', async (c) => c.json(await db.getExpensesSummary()));
app.post('/api/modules/expenses', async (c) => c.json(await db.createExpenseRecord(await c.req.json()), 201));
app.delete('/api/modules/expenses/:id', async (c) => c.json(await db.deleteExpenseRecord(parseInt(c.req.param('id'), 10))));
app.get('/api/modules/suppliers', async (c) => c.json(await db.getSuppliersList()));
app.post('/api/modules/suppliers', async (c) => c.json(await db.createSupplier(await c.req.json()), 201));
app.delete('/api/modules/suppliers/:id', async (c) => c.json(await db.deleteSupplier(parseInt(c.req.param('id'), 10))));
app.get('/api/modules/employees', async (c) => c.json(await db.getEmployeesList()));
app.post('/api/modules/employees', async (c) => c.json(await db.createEmployee(await c.req.json()), 201));
app.delete('/api/modules/employees/:id', async (c) => c.json(await db.deleteEmployee(parseInt(c.req.param('id'), 10))));
app.get('/api/modules/receivables', async (c) => c.json(await db.getReceivablesSummary()));
app.get('/api/modules/checks', async (c) => c.json(await db.getChecksList()));
app.post('/api/modules/checks', async (c) => c.json(await db.createCheck(await c.req.json()), 201));
app.patch('/api/modules/checks/:id/status', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json();
  return c.json(await db.updateCheckStatus(id, body.status));
});
app.delete('/api/modules/checks/:id', async (c) => c.json(await db.deleteCheck(parseInt(c.req.param('id'), 10))));
app.get('/api/modules/partners', async (c) => c.json(await db.getPartnersList()));
app.post('/api/modules/partners', async (c) => c.json(await db.createPartner(await c.req.json()), 201));
app.delete('/api/modules/partners/:id', async (c) => c.json(await db.deletePartner(parseInt(c.req.param('id'), 10))));
app.get('/api/modules/investments', async (c) => c.json(await db.getInvestmentsList()));
app.post('/api/modules/investments', async (c) => c.json(await db.createInvestment(await c.req.json()), 201));
app.delete('/api/modules/investments/:id', async (c) => c.json(await db.deleteInvestment(parseInt(c.req.param('id'), 10))));
app.get('/api/modules/imports', async (c) => c.json(await db.getImportsList()));
app.post('/api/modules/imports', async (c) => c.json(await db.createImport(await c.req.json()), 201));
app.delete('/api/modules/imports/:id', async (c) => c.json(await db.deleteImport(parseInt(c.req.param('id'), 10))));
app.get('/api/modules/profit-loss', async (c) => c.json(await db.getProfitLossStatement()));

// 3. Accounting Core
app.get('/api/dashboard', async (c) => c.json(await db.getDashboardSummary()));
app.get('/api/accounts', async (c) => c.json(await db.getAccounts()));
app.post('/api/accounts', async (c) => c.json(await db.createAccount(await c.req.json()), 201));
app.get('/api/journal', async (c) => c.json(await db.getJournalEntries(parseInt(c.req.query('limit') || '100', 10))));
app.post('/api/journal', async (c) => c.json(await db.createJournalEntry(await c.req.json()), 201));
app.get('/api/invoices', async (c) => c.json(await db.getInvoices(c.req.query('type') || 'sales')));
app.post('/api/invoices', async (c) => c.json(await db.createInvoice(await c.req.json()), 201));
app.get('/api/vouchers', async (c) => c.json(await db.getVouchers(c.req.query('type') || 'receipt')));
app.post('/api/vouchers', async (c) => c.json(await db.createVoucher(await c.req.json()), 201));
app.get('/api/contacts', async (c) => c.json(await db.getContacts(c.req.query('type') || null)));
app.post('/api/contacts', async (c) => c.json(await db.createContact(await c.req.json()), 201));
app.get('/api/reports/trial-balance', async (c) => c.json(await db.getTrialBalance()));
app.get('/api/reports/general-ledger', async (c) => {
  const accountId = parseInt(c.req.query('accountId') || '0', 10);
  if (!accountId) return c.json({ error: 'رقم الحساب مطلوب (accountId)' }, 400);
  return c.json(await db.getGeneralLedger(accountId, c.req.query('startDate') || null, c.req.query('endDate') || null));
});
app.get('/api/reports/income-statement', async (c) => c.json(await db.getIncomeStatement()));
app.get('/api/reports/balance-sheet', async (c) => c.json(await db.getBalanceSheet()));

app.all('/api/*', (c) => c.json({ error: 'نقطة الاتصال غير موجودة' }, 404));
