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
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, {
    message: "name must start with letter/digit and use only letters, digits, underscore, dash"
  });

export const uploadKeySchema = z.object({
  name: sshKeyNameSchema,
  publicKey: z
    .string()
    .min(1)
    .max(8192)
    .refine((v) => /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-)/i.test(v.trim()), {
      message: "publicKey must start with ssh-ed25519/ssh-rsa/ssh-dss/ecdsa-sha2-"
    })
});

export const generateKeySchema = z.object({
  name: sshKeyNameSchema
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UploadKeyInput = z.infer<typeof uploadKeySchema>;
export type GenerateKeyInput = z.infer<typeof generateKeySchema>;
