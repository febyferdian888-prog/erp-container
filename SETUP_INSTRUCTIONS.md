# Setup Instructions - ERP Container Procurement

Panduan langkah-demi-langkah untuk setup aplikasi di mesin lokal.

## ⏱️ Estimated Time: 30-45 minutes

---

## ✅ Prerequisites

Verifikasi Anda sudah punya:
- [ ] Node.js v18+ (cek dengan `node --version`)
- [ ] npm v10+ (cek dengan `npm --version`)
- [ ] PostgreSQL 12+ atau Docker
- [ ] Git (jika clone dari repository)
- [ ] Text editor (VS Code recommended)

---

## 🔧 Step 1: Setup PostgreSQL Database

### Option A: PostgreSQL Standalone (Windows)

1. Download installer dari: https://www.postgresql.org/download/windows/
2. Run installer, pilih:
   - Installation directory: default OK
   - Port: 5432 (default)
   - Superuser password: **INGAT PASSWORD INI** (misal: `postgres`)
   - Service: Install as service
3. Finish installation

4. Buka PostgreSQL shell atau pgAdmin
5. Buat database baru:
   ```sql
   CREATE DATABASE erp_container_db;
   ```
6. Verifikasi:
   ```sql
   \l
   -- Harus terlihat `erp_container_db`
   ```

### Option B: Using Docker (Recommended)

```bash
# Jika sudah install Docker Desktop/WSL2
docker run --name erp-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=erp_container_db \
  -p 5432:5432 \
  -d postgres:15

# Verifikasi running
docker ps | grep erp-postgres
```

---

## 📁 Step 2: Setup Project Folders

```bash
# Navigate ke project directory
cd C:\Users\ACER\CLaude\erp-app

# Verify structure
dir
# Harus terlihat:
# - app/
# - lib/
# - prisma/
# - docs/
# - .env.example
# - package.json
```

---

## 📦 Step 3: Install Dependencies

```bash
# Install semua packages
npm install

# Ini akan menginstall:
# - next
# - react
# - prisma
# - next-auth
# - tailwindcss
# - bcryptjs
# - zod
# - dan dependencies lainnya

# Tunggu sampai selesai (5-15 menit)
```

---

## 🔐 Step 4: Configure Environment Variables

1. Open folder `C:\Users\ACER\CLaude\erp-app`
2. Copy file `.env.example` menjadi `.env.local`
3. Edit `.env.local` dan sesuaikan:

```env
# Database Configuration
# Pastikan sudah setup database di Step 1
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/erp_container_db"

# NextAuth Secret - GENERATE INI
NEXTAUTH_SECRET="change-me-to-random-secret"
# Generate dengan: openssl rand -base64 32
# Atau generate online: https://generate-secret.vercel.app/32

NEXTAUTH_URL="http://localhost:3000"

# Sisanya OK dengan default
SESSION_MAX_AGE=86400
TZ="Asia/Jakarta"
```

### Generate NEXTAUTH_SECRET (Windows):

**Option 1: Online Generator**
- Buka https://generate-secret.vercel.app/32
- Copy hasil, paste ke `.env.local`

**Option 2: Git Bash (jika ada)**
```bash
openssl rand -base64 32
```

**Option 3: Manual** (use any random string)
```
abcdef123456ghijkl7890mnopqrst+uv==
```

---

## 🗄️ Step 5: Initialize Database Schema

```bash
# Push Prisma schema ke PostgreSQL
npm run db:push

# Output harus mirip:
# ✔ Your database is now in sync with your Prisma schema
# ✔ Generated Prisma Client
```

**Troubleshooting DB Connection:**
```bash
# Jika error, test koneksi PostgreSQL manual:
psql -U postgres -d erp_container_db -c "SELECT 1"
# Harus return: 1
```

---

## 🌱 Step 6: Load Demo Data (Seed)

```bash
# Load data demo ke database
npm run db:seed

# Output:
# 🌱 Seeding database with demo data...
# Creating roles...
# Creating companies...
# Creating users...
# Creating user memberships...
# Creating master data...
# ✅ Seeding completed successfully!
# 
# 📝 Demo Credentials:
# Email: admin@erp.local
# Email: owner@ptaja.local
# Email: sales@ptaja.local
# Password: admin123
```

---

## 🚀 Step 7: Start Development Server

```bash
# Run development server
npm run dev

# Output:
# ▲ Next.js 16.3.5
# - Local: http://localhost:3000
# - Environments: .env.local
```

---

## 🌐 Step 8: Test Login

1. Open browser: http://localhost:3000
2. Redirects to: http://localhost:3000/auth/login
3. Login dengan credentials:
   - **Email**: `admin@erp.local`
   - **Password**: `admin123`
4. Setelah login, harus melihat dashboard (atau 404 - dashboard belum selesai)

**Test Other Users:**
```
Email: owner@ptaja.local / Password: admin123
Email: sales@ptaja.local / Password: admin123
```

---

## ✨ Verification Checklist

Setelah semua step, verifikasi:

- [ ] npm install selesai tanpa error
- [ ] .env.local sudah ada dengan DATABASE_URL yang valid
- [ ] Database `erp_container_db` exist di PostgreSQL
- [ ] `npm run db:push` berhasil
- [ ] `npm run db:seed` berhasil dan show demo credentials
- [ ] `npm run dev` running di http://localhost:3000
- [ ] Bisa login dengan `admin@erp.local` / `admin123`
- [ ] Tidak ada error di browser console
- [ ] Database terbaca oleh aplikasi (test dengan login)

---

## 🗂️ Prisma Studio (Optional)

GUI untuk lihat & edit data database:

```bash
npm run db:studio

# Opens: http://localhost:5555
# Bisa explore semua tables & data
```

---

## 🔄 Next Steps Setelah Setup

1. **Explore Database**
   ```bash
   npm run db:studio
   # Lihat struktur & demo data yang sudah di-load
   ```

2. **Understand Architecture**
   - Baca `IMPLEMENTATION_PLAN.md` untuk overview
   - Baca `docs/DATABASE_SCHEMA.md` untuk detail database

3. **Inspect Code**
   - `lib/auth.ts` - NextAuth configuration
   - `lib/db.ts` - Prisma client
   - `prisma/schema.prisma` - Database schema
   - `prisma/seed.ts` - Demo data creation

4. **Next Development Phase**
   - Build dashboard page
   - Create master data CRUD APIs
   - Build UI components

---

## 🐛 Common Issues & Fixes

### ❌ "connect ECONNREFUSED 127.0.0.1:5432"
**Cause**: PostgreSQL service not running  
**Fix**:
```bash
# Check service (Windows)
services.msc  # Find & start "postgresql-x64"

# Or restart Docker
docker start erp-postgres
```

### ❌ "Error: Can't find module '@prisma/client'"
**Fix**:
```bash
rm -rf node_modules/.prisma
npx prisma generate
npm install
```

### ❌ "EACCES: permission denied"
**Fix** (macOS/Linux):
```bash
sudo chown -R $USER:$USER ~/erp-app
```

### ❌ "Password authentication failed for user 'postgres'"
**Fix**: Check DATABASE_URL password matches PostgreSQL superuser password

### ❌ "database 'erp_container_db' does not exist"
**Fix**: Buat database manual:
```sql
CREATE DATABASE erp_container_db;
```

---

## 📋 Project Status After Setup

**What's Ready:**
✅ Database schema & migrations  
✅ Authentication framework  
✅ Demo data loaded  
✅ Multi-company structure  
✅ Role-based access control foundation  

**What's Not Yet Ready:**
❌ Dashboard page (404 when login)  
❌ Master data CRUD UIs  
❌ Sales module  
❌ Purchase module  
❌ Reporting  

**Next Phase**: Build UI pages & API endpoints for sales module.

---

## 📞 Help & Troubleshooting

**Check Logs:**
```bash
# Terminal running dev server shows real-time logs
# Browser console (F12) shows client-side errors
```

**Test Database Connection:**
```bash
# Use Prisma Studio
npm run db:studio

# Or direct SQL
psql -U postgres -d erp_container_db
# Then: SELECT * FROM companies;
```

**Re-seed Data:**
```bash
# If you mess up, re-seed:
npm run db:seed
# Data duplicate OK - seed script handles upserts
```

---

## ✅ Setup Complete!

Jika semua langkah di atas berhasil:
1. Aplikasi running di http://localhost:3000
2. Login berhasil dengan demo credentials
3. Database ready untuk development

**Next**: Baca `IMPLEMENTATION_PLAN.md` untuk fase development selanjutnya.

---

**Last Updated**: 2026-09-15  
**Tested On**: Node.js v24+, npm v11+, PostgreSQL 15  
**Estimated Duration**: 30-45 minutes first-time setup
