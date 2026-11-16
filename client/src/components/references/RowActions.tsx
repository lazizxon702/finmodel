import React from 'react';
import { Edit, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '../ui';
import { useTranslation } from '../../context/LanguageContext';

interface RowActionsProps {
  onEdit: () => void;
  onDelete: () => void;
  /** Yashirilgan (nofaol) yozuvda "Qayta yoqish" ko'rsatiladi */
  inactive?: boolean;
  onRestore?: () => void;
  /** Kichik (agent badge yonidagi) ko'rinish */
  compact?: boolean;
}

// Spravochnik qatorlari uchun yagona "Tahrirlash / O'chirish / Qayta yoqish" tugmalari
export const RowActions: React.FC<RowActionsProps> = ({ onEdit, onDelete, inactive, onRestore, compact }) => {
  const { t } = useTranslation();
  const cls = compact ? '!min-h-0 !min-w-0 h-7 w-7' : '';
  return (
    <div className="inline-flex items-center justify-center gap-1">
      {inactive && onRestore && (
        <Button
          variant="soft"
          size="sm"
          leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
          onClick={onRestore}
        >
          {t('references.restore')}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={cls}
        title={t('common.edit')}
        aria-label={t('common.edit')}
        onClick={onEdit}
      >
        <Edit className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`${cls} text-danger hover:text-danger`}
        title={t('common.delete')}
        aria-label={t('common.delete')}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};
