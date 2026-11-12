import React from 'react';
import { Handshake } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import { Card, EmptyState, PageHeader } from '../components/ui';

// TO'LDIRGICH: Trust hisob-kitobi sahifasi keyingi bosqichda to'ldiriladi.
// Marshrut: /trust (ADMIN, MANAGER, CFO, COO, CASHIER, VIEWER). Real vaqt: useRealtime('trust:updated', ...).
// Matnlar uchun i18n/modules/trust.ts modulini yarating (docs/DESIGN_SYSTEM.md, 3-bo'lim).
export const TrustPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader icon={<Handshake />} title={t('title.trust')} description={t('menu.trust_sub')} />
      <Card>
        <EmptyState icon={<Handshake />} title={t('common.comingSoon')} description={t('common.comingSoon_hint')} />
      </Card>
    </div>
  );
};
export default TrustPage;
