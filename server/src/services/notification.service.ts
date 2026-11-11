/**
 * Bildirishnomalar (Telegram + Android push).
 * Bu fayl hozircha interfeys — to'liq amalga oshirish G bosqichida yoziladi.
 * Qoidasi: bu funksiya HECH QACHON xato tashlamaydi (bildirishnoma ketmasa ham bitim tasdiqlanaveradi).
 */
export interface DealDecisionNotice {
  dealId: string;
  dealNumber: number;
  decision: 'APPROVED' | 'REJECTED';
  reason?: string | null;
  /** Bitimni kiritgan foydalanuvchi (operator/agent) */
  recipientUserId: string | null;
  customerName?: string | null;
  amount?: number;
  decidedByName?: string;
}

export async function notifyDealDecision(_notice: DealDecisionNotice): Promise<void> {
  // G bosqichida to'ldiriladi
}
