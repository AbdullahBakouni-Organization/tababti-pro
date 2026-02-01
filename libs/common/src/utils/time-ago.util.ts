export function timeAgo(date?: Date): string | null {
  if (!date) return null;

  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);

  const intervals = [
    { label: 'y', seconds: 31536000 },
    { label: 'mo', seconds: 2592000 },
    { label: 'd', seconds: 86400 },
    { label: 'h', seconds: 3600 },
    { label: 'm', seconds: 60 },
  ];

  for (const interval of intervals) {
    const value = Math.floor(seconds / interval.seconds);
    if (value >= 1) return `${value}${interval.label}`;
  }

  return 'now';
}
