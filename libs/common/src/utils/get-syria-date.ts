// export function getSyriaDate(): Date {
//   const now = new Date();
//   const SYRIA_OFFSET_MINUTES = 3 * 60;
//   const utcTime = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
//   const syriaTime = new Date(utcTime + SYRIA_OFFSET_MINUTES * 60 * 1000);
//   syriaTime.setHours(0, 0, 0, 0);
//   return syriaTime;
// }

// utils/get-syria-date.ts
export function getSyriaDate(): Date {
  const now = new Date();

  // Get today's date components in Syria timezone
  const syriaDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Damascus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // returns "2026-02-18"

  // Parse as UTC midnight → "2026-02-18T00:00:00.000Z"
  return new Date(syriaDateStr + 'T00:00:00.000Z');
}
