const path = require('node:path');
const fs = require('node:fs');

// Load .env file if present
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  } else {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let val = (match[2] || '').trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }
} catch (e) {}

// Sanitize DATABASE_URL if password has brackets or points to IPv6 direct connection
function sanitizeDatabaseUrl(url) {
  if (!url) return '';
  // Remove accidental [brackets] around the password, e.g. user:[password]@host
  return url.replace(/:\[([^\]]+)\]@/, ':$1@');
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = sanitizeDatabaseUrl(process.env.DATABASE_URL);
}
if (process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = sanitizeDatabaseUrl(process.env.SUPABASE_URL);
}

// ----------------------------------------------------
// Cloud Database Strategy (Supabase / PostgreSQL Pooler IPv4)
// ----------------------------------------------------
const SUPABASE_DEFAULT_URL = '';
const CLOUD_DB_URL = sanitizeDatabaseUrl(process.env.DATABASE_URL || process.env.SUPABASE_URL || SUPABASE_DEFAULT_URL);
if (CLOUD_DB_URL && (CLOUD_DB_URL.startsWith('postgres://') || CLOUD_DB_URL.startsWith('postgresql://'))) {
  try {
    process.env.DATABASE_URL = CLOUD_DB_URL;
    console.log('⚡ [Database Strategy] Active: Supabase Cloud PostgreSQL');
    module.exports = require('./db-pg.js');
    return;
  } catch (err) {
    console.error('❌ [Database Strategy] Failed to connect to Supabase, falling back to local SQLite:', err.message);
  }
}

// ----------------------------------------------------
// Local Offline Database Strategy (SQLite)
// ----------------------------------------------------
const { DatabaseSync } = require('node:sqlite');
const DB_PATH = path.join(__dirname, 'accounting.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

// Initialize Tables
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- 'asset', 'liability', 'equity', 'revenue', 'expense'
      nature TEXT NOT NULL, -- 'debit', 'credit'
      parent_code TEXT,
      description TEXT,
      is_system INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- 'customer', 'supplier'
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      tax_number TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_number TEXT UNIQUE NOT NULL,
      entry_date TEXT NOT NULL,
      description TEXT,
      reference_type TEXT, -- 'manual', 'sales_invoice', 'purchase_invoice', 'receipt_voucher', 'payment_voucher'
      reference_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      account_code TEXT NOT NULL,
      account_name TEXT NOT NULL,
      description TEXT,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL, -- 'sales', 'purchase'
      contact_id INTEGER REFERENCES contacts(id),
      contact_name TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      payment_method TEXT NOT NULL, -- 'cash', 'bank', 'credit'
      subtotal REAL NOT NULL,
      tax_amount REAL NOT NULL,
      total_amount REAL NOT NULL,
      notes TEXT,
      journal_entry_id INTEGER REFERENCES journal_entries(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      item_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      tax_rate REAL DEFAULT 15,
      tax_amount REAL NOT NULL,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_number TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL, -- 'receipt', 'payment'
      voucher_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL, -- 'cash', 'bank'
      contact_id INTEGER REFERENCES contacts(id),
      contact_name TEXT,
      target_account_id INTEGER NOT NULL REFERENCES accounts(id),
      description TEXT,
      journal_entry_id INTEGER REFERENCES journal_entries(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Daily Journal Sheets (دفتر اليومية المطور)
    CREATE TABLE IF NOT EXISTS daily_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sheet_date TEXT UNIQUE NOT NULL,
      day_name TEXT,
      sales_cash REAL DEFAULT 0,
      sales_delivery REAL DEFAULT 0,
      sales_visa REAL DEFAULT 0,
      sales_ittihad REAL DEFAULT 0,
      sales_ittihad_qr REAL DEFAULT 0,
      sales_cliq REAL DEFAULT 0,
      sales_items_count INTEGER DEFAULT 0,
      deposit_personal REAL DEFAULT 0,
      deposit_business REAL DEFAULT 0,
      deposit_personal_date TEXT DEFAULT '',
      deposit_business_date TEXT DEFAULT '',
      notes TEXT,
      perfume_desc TEXT,
      perfume_debit REAL DEFAULT 0,
      perfume_credit REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS daily_sheet_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sheet_id INTEGER NOT NULL REFERENCES daily_sheets(id) ON DELETE CASCADE,
      category TEXT NOT NULL, -- 'internal_expense', 'employee_advance', 'supplier_payment', 'cash_purchase', 'daily_obligation', 'merchant_dispatch', 'extra_revenue', 'revenue_expense'
      col1 TEXT,
      col2 TEXT,
      col3 TEXT,
      col4 TEXT,
      col5 TEXT,
      amount1 REAL DEFAULT 0,
      amount2 REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_daily_sheets_sheet_date ON daily_sheets(sheet_date);
    CREATE INDEX IF NOT EXISTS idx_daily_sheet_items_sheet_id ON daily_sheet_items(sheet_id);
    CREATE INDEX IF NOT EXISTS idx_daily_sheet_items_category ON daily_sheet_items(category);

    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_number TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'incoming', -- 'incoming', 'outgoing'
      party_name TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      due_date TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending', -- 'pending', 'collected', 'bounced', 'cancelled'
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      share_percentage REAL DEFAULT 0,
      capital REAL DEFAULT 0,
      drawings REAL DEFAULT 0,
      phone TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'تطوير وتوسع',
      initial_amount REAL NOT NULL,
      current_value REAL DEFAULT 0,
      returns REAL DEFAULT 0,
      start_date TEXT NOT NULL,
      status TEXT DEFAULT 'active', -- 'active', 'liquidated', 'paused'
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_number TEXT UNIQUE NOT NULL,
      supplier_name TEXT NOT NULL,
      item_description TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      goods_cost REAL NOT NULL,
      shipping_customs_cost REAL DEFAULT 0,
      total_cost REAL NOT NULL,
      arrival_date TEXT,
      status TEXT DEFAULT 'in_transit', -- 'in_transit', 'customs', 'received', 'completed'
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      job_title TEXT DEFAULT 'موظف مبيعات',
      phone TEXT,
      salary REAL DEFAULT 0,
      hire_date TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try { db.exec("ALTER TABLE daily_sheets ADD COLUMN sales_items_count INTEGER DEFAULT 0;"); } catch (e) {}
  try { db.exec("ALTER TABLE daily_sheets ADD COLUMN deposit_personal_date TEXT DEFAULT '';"); } catch (e) {}
  try { db.exec("ALTER TABLE daily_sheets ADD COLUMN deposit_business_date TEXT DEFAULT '';"); } catch (e) {}

  seedDefaultAccounts();
  seedModuleData();
  seedHistoricalSales();
}

function seedHistoricalSales(force = false) {
  try {
    if (!force) {
      const row = db.prepare('SELECT COUNT(*) as count FROM daily_sheets').get();
      const itemsRow = db.prepare('SELECT COALESCE(SUM(sales_items_count), 0) as total_items FROM daily_sheets').get();
      const count = parseInt(row?.count || 0, 10);
      const totalItems = parseInt(itemsRow?.total_items || 0, 10);

      if (count >= 365 && totalItems >= 13666) {
        return { success: true, message: 'البيانات التاريخية كاملة لجميع أيام السنة ومحدثة مع عدد القطع', count, totalItems };
      }
    }

    let records = null;
    try {
      records = require('./historical_data.js');
    } catch (e) {
      const jsonPath = path.join(__dirname, 'historical_sales.json');
      if (fs.existsSync(jsonPath)) {
        records = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      }
    }

    if (!records || !records.length) {
      return { success: false, message: 'ملف البيانات التاريخية غير موجود' };
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      const insertStmt = db.prepare(`
        INSERT INTO daily_sheets (
          sheet_date, day_name, sales_cash, sales_delivery, sales_visa,
          sales_ittihad, sales_ittihad_qr, sales_cliq, sales_items_count,
          deposit_personal, deposit_business, deposit_personal_date, deposit_business_date,
          notes, perfume_desc, perfume_debit, perfume_credit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', '', '', '', 0, 0)
        ON CONFLICT(sheet_date) DO UPDATE SET
          sales_cash = excluded.sales_cash,
          sales_delivery = excluded.sales_delivery,
          sales_visa = excluded.sales_visa,
          sales_ittihad = excluded.sales_ittihad,
          sales_ittihad_qr = excluded.sales_ittihad_qr,
          sales_cliq = excluded.sales_cliq,
          sales_items_count = excluded.sales_items_count
      `);

      for (const r of records) {
        insertStmt.run(
          r.sheet_date,
          r.day_name,
          r.sales_cash,
          r.sales_delivery,
          r.sales_visa,
          r.sales_ittihad,
          r.sales_ittihad_qr,
          r.sales_cliq,
          Number(r.sales_items_count || 0)
        );
      }
      db.exec('COMMIT;');
      return { success: true, count: records.length, message: 'تم إدخال كافة بيانات السنة بنجاح!' };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } catch (err) {
    console.warn('Warning seeding historical sales in SQLite:', err.message);
    return { success: false, error: err.message };
  }
}

// Seed default Chart of Accounts if empty
function seedDefaultAccounts() {
  const count = db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
  if (count > 0) return;

  const defaultAccounts = [
    // 1 - الأصول
    { code: '1', name: 'الأصول', type: 'asset', nature: 'debit', parent_code: null, is_system: 1 },
    { code: '11', name: 'الأصول المتداولة', type: 'asset', nature: 'debit', parent_code: '1', is_system: 1 },
    { code: '1101', name: 'الصندوق / الخزينة النقدية', type: 'asset', nature: 'debit', parent_code: '11', is_system: 1 },
    { code: '1102', name: 'الحساب البنكي', type: 'asset', nature: 'debit', parent_code: '11', is_system: 1 },
    { code: '1103', name: 'العملاء (الذمم المدينة)', type: 'asset', nature: 'debit', parent_code: '11', is_system: 1 },
    { code: '1104', name: 'ضريبة القيمة المضافة مدخلات (مشتريات)', type: 'asset', nature: 'debit', parent_code: '11', is_system: 1 },
    { code: '1105', name: 'المخزون السلعي', type: 'asset', nature: 'debit', parent_code: '11', is_system: 1 },
    { code: '12', name: 'الأصول غير المتداولة (الثابتة)', type: 'asset', nature: 'debit', parent_code: '1', is_system: 1 },
    { code: '1201', name: 'الآلات والمعدات', type: 'asset', nature: 'debit', parent_code: '12', is_system: 1 },
    { code: '1202', name: 'الأثاث والتجهيزات المكتبية', type: 'asset', nature: 'debit', parent_code: '12', is_system: 1 },

    // 2 - الخصوم
    { code: '2', name: 'الخصوم والالتزامات', type: 'liability', nature: 'credit', parent_code: null, is_system: 1 },
    { code: '21', name: 'الخصوم المتداولة', type: 'liability', nature: 'credit', parent_code: '2', is_system: 1 },
    { code: '2101', name: 'الموردون (الذمم الدائنة)', type: 'liability', nature: 'credit', parent_code: '21', is_system: 1 },
    { code: '2102', name: 'ضريبة القيمة المضافة مخرجات (مبيعات)', type: 'liability', nature: 'credit', parent_code: '21', is_system: 1 },
    { code: '2103', name: 'مصروفات مستحقة الدفع', type: 'liability', nature: 'credit', parent_code: '21', is_system: 1 },

    // 3 - حقوق الملكية
    { code: '3', name: 'حقوق الملكية', type: 'equity', nature: 'credit', parent_code: null, is_system: 1 },
    { code: '3101', name: 'رأس المال', type: 'equity', nature: 'credit', parent_code: '3', is_system: 1 },
    { code: '3102', name: 'الأرباح والخسائر المبقاة', type: 'equity', nature: 'credit', parent_code: '3', is_system: 1 },
    { code: '3103', name: 'جاري المالك / الشركاء', type: 'equity', nature: 'credit', parent_code: '3', is_system: 1 },

    // 4 - الإيرادات
    { code: '4', name: 'الإيرادات', type: 'revenue', nature: 'credit', parent_code: null, is_system: 1 },
    { code: '4101', name: 'إيراد المبيعات', type: 'revenue', nature: 'credit', parent_code: '4', is_system: 1 },
    { code: '4102', name: 'إيرادات خدمات واستشارات', type: 'revenue', nature: 'credit', parent_code: '4', is_system: 1 },
    { code: '4103', name: 'إيرادات أخرى متنوعة', type: 'revenue', nature: 'credit', parent_code: '4', is_system: 1 },

    // 5 - المصروفات
    { code: '5', name: 'المصروفات', type: 'expense', nature: 'debit', parent_code: null, is_system: 1 },
    { code: '5101', name: 'تكلفة المبيعات والمشتريات', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5201', name: 'مصروفات الرواتب والأجور', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5202', name: 'مصروف إيجار المقر', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5203', name: 'مصاريف كهرباء ومياه واتصالات', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5204', name: 'مصاريف دعاية وتسويق', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5205', name: 'مصاريف صيانة وضيافة', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5206', name: 'مصاريف بنكية ورسوم حكومية', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
  ];

  const stmt = db.prepare(`
    INSERT INTO accounts (code, name, type, nature, parent_code, is_system)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const acc of defaultAccounts) {
    stmt.run(acc.code, acc.name, acc.type, acc.nature, acc.parent_code, acc.is_system);
  }

  // Seed sample customers and suppliers
  const contactStmt = db.prepare(`
    INSERT INTO contacts (type, name, phone, email, tax_number, address)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  contactStmt.run('customer', 'شركة الأفق للتجارة', '0501234567', 'info@alofooq.sa', '300123456700003', 'الرياض، المملكة العربية السعودية');
  contactStmt.run('customer', 'مؤسسة النور للإعمار', '0559876543', 'contact@alnoor.sa', '300987654300003', 'جدة، المملكة العربية السعودية');
  contactStmt.run('supplier', 'شركة التوريدات العالمية', '0112233445', 'supply@global.com', '310555666700003', 'الدمام، المملكة العربية السعودية');
}

// Helpers
function generateNextNumber(prefix, table, column) {
  const row = db.prepare(`SELECT ${column} FROM ${table} WHERE ${column} LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  if (!row) {
    return `${prefix}-0001`;
  }
  const currentNum = parseInt(row[column].split('-')[1] || '0', 10);
  const nextNum = (currentNum + 1).toString().padStart(4, '0');
  return `${prefix}-${nextNum}`;
}

// Accounts Operations
function getAccounts() {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY code ASC').all();
  // Compute net balance for each account from journal entry lines
  const balances = db.prepare(`
    SELECT account_id,
           SUM(debit) as total_debit,
           SUM(credit) as total_credit
    FROM journal_entry_lines
    GROUP BY account_id
  `).all();

  const balanceMap = {};
  for (const b of balances) {
    balanceMap[b.account_id] = {
      debit: Number(b.total_debit || 0),
      credit: Number(b.total_credit || 0)
    };
  }

  return accounts.map(acc => {
    const b = balanceMap[acc.id] || { debit: 0, credit: 0 };
    // Normal balance
    const netBalance = acc.nature === 'debit' ? (b.debit - b.credit) : (b.credit - b.debit);
    return {
      ...acc,
      total_debit: b.debit,
      total_credit: b.credit,
      current_balance: Math.round(netBalance * 100) / 100
    };
  });
}

function createAccount(data) {
  const stmt = db.prepare(`
    INSERT INTO accounts (code, name, type, nature, parent_code, description, is_system)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);
  const res = stmt.run(data.code, data.name, data.type, data.nature, data.parent_code || null, data.description || '');
  return { id: res.lastInsertRowid, ...data };
}

// Journal Entries Operations
function createJournalEntry(data) {
  // Validate double entry rule: total debit === total credit
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of data.lines) {
    totalDebit += Number(line.debit || 0);
    totalCredit += Number(line.credit || 0);
  }

  // Round to 2 decimal places to avoid floating point precision issues
  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`القيد غير متوازن! مجموع المدين (${totalDebit}) لا يساوي مجموع الدائن (${totalCredit})`);
  }

  if (totalDebit <= 0) {
    throw new Error('يجب أن تكون قيمة القيد أكبر من صفر');
  }

  const entryNumber = data.entry_number || generateNextNumber('JV', 'journal_entries', 'entry_number');

  db.exec('BEGIN TRANSACTION;');
  try {
    const entryStmt = db.prepare(`
      INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    const res = entryStmt.run(
      entryNumber,
      data.entry_date || new Date().toISOString().split('T')[0],
      data.description || '',
      data.reference_type || 'manual',
      data.reference_id || null
    );
    const entryId = res.lastInsertRowid;

    const lineStmt = db.prepare(`
      INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const line of data.lines) {
      const acc = db.prepare('SELECT code, name FROM accounts WHERE id = ?').get(line.account_id);
      if (!acc) throw new Error(`الحساب غير موجود: ${line.account_id}`);

      lineStmt.run(
        entryId,
        line.account_id,
        acc.code,
        acc.name,
        line.description || data.description || '',
        Number(line.debit || 0),
        Number(line.credit || 0)
      );
    }

    db.exec('COMMIT;');
    return { id: entryId, entry_number: entryNumber };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function getJournalEntries(limit = 100) {
  const entries = db.prepare(`
    SELECT j.*,
           (SELECT SUM(debit) FROM journal_entry_lines WHERE entry_id = j.id) as total_amount
    FROM journal_entries j
    ORDER BY j.entry_date DESC, j.id DESC
    LIMIT ?
  `).all(limit);

  for (const entry of entries) {
    entry.lines = db.prepare(`
      SELECT * FROM journal_entry_lines WHERE entry_id = ? ORDER BY id ASC
    `).all(entry.id);
  }

  return entries;
}

// Invoices (Sales & Purchases)
function createInvoice(data) {
  // data: { type: 'sales'|'purchase', contact_id, contact_name, invoice_date, payment_method, items: [...], notes }
  const prefix = data.type === 'sales' ? 'INV' : 'BILL';
  const invoiceNumber = data.invoice_number || generateNextNumber(prefix, 'invoices', 'invoice_number');

  let subtotal = 0;
  let taxAmount = 0;
  let totalAmount = 0;

  const preparedItems = data.items.map(item => {
    const qty = Number(item.quantity);
    const price = Number(item.unit_price);
    const lineSubtotal = qty * price;
    const taxRate = item.tax_rate !== undefined ? Number(item.tax_rate) : 15;
    const lineTax = Math.round(lineSubtotal * (taxRate / 100) * 100) / 100;
    const lineTotal = lineSubtotal + lineTax;

    subtotal += lineSubtotal;
    taxAmount += lineTax;
    totalAmount += lineTotal;

    return {
      ...item,
      quantity: qty,
      unit_price: price,
      tax_rate: taxRate,
      tax_amount: lineTax,
      total: lineTotal
    };
  });

  subtotal = Math.round(subtotal * 100) / 100;
  taxAmount = Math.round(taxAmount * 100) / 100;
  totalAmount = Math.round(totalAmount * 100) / 100;

  db.exec('BEGIN TRANSACTION;');
  try {
    const invStmt = db.prepare(`
      INSERT INTO invoices (invoice_number, type, contact_id, contact_name, invoice_date, payment_method, subtotal, tax_amount, total_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const invRes = invStmt.run(
      invoiceNumber,
      data.type,
      data.contact_id || null,
      data.contact_name || (data.type === 'sales' ? 'عميل نقدي' : 'مورد عام'),
      data.invoice_date || new Date().toISOString().split('T')[0],
      data.payment_method || 'cash',
      subtotal,
      taxAmount,
      totalAmount,
      data.notes || ''
    );
    const invoiceId = invRes.lastInsertRowid;

    const itemStmt = db.prepare(`
      INSERT INTO invoice_items (invoice_id, item_name, quantity, unit_price, tax_rate, tax_amount, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of preparedItems) {
      itemStmt.run(invoiceId, item.item_name, item.quantity, item.unit_price, item.tax_rate, item.tax_amount, item.total);
    }

    // Auto-generate Balanced Accounting Journal Entry
    // ----------------------------------------------------
    const cashAcc = db.prepare("SELECT id, code, name FROM accounts WHERE code = '1101'").get();
    const bankAcc = db.prepare("SELECT id, code, name FROM accounts WHERE code = '1102'").get();
    const custAcc = db.prepare("SELECT id, code, name FROM accounts WHERE code = '1103'").get();
    const suppAcc = db.prepare("SELECT id, code, name FROM accounts WHERE code = '2101'").get();
    const salesAcc = db.prepare("SELECT id, code, name FROM accounts WHERE code = '4101'").get();
    const purchaseAcc = db.prepare("SELECT id, code, name FROM accounts WHERE code = '5101'").get();
    const vatOutputAcc = db.prepare("SELECT id, code, name FROM accounts WHERE code = '2102'").get();
    const vatInputAcc = db.prepare("SELECT id, code, name FROM accounts WHERE code = '1104'").get();

    const entryNumber = generateNextNumber('JV', 'journal_entries', 'entry_number');
    const entryStmt = db.prepare(`
      INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const entryDesc = data.type === 'sales'
      ? `فاتورة مبيعات رقم ${invoiceNumber} - ${data.contact_name || 'عميل نقدي'}`
      : `فاتورة مشتريات رقم ${invoiceNumber} - ${data.contact_name || 'مورد عام'}`;

    const entryRes = entryStmt.run(
      entryNumber,
      data.invoice_date || new Date().toISOString().split('T')[0],
      entryDesc,
      data.type === 'sales' ? 'sales_invoice' : 'purchase_invoice',
      invoiceId
    );
    const entryId = entryRes.lastInsertRowid;

    // Link back to invoice
    db.prepare('UPDATE invoices SET journal_entry_id = ? WHERE id = ?').run(entryId, invoiceId);

    const lineStmt = db.prepare(`
      INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    if (data.type === 'sales') {
      // Sales Entry:
      // Dr: Payment Account (Cash, Bank, or Receivable) -> totalAmount
      // Cr: Sales Revenue (4101) -> subtotal
      // Cr: VAT Output (2102) -> taxAmount (if any)
      let debitTargetAcc = cashAcc;
      if (data.payment_method === 'bank') debitTargetAcc = bankAcc;
      if (data.payment_method === 'credit') debitTargetAcc = custAcc;

      lineStmt.run(entryId, debitTargetAcc.id, debitTargetAcc.code, debitTargetAcc.name, entryDesc, totalAmount, 0);
      lineStmt.run(entryId, salesAcc.id, salesAcc.code, salesAcc.name, 'إيراد مبيعات فاتورة ' + invoiceNumber, 0, subtotal);
      if (taxAmount > 0) {
        lineStmt.run(entryId, vatOutputAcc.id, vatOutputAcc.code, vatOutputAcc.name, 'ضريبة قيمة مضافة مخرجات فاتورة ' + invoiceNumber, 0, taxAmount);
      }
    } else {
      // Purchase Entry:
      // Dr: Purchase/COGS Expense (5101) -> subtotal
      // Dr: VAT Input (1104) -> taxAmount (if any)
      // Cr: Payment Account (Cash, Bank, or Payable) -> totalAmount
      let creditTargetAcc = cashAcc;
      if (data.payment_method === 'bank') creditTargetAcc = bankAcc;
      if (data.payment_method === 'credit') creditTargetAcc = suppAcc;

      lineStmt.run(entryId, purchaseAcc.id, purchaseAcc.code, purchaseAcc.name, 'تكلفة مشتريات فاتورة ' + invoiceNumber, subtotal, 0);
      if (taxAmount > 0) {
        lineStmt.run(entryId, vatInputAcc.id, vatInputAcc.code, vatInputAcc.name, 'ضريبة قيمة مضافة مدخلات فاتورة ' + invoiceNumber, taxAmount, 0);
      }
      lineStmt.run(entryId, creditTargetAcc.id, creditTargetAcc.code, creditTargetAcc.name, entryDesc, 0, totalAmount);
    }

    db.exec('COMMIT;');
    return { id: invoiceId, invoice_number: invoiceNumber, journal_entry_id: entryId };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function getInvoices(type = 'sales', limit = 100) {
  const invoices = db.prepare(`
    SELECT * FROM invoices WHERE type = ? ORDER BY invoice_date DESC, id DESC LIMIT ?
  `).all(type, limit);

  for (const inv of invoices) {
    inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(inv.id);
  }
  return invoices;
}

// Vouchers (Receipt & Payment)
function createVoucher(data) {
  // data: { type: 'receipt'|'payment', amount, payment_method: 'cash'|'bank', contact_id, contact_name, target_account_id, description, voucher_date }
  const prefix = data.type === 'receipt' ? 'RV' : 'PV';
  const voucherNumber = data.voucher_number || generateNextNumber(prefix, 'vouchers', 'voucher_number');
  const amount = Number(data.amount);

  if (amount <= 0) {
    throw new Error('مبلغ السند يجب أن يكون أكبر من صفر');
  }

  const targetAcc = db.prepare('SELECT id, code, name FROM accounts WHERE id = ?').get(data.target_account_id);
  if (!targetAcc) throw new Error('الحساب المستهدف غير موجود');

  const cashAcc = db.prepare("SELECT id, code, name FROM accounts WHERE code = '1101'").get();
  const bankAcc = db.prepare("SELECT id, code, name FROM accounts WHERE code = '1102'").get();
  const sourceAcc = data.payment_method === 'bank' ? bankAcc : cashAcc;

  db.exec('BEGIN TRANSACTION;');
  try {
    const vStmt = db.prepare(`
      INSERT INTO vouchers (voucher_number, type, voucher_date, amount, payment_method, contact_id, contact_name, target_account_id, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const vRes = vStmt.run(
      voucherNumber,
      data.type,
      data.voucher_date || new Date().toISOString().split('T')[0],
      amount,
      data.payment_method || 'cash',
      data.contact_id || null,
      data.contact_name || '',
      data.target_account_id,
      data.description || ''
    );
    const voucherId = vRes.lastInsertRowid;

    // Automatic balanced journal entry
    const entryNumber = generateNextNumber('JV', 'journal_entries', 'entry_number');
    const entryDesc = `${data.type === 'receipt' ? 'سند قبض' : 'سند صرف'} رقم ${voucherNumber} - ${data.description || ''}`;

    const entryStmt = db.prepare(`
      INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    const entryRes = entryStmt.run(
      entryNumber,
      data.voucher_date || new Date().toISOString().split('T')[0],
      entryDesc,
      data.type === 'receipt' ? 'receipt_voucher' : 'payment_voucher',
      voucherId
    );
    const entryId = entryRes.lastInsertRowid;

    db.prepare('UPDATE vouchers SET journal_entry_id = ? WHERE id = ?').run(entryId, voucherId);

    const lineStmt = db.prepare(`
      INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    if (data.type === 'receipt') {
      // Dr: Cash/Bank, Cr: Target Account
      lineStmt.run(entryId, sourceAcc.id, sourceAcc.code, sourceAcc.name, entryDesc, amount, 0);
      lineStmt.run(entryId, targetAcc.id, targetAcc.code, targetAcc.name, entryDesc, 0, amount);
    } else {
      // Dr: Target Account, Cr: Cash/Bank
      lineStmt.run(entryId, targetAcc.id, targetAcc.code, targetAcc.name, entryDesc, amount, 0);
      lineStmt.run(entryId, sourceAcc.id, sourceAcc.code, sourceAcc.name, entryDesc, 0, amount);
    }

    db.exec('COMMIT;');
    return { id: voucherId, voucher_number: voucherNumber, journal_entry_id: entryId };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function getVouchers(type = 'receipt', limit = 100) {
  return db.prepare(`
    SELECT v.*, a.name as target_account_name, a.code as target_account_code
    FROM vouchers v
    JOIN accounts a ON a.id = v.target_account_id
    WHERE v.type = ?
    ORDER BY v.voucher_date DESC, v.id DESC
    LIMIT ?
  `).all(type, limit);
}

// Contacts (Customers & Suppliers)
function getContacts(type = null) {
  if (type) {
    return db.prepare('SELECT * FROM contacts WHERE type = ? ORDER BY name ASC').all(type);
  }
  return db.prepare('SELECT * FROM contacts ORDER BY name ASC').all();
}

function createContact(data) {
  const stmt = db.prepare(`
    INSERT INTO contacts (type, name, phone, email, tax_number, address)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(data.type, data.name, data.phone || '', data.email || '', data.tax_number || '', data.address || '');
  return { id: res.lastInsertRowid, ...data };
}

// Reports
// 1. Trial Balance (ميزان المراجعة)
function getTrialBalance() {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY code ASC').all();
  const balances = db.prepare(`
    SELECT account_id,
           SUM(debit) as total_debit,
           SUM(credit) as total_credit
    FROM journal_entry_lines
    GROUP BY account_id
  `).all();

  const balanceMap = {};
  for (const b of balances) {
    balanceMap[b.account_id] = {
      debit: Number(b.total_debit || 0),
      credit: Number(b.total_credit || 0)
    };
  }

  let grandDebit = 0;
  let grandCredit = 0;

  const rows = accounts.map(acc => {
    const b = balanceMap[acc.id] || { debit: 0, credit: 0 };
    const diff = b.debit - b.credit;

    let netDebit = 0;
    let netCredit = 0;

    if (diff > 0) {
      netDebit = diff;
    } else if (diff < 0) {
      netCredit = Math.abs(diff);
    }

    grandDebit += netDebit;
    grandCredit += netCredit;

    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      total_debit: Math.round(b.debit * 100) / 100,
      total_credit: Math.round(b.credit * 100) / 100,
      net_debit: Math.round(netDebit * 100) / 100,
      net_credit: Math.round(netCredit * 100) / 100
    };
  });

  return {
    rows,
    total_debit: Math.round(grandDebit * 100) / 100,
    total_credit: Math.round(grandCredit * 100) / 100,
    is_balanced: Math.abs(grandDebit - grandCredit) < 0.01
  };
}

// 2. General Ledger (دفتر الأستاذ)
function getGeneralLedger(accountId, startDate = null, endDate = null) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) throw new Error('الحساب غير موجود');

  let query = `
    SELECT l.*, j.entry_number, j.entry_date, j.description as entry_desc
    FROM journal_entry_lines l
    JOIN journal_entries j ON j.id = l.entry_id
    WHERE l.account_id = ?
  `;
  const params = [accountId];

  if (startDate) {
    query += ' AND j.entry_date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND j.entry_date <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY j.entry_date ASC, j.id ASC, l.id ASC';

  const lines = db.prepare(query).all(...params);

  let runningBalance = 0;
  const entriesWithBalance = lines.map(line => {
    if (account.nature === 'debit') {
      runningBalance += (line.debit - line.credit);
    } else {
      runningBalance += (line.credit - line.debit);
    }
    return {
      ...line,
      running_balance: Math.round(runningBalance * 100) / 100
    };
  });

  return {
    account,
    lines: entriesWithBalance,
    final_balance: Math.round(runningBalance * 100) / 100
  };
}

// 3. Income Statement (قائمة الدخل / الأرباح والخسائر)
function getIncomeStatement() {
  const accounts = db.prepare("SELECT * FROM accounts WHERE type IN ('revenue', 'expense') ORDER BY code ASC").all();
  const balances = db.prepare(`
    SELECT account_id,
           SUM(debit) as total_debit,
           SUM(credit) as total_credit
    FROM journal_entry_lines
    GROUP BY account_id
  `).all();

  const balanceMap = {};
  for (const b of balances) {
    balanceMap[b.account_id] = {
      debit: Number(b.total_debit || 0),
      credit: Number(b.total_credit || 0)
    };
  }

  let totalRevenues = 0;
  let totalExpenses = 0;

  const revenues = [];
  const expenses = [];

  for (const acc of accounts) {
    const b = balanceMap[acc.id] || { debit: 0, credit: 0 };
    if (acc.type === 'revenue') {
      const net = Math.round((b.credit - b.debit) * 100) / 100;
      totalRevenues += net;
      revenues.push({ ...acc, amount: net });
    } else {
      const net = Math.round((b.debit - b.credit) * 100) / 100;
      totalExpenses += net;
      expenses.push({ ...acc, amount: net });
    }
  }

  totalRevenues = Math.round(totalRevenues * 100) / 100;
  totalExpenses = Math.round(totalExpenses * 100) / 100;
  const netProfit = Math.round((totalRevenues - totalExpenses) * 100) / 100;

  return {
    revenues,
    expenses,
    total_revenues: totalRevenues,
    total_expenses: totalExpenses,
    net_profit: netProfit
  };
}

// 4. Balance Sheet (الميزانية العمومية)
function getBalanceSheet() {
  const accounts = db.prepare("SELECT * FROM accounts WHERE type IN ('asset', 'liability', 'equity') ORDER BY code ASC").all();
  const balances = db.prepare(`
    SELECT account_id,
           SUM(debit) as total_debit,
           SUM(credit) as total_credit
    FROM journal_entry_lines
    GROUP BY account_id
  `).all();

  const balanceMap = {};
  for (const b of balances) {
    balanceMap[b.account_id] = {
      debit: Number(b.total_debit || 0),
      credit: Number(b.total_credit || 0)
    };
  }

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  const assets = [];
  const liabilities = [];
  const equity = [];

  for (const acc of accounts) {
    const b = balanceMap[acc.id] || { debit: 0, credit: 0 };
    if (acc.type === 'asset') {
      const net = Math.round((b.debit - b.credit) * 100) / 100;
      totalAssets += net;
      assets.push({ ...acc, amount: net });
    } else if (acc.type === 'liability') {
      const net = Math.round((b.credit - b.debit) * 100) / 100;
      totalLiabilities += net;
      liabilities.push({ ...acc, amount: net });
    } else if (acc.type === 'equity') {
      const net = Math.round((b.credit - b.debit) * 100) / 100;
      totalEquity += net;
      equity.push({ ...acc, amount: net });
    }
  }

  const incomeStatement = getIncomeStatement();
  const netProfitPeriod = incomeStatement.net_profit;

  totalAssets = Math.round(totalAssets * 100) / 100;
  totalLiabilities = Math.round(totalLiabilities * 100) / 100;
  totalEquity = Math.round((totalEquity + netProfitPeriod) * 100) / 100;
  const totalLiabilitiesAndEquity = Math.round((totalLiabilities + totalEquity) * 100) / 100;

  return {
    assets,
    liabilities,
    equity,
    net_profit_period: netProfitPeriod,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_equity: totalEquity,
    total_liabilities_and_equity: totalLiabilitiesAndEquity,
    is_balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01
  };
}

// 5. Dashboard Summary
function getDashboardSummary() {
  const salesRow = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE type = 'sales'").get();
  const purchaseRow = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE type = 'purchase'").get();

  const cashAcc = db.prepare("SELECT id FROM accounts WHERE code = '1101'").get();
  const bankAcc = db.prepare("SELECT id FROM accounts WHERE code = '1102'").get();
  const custAcc = db.prepare("SELECT id FROM accounts WHERE code = '1103'").get();
  const suppAcc = db.prepare("SELECT id FROM accounts WHERE code = '2101'").get();

  function getAccBalance(id, nature = 'debit') {
    if (!id) return 0;
    const row = db.prepare("SELECT SUM(debit) as d, SUM(credit) as c FROM journal_entry_lines WHERE account_id = ?").get(id);
    const d = Number(row?.d || 0);
    const c = Number(row?.c || 0);
    return nature === 'debit' ? (d - c) : (c - d);
  }

  const income = getIncomeStatement();

  const recentEntries = db.prepare(`
    SELECT j.*, (SELECT SUM(debit) FROM journal_entry_lines WHERE entry_id = j.id) as total_amount
    FROM journal_entries j
    ORDER BY j.entry_date DESC, j.id DESC
    LIMIT 6
  `).all();

  return {
    total_sales: Math.round(salesRow.total * 100) / 100,
    total_purchases: Math.round(purchaseRow.total * 100) / 100,
    net_profit: income.net_profit,
    cash_balance: Math.round(getAccBalance(cashAcc?.id, 'debit') * 100) / 100,
    bank_balance: Math.round(getAccBalance(bankAcc?.id, 'debit') * 100) / 100,
    customers_receivable: Math.round(getAccBalance(custAcc?.id, 'debit') * 100) / 100,
    suppliers_payable: Math.round(getAccBalance(suppAcc?.id, 'credit') * 100) / 100,
    recent_entries: recentEntries
  };
}

// Daily Sheet Functions
function getPriorPerfumeSales(sheetDate) {
  const row = db.prepare(`
    SELECT 
      COALESCE(SUM(
        CASE 
          WHEN items.has_items = 1 THEN (items.credit_sum - items.debit_sum)
          ELSE (COALESCE(s.perfume_credit, 0) - COALESCE(s.perfume_debit, 0))
        END
      ), 0) as total
    FROM daily_sheets s
    LEFT JOIN (
      SELECT 
        sheet_id, 
        1 as has_items,
        COALESCE(SUM(amount2), 0) as credit_sum,
        COALESCE(SUM(amount1), 0) as debit_sum
      FROM daily_sheet_items
      WHERE category IN ('perfume_sale', 'perfume_sales')
      GROUP BY sheet_id
    ) items ON items.sheet_id = s.id
    WHERE s.sheet_date < ?
  `).get(sheetDate);

  return Math.round(Number(row?.total || 0) * 100) / 100;
}

function getPriorUndepositedCash(sheetDate) {
  const row = db.prepare(`
    SELECT 
      COALESCE(SUM(
        (COALESCE(s.sales_cash, 0) + COALESCE(s.sales_delivery, 0) + COALESCE(item_agg.extra_rev, 0))
        - (COALESCE(item_agg.total_expenses, 0) + CASE WHEN item_agg.perfume_credit > 0 THEN item_agg.perfume_credit ELSE COALESCE(s.perfume_credit, 0) END)
        - (COALESCE(s.deposit_personal, 0) + COALESCE(s.deposit_business, 0))
      ), 0) as total_undeposited
    FROM daily_sheets s
    LEFT JOIN (
      SELECT 
        sheet_id,
        COALESCE(SUM(CASE WHEN category IN ('internal_expense', 'internal_expenses', 'employee_advance', 'employee_advances', 'supplier_payment', 'supplier_payments', 'cash_purchase', 'cash_purchases') THEN amount1 ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN category IN ('extra_revenue', 'extra_revenues') THEN amount1 ELSE 0 END), 0) as extra_rev,
        COALESCE(SUM(CASE WHEN category IN ('perfume_sale', 'perfume_sales') THEN amount2 ELSE 0 END), 0) as perfume_credit
      FROM daily_sheet_items
      GROUP BY sheet_id
    ) item_agg ON item_agg.sheet_id = s.id
    WHERE s.sheet_date < ?
  `).get(sheetDate);

  return Math.round(Number(row?.total_undeposited || 0) * 100) / 100;
}

function getCumulativeStats(sheetDate) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN sheet_date <= ? THEN (sales_cash + sales_delivery + sales_visa + sales_ittihad + sales_ittihad_qr + sales_cliq) ELSE 0 END), 0) as cum_sales,
      COALESCE(SUM(CASE WHEN sheet_date <= ? THEN sales_items_count ELSE 0 END), 0) as cum_items,
      COALESCE(SUM(sales_cash + sales_delivery + sales_visa + sales_ittihad + sales_ittihad_qr + sales_cliq), 0) as year_sales,
      COALESCE(SUM(sales_items_count), 0) as year_items
    FROM daily_sheets
  `).get(sheetDate, sheetDate);

  return {
    cum_sales: Math.round(Number(row?.cum_sales || 0) * 100) / 100,
    cum_items: Number(row?.cum_items || 0),
    year_sales: Math.round(Number(row?.year_sales || 0) * 100) / 100,
    year_items: Number(row?.year_items || 0)
  };
}

function getDailySheet(sheetDate) {
  let sheet = db.prepare('SELECT * FROM daily_sheets WHERE sheet_date = ?').get(sheetDate);
  const priorUndeposited = getPriorUndepositedCash(sheetDate);
  const priorPerfume = getPriorPerfumeSales(sheetDate);
  const cumStats = getCumulativeStats(sheetDate);
  if (!sheet) {
    // Return empty template with default day name
    const dateObj = new Date(sheetDate + 'T00:00:00');
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayName = !isNaN(dateObj) ? dayNames[dateObj.getDay()] : '';
    return {
      sheet_date: sheetDate,
      day_name: dayName,
      prior_undeposited_cash: priorUndeposited,
      prior_perfume_sales: priorPerfume,
      cum_stats: cumStats,
      sales_cash: 0,
      sales_delivery: 0,
      sales_visa: 0,
      sales_ittihad: 0,
      sales_ittihad_qr: 0,
      sales_cliq: 0,
      sales_items_count: 0,
      deposit_personal: 0,
      deposit_business: 0,
      deposit_personal_date: sheetDate,
      deposit_business_date: sheetDate,
      notes: '',
      perfume_desc: '',
      perfume_debit: 0,
      perfume_credit: 0,
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
  }

  const items = db.prepare('SELECT * FROM daily_sheet_items WHERE sheet_id = ? ORDER BY id ASC').all(sheet.id);

  const categorizedItems = {
    internal_expenses: items.filter(i => i.category === 'internal_expense'),
    employee_advances: items.filter(i => i.category === 'employee_advance'),
    supplier_payments: items.filter(i => i.category === 'supplier_payment'),
    cash_purchases: items.filter(i => i.category === 'cash_purchase'),
    perfume_sales: items.filter(i => i.category === 'perfume_sale'),
    daily_obligations: items.filter(i => i.category === 'daily_obligation'),
    merchant_dispatches: items.filter(i => i.category === 'merchant_dispatch'),
    employee_sales: items.filter(i => i.category === 'employee_sale'),
    extra_revenues: items.filter(i => i.category === 'extra_revenue'),
    revenue_expenses: items.filter(i => i.category === 'revenue_expense'),
    daily_notes: items.filter(i => i.category === 'daily_note')
  };

  return {
    ...sheet,
    prior_undeposited_cash: priorUndeposited,
    prior_perfume_sales: priorPerfume,
    cum_stats: cumStats,
    items: categorizedItems
  };
}

function saveDailySheet(data) {
  // data: { sheet_date, day_name, sales_cash, ..., items: { ... } }
  db.exec('BEGIN TRANSACTION;');
  try {
    let sheet = db.prepare('SELECT id FROM daily_sheets WHERE sheet_date = ?').get(data.sheet_date);
    let sheetId;

    if (sheet) {
      sheetId = sheet.id;
      db.prepare(`
        UPDATE daily_sheets SET
          day_name = ?,
          sales_cash = ?,
          sales_delivery = ?,
          sales_visa = ?,
          sales_ittihad = ?,
          sales_ittihad_qr = ?,
          sales_cliq = ?,
          sales_items_count = ?,
          deposit_personal = ?,
          deposit_business = ?,
          deposit_personal_date = ?,
          deposit_business_date = ?,
          notes = ?,
          perfume_desc = ?,
          perfume_debit = ?,
          perfume_credit = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        data.day_name || '',
        Number(data.sales_cash || 0),
        Number(data.sales_delivery || 0),
        Number(data.sales_visa || 0),
        Number(data.sales_ittihad || 0),
        Number(data.sales_ittihad_qr || 0),
        Number(data.sales_cliq || 0),
        Number(data.sales_items_count || 0),
        Number(data.deposit_personal || 0),
        Number(data.deposit_business || 0),
        data.deposit_personal_date || '',
        data.deposit_business_date || '',
        data.notes || '',
        data.perfume_desc || '',
        Number(data.perfume_debit || 0),
        Number(data.perfume_credit || 0),
        sheetId
      );

      // Remove existing items to overwrite
      db.prepare('DELETE FROM daily_sheet_items WHERE sheet_id = ?').run(sheetId);
    } else {
      const res = db.prepare(`
        INSERT INTO daily_sheets (
          sheet_date, day_name, sales_cash, sales_delivery, sales_visa,
          sales_ittihad, sales_ittihad_qr, sales_cliq, sales_items_count,
          deposit_personal, deposit_business, deposit_personal_date, deposit_business_date,
          notes, perfume_desc, perfume_debit, perfume_credit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.sheet_date,
        data.day_name || '',
        Number(data.sales_cash || 0),
        Number(data.sales_delivery || 0),
        Number(data.sales_visa || 0),
        Number(data.sales_ittihad || 0),
        Number(data.sales_ittihad_qr || 0),
        Number(data.sales_cliq || 0),
        Number(data.sales_items_count || 0),
        Number(data.deposit_personal || 0),
        Number(data.deposit_business || 0),
        data.deposit_personal_date || '',
        data.deposit_business_date || '',
        data.notes || '',
        data.perfume_desc || '',
        Number(data.perfume_debit || 0),
        Number(data.perfume_credit || 0)
      );
      sheetId = res.lastInsertRowid;
    }

    const insertItemStmt = db.prepare(`
      INSERT INTO daily_sheet_items (sheet_id, category, col1, col2, col3, col4, col5, amount1, amount2)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Insert all categorized items
    const categories = [
      'internal_expenses',
      'employee_advances',
      'supplier_payments',
      'cash_purchases',
      'perfume_sales',
      'daily_obligations',
      'merchant_dispatches',
      'employee_sales',
      'extra_revenues',
      'revenue_expenses',
      'daily_notes'
    ];

    const categorySingularMap = {
      internal_expenses: 'internal_expense',
      employee_advances: 'employee_advance',
      supplier_payments: 'supplier_payment',
      cash_purchases: 'cash_purchase',
      perfume_sales: 'perfume_sale',
      daily_obligations: 'daily_obligation',
      merchant_dispatches: 'merchant_dispatch',
      employee_sales: 'employee_sale',
      extra_revenues: 'extra_revenue',
      revenue_expenses: 'revenue_expense',
      daily_notes: 'daily_note'
    };

    if (data.items) {
      for (const cat of categories) {
        const list = data.items[cat] || [];
        const singular = categorySingularMap[cat];
        for (const it of list) {
          // ignore completely blank items
          if (!it.col1 && !it.col2 && !it.col3 && !it.col4 && !it.col5 && !it.amount1 && !it.amount2) {
            continue;
          }
          insertItemStmt.run(
            sheetId,
            singular,
            it.col1 || '',
            it.col2 || '',
            it.col3 || '',
            it.col4 || '',
            it.col5 || '',
            Number(it.amount1 || 0),
            Number(it.amount2 || 0)
          );
        }
      }
    }

    db.exec('COMMIT;');
    return getDailySheet(data.sheet_date);
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function getDailySheetsHistory(limit = 500) {
  return db.prepare(`
    SELECT
      s.id,
      s.sheet_date,
      s.day_name,
      (s.sales_cash + s.sales_delivery + s.sales_visa + s.sales_ittihad + s.sales_ittihad_qr + s.sales_cliq) as total_sales,
      s.sales_items_count,
      (s.deposit_personal + s.deposit_business) as total_deposits,
      (
        SELECT COALESCE(SUM(amount1), 0)
        FROM daily_sheet_items
        WHERE sheet_id = s.id AND category IN ('internal_expense', 'cash_purchase')
      ) as total_expenses,
      s.updated_at
    FROM daily_sheets s
    ORDER BY s.sheet_date DESC
    LIMIT ?
  `).all(limit);
}

// Clear all daily sheets and items (تفريغ جميع حقول دفتر اليومية لجميع الأيام)
function clearAllDailySheets() {
  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare('DELETE FROM daily_sheet_items').run();
    db.prepare('DELETE FROM daily_sheets').run();
    db.exec('COMMIT;');
    return { success: true, message: 'تم تفريغ جميع حقول وسجلات دفاتر اليومية بنجاح' };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

// Seed sample module data if empty
function seedModuleData() {
  const checkCount = db.prepare('SELECT COUNT(*) as count FROM checks').get().count;
  if (checkCount === 0) {
    db.prepare(`
      INSERT INTO checks (check_number, type, party_name, bank_name, due_date, amount, status, notes)
      VALUES 
      ('CHK-10021', 'incoming', 'مؤسسة النور للتجارة', 'بنك الاتحاد', '2026-11-25', 1500, 'pending', 'دفعة توريد بضاعة'),
      ('CHK-10022', 'outgoing', 'شركة التوريدات العالمية', 'البنك العربي', '2026-11-30', 2300, 'pending', 'سداد فاتورة مشتريات')
    `).run();
  }

  const partnerCount = db.prepare('SELECT COUNT(*) as count FROM partners').get().count;
  if (partnerCount === 0) {
    db.prepare(`
      INSERT INTO partners (name, share_percentage, capital, drawings, phone, notes)
      VALUES 
      ('نديم (شريك مؤسس ومدير)', 50, 50000, 3200, '0791234567', 'الحصة التشغيلية والإدارية'),
      ('شريك ممول رئيسي', 50, 50000, 1500, '0799876543', 'الحصة التمويلية والرأسمالية')
    `).run();
  }

  const investCount = db.prepare('SELECT COUNT(*) as count FROM investments').get().count;
  if (investCount === 0) {
    db.prepare(`
      INSERT INTO investments (title, category, initial_amount, current_value, returns, start_date, status, notes)
      VALUES 
      ('توسعة وتجهيز الفرع الجديد', 'توسع أعمال وتجهيزات', 15000, 18500, 3500, '2026-06-01', 'active', 'تجهيزات ديكور وبضاعة أولية')
    `).run();
  }

  const importCount = db.prepare('SELECT COUNT(*) as count FROM imports').get().count;
  if (importCount === 0) {
    db.prepare(`
      INSERT INTO imports (shipment_number, supplier_name, item_description, quantity, goods_cost, shipping_customs_cost, total_cost, arrival_date, status, notes)
      VALUES 
      ('SHP-2026-08', 'شركة العطور الفرنسية Parfums Paris', 'زيوت عطرية وزجاجات فاخرة', 250, 4200, 650, 4850, '2026-11-28', 'customs', 'في مرحلة التخليص الجمركي')
    `).run();
  }

  const empCount = db.prepare('SELECT COUNT(*) as count FROM employees').get().count;
  if (empCount === 0) {
    db.prepare(`
      INSERT INTO employees (employee_id, name, job_title, phone, salary, hire_date, notes)
      VALUES 
      ('EMP-001', 'أحمد سامي', 'مسؤول مبيعات', '0781112233', 450, '2026-01-15', 'دوام كامل'),
      ('EMP-002', 'عمر خالد', 'كاشير ومبيعات', '0782223344', 400, '2026-03-01', 'دوام كامل')
    `).run();
  }
}

// 1. Sales Summary & Logs (المبيعات)
function getSalesSummary() {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(sales_cash), 0) as cash,
      COALESCE(SUM(sales_delivery), 0) as delivery,
      COALESCE(SUM(sales_visa), 0) as visa,
      COALESCE(SUM(sales_ittihad), 0) as ittihad,
      COALESCE(SUM(sales_ittihad_qr), 0) as ittihad_qr,
      COALESCE(SUM(sales_cliq), 0) as cliq,
      COALESCE(SUM(sales_items_count), 0) as items_count,
      COALESCE(SUM(perfume_credit), 0) as perfume_credit
    FROM daily_sheets
  `).get();

  const perfumeItems = db.prepare(`
    SELECT COALESCE(SUM(amount2), 0) as total_perfume
    FROM daily_sheet_items
    WHERE category = 'perfume_sale'
  `).get();

  const perfumeTotal = Math.max(totals.perfume_credit, perfumeItems ? perfumeItems.total_perfume : 0);
  const grandTotal = totals.cash + totals.delivery + totals.visa + totals.ittihad + totals.ittihad_qr + totals.cliq + perfumeTotal;

  const history = db.prepare(`
    SELECT
      s.id,
      s.sheet_date,
      s.day_name,
      COALESCE(s.sales_cash, 0) as sales_cash,
      COALESCE(s.sales_delivery, 0) as sales_delivery,
      COALESCE(s.sales_visa, 0) as sales_visa,
      COALESCE(s.sales_ittihad, 0) as sales_ittihad,
      COALESCE(s.sales_ittihad_qr, 0) as sales_ittihad_qr,
      COALESCE(s.sales_cliq, 0) as sales_cliq,
      (COALESCE(s.sales_cash, 0) + COALESCE(s.sales_delivery, 0) + COALESCE(s.sales_visa, 0) + COALESCE(s.sales_ittihad, 0) + COALESCE(s.sales_ittihad_qr, 0) + COALESCE(s.sales_cliq, 0)) as day_total,
      s.sales_items_count,
      COALESCE(NULLIF(s.notes, ''), (
        SELECT GROUP_CONCAT(col1, ' | ')
        FROM daily_sheet_items
        WHERE sheet_id = s.id AND category = 'daily_note'
      ), '') as notes
    FROM daily_sheets s
    ORDER BY s.sheet_date ASC
  `).all();

  return {
    grand_total: Math.round(grandTotal * 100) / 100,
    channels: {
      cash: Math.round(totals.cash * 100) / 100,
      delivery: Math.round(totals.delivery * 100) / 100,
      visa: Math.round(totals.visa * 100) / 100,
      ittihad: Math.round(totals.ittihad * 100) / 100,
      ittihad_qr: Math.round(totals.ittihad_qr * 100) / 100,
      cliq: Math.round(totals.cliq * 100) / 100,
      perfumes: Math.round(perfumeTotal * 100) / 100,
      items_count: totals.items_count
    },
    history
  };
}

// 2. Expenses Summary & Logs (المصاريف)
function getExpensesSummary() {
  const internal = db.prepare(`SELECT COALESCE(SUM(amount1), 0) as total FROM daily_sheet_items WHERE category = 'internal_expense'`).get().total;
  const advances = db.prepare(`SELECT COALESCE(SUM(amount1), 0) as total FROM daily_sheet_items WHERE category = 'employee_advance'`).get().total;
  const payouts = db.prepare(`SELECT COALESCE(SUM(amount1), 0) as total FROM daily_sheet_items WHERE category = 'supplier_payment'`).get().total;
  const purchases = db.prepare(`SELECT COALESCE(SUM(amount1), 0) as total FROM daily_sheet_items WHERE category = 'cash_purchase'`).get().total;

  const grandTotal = internal + advances + payouts + purchases;

  const items = db.prepare(`
    SELECT i.id, i.category, i.col1 as description, i.amount1 as amount, s.sheet_date, s.day_name
    FROM daily_sheet_items i
    JOIN daily_sheets s ON s.id = i.sheet_id
    WHERE i.category IN ('internal_expense', 'employee_advance', 'supplier_payment', 'cash_purchase')
    ORDER BY s.sheet_date DESC, i.id DESC
    LIMIT 100
  `).all();

  return {
    grand_total: Math.round(grandTotal * 100) / 100,
    categories: {
      internal_expenses: Math.round(internal * 100) / 100,
      employee_advances: Math.round(advances * 100) / 100,
      supplier_payments: Math.round(payouts * 100) / 100,
      cash_purchases: Math.round(purchases * 100) / 100
    },
    items
  };
}

// 3. Suppliers (الموردون)
function getSuppliersList() {
  const suppliers = db.prepare(`SELECT * FROM contacts WHERE type = 'supplier' ORDER BY id DESC`).all();
  return suppliers.map(s => {
    const paymentRow = db.prepare(`
      SELECT COALESCE(SUM(amount1), 0) as total_paid
      FROM daily_sheet_items
      WHERE category = 'supplier_payment' AND (col1 LIKE ? OR col1 LIKE ?)
    `).get(`%${s.name}%`, s.name);
    return {
      ...s,
      total_paid: paymentRow ? Number(paymentRow.total_paid) : 0
    };
  });
}

function createSupplier(data) {
  const stmt = db.prepare(`
    INSERT INTO contacts (type, name, phone, email, tax_number, address)
    VALUES ('supplier', ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(data.name, data.phone || '', data.email || '', data.tax_number || '', data.address || '');
  return { id: res.lastInsertRowid, ...data };
}

function deleteSupplier(id) {
  db.prepare(`DELETE FROM contacts WHERE id = ? AND type = 'supplier'`).run(id);
  return { success: true };
}

// 4. Employees (الموظفون)
function getEmployeesList() {
  const employees = db.prepare(`SELECT * FROM employees ORDER BY id DESC`).all();
  return employees.map(e => {
    const salesRow = db.prepare(`
      SELECT COALESCE(SUM(amount1), 0) as total_sales
      FROM daily_sheet_items
      WHERE category = 'employee_sale' AND (col1 LIKE ? OR col2 LIKE ?)
    `).get(`%${e.name}%`, `%${e.employee_id}%`);

    const advancesRow = db.prepare(`
      SELECT COALESCE(SUM(amount1), 0) as total_advances
      FROM daily_sheet_items
      WHERE category = 'employee_advance' AND (col1 LIKE ? OR col1 LIKE ?)
    `).get(`%${e.name}%`, `%${e.employee_id}%`);

    const totSales = salesRow ? Number(salesRow.total_sales) : 0;
    const totAdv = advancesRow ? Number(advancesRow.total_advances) : 0;

    return {
      ...e,
      total_sales: totSales,
      total_advances: totAdv,
      net_balance: (e.salary || 0) - totAdv
    };
  });
}

function createEmployee(data) {
  const empId = data.employee_id || `EMP-${Date.now().toString().slice(-4)}`;
  const stmt = db.prepare(`
    INSERT INTO employees (employee_id, name, job_title, phone, salary, hire_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    empId,
    data.name,
    data.job_title || 'موظف مبيعات',
    data.phone || '',
    Number(data.salary || 0),
    data.hire_date || new Date().toISOString().split('T')[0],
    data.notes || ''
  );
  return { id: res.lastInsertRowid, employee_id: empId, ...data };
}

function deleteEmployee(id) {
  db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  return { success: true };
}

// 5. Receivables & Payables (الذمم)
function getReceivablesSummary() {
  const customers = db.prepare(`SELECT * FROM contacts WHERE type = 'customer' ORDER BY id DESC`).all();
  const suppliers = db.prepare(`SELECT * FROM contacts WHERE type = 'supplier' ORDER BY id DESC`).all();

  const custInvoices = db.prepare(`
    SELECT contact_id, SUM(total_amount) as total
    FROM invoices WHERE type = 'sales' AND payment_method = 'credit'
    GROUP BY contact_id
  `).all();
  const custMap = {};
  for (const c of custInvoices) custMap[c.contact_id] = Number(c.total || 0);

  const suppInvoices = db.prepare(`
    SELECT contact_id, SUM(total_amount) as total
    FROM invoices WHERE type = 'purchase' AND payment_method = 'credit'
    GROUP BY contact_id
  `).all();
  const suppMap = {};
  for (const s of suppInvoices) suppMap[s.contact_id] = Number(s.total || 0);

  let totalReceivable = 0;
  const customerList = customers.map(c => {
    const bal = custMap[c.id] || 0;
    totalReceivable += bal;
    return { ...c, balance: bal };
  });

  let totalPayable = 0;
  const supplierList = suppliers.map(s => {
    const bal = suppMap[s.id] || 0;
    totalPayable += bal;
    return { ...s, balance: bal };
  });

  return {
    total_receivable: Math.round(totalReceivable * 100) / 100,
    total_payable: Math.round(totalPayable * 100) / 100,
    net_receivable: Math.round((totalReceivable - totalPayable) * 100) / 100,
    customers: customerList,
    suppliers: supplierList
  };
}

// 6. Checks (الشيكات)
function getChecksList() {
  return db.prepare('SELECT * FROM checks ORDER BY due_date ASC, id DESC').all();
}

function createCheck(data) {
  const stmt = db.prepare(`
    INSERT INTO checks (check_number, type, party_name, bank_name, due_date, amount, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    data.check_number,
    data.type || 'incoming',
    data.party_name,
    data.bank_name || '',
    data.due_date,
    Number(data.amount || 0),
    data.status || 'pending',
    data.notes || ''
  );
  return { id: res.lastInsertRowid, ...data };
}

function updateCheckStatus(id, status) {
  db.prepare('UPDATE checks SET status = ? WHERE id = ?').run(status, id);
  return { success: true };
}

function deleteCheck(id) {
  db.prepare('DELETE FROM checks WHERE id = ?').run(id);
  return { success: true };
}

// 7. Partners (الشركاء)
function getPartnersList() {
  return db.prepare('SELECT * FROM partners ORDER BY id ASC').all();
}

function createPartner(data) {
  const stmt = db.prepare(`
    INSERT INTO partners (name, share_percentage, capital, drawings, phone, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    data.name,
    Number(data.share_percentage || 0),
    Number(data.capital || 0),
    Number(data.drawings || 0),
    data.phone || '',
    data.notes || ''
  );
  return { id: res.lastInsertRowid, ...data };
}

function deletePartner(id) {
  db.prepare('DELETE FROM partners WHERE id = ?').run(id);
  return { success: true };
}

// 8. Investments (الاستثمار)
function getInvestmentsList() {
  return db.prepare('SELECT * FROM investments ORDER BY id DESC').all();
}

function createInvestment(data) {
  const stmt = db.prepare(`
    INSERT INTO investments (title, category, initial_amount, current_value, returns, start_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    data.title,
    data.category || 'تطوير أعمال',
    Number(data.initial_amount || 0),
    Number(data.current_value || data.initial_amount || 0),
    Number(data.returns || 0),
    data.start_date || new Date().toISOString().split('T')[0],
    data.status || 'active',
    data.notes || ''
  );
  return { id: res.lastInsertRowid, ...data };
}

function deleteInvestment(id) {
  db.prepare('DELETE FROM investments WHERE id = ?').run(id);
  return { success: true };
}

// 9. Imports (ادارة الواردات)
function getImportsList() {
  return db.prepare('SELECT * FROM imports ORDER BY id DESC').all();
}

function createImport(data) {
  const goodsCost = Number(data.goods_cost || 0);
  const shipCost = Number(data.shipping_customs_cost || 0);
  const totalCost = Number(data.total_cost || (goodsCost + shipCost));

  const stmt = db.prepare(`
    INSERT INTO imports (shipment_number, supplier_name, item_description, quantity, goods_cost, shipping_customs_cost, total_cost, arrival_date, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    data.shipment_number,
    data.supplier_name,
    data.item_description || '',
    Number(data.quantity || 1),
    goodsCost,
    shipCost,
    totalCost,
    data.arrival_date || '',
    data.status || 'in_transit',
    data.notes || ''
  );
  return { id: res.lastInsertRowid, total_cost: totalCost, ...data };
}

function deleteImport(id) {
  db.prepare('DELETE FROM imports WHERE id = ?').run(id);
  return { success: true };
}

// 10. Profit & Loss Statement (الارباح و الخسائر)
function getProfitLossStatement() {
  const salesRow = db.prepare(`
    SELECT
      COALESCE(SUM(sales_cash + sales_delivery + sales_visa + sales_ittihad + sales_ittihad_qr + sales_cliq), 0) as total_sales,
      COALESCE(SUM(perfume_credit), 0) as perfume_sales
    FROM daily_sheets
  `).get();

  const extraRevRow = db.prepare(`
    SELECT COALESCE(SUM(amount1), 0) as total
    FROM daily_sheet_items WHERE category = 'extra_revenue'
  `).get();

  const perfumeItems = db.prepare(`
    SELECT COALESCE(SUM(amount2), 0) as credit_sum, COALESCE(SUM(amount1), 0) as debit_sum
    FROM daily_sheet_items WHERE category = 'perfume_sale'
  `).get();

  const totalPerfumes = perfumeItems ? (perfumeItems.credit_sum - perfumeItems.debit_sum) : salesRow.perfume_sales;
  const totalRevenues = (salesRow.total_sales || 0) + (extraRevRow ? extraRevRow.total : 0) + Math.max(0, totalPerfumes);

  const purchasesRow = db.prepare(`
    SELECT COALESCE(SUM(amount1), 0) as total
    FROM daily_sheet_items WHERE category = 'cash_purchase'
  `).get();

  const importsRow = db.prepare(`
    SELECT COALESCE(SUM(total_cost), 0) as total
    FROM imports WHERE status = 'completed'
  `).get();

  const costOfGoods = (purchasesRow ? purchasesRow.total : 0) + (importsRow ? importsRow.total : 0);
  const grossProfit = totalRevenues - costOfGoods;

  const internalExp = db.prepare(`SELECT COALESCE(SUM(amount1), 0) as total FROM daily_sheet_items WHERE category = 'internal_expense'`).get().total;
  const employeeExp = db.prepare(`SELECT COALESCE(SUM(amount1), 0) as total FROM daily_sheet_items WHERE category = 'employee_advance'`).get().total;
  const otherExp = db.prepare(`SELECT COALESCE(SUM(amount1), 0) as total FROM daily_sheet_items WHERE category = 'revenue_expense'`).get().total;

  const totalExpenses = internalExp + employeeExp + otherExp;
  const netProfit = grossProfit - totalExpenses;

  return {
    total_revenues: Math.round(totalRevenues * 100) / 100,
    cost_of_goods: Math.round(costOfGoods * 100) / 100,
    gross_profit: Math.round(grossProfit * 100) / 100,
    operating_expenses: Math.round(totalExpenses * 100) / 100,
    net_profit: Math.round(netProfit * 100) / 100,
    profit_margin: totalRevenues > 0 ? Math.round((netProfit / totalRevenues) * 1000) / 10 : 0,
    breakdown: {
      sales_channels: Math.round((salesRow.total_sales || 0) * 100) / 100,
      perfumes: Math.round(totalPerfumes * 100) / 100,
      extra_revenues: Math.round((extraRevRow ? extraRevRow.total : 0) * 100) / 100,
      cash_purchases: Math.round((purchasesRow ? purchasesRow.total : 0) * 100) / 100,
      internal_expenses: Math.round(internalExp * 100) / 100,
      employee_expenses: Math.round(employeeExp * 100) / 100,
      other_expenses: Math.round(otherExp * 100) / 100
    }
  };
}

// Initialize on module load
initSchema();

module.exports = {
  db,
  getAccounts,
  createAccount,
  createJournalEntry,
  getJournalEntries,
  createInvoice,
  getInvoices,
  createVoucher,
  getVouchers,
  getContacts,
  createContact,
  getTrialBalance,
  getGeneralLedger,
  getIncomeStatement,
  getBalanceSheet,
  getDashboardSummary,
  getDailySheet,
  saveDailySheet,
  getDailySheetsHistory,
  getCumulativeStats,
  getPriorUndepositedCash,
  getPriorPerfumeSales,
  clearAllDailySheets,
  getSalesSummary,
  getExpensesSummary,
  getSuppliersList,
  createSupplier,
  deleteSupplier,
  getEmployeesList,
  createEmployee,
  deleteEmployee,
  getReceivablesSummary,
  getChecksList,
  createCheck,
  updateCheckStatus,
  deleteCheck,
  getPartnersList,
  createPartner,
  deletePartner,
  getInvestmentsList,
  createInvestment,
  deleteInvestment,
  getImportsList,
  createImport,
  deleteImport,
  getProfitLossStatement,
  seedHistoricalSales
};
