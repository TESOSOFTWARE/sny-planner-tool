import { z } from 'zod'

// [MoM §3.2] Omitted fields preserve existing metadata.
export const materialTaxonomyShape = {
  subGroup: z.enum(['NGUYEN_SINH', 'TAI_CHE']).nullable().optional(),
  lightFastness: z.string().trim().max(100, 'Độ bền màu tối đa 100 ký tự').transform(v => v || null).nullable().optional(),
}

export function taxonomyMatchesGroup(group: string, fields: { subGroup?: string | null; lightFastness?: string | null }) {
  return (!fields.subGroup || group === 'HDPE') && (!fields.lightFastness || group === 'MB')
}