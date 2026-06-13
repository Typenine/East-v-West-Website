export function formatTransactionDate(timestamp: number): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function transactionTypeLabel(type: 'waiver' | 'free_agent' | 'trade'): string {
  if (type === 'trade') return 'Trade';
  if (type === 'waiver') return 'Waiver';
  return 'Free Agent';
}
