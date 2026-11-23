/**
 * Yandex Split (egasi, 23.11.2026): "Apple" do'konini yaratadi (yo'q bo'lsa) va "Yandex Split → Apple" juftligini qo'shadi.
 * Standart DRY-RUN; --apply bilan yozadi (avval backup-db-raw.ts). Agent foydasi 0 — kodda (calculation.service isNoAgentProvider).
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
const APPLY = process.argv.includes('--apply');
// Egasi (23.11.2026 kech): do'kon "Apple" emas — o'zi qo'shgan "Split RB"
const STORE_NAME = 'Split RB';
async function main() {
  console.log(`═══ YANDEX SPLIT → ${STORE_NAME} ═══ ${APPLY ? '(--apply: YOZADI)' : '(DRY-RUN)'}`);
  const prov = await prisma.provider.findFirst({ where: { name: { equals: 'Yandex Split', mode: 'insensitive' } } });
  const store = await prisma.store.findFirst({ where: { name: { equals: STORE_NAME, mode: 'insensitive' } } });
  const agency = await prisma.agency.findFirst({ where: { name: { equals: 'Apple', mode: 'insensitive' } }, include: { agents: true } });
  const check = await prisma.appSetting.findUnique({ where: { key: 'store_provider_check' } });
  console.log(`  provayder: ${prov ? prov.name : 'TOPILMADI'}`);
  console.log(`  do'kon "${STORE_NAME}": ${store ? `bor${store.isActive ? '' : ' (yashirin — faollashtiriladi)'}` : 'YARATILADI'}`);
  console.log(`  agentlik "Apple": ${agency ? `bor, operatorlar: ${agency.agents.map((a) => a.name).join(', ') || "yo'q"}` : 'TOPILMADI'}`);
  console.log(`  juftlik tekshiruvi: ${check?.value || 'off'}`);
  if (!prov) throw new Error('Yandex Split provayderi topilmadi');
  if (!APPLY) { console.log('DRY-RUN tugadi — bazaga hech narsa yozilmadi.'); return; }
  await prisma.$transaction(async (tx) => {
    const s = store ? (store.isActive ? store : await tx.store.update({ where: { id: store.id }, data: { isActive: true } })) : await tx.store.create({ data: { name: STORE_NAME } });
    await tx.storeProviderPair.createMany({ data: [{ storeId: s.id, providerId: prov.id }], skipDuplicates: true });
  });
  console.log('YOZILDI.');
}
main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
