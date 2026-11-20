/**
 * db-pg.js - المحرك السحابي لقاعدة بيانات Supabase (PostgreSQL)
 * يوفر استدامة كاملة وحفظاً دائماً لبيانات المحاسبة ودفتر اليومية بدون أي فقدان.
 */

const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

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

const SUPABASE_DEFAULT_URL = '';
const DATABASE_URL = sanitizeDatabaseUrl(process.env.DATABASE_URL || process.env.SUPABASE_URL || SUPABASE_DEFAULT_URL);

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is missing for PostgreSQL driver');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: process.env.AWS_LAMBDA_FUNCTION_NAME ? 3 : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Supabase PostgreSQL client:', err);
});

// Helper: Convert SQLite '?' placeholders to PostgreSQL '$1', '$2', ...
function toPg(sql) {
  let paramIndex = 1;
  let pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
  // Replace SQLite GROUP_CONCAT with PostgreSQL STRING_AGG
  pgSql = pgSql.replace(/GROUP_CONCAT\(([^,]+),\s*([^)]+)\)/gi, 'STRING_AGG($1, $2)');
  return pgSql;
}

// Database Operations Helpers
async function get(sql, params = []) {
  const pgSql = toPg(sql);
  const res = await pool.query(pgSql, params);
  return res.rows[0] || null;
}

async function all(sql, params = []) {
  const pgSql = toPg(sql);
  const res = await pool.query(pgSql, params);
  return res.rows;
}

async function run(sql, params = []) {
  let pgSql = toPg(sql);
  const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
  if (isInsert && !/RETURNING/i.test(pgSql)) {
    pgSql += ' RETURNING id';
  }
  const res = await pool.query(pgSql, params);
  return {
    lastInsertRowid: res.rows[0] ? res.rows[0].id : null,
    changes: res.rowCount
  };
}

async function exec(sql) {
  return await pool.query(sql);
}

// Execute operations in a safe PostgreSQL transaction
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      get: async (sql, params = []) => {
        const res = await client.query(toPg(sql), params);
        return res.rows[0] || null;
      },
      all: async (sql, params = []) => {
        const res = await client.query(toPg(sql), params);
        return res.rows;
      },
      run: async (sql, params = []) => {
        let pgSql = toPg(sql);
        if (/^\s*INSERT\s+INTO/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
          pgSql += ' RETURNING id';
        }
        const res = await client.query(pgSql, params);
        return {
          lastInsertRowid: res.rows[0] ? res.rows[0].id : null,
          changes: res.rowCount
        };
      },
      exec: async (sql) => client.query(sql)
    };
    const result = await callback(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Auto Initialize PostgreSQL Schema
let schemaInitialized = false;
async function initSchema() {
  if (schemaInitialized || process.env.SKIP_SCHEMA_INIT === '1') return;
  try {
    await exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        nature TEXT NOT NULL,
        parent_code TEXT,
        description TEXT,
        is_system INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        tax_number TEXT,
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS journal_entries (
        id SERIAL PRIMARY KEY,
        entry_number TEXT UNIQUE NOT NULL,
        entry_date TEXT NOT NULL,
        description TEXT,
        reference_type TEXT,
        reference_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS journal_entry_lines (
        id SERIAL PRIMARY KEY,
        entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        account_code TEXT NOT NULL,
        account_name TEXT NOT NULL,
        description TEXT,
        debit REAL DEFAULT 0,
        credit REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        contact_id INTEGER REFERENCES contacts(id),
        contact_name TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        subtotal REAL NOT NULL,
        tax_amount REAL NOT NULL,
        total_amount REAL NOT NULL,
        notes TEXT,
        journal_entry_id INTEGER REFERENCES journal_entries(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        tax_rate REAL DEFAULT 15,
        tax_amount REAL NOT NULL,
        total REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vouchers (
        id SERIAL PRIMARY KEY,
        voucher_number TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        voucher_date TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        contact_id INTEGER REFERENCES contacts(id),
        contact_name TEXT,
        target_account_id INTEGER NOT NULL REFERENCES accounts(id),
        description TEXT,
        journal_entry_id INTEGER REFERENCES journal_entries(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS daily_sheets (
        id SERIAL PRIMARY KEY,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS daily_sheet_items (
        id SERIAL PRIMARY KEY,
        sheet_id INTEGER NOT NULL REFERENCES daily_sheets(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        col1 TEXT,
        col2 TEXT,
        col3 TEXT,
        col4 TEXT,
        col5 TEXT,
        amount1 REAL DEFAULT 0,
        amount2 REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_pg_daily_sheets_sheet_date ON daily_sheets(sheet_date);
      CREATE INDEX IF NOT EXISTS idx_pg_daily_sheet_items_sheet_id ON daily_sheet_items(sheet_id);
      CREATE INDEX IF NOT EXISTS idx_pg_daily_sheet_items_category ON daily_sheet_items(category);

      CREATE TABLE IF NOT EXISTS checks (
        id SERIAL PRIMARY KEY,
        check_number TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL DEFAULT 'incoming',
        party_name TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        due_date TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS partners (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        share_percentage REAL DEFAULT 0,
        capital REAL DEFAULT 0,
        drawings REAL DEFAULT 0,
        phone TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS investments (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'تطوير وتوسع',
        initial_amount REAL NOT NULL,
        current_value REAL DEFAULT 0,
        returns REAL DEFAULT 0,
        start_date TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS imports (
        id SERIAL PRIMARY KEY,
        shipment_number TEXT UNIQUE NOT NULL,
        supplier_name TEXT NOT NULL,
        item_description TEXT NOT NULL,
        quantity REAL DEFAULT 1,
        goods_cost REAL NOT NULL,
        shipping_customs_cost REAL DEFAULT 0,
        total_cost REAL NOT NULL,
        arrival_date TEXT,
        status TEXT DEFAULT 'in_transit',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        employee_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        job_title TEXT DEFAULT 'موظف مبيعات',
        phone TEXT,
        salary REAL DEFAULT 0,
        hire_date TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS media_assets (
        id SERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL DEFAULT 'product',
        entity_id TEXT DEFAULT '',
        title TEXT DEFAULT '',
        mime_type TEXT DEFAULT 'image/webp',
        original_size INTEGER DEFAULT 0,
        compressed_size INTEGER DEFAULT 0,
        compression_ratio REAL DEFAULT 0,
        width INTEGER DEFAULT 0,
        height INTEGER DEFAULT 0,
        thumb_data TEXT DEFAULT '',
        image_data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_media_entity ON media_assets (entity_type, entity_id);
    `);

    try {
      await exec(`
        ALTER TABLE daily_sheets ADD COLUMN IF NOT EXISTS sales_items_count INTEGER DEFAULT 0;
        ALTER TABLE daily_sheets ADD COLUMN IF NOT EXISTS deposit_personal_date TEXT DEFAULT '';
        ALTER TABLE daily_sheets ADD COLUMN IF NOT EXISTS deposit_business_date TEXT DEFAULT '';
      `);
    } catch (migErr) {
      console.warn('PostgreSQL column migration note:', migErr.message);
    }

    await seedDefaultAccounts();
    await seedModuleData();
    await seedHistoricalSales();
    schemaInitialized = true;
    console.log('✅ [Supabase PostgreSQL] All tables and schemas initialized successfully!');
  } catch (err) {
    console.error('❌ [Supabase PostgreSQL] Schema initialization error:', err);
  }
}

// Seed default Chart of Accounts if empty
async function seedDefaultAccounts() {
  const row = await get('SELECT COUNT(*) as count FROM accounts');
  if (row && parseInt(row.count, 10) > 0) return;

  const defaultAccounts = [
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

    { code: '2', name: 'الخصوم والالتزامات', type: 'liability', nature: 'credit', parent_code: null, is_system: 1 },
    { code: '21', name: 'الخصوم المتداولة', type: 'liability', nature: 'credit', parent_code: '2', is_system: 1 },
    { code: '2101', name: 'الموردون (الذمم الدائنة)', type: 'liability', nature: 'credit', parent_code: '21', is_system: 1 },
    { code: '2102', name: 'ضريبة القيمة المضافة مخرجات (مبيعات)', type: 'liability', nature: 'credit', parent_code: '21', is_system: 1 },
    { code: '2103', name: 'مصروفات مستحقة الدفع', type: 'liability', nature: 'credit', parent_code: '21', is_system: 1 },

    { code: '3', name: 'حقوق الملكية', type: 'equity', nature: 'credit', parent_code: null, is_system: 1 },
    { code: '3101', name: 'رأس المال', type: 'equity', nature: 'credit', parent_code: '3', is_system: 1 },
    { code: '3102', name: 'الأرباح والخسائر المبقاة', type: 'equity', nature: 'credit', parent_code: '3', is_system: 1 },
    { code: '3103', name: 'جاري المالك / الشركاء', type: 'equity', nature: 'credit', parent_code: '3', is_system: 1 },

    { code: '4', name: 'الإيرادات', type: 'revenue', nature: 'credit', parent_code: null, is_system: 1 },
    { code: '4101', name: 'إيراد المبيعات', type: 'revenue', nature: 'credit', parent_code: '4', is_system: 1 },
    { code: '4102', name: 'إيرادات خدمات واستشارات', type: 'revenue', nature: 'credit', parent_code: '4', is_system: 1 },
    { code: '4103', name: 'إيرادات أخرى متنوعة', type: 'revenue', nature: 'credit', parent_code: '4', is_system: 1 },

    { code: '5', name: 'المصروفات', type: 'expense', nature: 'debit', parent_code: null, is_system: 1 },
    { code: '5101', name: 'تكلفة المبيعات والمشتريات', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5201', name: 'مصروفات الرواتب والأجور', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5202', name: 'مصروف إيجار المقر', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5203', name: 'مصاريف كهرباء ومياه واتصالات', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5204', name: 'مصاريف دعاية وتسويق', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5205', name: 'مصاريف صيانة وضيافة', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 },
    { code: '5206', name: 'مصاريف بنكية ورسوم حكومية', type: 'expense', nature: 'debit', parent_code: '5', is_system: 1 }
  ];

  for (const acc of defaultAccounts) {
    await run(
      'INSERT INTO accounts (code, name, type, nature, parent_code, is_system) VALUES (?, ?, ?, ?, ?, ?)',
      [acc.code, acc.name, acc.type, acc.nature, acc.parent_code, acc.is_system]
    );
  }

  await run(
    'INSERT INTO contacts (type, name, phone, email, tax_number, address) VALUES (?, ?, ?, ?, ?, ?)',
    ['customer', 'شركة الأفق للتجارة', '0501234567', 'info@alofooq.sa', '300123456700003', 'الرياض، المملكة العربية السعودية']
  );
  await run(
    'INSERT INTO contacts (type, name, phone, email, tax_number, address) VALUES (?, ?, ?, ?, ?, ?)',
    ['supplier', 'شركة التوريدات العالمية', '0112233445', 'supply@global.com', '310555666700003', 'الدمام، المملكة العربية السعودية']
  );
}

async function seedModuleData() {
  const checkCount = await get('SELECT COUNT(*) as count FROM checks');
  if (checkCount && parseInt(checkCount.count, 10) === 0) {
    await run(`
      INSERT INTO checks (check_number, type, party_name, bank_name, due_date, amount, status, notes)
      VALUES 
      ('CHK-9901', 'incoming', 'شركة الأفق للتجارة', 'بنك الرياض', '2026-11-25', 1850, 'pending', 'دفعة من فاتورة المبيعات رقم INV-0001'),
      ('CHK-1022', 'outgoing', 'شركة التوريدات العالمية', 'البنك الأهلي', '2026-12-05', 1200, 'pending', 'دفعة مشتريات مواد خام')
    `);
  }

  const partnerCount = await get('SELECT COUNT(*) as count FROM partners');
  if (partnerCount && parseInt(partnerCount.count, 10) === 0) {
    await run(`
      INSERT INTO partners (name, share_percentage, capital, drawings, phone, notes)
      VALUES 
      ('نديم علي (الشريك المؤسس)', 60, 30000, 2500, '0500000001', 'الإدارة والتنفيذ'),
      ('سامر عبد الله (شريك ممول)', 40, 20000, 1000, '0500000002', 'شريك ممول صامت')
    `);
  }

  const investCount = await get('SELECT COUNT(*) as count FROM investments');
  if (investCount && parseInt(investCount.count, 10) === 0) {
    await run(`
      INSERT INTO investments (title, category, initial_amount, current_value, returns, start_date, status, notes)
      VALUES 
      ('توسعة وتجهيز الفرع الجديد', 'توسع أعمال وتجهيزات', 15000, 18500, 3500, '2026-06-01', 'active', 'تجهيزات ديكور وبضاعة أولية')
    `);
  }

  const importCount = await get('SELECT COUNT(*) as count FROM imports');
  if (importCount && parseInt(importCount.count, 10) === 0) {
    await run(`
      INSERT INTO imports (shipment_number, supplier_name, item_description, quantity, goods_cost, shipping_customs_cost, total_cost, arrival_date, status, notes)
      VALUES 
      ('SHP-2026-08', 'شركة العطور الفرنسية Parfums Paris', 'زيوت عطرية وزجاجات فاخرة', 250, 4200, 650, 4850, '2026-11-28', 'customs', 'في مرحلة التخليص الجمركي')
    `);
  }

  const empCount = await get('SELECT COUNT(*) as count FROM employees');
  if (empCount && parseInt(empCount.count, 10) === 0) {
    await run(`
      INSERT INTO employees (employee_id, name, job_title, phone, salary, hire_date, notes)
      VALUES 
      ('EMP-001', 'أحمد سامي', 'مسؤول مبيعات', '0781112233', 450, '2026-01-15', 'دوام كامل'),
      ('EMP-002', 'عمر خالد', 'كاشير ومبيعات', '0782223344', 400, '2026-03-01', 'دوام كامل')
    `);
  }
}

async function seedHistoricalSales(force = false) {
  try {
    if (!force) {
      const row = await get('SELECT COUNT(*) as count FROM daily_sheets');
      const itemsRow = await get('SELECT COALESCE(SUM(sales_items_count), 0) as total_items FROM daily_sheets');
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

    console.log(`⚡ [Supabase] Seeding ${records.length} historical daily sheets...`);

    await withTransaction(async (tx) => {
      for (const r of records) {
        await tx.run(`
          INSERT INTO daily_sheets (
            sheet_date, day_name, sales_cash, sales_delivery, sales_visa,
            sales_ittihad, sales_ittihad_qr, sales_cliq, sales_items_count,
            deposit_personal, deposit_business, deposit_personal_date, deposit_business_date,
            notes, perfume_desc, perfume_debit, perfume_credit
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', '', '', '', 0, 0)
          ON CONFLICT (sheet_date) DO UPDATE SET
            sales_cash = EXCLUDED.sales_cash,
            sales_delivery = EXCLUDED.sales_delivery,
            sales_visa = EXCLUDED.sales_visa,
            sales_ittihad = EXCLUDED.sales_ittihad,
            sales_ittihad_qr = EXCLUDED.sales_ittihad_qr,
            sales_cliq = EXCLUDED.sales_cliq,
            sales_items_count = EXCLUDED.sales_items_count
        `, [
          r.sheet_date,
          r.day_name,
          r.sales_cash,
          r.sales_delivery,
          r.sales_visa,
          r.sales_ittihad,
          r.sales_ittihad_qr,
          r.sales_cliq,
          Number(r.sales_items_count || 0)
        ]);
      }
    });
    console.log('✅ [Supabase] Historical sales seeded successfully into Cloud Database!');
    return { success: true, count: records.length, message: 'تم إدخال كافة بيانات السنة بنجاح في Supabase!' };
  } catch (err) {
    console.warn('Warning seeding historical sales to Supabase:', err.message);
    return { success: false, error: err.message };
  }
}

// Helpers
async function generateNextNumber(prefix, table, column) {
  const row = await get(`SELECT ${column} FROM ${table} WHERE ${column} LIKE ? ORDER BY id DESC LIMIT 1`, [`${prefix}%`]);
  if (!row) return `${prefix}-0001`;
  const currentNum = parseInt((row[column] || '').split('-')[1] || '0', 10);
  const nextNum = (currentNum + 1).toString().padStart(4, '0');
  return `${prefix}-${nextNum}`;
}

// ----------------------------------------------------
// 1. Chart of Accounts
// ----------------------------------------------------
async function getAccounts() {
  await initSchema();
  const accounts = await all('SELECT * FROM accounts ORDER BY code ASC');
  const balances = await all(`
    SELECT account_id,
           SUM(debit) as total_debit,
           SUM(credit) as total_credit
    FROM journal_entry_lines
    GROUP BY account_id
  `);

  const balanceMap = {};
  for (const b of balances) {
    balanceMap[b.account_id] = {
      debit: Number(b.total_debit || 0),
      credit: Number(b.total_credit || 0)
    };
  }

  return accounts.map(acc => {
    const b = balanceMap[acc.id] || { debit: 0, credit: 0 };
    const netBalance = acc.nature === 'debit' ? (b.debit - b.credit) : (b.credit - b.debit);
    return {
      ...acc,
      total_debit: b.debit,
      total_credit: b.credit,
      current_balance: Math.round(netBalance * 100) / 100
    };
  });
}

async function createAccount(data) {
  await initSchema();
  const res = await run(
    'INSERT INTO accounts (code, name, type, nature, parent_code, description, is_system) VALUES (?, ?, ?, ?, ?, ?, 0)',
    [data.code, data.name, data.type, data.nature, data.parent_code || null, data.description || '']
  );
  return { id: res.lastInsertRowid, ...data };
}

// ----------------------------------------------------
// 2. Journal Entries (القيود اليومية)
// ----------------------------------------------------
async function createJournalEntry(data) {
  await initSchema();
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of (data.lines || [])) {
    totalDebit += Number(line.debit || 0);
    totalCredit += Number(line.credit || 0);
  }

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new Error(`القيد غير متوازن! مجموع المدين (${totalDebit}) لا يساوي مجموع الدائن (${totalCredit})`);
  }
  if (totalDebit <= 0) {
    throw new Error('يجب أن تكون قيمة القيد أكبر من صفر');
  }

  const entryNumber = data.entry_number || await generateNextNumber('JV', 'journal_entries', 'entry_number');

  return await withTransaction(async (tx) => {
    const entryRes = await tx.run(
      'INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?)',
      [
        entryNumber,
        data.entry_date || new Date().toISOString().split('T')[0],
        data.description || '',
        data.reference_type || 'manual',
        data.reference_id || null
      ]
    );
    const entryId = entryRes.lastInsertRowid;

    for (const line of data.lines) {
      const acc = await tx.get('SELECT code, name FROM accounts WHERE id = ?', [line.account_id]);
      if (!acc) throw new Error(`الحساب غير موجود: ${line.account_id}`);

      await tx.run(
        'INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          entryId,
          line.account_id,
          acc.code,
          acc.name,
          line.description || data.description || '',
          Number(line.debit || 0),
          Number(line.credit || 0)
        ]
      );
    }

    return { id: entryId, entry_number: entryNumber };
  });
}

async function getJournalEntries(limit = 100) {
  await initSchema();
  const entries = await all(`
    SELECT j.*,
           (SELECT SUM(debit) FROM journal_entry_lines WHERE entry_id = j.id) as total_amount
    FROM journal_entries j
    ORDER BY j.entry_date DESC, j.id DESC
    LIMIT ?
  `, [limit]);

  for (const entry of entries) {
    entry.lines = await all('SELECT * FROM journal_entry_lines WHERE entry_id = ? ORDER BY id ASC', [entry.id]);
  }
  return entries;
}

// ----------------------------------------------------
// 3. Invoices (الفواتير)
// ----------------------------------------------------
async function createInvoice(data) {
  await initSchema();
  const prefix = data.type === 'sales' ? 'INV' : 'BILL';
  const invoiceNumber = data.invoice_number || await generateNextNumber(prefix, 'invoices', 'invoice_number');

  let subtotal = 0;
  let taxAmount = 0;
  let totalAmount = 0;

  const preparedItems = (data.items || []).map(item => {
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

  return await withTransaction(async (tx) => {
    const invRes = await tx.run(
      'INSERT INTO invoices (invoice_number, type, contact_id, contact_name, invoice_date, payment_method, subtotal, tax_amount, total_amount, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
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
      ]
    );
    const invoiceId = invRes.lastInsertRowid;

    for (const item of preparedItems) {
      await tx.run(
        'INSERT INTO invoice_items (invoice_id, item_name, quantity, unit_price, tax_rate, tax_amount, total) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [invoiceId, item.item_name, item.quantity, item.unit_price, item.tax_rate, item.tax_amount, item.total]
      );
    }

    // Auto journal entry
    const cashAcc = await tx.get("SELECT id, code, name FROM accounts WHERE code = '1101'");
    const bankAcc = await tx.get("SELECT id, code, name FROM accounts WHERE code = '1102'");
    const custAcc = await tx.get("SELECT id, code, name FROM accounts WHERE code = '1103'");
    const suppAcc = await tx.get("SELECT id, code, name FROM accounts WHERE code = '2101'");
    const salesAcc = await tx.get("SELECT id, code, name FROM accounts WHERE code = '4101'");
    const purchaseAcc = await tx.get("SELECT id, code, name FROM accounts WHERE code = '5101'");
    const vatOutputAcc = await tx.get("SELECT id, code, name FROM accounts WHERE code = '2102'");
    const vatInputAcc = await tx.get("SELECT id, code, name FROM accounts WHERE code = '1104'");

    const entryNumber = await generateNextNumber('JV', 'journal_entries', 'entry_number');
    const entryDesc = data.type === 'sales'
      ? `فاتورة مبيعات رقم ${invoiceNumber} - ${data.contact_name || 'عميل نقدي'}`
      : `فاتورة مشتريات رقم ${invoiceNumber} - ${data.contact_name || 'مورد عام'}`;

    const entryRes = await tx.run(
      'INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?)',
      [
        entryNumber,
        data.invoice_date || new Date().toISOString().split('T')[0],
        entryDesc,
        data.type === 'sales' ? 'sales_invoice' : 'purchase_invoice',
        invoiceId
      ]
    );
    const entryId = entryRes.lastInsertRowid;

    await tx.run('UPDATE invoices SET journal_entry_id = ? WHERE id = ?', [entryId, invoiceId]);

    if (data.type === 'sales') {
      let debitTargetAcc = cashAcc;
      if (data.payment_method === 'bank') debitTargetAcc = bankAcc;
      if (data.payment_method === 'credit') debitTargetAcc = custAcc;

      await tx.run('INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [entryId, debitTargetAcc.id, debitTargetAcc.code, debitTargetAcc.name, entryDesc, totalAmount, 0]);
      await tx.run('INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [entryId, salesAcc.id, salesAcc.code, salesAcc.name, 'إيراد مبيعات فاتورة ' + invoiceNumber, 0, subtotal]);
      if (taxAmount > 0) {
        await tx.run('INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [entryId, vatOutputAcc.id, vatOutputAcc.code, vatOutputAcc.name, 'ضريبة قيمة مضافة مخرجات فاتورة ' + invoiceNumber, 0, taxAmount]);
      }
    } else {
      let creditTargetAcc = cashAcc;
      if (data.payment_method === 'bank') creditTargetAcc = bankAcc;
      if (data.payment_method === 'credit') creditTargetAcc = suppAcc;

      await tx.run('INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [entryId, purchaseAcc.id, purchaseAcc.code, purchaseAcc.name, 'تكلفة مشتريات فاتورة ' + invoiceNumber, subtotal, 0]);
      if (taxAmount > 0) {
        await tx.run('INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [entryId, vatInputAcc.id, vatInputAcc.code, vatInputAcc.name, 'ضريبة قيمة مضافة مدخلات فاتورة ' + invoiceNumber, taxAmount, 0]);
      }
      await tx.run('INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [entryId, creditTargetAcc.id, creditTargetAcc.code, creditTargetAcc.name, entryDesc, 0, totalAmount]);
    }

    return { id: invoiceId, invoice_number: invoiceNumber, journal_entry_id: entryId };
  });
}

async function getInvoices(type = 'sales', limit = 100) {
  await initSchema();
  const invoices = await all('SELECT * FROM invoices WHERE type = ? ORDER BY invoice_date DESC, id DESC LIMIT ?', [type, limit]);
  for (const inv of invoices) {
    inv.items = await all('SELECT * FROM invoice_items WHERE invoice_id = ?', [inv.id]);
  }
  return invoices;
}

// ----------------------------------------------------
// 4. Vouchers (سندات القبض والصرف)
// ----------------------------------------------------
async function createVoucher(data) {
  await initSchema();
  const prefix = data.type === 'receipt' ? 'RV' : 'PV';
  const voucherNumber = data.voucher_number || await generateNextNumber(prefix, 'vouchers', 'voucher_number');
  const amount = Number(data.amount);

  if (amount <= 0) throw new Error('مبلغ السند يجب أن يكون أكبر من صفر');

  const targetAcc = await get('SELECT id, code, name FROM accounts WHERE id = ?', [data.target_account_id]);
  if (!targetAcc) throw new Error('الحساب المستهدف غير موجود');

  const cashAcc = await get("SELECT id, code, name FROM accounts WHERE code = '1101'");
  const bankAcc = await get("SELECT id, code, name FROM accounts WHERE code = '1102'");
  const sourceAcc = data.payment_method === 'bank' ? bankAcc : cashAcc;

  return await withTransaction(async (tx) => {
    const vRes = await tx.run(
      'INSERT INTO vouchers (voucher_number, type, voucher_date, amount, payment_method, contact_id, contact_name, target_account_id, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        voucherNumber,
        data.type,
        data.voucher_date || new Date().toISOString().split('T')[0],
        amount,
        data.payment_method || 'cash',
        data.contact_id || null,
        data.contact_name || '',
        data.target_account_id,
        data.description || ''
      ]
    );
    const voucherId = vRes.lastInsertRowid;

    const entryNumber = await generateNextNumber('JV', 'journal_entries', 'entry_number');
    const entryDesc = `${data.type === 'receipt' ? 'سند قبض' : 'سند صرف'} رقم ${voucherNumber} - ${data.description || ''}`;

    const entryRes = await tx.run(
      'INSERT INTO journal_entries (entry_number, entry_date, description, reference_type, reference_id) VALUES (?, ?, ?, ?, ?)',
      [
        entryNumber,
        data.voucher_date || new Date().toISOString().split('T')[0],
        entryDesc,
        data.type === 'receipt' ? 'receipt_voucher' : 'payment_voucher',
        voucherId
      ]
    );
    const entryId = entryRes.lastInsertRowid;

    await tx.run('UPDATE vouchers SET journal_entry_id = ? WHERE id = ?', [entryId, voucherId]);

    if (data.type === 'receipt') {
      await tx.run('INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [entryId, sourceAcc.id, sourceAcc.code, sourceAcc.name, entryDesc, amount, 0]);
      await tx.run('INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [entryId, targetAcc.id, targetAcc.code, targetAcc.name, entryDesc, 0, amount]);
    } else {
      await tx.run('INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [entryId, targetAcc.id, targetAcc.code, targetAcc.name, entryDesc, amount, 0]);
      await tx.run('INSERT INTO journal_entry_lines (entry_id, account_id, account_code, account_name, description, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [entryId, sourceAcc.id, sourceAcc.code, sourceAcc.name, entryDesc, 0, amount]);
    }

    return { id: voucherId, voucher_number: voucherNumber, journal_entry_id: entryId };
  });
}

async function getVouchers(type = 'receipt', limit = 100) {
  await initSchema();
  return await all(`
    SELECT v.*, a.name as target_account_name, a.code as target_account_code
    FROM vouchers v
    JOIN accounts a ON a.id = v.target_account_id
    WHERE v.type = ?
    ORDER BY v.voucher_date DESC, v.id DESC
    LIMIT ?
  `, [type, limit]);
}

// ----------------------------------------------------
// 5. Contacts (العملاء والموردون)
// ----------------------------------------------------
async function getContacts(type = null) {
  await initSchema();
  if (type) {
    return await all('SELECT * FROM contacts WHERE type = ? ORDER BY name ASC', [type]);
  }
  return await all('SELECT * FROM contacts ORDER BY name ASC');
}

async function createContact(data) {
  await initSchema();
  const res = await run(
    'INSERT INTO contacts (type, name, phone, email, tax_number, address) VALUES (?, ?, ?, ?, ?, ?)',
    [data.type, data.name, data.phone || '', data.email || '', data.tax_number || '', data.address || '']
  );
  return { id: res.lastInsertRowid, ...data };
}

// ----------------------------------------------------
// 6. Reports (التقارير المالية)
// ----------------------------------------------------
async function getTrialBalance() {
  await initSchema();
  const accounts = await all('SELECT * FROM accounts ORDER BY code ASC');
  const balances = await all(`
    SELECT account_id,
           SUM(debit) as total_debit,
           SUM(credit) as total_credit
    FROM journal_entry_lines
    GROUP BY account_id
  `);

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

async function getGeneralLedger(accountId, startDate = null, endDate = null) {
  await initSchema();
  const account = await get('SELECT * FROM accounts WHERE id = ?', [accountId]);
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

  const lines = await all(query, params);

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

async function getIncomeStatement() {
  await initSchema();
  const accounts = await all("SELECT * FROM accounts WHERE type IN ('revenue', 'expense') ORDER BY code ASC");
  const balances = await all(`
    SELECT account_id,
           SUM(debit) as total_debit,
           SUM(credit) as total_credit
    FROM journal_entry_lines
    GROUP BY account_id
  `);

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
      const net = b.credit - b.debit;
      totalRevenues += net;
      revenues.push({ ...acc, amount: Math.round(net * 100) / 100 });
    } else {
      const net = b.debit - b.credit;
      totalExpenses += net;
      expenses.push({ ...acc, amount: Math.round(net * 100) / 100 });
    }
  }

  const netIncome = totalRevenues - totalExpenses;
  return {
    revenues,
    expenses,
    total_revenues: Math.round(totalRevenues * 100) / 100,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    net_income: Math.round(netIncome * 100) / 100
  };
}

async function getBalanceSheet() {
  await initSchema();
  const accounts = await all("SELECT * FROM accounts WHERE type IN ('asset', 'liability', 'equity') ORDER BY code ASC");
  const balances = await all(`
    SELECT account_id,
           SUM(debit) as total_debit,
           SUM(credit) as total_credit
    FROM journal_entry_lines
    GROUP BY account_id
  `);

  const balanceMap = {};
  for (const b of balances) {
    balanceMap[b.account_id] = {
      debit: Number(b.total_debit || 0),
      credit: Number(b.total_credit || 0)
    };
  }

  const inc = await getIncomeStatement();
  const currentNetIncome = inc.net_income;

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  const assets = [];
  const liabilities = [];
  const equity = [];

  for (const acc of accounts) {
    const b = balanceMap[acc.id] || { debit: 0, credit: 0 };
    if (acc.type === 'asset') {
      const net = b.debit - b.credit;
      totalAssets += net;
      assets.push({ ...acc, amount: Math.round(net * 100) / 100 });
    } else if (acc.type === 'liability') {
      const net = b.credit - b.debit;
      totalLiabilities += net;
      liabilities.push({ ...acc, amount: Math.round(net * 100) / 100 });
    } else if (acc.type === 'equity') {
      const net = b.credit - b.debit;
      totalEquity += net;
      equity.push({ ...acc, amount: Math.round(net * 100) / 100 });
    }
  }

  equity.push({
    id: -1,
    code: '3102-NET',
    name: 'صافي أرباح الفترة الحالية',
    type: 'equity',
    nature: 'credit',
    amount: currentNetIncome
  });
  totalEquity += currentNetIncome;

  return {
    assets,
    liabilities,
    equity,
    total_assets: Math.round(totalAssets * 100) / 100,
    total_liabilities: Math.round(totalLiabilities * 100) / 100,
    total_equity: Math.round(totalEquity * 100) / 100,
    is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
  };
}

async function getDashboardSummary() {
  await initSchema();
  const inc = await getIncomeStatement();
  const bal = await getBalanceSheet();

  const cashAcc = await get("SELECT id FROM accounts WHERE code = '1101'");
  let cashBalance = 0;
  if (cashAcc) {
    const b = await get(`
      SELECT SUM(debit) - SUM(credit) as net FROM journal_entry_lines WHERE account_id = ?
    `, [cashAcc.id]);
    cashBalance = Number(b?.net || 0);
  }

  const bankAcc = await get("SELECT id FROM accounts WHERE code = '1102'");
  let bankBalance = 0;
  if (bankAcc) {
    const b = await get(`
      SELECT SUM(debit) - SUM(credit) as net FROM journal_entry_lines WHERE account_id = ?
    `, [bankAcc.id]);
    bankBalance = Number(b?.net || 0);
  }

  const custAcc = await get("SELECT id FROM accounts WHERE code = '1103'");
  let receivablesBalance = 0;
  if (custAcc) {
    const b = await get(`
      SELECT SUM(debit) - SUM(credit) as net FROM journal_entry_lines WHERE account_id = ?
    `, [custAcc.id]);
    receivablesBalance = Number(b?.net || 0);
  }

  const suppAcc = await get("SELECT id FROM accounts WHERE code = '2101'");
  let payablesBalance = 0;
  if (suppAcc) {
    const b = await get(`
      SELECT SUM(credit) - SUM(debit) as net FROM journal_entry_lines WHERE account_id = ?
    `, [suppAcc.id]);
    payablesBalance = Number(b?.net || 0);
  }

  return {
    total_revenues: inc.total_revenues,
    total_expenses: inc.total_expenses,
    net_income: inc.net_income,
    cash_in_hand: Math.round(cashBalance * 100) / 100,
    cash_in_bank: Math.round(bankBalance * 100) / 100,
    receivables: Math.round(receivablesBalance * 100) / 100,
    payables: Math.round(payablesBalance * 100) / 100,
    total_assets: bal.total_assets
  };
}

// ----------------------------------------------------
// 7. Daily Journal Sheets (دفتر اليومية المطور)
// ----------------------------------------------------
async function getPriorPerfumeSales(sheetDate) {
  await initSchema();
  const row = await get(`
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
  `, [sheetDate]);

  return Math.round(Number(row?.total || 0) * 100) / 100;
}

async function getPriorUndepositedCash(sheetDate) {
  await initSchema();
  const row = await get(`
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
  `, [sheetDate]);

  return Math.round(Number(row?.total_undeposited || 0) * 100) / 100;
}

async function getCumulativeStats(sheetDate) {
  await initSchema();
  const row = await get(`
    SELECT
      COALESCE(SUM(CASE WHEN sheet_date <= ? THEN (sales_cash + sales_delivery + sales_visa + sales_ittihad + sales_ittihad_qr + sales_cliq) ELSE 0 END), 0) as cum_sales,
      COALESCE(SUM(CASE WHEN sheet_date <= ? THEN sales_items_count ELSE 0 END), 0) as cum_items,
      COALESCE(SUM(sales_cash + sales_delivery + sales_visa + sales_ittihad + sales_ittihad_qr + sales_cliq), 0) as year_sales,
      COALESCE(SUM(sales_items_count), 0) as year_items
    FROM daily_sheets
  `, [sheetDate, sheetDate]);

  return {
    cum_sales: Math.round(Number(row?.cum_sales || 0) * 100) / 100,
    cum_items: Number(row?.cum_items || 0),
    year_sales: Math.round(Number(row?.year_sales || 0) * 100) / 100,
    year_items: Number(row?.year_items || 0)
  };
}

async function getDailySheet(sheetDate) {
  await initSchema();
  const [sheet, priorUndeposited, priorPerfume, cumStats] = await Promise.all([
    get('SELECT * FROM daily_sheets WHERE sheet_date = ?', [sheetDate]),
    getPriorUndepositedCash(sheetDate),
    getPriorPerfumeSales(sheetDate),
    getCumulativeStats(sheetDate)
  ]);

  if (!sheet) {
    const dateObj = new Date(sheetDate + 'T00:00:00');
    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayName = isNaN(dateObj.getDay()) ? '' : dayNames[dateObj.getDay()];

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
      deposit_personal_date: '',
      deposit_business_date: '',
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

  const items = await all('SELECT * FROM daily_sheet_items WHERE sheet_id = ? ORDER BY id ASC', [sheet.id]);

  const categorizedItems = {
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
  };

  for (const item of items) {
    let cat = item.category;
    if (cat === 'internal_expense') cat = 'internal_expenses';
    if (cat === 'employee_advance') cat = 'employee_advances';
    if (cat === 'supplier_payment') cat = 'supplier_payments';
    if (cat === 'cash_purchase') cat = 'cash_purchases';
    if (cat === 'perfume_sale') cat = 'perfume_sales';
    if (cat === 'daily_obligation') cat = 'daily_obligations';
    if (cat === 'merchant_dispatch') cat = 'merchant_dispatches';
    if (cat === 'employee_sale') cat = 'employee_sales';
    if (cat === 'extra_revenue') cat = 'extra_revenues';
    if (cat === 'revenue_expense') cat = 'revenue_expenses';
    if (cat === 'daily_note') cat = 'daily_notes';

    if (categorizedItems[cat]) {
      categorizedItems[cat].push(item);
    }
  }

  return {
    ...sheet,
    prior_undeposited_cash: priorUndeposited,
    prior_perfume_sales: priorPerfume,
    cum_stats: cumStats,
    items: categorizedItems
  };
}

async function saveDailySheet(data) {
  await initSchema();
  return await withTransaction(async (tx) => {
    let sheet = await tx.get('SELECT id FROM daily_sheets WHERE sheet_date = ?', [data.sheet_date]);
    let sheetId;

    if (sheet) {
      sheetId = sheet.id;
      await tx.run(`
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
      `, [
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
      ]);

      await tx.run('DELETE FROM daily_sheet_items WHERE sheet_id = ?', [sheetId]);
    } else {
      const res = await tx.run(`
        INSERT INTO daily_sheets (
          sheet_date, day_name, sales_cash, sales_delivery, sales_visa,
          sales_ittihad, sales_ittihad_qr, sales_cliq, sales_items_count,
          deposit_personal, deposit_business, deposit_personal_date, deposit_business_date,
          notes, perfume_desc, perfume_debit, perfume_credit
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
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
      ]);
      sheetId = res.lastInsertRowid;
    }

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
        const rows = data.items[cat] || [];
        const singular = categorySingularMap[cat] || cat;
        for (const r of rows) {
          const col1 = r.col1 || '';
          const col2 = r.col2 || '';
          const col3 = r.col3 || '';
          const col4 = r.col4 || '';
          const col5 = r.col5 || '';
          const amount1 = Number(r.amount1 || 0);
          const amount2 = Number(r.amount2 || 0);

          if (col1 || col2 || col3 || col4 || col5 || amount1 || amount2) {
            await tx.run(
              'INSERT INTO daily_sheet_items (sheet_id, category, col1, col2, col3, col4, col5, amount1, amount2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [sheetId, singular, col1, col2, col3, col4, col5, amount1, amount2]
            );
          }
        }
      }
    }

    return await getDailySheet(data.sheet_date);
  });
}

async function getDailySheetsHistory(limit = 500) {
  await initSchema();
  const sheets = await all('SELECT * FROM daily_sheets ORDER BY sheet_date DESC LIMIT ?', [limit]);
  return sheets.map(s => {
    const totalSales = Number(s.sales_cash || 0) + Number(s.sales_delivery || 0) +
      Number(s.sales_visa || 0) + Number(s.sales_ittihad || 0) +
      Number(s.sales_ittihad_qr || 0) + Number(s.sales_cliq || 0);
    return {
      id: s.id,
      sheet_date: s.sheet_date,
      day_name: s.day_name,
      total_sales: Math.round(totalSales * 100) / 100,
      sales_items_count: Number(s.sales_items_count || 0),
      total_deposits: Number(s.deposit_personal || 0) + Number(s.deposit_business || 0),
      total_expenses: 0,
      notes: s.notes || '',
      created_at: s.created_at
    };
  });
}

async function clearAllDailySheets() {
  await initSchema();
  return await withTransaction(async (tx) => {
    await tx.run('DELETE FROM daily_sheet_items');
    await tx.run('DELETE FROM daily_sheets');
    return { success: true, message: 'تم تصفير جميع دفاتر اليومية بنجاح' };
  });
}

// ----------------------------------------------------
// 8. Modules (المبيعات، المصاريف، الموردون، الموظفون...)
// ----------------------------------------------------
async function getSalesSummary() {
  await initSchema();
  const totals = await get(`
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
  `);

  const perfumeItems = await get(`
    SELECT COALESCE(SUM(amount2), 0) as total_perfume
    FROM daily_sheet_items
    WHERE category = 'perfume_sale'
  `);

  const perfumeTotal = Math.max(Number(totals?.perfume_credit || 0), perfumeItems ? Number(perfumeItems.total_perfume || 0) : 0);
  const grandTotal = Number(totals?.cash || 0) + Number(totals?.delivery || 0) + Number(totals?.visa || 0) +
    Number(totals?.ittihad || 0) + Number(totals?.ittihad_qr || 0) + Number(totals?.cliq || 0) + perfumeTotal;

  const history = await all(`
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
        SELECT STRING_AGG(col1, ' | ')
        FROM daily_sheet_items
        WHERE sheet_id = s.id AND category = 'daily_note'
      ), '') as notes
    FROM daily_sheets s
    ORDER BY s.sheet_date ASC
  `);

  return {
    totals: {
      cash: Number(totals?.cash || 0),
      delivery: Number(totals?.delivery || 0),
      visa: Number(totals?.visa || 0),
      ittihad: Number(totals?.ittihad || 0),
      ittihad_qr: Number(totals?.ittihad_qr || 0),
      cliq: Number(totals?.cliq || 0),
      perfume: perfumeTotal,
      items_count: Number(totals?.items_count || 0),
      grand_total: grandTotal
    },
    history
  };
}

async function getExpensesSummary() {
  await initSchema();
  const rows = await all(`
    SELECT 
      i.id,
      s.sheet_date,
      s.day_name,
      i.category,
      i.col1 as description,
      i.amount1 as amount,
      i.col2 as note
    FROM daily_sheet_items i
    JOIN daily_sheets s ON s.id = i.sheet_id
    WHERE i.category IN ('internal_expense', 'internal_expenses', 'cash_purchase', 'cash_purchases')
    ORDER BY s.sheet_date DESC, i.id DESC
  `);

  let totalInternal = 0;
  let totalPurchases = 0;
  for (const r of rows) {
    if (r.category.startsWith('internal')) totalInternal += Number(r.amount || 0);
    else totalPurchases += Number(r.amount || 0);
  }

  return {
    totals: {
      internal_expenses: Math.round(totalInternal * 100) / 100,
      cash_purchases: Math.round(totalPurchases * 100) / 100,
      grand_total: Math.round((totalInternal + totalPurchases) * 100) / 100
    },
    items: rows
  };
}

async function getSuppliersList() {
  await initSchema();
  const contacts = await all("SELECT * FROM contacts WHERE type = 'supplier' ORDER BY name ASC");
  const suppliersWithTotals = [];

  for (const c of contacts) {
    const payRows = await all(`
      SELECT SUM(i.amount1) as total_paid
      FROM daily_sheet_items i
      JOIN daily_sheets s ON s.id = i.sheet_id
      WHERE i.category IN ('supplier_payment', 'supplier_payments') AND i.col1 = ?
    `, [c.name]);

    const totalPaid = Number(payRows[0]?.total_paid || 0);
    suppliersWithTotals.push({
      id: c.id,
      name: c.name,
      phone: c.phone || '',
      email: c.email || '',
      tax_number: c.tax_number || '',
      address: c.address || '',
      total_paid: Math.round(totalPaid * 100) / 100
    });
  }

  return suppliersWithTotals;
}

async function createSupplier(data) {
  return await createContact({ ...data, type: 'supplier' });
}

async function deleteSupplier(id) {
  await initSchema();
  await run('DELETE FROM contacts WHERE id = ? AND type = ?', [id, 'supplier']);
  return { success: true };
}

async function getEmployeesList() {
  await initSchema();
  const emps = await all('SELECT * FROM employees ORDER BY id ASC');
  const result = [];

  for (const e of emps) {
    const adv = await get(`
      SELECT SUM(i.amount1) as total_adv
      FROM daily_sheet_items i
      WHERE i.category IN ('employee_advance', 'employee_advances') AND (i.col1 = ? OR i.col1 LIKE ?)
    `, [e.name, `%${e.name}%`]);

    const totalAdv = Number(adv?.total_adv || 0);
    result.push({
      ...e,
      total_advances: Math.round(totalAdv * 100) / 100,
      net_remaining_salary: Math.round((Number(e.salary || 0) - totalAdv) * 100) / 100
    });
  }
  return result;
}

async function createEmployee(data) {
  await initSchema();
  const nextId = data.employee_id || await generateNextNumber('EMP', 'employees', 'employee_id');
  const res = await run(
    'INSERT INTO employees (employee_id, name, job_title, phone, salary, hire_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      nextId,
      data.name,
      data.job_title || 'موظف مبيعات',
      data.phone || '',
      Number(data.salary || 0),
      data.hire_date || new Date().toISOString().split('T')[0],
      data.notes || ''
    ]
  );
  return { id: res.lastInsertRowid, employee_id: nextId, ...data };
}

async function deleteEmployee(id) {
  await initSchema();
  await run('DELETE FROM employees WHERE id = ?', [id]);
  return { success: true };
}

async function getReceivablesSummary() {
  await initSchema();
  const contacts = await all("SELECT * FROM contacts WHERE type = 'customer' ORDER BY name ASC");
  return contacts.map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone || '',
    balance: 0,
    status: 'منتظم'
  }));
}

async function getChecksList() {
  await initSchema();
  return await all('SELECT * FROM checks ORDER BY due_date ASC, id ASC');
}

async function createCheck(data) {
  await initSchema();
  const chkNum = data.check_number || await generateNextNumber('CHK', 'checks', 'check_number');
  const res = await run(
    'INSERT INTO checks (check_number, type, party_name, bank_name, due_date, amount, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      chkNum,
      data.type || 'incoming',
      data.party_name,
      data.bank_name || '',
      data.due_date,
      Number(data.amount || 0),
      data.status || 'pending',
      data.notes || ''
    ]
  );
  return { id: res.lastInsertRowid, check_number: chkNum, ...data };
}

async function updateCheckStatus(id, status) {
  await initSchema();
  await run('UPDATE checks SET status = ? WHERE id = ?', [status, id]);
  return { success: true };
}

async function deleteCheck(id) {
  await initSchema();
  await run('DELETE FROM checks WHERE id = ?', [id]);
  return { success: true };
}

async function getPartnersList() {
  await initSchema();
  return await all('SELECT * FROM partners ORDER BY id ASC');
}

async function createPartner(data) {
  await initSchema();
  const res = await run(
    'INSERT INTO partners (name, share_percentage, capital, drawings, phone, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [
      data.name,
      Number(data.share_percentage || 0),
      Number(data.capital || 0),
      Number(data.drawings || 0),
      data.phone || '',
      data.notes || ''
    ]
  );
  return { id: res.lastInsertRowid, ...data };
}

async function deletePartner(id) {
  await initSchema();
  await run('DELETE FROM partners WHERE id = ?', [id]);
  return { success: true };
}

async function getInvestmentsList() {
  await initSchema();
  return await all('SELECT * FROM investments ORDER BY id ASC');
}

async function createInvestment(data) {
  await initSchema();
  const res = await run(
    'INSERT INTO investments (title, category, initial_amount, current_value, returns, start_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      data.title,
      data.category || 'تطوير وتوسع',
      Number(data.initial_amount || 0),
      Number(data.current_value || data.initial_amount || 0),
      Number(data.returns || 0),
      data.start_date || new Date().toISOString().split('T')[0],
      data.status || 'active',
      data.notes || ''
    ]
  );
  return { id: res.lastInsertRowid, ...data };
}

async function deleteInvestment(id) {
  await initSchema();
  await run('DELETE FROM investments WHERE id = ?', [id]);
  return { success: true };
}

async function getImportsList() {
  await initSchema();
  return await all('SELECT * FROM imports ORDER BY id ASC');
}

async function createImport(data) {
  await initSchema();
  const shpNum = data.shipment_number || await generateNextNumber('SHP', 'imports', 'shipment_number');
  const goodsCost = Number(data.goods_cost || 0);
  const shipCost = Number(data.shipping_customs_cost || 0);
  const totalCost = Number(data.total_cost || (goodsCost + shipCost));

  const res = await run(
    'INSERT INTO imports (shipment_number, supplier_name, item_description, quantity, goods_cost, shipping_customs_cost, total_cost, arrival_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      shpNum,
      data.supplier_name,
      data.item_description || '',
      Number(data.quantity || 1),
      goodsCost,
      shipCost,
      totalCost,
      data.arrival_date || '',
      data.status || 'in_transit',
      data.notes || ''
    ]
  );
  return { id: res.lastInsertRowid, shipment_number: shpNum, ...data };
}

async function deleteImport(id) {
  await initSchema();
  await run('DELETE FROM imports WHERE id = ?', [id]);
  return { success: true };
}

async function getProfitLossStatement() {
  await initSchema();
  const sales = await getSalesSummary();
  const totalRevenues = Number(sales.totals.grand_total || 0);

  const exp = await getExpensesSummary();
  const internalExp = Number(exp.totals.internal_expenses || 0);
  const purchasesExp = Number(exp.totals.cash_purchases || 0);

  const emps = await getEmployeesList();
  let employeeExp = 0;
  for (const e of emps) {
    employeeExp += Number(e.salary || 0);
  }

  const otherExp = 0;
  const totalExpenses = internalExp + purchasesExp + employeeExp + otherExp;
  const netProfit = totalRevenues - totalExpenses;

  return {
    total_revenues: Math.round(totalRevenues * 100) / 100,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    net_profit: Math.round(netProfit * 100) / 100,
    profit_margin_percent: totalRevenues > 0 ? Math.round((netProfit / totalRevenues) * 100 * 10) / 10 : 0,
    breakdown: {
      sales_revenue: Math.round(totalRevenues * 100) / 100,
      purchases_cogs: Math.round(purchasesExp * 100) / 100,
      internal_expenses: Math.round(internalExp * 100) / 100,
      employee_expenses: Math.round(employeeExp * 100) / 100,
      other_expenses: Math.round(otherExp * 100) / 100
    }
  };
}

// Auto Initialize Schema immediately
initSchema().catch(err => {
  console.error('Initial Supabase schema setup warning:', err.message);
});

module.exports = {
  pool,
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
