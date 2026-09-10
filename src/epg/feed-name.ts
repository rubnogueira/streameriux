export function feedNameFromUrl(url: string): string {
  try {
    const name = new URL(url).pathname.split("/").pop();
    return name ? decodeURIComponent(name) : url;
  } catch {
    const slash = url.lastIndexOf("/");
    return slash >= 0 ? url.slice(slash + 1) : url;
  }
}
