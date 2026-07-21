from __future__ import annotations

from pathlib import Path

STAMP = Path('.newsletter-portability-applied')


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding='utf-8')
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


def main() -> None:
    if STAMP.exists():
        print('[newsletter-portability] already applied')
        return

    personality_page = Path('src/app/admin/newsletter/personality/page.tsx')
    replace_once(
        personality_page,
        "import Link from 'next/link';",
        "import Link from 'next/link';\nimport ClaudeExportPanel from './ClaudeExportPanel';",
    )
    replace_once(
        personality_page,
        '''      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/newsletter" className="text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Newsletter Admin
        </Link>
      </div>

      {/* Tab bar */}''',
        '''      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/newsletter" className="text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Newsletter Admin
        </Link>
      </div>

      <ClaudeExportPanel />

      {/* Tab bar */}''',
    )

    admin_page = Path('src/app/admin/newsletter/page.tsx')
    replace_once(
        admin_page,
        "import SavedNewsletters from './SavedNewsletters';",
        "import SavedNewsletters from './SavedNewsletters';\nimport PdfUploadPanel from './PdfUploadPanel';",
    )
    replace_once(
        admin_page,
        '''      {/* Saved newsletters — type / week / generated / status, at a glance */}
      <SavedNewsletters season={season} onSelect={handleOpenSaved} reloadKey={savedReload} />''',
        '''      <PdfUploadPanel defaultSeason={season} onUploaded={() => setSavedReload(k => k + 1)} />

      {/* Saved newsletters — type / week / generated / status, at a glance */}
      <SavedNewsletters season={season} onSelect={handleOpenSaved} reloadKey={savedReload} />''',
    )

    archive_hook = Path('src/components/newsletter/useNewsletterArchive.ts')
    replace_once(
        archive_hook,
        '''  const downloadPdf = useCallback(async (issue: NewsletterMeta) => {
    const frame = frameRefs.current[issue.id];
    if (!frame) return;
    setPdfIssueId(issue.id);
    setIssueErrors(current => {
      const next = { ...current };
      delete next[issue.id];
      return next;
    });
    try {
      const title = displayIssueTitle(issue);
      await frame.downloadPdf(`${fileSafeTitle(title)}.pdf`, title);
    } catch (error) {
      setIssueErrors(current => ({
        ...current,
        [issue.id]: error instanceof Error ? error.message : 'PDF download failed',
      }));
    } finally {
      setPdfIssueId(null);
    }
  }, []);''',
        '''  const downloadPdf = useCallback(async (issue: NewsletterMeta) => {
    const data = issueData[issue.id];
    const hasUploadedPdf = data?.newsletter.sections.some(section => section.type === 'UploadedPdf') ?? false;
    if (hasUploadedPdf) {
      window.location.assign(`/api/newsletter/pdf?id=${encodeURIComponent(issue.id)}&download=1`);
      return;
    }

    const frame = frameRefs.current[issue.id];
    if (!frame) return;
    setPdfIssueId(issue.id);
    setIssueErrors(current => {
      const next = { ...current };
      delete next[issue.id];
      return next;
    });
    try {
      const title = displayIssueTitle(issue);
      await frame.downloadPdf(`${fileSafeTitle(title)}.pdf`, title);
    } catch (error) {
      setIssueErrors(current => ({
        ...current,
        [issue.id]: error instanceof Error ? error.message : 'PDF download failed',
      }));
    } finally {
      setPdfIssueId(null);
    }
  }, [issueData]);''',
    )

    archive_utils = Path('src/components/newsletter/utils.ts')
    replace_once(
        archive_utils,
        "const WEEKLESS_TYPES = new Set(['pre_draft', 'post_draft', 'preseason', 'offseason']);",
        "const WEEKLESS_TYPES = new Set(['pre_draft', 'post_draft', 'preseason', 'offseason', 'special']);",
    )
    replace_once(
        archive_utils,
        "  offseason: 'Offseason Update',\n};",
        "  offseason: 'Offseason Update',\n  special: 'Special Edition',\n};",
    )

    saved = Path('src/app/admin/newsletter/SavedNewsletters.tsx')
    replace_once(
        saved,
        "  offseason: 'Offseason',\n};",
        "  offseason: 'Offseason',\n  special: 'Special Edition',\n};",
    )
    replace_once(
        saved,
        "  if (STORAGE_WEEK_TO_TYPE[item.week] || ['pre_draft', 'post_draft', 'preseason', 'offseason'].includes(type)) return null;",
        "  if (STORAGE_WEEK_TO_TYPE[item.week] || ['pre_draft', 'post_draft', 'preseason', 'offseason', 'special'].includes(type)) return null;",
    )

    queries = Path('src/server/db/newsletter-queries.ts')
    replace_once(
        queries,
        "  offseason: 'Offseason',\n};",
        "  offseason: 'Offseason',\n  special: 'Special Edition',\n};",
    )
    replace_once(
        queries,
        "  const isWeekless = Boolean(STORAGE_WEEK_TO_TYPE[week]) || ['pre_draft', 'post_draft', 'preseason', 'offseason'].includes(type);",
        "  const isWeekless = Boolean(STORAGE_WEEK_TO_TYPE[week]) || ['pre_draft', 'post_draft', 'preseason', 'offseason', 'special'].includes(type);",
    )

    publish_route = Path('src/app/api/newsletter/publish/route.ts')
    replace_once(
        publish_route,
        '''    await updateBotMemoryFromPublish(target.season, target.week).catch(error => {
      console.warn('[Publish] Bot memory update failed (non-fatal):', error);
    });''',
        '''    const isUploadedPdf = target.newsletter.sections.some(section => section.type === 'UploadedPdf');
    if (!isUploadedPdf) {
      await updateBotMemoryFromPublish(target.season, target.week).catch(error => {
        console.warn('[Publish] Bot memory update failed (non-fatal):', error);
      });
    }''',
    )

    export_route = Path('src/app/api/admin/newsletter/personality-export/route.ts')
    replace_once(
        export_route,
        "Object.entries(brain.baseTraits).map(([key, value]) => [key, value])",
        "Object.entries(brain.baseTraits).map(([key, value]): [string, number] => [key, value])",
    )

    STAMP.write_text('applied\n', encoding='utf-8')
    print('[newsletter-portability] personality exports and PDF publishing applied')


if __name__ == '__main__':
    main()
