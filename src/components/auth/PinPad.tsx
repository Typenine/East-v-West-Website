'use client';

import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import { PANEL } from '@/lib/ui/broadcast-styles';

const MAX_PIN_LENGTH = 12;

type PinPadProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  accent?: string;
};

export default function PinPad({ value, onChange, disabled, id, accent = PANEL.text }: PinPadProps) {
  const padRef = useRef<HTMLDivElement | null>(null);

  const append = useCallback(
    (digit: string) => {
      if (disabled || value.length >= MAX_PIN_LENGTH) return;
      onChange(value + digit);
    },
    [disabled, onChange, value],
  );

  const backspace = useCallback(() => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  }, [disabled, onChange, value]);

  const clear = useCallback(() => {
    if (disabled) return;
    onChange('');
  }, [disabled, onChange]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        append(event.key);
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        backspace();
        return;
      }

      if (event.key === 'Delete') {
        event.preventDefault();
        clear();
        return;
      }

      if (event.key === 'Enter' && value.length > 0) {
        event.preventDefault();
        event.currentTarget.closest('form')?.requestSubmit();
      }
    },
    [append, backspace, clear, disabled, value.length],
  );

  useEffect(() => {
    if (disabled) return;
    padRef.current?.focus();
  }, [disabled]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

  const keyBaseStyle = {
    boxShadow: `inset 0 0 0 1px ${PANEL.hairline}`,
  } as const;

  return (
    <div
      ref={padRef}
      id={id}
      tabIndex={disabled ? -1 : 0}
      role="group"
      aria-label="PIN keypad. Type numbers or use the buttons."
      onKeyDown={handleKeyDown}
      className="space-y-4 focus:outline-none"
    >
      <div
        className="flex items-center justify-center gap-2.5 min-h-[44px] rounded-xl py-3"
        style={{
          background: `linear-gradient(180deg, ${accent}12 0%, transparent 100%)`,
        }}
        aria-live="polite"
        aria-label={`PIN entry, ${value.length} digits entered`}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className="h-3.5 w-3.5 rounded-full transition-all duration-150"
            style={{
              background: i < value.length ? accent : 'rgba(255,255,255,0.12)',
              boxShadow:
                i < value.length
                  ? `0 0 0 1px ${accent}88, 0 0 10px ${accent}44`
                  : `inset 0 0 0 1px ${PANEL.hairline}`,
              transform: i < value.length ? 'scale(1.1)' : undefined,
            }}
            aria-hidden="true"
          />
        ))}
        {value.length > 6 ? (
          <span className="text-xs font-semibold tabular-nums" style={{ color: PANEL.muted }}>
            +{value.length - 6}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => {
          if (key === 'clear') {
            return (
              <button
                key={key}
                type="button"
                disabled={disabled || value.length === 0}
                onClick={clear}
                className="min-h-[52px] rounded-xl text-sm font-semibold uppercase tracking-wide transition-all active:scale-95 disabled:opacity-40"
                style={{
                  ...keyBaseStyle,
                  background: 'rgba(255,255,255,0.05)',
                  color: PANEL.muted,
                }}
              >
                Clear
              </button>
            );
          }
          if (key === 'back') {
            return (
              <button
                key={key}
                type="button"
                disabled={disabled || value.length === 0}
                onClick={backspace}
                aria-label="Delete last digit"
                className="min-h-[52px] rounded-xl text-lg font-semibold transition-all active:scale-95 disabled:opacity-40"
                style={{
                  ...keyBaseStyle,
                  background: `${accent}14`,
                  color: PANEL.text,
                }}
              >
                ⌫
              </button>
            );
          }
          return (
            <button
              key={key}
              type="button"
              disabled={disabled || value.length >= MAX_PIN_LENGTH}
              onClick={() => append(key)}
              className="min-h-[52px] rounded-xl text-xl font-bold tabular-nums transition-all active:scale-95 disabled:opacity-40 hover:brightness-110"
              style={{
                background: `linear-gradient(180deg, ${accent}18 0%, rgba(255,255,255,0.06) 100%)`,
                color: PANEL.text,
                boxShadow: `inset 0 0 0 1px ${accent}33`,
              }}
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
