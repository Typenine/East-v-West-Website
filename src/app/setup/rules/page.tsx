'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Label from '@/components/ui/Label';

export default function SetupRulesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesContent, setRulesContent] = useState('');
  const [inputMode, setInputMode] = useState<'paste' | 'upload'>('paste');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      // If it's a text file, read its content
      if (file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setRulesContent(reader.result as string);
        };
        reader.readAsText(file);
      }
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      let rulesFileKey = null;

      // Upload PDF if provided
      if (uploadedFile && uploadedFile.type === 'application/pdf') {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('type', 'league-rules');

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          rulesFileKey = uploadData.key;
        }
      }

      const res = await fetch('/api/setup/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rulesContent: rulesContent || null,
          rulesFileKey,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save rules');
      }

      router.push('/setup/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.push('/setup/admin');
  };

  return (
    <div className="min-h-screen bg-[var(--background)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
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
            5
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-2">
            League Rules
          </h1>
          <p className="text-[var(--muted)]">
            Add your league constitution or rulebook (optional)
          </p>
        </div>

        <Card className="p-6">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Input Mode Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setInputMode('paste')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  inputMode === 'paste'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Paste Text
              </button>
              <button
                onClick={() => setInputMode('upload')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  inputMode === 'upload'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Upload File
              </button>
            </div>

            {inputMode === 'paste' ? (
              <div>
                <Label htmlFor="rulesContent">Rules Content</Label>
                <textarea
                  id="rulesContent"
                  value={rulesContent}
                  onChange={(e) => setRulesContent(e.target.value)}
                  placeholder="Paste your league rules here... (Markdown or plain text supported)"
                  rows={12}
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-sm resize-y"
                />
                <p className="text-xs text-[var(--muted)] mt-1">
                  Supports Markdown formatting
                </p>
              </div>
            ) : (
              <div>
                <Label>Upload Rules Document</Label>
                <div className="mt-2">
                  {uploadedFile ? (
                    <div className="flex items-center gap-3 p-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                      <svg className="w-8 h-8 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="flex-1">
                        <p className="font-medium text-[var(--text)]">{uploadedFile.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {(uploadedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setUploadedFile(null);
                          setRulesContent('');
                        }}
                        className="text-[var(--muted)] hover:text-red-400"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-8 rounded-lg border-2 border-dashed border-[var(--border)] cursor-pointer hover:border-[var(--accent)] transition-colors">
                      <svg className="w-10 h-10 text-[var(--muted)] mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-sm text-[var(--muted)]">
                        Click to upload PDF, TXT, or Markdown
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.txt,.md,text/plain,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Preview for text content */}
            {rulesContent && (
              <div className="border-t border-[var(--border)] pt-4">
                <p className="text-sm font-medium text-[var(--text)] mb-2">Preview (first 500 chars)</p>
                <div className="p-3 rounded-lg bg-[var(--surface)] text-sm text-[var(--muted)] max-h-32 overflow-y-auto">
                  {rulesContent.slice(0, 500)}
                  {rulesContent.length > 500 && '...'}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t border-[var(--border)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/setup/teams')}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSkip}
              className="flex-1"
            >
              Skip
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Saving...' : 'Continue'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
