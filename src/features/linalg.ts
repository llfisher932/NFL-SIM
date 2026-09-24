export type Matrix = number[][];

export function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

function at(m: Matrix, i: number, j: number): number {
  return m[i]![j]!;
}

export function choleskySolve(a: Matrix, b: readonly number[]): number[] {
  const n = b.length;
  const l = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = at(a, i, j);
      for (let k = 0; k < j; k++) sum -= at(l, i, k) * at(l, j, k);
      if (i === j) {
        if (sum <= 0) throw new Error("matrix not positive definite");
        l[i]![i] = Math.sqrt(sum);
      } else {
        l[i]![j] = sum / at(l, j, j);
      }
    }
  }

  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i]!;
    for (let k = 0; k < i; k++) sum -= at(l, i, k) * y[k]!;
    y[i] = sum / at(l, i, i);
  }

  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i]!;
    for (let k = i + 1; k < n; k++) sum -= at(l, k, i) * x[k]!;
    x[i] = sum / at(l, i, i);
  }
  return x;
}
