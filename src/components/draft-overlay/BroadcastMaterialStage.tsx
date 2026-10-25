'use client';

import type { CSSProperties } from 'react';
import styles from './BroadcastMaterialStage.module.css';

type BroadcastMaterialStageProps = {
  primary: string;
  secondary?: string;
  variant?: 'team' | 'event' | 'trade' | 'selection';
};

const safeColor = (color: string | undefined, fallback: string) =>
  color && /^#[\da-f]{6}$/i.test(color) ? color : fallback;

/**
 * Browser-native reconstruction of selected Hype Chamber material techniques:
 * directional scratches, roughness variation, emissive stage rings, and moving
 * specular lighting. No Fab/Unreal source textures or meshes are shipped here.
 *
 * Keep this purely decorative so pick data, clock logic and GSAP timelines
 * remain the source of truth for the broadcast.
 */
export default function BroadcastMaterialStage({
  primary,
  secondary,
  variant = 'team',
}: BroadcastMaterialStageProps) {
  const palette = {
    '--bcast-primary': safeColor(primary, '#006747'),
    '--bcast-secondary': safeColor(secondary, '#1e3052'),
  } as CSSProperties;

  return (
    <div
      className={styles.root}
      data-variant={variant}
      style={palette}
      aria-hidden="true"
    >
      <div className={styles.ambient} />
      <div className={styles.hexPattern} />
      <div className={styles.floorReflection} />
      <div className={styles.outerRing} />
      <div className={styles.innerRing} />
      <div className={styles.specularSweep} />
      <div className={styles.surfaceWear} />
    </div>
  );
}
