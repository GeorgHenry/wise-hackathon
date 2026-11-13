import { useSyncExternalStore } from 'react';
import { type BankSnapshot, type BankStore, createBankStore } from './store';

/** The app's one demo account. Tests make their own with createBankStore(). */
export const bankStore: BankStore = createBankStore();

export function useBank(store: BankStore = bankStore): BankSnapshot {
  return useSyncExternalStore(store.onChange, store.getSnapshot);
}
