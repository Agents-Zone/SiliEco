const OFFICIAL_MARKETING_HOSTS = new Set(["silieco.ai", "www.silieco.ai"]);

export function isOfficialMarketingHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return OFFICIAL_MARKETING_HOSTS.has(normalized);
}
