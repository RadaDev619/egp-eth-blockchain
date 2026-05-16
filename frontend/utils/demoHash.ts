export function demoHash(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const seed = (hash >>> 0).toString(16).padStart(8, "0");
  return `0x${seed.repeat(8)}`;
}

export function nowHash(label: string) {
  return demoHash(`${label}:${Date.now()}`);
}
