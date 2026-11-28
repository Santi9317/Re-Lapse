/**
 * Workshop landing for Keepsakes. The tab still opens the combined list
 * until the address asks for this screen.
 */
export function keepsakesHubOpen(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("keepsakes") === "hub";
}
