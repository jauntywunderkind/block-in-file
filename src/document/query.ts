export type QueryResult<Value> =
  | Readonly<{ kind: "one"; value: Value }>
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "ambiguous"; values: readonly Value[] }>;

export function one<Value>(values: readonly Value[]): QueryResult<Value> {
  if (values.length === 0) {
    return { kind: "absent" };
  }
  if (values.length === 1) {
    return { kind: "one", value: values[0]! };
  }
  return { kind: "ambiguous", values };
}
