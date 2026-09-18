/**
 * Isolation Forest — the anomaly detector of the ensemble.
 * Trains on benign sessions only (one-class setup); a session whose behavior
 * vector sits far from the benign manifold gets isolated by short tree paths.
 */
import { mulberry32, randInt } from "./prng";

export interface IsoForestOptions {
  nTrees?: number;
  sampleSize?: number;
  seed?: number;
}

interface TreeNode {
  kind: "leaf" | "split";
  feature?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  size?: number;
  depth?: number;
}

/** Harmonic number H(n) approximated for the expected path length. */
function c(n: number): number {
  if (n <= 1) return 0;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

/** Shorter-than-average path ⇒ more anomalous. Maps to a 0–1 score. */
function pathScore(pathLength: number, n: number): number {
  return Math.pow(2, -pathLength / c(n));
}

export class IsolationForest {
  private trees: TreeNode[] = [];
  private n = 0;
  private readonly nTrees: number;
  private readonly sampleSize: number;
  private readonly seed: number;

  constructor(opts: IsoForestOptions = {}) {
    this.nTrees = opts.nTrees ?? 60;
    this.sampleSize = opts.sampleSize ?? 256;
    this.seed = opts.seed ?? 11;
  }

  fit(X: number[][]): this {
    if (X.length === 0) return this;
    const dim = X[0]!.length;
    this.n = X.length;
    const rnd = mulberry32(this.seed);
    const sample = Math.min(this.sampleSize, this.n);

    for (let t = 0; t < this.nTrees; t++) {
      // Bootstrap-ish subsample of the benign manifold
      const idx: number[] = [];
      for (let i = 0; i < sample; i++) {
        idx.push(Math.floor(rnd() * this.n));
      }
      const subsample = idx.map((i) => X[i]!);
      this.trees.push(this.buildTree(subsample, 0, Math.ceil(Math.log2(sample)), dim, rnd));
    }
    return this;
  }

  private buildTree(
    points: number[][],
    depth: number,
    maxDepth: number,
    dim: number,
    rnd: () => number,
  ): TreeNode {
    if (points.length <= 1 || depth >= maxDepth) {
      return { kind: "leaf", size: points.length, depth };
    }
    // Pick a feature with variance; random split between min & max.
    const candidates: number[] = [];
    for (let f = 0; f < dim; f++) {
      let min = Infinity;
      let max = -Infinity;
      for (const p of points) {
        min = Math.min(min, p[f]!);
        max = Math.max(max, p[f]!);
      }
      if (min < max) candidates.push(f);
    }
    if (candidates.length === 0) {
      return { kind: "leaf", size: points.length, depth };
    }
    const feature = candidates[randInt(rnd, 0, candidates.length - 1)]!;
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      min = Math.min(min, p[feature]!);
      max = Math.max(max, p[feature]!);
    }
    const threshold = min + rnd() * (max - min);
    const leftPts: number[][] = [];
    const rightPts: number[][] = [];
    for (const p of points) {
      (p[feature]! < threshold ? leftPts : rightPts).push(p);
    }
    return {
      kind: "split",
      feature,
      threshold,
      left: this.buildTree(leftPts, depth + 1, maxDepth, dim, rnd),
      right: this.buildTree(rightPts, depth + 1, maxDepth, dim, rnd),
    };
  }

  /** Depth-limited path length for one point down one tree. */
  private pathLen(node: TreeNode, x: number[], depth: number): number {
    if (node.kind === "leaf") return depth + c(node.size ?? 1);
    if (x[node.feature!]! < node.threshold!) {
      return this.pathLen(node.left!, x, depth + 1);
    }
    return this.pathLen(node.right!, x, depth + 1);
  }

  /** Mean anomaly score across the forest, 0 (normal) … 1 (anomalous). */
  score(x: number[]): number {
    if (this.trees.length === 0 || this.n === 0) return 0;
    let total = 0;
    for (const tree of this.trees) {
      total += pathScore(this.pathLen(tree, x, 0), this.n);
    }
    return total / this.trees.length;
  }
}
