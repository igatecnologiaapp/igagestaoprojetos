/**
 * Fase 2B — leitura do consumo colado da tela "Usage details" do Lovable.
 *
 * Aceita o texto como ele vem ao copiar a lista "Project / Usage", em qualquer um dos formatos:
 *   Gestao Etiquetas            (nome numa linha)
 *   15,2 credits                (consumo na linha seguinte)
 * ou na mesma linha, separado por tabulação/espaços:
 *   Gestao Etiquetas\t15,2 credits
 * Números em formato brasileiro ("1.234,5") ou inglês ("1,234.5"); unidade "credit(s)",
 * "crédito(s)" ou "h"/"horas". Linhas de cabeçalho e totais são ignoradas.
 */
export type ParsedUsage = { name: string; quantity: number };

const UNIT = "(?:credits?|cr[ée]ditos?|h|hrs?|horas?)";
const NUMBER = "(\\d{1,3}(?:[.,\\s]\\d{3})*(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)";
const SAME_LINE = new RegExp(`^(.*?\\S)\\s+${NUMBER}\\s*${UNIT}\\s*$`, "i");
const VALUE_ONLY = new RegExp(`^${NUMBER}\\s*${UNIT}\\s*$`, "i");
const IGNORE =
  /^(project|projeto|projects|projetos|usage|uso|total|all credits|build|run|in last .*|.*cobertos pela cota.*|last \d+ days|últimos \d+ dias)$/i;

/** Converte "15,2", "1.234,56", "1,234.56" ou "0,01" em número. */
export function parseLocaleNumber(raw: string): number {
  const s = raw.replace(/\s/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // só vírgula: decimal se tiver 1–2 (ou mais de 3) dígitos depois; milhar se exatamente 3 e houver mais grupos
    const decimals = s.length - lastComma - 1;
    normalized =
      decimals === 3 && s.indexOf(",") !== lastComma
        ? s.replace(/,/g, "")
        : s.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export function parseUsageText(text: string): ParsedUsage[] {
  let lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);
  // Se a página inteira foi copiada, a lista começa depois do cabeçalho "Usage"/"Uso";
  // isso descarta o total do período e os textos explicativos que vêm antes.
  const header = lines.reduce((last, l, i) => (/^(usage|uso)$/i.test(l) ? i : last), -1);
  if (header >= 0) lines = lines.slice(header + 1);
  const out = new Map<string, ParsedUsage>();
  let pendingName: string | null = null;

  const add = (name: string, qty: number) => {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean || IGNORE.test(clean) || !Number.isFinite(qty) || qty < 0) return;
    const key = clean.toLowerCase();
    const prev = out.get(key);
    out.set(key, { name: prev?.name ?? clean, quantity: (prev?.quantity ?? 0) + qty });
  };

  for (const line of lines) {
    const only = VALUE_ONLY.exec(line);
    if (only) {
      if (pendingName) add(pendingName, parseLocaleNumber(only[1]));
      pendingName = null;
      continue;
    }
    const same = SAME_LINE.exec(line);
    if (same) {
      add(same[1], parseLocaleNumber(same[2]));
      pendingName = null;
      continue;
    }
    pendingName = IGNORE.test(line) ? null : line;
  }
  return Array.from(out.values());
}

/** Normaliza para comparar nomes da ferramenta com nomes de projetos do sistema. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "the",
  "of",
  "app",
  "sistema",
]);
const tokens = (s: string) =>
  new Set(
    normalizeName(s)
      .split(" ")
      .filter((t) => t && !STOPWORDS.has(t)),
  );

/**
 * Sugere o projeto do sistema mais parecido, ou null quando não há um candidato único.
 * Compara palavras sem acento e sem "de/da/do" ("Gestao Etiquetas" ≈ "Gestão de Etiquetas").
 */
export function suggestProject<T extends { id: string; name: string }>(
  external: string,
  projects: T[],
): T | null {
  const e = normalizeName(external);
  if (!e) return null;
  const exact = projects.filter((p) => normalizeName(p.name) === e);
  if (exact.length === 1) return exact[0];
  const et = tokens(external);
  if (et.size === 0) return null;
  const sameWords = projects.filter((p) => {
    const pt = tokens(p.name);
    if (pt.size === 0) return false;
    const [small, big] = et.size <= pt.size ? [et, pt] : [pt, et];
    return small.size >= Math.min(2, big.size) && [...small].every((t) => big.has(t));
  });
  return sameWords.length === 1 ? sameWords[0] : null;
}
