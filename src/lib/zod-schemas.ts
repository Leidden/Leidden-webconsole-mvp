import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(1).max(60).optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const sshKeyNameSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);

export const uploadKeySchema = z.object({
  name: sshKeyNameSchema,
  publicKey: z
    .string()
    .min(1)
    .max(8192)
    .refine((v) => /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-)/i.test(v.trim()))
});

export const generateKeySchema = z.object({ name: sshKeyNameSchema });

export const vmNameSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*$/, {
    message: "name must be lowercase letters, digits, or dash"
  });

export const deployVmSchema = z.object({
  name: vmNameSchema,
  templateId: z.string().min(1),
  serviceOfferingId: z.string().min(1),
  sshKeyName: sshKeyNameSchema.optional()
});

export const vmActionSchema = z.object({
  action: z.enum(["start", "stop", "reboot"])
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UploadKeyInput = z.infer<typeof uploadKeySchema>;
export type GenerateKeyInput = z.infer<typeof generateKeySchema>;
export type DeployVmInput = z.infer<typeof deployVmSchema>;
