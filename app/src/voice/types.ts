import type { Bank, Transaction } from '../bank/types';

// The events and session shape of voice-agent/web/voice.js (see voice-agent/README.md).
// The scripted agent in this folder emits the same events, so the UI has one code path.

export type VoiceEvent =
  | { type: 'status'; status: 'connecting' | 'connected' | 'disconnecting' | 'disconnected'; conversationId?: string; reason?: string }
  | { type: 'mode'; mode: 'speaking' | 'listening' }
  | { type: 'transcript'; role: string; text: string; final?: boolean; typed?: boolean }
  | { type: 'transcript_correction'; role: string; text: string }
  | { type: 'tool'; name: string; phase: 'start' | 'end'; ok?: boolean; error?: string }
  | { type: 'error'; code?: string; message: string }
  | { type: 'incoming_payment'; transaction: Transaction }
  // Transfer progress. The UI draws transfers from the bank store, so it only notes these.
  | { type: 'pending_transfer' | 'awaiting_approval' | 'transfer_result' | 'transfer_cancelled' | 'confirm_blocked' };

export interface VoiceSession {
  /** Typed fallback: counts as the user's own words, exactly like speech. */
  sendText(text: string): void;
  /** Context for the agent, such as "The user tapped Cancel". Not a user turn. */
  notify(text: string): void;
  setMuted(muted: boolean): void;
  stop(): Promise<void>;
}

export interface StartVoiceOptions {
  bank: Bank;
  onEvent: (event: VoiceEvent) => void;
  tokenUrl?: string;
  language?: string;
  userName?: string;
}

export type StartVoice = (options: StartVoiceOptions) => Promise<VoiceSession>;
