export type ZohoCompany = { id: string; name: string; gstin?: string; address?: string }

export function companySearchQuery(value?: string) {
  const query = (value || '').trim()
  return query.length >= 3 ? query : ''
}

export function mergeSelectedCompany(data: Record<string, string>, company: ZohoCompany) {
  return {
    ...data,
    company_name: company.name,
    address: company.address || data.address,
    gstin: company.gstin || data.gstin,
  }
}
