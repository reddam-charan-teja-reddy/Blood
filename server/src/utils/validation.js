import { z } from 'zod';

export const RegisterSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Invalid Indian phone number. Must start with +91 followed by 10 digits.'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  role: z.enum(['INDIVIDUAL', 'ORG']),
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  city: z.string().min(2, 'City must be at least 2 characters'),
  state: z.string().min(2, 'State must be at least 2 characters'),
  weightKg: z.number().min(20).max(200).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.role === 'ORG' && (!data.password || data.password.trim() === '')) {
    ctx.addIssue({
      code: 'custom',
      path: ['password'],
      message: 'Password is required for organization accounts',
    });
  }
});

export const LoginSchema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Invalid Indian phone number').optional(),
  email: z.string().email('Invalid email address').optional(),
  password: z.string().optional(),
}).refine((data) => data.phone || data.email, {
  message: 'Either phone or email must be provided to log in',
  path: ['phone'],
});

export const CreateRequestSchema = z.object({
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  component: z.enum(['WHOLE_BLOOD', 'PLATELETS', 'PLASMA', 'RBC']),
  unitsNeeded: z.number().int().min(1).max(10),
  urgency: z.enum(['EMERGENCY', 'HIGH', 'NORMAL']),
  requiredBy: z.string().datetime(),
  hospitalName: z.string().min(3).max(200),
  hospitalCity: z.string().min(2).max(100),
  hospitalState: z.string().min(2).max(100),
  wardNumber: z.string().optional().or(z.literal('')),
  attendingDoctor: z.string().optional().or(z.literal('')),
  guardianName: z.string().optional().or(z.literal('')),
  guardianPhone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Invalid Indian phone number').optional().or(z.literal('')),
  guardianPhoneOverride: z.string().regex(/^\+91[6-9]\d{9}$/, 'Invalid Indian phone number').optional().or(z.literal('')),
}).refine(
  (data) => {
    const reqBy = new Date(data.requiredBy);
    const now = new Date();
    const diffH = (reqBy.getTime() - now.getTime()) / 3600000;
    if (data.urgency === 'EMERGENCY' || data.urgency === 'HIGH') {
      return diffH >= 0.5 && diffH <= 72; // 30 min to 72 hours
    }
    return diffH >= 0.5 && diffH <= 168; // 30 min to 7 days
  },
  {
    message: 'Required-by time must be between 30 minutes and 72 hours from now (EMERGENCY/HIGH), or up to 7 days for NORMAL requests',
    path: ['requiredBy'],
  }
);
