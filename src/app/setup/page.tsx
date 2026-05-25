'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type SetupStep = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
};

const SETUP_STEPS: SetupStep[] = [
  { id: 'league', title: 'League Identity', description: 'Name your league and set basic info', completed: false },
  { id: 'sleeper', title: 'Sleeper Integration', description: 'Connect your Sleeper league', completed: false },
  { id: 'branding', title: 'Branding', description: 'Set colors and upload logo', completed: false },
  { id: 'teams', title: 'Team Colors', description: 'Customize team colors (optional)', completed: false },
  { id: 'rules', title: 'Rules', description: 'Add league rules (optional)', completed: false },
  { id: 'admin', title: 'Admin Account', description: 'Create your admin login', completed: false },
  { id: 'auth', title: 'Team Signup', description: 'Configure how teams join', completed: false },
];

export default function SetupPage() {
  const router = useRouter();
  const [steps, setSteps] = useState<SetupStep[]>(SETUP_STEPS);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if setup is already completed
    async function checkSetup() {
      try {
        const res = await fetch('/api/setup/status');
        if (res.ok) {
          const data = await res.json();
          if (data.setupCompleted) {
            router.push('/');
            return;
          }
          // Update steps based on saved progress
          if (data.completedSteps) {
            setSteps(prev => prev.map(step => ({
              ...step,
              completed: data.completedSteps.includes(step.id)
            })));
            // Find first incomplete step
            const firstIncomplete = SETUP_STEPS.findIndex(
              s => !data.completedSteps.includes(s.id)
            );
            setCurrentStep(firstIncomplete >= 0 ? firstIncomplete : 0);
          }
        }
      } catch {
        // API not ready yet, show setup
      }
      setLoading(false);
    }
    checkSetup();
  }, [router]);

  const handleStepClick = (index: number) => {
    // Can only go to completed steps or next incomplete step
    const canNavigate = index <= currentStep || steps[index - 1]?.completed;
    if (canNavigate) {
      router.push(`/setup/${steps[index].id}`);
    }
  };

  const handleStart = () => {
    router.push(`/setup/${steps[currentStep].id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--text)] mb-2">
            Welcome to Your Fantasy League
          </h1>
          <p className="text-[var(--muted)]">
            Let&apos;s set up your league website in a few easy steps.
          </p>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            {steps.map((step, index) => {
              const isActive = index === currentStep;
              const isCompleted = step.completed;
              const isLocked = index > currentStep && !steps[index - 1]?.completed;

              return (
                <button
                  key={step.id}
                  onClick={() => handleStepClick(index)}
                  disabled={isLocked}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    isActive
                      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                      : isCompleted
                      ? 'border-green-500/30 bg-green-500/5'
                      : isLocked
                      ? 'border-[var(--border)] opacity-50 cursor-not-allowed'
                      : 'border-[var(--border)] hover:border-[var(--accent)]/50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        isCompleted
                          ? 'bg-green-500 text-white'
                          : isActive
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--surface)] text-[var(--muted)]'
                      }`}
                    >
                      {isCompleted ? '✓' : index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-[var(--text)]">{step.title}</div>
                      <div className="text-sm text-[var(--muted)]">{step.description}</div>
                    </div>
                    {isActive && (
                      <svg
                        className="w-5 h-5 text-[var(--accent)]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 pt-6 border-t border-[var(--border)]">
            <Button onClick={handleStart} className="w-full">
              {currentStep === 0 ? 'Get Started' : 'Continue Setup'}
            </Button>
          </div>
        </Card>

        <p className="text-center text-sm text-[var(--muted)] mt-6">
          You can always change these settings later in the admin panel.
        </p>
      </div>
    </div>
  );
}
