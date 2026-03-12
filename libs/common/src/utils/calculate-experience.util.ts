export function calculateYearsOfExperience(startDate?: Date): number {
  if (!startDate) return 0;

  const today = new Date();
  const start = new Date(startDate);
  let years = today.getFullYear() - start.getFullYear();

  const monthDiff = today.getMonth() - start.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < start.getDate()))
    years--;

  return Math.max(0, years);
}
