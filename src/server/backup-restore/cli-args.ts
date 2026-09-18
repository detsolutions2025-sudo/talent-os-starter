// Parser minimo de flags "--nome valor" -- suficiente para os dois scripts operacionais deste
// modulo, sem adicionar dependencia nova so para isso.
export function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return argv[index + 1];
}

export function requireFlag(argv: string[], name: string): string {
  const value = readFlag(argv, name);
  if (!value) {
    throw new Error(`Missing required flag --${name}.`);
  }
  return value;
}

export function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}
