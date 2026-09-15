export const BOOK_SYNOPSIS_COLLAPSE_THRESHOLD = 320;

export function normalizeBookCategories(categories: string[]): string[] {
  const seen = new Set<string>();
  return categories.flatMap((category) => category.split(/[/,]/)).map((category) => category.replace(/\s+/g, " ").trim())
    .filter((category) => {
      const key = category.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function bookSynopsis(description: string | undefined): string {
  return description?.trim() || "A synopsis is not available for this edition yet.";
}

export function shouldCollapseBookSynopsis(description: string): boolean {
  return description.length > BOOK_SYNOPSIS_COLLAPSE_THRESHOLD;
}
