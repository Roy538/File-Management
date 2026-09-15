import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CabinetVisibility, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CreateCabinetDto } from './dto/create-cabinet.dto';
import { UpdateCabinetDto } from './dto/update-cabinet.dto';
import { CreateFolderDto } from './dto/create-folder.dto';
import { CreateSubDividerDto } from './dto/create-sub-divider.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { SetAclDto } from './dto/set-acl.dto';
import { CreateRetentionPolicyDto } from './dto/create-retention-policy.dto';
import { CreateFromTemplateDto } from './dto/create-from-template.dto';
import { CABINET_TEMPLATES, TemplateFolder } from './cabinet-templates';

@Injectable()
export class CabinetsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Cabinets ──────────────────────────────────────────────────────────────

  /**
   * Builds the visibility clause that decides which cabinets a user may see.
   *  - DEFAULT   → visible to everyone in the business unit
   *  - PERSONAL  → visible only to its owner
   *  - PRIVATE   → visible to its owner and anyone granted an ACL (admins see all)
   * When `scope` is omitted the union of everything the user may see is returned.
   */
  private visibilityClause(user: JwtPayload, scope?: string): Prisma.CabinetWhereInput {
    const isAdmin = user.role === Role.ADMIN;
    const privateAccessible: Prisma.CabinetWhereInput = isAdmin
      ? { visibility: CabinetVisibility.PRIVATE }
      : {
          visibility: CabinetVisibility.PRIVATE,
          OR: [
            { ownerId: user.sub },
            { acls: { some: { OR: [{ userId: user.sub }, { role: user.role }] } } },
          ],
        };

    switch (scope) {
      case CabinetVisibility.PERSONAL:
        return { visibility: CabinetVisibility.PERSONAL, ownerId: user.sub };
      case CabinetVisibility.PRIVATE:
        return privateAccessible;
      case CabinetVisibility.DEFAULT:
        return { visibility: CabinetVisibility.DEFAULT };
      default:
        return isAdmin
          ? {} // admins see every visibility in their business unit
          : {
              OR: [
                { visibility: CabinetVisibility.DEFAULT },
                { visibility: CabinetVisibility.PERSONAL, ownerId: user.sub },
                privateAccessible,
              ],
            };
    }
  }

  listCabinets(user: JwtPayload, scope?: string) {
    return this.prisma.cabinet.findMany({
      where: {
        businessUnitId: user.businessUnitId,
        isActive: true,
        AND: [this.visibilityClause(user, scope)],
      },
      orderBy: { name: 'asc' },
      include: {
        retentionPolicy: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { folders: { where: { isActive: true, parentId: null } } } },
      },
    });
  }

  createCabinet(dto: CreateCabinetDto, user: JwtPayload) {
    const visibility = dto.visibility ?? CabinetVisibility.DEFAULT;
    return this.prisma.cabinet.create({
      data: {
        name: dto.name,
        businessUnitId: user.businessUnitId,
        retentionPolicyId: dto.retentionPolicyId,
        visibility,
        // Personal/Private cabinets belong to their creator; Default cabinets are unowned.
        ownerId: visibility === CabinetVisibility.DEFAULT ? null : user.sub,
      },
    });
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  listTemplates() {
    return CABINET_TEMPLATES;
  }

  /** Create a cabinet and scaffold its folders/sub-dividers from a template. */
  async createFromTemplate(dto: CreateFromTemplateDto, user: JwtPayload) {
    const template = CABINET_TEMPLATES.find(t => t.key === dto.templateKey);
    if (!template) throw new NotFoundException(`Unknown template "${dto.templateKey}"`);

    const visibility = dto.visibility ?? CabinetVisibility.DEFAULT;

    return this.prisma.$transaction(async tx => {
      const cabinet = await tx.cabinet.create({
        data: {
          name: dto.name,
          businessUnitId: user.businessUnitId,
          visibility,
          ownerId: visibility === CabinetVisibility.DEFAULT ? null : user.sub,
        },
      });

      const buildFolders = async (folders: TemplateFolder[], parentId: string | null) => {
        for (const spec of folders) {
          const folder = await tx.folder.create({
            data: { name: spec.name, cabinetId: cabinet.id, parentId },
          });
          for (const sd of spec.subDividers ?? []) {
            await tx.subDivider.create({ data: { name: sd, folderId: folder.id } });
          }
          if (spec.children?.length) await buildFolders(spec.children, folder.id);
        }
      };
      await buildFolders(template.folders, null);

      return cabinet;
    });
  }

  // ── Global search ─────────────────────────────────────────────────────────

  /**
   * Search cabinets, folders, sub-dividers and documents in one call, limited to
   * the cabinets the user is allowed to see (business unit + visibility rules).
   */
  async search(user: JwtPayload, rawQuery: string) {
    const q = (rawQuery ?? '').trim();
    const empty = { query: q, cabinets: [], folders: [], subDividers: [], documents: [] };
    if (q.length < 2) return empty;

    const like = { contains: q, mode: 'insensitive' as const };

    // Which cabinets can this user see?
    const accessible = await this.prisma.cabinet.findMany({
      where: { businessUnitId: user.businessUnitId, isActive: true, AND: [this.visibilityClause(user)] },
      select: { id: true, name: true },
    });
    if (!accessible.length) return empty;
    const idToName = new Map(accessible.map(c => [c.id, c.name]));
    const ids = accessible.map(c => c.id);

    const [folders, subDividers, documents] = await Promise.all([
      this.prisma.folder.findMany({
        where: { isActive: true, cabinetId: { in: ids }, name: like },
        select: { id: true, name: true, cabinetId: true, parent: { select: { name: true } } },
        orderBy: { name: 'asc' }, take: 20,
      }),
      this.prisma.subDivider.findMany({
        where: { isActive: true, name: like, folder: { cabinetId: { in: ids }, isActive: true } },
        select: { id: true, name: true, folder: { select: { id: true, name: true, cabinetId: true } } },
        orderBy: { name: 'asc' }, take: 20,
      }),
      this.prisma.document.findMany({
        where: {
          isActive: true,
          OR: [{ title: like }, { ocrText: like }],
          AND: [{ OR: [
            { folder: { cabinetId: { in: ids } } },
            { subDivider: { folder: { cabinetId: { in: ids } } } },
          ] }],
        },
        select: {
          id: true, title: true, status: true,
          documentType: { select: { name: true } },
          folder: { select: { id: true, name: true, cabinetId: true } },
          subDivider: { select: { id: true, name: true, folder: { select: { id: true, name: true, cabinetId: true } } } },
        },
        orderBy: { updatedAt: 'desc' }, take: 30,
      }),
    ]);

    const cabinetHits = accessible
      .filter(c => c.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 20)
      .map(c => ({
        type: 'cabinet' as const, id: c.id, name: c.name,
        cabinetId: c.id, cabinetName: c.name, path: c.name,
      }));

    const folderHits = folders.map(f => ({
      type: 'folder' as const, id: f.id, name: f.name,
      cabinetId: f.cabinetId, cabinetName: idToName.get(f.cabinetId) ?? '', folderId: f.id,
      path: [idToName.get(f.cabinetId) ?? '', f.parent?.name].filter(Boolean).join(' / '),
    }));

    const subDividerHits = subDividers.map(sd => ({
      type: 'subdivider' as const, id: sd.id, name: sd.name,
      cabinetId: sd.folder.cabinetId, cabinetName: idToName.get(sd.folder.cabinetId) ?? '',
      folderId: sd.folder.id, subDividerId: sd.id,
      path: [idToName.get(sd.folder.cabinetId) ?? '', sd.folder.name].filter(Boolean).join(' / '),
    }));

    const documentHits = documents.map(d => {
      const inFolder = d.folder;
      const inSub = d.subDivider;
      const cabinetId = inFolder?.cabinetId ?? inSub?.folder.cabinetId ?? '';
      const locationName = inFolder?.name ?? inSub?.name ?? '';
      return {
        type: 'document' as const, id: d.id, name: d.title,
        cabinetId, cabinetName: idToName.get(cabinetId) ?? '',
        folderId: inFolder?.id ?? inSub?.folder.id,
        subDividerId: inSub?.id,
        documentId: d.id,
        path: [idToName.get(cabinetId) ?? '', locationName].filter(Boolean).join(' / '),
        meta: [d.documentType?.name, d.status].filter(Boolean).join(' · '),
      };
    });

    return {
      query: q,
      cabinets: cabinetHits,
      folders: folderHits,
      subDividers: subDividerHits,
      documents: documentHits,
    };
  }

  async getCabinet(id: string, user: JwtPayload) {
    const cabinet = await this.prisma.cabinet.findFirst({
      where: { id, businessUnitId: user.businessUnitId, isActive: true },
      include: {
        retentionPolicy: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        acls: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        folders: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          include: {
            subDividers: { where: { isActive: true }, orderBy: { name: 'asc' } },
            _count: { select: { documents: { where: { isActive: true } } } },
          },
        },
      },
    });
    if (!cabinet) throw new NotFoundException('Cabinet not found');

    // Enforce visibility on direct access (listing already filters).
    const isAdmin = user.role === Role.ADMIN;
    const isOwner = cabinet.ownerId === user.sub;
    if (cabinet.visibility === CabinetVisibility.PERSONAL && !isOwner && !isAdmin) {
      throw new ForbiddenException('This is a personal cabinet');
    }
    if (cabinet.visibility === CabinetVisibility.PRIVATE && !isOwner && !isAdmin) {
      const hasAcl = cabinet.acls.some(a => a.userId === user.sub || a.role === user.role);
      if (!hasAcl) throw new ForbiddenException('You do not have access to this cabinet');
    }
    return cabinet;
  }

  updateCabinet(id: string, dto: UpdateCabinetDto) {
    return this.prisma.cabinet.update({
      where: { id },
      data: { name: dto.name, retentionPolicyId: dto.retentionPolicyId },
    });
  }

  deleteCabinet(id: string) {
    return this.prisma.cabinet.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  // ── Folders ───────────────────────────────────────────────────────────────

  createFolder(cabinetId: string, dto: CreateFolderDto) {
    return this.prisma.folder.create({
      data: { name: dto.name, cabinetId, parentId: dto.parentId ?? null },
    });
  }

  async getFolder(id: string) {
    const folder = await this.prisma.folder.findFirst({
      where: { id, isActive: true },
      include: {
        cabinet: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true } },
        subDividers: { where: { isActive: true }, orderBy: { name: 'asc' } },
        children: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          include: { subDividers: { where: { isActive: true }, orderBy: { name: 'asc' } } },
        },
        acls: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        _count: { select: { documents: { where: { isActive: true } } } },
      },
    });
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  updateFolder(id: string, name: string) {
    return this.prisma.folder.update({ where: { id }, data: { name } });
  }

  deleteFolder(id: string) {
    return this.prisma.folder.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  }

  /** All active folder IDs beneath `rootId` (excludes rootId itself). */
  private async collectDescendantFolderIds(rootId: string): Promise<Set<string>> {
    const result = new Set<string>();
    let frontier = [rootId];
    while (frontier.length) {
      const children = await this.prisma.folder.findMany({
        where: { parentId: { in: frontier }, isActive: true },
        select: { id: true },
      });
      const next: string[] = [];
      for (const c of children) {
        if (!result.has(c.id)) { result.add(c.id); next.push(c.id); }
      }
      frontier = next;
    }
    return result;
  }

  /** Re-parent a folder (optionally into another cabinet), cascading cabinetId to descendants. */
  async moveFolder(id: string, dto: { cabinetId?: string; parentId?: string | null }) {
    const folder = await this.prisma.folder.findFirst({ where: { id, isActive: true } });
    if (!folder) throw new NotFoundException('Folder not found');

    const targetParentId = dto.parentId ?? null;
    const descendants = await this.collectDescendantFolderIds(id);

    let targetCabinetId = dto.cabinetId ?? folder.cabinetId;

    if (targetParentId) {
      if (targetParentId === id) throw new BadRequestException('Cannot move a folder into itself');
      if (descendants.has(targetParentId)) throw new BadRequestException('Cannot move a folder into its own sub-folder');
      const parent = await this.prisma.folder.findFirst({ where: { id: targetParentId, isActive: true } });
      if (!parent) throw new NotFoundException('Target folder not found');
      targetCabinetId = parent.cabinetId; // a child always lives in its parent's cabinet
    }

    // No-op guard
    if (targetParentId === folder.parentId && targetCabinetId === folder.cabinetId) {
      return folder;
    }

    await this.prisma.folder.update({
      where: { id },
      data: { parentId: targetParentId, cabinetId: targetCabinetId },
    });

    if (targetCabinetId !== folder.cabinetId && descendants.size) {
      await this.prisma.folder.updateMany({
        where: { id: { in: [...descendants] } },
        data: { cabinetId: targetCabinetId },
      });
    }

    return this.prisma.folder.findUnique({ where: { id } });
  }

  /** Move a sub-divider into a different folder. */
  async moveSubDivider(id: string, folderId: string) {
    const sd = await this.prisma.subDivider.findFirst({ where: { id, isActive: true } });
    if (!sd) throw new NotFoundException('Sub-divider not found');
    const folder = await this.prisma.folder.findFirst({ where: { id: folderId, isActive: true } });
    if (!folder) throw new NotFoundException('Target folder not found');
    if (sd.folderId === folderId) return sd;
    return this.prisma.subDivider.update({ where: { id }, data: { folderId } });
  }

  // ── Sub-Dividers ──────────────────────────────────────────────────────────

  createSubDivider(folderId: string, dto: CreateSubDividerDto) {
    return this.prisma.subDivider.create({ data: { name: dto.name, folderId } });
  }

  updateSubDivider(id: string, name: string) {
    return this.prisma.subDivider.update({ where: { id }, data: { name } });
  }

  deleteSubDivider(id: string) {
    return this.prisma.subDivider.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  }

  // ── Document Types ────────────────────────────────────────────────────────

  listDocumentTypes() {
    return this.prisma.documentType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { documents: { where: { isActive: true } } } } },
    });
  }

  createDocumentType(dto: CreateDocumentTypeDto) {
    return this.prisma.documentType.create({ data: { name: dto.name, description: dto.description } });
  }

  updateDocumentType(id: string, dto: Partial<CreateDocumentTypeDto>) {
    return this.prisma.documentType.update({ where: { id }, data: dto });
  }

  deleteDocumentType(id: string) {
    return this.prisma.documentType.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  }

  // ── ACLs ──────────────────────────────────────────────────────────────────

  setAcl(targetType: 'cabinet' | 'folder', targetId: string, dto: SetAclDto) {
    return this.prisma.documentACL.create({
      data: {
        permission: dto.permission,
        userId: dto.userId,
        role: dto.role,
        cabinetId: targetType === 'cabinet' ? targetId : undefined,
        folderId: targetType === 'folder' ? targetId : undefined,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  listAcls(targetType: 'cabinet' | 'folder', targetId: string) {
    return this.prisma.documentACL.findMany({
      where: {
        cabinetId: targetType === 'cabinet' ? targetId : undefined,
        folderId: targetType === 'folder' ? targetId : undefined,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  removeAcl(aclId: string) {
    return this.prisma.documentACL.delete({ where: { id: aclId } });
  }

  // ── Retention Policies ────────────────────────────────────────────────────

  listRetentionPolicies() {
    return this.prisma.retentionPolicy.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  createRetentionPolicy(dto: CreateRetentionPolicyDto) {
    return this.prisma.retentionPolicy.create({ data: dto });
  }

  updateRetentionPolicy(id: string, dto: Partial<CreateRetentionPolicyDto>) {
    return this.prisma.retentionPolicy.update({ where: { id }, data: dto });
  }

  deleteRetentionPolicy(id: string) {
    return this.prisma.retentionPolicy.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  }
}
