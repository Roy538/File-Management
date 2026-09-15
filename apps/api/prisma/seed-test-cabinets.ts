/**
 * Idempotent seed for Personal / Private cabinets (for testing the File Explorer scopes).
 * Run:  npx ts-node --compiler-options {"module":"CommonJS"} prisma/seed-test-cabinets.ts
 * Safe to re-run — cabinets are matched by (name + ownerId) and skipped if they already exist.
 */
import { AclPermission, CabinetVisibility, PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

interface FolderSpec { name: string; subDividers?: string[] }
interface CabinetSpec {
  name: string;
  visibility: CabinetVisibility;
  ownerEmail: string;
  folders?: FolderSpec[];
  acls?: Array<{ role?: Role; userEmail?: string; permission: AclPermission }>;
}

const SPECS: CabinetSpec[] = [
  // ── Personal (owned by dev admin) ──────────────────────────────────────────
  {
    name: 'My Draft Workspace',
    visibility: CabinetVisibility.PERSONAL,
    ownerEmail: 'admin@fts.local',
    folders: [{ name: 'Drafts' }, { name: 'Scratch Notes' }],
  },
  {
    name: 'Personal Templates',
    visibility: CabinetVisibility.PERSONAL,
    ownerEmail: 'admin@fts.local',
    folders: [{ name: 'Letter Templates', subDividers: ['Formal', 'Informal'] }, { name: 'Spreadsheet Templates' }],
  },
  {
    name: 'My Scanned Receipts',
    visibility: CabinetVisibility.PERSONAL,
    ownerEmail: 'admin@fts.local',
    folders: [{ name: '2026 Receipts', subDividers: ['Q1', 'Q2'] }],
  },

  // ── Personal (owned by an officer, so the officer has their own test data) ──
  {
    name: 'Officer Personal Notes',
    visibility: CabinetVisibility.PERSONAL,
    ownerEmail: 'officer.hq@mc.com',
    folders: [{ name: 'Call Logs' }],
  },

  // ── Private (owned by dev admin, shared with the OFFICER role) ─────────────
  {
    name: 'Executive Board Minutes',
    visibility: CabinetVisibility.PRIVATE,
    ownerEmail: 'admin@fts.local',
    folders: [{ name: '2026', subDividers: ['Q1', 'Q2'] }, { name: 'Resolutions' }],
    acls: [{ role: Role.OFFICER, permission: AclPermission.READ }],
  },
  {
    name: 'Legal — Confidential',
    visibility: CabinetVisibility.PRIVATE,
    ownerEmail: 'admin@fts.local',
    folders: [{ name: 'Contracts', subDividers: ['Active', 'Expired'] }, { name: 'NDAs' }],
    acls: [{ role: Role.OFFICER, permission: AclPermission.READ }],
  },

  // ── Private (owned by an officer, shared explicitly with the admin user) ────
  {
    name: 'Officer Case Files',
    visibility: CabinetVisibility.PRIVATE,
    ownerEmail: 'officer.hq@mc.com',
    folders: [{ name: 'Open Cases' }, { name: 'Closed Cases' }],
    acls: [{ userEmail: 'admin@fts.local', permission: AclPermission.READ }],
  },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const spec of SPECS) {
    const owner = await prisma.user.findUnique({ where: { email: spec.ownerEmail } });
    if (!owner) {
      console.warn(`  ⚠ owner ${spec.ownerEmail} not found — skipping "${spec.name}" (run the base seed first)`);
      continue;
    }

    const existing = await prisma.cabinet.findFirst({
      where: { name: spec.name, ownerId: owner.id, isActive: true },
    });
    if (existing) {
      skipped++;
      console.log(`  = "${spec.name}" already exists — skipped`);
      continue;
    }

    const cabinet = await prisma.cabinet.create({
      data: {
        name: spec.name,
        businessUnitId: owner.businessUnitId,
        visibility: spec.visibility,
        ownerId: owner.id,
      },
    });

    for (const f of spec.folders ?? []) {
      const folder = await prisma.folder.create({
        data: { name: f.name, cabinetId: cabinet.id },
      });
      for (const sd of f.subDividers ?? []) {
        await prisma.subDivider.create({ data: { name: sd, folderId: folder.id } });
      }
    }

    for (const acl of spec.acls ?? []) {
      let userId: string | undefined;
      if (acl.userEmail) {
        const u = await prisma.user.findUnique({ where: { email: acl.userEmail } });
        userId = u?.id;
      }
      await prisma.documentACL.create({
        data: {
          permission: acl.permission,
          role: acl.role,
          userId,
          cabinetId: cabinet.id,
        },
      });
    }

    created++;
    console.log(`  + ${spec.visibility.padEnd(8)} "${spec.name}"  (owner ${spec.ownerEmail}, ${spec.folders?.length ?? 0} folder(s))`);
  }

  console.log(`\nTest-cabinet seed complete — ${created} created, ${skipped} already existed.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
