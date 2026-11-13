import type { BankStore } from '../bank/store';
import { useBank } from '../bank/useBank';
import { type LiveHealth, liveAgentInstalled, liveReady } from '../voice/liveAgent';
import type { AgentMode } from '../voice/useVoice';
import './DemoControls.css';

// The presenter's switches. They sit outside the phone: none of this would be
// in a real app, where the phone itself knows about headphones and Face ID.

export interface DemoSettings {
  faceIdPasses: boolean;
  agentMode: AgentMode;
  speakReplies: boolean;
}

interface ChoiceProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}

function Choice<T extends string>({ legend, name, value, options, onChange }: ChoiceProps<T>) {
  return (
    <fieldset className="choice">
      <legend>{legend}</legend>
      <div className="choice__options">
        {options.map((option) => (
          <label key={option.value} className="choice__option">
            <input type="radio" name={name} checked={value === option.value} disabled={option.disabled} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function liveStatus(health: LiveHealth | null): string {
  if (!liveAgentInstalled) return 'The live agent is not installed: voice-agent/ is missing.';
  if (!health) return 'Checking the voice server…';
  if (!health.reachable) return 'The voice server is not running. In voice-agent/, run: npm run server';
  if (!health.keySet) return 'The ElevenLabs key is not set yet.';
  if (!health.agentSet) return 'The ElevenLabs agent has not been created yet.';
  return 'The live agent is ready. Every live session uses ElevenLabs credits and the microphone.';
}

interface DemoControlsProps {
  open: boolean;
  store: BankStore;
  settings: DemoSettings;
  live: LiveHealth | null;
  onSettings: (patch: Partial<DemoSettings>) => void;
  onCheckLive: () => void;
  onLock: () => void;
  onReplayOnboarding: () => void;
  onReset: () => void;
}

export function DemoControls({ open, store, settings, live, onSettings, onCheckLive, onLock, onReplayOnboarding, onReset }: DemoControlsProps) {
  const { audioPrivacy } = useBank(store);
  const liveUsable = live !== null && liveReady(live);

  return (
    <aside className={open ? 'demo demo--open' : 'demo'} aria-label="Demo controls">
      <div>
        <h2 className="demo__title">Demo controls</h2>
        <p className="demo__note">Hackathon prototype, not a Wise product. Every name and amount is invented.</p>
      </div>

      <Choice
        legend="Audio"
        name="audio"
        value={audioPrivacy}
        options={[
          { value: 'private', label: 'Private' },
          { value: 'speaker', label: 'Loudspeaker' },
        ]}
        onChange={(value) => store.setAudioPrivacy(value)}
      />

      <Choice
        legend="Face ID"
        name="faceid"
        value={settings.faceIdPasses ? 'pass' : 'fail'}
        options={[
          { value: 'pass', label: 'Succeeds' },
          { value: 'fail', label: 'Fails' },
        ]}
        onChange={(value) => onSettings({ faceIdPasses: value === 'pass' })}
      />

      <div>
        <Choice
          legend="Voice agent"
          name="agent"
          value={settings.agentMode}
          options={[
            { value: 'scripted', label: 'Scripted' },
            { value: 'live', label: 'Live', disabled: !liveUsable },
          ]}
          onChange={(value) => onSettings({ agentMode: value })}
        />
        <p className="demo__note" role="status">
          {liveStatus(live)}
        </p>
        {liveAgentInstalled && !liveUsable && (
          <button type="button" className="demo__link" onClick={onCheckLive}>
            Check again
          </button>
        )}
      </div>

      <label className="demo__check">
        <input type="checkbox" checked={settings.speakReplies} onChange={(event) => onSettings({ speakReplies: event.target.checked })} />
        <span>The scripted agent speaks aloud</span>
      </label>

      <div className="demo__buttons">
        <button type="button" className="btn btn--primary" onClick={() => store.simulateIncoming({ from: 'Kadri Tamm', amount: 40, currency: 'GBP' })}>
          Money arrives from Kadri
        </button>
        <button type="button" className="btn btn--neutral" onClick={onLock}>
          Lock the app
        </button>
        <button type="button" className="btn btn--neutral" onClick={onReplayOnboarding}>
          Replay onboarding
        </button>
        <button type="button" className="btn btn--neutral" onClick={onReset}>
          Reset the demo
        </button>
      </div>
    </aside>
  );
}
