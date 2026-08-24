export function currentPeriodLabel(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function periodLabelToDisplay(periodLabel: string): string {
  const [year, month] = periodLabel.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function nextPeriodLabel(periodLabel: string): string {
  const [year, month] = periodLabel.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, 1);
  date.setMonth(date.getMonth() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function dueDateForPeriod(periodLabel: string, dueDay: number | null): Date | null {
  if (!dueDay) return null;
  const [year, month] = periodLabel.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, dueDay);
}
