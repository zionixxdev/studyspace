import { describe, expect, it } from 'vitest';
import {
  createConversationSchema,
  initUploadSchema,
  sendMessageSchema,
  updateProfileSchema,
  usernameSchema,
  createTaskSchema,
} from './schemas';

describe('usernameSchema', () => {
  it('accepts valid usernames', () => {
    expect(usernameSchema.parse('aditya_01')).toBe('aditya_01');
  });
  it('rejects names starting with a digit, or too short', () => {
    expect(usernameSchema.safeParse('1abc').success).toBe(false);
    expect(usernameSchema.safeParse('ab').success).toBe(false);
    expect(usernameSchema.safeParse('has space').success).toBe(false);
  });
});

describe('sendMessageSchema', () => {
  it('trims and rejects empty bodies', () => {
    expect(sendMessageSchema.parse({ body: '  hi  ' }).body).toBe('hi');
    expect(sendMessageSchema.safeParse({ body: '   ' }).success).toBe(false);
  });
  it('enforces the maximum length', () => {
    expect(sendMessageSchema.safeParse({ body: 'x'.repeat(4001) }).success).toBe(false);
  });
});

describe('createConversationSchema', () => {
  it('requires exactly one other member for a direct chat', () => {
    const bad = createConversationSchema.safeParse({
      type: 'direct',
      memberIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
    });
    expect(bad.success).toBe(false);
  });
  it('allows several members for a group', () => {
    const ok = createConversationSchema.safeParse({
      type: 'group',
      memberIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
    });
    expect(ok.success).toBe(true);
  });
});

describe('initUploadSchema', () => {
  it('rejects disallowed mime types and oversized files', () => {
    const base = {
      name: 'notes.pdf',
      sizeBytes: 1024,
      idempotencyKey: 'abcdefgh',
    };
    expect(initUploadSchema.safeParse({ ...base, mime: 'application/x-msdownload' }).success).toBe(false);
    expect(initUploadSchema.safeParse({ ...base, mime: 'application/pdf', sizeBytes: 26 * 1024 * 1024 }).success).toBe(false);
    expect(initUploadSchema.safeParse({ ...base, mime: 'application/pdf' }).success).toBe(true);
  });
});

describe('updateProfileSchema', () => {
  it('caps bio length', () => {
    expect(updateProfileSchema.safeParse({ bio: 'x'.repeat(281) }).success).toBe(false);
  });
});

describe('createTaskSchema', () => {
  it('defaults priority to medium', () => {
    expect(createTaskSchema.parse({ title: 'Revise' }).priority).toBe('medium');
  });
});
