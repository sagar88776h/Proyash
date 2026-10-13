import type { ReportSnapshot } from '@/lib/api/public';

export function reportIncome(report: { summary: ReportSnapshot }): number {
  const i = report.summary.income ?? { member_contributions: 0, public_donations: 0, other_income: 0 };
  return Number(i.member_contributions ?? 0) + Number(i.public_donations ?? 0) + Number(i.other_income ?? 0);
}

export function reportSpending(report: { summary: ReportSnapshot }): number {
  return Number(report.summary.expenditure_total ?? 0) + Number(report.summary.refunds ?? 0);
}
