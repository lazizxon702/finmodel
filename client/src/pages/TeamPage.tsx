import React from 'react';
import { UsersRound } from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import { Card, EmptyState, PageHeader } from '../components/ui';

// TO'LDIRGICH: agent o'z operatorlarini boshqaradigan sahifa keyingi bosqichda to'ldiriladi.
// Marshrut: /team (AGENT, ADMIN).
// Matnlar uchun i18n/modules/team.ts modulini yarating (docs/DESIGN_SYSTEM.md, 3-bo'lim).
export const TeamPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader icon={<UsersRound />} title={t('title.team')} description={t('menu.team_sub')} />
      <Card>
        <EmptyState icon={<UsersRound />} title={t('common.comingSoon')} description={t('common.comingSoon_hint')} />
      </Card>
    </div>
  );
};
export default TeamPage;
