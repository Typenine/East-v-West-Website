'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Label from '@/components/ui/Label';

export default function SetupAdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '', '', '']);
  const [displayName, setDisplayName] = useState('');
  
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handlePinChange = (index: number, value: string, isConfirm: boolean) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;
    
    const refs = isConfirm ? confirmPinRefs : pinRefs;
    const setter = isConfirm ? setConfirmPin : setPin;
    
    setter(prev => {
      const newPin = [...prev];
      newPin[index] = value;
      return newPin;
    });
    
    // Auto-focus next input
    if (value && index < 5) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent, isConfirm: boolean) => {
    const refs = isConfirm ? confirmPinRefs : pinRefs;
    const currentPin = isConfirm ? confirmPin : pin;
    
    if (e.key === 'Backspace' && !currentPin[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent, isConfirm: boolean) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newPin = pasted.split('');
      if (isConfirm) {
        setConfirmPin(newPin);
      } else {
        setPin(newPin);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    const pinValue = pin.join('');
    const confirmPinValue = confirmPin.join('');

    if (pinValue.length !== 6) {
      setError('Please enter a 6-digit PIN');
      return;
    }

    if (pinValue !== confirmPinValue) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/setup/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          pin: pinValue,
          displayName: displayName.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create admin account');
      }

      router.push('/setup/auth');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const renderPinInputs = (values: string[], isConfirm: boolean) => {
    const refs = isConfirm ? confirmPinRefs : pinRefs;
    return (
      <div className="flex gap-2 justify-center">
        {values.map((digit, index) => (
          <input
            key={index}
            ref={el => { refs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handlePinChange(index, e.target.value, isConfirm)}
            onKeyDown={(e) => handlePinKeyDown(index, e, isConfirm)}
            onPaste={(e) => handlePinPaste(e, isConfirm)}
            className="w-12 h-14 text-center text-2xl font-mono rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--background)] py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/setup')}
            className="text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-1 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to overview
          </button>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--accent)] text-white text-lg font-bold mb-4">
            6
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-2">
            Admin Account
          </h1>
          <p className="text-[var(--muted)]">
            Create your administrator login
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
              />
              <p className="text-xs text-[var(--muted)] mt-1">
                Used for login and notifications
              </p>
            </div>

            <div>
              <Label htmlFor="displayName">Display Name (Optional)</Label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Commissioner"
              />
            </div>

            <div>
              <Label>Admin PIN *</Label>
              <p className="text-xs text-[var(--muted)] mb-3">
                Enter a 6-digit PIN for admin access
              </p>
              {renderPinInputs(pin, false)}
            </div>

            <div>
              <Label>Confirm PIN *</Label>
              {renderPinInputs(confirmPin, true)}
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push('/setup/rules')}
                className="flex-1"
              >
                Back
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? 'Creating...' : 'Continue'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
