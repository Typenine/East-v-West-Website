/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '@xyflow/react' {
  import * as React from 'react';
  export type Position = 'top' | 'right' | 'bottom' | 'left';
  export type XYAny = any;
  export interface Node<T = any> {
    id: string;
    position: { x: number; y: number };
    data?: T;
    style?: React.CSSProperties | any;
    type?: string;
    draggable?: boolean;
    selectable?: boolean;
    sourcePosition?: Position;
    targetPosition?: Position;
    parentNode?: string; // legacy
    parentId?: string;   // current
    extent?: 'parent' | 'default';
    width?: number;
    height?: number;
  }
  export interface Edge<T = any> {
    id: string;
    source: string;
    target: string;
    data?: T;
    style?: React.CSSProperties | any;
    type?: string;
    markerEnd?: any;
  }
  export type EdgeChange = any;
  export type NodeChange = any;
  export function applyEdgeChanges(changes: EdgeChange[], edges: Edge[]): Edge[];
  export function applyNodeChanges(changes: NodeChange[], nodes: Node[]): Node[];
  export interface ReactFlowInstance {
    fitView: (opts?: any) => void;
    getViewport?: () => { x: number; y: number; zoom: number };
    setViewport?: (v: { x: number; y: number; zoom: number }, opts?: any) => void;
    setCenter?: (x: number, y: number, opts?: any) => void;
  }
  export const ReactFlow: React.ComponentType<any>;
  export const Background: React.ComponentType<any>;
  export const Controls: React.ComponentType<any>;
  export const MiniMap: React.ComponentType<any>;
  export enum MarkerType { ArrowClosed }
}
