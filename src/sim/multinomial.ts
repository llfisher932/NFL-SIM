import { choleskySolve, zeros } from "../features/linalg";

export interface MultinomialModel {
  classes: number;
  features: number;
  coefficients: number[][];
}

export interface FitOptions {
  l2: number;
  maxIterations?: number;
  tolerance?: number;
}

export function softmaxProbabilities(model: MultinomialModel, x: readonly number[]): number[] {
  const logits = model.coefficients.map((beta) => beta.reduce((sum, b, j) => sum + b * x[j]!, 0));
  const max = Math.max(...logits);
  const exps = logits.map((z) => Math.exp(z - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

function logLikelihood(model: MultinomialModel, xs: readonly number[][], ys: readonly number[], l2: number): number {
  let ll = 0;
  for (let i = 0; i < xs.length; i++) ll += Math.log(softmaxProbabilities(model, xs[i]!)[ys[i]!]!);
  const penalty = model.coefficients.flat().reduce((sum, b) => sum + b * b, 0);
  return ll - 0.5 * l2 * penalty;
}

// Ridge-penalized multinomial logistic regression fit by Newton's method with step halving.
// Every class gets coefficients; the L2 penalty keeps the softmax identifiable.
export function fitMultinomial(
  xs: readonly number[][],
  ys: readonly number[],
  classes: number,
  options: FitOptions,
): MultinomialModel {
  const features = xs[0]?.length ?? 0;
  if (features === 0 || xs.length !== ys.length) throw new Error("invalid training data");
  const size = classes * features;
  const idx = (k: number, j: number) => k * features + j;
  let model: MultinomialModel = { classes, features, coefficients: zeros(classes, features) };
  let current = logLikelihood(model, xs, ys, options.l2);

  for (let iter = 0; iter < (options.maxIterations ?? 50); iter++) {
    const gradient = new Array<number>(size).fill(0);
    const hessian = zeros(size, size);
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]!;
      const p = softmaxProbabilities(model, x);
      for (let k = 0; k < classes; k++) {
        const residual = (ys[i] === k ? 1 : 0) - p[k]!;
        for (let a = 0; a < features; a++) gradient[idx(k, a)]! += residual * x[a]!;
        for (let l = k; l < classes; l++) {
          const w = k === l ? p[k]! * (1 - p[k]!) : -p[k]! * p[l]!;
          if (w === 0) continue;
          for (let a = 0; a < features; a++) {
            const wa = w * x[a]!;
            for (let b = 0; b < features; b++) hessian[idx(k, a)]![idx(l, b)]! += wa * x[b]!;
          }
        }
      }
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < r; c++) hessian[r]![c] = hessian[c]![r]!;
    }
    const flat = model.coefficients.flat();
    for (let r = 0; r < size; r++) {
      gradient[r]! -= options.l2 * flat[r]!;
      hessian[r]![r]! += options.l2;
    }

    const step = choleskySolve(hessian, gradient);
    let scale = 1;
    let candidate = model;
    let candidateLl = current;
    for (let halving = 0; halving < 20; halving++) {
      candidate = {
        classes,
        features,
        coefficients: model.coefficients.map((row, k) => row.map((b, j) => b + scale * step[idx(k, j)]!)),
      };
      candidateLl = logLikelihood(candidate, xs, ys, options.l2);
      if (candidateLl >= current - 1e-12) break;
      scale /= 2;
    }
    const maxStep = Math.max(...step.map((s) => Math.abs(s * scale)));
    model = candidate;
    current = candidateLl;
    if (maxStep < (options.tolerance ?? 1e-7)) break;
  }
  return model;
}
