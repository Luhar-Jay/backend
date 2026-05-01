import { z, registry } from '../swagger/registry.js';

const addressSchema = z.object({
  address: z.string().optional(),
  city: z.string().optional(),
});

const skillSchema = z.object({
  skill: z.string(),
  yearsOfExperience: z.number().nonnegative().optional(),
});

const educationSchema = z.object({
  degree: z.string().optional(),
  institution: z.string().optional(),
  year: z.number().optional(),
  specialization: z.string().optional(),
});

const experienceSchema = z.object({
  company: z.string().optional(),
  position: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const leavesSchema = z.object({
  totalBalance: z.number().optional(),
  paidLeave: z.number().optional(),
  leaveTaken: z.number().optional(),
});

function splitCommaList(value) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const skillsFlexibleSchema = z
  .union([z.array(skillSchema), z.string()])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (Array.isArray(val)) return val;
    // comma-separated: "React, Node"
    return splitCommaList(val).map((skill) => ({ skill }));
  });

const educationFlexibleSchema = z
  .union([z.array(educationSchema), z.string()])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (Array.isArray(val)) return val;
    // comma-separated: "BSc, MSc"
    return splitCommaList(val).map((degree) => ({ degree }));
  });

const experienceFlexibleSchema = z
  .union([z.array(experienceSchema), z.string()])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (Array.isArray(val)) return val;
    // comma-separated: "Company A, Company B"
    return splitCommaList(val).map((company) => ({ company }));
  });

const leavesFlexibleSchema = z
  .union([z.array(leavesSchema), z.string()])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (Array.isArray(val)) return val;
    // comma-separated numbers: "24, 12"
    return splitCommaList(val)
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n))
      .map((totalBalance) => ({ totalBalance }));
  });

export const RegisterBodySchema = z
  .object({
    name: z.string().min(1, 'Name is required').openapi({ example: 'John Doe' }),
    email: z.string().email('Invalid email').openapi({ example: 'john@example.com' }),
    password: z.string().min(6, 'Password must be at least 6 characters').openapi({ example: 'secret123' }),
    role: z.enum(['super-admin', 'admin', 'employee', 'hr', 'manager']).optional().openapi({ example: 'employee' }),
    profileImage: z.string().url().optional(),
    address: z.array(addressSchema).optional(),
    phone: z.string().optional().openapi({ example: '+91 9876543210' }),
    skills: skillsFlexibleSchema,
    education: educationFlexibleSchema,
    experience: experienceFlexibleSchema,
    leaves: leavesFlexibleSchema,
    dob: z.string().optional().openapi({ example: '1995-06-15' }),
    aadharCardNumber: z.string().optional(),
    panCardNumber: z.string().optional(),
    bankAccountNo: z.string().optional(),
    bankName: z.string().optional(),
    bankIFSC: z.string().optional(),
    bankBranch: z.string().optional(),
    gender: z.enum(['male', 'female']).optional(),
  })
  .openapi('RegisterBody');

export const AdminCreateUserBodySchema = z
  .object({
    name: z.string().min(1, 'Name is required').openapi({ example: 'Jane Doe' }),
    email: z.string().email('Invalid email').openapi({ example: 'jane@example.com' }),
    password: z.string().min(6, 'Password must be at least 6 characters').openapi({ example: 'secret123' }),
    role: z
      .enum(['admin', 'employee', 'hr', 'manager'])
      .openapi({ example: 'employee', description: 'Role assigned to the new user' }),
    profileImage: z.string().url().optional(),
    address: z.array(addressSchema).optional(),
    phone: z.string().optional(),
    skills: skillsFlexibleSchema,
    education: educationFlexibleSchema,
    experience: experienceFlexibleSchema,
    leaves: leavesFlexibleSchema,
    gender: z.enum(['male', 'female']).optional(),
    dob: z.string().optional(),
    aadharCardNumber: z.string().optional(),
    panCardNumber: z.string().optional(),
    bankAccountNo: z.string().optional(),
    bankName: z.string().optional(),
    bankIFSC: z.string().optional(),
    bankBranch: z.string().optional(),
  })
  .openapi('AdminCreateUserBody');

export const LoginBodySchema = z
  .object({
    email: z.string().email('Invalid email').openapi({ example: 'john@example.com' }),
    password: z.string().min(1, 'Password is required').openapi({ example: 'secret123' }),
  })
  .openapi('LoginBody');

export const UpdateUserBodySchema = z
  .object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    role: z.enum(['super-admin', 'admin', 'employee', 'hr', 'manager']).optional(),
    profileImage: z.string().optional(),
    address: z.array(addressSchema).optional(),
    phone: z.string().optional(),
    skills: skillsFlexibleSchema,
    education: educationFlexibleSchema,
    experience: experienceFlexibleSchema,
    leaves: leavesFlexibleSchema,
    dob: z.string().optional(),
    aadharCardNumber: z.string().optional(),
    panCardNumber: z.string().optional(),
    bankAccountNo: z.string().optional(),
    bankName: z.string().optional(),
    bankIFSC: z.string().optional(),
    bankBranch: z.string().optional(),
    gender: z.enum(['male', 'female']).optional(),
    isActive: z.boolean().optional().openapi({
      description: 'Only super-admin or admin may set this (deactivated users cannot log in or use the API).',
    }),
  })
  .openapi('UpdateUserBody');

export const UserIdParamSchema = z
  .object({ id: z.string().min(1, 'ID is required').openapi({ example: '64b1f2c3d4e5f6a7b8c9d0e1' }) })
  .openapi('UserIdParam');

const bearerAuth = [{ bearerAuth: [] }];

registry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: ['Auth'],
  summary: 'Register a new user',
  request: { body: { content: { 'application/json': { schema: RegisterBodySchema } } } },
  responses: {
    201: { description: 'User registered successfully' },
    400: { description: 'Missing fields or duplicate email' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['Auth'],
  summary: 'Login (sets HttpOnly session cookies)',
  request: { body: { content: { 'application/json': { schema: LoginBodySchema } } } },
  responses: {
    200: { description: 'Login successful — sets HttpOnly access and refresh cookies' },
    400: { description: 'Invalid credentials' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: ['Auth'],
  summary: 'Current user (from access cookie)',
  security: bearerAuth,
  responses: {
    200: { description: 'Current user document' },
    401: { description: 'Not authenticated' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/create-user',
  tags: ['Auth'],
  summary: 'Create a user with role (admin or super-admin only)',
  security: bearerAuth,
  request: { body: { content: { 'application/json': { schema: AdminCreateUserBodySchema } } } },
  responses: {
    201: { description: 'User created' },
    403: { description: 'Forbidden' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/',
  tags: ['Auth'],
  summary: 'Get all users (admin, hr only)',
  security: bearerAuth,
  responses: {
    200: { description: 'List of all users' },
    403: { description: 'Forbidden — admin or hr role required' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/auth/{id}',
  tags: ['Auth'],
  summary: 'Get user by ID',
  security: bearerAuth,
  request: { params: UserIdParamSchema },
  responses: {
    200: { description: 'User found' },
    400: { description: 'User not found' },
  },
});

registry.registerPath({
  method: 'put',
  path: '/auth/{id}',
  tags: ['Auth'],
  summary: 'Update user by ID',
  security: bearerAuth,
  request: {
    params: UserIdParamSchema,
    body: { content: { 'application/json': { schema: UpdateUserBodySchema } } },
  },
  responses: { 200: { description: 'User updated' } },
});

registry.registerPath({
  method: 'delete',
  path: '/auth/{id}',
  tags: ['Auth'],
  summary: 'Delete user by ID (admin only)',
  security: bearerAuth,
  request: { params: UserIdParamSchema },
  responses: {
    200: { description: 'User deleted' },
    400: { description: 'User not found' },
    403: { description: 'Forbidden — admin role required' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Auth'],
  summary: 'Logout current user',
  security: bearerAuth,
  responses: { 200: { description: 'Logged out successfully' } },
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh-token',
  tags: ['Auth'],
  summary: 'Refresh access token (uses HttpOnly refresh cookie)',
  responses: { 200: { description: 'New access token set in cookie' } },
});