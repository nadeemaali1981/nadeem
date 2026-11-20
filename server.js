const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const db = require('./db.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const json = body ? JSON.parse(body) : {};
        resolve(json);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', err => reject(err));
  });
}

const requestHandler = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    // API Routes
    if (pathname.startsWith('/api/')) {
      // 0. Daily Sheet (دفتر اليومية المطور)
      if (pathname === '/api/daily-sheet') {
        if (method === 'GET') {
          const dateStr = parsedUrl.query.date || new Date().toISOString().split('T')[0];
          return sendJson(res, 200, await db.getDailySheet(dateStr));
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const saved = await db.saveDailySheet(body);
          return sendJson(res, 200, saved);
        }
      }

      if (pathname === '/api/daily-sheets-history' && method === 'GET') {
        const limit = parseInt(parsedUrl.query.limit || '30', 10);
        return sendJson(res, 200, await db.getDailySheetsHistory(limit));
      }

      if (pathname === '/api/daily-sheets/clear-all' && method === 'POST') {
        const body = await parseBody(req);
        if (body.confirm !== 'CONFIRM_DELETE_ALL') {
          return sendJson(res, 400, { success: false, error: 'يتطلب تأكيد أمني لحذف كافة السجلات' });
        }
        const result = await db.clearAllDailySheets();
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/seed-historical') {
        if (typeof db.seedHistoricalSales === 'function') {
          const resData = await db.seedHistoricalSales(true);
          return sendJson(res, 200, resData);
        }
        return sendJson(res, 200, { success: true, message: 'البيانات محملة' });
      }

      // Download Database Backup (النسخة الاحتياطية)
      if (pathname === '/api/backup' && method === 'GET') {
        const dbPath = path.join(__dirname, 'accounting.db');
        if (fs.existsSync(dbPath)) {
          const stat = fs.statSync(dbPath);
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="accounting-backup-${new Date().toISOString().split('T')[0]}.db"`,
            'Content-Length': stat.size
          });
          const stream = fs.createReadStream(dbPath);
          return stream.pipe(res);
        } else {
          return sendJson(res, 404, { error: 'ملف قاعدة البيانات غير موجود' });
        }
      }

      // Modules API Routes (المبيعات، المصاريف، الموردون، الموظفون، الذمم، الشيكات، الشركاء، الاستثمار، ادارة الواردات، الارباح والخسائر)
      if (pathname === '/api/modules/sales-summary' && method === 'GET') {
        return sendJson(res, 200, await db.getSalesSummary());
      }

      if (pathname === '/api/modules/expenses-summary' && method === 'GET') {
        return sendJson(res, 200, await db.getExpensesSummary());
      }

      if (pathname === '/api/modules/suppliers') {
        if (method === 'GET') return sendJson(res, 200, await db.getSuppliersList());
        if (method === 'POST') {
          const body = await parseBody(req);
          return sendJson(res, 201, await db.createSupplier(body));
        }
      }
      if (pathname.startsWith('/api/modules/suppliers/') && method === 'DELETE') {
        const id = parseInt(pathname.split('/').pop(), 10);
        return sendJson(res, 200, await db.deleteSupplier(id));
      }

      if (pathname === '/api/modules/employees') {
        if (method === 'GET') return sendJson(res, 200, await db.getEmployeesList());
        if (method === 'POST') {
          const body = await parseBody(req);
          return sendJson(res, 201, await db.createEmployee(body));
        }
      }
      if (pathname.startsWith('/api/modules/employees/') && method === 'DELETE') {
        const id = parseInt(pathname.split('/').pop(), 10);
        return sendJson(res, 200, await db.deleteEmployee(id));
      }

      if (pathname === '/api/modules/receivables' && method === 'GET') {
        return sendJson(res, 200, await db.getReceivablesSummary());
      }

      if (pathname === '/api/modules/checks') {
        if (method === 'GET') return sendJson(res, 200, await db.getChecksList());
        if (method === 'POST') {
          const body = await parseBody(req);
          return sendJson(res, 201, await db.createCheck(body));
        }
      }
      if (pathname.startsWith('/api/modules/checks/') && pathname.endsWith('/status') && method === 'PATCH') {
        const parts = pathname.split('/');
        const id = parseInt(parts[parts.length - 2], 10);
        const body = await parseBody(req);
        return sendJson(res, 200, await db.updateCheckStatus(id, body.status));
      }
      if (pathname.startsWith('/api/modules/checks/') && method === 'DELETE') {
        const id = parseInt(pathname.split('/').pop(), 10);
        return sendJson(res, 200, await db.deleteCheck(id));
      }

      if (pathname === '/api/modules/partners') {
        if (method === 'GET') return sendJson(res, 200, await db.getPartnersList());
        if (method === 'POST') {
          const body = await parseBody(req);
          return sendJson(res, 201, await db.createPartner(body));
        }
      }
      if (pathname.startsWith('/api/modules/partners/') && method === 'DELETE') {
        const id = parseInt(pathname.split('/').pop(), 10);
        return sendJson(res, 200, await db.deletePartner(id));
      }

      if (pathname === '/api/modules/investments') {
        if (method === 'GET') return sendJson(res, 200, await db.getInvestmentsList());
        if (method === 'POST') {
          const body = await parseBody(req);
          return sendJson(res, 201, await db.createInvestment(body));
        }
      }
      if (pathname.startsWith('/api/modules/investments/') && method === 'DELETE') {
        const id = parseInt(pathname.split('/').pop(), 10);
        return sendJson(res, 200, await db.deleteInvestment(id));
      }

      if (pathname === '/api/modules/imports') {
        if (method === 'GET') return sendJson(res, 200, await db.getImportsList());
        if (method === 'POST') {
          const body = await parseBody(req);
          return sendJson(res, 201, await db.createImport(body));
        }
      }
      if (pathname.startsWith('/api/modules/imports/') && method === 'DELETE') {
        const id = parseInt(pathname.split('/').pop(), 10);
        return sendJson(res, 200, await db.deleteImport(id));
      }

      if (pathname === '/api/modules/profit-loss' && method === 'GET') {
        return sendJson(res, 200, await db.getProfitLossStatement());
      }

      // 1. Dashboard
      if (pathname === '/api/dashboard' && method === 'GET') {
        const summary = await db.getDashboardSummary();
        return sendJson(res, 200, summary);
      }

      // 2. Accounts
      if (pathname === '/api/accounts') {
        if (method === 'GET') {
          return sendJson(res, 200, await db.getAccounts());
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const acc = await db.createAccount(body);
          return sendJson(res, 201, acc);
        }
      }

      // 3. Journal Entries
      if (pathname === '/api/journal') {
        if (method === 'GET') {
          const limit = parseInt(parsedUrl.query.limit || '100', 10);
          return sendJson(res, 200, await db.getJournalEntries(limit));
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const entry = await db.createJournalEntry(body);
          return sendJson(res, 201, entry);
        }
      }

      // 4. Invoices
      if (pathname === '/api/invoices') {
        if (method === 'GET') {
          const type = parsedUrl.query.type || 'sales';
          return sendJson(res, 200, await db.getInvoices(type));
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const inv = await db.createInvoice(body);
          return sendJson(res, 201, inv);
        }
      }

      // 5. Vouchers
      if (pathname === '/api/vouchers') {
        if (method === 'GET') {
          const type = parsedUrl.query.type || 'receipt';
          return sendJson(res, 200, await db.getVouchers(type));
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const voucher = await db.createVoucher(body);
          return sendJson(res, 201, voucher);
        }
      }

      // 6. Contacts
      if (pathname === '/api/contacts') {
        if (method === 'GET') {
          const type = parsedUrl.query.type || null;
          return sendJson(res, 200, await db.getContacts(type));
        }
        if (method === 'POST') {
          const body = await parseBody(req);
          const contact = await db.createContact(body);
          return sendJson(res, 201, contact);
        }
      }

      // 7. Reports
      if (pathname === '/api/reports/trial-balance' && method === 'GET') {
        return sendJson(res, 200, await db.getTrialBalance());
      }

      if (pathname === '/api/reports/general-ledger' && method === 'GET') {
        const accountId = parseInt(parsedUrl.query.accountId, 10);
        if (!accountId) {
          return sendJson(res, 400, { error: 'رقم الحساب مطلوب (accountId)' });
        }
        const startDate = parsedUrl.query.startDate || null;
        const endDate = parsedUrl.query.endDate || null;
        return sendJson(res, 200, await db.getGeneralLedger(accountId, startDate, endDate));
      }

      if (pathname === '/api/reports/income-statement' && method === 'GET') {
        return sendJson(res, 200, await db.getIncomeStatement());
      }

      if (pathname === '/api/reports/balance-sheet' && method === 'GET') {
        return sendJson(res, 200, await db.getBalanceSheet());
      }

      return sendJson(res, 404, { error: 'نقطة الاتصال غير موجودة' });
    }

    // Static File Serving
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';

    const baseName = path.basename(safePath);
    const candidatePaths = [
      path.join(PUBLIC_DIR, safePath),
      path.join(__dirname, safePath),
      path.join(PUBLIC_DIR, baseName),
      path.join(__dirname, baseName),
      path.join(__dirname, 'css', baseName),
      path.join(__dirname, 'js', baseName)
    ];

    let foundFile = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        foundFile = p;
        break;
      }
    }

    if (foundFile) {
      const ext = path.extname(foundFile).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(foundFile).pipe(res);
      return;
    }

    // Fallback to index.html for SPA
    const fallbackPaths = [
      path.join(PUBLIC_DIR, 'index.html'),
      path.join(__dirname, 'index.html')
    ];
    for (const p of fallbackPaths) {
      if (fs.existsSync(p)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(p).pipe(res);
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  } catch (err) {
    console.error('Server Error:', err);
    sendJson(res, 500, { error: err.message || 'حدث خطأ في الخادم' });
  }
};

const server = http.createServer(requestHandler);

module.exports = { handler: requestHandler };

if (require.main === module) server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`  البرنامج المحاسبي قيد التشغيل الآن بنجاح!`);
  console.log(`  الرابط المحلي: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
