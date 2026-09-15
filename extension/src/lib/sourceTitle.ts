// Only clean legacy YouTube tab titles, identified by their browser-title suffix.
// An actual heading such as "(2026) Annual review" must keep its leading number.
export function cleanSourceTitle(title: string | null, sourceType: string): string | null {
  if (!title || sourceType !== "youtube" || !/\s[-–—]\sYouTube\s*$/i.test(title)) return title;
  return title.replace(/\s[-–—]\sYouTube\s*$/i, "").replace(/^\(\d[\d,.]*\)\s+/, "").trim() || null;
}
