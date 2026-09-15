import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BUS = [
  { name: 'MyCredit', code: 'MC' },
  { name: 'Tijaara', code: 'TJ' },
  { name: 'Zazipay', code: 'ZP' },
];

const BRANCHES = [
  { name: 'Headquarters', code: 'HQ' },
  { name: 'Branch 1', code: 'BR1' },
];

async function main() {
  const passwordHash = await bcrypt.hash('Password@123', 12);

  // ── Super Admin ─────────────────────────────────────────────────────────────
  const superHash = await bcrypt.hash('SuperAdmin1234!', 12);
  const sysBu = await prisma.businessUnit.upsert({
    where: { code: 'SYS' },
    update: {},
    create: { name: 'System', code: 'SYS' },
  });
  const sysBranch = await prisma.branch.upsert({
    where: { businessUnitId_code: { businessUnitId: sysBu.id, code: 'SYS' } },
    update: {},
    create: { name: 'System Branch', code: 'SYS', businessUnitId: sysBu.id },
  });
  await prisma.user.upsert({
    where: { email: 'superadmin@fts.local' },
    update: {},
    create: {
      email: 'superadmin@fts.local',
      passwordHash: superHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
      branchId: sysBranch.id,
      businessUnitId: sysBu.id,
    },
  });

  for (const buData of BUS) {
    const bu = await prisma.businessUnit.upsert({
      where: { code: buData.code },
      update: {},
      create: { name: buData.name, code: buData.code },
    });

    for (const brData of BRANCHES) {
      const branch = await prisma.branch.upsert({
        where: { businessUnitId_code: { businessUnitId: bu.id, code: brData.code } },
        update: {},
        create: {
          name: `${buData.name} ${brData.name}`,
          code: brData.code,
          businessUnitId: bu.id,
        },
      });

      const slug = buData.code.toLowerCase();
      const brSlug = brData.code.toLowerCase();

      await prisma.user.upsert({
        where: { email: `admin.${brSlug}@${slug}.com` },
        update: {},
        create: {
          email: `admin.${brSlug}@${slug}.com`,
          passwordHash,
          firstName: 'Admin',
          lastName: `${buData.name} ${brData.name}`,
          role: Role.ADMIN,
          branchId: branch.id,
          businessUnitId: bu.id,
        },
      });

      await prisma.user.upsert({
        where: { email: `officer.${brSlug}@${slug}.com` },
        update: {},
        create: {
          email: `officer.${brSlug}@${slug}.com`,
          passwordHash,
          firstName: 'Officer',
          lastName: `${buData.name} ${brData.name}`,
          role: Role.OFFICER,
          branchId: branch.id,
          businessUnitId: bu.id,
        },
      });
    }
  }

  // Canonical dev admin — consistent email used in docs and dev bypass
  const firstBu = await prisma.businessUnit.findFirstOrThrow({ where: { code: 'MC' } });
  const firstBranch = await prisma.branch.findFirstOrThrow({
    where: { businessUnitId: firstBu.id, code: 'HQ' },
  });
  const adminHash = await bcrypt.hash('Admin1234!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@fts.local' },
    update: {},
    create: {
      email: 'admin@fts.local',
      passwordHash: adminHash,
      firstName: 'System',
      lastName: 'Admin',
      role: Role.ADMIN,
      branchId: firstBranch.id,
      businessUnitId: firstBu.id,
    },
  });

  const total = await prisma.user.count();
  console.log(`Seed complete — ${total} users in DB`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
