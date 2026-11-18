import { CabinetVisibility, Role } from '@prisma/client';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { accessibleCabinetWhere, accessibleDocumentWhere, cabinetVisibilityClause } from './cabinet-access';

const user = (role: Role, bu = 'bu-1'): JwtPayload =>
  ({ sub: 'u-1', email: 'x@y', role, businessUnitId: bu, branchId: 'b-1' } as unknown as JwtPayload);

describe('cabinet access rules', () => {
  it('always binds cabinets to the caller\'s business unit (tenant isolation)', () => {
    for (const role of Object.values(Role)) {
      const w = accessibleCabinetWhere(user(role, 'bu-42'));
      expect(w.businessUnitId).toBe('bu-42');
      expect(w.isActive).toBe(true);
    }
  });

  it('admins see every visibility, but still only within their tenant', () => {
    const w = accessibleCabinetWhere(user(Role.ADMIN, 'bu-7'));
    expect(w.AND).toEqual([{}]);
    expect(w.businessUnitId).toBe('bu-7');
  });

  it('non-admins see DEFAULT, own PERSONAL, and PRIVATE via owner/ACL only', () => {
    const c = cabinetVisibilityClause(user(Role.OFFICER));
    expect(c.OR).toEqual([
      { visibility: CabinetVisibility.DEFAULT },
      { visibility: CabinetVisibility.PERSONAL, ownerId: 'u-1' },
      {
        visibility: CabinetVisibility.PRIVATE,
        OR: [
          { ownerId: 'u-1' },
          { acls: { some: { OR: [{ userId: 'u-1' }, { role: Role.OFFICER }] } } },
        ],
      },
    ]);
  });

  it('PERSONAL scope never exposes another user\'s cabinets, even to admins', () => {
    expect(cabinetVisibilityClause(user(Role.ADMIN), CabinetVisibility.PERSONAL))
      .toEqual({ visibility: CabinetVisibility.PERSONAL, ownerId: 'u-1' });
  });

  it('documents are reachable only through an accessible cabinet (folder or sub-divider path)', () => {
    const w = accessibleDocumentWhere(user(Role.DEPT_USER, 'bu-9')) as any;
    expect(w.isActive).toBe(true);
    expect(w.OR).toHaveLength(2);
    expect(w.OR[0].folder.cabinet.businessUnitId).toBe('bu-9');
    expect(w.OR[1].subDivider.folder.cabinet.businessUnitId).toBe('bu-9');
  });
});
