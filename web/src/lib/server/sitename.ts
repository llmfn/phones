export function getSitename(request: Request): string {
  return new URL(request.url).host;
}
