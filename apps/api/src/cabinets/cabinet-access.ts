import { CabinetVisibility, Prisma, Role } from '@prisma/client';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Single source of truth for "which cabinets may this user see".
 *  - DEFAULT   → everyone in the business unit
 *  - PERSONAL  → owner only (admins of the BU too)
 *  - PRIVATE   → owner + ACL grantees (admins of the BU too)
 * `scope` narrows to one visibility; omitted = union of all the user may see.
 * Tenant (business unit) is NOT included here — use `accessibleCabinetWhere`.
 */
export function cabinetVisibilityClause(user: JwtPayload, scope?: string): Prisma.CabinetWhereInput {
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
        ? {}
        : {
            OR: [
              { visibility: CabinetVisibility.DEFAULT },
              { visibility: CabinetVisibility.PERSONAL, ownerId: user.sub },
              privateAccessible,
            ],
          };
  }
}

/** Cabinets the user may see: tenant-bound, active, visibility-filtered. */
export function accessibleCabinetWhere(user: JwtPayload): Prisma.CabinetWhereInput {
  return { businessUnitId: user.businessUnitId, isActive: true, AND: [cabinetVisibilityClause(user)] };
}

/** Folders that live in an accessible cabinet. */
export function accessibleFolderWhere(user: JwtPayload): Prisma.FolderWhereInput {
  return { isActive: true, cabinet: accessibleCabinetWhere(user) };
}

/**
 * Documents the user may see. A document lives either directly in a folder or
 * in a sub-divider of a folder; both paths must resolve to an accessible cabinet.
 */
export function accessibleDocumentWhere(user: JwtPayload): Prisma.DocumentWhereInput {
  const folder = accessibleFolderWhere(user);
  return {
    isActive: true,
    OR: [{ folder }, { subDivider: { isActive: true, folder } }],
  };
}
