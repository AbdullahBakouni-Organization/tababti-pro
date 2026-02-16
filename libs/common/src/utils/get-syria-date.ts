export function getSyriaDate(): Date {
  const now = new Date();
  const SYRIA_OFFSET_MINUTES = 3 * 60;
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const syriaTime = new Date(utcTime + SYRIA_OFFSET_MINUTES * 60 * 1000);
  syriaTime.setHours(0, 0, 0, 0);
  return syriaTime;
}
