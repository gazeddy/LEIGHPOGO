export function normaliseRaidDisplayBossName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/\b(?:mega|shadow)\b/gi, " ")
    .replace(/\bforms?e?\b/gi, " ")
    .replace(/[^a-z0-9♀♂]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sortedBossTokens(value: string): string[] {
  return normaliseRaidDisplayBossName(value)
    .split(" ")
    .filter(Boolean)
    .sort();
}

export function raidDisplayBossNamesMatch(left: string, right: string): boolean {
  const leftNormalised = normaliseRaidDisplayBossName(left);
  const rightNormalised = normaliseRaidDisplayBossName(right);

  if (!leftNormalised || !rightNormalised) return false;
  if (
    leftNormalised === rightNormalised ||
    leftNormalised.includes(rightNormalised) ||
    rightNormalised.includes(leftNormalised)
  ) {
    return true;
  }

  const leftTokens = sortedBossTokens(left);
  const rightTokens = sortedBossTokens(right);

  return (
    leftTokens.length === rightTokens.length &&
    leftTokens.every((token, index) => token === rightTokens[index])
  );
}
