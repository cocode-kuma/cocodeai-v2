export type CocodeAIBuildIdentifierInput = {
  releaseVersion?: string | null;
  buildSha?: string | null;
};

function trimmedValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRelease(value: string | null | undefined): string | null {
  const release = trimmedValue(value);
  if (!release) return null;
  return release.startsWith("v") ? release : `v${release}`;
}

function normalizeSha(value: string | null | undefined): string | null {
  const sha = trimmedValue(value);
  return sha ? sha.slice(0, 7) : null;
}

export function resolveCocodeAIBuildIdentifier(input: CocodeAIBuildIdentifierInput): string | null {
  const release = normalizeRelease(input.releaseVersion);
  if (release) return release;

  return normalizeSha(input.buildSha);
}

export const COCODEAI_BUILD_IDENTIFIER = resolveCocodeAIBuildIdentifier({
  releaseVersion: String(import.meta.env.VITE_COCODEAI_RELEASE_VERSION ?? ""),
  buildSha: String(import.meta.env.VITE_COCODEAI_BUILD_SHA ?? ""),
});

export const COCODEAI_BUILD_IDENTIFIER_LABEL = COCODEAI_BUILD_IDENTIFIER
  ? `CocodeAI ${COCODEAI_BUILD_IDENTIFIER}`
  : null;
