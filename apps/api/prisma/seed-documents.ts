/**
 * Seeds Default cabinets and real documents (PDFs stored in MinIO + DB rows).
 * Idempotent: cabinets matched by name, documents matched by (title + folder).
 *
 * Requires MinIO reachable at MINIO_ENDPOINT and env loaded from apps/api/.env.
 * Run:  npx ts-node --compiler-options {"module":"CommonJS"} prisma/seed-documents.ts
 */
import { createHash } from 'crypto';
import {
  S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand, HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  CabinetVisibility, DocumentStatus, PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

// ── Storage (mirrors StorageService config) ──────────────────────────────────
const isMinio = (process.env.STORAGE_DRIVER ?? 'minio') === 'minio';
const BUCKET = (isMinio ? process.env.MINIO_BUCKET : process.env.S3_BUCKET) ?? 'fts-documents';
const s3 = new S3Client({
  endpoint: isMinio ? (process.env.MINIO_ENDPOINT ?? 'http://localhost:9000') : undefined,
  region: process.env.AWS_REGION ?? 'us-east-1',
  forcePathStyle: isMinio,
  credentials: {
    accessKeyId: isMinio ? (process.env.MINIO_ACCESS_KEY ?? 'minioadmin') : (process.env.AWS_ACCESS_KEY_ID ?? ''),
    secretAccessKey: isMinio ? (process.env.MINIO_SECRET_KEY ?? 'minioadmin') : (process.env.AWS_SECRET_ACCESS_KEY ?? ''),
  },
});

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`  created bucket "${BUCKET}"`);
  }
}

// ── Content specs ─────────────────────────────────────────────────────────────

const STATUS_CYCLE: DocumentStatus[] = [
  DocumentStatus.FINALIZED, DocumentStatus.DRAFT, DocumentStatus.ON_HOLD, DocumentStatus.FINALIZED,
];

interface DocSpec { title: string; body: string }
interface FolderSpec { name: string; subDividers?: string[]; docs?: DocSpec[] }
interface CabinetSpec {
  name: string;
  visibility: CabinetVisibility;
  ownerEmail?: string; // required for PERSONAL/PRIVATE; ignored for DEFAULT
  folders: FolderSpec[];
}

const doc = (title: string, body: string): DocSpec => ({ title, body });

const SPECS: CabinetSpec[] = [
  // ── DEFAULT cabinets (shared across the business unit) ─────────────────────
  {
    name: 'HR Employee Files',
    visibility: CabinetVisibility.DEFAULT,
    folders: [
      {
        name: 'Adrianne Gorrie',
        subDividers: ['Completed Forms', 'Hire Documents', 'Payroll and Tax Documents'],
        docs: [
          doc('Offer Letter — A. Gorrie', 'Formal offer of employment and compensation summary.'),
          doc('W-4 Tax Form — A. Gorrie', 'Federal income tax withholding election.'),
          doc('Direct Deposit Authorization', 'Bank account details for payroll direct deposit.'),
          doc('Emergency Contact Form', 'Emergency contact and next-of-kin information.'),
        ],
      },
      {
        name: 'Erica Baptiste',
        docs: [
          doc('Offer Letter — E. Baptiste', 'Formal offer of employment and start date.'),
          doc('NDA — E. Baptiste', 'Non-disclosure and confidentiality agreement.'),
        ],
      },
      { name: 'John Doe', docs: [ doc('Employment Contract — J. Doe', 'Standard full-time employment contract.') ] },
    ],
  },
  {
    name: 'Company Policies',
    visibility: CabinetVisibility.DEFAULT,
    folders: [
      {
        name: 'Handbooks',
        docs: [
          doc('Employee Handbook 2026', 'Company-wide policies, benefits and code of conduct.'),
          doc('Remote Work Policy', 'Guidelines and eligibility for remote and hybrid work.'),
        ],
      },
      {
        name: 'Compliance',
        subDividers: ['AML', 'Data Protection'],
        docs: [
          doc('AML Policy', 'Anti-money-laundering procedures and reporting obligations.'),
          doc('Data Protection Policy', 'Handling, retention and disposal of personal data.'),
          doc('Acceptable Use Policy', 'Acceptable use of company IT systems and devices.'),
        ],
      },
    ],
  },
  {
    name: 'Customers',
    visibility: CabinetVisibility.DEFAULT,
    folders: [
      {
        name: 'Loan Applications',
        docs: [
          doc('Loan Application — #10241', 'Personal loan application and supporting documents.'),
          doc('Loan Application — #10242', 'Business loan application and cashflow statement.'),
          doc('KYC Verification — #10241', 'Know-your-customer identity verification record.'),
        ],
      },
      { name: 'Statements', docs: [ doc('Account Statement — Q1 2026', 'Quarterly account statement summary.') ] },
    ],
  },

  // ── A few docs into existing PERSONAL / PRIVATE cabinets (so every scope shows content) ─
  {
    name: 'My Draft Workspace',
    visibility: CabinetVisibility.PERSONAL,
    ownerEmail: 'admin@fts.local',
    folders: [
      { name: 'Drafts', docs: [
        doc('Draft — Project Proposal', 'Working draft of the Q3 project proposal.'),
        doc('Draft — Meeting Notes', 'Rough notes from the weekly sync.'),
      ] },
    ],
  },
  {
    name: 'Executive Board Minutes',
    visibility: CabinetVisibility.PRIVATE,
    ownerEmail: 'admin@fts.local',
    folders: [
      { name: 'Resolutions', docs: [
        doc('Board Resolution 2026-01', 'Approval of the annual operating budget.'),
        doc('Board Resolution 2026-02', 'Appointment of external auditors.'),
      ] },
    ],
  },
];

// ── PDF generation ────────────────────────────────────────────────────────────

async function makePdf(title: string, body: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 0, y: 792, width: 595, height: 50, color: rgb(0.05, 0.16, 0.42) });
  page.drawText('FilePoint DMS', { x: 40, y: 810, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText(title, { x: 40, y: 740, size: 20, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(body, { x: 40, y: 705, size: 12, font, color: rgb(0.25, 0.25, 0.25), maxWidth: 515 });
  page.drawText('This is a seeded sample document for testing the File Explorer.', {
    x: 40, y: 660, size: 10, font, color: rgb(0.5, 0.5, 0.5),
  });
  for (let i = 0; i < 6; i++) {
    page.drawLine({ start: { x: 40, y: 620 - i * 22 }, end: { x: 555, y: 620 - i * 22 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  }
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function main() {
  await ensureBucket();

  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@fts.local' } });
  const businessUnitId = adminUser.businessUnitId;

  let cabCreated = 0, docCreated = 0, docSkipped = 0;
  let statusIdx = 0;

  for (const spec of SPECS) {
    let ownerId: string | null = null;
    if (spec.visibility !== CabinetVisibility.DEFAULT) {
      const owner = await prisma.user.findUnique({ where: { email: spec.ownerEmail! } });
      if (!owner) { console.warn(`  ⚠ owner ${spec.ownerEmail} missing — skipping "${spec.name}"`); continue; }
      ownerId = owner.id;
    }

    // Find or create the cabinet (match by name + owner within the BU).
    let cabinet = await prisma.cabinet.findFirst({
      where: { name: spec.name, businessUnitId, ownerId, isActive: true },
    });
    if (!cabinet) {
      cabinet = await prisma.cabinet.create({
        data: { name: spec.name, businessUnitId, visibility: spec.visibility, ownerId },
      });
      cabCreated++;
      console.log(`  + ${spec.visibility.padEnd(8)} cabinet "${spec.name}"`);
    }

    for (const f of spec.folders) {
      let folder = await prisma.folder.findFirst({
        where: { name: f.name, cabinetId: cabinet.id, isActive: true },
      });
      if (!folder) {
        folder = await prisma.folder.create({ data: { name: f.name, cabinetId: cabinet.id } });
      }
      for (const sd of f.subDividers ?? []) {
        const existsSd = await prisma.subDivider.findFirst({ where: { name: sd, folderId: folder.id, isActive: true } });
        if (!existsSd) await prisma.subDivider.create({ data: { name: sd, folderId: folder.id } });
      }

      for (const d of f.docs ?? []) {
        const existing = await prisma.document.findFirst({
          where: { title: d.title, folderId: folder.id, isActive: true },
        });
        if (existing) { docSkipped++; continue; }

        const buffer = await makePdf(d.title, d.body);
        const fileName = `${d.title.replace(/[^a-z0-9]+/gi, '_')}.pdf`;
        const checksum = createHash('sha256').update(buffer).digest('hex');
        const status = STATUS_CYCLE[statusIdx++ % STATUS_CYCLE.length];

        const created = await prisma.document.create({
          data: { title: d.title, folderId: folder.id, status },
        });
        const storageKey = `${businessUnitId}/${created.id}/1/${fileName}`;

        await s3.send(new PutObjectCommand({
          Bucket: BUCKET, Key: storageKey, Body: buffer, ContentType: 'application/pdf',
        }));
        // sanity: confirm the object landed
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey }));

        await prisma.documentVersion.create({
          data: {
            documentId: created.id,
            versionNumber: 1,
            storageKey,
            fileName,
            mimeType: 'application/pdf',
            fileSize: buffer.length,
            checksum,
            uploadedById: adminUser.id,
          },
        });
        docCreated++;
      }
    }
  }

  console.log(`\nDocument seed complete — ${cabCreated} cabinet(s), ${docCreated} document(s) created, ${docSkipped} skipped.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
