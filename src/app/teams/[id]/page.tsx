import { Suspense } from 'react';
import TeamContent from './TeamContent';
import LoadingState from '@/components/ui/loading-state';
import styles from './TeamPage.module.css';

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8"><LoadingState message="Loading team..." /></div>}>
      <div className={styles.teamPage}>
        <TeamContent />
      </div>
    </Suspense>
  );
}
