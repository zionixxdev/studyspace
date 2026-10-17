import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, initials, timeAgo, cn } from './utils';

describe('formatBytes', () => {
  it('handles zero and negatives', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-10)).toBe('0 B');
  });
  it('scales through KB/MB/GB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
  });
});

describe('formatDuration', () => {
  it('renders seconds, minutes and hours', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m 30s');
    expect(formatDuration(3661)).toBe('1h 1m');
  });
});

describe('initials', () => {
  it('takes up to two initials', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Prince')).toBe('P');
    expect(initials('  ')).toBe('');
  });
});

describe('timeAgo', () => {
  it('returns empty for missing values', () => {
    expect(timeAgo(null)).toBe('');
    expect(timeAgo(undefined)).toBe('');
  });
  it('reports recent times', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now');
  });
});

describe('cn', () => {
  it('merges tailwind classes, last wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-sm', false && 'hidden', 'font-bold')).toBe('text-sm font-bold');
  });
});
