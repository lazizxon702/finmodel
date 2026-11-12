import React from 'react';
import { cn } from '../../lib/cn';

// DataTable o'ramlari. Tuzilishi:
//
//   <TableContainer>                         ← mobil gorizontal skroll + chegara
//     <Table>
//       <Thead><Tr><Th>Sana</Th><Th align="right">Summa</Th></Tr></Thead>
//       <Tbody>
//         {rows.length === 0 && <TableEmpty colSpan={2} title={t('common.noData')} />}
//         {rows.map(r => <Tr key={r.id}><Td>...</Td><Td align="right" numeric>...</Td></Tr>)}
//       </Tbody>
//     </Table>
//   </TableContainer>

type Align = 'left' | 'center' | 'right';
const ALIGN: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };

interface TableContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Berilsa vertikal skroll va yopishqoq sarlavha yoqiladi, masalan "max-h-[60vh]" */
  maxHeightClass?: string;
  /** Karta ichida (padding="none") ishlatilganda tashqi chegarani olib tashlaydi */
  bare?: boolean;
}

export const TableContainer: React.FC<TableContainerProps> = ({ maxHeightClass, bare, className, children, ...rest }) => (
  <div
    className={cn(
      'w-full overflow-x-auto',
      !bare && 'rounded-card border border-line bg-surface shadow-card',
      maxHeightClass && ['overflow-y-auto', maxHeightClass],
      className
    )}
    {...rest}
  >
    {children}
  </div>
);

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className, children, ...rest }) => (
  <table className={cn('w-full border-separate border-spacing-0 text-sm text-fg', className)} {...rest}>
    {children}
  </table>
);

export const Thead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, children, ...rest }) => (
  <thead className={cn('sticky top-0 z-10', className)} {...rest}>
    {children}
  </thead>
);

export const Tbody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className, children, ...rest }) => (
  <tbody className={cn('[&>tr:last-child>td]:border-b-0', className)} {...rest}>
    {children}
  </tbody>
);

interface TrProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Qator bosiladigan bo'lsa hover/kursor qo'shiladi */
  clickable?: boolean;
}

export const Tr: React.FC<TrProps> = ({ clickable, className, children, ...rest }) => (
  <tr className={cn('transition-colors hover:bg-brand-soft/40', clickable && 'cursor-pointer', className)} {...rest}>
    {children}
  </tr>
);

interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
}

export const Th: React.FC<ThProps> = ({ align = 'left', className, children, ...rest }) => (
  <th
    scope="col"
    className={cn(
      'whitespace-nowrap border-b border-line bg-surface-2 px-3 py-3 text-xs font-semibold text-fg-secondary',
      ALIGN[align],
      className
    )}
    {...rest}
  >
    {children}
  </th>
);

interface TdProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: Align;
  /** Raqamli ustun: tabular-nums + qatorni sindirmaslik */
  numeric?: boolean;
}

export const Td: React.FC<TdProps> = ({ align = 'left', numeric, className, children, ...rest }) => (
  <td
    className={cn(
      'border-b border-line px-3 py-3 align-middle',
      ALIGN[align],
      numeric && 'whitespace-nowrap tabular-nums',
      className
    )}
    {...rest}
  >
    {children}
  </td>
);

interface TableEmptyProps {
  colSpan: number;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
}

/** Jadval bo'sh bo'lganda bitta to'liq kenglikdagi qator. */
export const TableEmpty: React.FC<TableEmptyProps> = ({ colSpan, title, description, icon }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10 text-center">
      {icon && <div className="mb-2 flex justify-center text-fg-muted [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <p className="text-sm font-medium text-fg-secondary">{title}</p>
      {description && <p className="mt-1 text-[13px] text-fg-muted">{description}</p>}
    </td>
  </tr>
);
