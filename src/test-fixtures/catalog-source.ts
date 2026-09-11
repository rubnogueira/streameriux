import type { CatalogSource } from "../catalog/channel";

export function catalogSource(
  overrides: Partial<CatalogSource> & Pick<CatalogSource, "epgUrl">,
): CatalogSource {
  const id = overrides.id ?? "test";
  return {
    id,
    kind: "playlist",
    path: `${id}.m3u`,
    label: id,
    remote: true,
    ...overrides,
  };
}
