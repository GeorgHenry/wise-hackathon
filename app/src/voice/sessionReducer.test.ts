import { describe, expect, it } from 'vitest';
import { idleSession, reduceSession, type SessionEvent, type SessionView } from './sessionReducer';

const after = (...events: SessionEvent[]): SessionView => events.reduce(reduceSession, idleSession);

const CONNECTED: SessionEvent[] = [{ type: 'start' }, { type: 'status', status: 'connecting' }, { type: 'status', status: 'connected' }];

describe('session phases', () => {
  it('is idle before anything starts', () => {
    expect(idleSession.phase).toBe('idle');
  });

  it('is connecting from the start until the agent answers', () => {
    expect(after({ type: 'start' }).phase).toBe('connecting');
    expect(after({ type: 'start' }, { type: 'status', status: 'connecting' }).phase).toBe('connecting');
  });

  it('listens once connected', () => {
    expect(after(...CONNECTED).phase).toBe('listening');
  });

  it('shows speaking while the agent talks and listening again afterwards', () => {
    expect(after(...CONNECTED, { type: 'mode', mode: 'speaking' }).phase).toBe('speaking');
    expect(after(...CONNECTED, { type: 'mode', mode: 'speaking' }, { type: 'mode', mode: 'listening' }).phase).toBe('listening');
  });

  it('shows working while a tool runs, whatever the agent last did', () => {
    const view = after(...CONNECTED, { type: 'mode', mode: 'speaking' }, { type: 'tool', name: 'get_balances', phase: 'start' });
    expect(view.phase).toBe('working');
  });

  it('goes back to the agent’s mode when the tool ends', () => {
    const view = after(
      ...CONNECTED,
      { type: 'tool', name: 'get_balances', phase: 'start' },
      { type: 'tool', name: 'get_balances', phase: 'end', ok: true },
    );
    expect(view.phase).toBe('listening');
  });

  it('ends when the connection drops', () => {
    expect(after(...CONNECTED, { type: 'status', status: 'disconnected', reason: 'user' }).phase).toBe('ended');
  });

  it('ignores stray events after the session has ended', () => {
    const view = after(...CONNECTED, { type: 'status', status: 'disconnected' }, { type: 'mode', mode: 'speaking' });
    expect(view.phase).toBe('ended');
  });

  it('starts clean again after an ended session', () => {
    const view = after(...CONNECTED, { type: 'transcript', role: 'agent', text: 'Hello' }, { type: 'status', status: 'disconnected' }, { type: 'start' });
    expect(view).toMatchObject({ phase: 'connecting', lines: [], error: null });
  });
});

describe('captions', () => {
  it('keeps what was said, in order, with who said it', () => {
    const view = after(...CONNECTED, { type: 'transcript', role: 'agent', text: 'Hello Malle' }, { type: 'transcript', role: 'user', text: 'My balance, please' });
    expect(view.lines.map((l) => [l.role, l.text])).toEqual([
      ['agent', 'Hello Malle'],
      ['user', 'My balance, please'],
    ]);
  });

  it('gives every line its own id', () => {
    const view = after(...CONNECTED, { type: 'transcript', role: 'agent', text: 'One' }, { type: 'transcript', role: 'agent', text: 'Two' });
    expect(new Set(view.lines.map((l) => l.id)).size).toBe(2);
  });

  it('skips empty lines', () => {
    expect(after(...CONNECTED, { type: 'transcript', role: 'agent', text: '   ' }).lines).toEqual([]);
  });

  it('replaces the agent’s last line when the agent corrects it', () => {
    const view = after(
      ...CONNECTED,
      { type: 'transcript', role: 'agent', text: 'You have 100 euros and' },
      { type: 'transcript', role: 'user', text: 'Stop' },
      { type: 'transcript_correction', role: 'agent', text: 'You have' },
    );
    expect(view.lines.map((l) => l.text)).toEqual(['You have', 'Stop']);
  });
});

describe('errors', () => {
  it('keeps the error for the screen', () => {
    const view = after(...CONNECTED, { type: 'error', code: 'agent_error', message: 'Something broke' });
    expect(view.error).toEqual({ code: 'agent_error', message: 'Something broke' });
  });

  it('ends a session that failed before it connected', () => {
    const view = after({ type: 'start' }, { type: 'error', code: 'microphone_blocked', message: 'Microphone access was refused.' });
    expect(view.phase).toBe('ended');
    expect(view.error?.code).toBe('microphone_blocked');
  });
});
