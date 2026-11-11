import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Bitimlarni ko'rish huquqi (backend'da majburiy qo'llanadi):
 *   OPERATOR — faqat o'zi kiritgan bitimlar
 *   AGENT    — o'zi kiritgan + jamoasidagi operatorlar kiritgan + o'z agentligiga yozilgan bitimlar
 *   boshqalar — hammasi
 */
export interface AuthUserLike {
  id: string;
  role: Role | string;
}

/** Agent jamoasi: agentning o'zi va unga biriktirilgan operatorlarning ID lari */
export async function getTeamUserIds(agentUserId: string): Promise<string[]> {
  const ops = await prisma.user.findMany({ where: { parentAgentId: agentUserId }, select: { id: true } });
  return [agentUserId, ...ops.map((o) => o.id)];
}

/** Deal so'rovlariga qo'shiladigan WHERE sharti. Cheklov yo'q bo'lsa bo'sh obyekt. */
export async function dealScopeWhere(user: AuthUserLike): Promise<Prisma.DealWhereInput> {
  if (user.role === Role.OPERATOR) {
    return { createdById: user.id };
  }
  if (user.role === Role.AGENT) {
    const [teamIds, me] = await Promise.all([
      getTeamUserIds(user.id),
      prisma.user.findUnique({ where: { id: user.id }, select: { agencyId: true } }),
    ]);
    const or: Prisma.DealWhereInput[] = [{ createdById: { in: teamIds } }];
    if (me?.agencyId) or.push({ agencyId: me.agencyId });
    return { OR: or };
  }
  return {};
}

/** Foydalanuvchi shu bitimni ko'ra oladimi */
export async function canAccessDeal(user: AuthUserLike, dealId: string): Promise<boolean> {
  const scope = await dealScopeWhere(user);
  const found = await prisma.deal.findFirst({ where: { AND: [{ id: dealId }, scope] }, select: { id: true } });
  return !!found;
}

/** Cheklangan rollar (o'z doirasidan tashqarini ko'rmaydi) */
export function isScopedRole(role: Role | string): boolean {
  return role === Role.OPERATOR || role === Role.AGENT;
}

/** Hisob-kitobga faqat tasdiqlangan bitimlar kiradi — yig'ma so'rovlar uchun WHERE bo'lagi */
export const APPROVED_ONLY: Prisma.DealWhereInput = { approvalStatus: 'APPROVED' };
