import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  Shared validation schemas for Supabase mutations                   */
/* ------------------------------------------------------------------ */

/** Reusable field validators */
const trimmedString = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is required`).max(max, `${label} is too long (max ${max} chars)`)

const optionalTrimmedString = (max: number, label: string) =>
  z.string().trim().max(max, `${label} is too long (max ${max} chars)`).optional().or(z.literal(''))

const emailField = z.string().trim().email('Invalid email address').max(254, 'Email too long')

const phoneField = z.string().trim().regex(
  /^[\d\s+\-().]{6,20}$/,
  'Invalid phone number',
).optional().or(z.literal(''))

const urlField = z.string().trim().url('Invalid URL').max(2048, 'URL too long').optional().or(z.literal(''))

const australianPostcode = z.string().trim().regex(/^\d{4}$/, 'Postcode must be 4 digits')

const instagramHandle = z.string().trim().max(30, 'Instagram handle too long')
  .regex(/^@?[\w.]*$/, 'Invalid Instagram handle').optional().or(z.literal(''))

/* ------------------------------------------------------------------ */
/*  Profile                                                            */
/* ------------------------------------------------------------------ */

export const profileUpdateSchema = z.object({
  display_name: trimmedString(1, 100, 'Display name').optional(),
  bio: optionalTrimmedString(500, 'Bio'),
  location: optionalTrimmedString(200, 'Location'),
  instagram_handle: instagramHandle,
  avatar_url: urlField,
  notification_preferences: z.record(z.string(), z.boolean()).optional(),
}).strict()

export const onboardingSchema = z.object({
  display_name: trimmedString(1, 100, 'Display name'),
  instagram_handle: instagramHandle,
  location: optionalTrimmedString(200, 'Location'),
  interests: z.array(z.string().max(50)).max(20, 'Too many interests').optional(),
  avatar_url: urlField,
})

/* ------------------------------------------------------------------ */
/*  Contact form                                                       */
/* ------------------------------------------------------------------ */

export const contactFormSchema = z.object({
  name: trimmedString(1, 200, 'Name'),
  email: emailField,
  subject: trimmedString(1, 200, 'Subject'),
  message: trimmedString(1, 5000, 'Message'),
})

/* ------------------------------------------------------------------ */
/*  Collective application                                             */
/* ------------------------------------------------------------------ */

export const collectiveApplicationSchema = z.object({
  firstName: trimmedString(1, 100, 'First name'),
  lastName: trimmedString(1, 100, 'Last name'),
  email: emailField,
  phone: phoneField,
  addressLine1: trimmedString(1, 200, 'Address'),
  suburb: trimmedString(1, 100, 'Suburb'),
  postcode: australianPostcode,
  whyVolunteer: trimmedString(1, 2000, 'Reason'),
  additionalInfo: optionalTrimmedString(2000, 'Additional info'),
})

/* ------------------------------------------------------------------ */
/*  Events                                                             */
/* ------------------------------------------------------------------ */

export const eventCreateSchema = z.object({
  title: trimmedString(1, 200, 'Title'),
  description: optionalTrimmedString(5000, 'Description'),
  address: optionalTrimmedString(500, 'Address'),
  capacity: z.number().int().min(0, 'Capacity must be positive').max(10000).optional().nullable(),
  date_start: z.string().min(1, 'Start date is required'),
  date_end: z.string().optional().nullable(),
})

export const eventUpdateSchema = eventCreateSchema.partial()

/* ------------------------------------------------------------------ */
/*  Chat                                                               */
/* ------------------------------------------------------------------ */

export const MAX_MESSAGE_LENGTH = 4000

export const chatMessageSchema = z.object({
  content: trimmedString(1, MAX_MESSAGE_LENGTH, 'Message'),
})

export const chatEditSchema = z.object({
  content: trimmedString(1, MAX_MESSAGE_LENGTH, 'Message'),
})

export const chatPollSchema = z.object({
  question: trimmedString(1, 500, 'Question'),
  options: z.array(z.string().trim().min(1).max(200)).min(2, 'At least 2 options').max(20, 'Max 20 options'),
  allow_multiple: z.boolean().optional(),
  anonymous: z.boolean().optional(),
})

/* ------------------------------------------------------------------ */
/*  Admin: Collectives                                                 */
/* ------------------------------------------------------------------ */

export const collectiveCreateSchema = z.object({
  name: trimmedString(1, 200, 'Name'),
  description: optionalTrimmedString(2000, 'Description'),
  region: optionalTrimmedString(100, 'Region'),
  state: optionalTrimmedString(50, 'State'),
})

/* ------------------------------------------------------------------ */
/*  Admin: Merch                                                       */
/* ------------------------------------------------------------------ */

export const productCreateSchema = z.object({
  name: trimmedString(1, 200, 'Product name'),
  description: optionalTrimmedString(5000, 'Description'),
  base_price_cents: z.number().int().min(0, 'Price cannot be negative').max(100_000_00, 'Price too high'),
  status: z.enum(['draft', 'active', 'archived']).optional(),
})

export const promoCodeSchema = z.object({
  code: trimmedString(1, 50, 'Code').regex(/^[A-Z0-9_-]+$/i, 'Code must be alphanumeric'),
  type: z.enum(['percentage', 'fixed']),
  value: z.number().min(0, 'Value must be positive'),
}).refine(
  (data) => data.type !== 'percentage' || data.value <= 100,
  { message: 'Percentage discount cannot exceed 100%', path: ['value'] },
)

/* ------------------------------------------------------------------ */
/*  Admin: Roles                                                       */
/* ------------------------------------------------------------------ */

export const VALID_ROLES = ['participant', 'assist_leader', 'co_leader', 'leader', 'manager', 'admin'] as const
export const roleChangeSchema = z.object({
  role: z.enum(VALID_ROLES),
})

/* ------------------------------------------------------------------ */
/*  Admin: Challenges                                                  */
/* ------------------------------------------------------------------ */

export const challengeSchema = z.object({
  title: trimmedString(1, 200, 'Title'),
  description: optionalTrimmedString(2000, 'Description'),
  goal_value: z.number().int().min(1, 'Goal must be at least 1').max(1_000_000, 'Goal too large'),
})

/* ------------------------------------------------------------------ */
/*  Leader todos                                                       */
/* ------------------------------------------------------------------ */

export const leaderTodoSchema = z.object({
  title: trimmedString(1, 500, 'Title'),
  description: optionalTrimmedString(2000, 'Description'),
  due_date: z.string().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
})

/* ------------------------------------------------------------------ */
/*  Emergency contacts                                                 */
/* ------------------------------------------------------------------ */

export const emergencyContactSchema = z.object({
  name: trimmedString(1, 200, 'Name'),
  phone: z.string().trim().min(6, 'Phone required').max(20, 'Phone too long'),
  email: emailField.optional().or(z.literal('')),
  relationship: optionalTrimmedString(100, 'Relationship'),
})

/* ------------------------------------------------------------------ */
/*  Updates / Announcements                                            */
/* ------------------------------------------------------------------ */

export const updateSchema = z.object({
  title: trimmedString(1, 300, 'Title'),
  content: trimmedString(1, 10000, 'Content'),
})

/* ------------------------------------------------------------------ */
/*  Helper: validate and return typed result or throw                   */
/* ------------------------------------------------------------------ */

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data)
}

/** Validate without throwing - returns { success, data, error } */
export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown) {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true as const, data: result.data, error: null }
  }
  const message = result.error.issues.map((i) => i.message).join(', ')
  return { success: false as const, data: null, error: message }
}
